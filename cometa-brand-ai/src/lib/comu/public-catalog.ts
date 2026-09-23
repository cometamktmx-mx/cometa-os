import { getAdminClient } from "@/lib/pos/server";
import { getAvailability, getAvailableQuantities } from "./inventory";

export async function getPublicCatalog(search?: string) {
  const admin = getAdminClient();
  const { data: listings, error } = await admin.from("comu_product_listings").select("id,public_slug,title_override,description_override,public_category,retail_price_override,wholesale_enabled,seller_id,storefront_id,product_id").eq("status", "PUBLISHED").order("published_at", { ascending: false, nullsFirst: false });
  if (error || !listings?.length) return [];
  const sellerIds = [...new Set(listings.map((item) => item.seller_id))];
  const productIds = [...new Set(listings.map((item) => item.product_id))];
  const [{ data: sellers }, { data: storefronts }, { data: products }, { data: variants }, { data: media }, { data: policies }, { data: tiers }, { data: overrides }, { data: runs }] = await Promise.all([
    admin.from("comu_sellers").select("id,slug,public_name,logo_url,cover_url,city,state").in("id", sellerIds).eq("status", "ACTIVE").eq("verification_status", "VERIFIED"),
    admin.from("comu_storefronts").select("id,slug,name,status").in("id", [...new Set(listings.map((item) => item.storefront_id))]).in("status", ["PUBLISHED", "ACTIVE"]),
    admin.from("pos_products").select("id,name,description,image_url,brand_slug").in("id", productIds).eq("active", true).eq("sellable", true),
    admin.from("comu_variant_listings").select("id,listing_id,variant_id,enabled,price_override").in("listing_id", listings.map((item) => item.id)).eq("enabled", true),
    admin.from("comu_product_media").select("id,listing_id,variant_id,public_url,sort_order,is_primary").in("listing_id", listings.map((item) => item.id)).order("sort_order"),
    admin.from("comu_storefront_wholesale_policies").select("storefront_id,enabled,minimum_quantity,allow_product_mix,allow_variant_mix"),
    admin.from("comu_wholesale_tiers").select("id,storefront_id,product_id,min_quantity,pricing_mode,value").eq("active", true),
    admin.from("comu_product_wholesale_overrides").select("listing_id,mode,allow_product_mix,allow_variant_mix,allow_pieces,allow_run,corrida_enabled" ).in("listing_id", listings.map((item) => item.id)),
    admin.from("comu_product_runs").select("id,listing_id,name,active,comu_product_run_items(variant_listing_id,variant_id,quantity_per_run)").in("listing_id", listings.map((item) => item.id)).eq("active", true),
  ]);
  const validSellers = new Map((sellers || []).map((item) => [item.id, item]));
  const validStorefronts = new Map((storefronts || []).map((item) => [item.id, item]));
  const productMap = new Map((products || []).map((item) => [item.id, item]));
  const variantIds = (variants || []).map((item) => item.variant_id);
  const { data: variantRows } = variantIds.length ? await admin.from("pos_product_variants").select("id,name,sku,price,image_url,attributes").in("id", variantIds).eq("active", true) : { data: [] };
  const variantMap = new Map((variantRows || []).map((item) => [item.id, item]));
  const availability = await getAvailability(admin, variantIds); const availableQuantities = await getAvailableQuantities(admin, variantIds);
  return listings.filter((listing) => validSellers.has(listing.seller_id) && validStorefronts.has(listing.storefront_id) && productMap.has(listing.product_id)).map((listing) => { const run = (runs || []).find((candidate) => candidate.listing_id === listing.id) as { comu_product_run_items?: Array<{ variant_id: string; quantity_per_run: number }> } | undefined; const runItems = run?.comu_product_run_items || []; const availableRuns = runItems.length ? Math.min(...runItems.map((item) => Math.floor((availableQuantities.get(item.variant_id) || 0) / Number(item.quantity_per_run)))) : 0; return { ...listing, seller: validSellers.get(listing.seller_id), storefront: validStorefronts.get(listing.storefront_id), product: productMap.get(listing.product_id), wholesale: { policy: (policies || []).find((policy) => policy.storefront_id === listing.storefront_id) || null, override: (overrides || []).find((override) => override.listing_id === listing.id) || null, tiers: (tiers || []).filter((tier) => tier.storefront_id === listing.storefront_id && (tier.product_id === listing.product_id || tier.product_id === null)), run: run ? { ...run, availableRuns } : null }, media: (media || []).filter((item) => item.listing_id === listing.id), variants: (variants || []).filter((variant) => variant.listing_id === listing.id).map((variant) => ({ ...variant, productVariant: variantMap.get(variant.variant_id), availability: availability.get(variant.variant_id) })) }; }).filter((listing) => !search || `${listing.title_override || listing.product?.name} ${listing.seller?.public_name}`.toLowerCase().includes(search.toLowerCase()));
}

export async function getPublicListing(slug: string) {
  const rows = await getPublicCatalog();
  return rows.find((item) => item.public_slug === slug) || null;
}
