import type { ComuNotification } from "./notification-contract";

// N1 owns the event and body. Scope qualifies its headline; no new business states.
const partTitles: Record<string, string> = {
  ORDER_PAID: "Una parte de tu pedido está confirmada",
  PREPARING: "Una parte de tu pedido está en preparación",
  READY_FOR_HUB: "Una parte de tu pedido avanza",
  READY_TO_SHIP: "Una parte de tu pedido está lista para envío",
  IN_TRANSIT: "Una parte de tu pedido está en camino",
  DELIVERED: "Una parte de tu pedido fue entregada",
  ISSUE: "Hay una incidencia en una parte de tu pedido",
};
export function buyerNotificationTitle(notification: ComuNotification) {
  return notification.metadata.scope === "SUBORDER"
    ? partTitles[notification.event_kind] || "Actualización de una parte de tu pedido"
    : notification.title;
}
export function buyerNotificationLink(notification: ComuNotification): string | null {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  if (notification.audience !== "BUYER" || !new RegExp(`^${uuid}$`, "i").test(notification.id)) return null;
  // Only the canonical N1 Buyer route. Never propagate arbitrary URL parameters.
  if (!new RegExp(`^/comu/account/orders/${uuid}\\?view=detail$`, "i").test(notification.deep_link)) return null;
  return `${notification.deep_link}&notificationId=${notification.id}`;
}
