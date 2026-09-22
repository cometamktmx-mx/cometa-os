import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const read = (file) => readFileSync(file, "utf8");
const storage = read("src/lib/pos/offline-storage.ts");
const outbox = read("src/lib/pos/offline-outbox.ts");
const shell = read("src/app/brand/[brandSlug]/components/pos-shell.tsx");
const status = read("src/app/brand/[brandSlug]/components/pos-connection-status.tsx");
assert.equal(existsSync("public/sw.js"), true);
assert.equal(existsSync("public/manifest.json"), true);
assert.match(storage, /cometa-pos-offline/);
assert.match(storage, /schemaVersion/);
assert.match(storage, /bootstrap/);
assert.match(storage, /food_snapshot/);
assert.match(outbox, /requestKey/);
assert.match(outbox, /PENDING.*SYNCING.*SYNCED.*FAILED/s);
assert.match(shell, /offlinePut\("bootstrap"/);
assert.match(shell, /offlineGet<Record<string, unknown>>\("bootstrap"/);
assert.match(shell, /setInterval\(\(\) => void revalidate\(\), 60000\)/);
assert.match(status, /Nueva versión disponible/);
assert.match(read("public/sw.js"), /request\.url\.includes\("\/api\/"\)/);
console.log("PASS offline foundation contracts, cache isolation, outbox and SW policy");

// Execute the production revalidation callback with deterministic network/storage adapters.
const ast = ts.createSourceFile("pos-shell.tsx", shell, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function find(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "revalidate") callback = node.initializer.arguments[0].getText(ast);
  ts.forEachChild(node, find);
}
find(ast);
assert.ok(callback);
function loadPolicy(file) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "module", code)(loaded.exports, loaded);
  return loaded.exports;
}
const lifecyclePolicy = loadPolicy("src/lib/pos/lifecycle.ts");
const entitlementPolicy = loadPolicy("src/lib/pos/entitlements.ts");
const capabilityPolicy = loadPolicy("src/lib/pos/capabilities.ts");
const { getPosSurfaceState } = loadPolicy("src/lib/pos/surface-policy.ts");
const lifecycle = { planCode: "pro", status: "trial", effectiveStatus: "trial", accessAllowed: true,
  trial: { startedAt: null, endsAt: null, daysRemaining: 1, hoursRemaining: 24, expired: false, expiringSoon: false },
  period: { startsAt: null, endsAt: null, graceEndsAt: null }, cancelledAt: null, requiresActivation: false, reason: null };
const fresh = { ok: true, brand: { slug: "macca", id: "brand", name: "Macca" },
  user: { userId: "owner", role: "client", isAdmin: false }, lifecycle,
  effectiveCommercialAccess: { subscriptionLifecycle: lifecycle,
    effective: { accessAllowed: true, accessSource: "trial", planCode: "pro", planSource: "commercial_grant", reason: null },
    grant: { active: true, planCode: "pro", type: "complimentary", startsAt: null, endsAt: null } },
  effectiveEntitlements: { plan: { code: "pro", name: "Pro" }, subscription: { status: "trial", trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null, graceEndsAt: null }, entitlements: ["pos.access"], overrides: [] },
  profileCode: "coffee_shop", profileFamily: "restaurant", effectiveCapabilities: [], branding: null };
let cached = { ...fresh, effectiveCommercialAccess: { ...fresh.effectiveCommercialAccess, effective: { ...fresh.effectiveCommercialAccess.effective, accessAllowed: false } }, effectiveEntitlements: { ...fresh.effectiveEntitlements, entitlements: [] } };
const state = { EffectiveCommercialAccess: cached.effectiveCommercialAccess, EffectiveEntitlements: [] };
let response = fresh;
assert.ok(lifecyclePolicy.isSubscriptionLifecycle(fresh.lifecycle), "valid lifecycle fixture");
assert.ok(lifecyclePolicy.isEffectiveCommercialAccess(fresh.effectiveCommercialAccess), "valid commercial fixture");
assert.ok(entitlementPolicy.isEffectiveEntitlementsResponse(fresh.effectiveEntitlements), "valid entitlement fixture");
const bindings = { brandSlug: "macca", initialBrand: { name: "Macca" },
  lastRevalidation: { current: 0 }, revalidationInFlight: { current: null }, bootstrapRevision: { current: 0 },
  navigator: { onLine: true }, fetch: async () => ({ ok: true, json: async () => response }),
  offlineScope: (brandSlug) => ({ brandSlug, locationId: null }),
  offlinePut: async (store, scope, value) => { assert.equal(store, "bootstrap"); assert.equal(scope.brandSlug, "macca"); cached = value; },
  updateBranding: (value) => { state.Branding = value; },
  ...lifecyclePolicy, ...entitlementPolicy, ...capabilityPolicy };
for (const name of ["NetworkState", "Brand", "User", "Lifecycle", "EffectiveCommercialAccess", "EffectiveEntitlements", "ProfileCode", "ProfileFamily", "EffectiveCapabilities", "LoadedBrandSlug", "LoadError", "IsLoading"]) bindings[`set${name}`] = (value) => { state[name] = value; };
const code = ts.transpileModule(`const run = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const revalidate = new Function(...Object.keys(bindings), `${code}; return run;`)(...Object.values(bindings));
const surface = () => getPosSurfaceState({ pathname: "/brand/macca/pos", brandSlug: "macca", ready: true,
  commercialAccessAllowed: state.EffectiveCommercialAccess.effective.accessAllowed, entitlements: state.EffectiveEntitlements });
assert.equal(surface(), "blocked");
await revalidate();
assert.equal(surface(), "operation");
assert.equal(cached, fresh);
assert.equal(state.ProfileCode, "coffee_shop");
assert.equal(state.User.isAdmin, false);
assert.equal(state.LoadError, null);
bindings.lastRevalidation.current = 0;
response = { ...fresh, brand: { ...fresh.brand, slug: "other-brand" } };
await revalidate();
assert.equal(cached, fresh);
assert.equal(state.Brand.slug, "macca");
assert.equal(state.NetworkState, "SYNC_ERROR");
console.log("PASS cached denied bootstrap -> fresh authorized React state and cache; cross-brand response rejected");
