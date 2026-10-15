import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const guard = read("src/lib/workspace/admin-brands.ts");
const proxy = read("src/proxy.ts");
const access = read("src/lib/workspace/access.ts");
const api = read("src/app/api/admin/access-v2/route.ts");
const list = read("src/app/workspace/access/access-center-client.tsx");
const formatters = read("src/lib/workspace/access-formatters.ts");
const actions = read("src/app/workspace/access/[userId]/person-actions.tsx");
const legacy = read("src/app/workspace/admin/page.tsx");
const legacyApi = read("src/app/api/admin/access/route.ts");
const legacyWorkspace = read("src/app/workspace/[brandName]/page.tsx");
const migration = read("supabase/migrations/20260901120000_cometa_access_center_v2.sql");

assert.match(guard, /profile\?\.role !== "admin" \|\| profile\.status !== "active"/);
assert.doesNotMatch(guard + proxy, /COMETA_ADMIN_EMAILS|COMETA_ADMIN_USER_IDS/);
assert.doesNotMatch(legacyWorkspace, /COMETA_ADMIN_EMAILS|COMETA_ADMIN_USER_IDS|isEnvironmentAdmin/);
assert.match(proxy, /profile\?\.role === "admin" && profile\.status === "active"/);
assert.match(guard, /createServerAuthClient/);
assert.doesNotMatch(guard, /setAll:\s*\(\)\s*=>\s*undefined/);

for (const rpc of ["create_profile", "grant_brand", "revoke_brand", "revoke_all", "restore_account", "restore_brand"]) assert.match(migration, new RegExp(`cometa_access_${rpc}_v2`));
assert.match(migration, /SELF_REVOKE_FORBIDDEN/);
assert.match(migration, /LAST_ADMIN_REQUIRED/);
assert.match(migration, /LAST_OWNER_REQUIRED/);
assert.match(migration, /PROFILE_INACTIVE/);
assert.match(migration, /v_changed boolean := false/);
assert.match(migration, /mercury_team_assignments set active=false/);
assert.doesNotMatch(migration, /mercury_team_assignments set active=true/);
assert.match(migration, /revoke all on function[\s\S]+from public, anon, authenticated/);
assert.match(migration, /grant execute[\s\S]+to service_role/);
assert.doesNotMatch(migration, /brand_os_access/);
assert.doesNotMatch(migration + access + api, /deleteUser|\.delete\(\).*user_profiles|\.delete\(\).*user_brand_access/);

assert.match(access, /auth\.admin\.listUsers/);
assert.match(access, /last_sign_in_at/);
assert.match(access, /profile: profile \?/);
assert.doesNotMatch(access, /profile.*\|\|.*inactive/);
assert.match(list, /Sin perfil/);
assert.match(formatters, /Nunca ha ingresado/);
assert.match(list, /person\.profile\?\.role === "admin" \|\| person\.assignments\.length > 0/);
assert.match(actions, /profile\?\.status !== "active"/);
assert.match(actions, /Las asignaciones Mercury no conceden membresía y no se reactivan automáticamente/);
assert.match(legacy, /redirect\("\/workspace\/access"\)/);
assert.match(legacyApi, /delegates to the same canonical authority/);
assert.doesNotMatch(access, /NEXT_PUBLIC_SUPABASE_SERVICE/);

console.log("PASS: COMETA Access Center V2 contract");
