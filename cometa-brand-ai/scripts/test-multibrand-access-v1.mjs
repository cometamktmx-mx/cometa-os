import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260901130000_cometa_multibrand_access_v1.sql");
const context = read("src/lib/workspace/context.ts");
const workspace = read("src/app/workspace/page.tsx");
const login = read("src/app/login/page.tsx");
const brandGuard = read("src/lib/brand-os/server.ts");
const brandHeader = read("src/app/brand/[brandSlug]/components/brand-command-header.tsx");
const access = read("src/lib/workspace/access.ts");
const actions = read("src/app/workspace/access/[userId]/person-actions.tsx");
const list = read("src/app/workspace/access/access-center-client.tsx");

assert.match(context, /\.eq\("status", "active"\)/);
assert.match(context, /from\("brands"\).*\.in\("slug", slugs\)/s);
assert.match(context, /brands\.length !== 1/);
assert.match(workspace, /isCanonicalAdmin/);
assert.match(workspace, /brands\.length === 1/);
assert.match(workspace, /No tienes empresas activas/);
assert.match(workspace, /ClientBrandSelector/);
assert.doesNotMatch(login, /onboarding\/business|from\("user_brand_access"\)/);
assert.match(login, /\/api\/workspace\/context/);

assert.match(migration, /cometa_access_change_role_v2/);
assert.match(migration, /for update/i);
assert.match(migration, /v_row\.status <> 'active'/);
assert.match(migration, /'role_from',v_role_from,'role_to',v_row\.access_role/);
assert.match(migration, /v_row\.access_role = p_access_role[\s\S]*'changed',false/);
assert.match(migration, /ROLE_CHANGE_REQUIRES_EXPLICIT_ACTION/);
assert.match(migration, /MEMBERSHIP_INACTIVE_USE_RESTORE/);
assert.doesNotMatch(migration, /brand_os_access|pos_|mercury_team_assignments/);
assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute[\s\S]*to service_role/);

assert.match(actions, /change_role/);
assert.match(actions, /restore_brand/);
assert.match(actions, /grant_brand/);
assert.match(actions, /!existingSlugs\.has/);
assert.match(actions, /Productos de la marca/);
assert.match(actions, /No activa Cometa OS, POS ni Mercury/);
assert.match(access, /canonicalBrand/);
assert.match(access, /Marca no disponible/);
assert.match(access, /getBrandOsAccess/);
assert.match(access, /getPassivePosProductAvailability/);
assert.match(list, /activeBrands\[0\]\.brandName.*activeBrands\.length - 1/);

assert.match(brandHeader, /workspace\.brands\.length > 1/);
assert.doesNotMatch(context + workspace + login + brandHeader, /localStorage/);
assert.match(brandGuard, /if \(!isPlatformAdmin && !membershipActive\)/);
assert.match(brandGuard, /\.eq\("brand_slug", brandSlug\)[\s\S]*\.eq\("status", "active"\)/);
assert.doesNotMatch(context, /brand_os_access.*membership|mercury_team_assignments/);
assert.match(migration, /insert into public\.user_brand_access/);
assert.doesNotMatch(migration, /on conflict/);

console.log("PASS: COMETA Multi-brand Access V1 contract");
