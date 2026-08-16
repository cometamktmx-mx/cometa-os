import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const source = {
  migration: read("supabase/migrations/20260816_pos_commercial_grants_v1.sql"),
  lifecycle: read("src/lib/pos/lifecycle.ts"),
  access: read("src/lib/pos/access.ts"),
  bootstrap: read("src/app/api/pos/bootstrap/route.ts"),
  shell: read("src/app/brand/[brandSlug]/components/pos-shell.tsx"),
  locations: read("src/app/api/pos/locations/route.ts"),
  registers: read("src/app/api/pos/registers/route.ts"),
  products: read("src/app/api/pos/products/route.ts"),
  inventoryReceiving: read("src/app/api/pos/inventory-receiving/route.ts"),
  team: read("src/app/api/pos/team/route.ts"),
  rbacFoundation: read("supabase/migrations/20260814_pos_rbac_v1a_foundation.sql"),
};

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

check("dedicated commercial grant authority exists", () => {
  assert.match(source.migration, /CREATE TABLE public\.pos_commercial_grants/);
  assert.match(source.migration, /brand_slug text NOT NULL[\s\S]*REFERENCES public\.brands\(slug\)/);
  assert.match(source.migration, /plan_code text NOT NULL[\s\S]*REFERENCES public\.pos_plans\(code\)/);
});
check("grant type is complimentary only and no Free plan exists", () => {
  assert.match(source.migration, /grant_type = 'complimentary'/);
  assert.doesNotMatch(source.migration, /free plan|plan_free|\('free'/i);
});
check("grant status is active or revoked with derived expiration", () => {
  assert.match(source.migration, /status IN \('active', 'revoked'\)/);
  assert.match(source.migration, /starts_at <= now\(\)[\s\S]*ends_at > now\(\)/);
  assert.doesNotMatch(source.migration, /status IN \([^)]*expired/i);
});
check("foundation has no grant seed or agency auto eligibility", () => {
  assert.doesNotMatch(source.migration, /INSERT INTO public\.pos_commercial_grants/);
  assert.doesNotMatch(source.migration, /COMETA-AGENCY|agency eligibility|honorarios/i);
});
check("grant economic fields are protected and revocation is soft", () => {
  assert.match(source.migration, /pos_commercial_grants_protect_economics_v1/);
  assert.match(source.migration, /POS_COMMERCIAL_GRANT_IMMUTABLE/);
  assert.match(source.migration, /NEW\.status <> 'revoked'/);
  assert.doesNotMatch(source.migration, /GRANT[\s\S]*DELETE[\s\S]*pos_commercial_grants/);
});
check("overlap protection is DB-side and race-safe without an extension", () => {
  assert.match(source.migration, /pos_commercial_grants_reject_overlap_v1/);
  assert.match(source.migration, /pg_advisory_xact_lock/);
  assert.match(source.migration, /POS_COMMERCIAL_GRANT_OVERLAP/);
  assert.doesNotMatch(source.migration, /CREATE EXTENSION/);
});
check("grant table uses RLS with server-only table privileges", () => {
  assert.match(source.migration, /ALTER TABLE public\.pos_commercial_grants ENABLE ROW LEVEL SECURITY/);
  assert.match(source.migration, /REVOKE ALL ON TABLE public\.pos_commercial_grants[\s\S]*PUBLIC, anon, authenticated/);
  assert.match(source.migration, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.pos_commercial_grants[\s\S]*TO service_role/);
  assert.doesNotMatch(source.migration, /CREATE POLICY[\s\S]*pos_commercial_grants/);
});
check("native lifecycle remains a distinct authority", () => {
  assert.doesNotMatch(source.migration, /CREATE OR REPLACE FUNCTION public\.pos_compute_subscription_lifecycle/);
  assert.match(source.migration, /public\.pos_compute_subscription_lifecycle\(v_slug\)/);
  assert.match(source.lifecycle, /SubscriptionLifecycle/);
});
check("effective access is centralized and typed", () => {
  assert.match(source.migration, /CREATE FUNCTION public\.pos_get_effective_commercial_access/);
  assert.match(source.migration, /SECURITY DEFINER[\s\S]*SET search_path = public/);
  assert.match(source.lifecycle, /EffectiveCommercialAccess/);
  assert.match(source.access, /pos_get_effective_commercial_access/);
});
check("effective plan comparison uses catalog limits and entitlements", () => {
  assert.match(source.migration, /CREATE FUNCTION public\.pos_plan_dominates_v1/);
  assert.match(source.migration, /public\.pos_plan_limits/);
  assert.match(source.migration, /public\.pos_plan_entitlements/);
  assert.doesNotMatch(source.migration, /start\s*<\s*pro\s*<\s*multi/i);
});
check("inactive grant plans fail closed", () => {
  assert.match(source.migration, /WHERE code = v_grant\.plan_code[\s\S]*AND active/);
  assert.match(source.migration, /COMMERCIAL_GRANT_PLAN_INACTIVE/);
});
check("effective entitlements continue through the existing engine", () => {
  assert.match(source.migration, /CREATE OR REPLACE FUNCTION public\.pos_get_brand_entitlements/);
  assert.match(source.migration, /commercial_access := public\.pos_get_effective_commercial_access/);
  assert.match(source.migration, /WHERE pe\.plan_code = effective_plan_code/);
  assert.match(source.migration, /pos_brand_entitlement_overrides/);
});
check("CORE-1 gates on effective access and preserves native diagnostics", () => {
  assert.match(source.access, /pos_get_subscription_lifecycle/);
  assert.match(source.access, /pos_get_effective_commercial_access/);
  assert.match(source.access, /if \(!effectiveCommercialAccess\.effective\.accessAllowed\)/);
  assert.match(source.access, /POS_SUBSCRIPTION_ACCESS_DENIED/);
});
check("passive availability is read-only and uses the effective layer", () => {
  assert.match(source.access, /getPassivePosProductAvailability/);
  assert.match(source.access, /pos_get_effective_commercial_access/);
  assert.doesNotMatch(source.access, /\.rpc\(\s*["']pos_initialize_brand_setup/);
  assert.doesNotMatch(source.access, /\/api\/pos\/bootstrap/);
});
check("bootstrap keeps raw and effective commercial state distinct", () => {
  assert.match(source.bootstrap, /pos_get_subscription_lifecycle/);
  assert.match(source.bootstrap, /pos_get_effective_commercial_access/);
  assert.match(source.bootstrap, /effectiveCommercialAccess,/);
  assert.match(source.bootstrap, /subscriptionPlanResult/);
  assert.match(source.bootstrap, /effectivePlanResult/);
});
check("PosShell locks on effective commercial access", () => {
  assert.match(source.shell, /isEffectiveCommercialAccess/);
  assert.match(source.shell, /commercialAccessBlocked/);
  assert.match(source.shell, /!visibleCommercialAccess\.effective\.accessAllowed/);
  assert.match(source.shell, /accessSource === "commercial_grant"/);
});
check("authorized limit routes consume effective plans instead of raw subscriptions", () => {
  for (const [name, file] of Object.entries({
    locations: source.locations,
    registers: source.registers,
    team: source.team,
  })) {
    assert.match(file, /requirePosOperationalAccess/, `${name} lacks CORE-1`);
    assert.match(file, /effectiveCommercialAccess/, `${name} lacks effective access`);
    assert.doesNotMatch(file, /ALLOWED_SUBSCRIPTION_STATUSES/, `${name} retains a native status bypass`);
  }

  for (const [name, file] of Object.entries({
    products: source.products,
    inventoryReceiving: source.inventoryReceiving,
  })) {
    assert.match(file, /requirePosOperationalAccess/, `${name} lacks CORE-1`);
    assert.doesNotMatch(file, /ALLOWED_SUBSCRIPTION_STATUSES/, `${name} retains a native status bypass`);
    assert.doesNotMatch(file, /from\("pos_subscriptions"\)/, `${name} retains a raw subscription bypass`);
  }
});
check("seat RPCs use the effective plan without changing RBAC authority", () => {
  assert.match(source.migration, /CREATE OR REPLACE FUNCTION public\.pos_reserve_user_invitation_v1/);
  assert.match(source.migration, /CREATE OR REPLACE FUNCTION public\.pos_accept_user_invitation_v1/);
  assert.match(source.migration, /v_commercial_access := public\.pos_get_effective_commercial_access/);
  assert.match(source.migration, /POS_USER_LIMIT_REACHED/);
  assert.match(source.rbacFoundation, /POS_LAST_OWNER_REQUIRED/);
});
check("no subscription billing truth is mutated by the grant migration", () => {
  assert.doesNotMatch(source.migration, /UPDATE public\.pos_subscriptions/);
  assert.doesNotMatch(source.migration, /trial_ends_at\s*=/);
  assert.doesNotMatch(source.migration, /stripe|coupon|checkout/i);
});
check("no public grant UI or self-service endpoint is introduced", () => {
  assert.doesNotMatch(source.migration, /inviteUserByEmail|resend/i);
  assert.doesNotMatch(source.access, /grantCode|grant_code/);
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

if (failed.length > 0) {
  process.exitCode = 1;
}
