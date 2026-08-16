import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const files = {
  migration: "supabase/migrations/20260814_pos_plans_entitlements_v1.sql",
  bootstrap: "src/app/api/pos/bootstrap/route.ts",
  plans: "src/lib/pos/plans.ts",
  access: "src/lib/pos/access.ts",
  locations: "src/app/api/pos/locations/route.ts",
  registers: "src/app/api/pos/registers/route.ts",
  onboardingApi: "src/app/api/onboarding/business/route.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const checks = [];
const check = (name, assertion) => {
  try {
    assertion();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
};

for (const [code, price, locations, registers, users] of [
  ["start", "399.00", 1, 1, 2],
  ["pro", "499.00", 1, 2, 5],
  ["multi", "899.00", 4, 8, 10],
]) {
  check(`${code.toUpperCase()} catalog and price`, () => {
    assert.match(source.migration, new RegExp(`'${code}'[\\s\\S]{0,120}${price}`));
  });
  check(`${code.toUpperCase()} limits`, () => {
    assert.ok(source.migration.includes(`('${code}'::text, ${locations}, ${registers}, ${users},`));
  });
}

check("prices use MXN pesos, not minor units", () => {
  assert.doesNotMatch(source.migration, /39900|49900|89900/);
  assert.match(source.migration, /'MXN', 'month'/);
});
check("15-day trial authority retained", () => assert.match(source.migration, /'trialDays', 15/));
check("new initializer defaults to PRO", () => {
  assert.match(source.migration, /SET plan_code = 'pro'/);
  assert.match(source.migration, /pos_initialize_brand_setup_v1a_internal/);
});
check("legacy pos_start preserved", () => {
  assert.doesNotMatch(source.migration, /DELETE FROM public\.pos_plans[\s\S]*pos_start/);
  assert.doesNotMatch(source.migration, /UPDATE public\.pos_plans[\s\S]*code\s*=\s*'pos_start'/);
});
check("only legacy trials migrate", () => {
  assert.match(source.migration, /plan_code = 'pos_start'[\s\S]{0,100}status = 'trial'/);
  assert.match(source.migration, /previousPlanCode'[\s\S]{0,40}'pos_start'/);
});
check("trial timestamps are not rewritten", () => {
  const migrationUpdate = source.migration.match(/WITH migrated AS \([\s\S]*?RETURNING subscription\.\*/)?.[0] ?? "";
  assert.doesNotMatch(migrationUpdate, /trial_ends_at\s*=|started_at\s*=/);
});
check("START entitlement mapping", () => {
  for (const code of ["pos.access","pos.sales","pos.cash","pos.products","pos.inventory","pos.customers","pos.reports"]) assert.ok(source.migration.includes(`('start', '${code}')`));
  assert.doesNotMatch(source.migration, /\('start', 'pos\.loyalty'\)/);
});
check("PRO entitlement mapping", () => {
  for (const code of ["pos.loyalty","intelligence.signals","intelligence.pulsar"]) assert.ok(source.migration.includes(`('pro', '${code}')`));
});
check("MULTI entitlement mapping", () => assert.ok(source.migration.includes("('multi', 'platform.multi_location')")));
check("future entitlements not overgranted", () => {
  assert.doesNotMatch(source.migration, /\('(start|pro|multi)', 'intelligence\.opportunities'\)/);
  assert.doesNotMatch(source.migration, /\('(start|pro|multi)', 'platform\.advanced_users'\)/);
});
check("digital card remains disabled", () => assert.match(source.migration, /catalog\.includes_loyalty, false, true/));
check("bootstrap exposes commercial plan limits and usage", () => {
  assert.match(source.bootstrap, /resolvePosCommercialContext/);
  assert.match(source.bootstrap, /commercial,/);
  assert.match(source.bootstrap, /membershipCountResult\.count/);
});
check("owner usage uses canonical memberships", () => {
  assert.match(source.bootstrap, /from\("user_brand_access"\)/);
  assert.match(source.bootstrap, /eq\("status", "active"\)/);
});
check("location limit guard preserved", () => assert.match(source.locations, /POS_LOCATION_LIMIT_REACHED/));
check("register limit guard preserved", () => assert.match(source.registers, /POS_REGISTER_LIMIT_REACHED/));
check("CORE-1 lifecycle and entitlements preserved", () => {
  assert.match(source.access, /pos_get_subscription_lifecycle/);
  assert.match(source.access, /pos_get_brand_entitlements/);
});
check("profiles remain independent", () => {
  assert.doesNotMatch(source.plans, /fashion|retail/);
  assert.match(source.onboardingApi, /profileCode/);
});
check("no browser pricing or limits contract", () => {
  assert.doesNotMatch(source.onboardingApi, /monthlyPrice|maxLocations|maxRegisters|maxUsers|list_price/);
});
check("no Stripe or Cometa OS plan", () => {
  assert.doesNotMatch(source.migration, /stripe|external_price_id|cometa_os/i);
});

const failed = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
console.log(JSON.stringify({
  checks_total: checks.length,
  checks_passed: checks.length - failed.length,
  failed_count: failed.length,
  all_checks_passed: failed.length === 0,
}));
if (failed.length) process.exitCode = 1;
