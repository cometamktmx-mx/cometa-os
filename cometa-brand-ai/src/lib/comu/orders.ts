import { PosApiError } from "@/lib/pos/server";
import { requireComuBuyer, requireComuBuyerRead } from "./buyers";
import { readBuyerOrder, readBuyerOrderPage, legacyBuyerOrder } from "./buyer-orders";
import { getStripeClient } from "./stripe";
import { LocalTestShippingProvider } from "./shipping-provider";
import { allocateShipping, chooseServices, estimateTextilePackage } from "./shipping-pricing";
import { lineCents, moneyCents, mxn, unavailable } from "./pricing-money";

export function requireCheckoutShippingProvider() {
  // Until checkout supplies a validated authoritative quote, production must
  // fail before buyer upsert, order creation or reservation commitment.
  try {
    return new LocalTestShippingProvider();
  } catch {
    throw new PosApiError(409, "COMU_SHIPPING_PRODUCTION_QUOTE_REQUIRED", "Confirma una cotización de envío válida antes de continuar.");
  }
}

export async function createOrderFromReservation(reservationId: string, idempotencyKey: string, addressSnapshot: Record<string, unknown> | null, shippingMode: "STANDARD" | "FAST" = "STANDARD") {
  const provider = requireCheckoutShippingProvider();
  const { buyer, admin } = await requireComuBuyer();
  const { data: reservation, error: reservationError } = await admin.from("comu_inventory_reservations").select("id,status,expires_at").eq("id", reservationId).eq("buyer_id", buyer.id).maybeSingle();
  if (reservationError) throw new PosApiError(500, "COMU_RESERVATION_LOOKUP_FAILED", "No se pudo validar tu carrito.");
  if (!reservation) throw new PosApiError(404, "COMU_RESERVATION_NOT_FOUND", "La reserva no existe.");
  const { data: reservedItems, error: reservedItemsError } = await admin.from("comu_inventory_reservation_items").select("quantity,pricing_snapshot").eq("reservation_id", reservationId);
  if (reservedItemsError || !reservedItems?.length) unavailable();
  // Never reprice an immutable reservation. Reject legacy broken snapshots
  // before the RPC commits inventory or creates an order.
  for (const item of reservedItems) {
    const snapshot: unknown = item.pricing_snapshot;
    if (!snapshot || typeof snapshot !== "object" || !("finalUnitPrice" in snapshot)) unavailable();
    if (lineCents(moneyCents(snapshot.finalUnitPrice, true), item.quantity) <= 0) unavailable();
  }
  const { data, error } = await admin.rpc("comu_create_order_from_reservation", { p_reservation_id: reservationId, p_idempotency_key: idempotencyKey, p_shipping_address_snapshot: addressSnapshot, p_currency: "MXN" });
  if (error || !data) throw new PosApiError(409, error?.message || "COMU_ORDER_CREATE_FAILED", error?.message === "COMU_RESERVATION_EXPIRED" ? "La reserva expiró. Actualiza tu carrito." : "No se pudo crear la orden.");
  const { data: existingShipping } = await admin.from("comu_orders").select("shipping_snapshot,shipping_mode").eq("id", data.id).maybeSingle();
  if (existingShipping?.shipping_snapshot && Object.keys(existingShipping.shipping_snapshot).length) return data;
  const items = await admin.from("comu_order_items").select("quantity,subtotal").eq("order_id", data.id);
  if (items.error || !items.data?.length) throw new PosApiError(409, "COMU_ORDER_ITEMS_UNAVAILABLE", "No se pudieron validar los importes del pedido.");
  const subtotalCents = items.data.reduce((sum, item) => sum + moneyCents(item.subtotal, true), 0);
  const subtotal = mxn(subtotalCents);
  const packages = estimateTextilePackage({ itemCount: (items.data || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0), totalWeightG: Math.max(250, subtotal * 2) });
  const quotes = await provider.quote!({ orderId: data.id, destination: addressSnapshot, packages: packages.map((p) => ({ weightKg: p.weightKg, lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm })) });
  const selected = chooseServices(quotes.map((quote) => ({ ...quote, provider: "LOCAL_TEST", package: packages[0] })));
  const selectedQuote = shippingMode === "FAST" ? selected.fast : selected.standard;
  if (!selectedQuote) throw new PosApiError(409, "COMU_SHIPPING_QUOTE_UNAVAILABLE", "No hay una opción de envío disponible.");
  const allocation = allocateShipping(selectedQuote.cost, selected.standard?.cost || selectedQuote.cost, subtotal, {});
  const grandTotal = mxn(subtotalCents + moneyCents(allocation.buyerShippingCharge));
  const { data: quote, error: quoteError } = await admin.from("comu_shipping_quotes").insert({ order_id: data.id, provider: "LOCAL_TEST", service_code: selectedQuote.serviceCode, estimated_eta_days: selectedQuote.etaDays, provider_cost: allocation.providerCost, baseline_cost: allocation.baselineCost, buyer_shipping_charge: allocation.buyerShippingCharge, seller_shipping_subsidy: allocation.sellerShippingSubsidy, cometa_shipping_subsidy: allocation.cometaShippingSubsidy, package_estimate: packages }).select("id").single();
  if (quoteError || !quote) throw new PosApiError(409, "COMU_SHIPPING_SNAPSHOT_FAILED", "No se pudo guardar el envío.");
  const snapshot = { provider: "LOCAL_TEST", service: selectedQuote.serviceCode, shipping_mode: shippingMode, estimated_eta_days: selectedQuote.etaDays, estimated_provider_cost: allocation.providerCost, baseline_cost: allocation.baselineCost, buyer_shipping_charge: allocation.buyerShippingCharge, seller_shipping_subsidy: allocation.sellerShippingSubsidy, cometa_shipping_subsidy: allocation.cometaShippingSubsidy, package_estimate: packages, quote_id: quote.id, quote_version: 1 };
  const { error: snapshotError } = await admin.from("comu_orders").update({ shipping_total: allocation.buyerShippingCharge, grand_total: grandTotal, shipping_snapshot: snapshot, shipping_quote_id: quote.id, shipping_mode: shippingMode, updated_at: new Date().toISOString() }).eq("id", data.id);
  if (snapshotError) throw new PosApiError(409, "COMU_SHIPPING_SNAPSHOT_FAILED", "No se pudo congelar el envío.");
  return { ...data, shipping_total: allocation.buyerShippingCharge, grand_total: grandTotal, shipping_snapshot: snapshot, shipping_mode: shippingMode };
}

