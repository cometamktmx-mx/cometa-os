import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { getAdminClient, PosApiError } from "@/lib/pos/server";

export type ComuActor = { userId: string; isAdmin: boolean; admin: ReturnType<typeof getAdminClient> };

export async function requireComuActor(): Promise<ComuActor> {
  const auth = await createServerAuthClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new PosApiError(401, "COMU_UNAUTHORIZED", "Inicia sesión para utilizar COMU.");
  const admin = getAdminClient();
  const { data: profile, error: profileError } = await admin.from("user_profiles").select("role,status").eq("user_id", user.id).maybeSingle();
  if (profileError) throw new PosApiError(500, "COMU_PROFILE_LOOKUP_FAILED", "No se pudo resolver tu cuenta.");
  if (profile?.status !== "active") throw new PosApiError(403, "COMU_ACCOUNT_INACTIVE", "Tu cuenta no está activa.");
  return { userId: user.id, isAdmin: profile?.role === "admin", admin };
}

export async function requireSellerAccess(sellerId: string, roles?: string[]) {
  const actor = await requireComuActor();
  if (actor.isAdmin) return { ...actor, role: "COMETA_ADMIN" as const };
  const query = actor.admin.from("comu_seller_memberships").select("role").eq("seller_id", sellerId).eq("user_id", actor.userId).eq("active", true).maybeSingle();
  const { data, error } = await query;
  if (error) throw new PosApiError(500, "COMU_MEMBERSHIP_LOOKUP_FAILED", "No se pudo resolver el acceso del seller.");
  if (!data || (roles && !roles.includes(data.role))) throw new PosApiError(403, "COMU_SELLER_ACCESS_DENIED", "No tienes acceso a este seller.");
  return { ...actor, role: data.role as string };
}

export async function resolveBrandForActor(brandSlug: string) {
  const actor = await requireComuActor();
  const { data: brand, error } = await actor.admin.from("brands").select("id,slug,name").eq("slug", brandSlug).maybeSingle();
  if (error) throw new PosApiError(500, "COMU_BRAND_LOOKUP_FAILED", "No se pudo resolver la marca.");
  if (!brand) throw new PosApiError(404, "COMU_BRAND_NOT_FOUND", "La marca no existe.");
  if (!actor.isAdmin) {
    const { data: membership } = await actor.admin.from("user_brand_access").select("status").eq("brand_slug", brand.slug).eq("user_id", actor.userId).eq("status", "active").maybeSingle();
    if (!membership) throw new PosApiError(403, "COMU_BRAND_ACCESS_DENIED", "No tienes acceso a esta marca.");
  }
  return { actor, brand };
}
