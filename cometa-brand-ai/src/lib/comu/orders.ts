import { PosApiError } from "@/lib/pos/server";
import { requireComuBuyer } from "./buyers";
import { getStripeClient } from "./stripe";
import { LocalTestShippingProvider } from "./shipping-provider";
import { allocateShipping, chooseServices, estimateTextilePackage } from "./shipping-pricing";

export async function createOrderFromReservation(reservationId: string, idempotencyKey: string, addressSnapshot: Record<string, unknown> | null, shippingMode: "STANDARD" | "FAST" = "STANDARD") {
  const { buyer, admin } = await requireComuBuyer();
  const { data: reservation } = await admin.from("comu_inventory_reservations").select("id,status,expires_at").eq("id", reservationId).eq("buyer_id", buyer.id).maybeSingle();
  if (!reservation) throw new PosApiError(404, "COMU_RESERVATION_NOT_FOUND", "La reserva no existe.");
  const { data, error } = await admin.rpc("comu_create_order_from_reservation", { p_reservation_id: reservationId, p_idempotency_key: idempotencyKey, p_shipping_address_snapshot: addressSnapshot, p_currency: "MXN" });
  if (error || !data) throw new PosApiError(409, error?.message || "COMU_ORDER_CREATE_FAILED", error?.message === "COMU_RESERVATION_EXPIRED" ? "La reserva expiró. Actualiza tu carrito." : "No se pudo crear la orden.");
  const { data: existingShipping } = await admin.from("comu_orders").select("shipping_snapshot,shipping_mode").eq("id", data.id).maybeSingle();
  if (existingShipping?.shipping_snapshot && Object.keys(existingShipping.shipping_snapshot).length) return data;
  const items = await admin.from("comu_order_items").select("quantity,subtotal").eq("order_id", data.id);
  const subtotal = (items.data || []).reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const packages = estimateTextilePackage({ itemCount: (items.data || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0), totalWeightG: Math.max(250, subtotal * 2) });
  const provider = new LocalTestShippingProvider();
  const quotes = await provider.quote!({ orderId: data.id, destination: addressSnapshot, packages: packages.map((p) => ({ weightKg: p.weightKg, lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm })) });
  const selected = chooseServices(quotes.map((quote) => ({ ...quote, provider: "LOCAL_TEST", package: packages[0] })));
  const selectedQuote = shippingMode === "FAST" ? selected.fast : selected.standard;
  if (!selectedQuote) throw new PosApiError(409, "COMU_SHIPPING_QUOTE_UNAVAILABLE", "No hay una opción de envío disponible.");
  const allocation = allocateShipping(selectedQuote.cost, selected.standard?.cost || selectedQuote.cost, subtotal, {});
  const { data: quote, error: quoteError } = await admin.from("comu_shipping_quotes").insert({ order_id: data.id, provider: "LOCAL_TEST", service_code: selectedQuote.serviceCode, estimated_eta_days: selectedQuote.etaDays, provider_cost: allocation.providerCost, baseline_cost: allocation.baselineCost, buyer_shipping_charge: allocation.buyerShippingCharge, seller_shipping_subsidy: allocation.sellerShippingSubsidy, cometa_shipping_subsidy: allocation.cometaShippingSubsidy, package_estimate: packages }).select("id").single();
  if (quoteError || !quote) throw new PosApiError(409, "COMU_SHIPPING_SNAPSHOT_FAILED", "No se pudo guardar el envío.");
  const snapshot = { provider: "LOCAL_TEST", service: selectedQuote.serviceCode, shipping_mode: shippingMode, estimated_eta_days: selectedQuote.etaDays, estimated_provider_cost: allocation.providerCost, baseline_cost: allocation.baselineCost, buyer_shipping_charge: allocation.buyerShippingCharge, seller_shipping_subsidy: allocation.sellerShippingSubsidy, cometa_shipping_subsidy: allocation.cometaShippingSubsidy, package_estimate: packages, quote_id: quote.id, quote_version: 1 };
  const { error: snapshotError } = await admin.from("comu_orders").update({ shipping_total: allocation.buyerShippingCharge, grand_total: subtotal + allocation.buyerShippingCharge, shipping_snapshot: snapshot, shipping_quote_id: quote.id, shipping_mode: shippingMode, updated_at: new Date().toISOString() }).eq("id", data.id);
  if (snapshotError) throw new PosApiError(409, "COMU_SHIPPING_SNAPSHOT_FAILED", "No se pudo congelar el envío.");
  return { ...data, shipping_total: allocation.buyerShippingCharge, grand_total: subtotal + allocation.buyerShippingCharge, shipping_snapshot: snapshot, shipping_mode: shippingMode };
}

