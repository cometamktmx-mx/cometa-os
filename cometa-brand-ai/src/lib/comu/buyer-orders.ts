import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PosApiError } from "@/lib/pos/server";
import { requireComuActor } from "./seller-access";
import type { BuyerOrderDetail, BuyerOrderSource, BuyerOrderList } from "./buyer-order-contract";
import { presentBuyerOrder, summarizeBuyerOrder } from "./buyer-order-presentation";

export const buyerOrderHeaders = { "Cache-Control": "private, no-store" };
export const isBuyerOrderId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function rpcFailure(error: { message: string } | null) {
  if (error?.message.includes("COMU_ORDER_NOT_FOUND")) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "Pedido no disponible.");
  if (error?.message.includes("COMU_BUYER_READ_DENIED")) throw new PosApiError(403, "COMU_BUYER_READ_DENIED", "Tu cuenta no tiene acceso.");
  throw new PosApiError(503, "COMU_BUYER_ORDERS_UNAVAILABLE", "No pudimos consultar tus pedidos.");
}
export function buyerOrderFailure(error: unknown) {
  if (error instanceof Error && "code" in error && error.code === "COMU_FEATURE_DISABLED") return { status: 404, body: { ok: false, code: "COMU_FEATURE_DISABLED", error: "Pedidos no disponibles." } };
  const status = error instanceof PosApiError ? error.status : 500;
  return { status, body: { ok: false, code: error instanceof PosApiError ? error.code : "COMU_BUYER_ORDERS_UNAVAILABLE", error: status >= 500 ? "No pudimos consultar tus pedidos." : error instanceof Error ? error.message : "Pedido no disponible." } };
}
export function buyerOrderQuery(params: URLSearchParams) {
  const number = (name: string, fallback: number, max: number) => {
    const input = params.get(name) ?? String(fallback);
    if (!/^\d+$/.test(input) || Number(input) < 1 || Number(input) > max) throw new PosApiError(400, "COMU_BUYER_INPUT_INVALID", "Filtros no válidos.");
    return Number(input);
  };
  const days = number("days", 90, 90), page = number("page", 1, 10000), pageSize = number("pageSize", 20, 50);
  const filter = params.get("status") ?? "ALL", search = (params.get("search") ?? "").trim();
  if (![30, 90].includes(days) || !["ALL", "PREPARING", "IN_TRANSIT", "DELIVERED", "ISSUE", "CANCELLED"].includes(filter) || search.length > 80) throw new PosApiError(400, "COMU_BUYER_INPUT_INVALID", "Filtros no válidos.");
  return { p_days: days, p_filter: filter, p_search: search, p_page: page, p_size: pageSize };
}
export async function readBuyerOrderPage(params: URLSearchParams): Promise<{ details: BuyerOrderDetail[]; pagination: BuyerOrderList["pagination"] }> {
  await requireComuActor(); // Same active-profile policy as N1; no buyer/profile provisioning.
  const query = buyerOrderQuery(params);
  const { data, error } = await (await createClient()).rpc("comu_buyer_orders_read_b1", query);
  if (error || !data || !Array.isArray(data.orders) || !data.pagination) rpcFailure(error);
  const result = data as { orders: BuyerOrderSource[]; pagination: BuyerOrderList["pagination"] };
  return { details: result.orders.map(order => presentBuyerOrder(order)), pagination: result.pagination };
}
export async function readBuyerOrders(params: URLSearchParams): Promise<BuyerOrderList> {
  const { details, pagination } = await readBuyerOrderPage(params);
  return { orders: details.map(summarizeBuyerOrder), pagination };
}
export async function readBuyerOrder(id: string, params = new URLSearchParams()): Promise<BuyerOrderDetail> {
  const actor = await requireComuActor();
  if (!isBuyerOrderId(id)) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "Pedido no disponible.");
  id = id.toLowerCase();
  const { data, error } = await (await createClient()).rpc("comu_buyer_order_read_b1", { p_order: id });
  if (error || !data || data.orderId !== id) rpcFailure(error);
  let focus = params.get("suborderId");
  const notificationId = params.get("notificationId");
  if (notificationId) {
    if (!isBuyerOrderId(notificationId)) throw new PosApiError(400, "COMU_BUYER_INPUT_INVALID", "Notificación no válida.");
    // Optional focus only, after order authorization. No N1 schema/dispatch changes.
    const { data: notification, error: lookupError } = await actor.admin.from("comu_notifications")
      .select("suborder_id").eq("id", notificationId).eq("recipient_user_id", actor.userId).eq("audience", "BUYER").eq("order_id", id).eq("visibility", "VISIBLE").maybeSingle();
    if (lookupError) throw new PosApiError(503, "COMU_NOTIFICATIONS_UNAVAILABLE", "No se pudo consultar la notificación.");
    if (!notification) throw new PosApiError(404, "COMU_NOTIFICATION_NOT_FOUND", "Notificación no disponible.");
    focus = notification.suborder_id;
  }
  const source = data as BuyerOrderSource;
  if (focus && !source.suborders.some(s => s.suborderId === focus)) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "Pedido no disponible.");
  return presentBuyerOrder(source, focus);
}
export function legacyBuyerOrder(order: BuyerOrderDetail) {
  return { id: order.orderId, order_number: order.orderNumber, created_at: order.createdAt, currency: order.currency, grand_total: order.total,
    status: order.payment.confirmed ? "PAID" : order.presentationStatus === "CANCELLED" ? "CANCELLED" : "PAYMENT_PENDING",
    fulfillment_status: order.presentationStatus === "DELIVERED" ? "DELIVERED" : ["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(order.presentationStatus) ? "SHIPPED" : "PREPARING",
    presentationStatus: order.presentationStatus, presentationLabel: order.presentationLabel,
    comu_order_suborders: order.suborders.map(s => ({ id: s.suborderId, comu_sellers: { public_name: s.sellerName } })),
    comu_order_items: order.suborders.flatMap(s => s.products.map(p => ({ id: p.id, quantity: p.quantity, comu_order_item_snapshots: [{ snapshot: { listingTitle: p.title, image: p.image } }] }))) };
}
