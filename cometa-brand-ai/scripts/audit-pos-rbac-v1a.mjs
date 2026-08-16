import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root,file),"utf8");
const files = {
  migration:"supabase/migrations/20260814_pos_rbac_v1a_foundation.sql",
  rbac:"src/lib/pos/rbac.ts",
  server:"src/lib/pos/server.ts",
  bootstrap:"src/app/api/pos/bootstrap/route.ts",
  access:"src/lib/pos/access.ts",
  entry:"supabase/migrations/20260814_entry_v1b_self_service_business_creation.sql",
};
const source=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,read(file)]));
const checks=[];
const check=(name,fn)=>{try{fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,detail:error instanceof Error?error.message:String(error)});}};

check("user_brand_access remains membership authority",()=>{
  assert.match(source.server,/from\("user_brand_access"\)/);
  assert.doesNotMatch(source.migration,/CREATE TABLE public\.(pos_users|brand_users|employees)/);
});
check("real access_role column used",()=>assert.match(source.migration,/access_role IN/));
check("five canonical roles",()=>{for(const role of ["owner","admin","manager","cashier","inventory"])assert.ok(source.rbac.includes(`"${role}"`));});
check("legacy roles preserved",()=>{assert.match(source.migration,/'editor', 'viewer'/);assert.match(source.rbac,/POS_LEGACY_ROLES/);});
check("editor maps to manager without storage migration",()=>{assert.match(source.rbac,/role === "editor"\) return "manager"/);assert.doesNotMatch(source.migration,/SET access_role = 'manager'[\s\S]*editor/);});
check("viewer is restricted read-only",()=>{assert.match(source.rbac,/viewer: \["pos\.home\.view", "pos\.products\.read", "pos\.inventory\.read"\]/);});
check("central permission matrix",()=>{assert.match(source.rbac,/POS_ROLE_PERMISSIONS/);assert.match(source.rbac,/requirePosPermission/);});
check("plan entitlements remain separate",()=>assert.doesNotMatch(source.rbac,/pos_get_brand_entitlements|ProductEntitlementCode/));
check("active membership required",()=>{assert.match(source.server,/eq\("status", "active"\)/);assert.match(source.rbac,/value\.status !== "active"/);});
check("membership is brand scoped",()=>{assert.match(source.server,/eq\("user_id", user\.userId\)/);assert.match(source.server,/eq\("brand_slug", resolvedSlug\)/);});
check("platform admin gets no synthetic owner",()=>{assert.doesNotMatch(source.server,/isAdmin[\s\S]{0,100}role:\s*"owner"/);assert.match(source.bootstrap,/membership:[\s\S]{0,260}: null/);});
check("bootstrap exposes role permissions and legacy",()=>{for(const marker of ["effectiveRole","permissions","legacy"])assert.ok(source.bootstrap.includes(marker));});
check("owner invariant trigger DB-side",()=>{assert.match(source.migration,/CREATE TRIGGER user_brand_access_last_owner_rbac_v1a/);assert.match(source.migration,/POS_LAST_OWNER_REQUIRED/);assert.match(source.migration,/pg_advisory_xact_lock/);});
check("role escalation policy DB-side",()=>{assert.match(source.migration,/POS_ROLE_ESCALATION_FORBIDDEN/);assert.match(source.migration,/p_access_role = 'admin'/);});
check("invitation workflow table only",()=>{assert.match(source.migration,/CREATE TABLE public\.pos_user_invitations/);assert.doesNotMatch(source.migration,/CREATE TABLE public\.(pos_users|brand_users|employees)/);});
check("pending invitation unique",()=>assert.match(source.migration,/CREATE UNIQUE INDEX pos_user_invitations_pending_email_uidx[\s\S]*WHERE status = 'pending'/));
check("pending invite reserves max_users",()=>{assert.match(source.migration,/v_active_memberships \+ v_pending_invitations >= v_max_users/);assert.match(source.migration,/POS_USER_LIMIT_REACHED/);});
check("acceptance revalidates capacity under lock",()=>{const fn=source.migration.match(/CREATE FUNCTION public\.pos_accept_user_invitation_v1[\s\S]*?END\n\$function\$/)?.[0]??"";assert.match(fn,/pg_advisory_xact_lock/);assert.match(fn,/FOR UPDATE/);assert.match(fn,/v_active_memberships \+ v_pending_invitations > v_max_users/);});
check("acceptance validates auth email and brand",()=>{assert.match(source.migration,/FROM auth\.users/);assert.match(source.migration,/id = p_invitation_id AND brand_slug = v_slug/);});
check("browser table writes denied",()=>assert.match(source.migration,/REVOKE ALL ON TABLE public\.pos_user_invitations FROM PUBLIC, anon, authenticated/));
check("SECURITY DEFINER RPC browser execution denied",()=>{assert.match(source.migration,/REVOKE EXECUTE ON FUNCTION public\.pos_accept_user_invitation_v1[\s\S]*FROM PUBLIC, anon, authenticated/);assert.match(source.migration,/GRANT EXECUTE ON FUNCTION public\.pos_accept_user_invitation_v1[\s\S]*TO service_role/);});
check("ENTRY V1B owner preserved",()=>assert.match(source.entry,/'owner'/));
check("CORE-1 file unchanged in responsibility",()=>{assert.match(source.access,/pos_get_subscription_lifecycle/);assert.match(source.access,/pos_get_brand_entitlements/);assert.doesNotMatch(source.access,/requirePosPermission/);});
check("V1A role and invitation foundation remains scoped while Team UI is a later V1B.2 concern",()=>{
  // Team UI is authorized by RBAC V1B.2. This foundation audit retains its
  // role, permission, owner-invariant, invitation, and seat checks.
  assert.match(source.rbac,/POS_ROLE_PERMISSIONS/);
});
check("no email auth or Stripe",()=>assert.doesNotMatch(source.migration,/inviteUserByEmail|resend|stripe|billing/i));
check("no API mass enforcement",()=>{const apiFiles=["products","inventory","sales","cash-sessions","customers","reports"];for(const route of apiFiles){const content=read(`src/app/api/pos/${route}/route.ts`);assert.doesNotMatch(content,/requirePosPermission/);}});

const failed=checks.filter(check=>!check.passed);
for(const item of checks)console.log(`${item.passed?"PASS":"FAIL"} ${item.name}${item.detail?` — ${item.detail}`:""}`);
console.log(JSON.stringify({checks_total:checks.length,checks_passed:checks.length-failed.length,failed_count:failed.length,all_checks_passed:failed.length===0}));
if(failed.length)process.exitCode=1;
