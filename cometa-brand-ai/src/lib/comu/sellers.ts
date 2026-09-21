import { PosApiError } from "@/lib/pos/server";
import type { ComuActor } from "./seller-access";

export function slugifyComu(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function getSellerBySlug(admin: ComuActor["admin"], slug: string, publicOnly = true) {
  let query = admin.from("comu_sellers").select("*").eq("slug", slug);
  if (publicOnly) query = query.eq("status", "ACTIVE").eq("verification_status", "VERIFIED");
  const { data, error } = await query.maybeSingle();
  if (error) throw new PosApiError(500, "COMU_SELLER_LOOKUP_FAILED", "No se pudo cargar el seller.");
  return data;
}

export async function canActivateComuSeller(admin: ComuActor["admin"], sellerId: string) {
  const { data: seller, error: sellerError } = await admin.from("comu_sellers").select("id,status,verification_status").eq("id", sellerId).maybeSingle();
  if (sellerError) throw new PosApiError(500, "COMU_SELLER_LOOKUP_FAILED", "No se pudo cargar el seller.");
  if (!seller) return { ok: false as const, reason: "SELLER_NOT_FOUND", publishedListings: 0 };
  const { data: storefront, error: storefrontError } = await admin.from("comu_storefronts").select("id,status").eq("seller_id", sellerId).maybeSingle();
  if (storefrontError) throw new PosApiError(500, "COMU_STOREFRONT_LOOKUP_FAILED", "No se pudo validar el storefront.");
  if (!storefront || !["PUBLISHED", "ACTIVE"].includes(storefront.status)) return { ok: false as const, reason: "STOREFRONT_REQUIRED", publishedListings: 0 };
  const { data: listings, error } = await admin.from("comu_product_listings").select("id,product_id").eq("seller_id", sellerId).eq("status", "PUBLISHED");
  if (error) throw new PosApiError(500, "COMU_LISTINGS_LOOKUP_FAILED", "No se pudieron validar los listings.");
  const ids = (listings || []).map((item) => item.id);
  const { data: variants } = ids.length ? await admin.from("comu_variant_listings").select("listing_id,variant_id").in("listing_id", ids).eq("enabled", true) : { data: [] };
  const variantIds = (variants || []).map((item) => item.variant_id);
  const { data: posVariants } = variantIds.length ? await admin.from("pos_product_variants").select("id,product_id").in("id", variantIds).eq("active", true) : { data: [] };
  const productByVariant = new Map((posVariants || []).map((item) => [item.id, item.product_id]));
  const validIds = new Set((variants || []).filter((item) => productByVariant.get(item.variant_id) === listings.find((listing) => listing.id === item.listing_id)?.product_id).map((item) => item.listing_id));
  const count = ids.filter((id) => validIds.has(id)).length;
  if (seller.verification_status !== "VERIFIED") return { ok: false as const, reason: "SELLER_NOT_VERIFIED", publishedListings: count };
  if (count < 10) return { ok: false as const, reason: "MINIMUM_LISTINGS_REQUIRED", publishedListings: count };
  return { ok: true as const, publishedListings: count };
}
