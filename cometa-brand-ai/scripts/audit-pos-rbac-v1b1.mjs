import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const files = {
  migration: "supabase/migrations/20260815_pos_rbac_v1b_invitation_decline.sql",
  postflight: "supabase/tests/pos_rbac_v1b_postflight.sql",
  suite: "supabase/tests/pos_rbac_v1b_suite.sql",
  email: "src/lib/pos/invitation-email.ts",
  creationApi: "src/app/api/pos/team/invitations/route.ts",
  inviteApi: "src/app/api/pos/invitations/route.ts",
  confirm: "src/app/auth/confirm/route.ts",
  invitePage: "src/app/invite/page.tsx",
  docs: "docs/cometa-pos-rbac-v1b1.md",
  authDocs: "docs/cometa-pos-auth-production-config.md",
  v1a: "supabase/migrations/20260814_pos_rbac_v1a_foundation.sql",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const checks = [];
const check = (name, fn) => {
  try {
    fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
};

check("user_brand_access remains the only membership authority", () => {
  assert.doesNotMatch(source.migration, /CREATE TABLE public\.(pos_users|brand_users|employees|memberships)/i);
  assert.match(source.inviteApi, /pos_accept_user_invitation_v1/);
});
check("decline RPC is database-side and service-role only", () => {
  assert.match(source.migration, /SECURITY DEFINER/);
  assert.match(source.migration, /SET search_path = public/);
  assert.match(source.migration, /REVOKE EXECUTE[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(source.migration, /GRANT EXECUTE[\s\S]*TO service_role/);
});
check("decline validates Auth email and pending state", () => {
  assert.match(source.migration, /FROM auth\.users/);
  assert.match(source.migration, /POS_INVITATION_EMAIL_MISMATCH/);
  assert.match(source.migration, /v_invitation\.status <> 'pending'/);
});
check("decline locks invitation seat scope", () => {
  assert.match(source.migration, /pg_advisory_xact_lock/);
  assert.match(source.migration, /FOR UPDATE/);
});
check("creation API uses operational access and team permission", () => {
  assert.match(source.creationApi, /requirePosOperationalAccess/);
  assert.match(source.creationApi, /entitlement:\s*"pos\.access"/);
  assert.match(source.creationApi, /requirePosPermission\(context, "pos\.team\.manage"\)/);
});
check("creation accepts only email and allowed initial role", () => {
  assert.match(source.creationApi, /email\?: unknown/);
  assert.match(source.creationApi, /role\?: unknown/);
  assert.match(source.creationApi, /"admin",[\s\S]*"manager",[\s\S]*"cashier",[\s\S]*"inventory"/);
  assert.doesNotMatch(source.creationApi, /"owner"\s*\]/);
});
check("reservation remains V1A server authority", () => {
  assert.match(source.creationApi, /pos_reserve_user_invitation_v1/);
  assert.match(source.creationApi, /POS_USER_LIMIT_REACHED/);
  assert.match(source.creationApi, /POS_INVITATION_ALREADY_PENDING/);
});
check("new users use server-side Supabase invite", () => {
  assert.match(source.creationApi, /auth\.admin\.inviteUserByEmail/);
  assert.match(source.creationApi, /redirectTo: new URL\("\/auth\/confirm", origin\)/);
});
check("existing Auth identities use stable conflict codes and Resend", () => {
  assert.match(source.creationApi, /code === "email_exists" \|\| code === "user_already_exists"/);
  assert.match(source.creationApi, /sendExistingAuthInvitationEmail/);
  assert.match(source.email, /https:\/\/api\.resend\.com\/emails/);
});
check("email helper is server-only in behavior and protects provider config", () => {
  assert.match(source.email, /typeof window !== "undefined"/);
  assert.match(source.email, /RESEND_API_KEY/);
  assert.match(source.email, /RESEND_FROM_EMAIL/);
  assert.match(source.email, /COMETA_APP_ORIGIN/);
  assert.doesNotMatch(source.email, /console\.log/);
});
check("delivery failure compensates reservation", () => {
  assert.match(source.creationApi, /compensateReservation/);
  assert.match(source.creationApi, /pos_revoke_user_invitation_v1/);
  assert.match(source.creationApi, /if \(reservation\)/);
});
check("invite list derives email from authenticated Auth user", () => {
  assert.match(source.inviteApi, /supabase\.auth\.getUser\(\)/);
  assert.match(source.inviteApi, /\.eq\("email", invitee\.email\)/);
  assert.match(source.inviteApi, /\.eq\("status", "pending"\)/);
});
check("acceptance and decline derive user identity server-side", () => {
  assert.match(source.inviteApi, /p_user_id: invitee\.userId/);
  assert.match(source.inviteApi, /p_email: invitee\.email/);
  assert.match(source.inviteApi, /pos_decline_user_invitation_v1/);
});
check("successful acceptance targets invited brand POS", () => {
  assert.match(source.invitePage, /\/brand\/\$\{encodeURIComponent\(brandSlug\)\}\/pos/);
  assert.doesNotMatch(source.invitePage, /onboarding\/business/);
});
check("invite page requires authentication", () => {
  assert.match(source.invitePage, /supabase\.auth\.getUser\(\)/);
  assert.match(source.invitePage, /\/login\?next=%2Finvite/);
});
check("password setup depends on authenticated invite state, not query input", () => {
  assert.match(source.invitePage, /requiresPasswordSetup/);
  assert.match(source.invitePage, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.doesNotMatch(source.invitePage, /setPassword=1/);
});
check("confirm supports only email and invite token-hash flows", () => {
  assert.match(source.confirm, /requestedType === "email" \|\| requestedType === "invite"/);
  assert.match(source.confirm, /safeInviteNext/);
  assert.match(source.confirm, /return "\/onboarding\/business"/);
});
check("Supabase invite template and redirects are documented", () => {
  assert.match(source.authDocs, /type=invite/);
  assert.match(source.authDocs, /next=\/invite/);
  assert.match(source.authDocs, /http:\/\/localhost:3000\/invite/);
  assert.match(source.authDocs, /https:\/\/app\.cometaos\.com\/invite/);
});
check("postflight and suite cover decline security", () => {
  assert.match(source.postflight, /service role execute granted/);
  assert.match(source.postflight, /PUBLIC execute denied/);
  assert.match(source.suite, /wrong email cannot decline/);
  assert.match(source.suite, /revoked invite releases seat/);
  assert.match(source.suite, /SUMMARY all_checks_passed/);
});
check("V1B.1 invitation/auth foundation remains scoped while Team UI is a later V1B.2 concern", () => {
  // Team UI is authorized in RBAC V1B.2. This audit continues to verify only
  // the invitation/auth foundation and must not make the completed next phase fail.
  assert.doesNotMatch(source.migration, /stripe|billing/i);
  for (const route of ["products", "inventory", "sales", "cash-sessions", "customers", "reports"]) {
    assert.doesNotMatch(read(`src/app/api/pos/${route}/route.ts`), /requirePosPermission/);
  }
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
