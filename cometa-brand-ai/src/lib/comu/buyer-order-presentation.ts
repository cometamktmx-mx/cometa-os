import type { BuyerOrderDetail, BuyerOrderSource, BuyerOrderSummary, BuyerPresentation, BuyerTimelineEvent, DeliveryEstimate } from "./buyer-order-contract";

export const buyerPresentationLabels: Record<BuyerPresentation, string> = {
  CONFIRMED: "Pedido confirmado", PREPARING: "Preparando tu compra", GATHERING_AT_HUB: "Estamos reuniendo tu pedido",
  READY_TO_SHIP: "Listo para envío", PARTIALLY_IN_TRANSIT: "Parte de tu pedido ya está en camino", IN_TRANSIT: "En tránsito",
  OUT_FOR_DELIVERY: "En reparto", DELIVERED: "Entregado", ISSUE: "Pedido con incidencia", CANCELLED: "Pedido cancelado",
  PAYMENT_PENDING: "Pago pendiente", PAYMENT_PROCESSING: "Pago en proceso", PAYMENT_FAILED: "Pago no completado",
};
const subLabels: Record<string, string> = { PAID: "Pago confirmado", PREPARING: "Preparando", READY_FOR_HUB: "Preparado para la siguiente etapa", HANDED_TO_HUB: "Entregado al HUB", HUB_RECEIVED: "Recibido en HUB", CONSOLIDATED: "Productos reunidos", READY_TO_SHIP: "Listo para envío", SHIPPED: "En tránsito", DELIVERED: "Entregado", ISSUE: "Con incidencia", CANCELLED: "Cancelado" };
const eventLabels: Record<string, string> = { ORDER_CREATED: "Pedido registrado", ORDER_PAID: "Pedido confirmado", ORDER_CANCELLED: "Pedido cancelado", ORDER_EXPIRED: "Reserva vencida", ORDER_DELIVERED: "Pedido entregado", SUBORDER_PREPARING: "Preparando tu compra", SUBORDER_READY_FOR_HUB: "Productos preparados para la siguiente etapa", SUBORDER_HANDED_TO_HUB: "Productos entregados al HUB", SUBORDER_HUB_RECEIVED: "Productos recibidos en HUB", MASTER_CONSOLIDATED: "Pedido consolidado", SUBORDER_READY_TO_SHIP: "Listo para envío", SUBORDER_SHIPPED: "En tránsito", SUBORDER_DELIVERED: "Entregado", SUBORDER_ISSUE: "Incidencia", INCIDENT_RECORDED: "Incidencia registrada" };
const trackingLabels: Record<string, string> = { CREATED: "Envío registrado", LABEL_READY: "Guía preparada", READY_TO_SHIP: "Listo para envío", SHIPPED: "En tránsito", IN_TRANSIT: "En tránsito", OUT_FOR_DELIVERY: "En reparto", DELIVERED: "Entregado", EXCEPTION: "Incidencia", CANCELLED: "Envío cancelado" };
const paymentLabels: Record<string, string> = { SUCCEEDED: "Pagado", PROCESSING: "Procesando", REQUIRES_PAYMENT: "Pendiente", FAILED: "Fallido", CANCELLED: "Cancelado", REFUNDED: "Reembolsado", PARTIALLY_REFUNDED: "Reembolso parcial", DISPUTED: "Disputa", REVIEW: "Reembolso pendiente" };
export function publicOrderImage(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? value : null; } catch { return null; }
}
const latest = (values: string[]) => values.filter(v => Number.isFinite(Date.parse(v))).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