export async function getBuyerOrders() {
  const { buyer, admin } = await requireComuBuyer();
  const { data, error } = await admin.from("comu_orders").select("*,comu_order_suborders(*,comu_sellers(public_name,slug)),comu_order_items(*,comu_order_item_snapshots(*))").eq("buyer_id", buyer.id).order("created_at", { ascending: false });
  if (error) throw new PosApiError(500, "COMU_ORDERS_LOOKUP_FAILED", "No se pudieron cargar tus órdenes.");
  return { buyer, admin, orders: data || [] };
}

export async function getBuyerOrder(orderId: string) {
  const { buyer, admin } = await requireComuBuyer();
  const { data, error } = await admin.from("comu_orders").select("*,comu_order_suborders(*,comu_sellers(public_name,slug)),comu_order_items(*,comu_order_item_snapshots(*))").eq("id", orderId).eq("buyer_id", buyer.id).maybeSingle();
  if (error) throw new PosApiError(500, "COMU_ORDER_LOOKUP_FAILED", "No se pudo cargar la orden.");
  if (!data) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "La orden no existe.");
  return data;
}

export async function cancelBuyerOrder(orderId: string, restock = false) {
  const { buyer, admin } = await requireComuBuyer();
  const { data: existing } = await admin.from("comu_orders").select("id,status,comu_order_suborders(fulfillment_status)").eq("id", orderId).eq("buyer_id", buyer.id).maybeSingle();
  if (!existing) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "La orden no existe.");
  const fulfillment = (existing.comu_order_suborders || []) as Array<{ fulfillment_status?: string }>;
  if (fulfillment.some((suborder) => suborder.fulfillment_status && !["PAID", "PREPARING"].includes(suborder.fulfillment_status))) throw new PosApiError(409, "COMU_ORDER_FULFILLMENT_LOCKED", "Esta orden ya está lista para entrega y no se puede cancelar desde tu cuenta.");
  const { data: payment } = await admin.from("comu_payment_intents").select("stripe_payment_intent_id,status").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (payment?.stripe_payment_intent_id && !["SUCCEEDED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(payment.status)) {
    await getStripeClient().paymentIntents.cancel(payment.stripe_payment_intent_id);
  }
  if (restock && existing.status !== "PAYMENT_PENDING") {
    const { data: restocked, error: restockError } = await admin.rpc("comu_restock_paid_order_v1", { p_order_id: orderId });
    if (restockError) throw new PosApiError(409, restockError.message || "COMU_ORDER_RESTOCK_FAILED", "No se pudo reintegrar el inventario.");
    return { order_id: orderId, restocked_items: restocked, status: "CANCELLED" };
  }
  const { data, error } = await admin.rpc("comu_cancel_order", { p_order_id: orderId });
  if (error || !data) throw new PosApiError(409, error?.message || "COMU_ORDER_CANCEL_FAILED", error?.message === "COMU_ORDER_NOT_CANCELLABLE" ? "Esta orden ya no se puede cancelar." : "No se pudo cancelar la orden.");
  return data;
}

export async function getSellerOrders(sellerId: string) {
  const { requireSellerAccess } = await import("./seller-access");
  const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
  const { data, error } = await access.admin.from("comu_order_suborders").select("*,comu_orders(id,order_number,status,created_at),comu_order_items(*,comu_order_item_snapshots(*))").eq("seller_id", sellerId).order("created_at", { ascending: false });
  if (error) throw new PosApiError(500, "COMU_SELLER_ORDERS_FAILED", "No se pudieron cargar las órdenes del seller.");
  return data || [];
}
