import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient, PosApiError } from "./server";
import { getPassivePosProductAvailability } from "./access";

export async function getPosEntryBrands() {
  const auth = await createClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new PosApiError(401, "POS_UNAUTHORIZED", "Inicia sesión para abrir Cometa POS.");
  const admin = getAdminClient();
  const membership = await admin.from("user_brand_access").select("brand_slug").eq("user_id", user.id).eq("status", "active");
  if (membership.error) throw new PosApiError(503, "POS_MEMBERSHIP_LOOKUP_FAILED", "No se pudieron consultar tus negocios.");
  const slugs = (membership.data || []).map(row => String(row.brand_slug));
  if (!slugs.length) return [];
  const brands = await admin.from("brands").select("id,slug,name").in("slug", slugs).order("name");
  if (brands.error) throw new PosApiError(503, "POS_BRAND_LOOKUP_FAILED", "No se pudieron consultar tus negocios.");
  return Promise.all((brands.data || []).map(async brand => ({ id: String(brand.id), slug: String(brand.slug), name: String(brand.name),
    availability: await getPassivePosProductAvailability(String(brand.slug)) })));
}