export async function getBuyerOrders(params = new URLSearchParams()) {
  const { details, pagination } = await readBuyerOrderPage(params);
  return { orders: details.map(legacyBuyerOrder), pagination };
}
export async function getBuyerOrder(orderId: string) { return readBuyerOrder(orderId); }

export async function cancelBuyerOrder(orderId: string, restock = false) {
  const { buyer, admin } = await requireComuBuyerRead();
  const { data: existing, error: lookupError } = await admin.from("comu_orders").select("id,status,comu_order_suborders(fulfillment_status)").eq("id", orderId).eq("buyer_id", buyer.id).maybeSingle();
  if (lookupError) throw new PosApiError(503, "COMU_ORDER_LOOKUP_FAILED", "No se pudo consultar el pedido.");
  if (!existing) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "La orden no existe.");
  if (restock || existing.status !== "PAYMENT_PENDING") throw new PosApiError(409, "COMU_ORDER_NOT_CANCELLABLE", "Esta orden no se puede cancelar desde tu cuenta.");
  const fulfillment = (existing.comu_order_suborders || []) as Array<{ fulfillment_status?: string }>;
  if (fulfillment.some((suborder) => suborder.fulfillment_status && !["PAID", "PREPARING"].includes(suborder.fulfillment_status))) throw new PosApiError(409, "COMU_ORDER_FULFILLMENT_LOCKED", "Esta orden ya está lista para entrega y no se puede cancelar desde tu cuenta.");
  const { data: payment, error: paymentError } = await admin.from("comu_payment_intents").select("stripe_payment_intent_id,status").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (paymentError) throw new PosApiError(503, "COMU_PAYMENT_LOOKUP_FAILED", "No se pudo validar el pago.");
  if (payment && !["REQUIRES_PAYMENT", "CANCELLED", "FAILED"].includes(payment.status)) throw new PosApiError(409, "COMU_ORDER_NOT_CANCELLABLE", "Esta orden no se puede cancelar desde tu cuenta.");
  if (payment?.stripe_payment_intent_id && !["SUCCEEDED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(payment.status)) {
    try { await getStripeClient().paymentIntents.cancel(payment.stripe_payment_intent_id); }
    catch { throw new PosApiError(503, "COMU_ORDER_CANCEL_UNAVAILABLE", "No se pudo cancelar el pago. Consulta el estado del pedido antes de reintentar."); }
  }
  const { data, error } = await admin.rpc("comu_cancel_order", { p_order_id: orderId });
  if (error || !data) throw new PosApiError(409, error?.message || "COMU_ORDER_CANCEL_FAILED", error?.message === "COMU_ORDER_NOT_CANCELLABLE" ? "Esta orden ya no se puede cancelar." : "No se pudo cancelar la orden.");
  return { id: orderId, status: data.status };
}

export async function getSellerOrders(sellerId: string) {
  const { requireSellerAccess } = await import("./seller-access");
  const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
  const { data, error } = await access.admin.from("comu_order_suborders").select("*,comu_orders(id,order_number,status,created_at),comu_order_items(*,comu_order_item_snapshots(*))").eq("seller_id", sellerId).order("created_at", { ascending: false });
  if (error) throw new PosApiError(500, "COMU_SELLER_ORDERS_FAILED", "No se pudieron cargar las órdenes del seller.");
  return data || [];
}
