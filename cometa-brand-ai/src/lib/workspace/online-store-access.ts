import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/pos/server";
import { BrandOsGuardError } from "@/lib/brand-os/server";

export type OnlineStoreService = { status: "disabled" | "enabled" | "suspended"; revision: number };
export function assertBrandSlug(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    throw new BrandOsGuardError(400, "BRAND_SLUG_INVALID", "La marca no es válida.");
  }
}
export async function readOnlineStoreService(client: SupabaseClient, brandId: string): Promise<OnlineStoreService> {
  const { data, error } = await client.from("brand_online_store_access")
    .select("status,revision").eq("brand_id", brandId).maybeSingle();
  if (error) throw new BrandOsGuardError(503, "STORE_ACCESS_LOOKUP_FAILED", "No se pudo consultar la habilitación de tienda.");
  if (!data) return { status: "disabled", revision: 0 };
  if (!["enabled", "suspended"].includes(data.status) || !Number.isSafeInteger(data.revision) || data.revision < 1) {
    throw new BrandOsGuardError(503, "STORE_ACCESS_INVALID", "La habilitación requiere revisión.");
  }
  return { status: data.status, revision: data.revision };
}

/** Future consumers must also authorize their order/resource and check its state.
 * Commercial enablement is never publication or permission to take payments. */
export async function resolveOnlineStoreAccess(brandSlug: string) {
  assertBrandSlug(brandSlug);
  const auth = await createClient();
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) throw new BrandOsGuardError(401, "UNAUTHENTICATED", "Inicia sesión.");
  const client = getAdminClient();
  const { data: profile, error: profileError } = await client.from("user_profiles").select("role,status").eq("user_id", user.id).maybeSingle();
  if (profileError) throw new BrandOsGuardError(503, "PROFILE_LOOKUP_FAILED", "No se pudo verificar el acceso.");
  if (profile?.status !== "active") throw new BrandOsGuardError(403, "ACCOUNT_INACTIVE", "Cuenta no autorizada.");
  const { data: brand, error } = await client.from("brands").select("id,slug,status").eq("slug", brandSlug).maybeSingle();
  if (error) throw new BrandOsGuardError(503, "BRAND_LOOKUP_FAILED", "No se pudo consultar la marca.");
  if (!brand) throw new BrandOsGuardError(404, "BRAND_NOT_FOUND", "Marca no disponible.");
  const globalAdmin = profile.role === "admin";
  let canAdminister = globalAdmin;
  if (!globalAdmin) {
    const membership = await client.from("user_brand_access").select("access_role,status")
      .eq("brand_slug", brand.slug).eq("user_id", user.id).maybeSingle();
    if (membership.error) throw new BrandOsGuardError(503, "MEMBERSHIP_LOOKUP_FAILED", "No se pudo verificar el acceso.");
    canAdminister = membership.data?.status === "active" && ["owner", "admin"].includes(membership.data.access_role);
    if (!canAdminister) throw new BrandOsGuardError(403, "BRAND_ACCESS_DENIED", "Sin permiso para administrar esta tienda.");
  }
  const service = await readOnlineStoreService(client, brand.id);
  return {
    brandId: String(brand.id), brandSlug: String(brand.slug), service,
    canChangeService: globalAdmin, canAdminister,
    canStartNewOperations: canAdminister && brand.status === "active" && service.status === "enabled",
    // Does not bypass resource ownership, refunds or payment state machines.
    canResolveExistingOperations: canAdminister && service.revision > 0,
    publication: "not_implemented" as const,
  };
}
