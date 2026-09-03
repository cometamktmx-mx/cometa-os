import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAdminWorkspace } from "@/lib/workspace/admin-brands";
import { getBrandOsAccess } from "@/lib/brand-os/access";
import { getPassivePosProductAvailability } from "@/lib/pos/access";
import { ACCESS_ROLES, type AccessPerson, type AccessRole, type BrandOsAccessStatus, type PassivePosProductAvailability } from "@/lib/workspace/access-shared";

export { ACCESS_ROLES, type AccessPerson, type AccessRole } from "@/lib/workspace/access-shared";

export type AccessAction = "create_profile" | "create_team" | "grant_brand" | "revoke_brand" | "revoke_all" | "restore_account" | "restore_brand" | "change_role" | "team_add_brand" | "team_change_operational_role" | "team_set_primary";

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("ACCESS_SERVER_CONFIG_INVALID");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getAccessCenterPeople(): Promise<{ people: AccessPerson[]; brands: Array<{ slug: string; name: string }> }> {
  await requireAdminWorkspace();
  const client = serviceClient();
  const [{ data: authData, error: authError }, profilesResult, membershipsResult, assignmentsResult, brandsResult, workProfilesResult] = await Promise.all([
    client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    client.from("user_profiles").select("user_id,full_name,role,status"),
    client.from("user_brand_access").select("user_id,brand_slug,access_role,status"),
    client.from("mercury_team_assignments").select("user_id,brand_slug,brand_name,role,active,is_primary"),
    client.from("brands").select("slug,name").order("name"),
    client.from("cometa_studio_work_profiles").select("user_id,typical_start_time,target_minutes,work_days,timezone"),
  ]);
  if (authError) throw new Error("ACCESS_AUTH_USERS_LOOKUP_FAILED");
  if (profilesResult.error || membershipsResult.error || assignmentsResult.error || brandsResult.error || workProfilesResult.error) throw new Error("ACCESS_DATA_LOOKUP_FAILED");

  const profiles = new Map((profilesResult.data || []).map((row) => [String(row.user_id), row]));
  const workProfiles = new Map((workProfilesResult.data || []).map((row) => [String(row.user_id), row]));
  const brandNames = new Map((brandsResult.data || []).map((row) => [String(row.slug), String(row.name)]));
  const productBySlug = new Map<string, { osStatus: BrandOsAccessStatus; pos: PassivePosProductAvailability }>();
  await mapWithConcurrency(brandsResult.data || [], 4, async (brand) => {
    const slug = String(brand.slug);
    productBySlug.set(slug, { osStatus: (await getBrandOsAccess(client, slug)).status, pos: await getPassivePosProductAvailability(slug) });
  });
  const people = (authData.users || []).map((user): AccessPerson => {
    const profile = profiles.get(user.id);
    const workProfile = workProfiles.get(user.id);
    return {
      id: user.id,
      email: user.email || "Sin correo",
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at || null,
      profile: profile ? {
        fullName: profile.full_name ? String(profile.full_name) : null,
        role: profile.role === "admin" ? "admin" : profile.role === "team" ? "team" : "client",
        status: profile.status === "inactive" ? "inactive" : "active",
      } : null,
      memberships: (membershipsResult.data || []).filter((row) => row.user_id === user.id).map((row) => ({
        brandSlug: String(row.brand_slug),
        brandName: brandNames.get(String(row.brand_slug)) || "Marca no disponible",
        canonicalBrand: brandNames.has(String(row.brand_slug)),
        accessRole: ACCESS_ROLES.includes(row.access_role as AccessRole) ? row.access_role as AccessRole : "viewer",
        status: row.status === "inactive" ? "inactive" : "active",
        osStatus: productBySlug.get(String(row.brand_slug))?.osStatus || null,
        pos: productBySlug.get(String(row.brand_slug))?.pos || null,
      })),
      assignments: (assignmentsResult.data || []).filter((row) => row.user_id === user.id).map((row) => ({
        brandSlug: String(row.brand_slug),
        brandName: String(row.brand_name || brandNames.get(String(row.brand_slug)) || row.brand_slug),
        role: String(row.role),
        active: row.active === true,
        isPrimary: row.is_primary === true,
      })),
      workProfile: workProfile ? { typicalStart: typeof workProfile.typical_start_time === "string" ? workProfile.typical_start_time.slice(0, 5) : null, targetMinutes: Number(workProfile.target_minutes), workDays: Array.isArray(workProfile.work_days) ? workProfile.work_days.map(Number) : null, timezone: String(workProfile.timezone) } : null,
    };
  });
  return { people, brands: (brandsResult.data || []).map((row) => ({ slug: String(row.slug), name: String(row.name) })) };
}

