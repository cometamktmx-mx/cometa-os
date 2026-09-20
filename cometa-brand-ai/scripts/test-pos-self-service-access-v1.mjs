import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Execute production guards with deterministic Auth/DB adapters; no network.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
let state;
let assertions = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const rejects = async (fn, code) => {
  await assert.rejects(fn, (error) => error.code === code);
  assertions++;
};
const lifecycle = (allowed) => ({
  planCode: "pro", status: "trial", effectiveStatus: allowed ? "trial" : "trial_expired",
  accessAllowed: allowed, trial: { startedAt: null, endsAt: null, daysRemaining: 0,
    hoursRemaining: 0, expired: !allowed, expiringSoon: false },
  period: { startsAt: null, endsAt: null, graceEndsAt: null }, cancelledAt: null,
  requiresActivation: !allowed, reason: null,
});
const db = {
  from(table) {
    const filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      maybeSingle() { const result = rows(); return Promise.resolve({ ...result, data: result.data[0] || null }); },
      then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); },
    };
    function rows() {
      if (!Object.hasOwn(state.tables, table)) throw new Error(`Unexpected table: ${table}`);
      return { data: state.tables[table].filter((row) => filters.every(([k, v]) => row[k] === v)), error: state.errors[table] || null };
    }
    return query;
  },
  async rpc(name, args) {
    check(args.p_brand_slug, "owned-brand");
    if (state.rpcError) return { data: null, error: { message: "test database failure" } };
    if (name === "pos_get_subscription_lifecycle") return { data: lifecycle(state.allowed), error: null };
    if (name === "pos_get_effective_commercial_access") return { data: {
      subscriptionLifecycle: lifecycle(state.allowed),
      effective: { accessAllowed: state.allowed, accessSource: state.allowed ? "trial" : "none", planCode: "pro", planSource: "subscription", reason: null },
      grant: { active: false, planCode: null, type: null, startsAt: null, endsAt: null },
    }, error: null };
    if (name === "pos_get_brand_entitlements") return { data: {
      plan: { code: "pro", name: "Pro" }, subscription: { status: "trial", trialEndsAt: null,
        currentPeriodStart: null, currentPeriodEnd: null, graceEndsAt: null },
      entitlements: state.entitlements, overrides: [],
    }, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  },
};
const cache = new Map();
function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const loaded = { exports: {} };
  cache.set(absolute, loaded);
  const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = (name) => {
    if (name === "server-only") return {};
    if (name === "next/headers") return { cookies: async () => ({ getAll: () => [] }) };
    if (name === "next/server") return { NextResponse: {} };
    if (name === "@supabase/supabase-js") return { createClient: () => db };
    if (name === "@supabase/ssr") return { createServerClient: () => ({ auth: {
      getUser: async () => ({ data: { user: state.auth ? { id: "creator", email: null } : null }, error: null }),
    } }) };
    if (name === "@/lib/brand-resolver") return {
      slugifyBrand: (value) => value.trim().toLowerCase(),
      resolveBrandFromSupabase: async (_db, { brandSlug }) => ({ id: brandSlug, slug: brandSlug, name: brandSlug, exists: brandSlug !== "missing", sourceTable: "brands" }),
    };
    if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
    throw new Error(`Unexpected import: ${name}`);
  };
  new Function("require", "module", "exports", code)(require, loaded, loaded.exports);
  return loaded.exports;
}
function reset() {
  state = { auth: true, allowed: true, entitlements: ["pos.access", "pos.sales"], errors: {}, tables: {
    user_profiles: [{ user_id: "creator", role: "client", status: "active" }],
    user_brand_access: [{ user_id: "creator", brand_slug: "owned-brand", access_role: "owner", status: "active" }],
    pos_subscriptions: [{ id: "subscription", brand_slug: "owned-brand" }],
  } };
}
const { getPosAccountRole, getPosSurfaceState } = load("src/lib/pos/surface-policy.ts");
const { requirePosContext } = load("src/lib/pos/server.ts");
const { requirePosSurfaceAccess, requirePosOperationalAccess } = load("src/lib/pos/access.ts");
for (const role of ["client", "admin"]) check(getPosAccountRole({ role, status: "active" }), role);
for (const profile of [null, {}, { role: "team", status: "active" }, { role: "owner", status: "active" }, { role: "client", status: "inactive" }]) check(getPosAccountRole(profile), null);
reset();
check((await requirePosContext("owned-brand")).membership.effectiveRole, "owner");
await rejects(() => requirePosContext("other-brand"), "POS_BRAND_FORBIDDEN");
state.tables.user_brand_access[0].access_role = "viewer";
check((await requirePosContext("owned-brand")).membership.effectiveRole, "viewer");
state.tables.user_brand_access[0].status = "inactive";
await rejects(() => requirePosContext("owned-brand"), "POS_BRAND_FORBIDDEN");
reset(); state.auth = false;
await rejects(() => requirePosContext("owned-brand"), "POS_UNAUTHORIZED");
reset(); state.tables.user_profiles = [];
await rejects(() => requirePosContext("owned-brand"), "POS_ACCOUNT_ACCESS_DENIED");
for (const role of ["team", "client"]) {
  reset(); Object.assign(state.tables.user_profiles[0], { role, status: role === "team" ? "active" : "inactive" });
  await rejects(() => requirePosContext("owned-brand"), "POS_ACCOUNT_ACCESS_DENIED");
}
reset(); state.errors.user_profiles = { message: "test error" };
await rejects(() => requirePosContext("owned-brand"), "POS_ACCOUNT_LOOKUP_FAILED");
reset();
check((await requirePosSurfaceAccess("owned-brand")).operationAllowed, true);
check((await requirePosOperationalAccess({ brandSlug: "owned-brand", entitlement: "pos.sales" })).membership.role, "owner");
state.entitlements = ["pos.sales"];
check((await requirePosSurfaceAccess("owned-brand")).operationAllowed, false);
await rejects(() => requirePosOperationalAccess({ brandSlug: "owned-brand", entitlement: "pos.sales" }), "POS_ENTITLEMENT_REQUIRED");
state.allowed = false;
check((await requirePosSurfaceAccess("owned-brand")).setupRequired, false);
await rejects(() => requirePosOperationalAccess({ brandSlug: "owned-brand", entitlement: "pos.access" }), "POS_SUBSCRIPTION_ACCESS_DENIED");
reset(); state.tables.pos_subscriptions = [];
check((await requirePosSurfaceAccess("owned-brand")).setupRequired, true);
reset(); state.rpcError = true;
await rejects(() => requirePosSurfaceAccess("owned-brand"), "POS_DATABASE_ERROR");
for (const profile of ["retail", "fashion", "restaurant", "coffee_shop"]) {
  // Surface policy must not depend on the business's vertical or OS product.
  const input = { pathname: "/brand/owned-brand/pos", brandSlug: "owned-brand", ready: true, commercialAccessAllowed: true, entitlements: ["pos.access"], profile };
  check(getPosSurfaceState(input), "operation");
  check(getPosSurfaceState({ ...input, entitlements: [] }), "blocked");
  check(getPosSurfaceState({ ...input, ready: false }), "loading");
  check(getPosSurfaceState({ ...input, commercialAccessAllowed: false }), "blocked");
  check(getPosSurfaceState({ ...input, pathname: "/brand/owned-brand/pos/subscription", commercialAccessAllowed: false, entitlements: [], ready: false }), "recovery");
  check(getPosSurfaceState({ ...input, pathname: "/brand/other-brand/pos/subscription", commercialAccessAllowed: false }), "blocked");
}
const { resolveBrandOsProductAccess } = load("src/lib/brand-os/access.ts");
check(resolveBrandOsProductAccess({ membershipActive: true, isPlatformAdmin: false, osAccess: { status: "not_configured", commercialAccessActive: false } }).effectiveAccessAllowed, false);
console.log(`PASS self-service/POS guard policy: ${assertions} assertions (no network)`);