// Only verified future sources may enter this precedence function. No synthetic
// quote, updated_at arithmetic or first-ready-seller ETA is ever created here.
export function selectDeliveryEstimate(carrier: DeliveryEstimate, promise: DeliveryEstimate): DeliveryEstimate {
  const valid = (value: DeliveryEstimate, source: "CARRIER" | "COMU_PROMISE") => value?.source === source && [value.from, value.to, value.updatedAt].every(v => Number.isFinite(Date.parse(v))) && Date.parse(value.from) <= Date.parse(value.to);
  return valid(carrier, "CARRIER") ? carrier : valid(promise, "COMU_PROMISE") ? promise : null;
}
export function presentBuyerOrder(source: BuyerOrderSource, focusSuborderId: string | null = null): BuyerOrderDetail {
  const mixed = new Set(source.suborders.map(s => s.route)).size > 1 || source.suborders.filter(s => s.route === "DIRECT").length > 1;
  const tracking = source.tracking.map(sh => {
    const suborderIds = sh.suborderIds.filter(id => source.suborders.some(s => s.suborderId === id));
    if (!suborderIds.length && source.suborders.length === 1 && source.suborders[0].route === "DIRECT") suborderIds.push(source.suborders[0].suborderId);
    const events: BuyerTimelineEvent[] = sh.events.filter(e => trackingLabels[e.status]).map(e => ({ id: "tracking:" + e.id, scope: "SHIPMENT", suborderId: null, shipmentId: sh.shipmentId, sellerName: null, label: trackingLabels[e.status], recordedAt: e.recordedAt }));
    return { shipmentId: sh.shipmentId, carrier: sh.carrier, trackingNumber: sh.trackingNumber, presentationState: sh.status === "SHIPPED" ? "IN_TRANSIT" : sh.status,
      presentationLabel: trackingLabels[sh.status] || "Seguimiento pendiente", suborderIds, events, latestVerifiedUpdate: latest(events.map(e => e.recordedAt)), publicTrackingUrl: null, deliveryEstimate: selectDeliveryEstimate(null, null) };
  });
  const timeline: BuyerTimelineEvent[] = source.events.filter(e => {
    if (!eventLabels[e.type]) return false;
    const sub = source.suborders.find(s => s.suborderId === e.suborderId);
    if (sub?.route === "DIRECT" && /HUB|CONSOLIDATED/.test(e.type)) return false;
    if (e.type === "MASTER_CONSOLIDATED" && !source.suborders.some(s => s.route === "HUB")) return false;
    // Use the actual shipment event once rather than repeating it for each brand.
    const state = e.type === "SUBORDER_SHIPPED" ? "En tránsito" : e.type === "SUBORDER_DELIVERED" ? "Entregado" : null;
    return !state || !tracking.some(sh => sh.suborderIds.includes(e.suborderId || "") && sh.events.some(t => t.label === state));
  }).map(e => ({ id: e.id, scope: e.scope, suborderId: e.suborderId, shipmentId: null, sellerName: source.suborders.find(s => s.suborderId === e.suborderId)?.sellerName ?? null, label: eventLabels[e.type], recordedAt: e.recordedAt }));
  timeline.push(...tracking.flatMap(sh => sh.events));
  timeline.sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt) || a.id.localeCompare(b.id));
  const suborders = source.suborders.map(s => {
    const products = s.products.map(p => ({ id: p.id, title: p.title || "Producto", image: publicOrderImage(p.image), sellerNameSnapshot: p.sellerNameSnapshot, variant: p.variant, sku: p.sku,
      attributes: p.attributes, quantity: Number(p.quantity), unitPrice: Number(p.unitPrice), subtotal: Number(p.subtotal) }));
    const logo = publicOrderImage(s.sellerLogo);
    const raw = s.fulfillmentStatus;
    const state = raw === "SHIPPED" ? tracking.some(sh => sh.suborderIds.includes(s.suborderId) && sh.presentationState === "OUT_FOR_DELIVERY") ? "OUT_FOR_DELIVERY" : "IN_TRANSIT" : raw;
    return { suborderId: s.suborderId, sellerId: s.sellerId, sellerName: s.sellerName, sellerLogo: logo, logoSource: logo ? "CURRENT_PUBLIC" as const : "PLACEHOLDER" as const,
      route: s.route, itemCount: products.reduce((n, p) => n + p.quantity, 0), total: Number(s.total), products, presentationState: state,
      presentationLabel: raw === "PAID" && !source.paymentConfirmed ? "Confirmación de pago pendiente" : trackingLabels[state] || subLabels[state] || "En seguimiento",
      progress: timeline.filter(e => e.suborderId === s.suborderId || (e.shipmentId && tracking.some(sh => sh.shipmentId === e.shipmentId && sh.suborderIds.includes(s.suborderId)))) };
  });
  const hubs = source.suborders.filter(s => s.route === "HUB");
  const count = (type: string) => new Set(hubs.filter(s => source.events.some(e => e.suborderId === s.suborderId && e.type === type)).map(s => s.sellerId)).size;
  const totalSellers = new Set(hubs.map(s => s.sellerId)).size, receivedSellers = count("SUBORDER_HUB_RECEIVED");
  const consolidated = totalSellers > 0 && receivedSellers === totalSellers && source.events.some(e => e.scope === "MASTER" && e.type === "MASTER_CONSOLIDATED") && tracking.some(sh => hubs.every(s => sh.suborderIds.includes(s.suborderId)));
  const economics = { subtotal: Number(source.economics.subtotal), shipping: Number(source.economics.shipping), discount: Number(source.economics.discount), pointsTotal: Number(source.economics.pointsTotal), total: Number(source.economics.total), refunded: Number(source.economics.refunded), net: Number((Number(source.economics.total) - Number(source.economics.refunded)).toFixed(2)) };
  const presentationStatus = source.presentationStatus;
  return { orderId: source.orderId, orderNumber: source.orderNumber, createdAt: source.createdAt, currency: source.currency, total: economics.total,
    itemCount: suborders.reduce((n, s) => n + s.itemCount, 0), sellerCount: new Set(suborders.map(s => s.sellerId)).size,
    previewImages: [...new Set(suborders.flatMap(s => s.products.flatMap(p => p.image ? [p.image] : [])))].slice(0, 4),
    presentationStatus, presentationLabel: buyerPresentationLabels[presentationStatus], hasIssue: presentationStatus === "ISSUE" || source.issues.length > 0,
    latestVerifiedUpdate: latest(timeline.map(e => e.recordedAt)), deliveryEstimate: null,
    payment: { state: source.paymentState, label: paymentLabels[source.paymentState] || "Pendiente", confirmed: source.paymentConfirmed },
    suborders, shippingMode: source.shippingMode, economics, shippingAddress: source.shippingAddress,
    hubProgress: { totalSellers, preparedSellers: count("SUBORDER_READY_FOR_HUB"), handedSellers: count("SUBORDER_HANDED_TO_HUB"), receivedSellers, consolidated,
      label: !totalSellers ? null : consolidated && !mixed && presentationStatus !== "ISSUE" ? "Ya reunimos todo tu pedido." : `Recibimos los productos de ${receivedSellers} de ${totalSellers} tiendas.` },
    timeline, tracking, issues: source.issues.map(i => ({ id: i.id, suborderId: i.suborderId, createdAt: i.createdAt, message: "Hay una incidencia en esta parte de tu pedido." })),
    limitations: mixed ? ["Este pedido contiene rutas independientes cuya operación conjunta no está certificada. Consulta el progreso de cada marca."] : [],
    availableActions: [], context: { deepLink: `/comu/account/orders/${source.orderId}?view=detail`, focusSuborderId: source.suborders.some(s => s.suborderId === focusSuborderId) ? focusSuborderId : null, notificationAudience: "BUYER" } };
}
export function summarizeBuyerOrder(detail: BuyerOrderDetail): BuyerOrderSummary {
  const { orderId, orderNumber, createdAt, currency, total, itemCount, sellerCount, previewImages, presentationStatus, presentationLabel, hasIssue, latestVerifiedUpdate, deliveryEstimate } = detail;
  return { orderId, orderNumber, createdAt, currency, total, itemCount, sellerCount, previewImages, presentationStatus, presentationLabel, hasIssue, latestVerifiedUpdate, deliveryEstimate };
}
export function formatOrderMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}
