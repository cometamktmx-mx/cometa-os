import { PosApiError } from "@/lib/pos/server";
import { requireComuBuyer } from "./buyers";

export async function getOrCreateCart() {
  const { buyer, admin } = await requireComuBuyer();
  const { data: cart, error } = await admin.from("comu_carts").upsert({ buyer_id: buyer.id }, { onConflict: "buyer_id" }).select("*").single();
  if (error || !cart) throw new PosApiError(500, "COMU_CART_LOOKUP_FAILED", "No se pudo preparar tu carrito.");
  const { data: items, error: itemError } = await admin.from("comu_cart_items").select("*,comu_product_listings(id,product_id,status,public_slug,title_override,description_override,retail_price_override,wholesale_enabled,comu_sellers(id,public_name,slug,status,verification_status),comu_storefronts(status)),comu_variant_listings(id,listing_id,variant_id,enabled,price_override)").eq("cart_id", cart.id);
  if (itemError) throw new PosApiError(500, "COMU_CART_ITEMS_FAILED", "No se pudieron cargar los productos del carrito.");
  const variantIds = (items || []).map((item) => (item.comu_variant_listings as { variant_id?: string } | null)?.variant_id).filter((id): id is string => Boolean(id));
  const productIds = (items || []).map((item) => (item.comu_product_listings as { product_id?: string } | null)?.product_id).filter((id): id is string => Boolean(id));
  const [{ data: variants, error: variantError }, { data: products, error: productError }, { data: inventory, error: inventoryError }] = await Promise.all([
    variantIds.length ? admin.from("pos_product_variants").select("id,product_id,name,sku,price,active").in("id", variantIds) : { data: [], error: null },
    productIds.length ? admin.from("pos_products").select("id,name,active,sellable").in("id", productIds) : { data: [], error: null },
    variantIds.length ? admin.from("pos_inventory").select("variant_id,quantity,reserved_quantity").in("variant_id", variantIds) : { data: [], error: null },
  ]);
  if (variantError || productError || inventoryError) throw new PosApiError(500, "COMU_CART_ITEMS_FAILED", "No se pudieron cargar los productos del carrito.");
  const variantMap = new Map((variants || []).map((variant) => [variant.id, variant])); const productMap = new Map((products || []).map((product) => [product.id, product]));
  const hydrated = (items || []).map((item) => {
    const listing = item.comu_product_listings as { product_id?: string; status?: string; retail_price_override?: number | null; comu_sellers?: { status?: string; verification_status?: string } | null; comu_storefronts?: { status?: string } | null } | null;
    const variantListing = item.comu_variant_listings as { listing_id?: string; variant_id?: string; enabled?: boolean; price_override?: number | null } | null;
    const variant = variantMap.get(variantListing?.variant_id || "");
    const product = productMap.get(listing?.product_id || "");
    const price = Number(variantListing?.price_override ?? listing?.retail_price_override ?? variant?.price ?? 0);
    const quantity = Number(item.quantity);
    const isAvailable = Boolean(
      listing?.status === "PUBLISHED" && listing.comu_sellers?.status === "ACTIVE" && listing.comu_sellers.verification_status === "VERIFIED" &&
      ["ACTIVE", "PUBLISHED"].includes(listing.comu_storefronts?.status || "") &&
      variantListing?.enabled && variantListing.listing_id === item.listing_id && variant?.active && variant.product_id === product?.id && product?.active && product.sellable &&
      Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && quantity >= 1 &&
      (inventory || []).some((row) => row.variant_id === variantListing.variant_id && Number(row.quantity) - Number(row.reserved_quantity) >= quantity)
    );
    return { ...item, effective_price: price, product_name: product?.name || "Producto", is_available: isAvailable };
  });
  return { buyer, admin, cart, items: hydrated };
}

export async function addCartItem(input: { listingId: string; variantListingId: string; quantity: number }) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new PosApiError(400, "COMU_INVALID_QUANTITY", "La cantidad debe ser mayor a cero.");
  const { cart, admin } = await getOrCreateCart();
  const { data: listing } = await admin.from("comu_product_listings").select("id,seller_id,status,storefront_id,comu_sellers!inner(status,verification_status),comu_storefronts!inner(status)").eq("id", input.listingId).maybeSingle();
  const { data: variant } = await admin.from("comu_variant_listings").select("id,listing_id,variant_id,enabled").eq("id", input.variantListingId).eq("listing_id", input.listingId).maybeSingle();
  if (!listing || listing.status !== "PUBLISHED" || !variant?.enabled) throw new PosApiError(409, "COMU_LISTING_UNAVAILABLE", "Este producto ya no está disponible.");
  const seller = listing.comu_sellers as { status?: string; verification_status?: string } | null;
  const storefront = listing.comu_storefronts as { status?: string } | null;
  if (seller?.status !== "ACTIVE" || seller.verification_status !== "VERIFIED" || !["ACTIVE", "PUBLISHED"].includes(storefront?.status || "")) throw new PosApiError(409, "COMU_LISTING_UNAVAILABLE", "Este producto ya no está disponible.");
  const { data, error } = await admin.from("comu_cart_items").upsert({ cart_id: cart.id, seller_id: listing.seller_id, listing_id: input.listingId, variant_listing_id: input.variantListingId, quantity: input.quantity }, { onConflict: "cart_id,variant_listing_id" }).select("*").single();
  if (error || !data) throw new PosApiError(500, "COMU_CART_UPDATE_FAILED", "No se pudo actualizar el carrito.");
  return getOrCreateCart();
}

export async function updateCartItem(itemId: string, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new PosApiError(400, "COMU_INVALID_QUANTITY", "La cantidad debe ser mayor a cero.");
  const { cart, admin } = await getOrCreateCart();
  const { error } = await admin.from("comu_cart_items").update({ quantity, updated_at: new Date().toISOString() }).eq("id", itemId).eq("cart_id", cart.id);
  if (error) throw new PosApiError(500, "COMU_CART_UPDATE_FAILED", "No se pudo actualizar el carrito.");
  return getOrCreateCart();
}

export async function removeCartItem(itemId: string) {
  const { cart, admin } = await getOrCreateCart();
  const { error } = await admin.from("comu_cart_items").delete().eq("id", itemId).eq("cart_id", cart.id);
  if (error) throw new PosApiError(500, "COMU_CART_UPDATE_FAILED", "No se pudo actualizar el carrito.");
  return getOrCreateCart();
}
