import { PosApiError } from "@/lib/pos/server";
import type { ComuActor } from "./seller-access";
import { slugifyComu } from "./sellers";

export async function createListing(admin: ComuActor["admin"], input: { sellerId: string; storefrontId: string; productId: string; publicSlug?: string; wholesaleEnabled?: boolean }) {
  const { data: product, error: productError } = await admin.from("pos_products").select("id,brand_id,brand_slug,name").eq("id", input.productId).maybeSingle();
  if (productError) throw new PosApiError(500, "COMU_PRODUCT_LOOKUP_FAILED", "No se pudo validar el producto.");
  const { data: seller } = await admin.from("comu_sellers").select("brand_id,brand_slug").eq("id", input.sellerId).maybeSingle();
  const { data: storefront } = await admin.from("comu_storefronts").select("id,seller_id").eq("id", input.storefrontId).maybeSingle();
  if (!storefront || storefront.seller_id !== input.sellerId) throw new PosApiError(400, "COMU_STOREFRONT_MISMATCH", "El storefront no pertenece al seller.");
  if (!product || !seller || product.brand_id !== seller.brand_id || product.brand_slug !== seller.brand_slug) throw new PosApiError(403, "COMU_PRODUCT_BRAND_MISMATCH", "El producto no pertenece al Brand del seller.");
  const slug = slugifyComu(input.publicSlug || product.name);
  const { data, error } = await admin.from("comu_product_listings").insert({ seller_id: input.sellerId, storefront_id: input.storefrontId, product_id: input.productId, public_slug: slug, wholesale_enabled: input.wholesaleEnabled === true }).select("*").single();
  if (error) throw new PosApiError(error.code === "23505" ? 409 : 500, error.code === "23505" ? "COMU_LISTING_SLUG_EXISTS" : "COMU_LISTING_CREATE_FAILED", "No se pudo crear el listing.");
  const { data: variants } = await admin.from("pos_product_variants").select("id").eq("product_id", input.productId).eq("brand_slug", seller.brand_slug).eq("active", true);
  if (variants?.length) {
    const { error: variantError } = await admin.from("comu_variant_listings").insert(variants.map((variant) => ({ listing_id: data.id, variant_id: variant.id, enabled: true })));
    if (variantError) {
      await admin.from("comu_product_listings").delete().eq("id", data.id);
      throw new PosApiError(500, "COMU_VARIANT_LISTING_CREATE_FAILED", "No se pudieron habilitar las variantes.");
    }
  }
  return data;
}
