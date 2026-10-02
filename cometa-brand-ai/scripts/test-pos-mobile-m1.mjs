import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import ts from "typescript";
const require = createRequire(import.meta.url);
const read = file => readFileSync(file, "utf8");
function load(file, deps = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)(name => Object.hasOwn(deps, name) ? deps[name] : require(name), module, module.exports);
  return module.exports;
}
class PosApiError extends Error { constructor(status, code, message) { super(message); Object.assign(this, { status, code }); } }
const server = { PosApiError, uuidValue: value => value, requiredText: value => value, readJsonBody: request => request.json(),
  ok: (body, status = 200) => ({ body, status }), handlePosError: error => ({ status: error.status || 500, body: { code: error.code } }) };
const rbac = load("src/lib/pos/rbac.ts");
const roles = load("src/lib/pos/staff-shared.ts");
const policies = load("src/lib/pos/mutation-policy.ts");
function mutationFixture() {
  const f = { mode: "RESTAURANT", role: "ADMIN", adminMode: true, entitlement: true, calls: [],
    context: { brand: { slug: "a" }, user: { userId: "host", isAdmin: false }, membership: rbac.resolvePosMembership({ user_id: "host", brand_slug: "a", access_role: "owner", status: "active" }) } };
  f.guard = load("src/lib/pos/mutation-access.ts", { "server-only": {}, "./server": server, "./rbac": rbac, "./staff-shared": roles, "./mutation-policy": policies,
    "./access": { requirePosOperationalAccess: async input => { f.calls.push(input); if (!f.entitlement) throw new PosApiError(403, "POS_ENTITLEMENT_REQUIRED"); return f.context; } },
    "./staff-server": { getPosMode: async () => f.mode, getStaffSession: async () => f.role ? { staff: { id: "local", role: f.role, roles: [f.role] } } : null, isStaffAdminMode: async () => f.adminMode },
    "./device-server": { assertDeviceLocation: (context, location) => { if (context.device && context.device.locationId !== location) throw new PosApiError(403, "POS_DEVICE_LOCATION_FORBIDDEN"); } },
  });
  return f;
}
test("every mutation enforces entitlement, verified operator role and administrative mode", async () => {
  for (const [operation, policy] of Object.entries(policies.POS_MUTATION_POLICY)) {
    for (const role of ["ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN"]) {
      const f = mutationFixture(); f.role = role;
      const run = () => f.guard.requirePosMutationAccess({ brandSlug: "a", operation });
      if (policy.foodRoles.includes(role)) assert.equal(await run(), f.context);
      else await assert.rejects(run, { status: 403 });
      assert.equal(f.calls[0].entitlement, policy.entitlement);
    }
    const f = mutationFixture(); f.role = null;
    await assert.rejects(() => f.guard.requirePosMutationAccess({ brandSlug: "a", operation }), { status: 401 });
    f.role = "ADMIN"; f.entitlement = false;
    await assert.rejects(() => f.guard.requirePosMutationAccess({ brandSlug: "a", operation }), { status: 403 });
    f.entitlement = true; f.adminMode = false;
    if (policy.adminMode) await assert.rejects(() => f.guard.requirePosMutationAccess({ brandSlug: "a", operation }), { code: "POS_ADMIN_OPERATOR_REQUIRED" });
  }
});
test("Retail host RBAC is enforced and enrolled Retail also requires PIN session", async () => {
  const f = mutationFixture(); f.mode = "RETAIL"; f.role = null;
  await f.guard.requirePosMutationAccess({ brandSlug: "a", operation: "sale.create" });
  f.context.device = { locationId: "branch" };
  await assert.rejects(() => f.guard.requirePosMutationAccess({ brandSlug: "a", operation: "sale.create" }), { status: 401 });
  f.role = "CASHIER";
  await f.guard.requirePosMutationAccess({ brandSlug: "a", operation: "sale.create" });
  f.context.membership = rbac.resolvePosMembership({ user_id: "host", brand_slug: "a", access_role: "viewer", status: "active" });
  await assert.rejects(() => f.guard.requirePosMutationAccess({ brandSlug: "a", operation: "sale.create" }), { code: "POS_PERMISSION_REQUIRED" });
});
test("calling the inventory POST directly cannot supply a forged role/permission/staffId", async () => {
  const f = mutationFixture(); f.role = "WAITER";
  const route = load("src/app/api/pos/inventory/route.ts", { "@/lib/pos/server": server, "@/lib/pos/access": {}, "@/lib/pos/mutation-access": f.guard });
  const result = await route.POST(new Request("https://pos.invalid/api/pos/inventory", { method: "POST", body: JSON.stringify({ brandSlug: "a", role: "ADMIN", permission: "pos.inventory.write", staffId: "admin" }) }));
  assert.equal(result.status, 403); assert.equal(result.body.code, "POS_STAFF_PERMISSION_REQUIRED");
});
test("authorized inventory POST retains the canonical RPC and host attribution", async () => {
  const f = mutationFixture(); let called;
  f.context.admin = { rpc: async (name, args) => { called = { name, args }; return { data: { quantity: 2 }, error: null }; } };
  const route = load("src/app/api/pos/inventory/route.ts", { "@/lib/pos/server": { ...server, optionalText: v => v || null, numberValue: v => v, assertDatabaseResult: error => assert.equal(error, null) }, "@/lib/pos/access": {}, "@/lib/pos/mutation-access": f.guard });
  const result = await route.POST(new Request("https://pos.invalid/api/pos/inventory", { method: "POST", body: JSON.stringify({ brandSlug: "a", locationId: "branch", variantId: "variant", quantity: 2, movementType: "adjustment", userId: "forged" }) }));
  assert.equal(result.status, 200); assert.equal(called.name, "pos_adjust_inventory"); assert.equal(called.args.p_user_id, "host");
});
function deviceFixture() {
  const f = { rows: { pos_devices: [], pos_locations: [{ id: "branch", brand_slug: "a", active: true }] }, jar: new Map(), writes: [], fail: false };
  f.cookies = { getAll: () => [...f.jar].map(([name, value]) => ({ name, value })), set: (name, value, options) => { f.jar.set(name, value); f.writes.push({ name, value, options }); }, delete: name => f.jar.delete(name) };
  const admin = { from(table) {
    const filters = []; let insert, update;
    const query = { select() { return query; }, eq(k, v) { filters.push(row => row[k] === v); return query; }, insert(value) { insert = value; return query; }, update(value) { update = value; return query; },
      single() { return Promise.resolve(result()); }, maybeSingle() { return Promise.resolve(result()); }, then(a, b) { return Promise.resolve(result()).then(a, b); } };
    function result() {
      if (f.fail) return { error: { message: "unavailable" }, data: null };
      if (insert) f.rows[table].push({ id: "device", status: "ACTIVE", created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), revoked_at: null, ...insert });
      const rows = f.rows[table].filter(row => filters.every(fn => fn(row)));
      if (update) rows.forEach(row => Object.assign(row, update));
      return { data: rows[0] || null, error: null };
    }
    return query;
  }, rpc: async (name, args) => { assert.equal(name, "pos_revoke_device_v1"); const row = f.rows.pos_devices.find(row => row.id === args.p_device_id && row.brand_slug === args.p_brand_slug); if (row) { row.status = "REVOKED"; row.revoked_at = new Date().toISOString(); } return { data: Boolean(row), error: null }; } };
  f.context = { admin, brand: { id: "brand", slug: "a" }, user: { userId: "host", authSessionId: "session" } };
  f.device = load("src/lib/pos/device-server.ts", { "server-only": {}, "./server": server, "./device-contract": load("src/lib/pos/device-contract.ts"), "next/headers": { cookies: async () => f.cookies } });
  return f;
}
test("enrollment issues HttpOnly credential, stores only hash, binds account/session/brand/branch", async () => {
  const f = deviceFixture();
  const publicDevice = await f.device.enrollPosDevice(f.context, "branch", "Terminal 1");
  const credential = f.jar.get("cometa_pos_device"); const row = f.rows.pos_devices[0];
  assert.deepEqual(Object.keys(publicDevice).sort(), ["expiresAt", "id"]);
  assert.equal(row.token_hash, createHash("sha256").update(credential).digest("hex"));
  assert.notEqual(row.token_hash, credential); assert.equal(f.writes[0].options.httpOnly, true);
  assert.equal(row.auth_session_id, "session"); assert.equal(row.host_user_id, "host");
  assert.equal(row.brand_slug, "a"); assert.equal(row.location_id, "branch");
  const resolved = await f.device.resolvePosDevice(f.context); assert.equal(resolved.id, "device"); assert.equal(resolved.token_hash, undefined);
  await assert.rejects(() => f.device.enrollPosDevice(f.context, "branch", "Duplicate"), { status: 409 });
  f.context.user.userId = "other";
  await assert.rejects(() => f.device.resolvePosDevice(f.context), { status: 401 });
});
test("revocation cannot be bypassed by deleting cookie; lookup errors fail closed", async () => {
  const f = deviceFixture(); await f.device.enrollPosDevice(f.context, "branch", "Terminal");
  f.jar.clear(); await assert.rejects(() => f.device.resolvePosDevice(f.context), { code: "POS_DEVICE_SESSION_INVALID" });
  await f.device.revokePosDevice(f.context, "device");
  await assert.rejects(() => f.device.resolvePosDevice(f.context), { code: "POS_DEVICE_REVOKED" });
  f.fail = true; await assert.rejects(() => f.device.resolvePosDevice(f.context), { status: 503 });
});
test("device rejects other brand, branch and expired credential; legacy web is explicit", async () => {
  const f = deviceFixture(); assert.equal(await f.device.resolvePosDevice(f.context), null);
  await f.device.enrollPosDevice(f.context, "branch", "Terminal");
  f.context.brand.slug = "other"; await assert.rejects(() => f.device.resolvePosDevice(f.context), { code: "POS_DEVICE_BRAND_FORBIDDEN" });
  f.context.brand.slug = "a"; f.context.device = await f.device.resolvePosDevice(f.context);
  assert.throws(() => f.device.assertDeviceLocation(f.context, "other"), { status: 403 });
  f.rows.pos_devices[0].expires_at = "2000-01-01";
  await assert.rejects(() => f.device.resolvePosDevice(f.context), { code: "POS_DEVICE_EXPIRED" });
});
test("POS-only routing, OS default, pending invitation and safe next/returnTo", () => {
  const { getWorkspaceDestination } = load("src/lib/workspace/context.ts", { "server-only": {}, "@supabase/supabase-js": {}, "@/lib/supabase/server": {}, "@/lib/brand-os/access": {}, "@/lib/pos/access": {}, "@/lib/brand-os/server": {} });
  const nav = load("src/lib/pos/navigation.ts", { "@/lib/auth/safe-next": load("src/lib/auth/safe-next.ts") });
  const ctx = { profile: { status: "active" }, isCanonicalAdmin: false, isCanonicalTeam: false, hasPendingInvitation: false, brands: [{ slug: "a", osStatus: "inactive", pos: { available: true } }] };
  assert.equal(getWorkspaceDestination(ctx), "/brand/a/pos");
  ctx.brands.push({ ...ctx.brands[0], slug: "b" }); assert.equal(getWorkspaceDestination(ctx), "/pos");
  ctx.brands[0].osStatus = "active"; assert.equal(getWorkspaceDestination(ctx), "/workspace");
  assert.equal(nav.posEntryDestination(ctx.brands, "/brand/a/pos/cash?x=1#cash"), "/brand/a/pos/cash?x=1#cash");
  assert.equal(nav.posReturnTo("https://evil.invalid", "/pos"), "/pos");
  assert.equal(nav.posReturnTo("//evil.invalid", "/workspace"), "/workspace");
  ctx.brands = []; ctx.hasPendingInvitation = true; assert.equal(getWorkspaceDestination(ctx), "/invite");
});
test("cache keys isolate all identities; missing identity fails closed; HTTP denials never allow fallback", async () => {
  const storage = load("src/lib/pos/offline-storage.ts");
  const base = storage.offlineScope("a", "branch", { accountId: "host", operatorId: "one", deviceId: "device" });
  const key = storage.offlineScopeKey(base);
  for (const field of ["brandSlug", "locationId", "accountId", "operatorId", "deviceId"]) assert.notEqual(storage.offlineScopeKey({ ...base, [field]: "other" }), key);
  assert.equal(await storage.offlineGet("food_snapshot", storage.offlineScope("a")), null);
  assert.equal(await storage.offlinePut("food_snapshot", storage.offlineScope("a"), { sensitive: true }), false);
  for (const status of [401, 403, 500]) assert.equal(storage.mayUseOfflineSnapshot(Object.assign(new Error(), { status }), false), false);
  assert.equal(storage.mayUseOfflineSnapshot(new TypeError("network"), false), true);
  assert.equal(storage.mayUseOfflineSnapshot(new TypeError("network"), true), false);
});
test("unenroll and denied responses clear local context without storing a credential", async () => {
  let cleared = 0;
  const client = load("src/lib/pos/device-client.ts", { "./offline-storage": { clearPosLocalContext: async () => { cleared++; } } });
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ revoked: true, clearLocalContext: true }) });
    await client.unenrollPosDevice("a", "device"); assert.equal(cleared, 1);
    globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: "Revoked" }) });
    await assert.rejects(() => client.unenrollPosDevice("a", "device")); assert.equal(cleared, 2);
  } finally { globalThis.fetch = original; }
});
test("logout/operator switch clear every IndexedDB store and POS cache, preserving unrelated caches", async () => {
  const old = { indexedDB: globalThis.indexedDB, caches: globalThis.caches, window: globalThis.window, BroadcastChannel: globalThis.BroadcastChannel };
  const cleared = [], deleted = [], events = [];
  try {
    globalThis.BroadcastChannel = undefined;
    globalThis.window = { dispatchEvent: event => events.push(event.detail) };
    globalThis.indexedDB = { open: () => {
      const request = { result: { close() {}, transaction(names) {
        const tx = { objectStore: name => ({ clear: () => cleared.push(name) }) };
        assert.equal(names.length, 6); queueMicrotask(() => tx.oncomplete()); return tx;
      } } }; queueMicrotask(() => request.onsuccess()); return request;
    } };
    globalThis.caches = { keys: async () => ["cometa-pos-v1", "unrelated-app"], delete: async name => { deleted.push(name); } };
    const storage = load("src/lib/pos/offline-storage.ts");
    await storage.clearPosLocalContext(false, "operator");
    await storage.clearPosLocalContext(false, "account");
    assert.deepEqual(events, ["operator", "account"]);
    assert.equal(cleared.length, 12);
    assert.deepEqual(new Set(cleared), new Set(["meta", "bootstrap", "branding", "catalog", "food_snapshot", "outbox"]));
    assert.deepEqual(deleted, ["cometa-pos-v1", "cometa-pos-v1"]);
  } finally { Object.assign(globalThis, old); }
});
test("POS client import graph never reaches server-only code or private credentials", () => {
  const visited = new Set();
  function walk(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    assert.doesNotMatch(code, /require\(["']server-only["']\)|process\.env\.(?:SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY)/, file);
    for (const [, spec] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
      const base = spec.startsWith("@/") ? path.resolve("src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(file), spec) : null;
      if (!base) continue;
      const dependency = [base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx")].find(existsSync);
      if (dependency) walk(dependency);
    }
  }
  const root = "src/app/brand/[brandSlug]/components";
  for (const name of readdirSync(root).filter(name => name.startsWith("pos-") && name.endsWith(".tsx"))) {
    const file = path.join(root, name); if (/^[\s]*["']use client["']/.test(read(file))) walk(file);
  }
  assert.ok(visited.size > 20);
});
test("service worker does not intercept HTML, RSC, authenticated APIs or query variants", () => {
  const listeners = {};
  new Function("self", read("public/sw.js"))({ location: { origin: "https://pos.invalid" }, addEventListener: (type, fn) => { listeners[type] = fn; } });
  for (const path of ["/brand/a/pos", "/brand/a/pos?_rsc=secret", "/api/pos/food", "/manifest.json?private=1", "/login"]) {
    let intercepted = false;
    listeners.fetch({ request: { method: "GET", url: "https://pos.invalid" + path }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, path);
  }
});