export async function getAccessPerson(userId: string) {
  assertUuid(userId);
  const data = await getAccessCenterPeople();
  return { person: data.people.find((person) => person.id === userId) || null, brands: data.brands };
}

export async function mutateAccess(input: { action: AccessAction; targetUserId: string; brandSlug?: string; accessRole?: string }) {
  const actor = await requireAdminWorkspace();
  assertUuid(input.targetUserId);
  if (input.accessRole && !ACCESS_ROLES.includes(input.accessRole as AccessRole)) throw new Error("ACCESS_ROLE_INVALID");
  if (input.action === "create_team") throw new Error("TEAM_CREATE_REQUIRES_PROFILE_INPUT");
  if (input.action === "team_add_brand" || input.action === "team_change_operational_role" || input.action === "team_set_primary") return mutateTeamAssignment(input, actor.userId);
  const rpcByAction = {
    create_profile: "cometa_access_create_profile_v2",
    grant_brand: "cometa_access_grant_brand_v2",
    revoke_brand: "cometa_access_revoke_brand_v2",
    revoke_all: "cometa_access_revoke_all_v2",
    restore_account: "cometa_access_restore_account_v2",
    restore_brand: "cometa_access_restore_brand_v2",
    change_role: "cometa_access_change_role_v2",
  } as const;
  if (["grant_brand", "revoke_brand", "restore_brand", "change_role"].includes(input.action) && !input.brandSlug) throw new Error("BRAND_REQUIRED");
  const args: Record<string, string> = { p_target_user_id: input.targetUserId, p_actor_user_id: actor.userId };
  if (input.brandSlug) args.p_brand_slug = input.brandSlug;
  if (input.action === "grant_brand" || input.action === "restore_brand" || input.action === "change_role") args.p_access_role = input.accessRole || "viewer";
  const { data, error } = await serviceClient().rpc(rpcByAction[input.action], args);
  if (error) throw new Error(error.message);
  return data;
}

export async function createTeamAccount(input: { fullName: string; email: string; password: string; brands: Array<{ slug: string; role: string; isPrimary: boolean }> }) {
  const actor = await requireAdminWorkspace();
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@") || input.password.length < 8 || !input.fullName.trim()) throw new Error("TEAM_INPUT_INVALID");
  const client = serviceClient();
  const slugs = [...new Set(input.brands.map((item) => item.slug).filter(Boolean))];
  const { data: brands, error: brandError } = await client.from("brands").select("id,slug").in("slug", slugs).eq("status", "active");
  if (brandError || (brands || []).length !== slugs.length) throw new Error("TEAM_BRANDS_INVALID");
  const invalidRole = input.brands.some((item) => !["designer", "reels", "cm", "copy", "producer"].includes(item.role));
  if (invalidRole) throw new Error("TEAM_OPERATIONAL_ROLE_INVALID");
  const { data: authData, error: authError } = await client.auth.admin.createUser({ email, password: input.password, email_confirm: true, user_metadata: { full_name: input.fullName.trim() } });
  if (authError || !authData.user) throw new Error("TEAM_AUTH_CREATE_FAILED");
  const userId = authData.user.id;
  try {
    const { error: profileError } = await client.from("user_profiles").insert({ user_id: userId, email, full_name: input.fullName.trim(), role: "team", status: "active" });
    if (profileError) throw new Error("TEAM_PROFILE_CREATE_FAILED");
    if (slugs.length) {
      const { error: membershipError } = await client.from("user_brand_access").insert(input.brands.map((item) => ({ user_id: userId, brand_slug: item.slug, access_role: "editor", status: "active" })));
      if (membershipError) throw new Error("TEAM_MEMBERSHIP_CREATE_FAILED");
      const brandBySlug = new Map((brands || []).map((brand) => [String(brand.slug), brand]));
      const { error: assignmentError } = await client.from("mercury_team_assignments").insert(input.brands.map((item) => ({ user_id: userId, brand_slug: item.slug, brand_name: String(brandBySlug.get(item.slug)?.slug || item.slug), role: item.role, active: true, is_primary: item.isPrimary })));
      if (assignmentError) throw new Error(assignmentError.code === "23505" ? "TEAM_PRIMARY_CONFLICT" : "TEAM_ASSIGNMENT_CREATE_FAILED");
    }
    return { userId, actorUserId: actor.userId };
  } catch (error) {
    await client.auth.admin.deleteUser(userId);
    throw error;
  }
}

