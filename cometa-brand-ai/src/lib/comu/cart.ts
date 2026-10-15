import { PosApiError } from "@/lib/pos/server";
import { requireComuBuyer } from "./buyers";
import { lineCents, moneyCents, mxn, roundedRatio, scaledInteger, unavailable } from "./pricing-money";

function calculateCartPricing(admin: ReturnType<typeof import("@/lib/pos/server").getAdminClient>, rawItems: Array<Record<string, unknown>>) {
  return (async () => {
    if (!rawItems.length) return { lines: [] as Array<Record<string, unknown>> };
    const ids = [...new Set(rawItems.map((item) => String(item.listing_id)))];
    const [{ data: listings, error: le }, { data: policies, error: pe }, { data: tiers, error: te }, { data: overrides, error: oe }] = await Promise.all([
      admin.from("comu_product_listings").select("id,product_id,seller_id,storefront_id,retail_price_override").in("id", ids),
      admin.from("comu_storefront_wholesale_policies").select("storefront_id,enabled,minimum_quantity,allow_product_mix"),
      admin.from("comu_wholesale_tiers").select("id,storefront_id,product_id,min_quantity,pricing_mode,value").eq("active", true),
      admin.from("comu_product_wholesale_overrides").select("listing_id,mode,allow_product_mix").in("listing_id", ids),
    ]);
    if (le || pe || te || oe) throw new PosApiError(500, "COMU_WHOLESALE_LOOKUP_FAILED", "No se pudieron calcular los precios.");
    const lm = new Map((listings || []).map((row) => [String(row.id), row])); const pm = new Map((policies || []).map((row) => [String(row.storefront_id), row])); const om = new Map((overrides || []).map((row) => [String(row.listing_id), row]));
    const quantities = new Map<string, number>(); const sellerTotals = new Map<string, number>(); for (const item of rawItems) { const l = lm.get(String(item.listing_id)); if (l) { quantities.set(`${l.seller_id}:${l.product_id}`, (quantities.get(`${l.seller_id}:${l.product_id}`) || 0) + Number(item.quantity || 0)); sellerTotals.set(String(l.seller_id), (sellerTotals.get(String(l.seller_id)) || 0) + Number(item.quantity || 0)); } }
    const lines = rawItems.map((item) => {
      const listing = lm.get(String(item.listing_id));
      if (!listing) unavailable();
      // effective_price is hydrated exclusively from the selected POS variant
      // and the existing variant/listing retail overrides, never browser input.
      const retailCents = moneyCents(item.effective_price, true);
      const policy = pm.get(String(listing.storefront_id));
      const override = om.get(String(item.listing_id));
      const custom = override?.mode === "CUSTOM";
      const mixStore = Boolean(override?.allow_product_mix ?? policy?.allow_product_mix);
      const qualified = mixStore ? sellerTotals.get(String(listing.seller_id)) || 0 : quantities.get(listing.seller_id + ":" + listing.product_id) || 0;
      const tier = (tiers || []).filter((candidate) => candidate.storefront_id === listing.storefront_id && candidate.product_id === (custom ? listing.product_id : null) && Number(candidate.min_quantity) <= qualified).sort((a, b) => Number(b.min_quantity) - Number(a.min_quantity))[0];
      const threshold = custom ? Number(tier?.min_quantity || 0) : Number(policy?.minimum_quantity || 6);
      let unitCents = retailCents;
      const applicable = Boolean((custom || policy?.enabled) && override?.mode !== "DISABLED" && qualified >= threshold && tier);
      if (applicable && tier) {
        if (tier.pricing_mode === "UNIT_PRICE") unitCents = moneyCents(tier.value, true);
        else if (tier.pricing_mode === "AMOUNT_OFF") unitCents = retailCents - moneyCents(tier.value);
        else if (tier.pricing_mode === "PERCENT_OFF") {
          const basisPoints = scaledInteger(tier.value, 2);
          if (basisPoints > 10000) unavailable();
          unitCents = roundedRatio(retailCents, 10000 - basisPoints, 10000);
        } else unavailable();
      }
      // COMU has no certified free-product checkout mechanism.
      if (unitCents <= 0) unavailable();
      const subtotalCents = lineCents(unitCents, item.quantity);
      const retailSubtotalCents = lineCents(retailCents, item.quantity);
      const mode = applicable && unitCents !== retailCents ? "WHOLESALE_MIX" : "RETAIL";
      const tierId = applicable ? tier?.id || null : null;
      const unit = mxn(unitCents), retail = mxn(retailCents);
      return { cartItemId: String(item.id), unitPrice: unit, retailUnitPrice: retail,
        discount: (retailSubtotalCents - subtotalCents) / 100, qualifiedQuantity: qualified, mode, tierId,
        pricingSnapshot: { retailUnitPrice: retail, finalUnitPrice: unit, mode, tierId, qualifiedQuantity: qualified } };
    });
    return { lines };
  })();
}

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
    const price = mxn(moneyCents(variantListing?.price_override ?? listing?.retail_price_override ?? variant?.price, true));
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
  const pricing = await calculateCartPricing(admin, hydrated as unknown as Array<Record<string, unknown>>);
  const priced = hydrated.map((item) => {
    const line = pricing.lines.find((candidate) => candidate.cartItemId === item.id);
    return { ...item, effective_price: line?.unitPrice ?? item.effective_price, retail_price: line?.retailUnitPrice ?? item.effective_price, discount: line?.discount ?? 0, pricing_snapshot: line?.pricingSnapshot ?? null, wholesale_mode: line?.mode ?? "RETAIL", qualified_quantity: line?.qualifiedQuantity ?? 0 };
  });
  return { buyer, admin, cart: { ...cart, pricing }, items: priced };
}

