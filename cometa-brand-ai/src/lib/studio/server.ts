import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { BrandOsGuardError } from "@/lib/brand-os/server";

type StudioProfile = { userId: string; email: string | null; fullName: string | null; role: "team"; status: "active" };
type StudioBrand = { id: string; slug: string; name: string };

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new BrandOsGuardError(500, "STUDIO_SERVER_CONFIG_INVALID", "Configuración de Studio incompleta.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authenticatedUser() {
  const auth = await createServerAuthClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new BrandOsGuardError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
  return user;
}

export async function requireStudioAccess(): Promise<StudioProfile> {
  const user = await authenticatedUser();
  const { data, error } = await serviceClient().from("user_profiles").select("user_id,email,full_name,role,status").eq("user_id", user.id).maybeSingle();
  if (error) throw new BrandOsGuardError(500, "STUDIO_PROFILE_LOOKUP_FAILED", "No se pudo verificar tu acceso a Studio.");
  if (!data || data.role !== "team" || data.status !== "active") throw new BrandOsGuardError(403, "STUDIO_TEAM_REQUIRED", "Esta sección es sólo para el equipo de producción.");
  return { userId: user.id, email: user.email || (typeof data.email === "string" ? data.email : null), fullName: typeof data.full_name === "string" ? data.full_name : null, role: "team", status: "active" };
}

export async function requireStudioBrandAccess(brandSlug: string) {
  const studio = await requireStudioAccess();
  const client = serviceClient();
  const brandResult = await client.from("brands").select("id,slug,name,status").eq("slug", brandSlug).maybeSingle();
  if (brandResult.error) throw new BrandOsGuardError(500, "STUDIO_BRAND_LOOKUP_FAILED", "No se pudo resolver la marca.");
  if (!brandResult.data || brandResult.data.status === "inactive") throw new BrandOsGuardError(404, "BRAND_NOT_FOUND", "La marca no está disponible.");
  const brand: StudioBrand = { id: String(brandResult.data.id), slug: String(brandResult.data.slug), name: String(brandResult.data.name) };
  const membership = await client.from("user_brand_access").select("access_role,status").eq("user_id", studio.userId).eq("brand_slug", brand.slug).eq("status", "active").maybeSingle();
  if (membership.error) throw new BrandOsGuardError(500, "STUDIO_MEMBERSHIP_LOOKUP_FAILED", "No se pudo verificar la pertenencia a la marca.");
  if (!membership.data) throw new BrandOsGuardError(403, "STUDIO_MEMBERSHIP_REQUIRED", "No tienes acceso operativo a esta marca.");
  const assignment = await client.from("mercury_team_assignments").select("id,role,active,is_primary").eq("user_id", studio.userId).eq("brand_slug", brand.slug).eq("active", true).in("role", ["admin", "designer", "reels", "cm", "copy", "producer"]).limit(20);
  if (assignment.error) throw new BrandOsGuardError(500, "STUDIO_ASSIGNMENT_LOOKUP_FAILED", "No se pudo verificar la asignación operativa.");
  if (!assignment.data?.length) throw new BrandOsGuardError(403, "STUDIO_ASSIGNMENT_REQUIRED", "No tienes una asignación operativa para esta marca.");
  return { ...studio, brand, accessRole: String(membership.data.access_role), assignments: assignment.data.map((row) => ({ id: String(row.id), role: String(row.role), isPrimary: row.is_primary === true })) };
}

export async function getStudioAssignedItems(userId: string, brandSlugs: string[]) {
  if (!brandSlugs.length) return [];
  const result = await serviceClient().from("mercury_content_items").select("id,brand_slug,title,content_type,platform,status,due_date,publish_date,assigned_role,distribution_type,priority").eq("assigned_to", userId).in("brand_slug", brandSlugs).order("due_date", { ascending: true, nullsFirst: false }).limit(100);
  if (result.error) throw new BrandOsGuardError(500, "STUDIO_ITEMS_LOOKUP_FAILED", "No se pudieron cargar tus piezas.");
  return result.data || [];
}

export async function getStudioWorkspaceData(studio: StudioProfile) {
  const client = serviceClient();
  const assignments = await client.from("mercury_team_assignments").select("brand_slug,brand_name,role,active").eq("user_id", studio.userId).eq("active", true).in("role", ["admin", "designer", "reels", "cm", "copy", "producer"]);
  if (assignments.error) throw new BrandOsGuardError(500, "STUDIO_ASSIGNMENT_LOOKUP_FAILED", "No se pudieron cargar tus marcas operativas.");
  const slugs = [...new Set((assignments.data || []).map((row) => String(row.brand_slug)).filter(Boolean))];
  const brands = slugs.length ? await client.from("brands").select("id,slug,name,status").in("slug", slugs).eq("status", "active").order("name") : { data: [], error: null };
  if (brands.error) throw new BrandOsGuardError(500, "STUDIO_BRAND_LOOKUP_FAILED", "No se pudieron cargar tus marcas operativas.");
  const canonicalSlugs = (brands.data || []).map((brand) => String(brand.slug));
  const items = await getStudioAssignedItems(studio.userId, canonicalSlugs);
  return { brands: brands.data || [], assignments: assignments.data || [], items };
}

export async function getStudioPiece(studio: StudioProfile, pieceId: string) {
  const result = await serviceClient().from("mercury_content_items").select("id,brand_slug,title,content_type,platform,status,objective,brief,cta,visual_direction,reference_notes,publish_date,due_date,assigned_to,distribution_type,priority").eq("id", pieceId).eq("assigned_to", studio.userId).maybeSingle();
  if (result.error) throw new BrandOsGuardError(500, "STUDIO_ITEM_LOOKUP_FAILED", "No se pudo cargar la pieza.");
  return result.data;
}