async function mutateTeamAssignment(input: { action: AccessAction; targetUserId: string; brandSlug?: string; accessRole?: string }, actorUserId: string) {
  assertUuid(input.targetUserId); if (!input.brandSlug) throw new Error("BRAND_REQUIRED");
  const client = serviceClient(); const { data: profile } = await client.from("user_profiles").select("role,status").eq("user_id", input.targetUserId).maybeSingle(); if (profile?.role !== "team" || profile.status !== "active") throw new Error("TEAM_PROFILE_REQUIRED");
  const { data: brand } = await client.from("brands").select("slug,name").eq("slug", input.brandSlug).maybeSingle(); if (!brand) throw new Error("BRAND_NOT_FOUND");
  if (input.action === "team_add_brand") { const { error } = await client.from("user_brand_access").upsert({ user_id: input.targetUserId, brand_slug: brand.slug, access_role: "editor", status: "active" }, { onConflict: "user_id,brand_slug" }); if (error) throw new Error("TEAM_MEMBERSHIP_UPDATE_FAILED"); }
  if (input.action === "team_change_operational_role") { if (!input.accessRole || !["designer", "reels", "cm", "copy", "producer"].includes(input.accessRole)) throw new Error("TEAM_OPERATIONAL_ROLE_INVALID"); const { error } = await client.from("mercury_team_assignments").update({ role: input.accessRole }).eq("user_id", input.targetUserId).eq("brand_slug", brand.slug).eq("active", true); if (error) throw new Error("TEAM_ASSIGNMENT_UPDATE_FAILED"); }
  if (input.action === "team_set_primary") { const { data: assignment } = await client.from("mercury_team_assignments").select("role").eq("user_id", input.targetUserId).eq("brand_slug", brand.slug).eq("active", true).maybeSingle(); if (!assignment) throw new Error("TEAM_ASSIGNMENT_NOT_FOUND"); const { data: conflict } = await client.from("mercury_team_assignments").select("user_id").eq("brand_slug", brand.slug).eq("role", assignment.role).eq("active", true).eq("is_primary", true).neq("user_id", input.targetUserId).maybeSingle(); if (conflict) throw new Error("TEAM_PRIMARY_CONFLICT"); const { error } = await client.from("mercury_team_assignments").update({ is_primary: true }).eq("user_id", input.targetUserId).eq("brand_slug", brand.slug).eq("active", true); if (error) throw new Error("TEAM_ASSIGNMENT_UPDATE_FAILED"); }
  return { ok: true, actorUserId };
}

async function mapWithConcurrency<T>(values: T[], concurrency: number, mapper: (value: T) => Promise<void>) {
  let cursor = 0; async function worker() { while (cursor < values.length) await mapper(values[cursor++]); }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("USER_ID_INVALID");
}
