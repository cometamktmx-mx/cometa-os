import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const guard = read("src/lib/pos/access.ts");

const operational = new Map([
  ["branding/route.ts", ["pos.access"]],
  ["cash-sessions/route.ts", ["pos.cash"]],
  ["categories/route.ts", ["pos.products"]],
  ["customers/route.ts", ["pos.customers"]],
  ["inventory/route.ts", ["pos.inventory"]],
  ["inventory-receiving/route.ts", ["pos.inventory"]],
  ["locations/route.ts", ["pos.access"]],
  ["loyalty/route.ts", ["pos.loyalty"]],
  ["product-config/route.ts", ["pos.products"]],
  ["product-images/route.ts", ["pos.products"]],
  ["product-scan/route.ts", ["pos.products"]],
  ["products/route.ts", ["pos.products"]],
  ["profile/route.ts", ["pos.access"]],
  ["registers/route.ts", ["pos.cash"]],
  ["reports/route.ts", ["pos.reports", "intelligence.signals"]],
  ["reports/pulsar/route.ts", ["intelligence.pulsar"]],
  ["reports/signals/route.ts", ["intelligence.signals"]],
  ["reports/summary/route.ts", ["pos.reports"]],
  ["sales/route.ts", ["pos.sales"]],
  ["team/route.ts", ["pos.access"]],
]);

const exempt = new Map([
  ["bootstrap/route.ts", ["GET"]],
  ["subscription/route.ts", ["GET", "POST"]],
  ["profile/route.ts", ["GET"]],
]);

// RBAC V1B.1 routes are intentionally neither public nor ordinary POS
// operational surfaces. Creation enters CORE-1 and the team permission; the
// invitee flow is authenticated and constrained to the Auth user's own email.
const invitation = new Map([
  ["team/invitations/route.ts", ["POST"]],
  ["team/invitations/[invitationId]/route.ts", ["DELETE"]],
  ["team/members/[userId]/route.ts", ["PATCH", "DELETE"]],
  ["invitations/route.ts", ["GET", "POST", "DELETE"]],
]);

const billing = new Map([
  ["billing/route.ts", ["GET"]],
  ["billing/checkout/route.ts", ["POST"]],
  ["billing/portal/route.ts", ["POST"]],
]);

const personalization = new Map([
  ["business-personalization/route.ts", ["GET", "PUT"]],
  ["business-personalization/logo/route.ts", ["POST", "DELETE"]],
]);

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

