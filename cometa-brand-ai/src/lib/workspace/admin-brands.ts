import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { BrandOsGuardError } from "@/lib/brand-os/server";
import { getPassivePosProductAvailability, type PassivePosProductAvailability } from "@/lib/pos/access";

export type AdminBrandStatus = "active" | "inactive";

export type AdminBrandSummary = {
  id: string;
  slug: string;
  name: string;
  status: AdminBrandStatus;
  os: { status: "active" | "paused" | "inactive" | "not_configured" };
  pos: { state: PassivePosProductAvailability["state"]; lifecycleStatus: string | null };
};

export type CreateAdminBrandInput = {
  name: string;
  slug: string;
  status: AdminBrandStatus;
  enableOs: boolean;
};

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new BrandOsGuardError(500, "ADMIN_SERVER_CONFIG_INVALID", "Configuración de servidor incompleta.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireAdminWorkspace() {
  const auth = await createServerAuthClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new BrandOsGuardError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
  const email = user.email?.toLowerCase() || "";
  const { data: profile, error: profileError } = await adminClient().from("user_profiles").select("role,status").eq("user_id", user.id).maybeSingle();
  if (profileError) throw new BrandOsGuardError(500, "ADMIN_PROFILE_LOOKUP_FAILED", "No se pudo verificar el perfil administrativo.");
  if (profile?.role !== "admin" || profile.status !== "active") throw new BrandOsGuardError(403, "ADMIN_REQUIRED", "Esta sección es sólo para el equipo Cometa.");
  return { userId: user.id, email };
}

export async function getAdminBrandSummaries(): Promise<AdminBrandSummary[]> {
  await requireAdminWorkspace();
  const client = adminClient();
  const [{ data: brands, error: brandsError }, { data: osRows, error: osError }] = await Promise.all([
    client.from("brands").select("id,slug,name,status").order("name", { ascending: true }),
    client.from("brand_os_access").select("brand_slug,status"),
  ]);
  if (brandsError) throw brandsError;
  if (osError) throw osError;
  const osBySlug = new Map((osRows || []).map((row) => [String(row.brand_slug), String(row.status)]));
  return Promise.all((brands || []).map(async (brand) => {
    let pos: PassivePosProductAvailability = { state: "unavailable", available: false, planCode: null, lifecycleStatus: null, reason: "commercial_access_lookup_failed" };
    try { pos = await getPassivePosProductAvailability(String(brand.slug)); } catch { /* Passive presentation fails closed and never initializes POS. */ }
    const osStatus = osBySlug.get(String(brand.slug));
    return {
      id: String(brand.id),
      slug: String(brand.slug),
      name: String(brand.name),
      status: brand.status === "inactive" ? "inactive" : "active",
      os: { status: (osStatus === "active" || osStatus === "paused" || osStatus === "inactive" ? osStatus : "not_configured") as AdminBrandSummary["os"]["status"] },
      pos: { state: pos.state, lifecycleStatus: pos.lifecycleStatus },
    };
  }));
}

export async function createAdminBrand(input: CreateAdminBrandInput): Promise<AdminBrandSummary> {
  const admin = await requireAdminWorkspace();
  const client = adminClient();
  const { data: existing, error: existingError } = await client.from("brands").select("id").eq("slug", input.slug).maybeSingle();
  if (existingError) throw new BrandOsGuardError(500, "ADMIN_BRAND_DUPLICATE_CHECK_FAILED", "No se pudo validar la disponibilidad del slug.");
  if (existing) throw new BrandOsGuardError(409, "ADMIN_BRAND_SLUG_TAKEN", "Ese slug ya pertenece a otra marca.");

  const { data: brand, error: brandError } = await client
    .from("brands")
    .insert({ name: input.name, slug: input.slug, status: input.status, created_by: admin.userId })
    .select("id,slug,name,status")
    .single();
  if (brandError || !brand) {
    const duplicate = brandError?.code === "23505";
    throw new BrandOsGuardError(duplicate ? 409 : 500, duplicate ? "ADMIN_BRAND_SLUG_TAKEN" : "ADMIN_BRAND_CREATE_FAILED", duplicate ? "Ese slug ya pertenece a otra marca." : "No se pudo crear la marca.");
  }

  if (input.enableOs) {
    const { error: osError } = await client.from("brand_os_access").insert({ brand_slug: brand.slug, status: "active", started_at: new Date().toISOString() });
    if (osError) {
      // Only the brand exists at this point. POS and membership were not
      // initialized, so compensation removes exactly this request's brand.
      const brandRollback = await client.from("brands").delete().eq("id", brand.id).eq("created_by", admin.userId);
      if (brandRollback.error) throw new BrandOsGuardError(500, "ADMIN_BRAND_PARTIAL_CREATE", "La marca se creó parcialmente y requiere revisión administrativa.");
      throw new BrandOsGuardError(500, "ADMIN_BRAND_OS_CREATE_FAILED", "No se pudo habilitar Cometa OS; la creación fue revertida.");
    }
  }

  const { error: membershipError } = await client.from("user_brand_access").insert({
    user_id: admin.userId,
    brand_slug: brand.slug,
    access_role: "owner",
    status: "active",
  });
  if (membershipError) {
    // Reverse only the optional OS row and brand created by this request.
    // No POS setup or unrelated tenant data is touched. Doing this before an
    // owner membership exists also avoids last-owner protection semantics.
    const osRollback = input.enableOs ? await client.from("brand_os_access").delete().eq("brand_slug", brand.slug) : null;
    const brandRollback = osRollback?.error ? null : await client.from("brands").delete().eq("id", brand.id).eq("created_by", admin.userId);
    if (osRollback?.error || brandRollback?.error) throw new BrandOsGuardError(500, "ADMIN_BRAND_PARTIAL_CREATE", "La marca se creó, pero falló el acceso y no pudo revertirse automáticamente.");
    throw new BrandOsGuardError(500, "ADMIN_BRAND_ACCESS_CREATE_FAILED", "No se pudo asignar el acceso; la marca creada fue revertida.");
  }

  const pos = await getPassivePosProductAvailability(String(brand.slug));
  return {
    id: String(brand.id),
    slug: String(brand.slug),
    name: String(brand.name),
    status: brand.status === "inactive" ? "inactive" : "active",
    os: { status: input.enableOs ? "active" : "not_configured" },
    pos: { state: pos.state, lifecycleStatus: pos.lifecycleStatus },
  };
}
