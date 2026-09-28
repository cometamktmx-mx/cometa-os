import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const route = await readFile("src/app/api/comu/stripe/connect-webhook/route.ts", "utf8");
const stripe = await readFile("src/lib/comu/stripe.ts", "utf8");
const finance = await readFile("src/lib/comu/finance.ts", "utf8");
const guards = await readFile("src/lib/comu/outbound-guards.mjs", "utf8");

const signatureIndex = route.indexOf("constructEvent");
const modeIndex = route.indexOf("event.livemode !== runtimeLive");
assert.ok(signatureIndex >= 0, "Connect route must verify Stripe signatures");
assert.ok(modeIndex > signatureIndex, "livemode must be checked after signature verification");
assert.match(route, /ignored: true/);
assert.doesNotMatch(route, /if \(event\.livemode\)/);
assert.doesNotMatch(stripe, /COMU_CONNECT_TEST_MODE_REQUIRED/);
assert.doesNotMatch(finance, /COMU_CONNECT_TEST_ONLY/);
assert.doesNotMatch(finance, /COMU_CONNECT_LOCAL_ONLY/);
assert.match(finance, /comu_mode: live \? "live" : "test"/);
assert.match(stripe, /rk_test_/);
assert.match(stripe, /rk_live_/);
assert.match(stripe, /COMU_CONNECT_ENVIRONMENT_MISMATCH/);
assert.match(stripe, /getComuAppOrigin/);
assert.doesNotMatch(finance, /!transfer\.livemode/);
assert.match(finance, /comu_connect_webhook_events/);
assert.match(finance, /account\.updated/);
assert.match(finance, /transfer\.created/);
assert.match(finance, /transfer\.reversed/);
assert.match(finance, /payout\.paid/);
assert.match(finance, /payout\.failed/);
assert.match(guards, /COMU_OUTBOUND_MONEY_ENABLED/);
assert.match(guards, /COMU_TRANSFERS_ENABLED/);
assert.match(guards, /COMU_REFUNDS_ENABLED/);
assert.match(guards, /COMU_REVERSALS_ENABLED/);
console.log("PASS connect signature-before-mode policy");
console.log("PASS signed Live/Test isolation policy");
console.log("PASS Connect account/update and transfer/payout routing retained");
console.log("PASS outbound guards unchanged");

// Execute the real helpers in isolation: no credentials, SDK clients or network.
const env = {};
function loadModule(source, imports) {
  const context = { exports: {}, process: { env }, require(name) {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  } };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, context);
  return context.exports;
}
const mode = loadModule(stripe, { "server-only": {}, stripe: class { constructor() { throw new Error("REAL_STRIPE_CLIENT_FORBIDDEN"); } } });
if (process.argv.includes("--production-config")) {
  Object.assign(env, process.env, { NODE_ENV: "production" });
  assert.equal(env.VERCEL_ENV, "production");
  assert.equal(mode.getStripeRuntimeMode(), true);
  assert.equal(mode.assertConnectAccountCreationAllowed(), true);
  assert.equal(mode.getComuAppOrigin(true), "https://app.cometaos.com");
  const runtimeGuards = loadModule(guards, {});
  assert.notEqual(env.COMU_OUTBOUND_MONEY_ENABLED, "true");
  for (const kind of ["transfer", "refund", "reversal"]) {
    assert.notEqual(env[`COMU_${kind.toUpperCase()}S_ENABLED`], "true");
    assert.equal(runtimeGuards.outboundGuard(kind).enabled, false);
  }
  console.log("COMU_PRODUCTION_CERTIFICATION: LIVE; origin=https://app.cometaos.com; outbound/transfers/refunds/reversals=OFF; Stripe/DB calls=0");
  for (const key of Object.keys(env)) delete env[key];
}
for (const [prefix, live] of [["sk_test_", false], ["rk_test_", false], ["sk_live_", true], ["rk_live_", true]]) {
  env.COMU_STRIPE_SECRET_KEY = `${prefix}synthetic`;
  assert.equal(mode.getStripeRuntimeMode(), live);
  for (const nodeEnv of ["development", "test", "production"]) {
    for (const vercelEnv of [undefined, "development", "preview", "production"]) {
      env.NODE_ENV = nodeEnv;
      env.VERCEL_ENV = vercelEnv;
      const production = nodeEnv === "production" && (!vercelEnv || vercelEnv === "production");
      if (production === live) assert.equal(mode.assertConnectAccountCreationAllowed(), live);
      else assert.throws(() => mode.assertConnectAccountCreationAllowed(), /COMU_CONNECT_ENVIRONMENT_MISMATCH/);
    }
  }
}
for (const key of [undefined, "unknown"]) {
  env.COMU_STRIPE_SECRET_KEY = key;
  assert.throws(() => mode.getStripeRuntimeMode(), /COMU_STRIPE_/);
}
env.NODE_ENV = "production";
for (const origin of [undefined, "http://localhost:3000", "https://preview.vercel.app", "http://app.cometaos.com", "https://app.cometaos.com.evil.invalid", "https://app.cometaos.com/path"]) {
  env.APP_ORIGIN = origin;
  assert.throws(() => mode.getComuAppOrigin(true), /COMU_(APP_ORIGIN_MISSING|CONNECT_LIVE_ORIGIN_INVALID)/);
}
for (const origin of ["https://app.cometaos.com", "https://app.cometaos.com/"]) {
  env.APP_ORIGIN = origin;
  assert.equal(mode.getComuAppOrigin(true), "https://app.cometaos.com");
}
env.APP_ORIGIN = undefined;
env.NODE_ENV = "test";
assert.equal(mode.getComuAppOrigin(false), "http://localhost:3000");
for (const live of [true, false]) {
  mode.assertConnectAccountAssociation({ metadata: { comu_seller_id: "seller-a", comu_mode: live ? "live" : "test" } }, "seller-a", live);
  for (const metadata of [undefined, {}, { comu_seller_id: "seller-a", comu_mode: live ? "test" : "live" }, { comu_seller_id: "seller-b", comu_mode: live ? "live" : "test" }]) {
    assert.throws(() => mode.assertConnectAccountAssociation({ metadata }, "seller-a", live), /COMU_CONNECT_ACCOUNT_ASSOCIATION_MISMATCH/);
  }
}
console.log("PASS 48 environment/key combinations, invalid keys, canonical Live URLs and account association isolation");