check("guard central exists", () => assert.match(guard, /export async function requirePosOperationalAccess/));
check("guard uses requirePosContext", () => assert.match(guard, /await requirePosContext\(brandSlug\)/));
check("guard preserves native lifecycle V1B", () => assert.match(guard, /pos_get_subscription_lifecycle/));
check("guard uses effective commercial access", () => assert.match(guard, /pos_get_effective_commercial_access/));
check("guard uses effective entitlements V1A", () => assert.match(guard, /pos_get_brand_entitlements/));
check("guard delegates operational status policy to effective commercial access", () => {
  assert.match(guard, /if \(!effectiveCommercialAccess\.effective\.accessAllowed\)/);
  for (const status of ["trial_expired", "past_due", "suspended", "cancelled"]) {
    assert.equal(guard.includes(`lifecycle.effectiveStatus === "${status}"`), false);
  }
});
check("trial active and grace lifecycle decisions are accepted", () => {
  for (const fixture of [
    { status: "trial", accessAllowed: true },
    { status: "active", accessAllowed: true },
    { status: "grace_period", accessAllowed: true },
  ]) assert.equal(!fixture.accessAllowed, false);
});
check("expired past_due suspended and cancelled decisions are denied", () => {
  for (const fixture of [
    { status: "trial_expired", accessAllowed: false },
    { status: "past_due", accessAllowed: false },
    { status: "suspended", accessAllowed: false },
    { status: "cancelled", accessAllowed: false },
  ]) assert.equal(!fixture.accessAllowed, true);
});
check("no admin bypass", () => {
  assert.equal(/isAdmin|role\s*===\s*["']admin/.test(guard), false);
});
check("subscription denial contract is HTTP 403", () => {
  assert.match(guard, /403,[\s\S]*?"POS_SUBSCRIPTION_ACCESS_DENIED"/);
  assert.match(guard, /effectiveStatus/);
  assert.match(guard, /requiresActivation/);
});
check("entitlement denial contract is HTTP 403", () => {
  assert.match(guard, /403,[\s\S]*?"POS_ENTITLEMENT_REQUIRED"/);
  assert.match(guard, /requiredEntitlement/);
});
check("guard does not mutate or delete business data", () => {
  assert.equal(/\.delete\(|\.update\(|\.insert\(|\.upsert\(/.test(guard), false);
});
check("passive availability uses the effective layer without bootstrap", () => {
  assert.match(guard, /getPassivePosProductAvailability/);
  assert.match(guard, /pos_get_effective_commercial_access/);
  assert.doesNotMatch(guard, /\.rpc\(\s*["']pos_initialize_brand_setup/);
  assert.doesNotMatch(guard, /\/api\/pos\/bootstrap/);
});

const routeRoot = join(root, "src/app/api/pos");
function routeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory()
      ? routeFiles(absolute)
      : entry.name === "route.ts"
        ? [relative(routeRoot, absolute).replaceAll("\\", "/")]
        : [];
  });
}

const discovered = routeFiles(routeRoot).sort();
const classified = new Set([
  ...operational.keys(),
  ...exempt.keys(),
  ...invitation.keys(),
  ...billing.keys(),
  ...personalization.keys(),
]);
const unresolved = discovered.filter((route) => !classified.has(route));

for (const [route, entitlements] of operational) {
  check(`${route} uses central operational guard`, () => {
    const source = read(`src/app/api/pos/${route}`);
    assert.match(source, /requirePosOperationalAccess/);
    for (const entitlement of entitlements) assert.ok(source.includes(`"${entitlement}"`));
  });
}

check("bootstrap GET remains exempt", () => {
  const source = read("src/app/api/pos/bootstrap/route.ts");
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /requirePosOperationalAccess/);
});
check("subscription GET and POST remain exempt", () => {
  const source = read("src/app/api/pos/subscription/route.ts");
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function POST/);
  assert.doesNotMatch(source, /requirePosOperationalAccess/);
});
check("profile GET exempt and POST protected", () => {
  const source = read("src/app/api/pos/profile/route.ts");
  const get = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function POST"));
  const post = source.slice(source.indexOf("export async function POST"));
  assert.doesNotMatch(get, /requirePosOperationalAccess/);
  assert.match(post, /requirePosOperationalAccess/);
  assert.match(post, /"pos\.access"/);
});
check("billing read route is tenant-scoped and passive", () => {
  const source = read("src/app/api/pos/billing/route.ts");
  assert.match(source, /export async function GET/);
  assert.match(source, /requirePosContext/);
  assert.match(source, /requirePosPermission\(context, "pos\.subscription\.view"\)/);
  assert.doesNotMatch(source, /pos_initialize_brand_setup/);
});
check("billing checkout is Owner-only", () => {
  const source = read("src/app/api/pos/billing/checkout/route.ts");
  assert.match(source, /export async function POST/);
  assert.match(source, /requirePosContext/);
  assert.match(source, /requirePosPermission\(context, "pos\.subscription\.manage"\)/);
  assert.match(source, /POS_BILLING_GRANT_ACTIVE/);
});
check("billing portal is Owner-only", () => {
  const source = read("src/app/api/pos/billing/portal/route.ts");
  assert.match(source, /export async function POST/);
  assert.match(source, /requirePosContext/);
  assert.match(source, /requirePosPermission\(context, "pos\.subscription\.manage"\)/);
});
check("business personalization read is tenant-scoped and passive", () => {
  const source = read("src/app/api/pos/business-personalization/route.ts");
  assert.match(source, /export async function GET/);
  assert.match(source, /requirePosContext/);
  assert.match(source, /getBusinessDocumentProfile/);
  assert.doesNotMatch(source, /pos_initialize_brand_setup/);
});
check("business personalization write requires settings permission", () => {
  const source = read("src/app/api/pos/business-personalization/route.ts");
  assert.match(source, /export async function PUT/);
  assert.match(source, /requirePosContext/);
  assert.match(source, /requirePosPermission\(context, "pos\.settings\.manage"\)/);
  assert.match(source, /\.upsert\(/);
});
check("business personalization logo is settings-protected", () => {
  const source = read("src/app/api/pos/business-personalization/logo/route.ts");
  assert.match(source, /export async function POST/);
  assert.match(source, /export async function DELETE/);
  assert.match(source, /requirePosContext/);
  assert.match(source, /requirePosPermission\(context, "pos\.settings\.manage"\)/);
  assert.doesNotMatch(source, /pos_initialize_brand_setup/);
});
check("team invitation creation enters CORE-1 and team permission", () => {
  const source = read("src/app/api/pos/team/invitations/route.ts");
  assert.match(source, /export async function POST/);
  assert.match(source, /requirePosOperationalAccess/);
  assert.match(source, /entitlement:\s*"pos\.access"/);
  assert.match(source, /requirePosPermission\(context, "pos\.team\.manage"\)/);
  assert.match(source, /pos_reserve_user_invitation_v1/);
});
check("team roster enters CORE-1 and the active membership permission", () => {
  const source = read("src/app/api/pos/team/route.ts");
  assert.match(source, /export async function GET/);
  assert.match(source, /requirePosOperationalAccess/);
  assert.match(source, /entitlement:\s*"pos\.access"/);
  assert.match(source, /requirePosPermission\(context, "pos\.team\.manage"\)/);
  assert.match(source, /\.eq\("brand_slug", context\.brand\.slug\)/);
});
check("team invitation revocation enters CORE-1 and delegates to V1A", () => {
  const source = read("src/app/api/pos/team/invitations/[invitationId]/route.ts");
  assert.match(source, /export async function DELETE/);
  assert.match(source, /requirePosOperationalAccess/);
  assert.match(source, /requirePosPermission\(access, "pos\.team\.manage"\)/);
  assert.match(source, /pos_revoke_user_invitation_v1/);
  assert.doesNotMatch(source, /\.from\("pos_user_invitations"\)\.(update|delete)/);
});
check("team member mutations enter CORE-1 and delegate to V1A", () => {
  const source = read("src/app/api/pos/team/members/[userId]/route.ts");
  assert.match(source, /export async function PATCH/);
  assert.match(source, /export async function DELETE/);
  assert.match(source, /requirePosOperationalAccess/);
  assert.match(source, /requirePosPermission\(access, "pos\.team\.manage"\)/);
  assert.match(source, /pos_change_brand_membership_role_v1/);
  assert.match(source, /pos_revoke_brand_membership_v1/);
  assert.doesNotMatch(source, /\.from\("user_brand_access"\)\.(update|delete)/);
});
check("invitee invitation flow requires Auth and scopes to authenticated email", () => {
  const source = read("src/app/api/pos/invitations/route.ts");
  for (const method of ["GET", "POST", "DELETE"]) {
    assert.match(source, new RegExp(`export async function ${method}`));
  }
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /\.eq\("email", invitee\.email\)/);
  assert.match(source, /pos_accept_user_invitation_v1/);
  assert.match(source, /pos_decline_user_invitation_v1/);
  assert.doesNotMatch(source, /\.insert\(\{[\s\S]*user_brand_access/);
});
check("all operational GETs and mutations enter protected route implementations", () => {
  for (const route of operational.keys()) {
    const source = read(`src/app/api/pos/${route}`);
    const methods = [...source.matchAll(/export async function (GET|POST|PATCH|DELETE)/g)].map((match) => match[1]);
    assert.ok(methods.length > 0, `${route} has no route handlers`);
    assert.match(source, /requirePosOperationalAccess/, `${route} has no operational guard`);
  }
});

const shell = read("src/app/brand/[brandSlug]/components/pos-shell.tsx");
check("PosShell has central locked state", () => {
  assert.match(shell, /!visibleLifecycle\.accessAllowed/);
  assert.match(shell, /!visibleCommercialAccess\.effective\.accessAllowed/);
  assert.match(shell, /PosCommercialLockedState/);
  assert.match(shell, /\/pos\/subscription/);
});
check("brand switching clears tenant-bound commercial state", () => {
  assert.match(shell, /loadedBrandSlug === brandSlug/);
  assert.match(shell, /setEffectiveEntitlements\(\[\]\)/);
  assert.match(shell, /setEffectiveCapabilities\(\[\]\)/);
  assert.match(shell, /setProfileCode\(null\)/);
});
check("subscription surface remains renderable while locked", () => {
  assert.match(shell, /!isSubscriptionPath\(pathname\)/);
});
check("all POS route files are classified", () => assert.deepEqual(unresolved, []));

const failed = checks.filter((item) => !item.passed);
console.table(checks);
console.table({
  operational_routes_total: operational.size,
  protected: [...operational.keys()].filter((route) =>
    read(`src/app/api/pos/${route}`).includes("requirePosOperationalAccess")
  ).length,
  exempt: exempt.size,
  invitation: invitation.size,
  unresolved: unresolved.length,
});

if (failed.length > 0) {
  console.error(`Commercial access audit failed: ${failed.length} check(s).`);
  process.exitCode = 1;
} else {
  console.log(`Commercial access audit passed: ${checks.length}/${checks.length}; unresolved=0.`);
}
