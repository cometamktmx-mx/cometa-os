import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");
const files = {
  teamApi: "src/app/api/pos/team/route.ts",
  invitationCreate: "src/app/api/pos/team/invitations/route.ts",
  invitationRevoke: "src/app/api/pos/team/invitations/[invitationId]/route.ts",
  memberApi: "src/app/api/pos/team/members/[userId]/route.ts",
  teamPage: "src/app/brand/[brandSlug]/pos/team/page.tsx",
  sidebar: "src/app/brand/[brandSlug]/components/pos-sidebar.tsx",
  rbac: "src/lib/pos/rbac.ts",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
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

check("Team page and tenant-scoped GET exist", () => {
  assert.ok(existsSync(join(root, files.teamPage)));
  assert.match(source.teamApi, /export async function GET/);
  assert.match(source.teamApi, /getBrandSlugFromUrl/);
  assert.match(source.teamApi, /\.eq\("brand_slug", context\.brand\.slug\)/);
});
check("Team GET requires CORE-1 and pos.team.manage", () => {
  assert.match(source.teamApi, /requirePosOperationalAccess/);
  assert.match(source.teamApi, /entitlement:\s*"pos\.access"/);
  assert.match(source.teamApi, /requirePosPermission\(context, "pos\.team\.manage"\)/);
});
check("Team response has server-derived commercial seat usage", () => {
  assert.match(source.teamApi, /activeUsers: members\.length/);
  assert.match(source.teamApi, /pendingInvitations: invitations\.length/);
  assert.match(source.teamApi, /effectiveUsage/);
  assert.match(source.teamApi, /maxUsers: commercial\.limits\.users/);
  assert.match(source.teamApi, /availableSeats: Math\.max/);
  assert.match(source.teamApi, /\.eq\("status", "pending"\)/);
  assert.match(source.teamApi, /\.gt\("expires_at", now\)/);
});
check("Membership authority stays user_brand_access and profile lookup is server-side", () => {
  assert.match(source.teamApi, /\.from\("user_brand_access"\)/);
  assert.match(source.teamApi, /\.from\("user_profiles"\)/);
  assert.match(source.teamApi, /auth\.admin\.getUserById/);
  assert.doesNotMatch(source.teamApi, /auth\.admin\.listUsers/);
  assert.doesNotMatch(source.teamApi, /\.insert\(.*user_brand_access/s);
});
check("Invite creation reuses the V1B.1 delivery surface", () => {
  assert.match(source.teamPage, /\/api\/pos\/team\/invitations\?brandSlug=/);
  assert.match(source.invitationCreate, /pos_reserve_user_invitation_v1/);
  assert.match(source.invitationCreate, /requirePosPermission\(context, "pos\.team\.manage"\)/);
});
check("Invitation revocation uses the V1A RPC with server permissions", () => {
  assert.match(source.invitationRevoke, /requirePosOperationalAccess/);
  assert.match(source.invitationRevoke, /requirePosPermission\(access, "pos\.team\.manage"\)/);
  assert.match(source.invitationRevoke, /pos_revoke_user_invitation_v1/);
  assert.doesNotMatch(source.invitationRevoke, /\.from\("pos_user_invitations"\)\.(update|delete)/);
});
check("Member role changes and revocation use V1A RPCs", () => {
  assert.match(source.memberApi, /pos_change_brand_membership_role_v1/);
  assert.match(source.memberApi, /pos_revoke_brand_membership_v1/);
  assert.match(source.memberApi, /requirePosPermission\(access, "pos\.team\.manage"\)/);
  assert.doesNotMatch(source.memberApi, /\.from\("user_brand_access"\)\.(update|delete)/);
});
check("Owner and admin management boundaries stay distinct", () => {
  assert.match(source.teamApi, /OWNER_INVITE_ROLES/);
  assert.match(source.teamApi, /ADMIN_INVITE_ROLES/);
  assert.match(source.teamApi, /\["manager", "cashier", "inventory"\]/);
  assert.match(source.teamPage, /Convertir en propietario/);
  assert.doesNotMatch(source.teamPage, /<option[^>]*value="owner"/);
});
check("Last-owner and self-revocation UX preserve the DB invariant", () => {
  assert.match(source.teamApi, /activeOwnerCount/);
  assert.match(source.teamApi, /target\.access_role !== "owner" \|\| activeOwnerCount > 1/);
  assert.match(source.memberApi, /No puedes revocar tu propio acceso desde Equipo/);
  assert.match(source.teamPage, /Debe existir al menos un propietario activo/);
});
check("Legacy editor and viewer remain visible but are never invite roles", () => {
  assert.match(source.rbac, /editor/);
  assert.match(source.rbac, /viewer/);
  assert.match(source.teamPage, /Editor/);
  assert.match(source.teamPage, /Consulta/);
  assert.doesNotMatch(source.invitationCreate, /"editor"\s*,\s*"viewer"/);
});
check("Team sidebar entry is isolated to pos.team.manage", () => {
  assert.match(source.sidebar, /label: "Equipo"/);
  assert.match(source.sidebar, /requiresTeamPermission: true/);
  assert.match(source.sidebar, /permissions\.includes\("pos\.team\.manage"\)/);
  assert.match(source.sidebar, /!item\.requiresTeamPermission \|\| canManageTeam/);
});
check("Team page handles forbidden, loading, empty, and mobile-safe states", () => {
  assert.match(source.teamPage, /No tienes permiso para administrar el equipo/);
  assert.match(source.teamPage, /TeamSkeleton/);
  assert.match(source.teamPage, /Tu equipo empieza aquí/);
  assert.match(source.teamPage, /sm:flex-row/);
});
check("V1B.2 adds no V1C mass enforcement or billing", () => {
  assert.doesNotMatch(source.teamApi, /stripe|billing/i);
  assert.doesNotMatch(source.memberApi, /stripe|billing/i);
  for (const route of ["products", "inventory", "sales", "cash-sessions", "customers", "reports"]) {
    assert.doesNotMatch(read(`src/app/api/pos/${route}/route.ts`), /requirePosPermission/);
  }
  assert.equal(existsSync(join(root, "supabase/migrations/20260815_pos_rbac_v1b2.sql")), false);
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
