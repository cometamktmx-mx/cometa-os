import { NextResponse } from "next/server";
import { requireSellerAccess } from "@/lib/comu/seller-access";
import { PosApiError } from "@/lib/pos/server";
import { LocalTestShippingProvider } from "@/lib/comu/shipping-provider";
import { allocateShipping, chooseServices, estimateTextilePackage } from "@/lib/comu/shipping-pricing";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; const body = await request.json() as { sellerId?: string };
    if (!body.sellerId) throw new PosApiError(400, "COMU_SELLER_REQUIRED", "Falta la tienda.");
    const access = await requireSellerAccess(body.sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
    const { data: suborder } = await access.admin.from("comu_order_suborders").select("id,order_id,seller_id,fulfillment_route").eq("id", id).eq("seller_id", body.sellerId).maybeSingle();
    if (!suborder || suborder.fulfillment_route !== "DIRECT") throw new PosApiError(403, "COMU_DIRECT_NOT_ELIGIBLE", "Este pedido no permite cotización directa.");
    const { data: order } = await access.admin.from("comu_orders").select("shipping_address_snapshot").eq("id", suborder.order_id).maybeSingle();
    const { data: items, error: itemsError } = await access.admin.from("comu_order_items").select("product_id,quantity,subtotal,listing_id,comu_product_listings(storefront_id)").eq("suborder_id", id);
    if (itemsError || !items?.length) throw new PosApiError(404, "COMU_DIRECT_ITEMS_NOT_FOUND", "No se encontraron piezas para cotizar.");
    const productIds = items.map(item => String(item.product_id));
    const { data: profiles } = await access.admin.from("comu_shipping_product_profiles").select("product_id,estimated_weight_g,override_weight_g").in("product_id", productIds);
    const profileByProduct = new Map((profiles || []).map(profile => [String(profile.product_id), profile]));
    const itemCount = items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const totalWeightG = items.reduce((sum, item) => { const profile = profileByProduct.get(String(item.product_id)); return sum + Number(profile?.override_weight_g ?? profile?.estimated_weight_g ?? 250) * Number(item.quantity); }, 0);
    const packages = estimateTextilePackage({ itemCount, totalWeightG });
    const quotes = await new LocalTestShippingProvider().quote!({ orderId: suborder.order_id, destination: order?.shipping_address_snapshot || null, packages: packages.map(({ weightKg, lengthCm, widthCm, heightCm }) => ({ weightKg, lengthCm, widthCm, heightCm })) });
    const selected = chooseServices(quotes.map(quote => ({ ...quote, provider: "LOCAL_TEST", package: packages[0] })));
    const storefrontId = (items[0].comu_product_listings as { storefront_id?: string } | null)?.storefront_id;
    const { data: policy } = storefrontId ? await access.admin.from("comu_shipping_policies").select("buyer_pays_percent,free_shipping_threshold,seller_subsidy_percent,seller_max_subsidy,cometa_subsidy").eq("storefront_id", storefrontId).eq("mode", "RETAIL").maybeSingle() : { data: null };
    const subtotal = items.reduce((sum, item) => sum + Number(item.subtotal), 0);
    const options = [selected.standard, selected.fast].filter(Boolean).map(quote => ({ ...quote, allocation: allocateShipping(quote!.cost, selected.standard?.cost ?? quote!.cost, subtotal, policy ? { buyerPaysPercent: Number(policy.buyer_pays_percent), freeShippingThreshold: policy.free_shipping_threshold == null ? null : Number(policy.free_shipping_threshold), sellerSubsidyPercent: Number(policy.seller_subsidy_percent), sellerMaxSubsidy: policy.seller_max_subsidy == null ? null : Number(policy.seller_max_subsidy), cometaSubsidy: Number(policy.cometa_subsidy) } : undefined), packageEstimate: packages }));
    return NextResponse.json({ ok: true, orderId: suborder.order_id, options });
  } catch (error) { const e = error instanceof PosApiError ? error : new PosApiError(502, "COMU_DIRECT_QUOTE_FAILED", "No se pudo cotizar el envío directo."); return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status }); }
}
