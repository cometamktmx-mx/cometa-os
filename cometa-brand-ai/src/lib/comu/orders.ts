import { PosApiError } from "@/lib/pos/server";
import { requireComuBuyer } from "./buyers";
import { getStripeClient } from "./stripe";

export async function createOrderFromReservation(reservationId: string, idempotencyKey: string, addressSnapshot: Record<string, unknown> | null) {
  const { buyer, admin } = await requireComuBuyer();
  const { data: reservation } = await admin.from("comu_inventory_reservations").select("id,status,expires_at").eq("id", reservationId).eq("buyer_id", buyer.id).maybeSingle();
  if (!reservation) throw new PosApiError(404, "COMU_RESERVATION_NOT_FOUND", "La reserva no existe.");
  const { data, error } = await admin.rpc("comu_create_order_from_reservation", { p_reservation_id: reservationId, p_idempotency_key: idempotencyKey, p_shipping_address_snapshot: addressSnapshot, p_currency: "MXN" });
  if (error || !data) throw new PosApiError(409, error?.message || "COMU_ORDER_CREATE_FAILED", error?.message === "COMU_RESERVATION_EXPIRED" ? "La reserva expiró. Actualiza tu carrito." : "No se pudo crear la orden.");
  return data;
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

export async function cancelBuyerOrder(orderId: string) {
  const { buyer, admin } = await requireComuBuyer();
  const { data: existing } = await admin.from("comu_orders").select("id,status").eq("id", orderId).eq("buyer_id", buyer.id).maybeSingle();
  if (!existing) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "La orden no existe.");
  const { data: payment } = await admin.from("comu_payment_intents").select("stripe_payment_intent_id,status").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (payment?.stripe_payment_intent_id && !["SUCCEEDED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(payment.status)) {
    await getStripeClient().paymentIntents.cancel(payment.stripe_payment_intent_id);
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
