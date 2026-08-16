import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const files = {
  rootPage: "src/app/brand/[brandSlug]/page.tsx",
  commandCenter: "src/app/brand/[brandSlug]/components/brand-command-center.tsx",
  header: "src/app/brand/[brandSlug]/components/brand-command-header.tsx",
  core: "src/app/brand/[brandSlug]/components/ecosystem-core.tsx",
  productCard: "src/app/brand/[brandSlug]/components/product-card.tsx",
  ecosystemStatus: "src/app/brand/[brandSlug]/components/ecosystem-status.tsx",
  posAccess: "src/lib/pos/access.ts",
  osPage: "src/app/brand/[brandSlug]/os/page.tsx",
  posPage: "src/app/brand/[brandSlug]/pos/page.tsx",
  documentation: "docs/cometa-brand-command-center-v1.md",
};
const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, read(file)])
);
const passivePosResolverSource = source.posAccess
  .split("export async function getPassivePosProductAvailability")[1]
  ?.split("export async function requirePosOperationalAccess")[0];
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

check("root remains a brand-level server surface", () => {
  assert.match(source.rootPage, /requireBrandAccess\(brandSlug\)/);
  assert.match(source.rootPage, /getPassivePosProductAvailability/);
  assert.match(source.rootPage, /BrandCommandCenter/);
  assert.doesNotMatch(source.rootPage, /requireBrandOsAccess\(brandSlug\)/);
  assert.doesNotMatch(source.rootPage, /\/api\/brand-dashboard/);
});

check("Command Center components are present and composed", () => {
  for (const file of [
    files.commandCenter,
    files.header,
    files.core,
    files.productCard,
    files.ecosystemStatus,
  ]) {
    assert.ok(existsSync(join(root, file)), `${file} must exist`);
  }
  assert.match(source.commandCenter, /BrandCommandHeader/);
  assert.match(source.commandCenter, /EcosystemCore/);
  assert.match(source.commandCenter, /ProductCard/);
  assert.match(source.commandCenter, /EcosystemStatus/);
});

check("OS state comes from the dedicated OS access authority", () => {
  assert.match(source.rootPage, /osStatus=\{access\.osAccess\.status\}/);
  assert.match(source.commandCenter, /"active" \| "paused" \| "inactive" \| "not_configured"/);
  assert.match(source.commandCenter, /getOsStatusLabel/);
  assert.doesNotMatch(source.commandCenter, /pos_subscriptions|pos_entitlements|pos_plans/);
});

check("POS availability is resolved passively from persisted commercial authority", () => {
  assert.ok(passivePosResolverSource, "Passive POS resolver must be isolated for audit");
  assert.match(source.posAccess, /export async function getPassivePosProductAvailability/);
  assert.match(passivePosResolverSource, /from\("pos_subscriptions"\)/);
  assert.match(passivePosResolverSource, /pos_get_subscription_lifecycle/);
  assert.match(passivePosResolverSource, /pos_get_brand_entitlements/);
  assert.match(passivePosResolverSource, /lifecycle\.accessAllowed/);
  assert.match(passivePosResolverSource, /hasEntitlement\(effectiveEntitlements, "pos\.access"\)/);
  assert.doesNotMatch(passivePosResolverSource, /pos_initialize_brand_setup|\/api\/pos\/bootstrap|\/api\/pos\/subscription/);
});

check("subscription existence alone cannot activate POS", () => {
  assert.match(passivePosResolverSource, /if \(!lifecycle\.accessAllowed\)/);
  assert.match(passivePosResolverSource, /if \(!hasEntitlement\(effectiveEntitlements, "pos\.access"\)\)/);
  assert.match(passivePosResolverSource, /state: "preparation"/);
  assert.match(passivePosResolverSource, /state: "unavailable"/);
});

check("POS states and customer CTAs fail closed", () => {
  assert.match(source.posAccess, /"active" \| "preparation" \| "unavailable"/);
  assert.match(source.commandCenter, /if \(state === "active"\)[\s\S]*primary:/);
  assert.match(source.commandCenter, /if \(state === "preparation"\)[\s\S]*unavailableCopy:/);
  assert.match(source.commandCenter, /No disponible/);
  assert.match(source.core, /posState/);
  assert.match(source.ecosystemStatus, /posState/);
});

check("root never calls POS bootstrap or initializes POS", () => {
  const commandSource = `${source.rootPage}\n${source.commandCenter}\n${passivePosResolverSource}`;
  assert.doesNotMatch(commandSource, /\/api\/pos\/bootstrap|pos_initialize_brand_setup|\/api\/pos\/subscription/);
  assert.doesNotMatch(source.rootPage, /fetch\(/);
});

check("platform admin does not fabricate POS active state", () => {
  assert.match(source.commandCenter, /const internalPosAction[\s\S]*isPlatformAdmin/);
  assert.match(source.commandCenter, /!posAvailability\.available/);
  assert.match(source.commandCenter, /Abrir entorno POS/);
  assert.match(source.commandCenter, /getPosStatusLabel\(posAvailability\.state\)/);
});

check("Command Center contains no operating or business metrics", () => {
  const commandSource = `${source.rootPage}\n${source.commandCenter}\n${source.core}\n${source.ecosystemStatus}`;
  assert.doesNotMatch(commandSource, /readiness|knowledge\s*%|tickets|ventas de hoy|sucursales|usuarios/i);
  assert.doesNotMatch(commandSource, /report|inventoryWithStock|cash_sessions|sales_leads/i);
});

check("existing OS and POS routes are preserved", () => {
  assert.ok(existsSync(join(root, files.osPage)));
  assert.ok(existsSync(join(root, files.posPage)));
  assert.match(source.osPage, /requireBrandOsAccess/);
  assert.match(source.posPage, /usePosContext/);
});

check("Phase V1.1 adds no grants, Stripe, Billing, or RBAC V1C work", () => {
  const commandSource = [
    source.rootPage,
    source.commandCenter,
    source.header,
    source.core,
    source.productCard,
    source.ecosystemStatus,
    source.posAccess,
  ].join("\n");
  assert.doesNotMatch(commandSource, /commercialGrant|requireCommercialGrant|grantAccess/);
  assert.doesNotMatch(commandSource, /stripe|billing|invoice|checkout/i);
  assert.doesNotMatch(commandSource, /requirePosPermission|POS_PERMISSION_REQUIRED|RBAC V1C/);
});

check("documentation records passive POS product availability semantics", () => {
  assert.match(source.documentation, /Cometa Brand Command Center/i);
  assert.match(source.documentation, /passive product availability/i);
  assert.match(source.documentation, /pos\.access/i);
  assert.match(source.documentation, /preparaci/i);
  assert.match(source.documentation, /No disponible/i);
  assert.match(source.documentation, /brand_os_access/i);
});

const failed = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
}
console.log(
  JSON.stringify({
    checks_total: checks.length,
    checks_passed: checks.length - failed.length,
    failed_count: failed.length,
    all_checks_passed: failed.length === 0,
  })
);

if (failed.length) process.exitCode = 1;