export async function addCartItem(input: { listingId: string; variantListingId: string; quantity: number; purchaseMode?: "PIECES" | "RUN"; runId?: string | null; runCount?: number }) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new PosApiError(400, "COMU_INVALID_QUANTITY", "La cantidad debe ser mayor a cero.");
  const { cart, admin } = await getOrCreateCart();
  const { data: listing } = await admin.from("comu_product_listings").select("id,seller_id,status,storefront_id,comu_sellers!inner(status,verification_status),comu_storefronts!inner(status)").eq("id", input.listingId).maybeSingle();
  const { data: variant } = await admin.from("comu_variant_listings").select("id,listing_id,variant_id,enabled").eq("id", input.variantListingId).eq("listing_id", input.listingId).maybeSingle();
  if (!listing || listing.status !== "PUBLISHED" || !variant?.enabled) throw new PosApiError(409, "COMU_LISTING_UNAVAILABLE", "Este producto ya no está disponible.");
  const seller = listing.comu_sellers as { status?: string; verification_status?: string } | null;
  const storefront = listing.comu_storefronts as { status?: string } | null;
  if (seller?.status !== "ACTIVE" || seller.verification_status !== "VERIFIED" || !["ACTIVE", "PUBLISHED"].includes(storefront?.status || "")) throw new PosApiError(409, "COMU_LISTING_UNAVAILABLE", "Este producto ya no está disponible.");
  const { data, error } = await admin.from("comu_cart_items").upsert({ cart_id: cart.id, seller_id: listing.seller_id, listing_id: input.listingId, variant_listing_id: input.variantListingId, quantity: input.quantity, purchase_mode: input.purchaseMode || "PIECES", run_id: input.runId || null, run_count: input.runCount || 1 }, { onConflict: "cart_id,variant_listing_id" }).select("*").single();
  if (error || !data) throw new PosApiError(500, "COMU_CART_UPDATE_FAILED", "No se pudo actualizar el carrito.");
  return getOrCreateCart();
}

export async function updateCartItem(itemId: string, quantity: number, purchaseMode?: "PIECES" | "RUN", runId?: string | null, runCount?: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new PosApiError(400, "COMU_INVALID_QUANTITY", "La cantidad debe ser mayor a cero.");
  const { cart, admin } = await getOrCreateCart();
  const { error } = await admin.from("comu_cart_items").update({ quantity, purchase_mode: purchaseMode || "PIECES", run_id: runId || null, run_count: runCount || 1, updated_at: new Date().toISOString() }).eq("id", itemId).eq("cart_id", cart.id);
  if (error) throw new PosApiError(500, "COMU_CART_UPDATE_FAILED", "No se pudo actualizar el carrito.");
  return getOrCreateCart();
}

export async function removeCartItem(itemId: string) {
  const { cart, admin } = await getOrCreateCart();
  const { error } = await admin.from("comu_cart_items").delete().eq("id", itemId).eq("cart_id", cart.id);
  if (error) throw new PosApiError(500, "COMU_CART_UPDATE_FAILED", "No se pudo actualizar el carrito.");
  return getOrCreateCart();
}
