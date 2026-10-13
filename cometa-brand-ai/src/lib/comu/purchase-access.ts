// Seller operations and existing order resolution remain available independently.
export function closedComuPurchaseResponse(): Response | null {
  if (process.env.COMU_PUBLIC_PURCHASES_ENABLED === "true") return null;
  return Response.json({ ok: false, code: "COMU_PURCHASES_CLOSED", error: "Las compras públicas todavía no están habilitadas. El acceso para vendedores sigue disponible." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
}
export function isClosedComuPurchaseRequest(path: string, method: string) {
  if (process.env.COMU_PUBLIC_PURCHASES_ENABLED === "true") return false;
  const pathname = path.replace(/\/+$/, "");
  if (pathname === "/comu/checkout" || pathname === "/comu/cart") return true;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  return ["/api/comu/cart", "/api/comu/reservations", "/api/comu/checkout", "/api/comu/payments/intents", "/api/comu/shipping/quote"].includes(pathname);
}