class FakePosApiError extends Error {}
let savedAccount;
let retrievedAccount;
let retrievalError;
let created = 0;
let links = 0;
let synced = 0;
let linkInput;
const admin = { from() {
  return { upsert: async () => ({ error: null }), select() { return this; }, eq() { return this; },
    single: async () => ({ data: savedAccount, error: null }), maybeSingle: async () => ({ data: savedAccount, error: null }),
    update() { synced++; return { eq: async () => ({ error: null }) }; } };
} };
const fakeStripe = { accounts: {
  retrieve: async () => { if (retrievalError) throw new Error("ACCOUNT_NOT_IN_CURRENT_MODE"); return retrievedAccount; },
  create: async () => { created++; throw new Error("ACCOUNT_CREATION_FORBIDDEN"); },
}, accountLinks: { create: async (input) => { links++; linkInput = input; return { url: input.return_url, expires_at: 1 }; } } };
// requireFinanceSeller still executes its real access logic against an isolated stub.
const actorAdmin = { from(table) {
  if (table === "comu_seller_memberships") return { select() { return this; }, eq() { return this; }, in() { return this; }, limit: async () => ({ data: [{ seller_id: "seller-a" }], error: null }) };
  if (table === "comu_sellers") return { select() { return this; }, eq() { return this; }, single: async () => ({ data: { id: "seller-a", brand_slug: "brand-a" }, error: null }) };
  return admin.from(table);
} };
const runtime = loadModule(finance, {
  "@/lib/pos/server": { PosApiError: FakePosApiError },
  "./seller-access": { requireComuActor: async () => ({ admin: actorAdmin, userId: "user-a" }) },
  "./stripe": { ...mode, getConnectStripeClient: () => fakeStripe },
  "./outbound-guards.mjs": { assertOutboundEnabled: () => { throw new Error("OUTBOUND_FORBIDDEN"); } },
});
for (const live of [true, false]) {
  env.NODE_ENV = live ? "production" : "test";
  env.VERCEL_ENV = undefined;
  env.COMU_STRIPE_SECRET_KEY = live ? "sk_live_synthetic" : "sk_test_synthetic";
  env.APP_ORIGIN = live ? "https://app.cometaos.com" : "http://localhost:3000";
  savedAccount = { stripe_account_id: "acct_synthetic_existing" };
  retrievedAccount = { metadata: { comu_seller_id: "seller-a", comu_mode: live ? "live" : "test" }, capabilities: {}, requirements: {} };
  retrievalError = false;
  await runtime.createSellerConnectAccount();
  assert.equal(created, 0);
  const result = await runtime.createSellerOnboardingLink();
  assert.equal(result.url, `${env.APP_ORIGIN}/brand/brand-a/comu/settings?connect=return`);
  assert.equal(linkInput.refresh_url, `${env.APP_ORIGIN}/brand/brand-a/comu/settings?connect=refresh`);
  const before = { synced, links };
  retrievedAccount.metadata.comu_mode = live ? "test" : "live";
  await assert.rejects(runtime.createSellerConnectAccount(), /COMU_CONNECT_ACCOUNT_ASSOCIATION_MISMATCH/);
  await assert.rejects(runtime.createSellerOnboardingLink(), /COMU_CONNECT_ACCOUNT_ASSOCIATION_MISMATCH/);
  await assert.rejects(runtime.getSellerConnectStatus(), /COMU_CONNECT_ACCOUNT_ASSOCIATION_MISMATCH/);
  assert.deepEqual({ synced, links }, before);
  retrievalError = true;
  await assert.rejects(runtime.createSellerConnectAccount(), /ACCOUNT_NOT_IN_CURRENT_MODE/);
  assert.equal(created, 0);
}
for (const file of ["account", "onboarding-link"]) {
  const handler = await readFile(`src/app/api/comu/seller/connect/${file}/route.ts`, "utf8");
  assert.doesNotMatch(handler, /request\.(json|url)|searchParams/);
}
console.log("PASS existing account reuse, no replacement on wrong mode/retrieval failure, seller isolation and server-only mode; SDK/DB fully mocked");
