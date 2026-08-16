import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const files = {
  posShell: "src/app/brand/[brandSlug]/components/pos-shell.tsx",
  guard: "src/lib/brand-os/server.ts",
  access: "src/lib/brand-os/access.ts",
  dashboard: "src/app/api/brand-dashboard/route.ts",
  rootPage: "src/app/brand/[brandSlug]/page.tsx",
  documentation: "docs/cometa-os-access-guard-v1.md",
};
const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, read(file)])
);
const checks = [];

function check(name, fn) {
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
}

check("PosShell no longer consumes Brand Dashboard", () => {
  assert.doesNotMatch(source.posShell, /\/api\/brand-dashboard/);
  assert.match(source.posShell, /\/api\/pos\/bootstrap\?brandSlug=/);
  assert.doesNotMatch(source.posShell, /\/api\/pos\/subscription\?brandSlug=/);
  assert.doesNotMatch(source.posShell, /\/api\/pos\/profile\?brandSlug=/);
  assert.match(source.posShell, /data\.brand\.id/);
  assert.match(source.posShell, /data\.user\.userId/);
});

check("OS guard uses canonical brand, membership, and dedicated OS access", () => {
  assert.match(source.guard, /\.from\("brands"\)/);
  assert.match(source.guard, /\.from\("user_brand_access"\)/);
  assert.match(source.guard, /\.eq\("status", "active"\)/);
  assert.match(source.guard, /getBrandOsAccess\(admin, brand\.slug\)/);
  assert.match(source.guard, /resolveBrandOsProductAccess/);
  assert.doesNotMatch(source.guard, /resolveBrandFromSupabase/);
});

check("missing OS access resolves as not_configured rather than legacy active", () => {
  assert.match(source.access, /status: "not_configured"/);
  assert.match(source.guard, /BRAND_OS_ACCESS_NOT_CONFIGURED/);
  assert.match(source.guard, /osAccess\.status/);
});

check("normal members require active membership and active OS product access", () => {
  assert.match(source.guard, /if \(!isPlatformAdmin && !membershipActive\)/);
  assert.match(source.guard, /BRAND_OS_MEMBERSHIP_REQUIRED/);
  assert.match(source.guard, /if \(!productAccess\.effectiveAccessAllowed\)/);
  assert.match(source.guard, /BRAND_OS_ACCESS_PAUSED/);
  assert.match(source.guard, /BRAND_OS_ACCESS_INACTIVE/);
});

check("platform admin bypass is explicit and does not synthesize tenant access", () => {
  assert.match(source.guard, /\.from\("user_profiles"\)/);
  assert.match(source.guard, /data\?\.role === "admin" && data\.status === "active"/);
  assert.match(source.guard, /bypassUsed:/);
  assert.match(source.guard, /platform_admin_bypass/);
  assert.doesNotMatch(source.guard, /\.insert\([^)]*user_brand_access/s);
  assert.doesNotMatch(source.guard, /\.insert\([^)]*brand_os_access/s);
});

check("guard stays separate from POS authority", () => {
  assert.doesNotMatch(source.guard, /requirePosContext|pos_subscriptions|pos_entitlements|pos_plans/);
  assert.doesNotMatch(source.dashboard, /requirePosContext|pos_subscriptions|pos_entitlements|pos_plans/);
});

check("Brand Dashboard calls the guard before OS data queries", () => {
  assert.match(source.dashboard, /requireBrandOsAccess\(requestedBrandSlug\)/);
  const guardIndex = source.dashboard.indexOf("requireBrandOsAccess(requestedBrandSlug)");
  const dataIndex = source.dashboard.indexOf("const [");
  assert.ok(guardIndex >= 0 && dataIndex >= 0 && guardIndex < dataIndex);
  assert.match(source.dashboard, /error instanceof BrandOsGuardError/);
});

check("Brand Dashboard uses only a caller-provided canonical slug", () => {
  assert.doesNotMatch(source.dashboard, /mar-cosmetic/);
  assert.doesNotMatch(source.dashboard, /requestedBrandName/);
  assert.doesNotMatch(source.dashboard, /resolveBrandFromSupabase/);
  assert.match(source.dashboard, /BRAND_OS_BRAND_REQUIRED/);
  assert.match(source.guard, /BRAND_NOT_FOUND/);
});

check("dashboard contract preserves user and canonical brand fields", () => {
  assert.match(source.dashboard, /allowedBrandSlugs: osContext\.activeBrandSlugs/);
  assert.match(source.dashboard, /brandSource: "brands"/);
  assert.match(source.dashboard, /brandExists: true/);
});

check("routing and the current OS visual page remain unmoved", () => {
  assert.equal(
    existsSync(join(root, "src/app/brand/[brandSlug]/os/page.tsx")),
    false
  );
  assert.match(source.rootPage, /BrandHomePage/);
  assert.doesNotMatch(source.rootPage, /requireBrandOsAccess/);
});

check("external OS surfaces are not claimed as protected in this phase", () => {
  for (const file of [
    "src/app/mercury-hub/page.tsx",
    "src/app/sales-ai/knowledge/page.tsx",
    "src/app/sales-ai/inbox/page.tsx",
    "src/app/sales-ai/agent-settings/page.tsx",
    "src/app/sales-ai/learning/page.tsx",
    "src/app/cometa-os/design/page.tsx",
  ]) {
    assert.doesNotMatch(read(file), /requireBrandOsAccess/);
  }
  assert.match(source.documentation, /no protege todavía Mercury, Sales AI/i);
});

check("Phase A adds no routing move, Stripe, billing, or OS plans", () => {
  const phaseSource = `${source.posShell}\n${source.guard}\n${source.dashboard}`;
  assert.doesNotMatch(phaseSource, /stripe|billing|invoice|checkout/i);
  assert.doesNotMatch(phaseSource, /brand_os_plans|os_plan|os_seat/i);
});

const failed = checks.filter((item) => !item.passed);
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
