export const buyerSections = ["Resumen", "Mis pedidos", "Direcciones", "Favoritos", "Mis datos", "Puntos y recompensas"] as const;
export function buyerSection(value?: string): string {
  const title = value === "Pedidos" ? "Mis pedidos" : value === "Perfil" ? "Mis datos" : value;
  return buyerSections.find(section => section === title) || "Resumen";
}
export function buyerOrderPresentation(order: { status: string; fulfillment_status?: string; presentationStatus?: string; presentationLabel?: string }) {
  if (order.presentationStatus && order.presentationLabel) return { label: order.presentationLabel, group: order.presentationStatus === "DELIVERED" ? "Entregados" : "En proceso", tone: order.presentationStatus === "DELIVERED" ? "green" : "neutral" };
  if (["CANCELLED", "EXPIRED", "FAILED"].includes(order.status)) return { label: buyerOrderStatus(order.status), group: "Cancelados", tone: "neutral" };
  if (["DISPUTED", "REFUNDED", "PARTIALLY_REFUNDED", "PAYMENT_PENDING", "PAYMENT_RECEIVED_AFTER_EXPIRY"].includes(order.status)) return { label: buyerOrderStatus(order.status), group: "En proceso", tone: "neutral" };
  if (order.fulfillment_status === "DELIVERED" || order.status === "COMPLETED") return { label: order.status === "COMPLETED" ? "Completado" : "Entregado", group: "Entregados", tone: "green" };
  if (order.fulfillment_status === "SHIPPED") return { label: "En camino", group: "En proceso", tone: "ochre" };
  if (order.status === "PAID" || order.status === "PREPARING") return { label: order.fulfillment_status === "ISSUE" ? "En seguimiento" : "Preparando", group: "En proceso", tone: "blue" };
  return { label: buyerOrderStatus(order.status), group: "En proceso", tone: "neutral" };
}
export function buyerOrderStatus(status: string): string {
  return ({ PAYMENT_PENDING: "Pago pendiente", PAID: "Confirmado", PREPARING: "En preparación", SHIPPED: "En camino", DELIVERED: "Entregado", COMPLETED: "Completado", CANCELLED: "Cancelado", EXPIRED: "Reserva vencida", REFUNDED: "Reembolsado", PARTIALLY_REFUNDED: "Reembolso parcial", PARTIALLY_FULFILLED: "Entrega parcial", DISPUTED: "En revisión", FAILED: "No completado", PAYMENT_RECEIVED_AFTER_EXPIRY: "En revisión" } as Record<string, string>)[status] || "En seguimiento";
}
export const formatMxn = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
export function recommendationGroups<T extends { id: string; seller_id?: string; public_category?: string | null }>(current: T, catalog: T[]) {
  const others = catalog.filter(row => row.id !== current.id);
  const similar = current.public_category ? others.filter(row => row.public_category === current.public_category && row.seller_id !== current.seller_id).slice(0, 4) : [];
  const store = others.filter(row => row.seller_id === current.seller_id).slice(0, 4);
  return [{ title: "Productos similares", items: similar }, { title: "Más de esta tienda", items: store }].filter(group => group.items.length);
}
export function sizeGuideFromTheme(theme: unknown, listingId: string): string | null {
  if (!theme || typeof theme !== "object") return null;
  const config = theme as { sizeGuide?: unknown; sizeGuides?: Record<string, unknown> };
  const guide = config.sizeGuides?.[listingId] ?? config.sizeGuide;
  return typeof guide === "string" && guide.trim() ? guide.slice(0, 8000) : null;
}
