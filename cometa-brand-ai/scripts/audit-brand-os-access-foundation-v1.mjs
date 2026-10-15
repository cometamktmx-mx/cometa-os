import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const files = {
  migration: "supabase/migrations/20260815_brand_os_access_foundation_v1.sql",
  helper: "src/lib/brand-os/access.ts",
  dashboard: "src/app/api/brand-dashboard/route.ts",
  documentation: "docs/cometa-os-access-foundation-v1.md",
};
const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, read(file)])
);
const checks = [];
const check = (name, fn) => {
  try {
    fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({
      name,
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};

check("dedicated Cometa OS authority exists", () => {
  assert.match(source.migration, /CREATE TABLE public\.brand_os_access/);
  assert.match(source.helper, /from\("brand_os_access"\)/);
});
check("only stored active paused inactive states exist", () => {
  const statusCheck = source.migration.match(
    /CONSTRAINT brand_os_access_status_ck\s+CHECK \(status IN \(([^)]+)\)\)/s
  );
  assert.ok(statusCheck);
  assert.equal(statusCheck[1].replace(/\s+/g, " ").trim(), "'active', 'paused', 'inactive'");
});
check("status has no default", () => {
  assert.match(source.migration, /status text NOT NULL,/);
  assert.doesNotMatch(source.migration, /status text NOT NULL\s+DEFAULT/i);
});
check("no seed or inferred backfill", () => {
  assert.doesNotMatch(source.migration, /INSERT\s+INTO\s+public\.brand_os_access/i);
  assert.doesNotMatch(source.migration, /clients|brand_analysis|cosmos_memory|sales_|mercury|user_brand_access|pos_/i);
});
check("RLS and browser table privileges are denied", () => {
  assert.match(source.migration, /ALTER TABLE public\.brand_os_access ENABLE ROW LEVEL SECURITY/);
  assert.match(source.migration, /REVOKE ALL ON TABLE public\.brand_os_access FROM PUBLIC, anon, authenticated/);
  assert.match(source.migration, /GRANT ALL ON TABLE public\.brand_os_access TO service_role/);
  assert.doesNotMatch(source.migration, /CREATE POLICY/i);
});
check("dedicated updated_at trigger is installed", () => {
  assert.match(source.migration, /CREATE FUNCTION public\.brand_os_access_set_updated_at\(\)/);
  assert.match(source.migration, /CREATE TRIGGER brand_os_access_updated_at/);
  assert.match(source.migration, /clock_timestamp\(\)/);
});
check("helper returns not_configured only for no row", () => {
  assert.match(source.helper, /status: "not_configured"/);
  assert.match(source.helper, /if \(!data\)/);
  assert.match(source.helper, /configured: false/);
});
check("helper does not infer from membership or POS", () => {
  assert.doesNotMatch(source.helper, /user_brand_access|pos_subscriptions|pos_entitlements|requirePosContext|from\("clients"\)|brand_analysis|cosmos_memory/);
});
check("future product resolution keeps membership distinct", () => {
  assert.match(source.helper, /membershipActive/);
  assert.match(source.helper, /isPlatformAdmin/);
  assert.match(source.helper, /platform_admin_bypass/);
  assert.doesNotMatch(source.helper, /role:\s*"owner"/);
  assert.doesNotMatch(source.helper, /from\("pos_/);
});
check("foundation remains independent from later application enforcement", () => {
  assert.doesNotMatch(
    `${source.migration}\n${source.helper}`,
    /brand-dashboard|requireBrandOsAccess|requirePosContext|pos_subscriptions|pos_entitlements/i
  );
});
check("routing and Brand Home remain untouched", () => {
  assert.ok(!existsSync(join(root, "src/app/brand/[brandSlug]/os/page.tsx")));
});
check("no Stripe or billing implementation", () => {
  assert.doesNotMatch(`${source.migration}\n${source.helper}`, /stripe|billing|invoice|checkout/i);
});
check("documentation records product separation", () => {
  assert.match(source.documentation, /Membership does not imply Cometa OS access/i);
  assert.match(source.documentation, /not_configured/);
  assert.match(source.documentation, /platform-admin/i);
});

const failed = checks.filter((check) => !check.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
}
console.log(JSON.stringify({
  checks_total: checks.length,
  checks_passed: checks.length - failed.length,
  failed_count: failed.length,
  all_checks_passed: failed.length === 0,
}));
if (failed.length) process.exitCode = 1;
