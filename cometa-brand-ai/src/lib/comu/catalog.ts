import { PosApiError } from "@/lib/pos/server";
import type { ComuActor } from "./seller-access";

export async function getEligibleProducts(admin: ComuActor["admin"], brandSlug: string, search?: string) {
  let query = admin.from("pos_products").select("id,name,description,category_id,image_url,active,sellable,brand_slug").eq("brand_slug", brandSlug).eq("active", true).eq("sellable", true).order("name");
  if (search?.trim()) query = query.ilike("name", `%${search.trim()}%`);
  const { data, error } = await query.limit(200);
  if (error) throw new PosApiError(500, "COMU_PRODUCTS_LOOKUP_FAILED", "No se pudieron cargar los productos POS.");
  return data || [];
}

export async function getProductVariants(admin: ComuActor["admin"], productIds: string[]) {
  if (!productIds.length) return [];
  const { data, error } = await admin.from("pos_product_variants").select("id,product_id,name,sku,price,image_url,attributes,active,brand_slug").in("product_id", productIds).eq("active", true);
  if (error) throw new PosApiError(500, "COMU_VARIANTS_LOOKUP_FAILED", "No se pudieron cargar las variantes.");
  return data || [];
}
