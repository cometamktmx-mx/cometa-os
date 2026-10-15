// Presentation only. SQL revalidates identity, payment and every mutation.
export type PaymentPresentation = "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED" | "PARTIALLY_REFUNDED" | "REFUNDED" | "DISPUTED" | "REVIEW";
export type OrderAction = { key: "START_PREPARING" | "MARK_READY_FOR_HUB" | "MARK_HANDED_TO_HUB" | "MARK_READY_TO_SHIP" | "SHIP_DIRECT"; target: string; label: string };
export type OrderActionContext = { authorized: boolean; role: string; paymentConfirmed: boolean; fulfillmentState: string; route: string; shippingMode: string; shipmentPrepared: boolean };
export function getOrderPaymentPresentation(commercial: string, payment: string | null, confirmed: boolean, condition?: string | null): PaymentPresentation {
  if (condition === "DISPUTED" || condition === "REFUNDED" || condition === "PARTIALLY_REFUNDED" || condition === "REVIEW") return condition;
  if (commercial === "DISPUTED" || payment === "DISPUTED") return "DISPUTED";
  if (commercial === "REFUNDED" || payment === "REFUNDED") return "REFUNDED";
  if (commercial === "PARTIALLY_REFUNDED" || payment === "PARTIALLY_REFUNDED") return "PARTIALLY_REFUNDED";
  if (payment === "PAYMENT_RECEIVED_AFTER_EXPIRY") return "REVIEW";
  if (commercial === "CANCELLED") return payment === "SUCCEEDED" ? "REVIEW" : "CANCELLED";
  if (commercial === "EXPIRED") return payment === "SUCCEEDED" ? "REVIEW" : "EXPIRED";
  if (confirmed) return "PAID";
  if (payment === "SUCCEEDED" && ["PARTIALLY_FULFILLED", "COMPLETED"].includes(commercial)) return "PAID";
  if (commercial !== "PAYMENT_PENDING") return "REVIEW";
  if (payment === "PROCESSING") return "PROCESSING";
  if (payment === "FAILED") return "FAILED";
  if (payment === "CANCELLED") return "CANCELLED";
  if (payment === null || payment === "REQUIRES_PAYMENT") return "PENDING";
  return "REVIEW";
}
export function getSellerOrderAllowedActions(c: OrderActionContext): OrderAction[] {
  if (!c.authorized || !["OWNER", "ADMIN", "ORDER_MANAGER", "COMETA_ADMIN"].includes(c.role) || !c.paymentConfirmed || !["STANDARD", "FAST"].includes(c.shippingMode) || !["HUB", "DIRECT"].includes(c.route)) return [];
  if (c.fulfillmentState === "PAID") return [{ key: "START_PREPARING", target: "PREPARING", label: "Comenzar preparación" }];
  if (c.fulfillmentState === "PREPARING") return c.route === "HUB" ? [{ key: "MARK_READY_FOR_HUB", target: "READY_FOR_HUB", label: "Marcar como listo para HUB" }] : [{ key: "MARK_READY_TO_SHIP", target: "READY_TO_SHIP", label: "Marcar como listo para envío" }];
  if (c.route === "HUB" && c.fulfillmentState === "READY_FOR_HUB") return [{ key: "MARK_HANDED_TO_HUB", target: "HANDED_TO_HUB", label: "Marcar entregado al HUB" }];
  if (c.route === "DIRECT" && c.fulfillmentState === "READY_TO_SHIP" && c.shipmentPrepared) return [{ key: "SHIP_DIRECT", target: "SHIPPED", label: "Marcar como enviado" }];
  return [];
}
export function getSellerOrderNextAction(c: OrderActionContext) {
  return getSellerOrderAllowedActions(c)[0] || { key: c.authorized && c.route === "HUB" && c.fulfillmentState === "HANDED_TO_HUB" ? "WAITING_FOR_HUB" : "NO_ACTION", target: null, label: c.authorized && c.route === "HUB" && c.fulfillmentState === "HANDED_TO_HUB" ? "Esperando recepción del HUB" : "Sin acción pendiente" };
}
export const paymentLabels: Record<PaymentPresentation, string> = { PENDING: "Pendiente", PROCESSING: "Procesando", PAID: "Pago confirmado", FAILED: "Pago fallido", CANCELLED: "Cancelado", EXPIRED: "Expirado", PARTIALLY_REFUNDED: "Reembolso parcial", REFUNDED: "Reembolsado", DISPUTED: "En disputa", REVIEW: "En revisión" };
export function orderEventLabel(type: string) {
  return ({ ORDER_CREATED: "Pedido creado", ORDER_PAID: "Pago confirmado", ORDER_CANCELLED: "Pedido cancelado", ORDER_EXPIRED: "Pedido expirado", SUBORDER_PREPARING: "Preparando", SUBORDER_READY_FOR_HUB: "Listo para HUB", SUBORDER_HANDED_TO_HUB: "Entregado al HUB", SUBORDER_HUB_RECEIVED: "Recibido en HUB", SUBORDER_CONSOLIDATED: "Consolidado", SUBORDER_READY_TO_SHIP: "Listo para envío", SUBORDER_SHIPPED: "En tránsito", SHIPMENT_IN_TRANSIT: "En tránsito", SHIPMENT_OUT_FOR_DELIVERY: "En reparto", SUBORDER_DELIVERED: "Entregado", SHIPMENT_DELIVERED: "Entrega confirmada por transportista", DELIVERED: "Entregado", SUBORDER_ISSUE: "Incidencia", INCIDENT_RECORDED: "Incidencia registrada", SHIPMENT_EXCEPTION: "Incidencia logística", SHIPMENT_CANCELLED: "Envío cancelado", SHIPMENT_CREATED: "Envío registrado", SHIPMENT_LABEL_READY: "Guía preparada" } as Record<string, string>)[type] || "Actualización del pedido";
}
export type SellerOrderRecord = {
  masterOrderId: string; suborderId: string; orderNumber: number; createdAt: string; recipientName: string | null;
  total: number; currency: string; commercialState: string; fulfillmentState: string; shippingMode: string; route: string; deadlineAt: string | null;
  paymentState: string | null; paymentConfirmed: boolean; shipmentPrepared: boolean; financialCondition: string | null;
  items: Array<{ id: string; title: string | null; image: string | null; variant: string | null; sku: string | null; attributes: unknown; quantity: number; unitPrice: number; total: number }>;
  timeline: Array<{ id: string; type: string; at: string }>;
  tracking: Array<{ status: string; carrier: string | null; trackingNumber: string | null }>;
  incidents: Array<{ id: string; type: string; createdAt: string }>;
};
export function presentSellerOrder(order: SellerOrderRecord, role: string) {
  const context = { ...order, authorized: true, role };
  return { ...order, paymentPresentation: getOrderPaymentPresentation(order.commercialState, order.paymentState, order.paymentConfirmed, order.financialCondition), timeline: order.timeline.map(e => ({ ...e, label: orderEventLabel(e.type) })), allowedActions: getSellerOrderAllowedActions(context), nextAction: getSellerOrderNextAction(context) };
}
export type SellerOrder = ReturnType<typeof presentSellerOrder>;
