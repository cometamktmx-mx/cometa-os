import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
class PosApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
function compile(file, dependencies) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)((name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
function fixture() {
  const jar = new Map(), failures = new Map(); let sequence = 0, contextReads = 0;
  const rows = { pos_business_profiles: [{ profile_code: "restaurant", brand_slug: "a" }], pos_staff: [], pos_staff_sessions: [], pos_staff_audit_events: [], pos_locations: [], pos_branding: [] };
  const cookies = { get: name => jar.has(name) ? { value: jar.get(name) } : undefined, set: (name, value) => jar.set(name, value), delete: name => jar.delete(name), getAll: () => [...jar].map(([name, value]) => ({ name, value })) };
  const db = { from(table) {
    const filters = []; let operation = "read", values, selected = false;
    const query = {
      select() { selected = true; return query; }, order() { return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      is(key, value) { filters.push(row => (row[key] ?? null) === value); return query; },
      gt(key, value) { filters.push(row => row[key] > value); return query; },
      insert(value) { operation = "insert"; values = value; return query; },
      update(value) { operation = "update"; values = value; return query; },
      single() { return Promise.resolve(result(true)); }, maybeSingle() { return Promise.resolve(result(true)); },
      then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
    };
    function result(single) {
      if (failures.has(table + ":" + operation)) return { data: null, error: { message: "fixture failure" } };
      if (!rows[table]) throw new Error("Unexpected table " + table);
      let found = rows[table].filter(row => filters.every(filter => filter(row)));
      if (operation === "insert") { const row = { id: String(++sequence), active: true, ...values }; rows[table].push(row); found = [row]; }
      if (operation === "update") found.forEach(row => Object.assign(row, values));
      const copy = found.map(row => ({ ...row, ...(table === "pos_staff_sessions" ? { staff: rows.pos_staff.find(staff => staff.id === row.staff_id) } : {}) }));
      return { data: single ? copy[0] || null : selected ? copy : null, error: null };
    }
    return query;
  } };
  const context = { admin: db, brand: { id: "a", slug: "a" }, user: { userId: "host", isAdmin: false }, membership: { effectiveRole: "owner" } };
  const shared = compile("src/lib/pos/staff-shared.ts", {});
  const server = { PosApiError, requirePosContext: async slug => { contextReads++; if (slug !== context.brand.slug) throw new PosApiError(403, "POS_BRAND_FORBIDDEN", "Forbidden"); return context; },
    getBrandSlugFromUrl: request => new URL(request.url).searchParams.get("brandSlug"), readJsonBody: request => request.json(), requiredText: value => value, uuidValue: value => value,
    ok: (body, status = 200) => ({ body, status }), handlePosError: error => ({ status: error.status || 500, body: { error: error.message, code: error.code } }),
  };
  const access = { requirePosCommercialAccess: async value => value, requirePosOperationalAccess: async ({ brandSlug }) => server.requirePosContext(brandSlug) };
  const staff = compile("src/lib/pos/staff-server.ts", { "server-only": {}, "next/headers": { cookies: async () => cookies }, "@/lib/pos/server": server, "@/lib/pos/staff-shared": shared });
  const policy = compile("src/lib/pos/surface-policy.ts", {});
  const guard = compile("src/lib/pos/admin-access.ts", { "server-only": {}, "@/lib/pos/server": server, "@/lib/pos/access": access, "@/lib/pos/staff-server": staff, "@/lib/pos/surface-policy": policy });
  const endpoint = compile("src/app/api/pos/operator-session/route.ts", { "@/lib/pos/server": server, "@/lib/pos/access": access, "@/lib/pos/staff-server": staff, "@/lib/pos/staff-shared": shared });
  const post = body => endpoint.POST(new Request("http://local/api/pos/operator-session", { method: "POST", body: JSON.stringify({ brandSlug: "a", ...body }) }));
  return { rows, failures, context, jar, cookies, staff, guard, endpoint, post, get contextReads() { return contextReads; } };
}
async function addOperator(f, role = "ADMIN", id = "staff-a") {
  const row = { id, brand_slug: "a", active: true, name: id, role, location_id: null, pin_hash: await f.staff.hashStaffPin("1234"), failed_pin_attempts: 0, locked_until: null };
  f.rows.pos_staff.push(row); return row;
}
test("profile lookup errors and missing rows fail closed; valid Retail remains Retail", async () => {
  const f = fixture(); assert.equal(await f.staff.getPosMode(f.context), "RESTAURANT");
  f.failures.set("pos_business_profiles:read", true);
  await assert.rejects(() => f.staff.getPosMode(f.context), { code: "POS_PROFILE_READ_FAILED" });
  const result = await f.endpoint.GET(new Request("http://local/?brandSlug=a")); assert.equal(result.status, 503);
  f.failures.clear(); f.rows.pos_business_profiles = [];
  await assert.rejects(() => f.staff.getPosMode(f.context), { code: "POS_PROFILE_READ_FAILED" });
  f.rows.pos_business_profiles = [{ brand_slug: "a", profile_code: "retail" }];
  assert.equal(await f.staff.getPosMode(f.context), "RETAIL");
  await f.guard.requirePosPageAccess("a", "/brand/a/pos/products", f.cookies);
});
test("PIN login creates hashed session, operator identity and audit; switch revokes A and permits B", async () => {
  const f = fixture(); await addOperator(f); await addOperator(f, "WAITER", "staff-b");
  assert.equal((await f.post({ action: "login", staffId: "staff-a", pin: "1234" })).status, 200);
  const first = await f.staff.getStaffSession(f.context); assert.equal(first.staff.id, "staff-a");
  assert.notEqual(f.jar.get("cometa_pos_staff_session"), f.rows.pos_staff_sessions[0].token_hash);
  assert.ok(f.rows.pos_staff_audit_events.some(event => event.action === "STAFF_LOGIN"));
  assert.equal((await f.post({ action: "switch" })).status, 200);
  assert.ok(f.rows.pos_staff_sessions[0].revoked_at); assert.equal(await f.staff.getStaffSession(f.context), null);
  assert.equal((await f.post({ action: "login", staffId: "staff-b", pin: "1234" })).status, 200);
  assert.equal((await f.staff.getStaffSession(f.context)).staff.id, "staff-b");
  assert.equal(f.context.user.userId, "host");
});
test("five wrong PINs enforce five minute lockout; expired lockout accepts correct PIN", async () => {
  const f = fixture(); const op = await addOperator(f);
  for (let i = 0; i < 5; i++) assert.equal((await f.post({ action: "login", staffId: op.id, pin: "9999" })).status, 401);
  assert.ok(Date.parse(op.locked_until) - Date.now() > 295000);
  assert.equal((await f.post({ action: "login", staffId: op.id, pin: "1234" })).status, 429);
  op.locked_until = new Date(Date.now() - 1000).toISOString();
  assert.equal((await f.post({ action: "login", staffId: op.id, pin: "1234" })).status, 200);
  assert.equal(op.locked_until, null);
});
test("staff/session query failures are errors rather than first-run or Retail fallbacks", async () => {
  const f = fixture(); f.failures.set("pos_staff:read", true);
  assert.equal((await f.endpoint.GET(new Request("http://local/?brandSlug=a"))).status, 503);
  f.failures.clear(); await addOperator(f); await f.post({ action: "login", staffId: "staff-a", pin: "1234" });
  f.failures.set("pos_staff_sessions:read", true);
  await assert.rejects(() => f.staff.getStaffSession(f.context), { code: "POS_STAFF_SESSION_READ_FAILED" });
});
test("server page guard requires host/brand authorization and admin mode bound to active session", async () => {
  const f = fixture(); await addOperator(f); await f.post({ action: "login", staffId: "staff-a", pin: "1234" });
  await assert.rejects(() => f.guard.requirePosPageAccess("a", "/brand/a/pos/products", f.cookies), { code: "POS_ADMIN_OPERATOR_REQUIRED" });
  assert.equal((await f.post({ action: "admin" })).status, 200);
  await f.guard.requirePosPageAccess("a", "/brand/a/pos/products", f.cookies);
  await f.guard.requirePosPageAccess("a", "/brand/a/pos/staff", f.cookies);
  assert.ok(f.contextReads > 0);
  await assert.rejects(() => f.guard.requirePosPageAccess("other", "/brand/other/pos/products", f.cookies), { code: "POS_BRAND_FORBIDDEN" });
  const oldMode = f.jar.get("cometa_pos_admin_session"); await f.post({ action: "lock" });
  await f.post({ action: "login", staffId: "staff-a", pin: "1234" }); f.jar.set("cometa_pos_admin_session", oldMode);
  await assert.rejects(() => f.guard.requirePosPageAccess("a", "/brand/a/pos/products", f.cookies), { code: "POS_ADMIN_OPERATOR_REQUIRED" });
});
test("MANAGER/CASHIER can use cash tools, but cannot enable admin; WAITER/KITCHEN cannot use cash pages", async () => {
  for (const role of ["MANAGER", "CASHIER", "WAITER", "KITCHEN"]) {
    const f = fixture(); await addOperator(f, role); await f.post({ action: "login", staffId: "staff-a", pin: "1234" });
    assert.equal((await f.post({ action: "admin" })).status, 403);
    await assert.rejects(() => f.guard.requirePosPageAccess("a", "/brand/a/pos/staff", f.cookies), { code: "POS_ADMIN_OPERATOR_REQUIRED" });
    if (["MANAGER", "CASHIER"].includes(role)) await f.guard.requirePosPageAccess("a", "/brand/a/pos/cash", f.cookies);
    else await assert.rejects(() => f.guard.requirePosPageAccess("a", "/brand/a/pos/cash", f.cookies), { code: "POS_ADMIN_OPERATOR_REQUIRED" });
  }
});
test("session is isolated by host and brand; expired/revoked/inactive sessions fail validation", async () => {
  const f = fixture(); const op = await addOperator(f); await f.post({ action: "login", staffId: op.id, pin: "1234" });
  const session = f.rows.pos_staff_sessions[0];
  for (const [key, value] of [["host_user_id", "other"], ["brand_slug", "other"], ["expires_at", "2000-01-01"], ["revoked_at", "2026-01-01"]]) {
    const old = session[key]; session[key] = value; assert.equal(await f.staff.getStaffSession(f.context), null); session[key] = old;
  }
  op.active = false; assert.equal(await f.staff.getStaffSession(f.context), null);
});
test("failed session revocation returns error without falsely reporting terminal locked", async () => {
  const f = fixture(); await addOperator(f); await f.post({ action: "login", staffId: "staff-a", pin: "1234" });
  f.failures.set("pos_staff_sessions:update", true);
  const result = await f.post({ action: "lock" }); assert.equal(result.status, 503); assert.equal(result.body.code, "POS_STAFF_SESSION_REVOKE_FAILED");
});
