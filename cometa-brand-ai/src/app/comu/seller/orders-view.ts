import { orderEventLabel, paymentLabels, type SellerOrder } from "@/lib/comu/order-presentation";

export const orderFilters = [["ALL", "Todos"], ["PAID", "Nuevos"], ["PREPARING", "Preparando"], ["READY", "Listos"], ["SHIPPED", "En tránsito"], ["DELIVERED", "Entregados"], ["ISSUE", "Incidencias"]] as const;
const ready = new Set(["READY_FOR_HUB", "HANDED_TO_HUB", "HUB_RECEIVED", "CONSOLIDATED", "READY_TO_SHIP"]);
export function orderMetrics(orders: SellerOrder[]) {
  return orderFilters.slice(1).map(([key, label]) => ({ key, label, count: orders.filter(o => key === "READY" ? ready.has(o.fulfillmentState) : key === "PAID" ? o.fulfillmentState === key && o.paymentConfirmed : o.fulfillmentState === key).length }));
}
export function orderBadge(order: SellerOrder) {
  const state = order.fulfillmentState;
  if (state === "PAID") return { label: paymentLabels[order.paymentPresentation], tone: order.paymentPresentation === "PAID" ? "paid" : "neutral" };
  return { label: state === "CANCELLED" ? "Cancelado" : orderEventLabel(`SUBORDER_${state}`), tone: state === "ISSUE" ? "issue" : state === "PREPARING" ? "preparing" : ready.has(state) ? "ready" : state === "SHIPPED" ? "transit" : state === "DELIVERED" ? "delivered" : "neutral" };
}
export function orderMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}
export function orderDate(value: string, time = false) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } as const : {}) }) : "Fecha no disponible";
}
export function orderDelivery(order: SellerOrder) { return order.route === "HUB" ? "HUB COMETA" : order.route === "DIRECT" ? "Envío directo" : "Entrega por confirmar"; }
export function orderPrimaryAction(order: SellerOrder) { return order.allowedActions.find(action => action.key === order.nextAction.key && action.target === order.nextAction.target); }
export function orderActionLabel(order: SellerOrder) { return order.nextAction.key === "MARK_HANDED_TO_HUB" ? "Confirmar entrega al HUB" : order.nextAction.label; }
export function orderTimeline(order: SellerOrder) {
  const stages: Array<[string, string[]]> = [
    ["Pago confirmado", ["ORDER_PAID"]], ["Preparando", ["SUBORDER_PREPARING"]],
    [order.route === "HUB" ? "Listo para HUB" : "Listo para envío", [order.route === "HUB" ? "SUBORDER_READY_FOR_HUB" : "SUBORDER_READY_TO_SHIP"]],
    ["En tránsito", ["SUBORDER_SHIPPED", "SHIPMENT_IN_TRANSIT"]], ["Entregado", ["SUBORDER_DELIVERED", "SHIPMENT_DELIVERED", "DELIVERED"]],
  ];
  return stages.map(([label, types]) => ({ label, event: order.timeline.find(event => types.includes(event.type)) }));
}
export function snapshotVariant(item: SellerOrder["items"][number]) {
  if (item.variant) return item.variant;
  if (!item.attributes || typeof item.attributes !== "object" || Array.isArray(item.attributes)) return "";
  return Object.entries(item.attributes).filter(([, value]) => typeof value === "string" || typeof value === "number").map(([key, value]) => `${key}: ${value}`).join(" · ");
}
export function snapshotImage(value: string | null) {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { return ["https:", "http:"].includes(new URL(value).protocol) ? value : null; } catch { return null; }
}
export function incidentLabel(type: string) { return ({ DAMAGED_PACKAGE: "Paquete dañado", INCOMPLETE_PACKAGE: "Paquete incompleto", WRONG_PRODUCT: "Producto incorrecto" } as Record<string, string>)[type] || "Incidencia registrada"; }
export function trackingLabel(status: string) { return ({ CREATED: "Envío registrado", LABEL_READY: "Guía preparada", IN_TRANSIT: "En tránsito", OUT_FOR_DELIVERY: "En reparto", DELIVERED: "Entregado", EXCEPTION: "Incidencia logística", CANCELLED: "Envío cancelado" } as Record<string, string>)[status] || "Seguimiento del envío"; }
