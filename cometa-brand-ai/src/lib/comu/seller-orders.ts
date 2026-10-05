import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PosApiError } from "@/lib/pos/server";
import { requireComuActor, requireSellerAccess } from "./seller-access";
import { presentSellerOrder, type SellerOrderRecord } from "./order-presentation";
export const orderHeaders = { "Cache-Control": "private, no-store" };
export function orderFailure(error: unknown) {
  if (error instanceof PosApiError) return { status: error.status, code: error.code, message: error.status >= 500 ? "No se pudo consultar el pedido." : error.message };
  return { status: 500, code: "COMU_ORDER_FAILED", message: "No se pudo completar la operación." };
}
export function validateOrderId(value: string | null): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new PosApiError(400, "COMU_ORDER_QUERY_INVALID", "Identificador inválido.");
  return value;
}
export async function readSellerOrders(sellerId: string, query = new URLSearchParams()) {
  validateOrderId(sellerId);
  const access = await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
  const integer = (key: string, fallback: number, max: number) => { const text = query.get(key); if (text !== null && !/^\d+$/.test(text)) throw new PosApiError(400, "COMU_ORDER_QUERY_INVALID", "Filtro inválido."); const n = text === null ? fallback : Number(text); if (!Number.isInteger(n) || n < 1 || n > max) throw new PosApiError(400, "COMU_ORDER_QUERY_INVALID", "Filtro inválido."); return n; };
  const days = integer("days", 30, 90), state = query.get("status") || "ALL", search = (query.get("search") || "").trim();
  if (![30, 90].includes(days) || search.length > 120 || !["ALL","PAID","PREPARING","READY","READY_FOR_HUB","HANDED_TO_HUB","HUB_RECEIVED","CONSOLIDATED","READY_TO_SHIP","SHIPPED","DELIVERED","CANCELLED","ISSUE"].includes(state)) throw new PosApiError(400, "COMU_ORDER_QUERY_INVALID", "Filtro inválido.");
  const { data, error } = await (await createClient()).rpc("comu_seller_orders_read_o1", { p_seller: sellerId, p_selected: query.has("selected") ? validateOrderId(query.get("selected")) : null, p_days: days, p_state: state, p_search: search, p_page: integer("page", 1, 100000), p_size: integer("pageSize", 20, 50) });
  if (error || !data) { const code = error?.message || ""; throw new PosApiError(code.includes("NOT_FOUND") ? 404 : code.includes("DENIED") || code.includes("UNAUTHORIZED") ? 403 : 503, "COMU_ORDER_READ_FAILED", "No se pudieron consultar los pedidos autorizados."); }
  const result = data as { orders: SellerOrderRecord[]; selected: SellerOrderRecord | null; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
  return { orders: result.orders.map(o => presentSellerOrder(o, access.role)), selected: result.selected ? presentSellerOrder(result.selected, access.role) : null, pagination: result.pagination };
}
export async function getSellerOrderStores() {
  const actor = await requireComuActor();
  const members = await actor.admin.from("comu_seller_memberships").select("seller_id").eq("user_id", actor.userId).eq("active", true).in("role", ["OWNER", "ADMIN", "ORDER_MANAGER"]);
  if (members.error) throw new PosApiError(503, "COMU_ORDER_READ_FAILED", "No se pudieron consultar tus tiendas.");
  if (!members.data?.length) return [];
  const candidates = await actor.admin.from("comu_sellers").select("id,brand_slug,public_name").in("id", members.data.map(m => m.seller_id));
  if (candidates.error) throw new PosApiError(503, "COMU_ORDER_READ_FAILED", "No se pudieron consultar tus tiendas.");
  const stores: Array<{ id: string; brand_slug: string; public_name: string }> = [];
  for (const s of candidates.data || []) { try { await readSellerOrders(s.id, new URLSearchParams({ pageSize: "1" })); stores.push(s); } catch (error) { if (!(error instanceof PosApiError) || error.status !== 403) throw error; } }
  return stores;
}
export async function requireOrderBrand(brandSlug: string) {
  const actor = await requireComuActor();
  const { data, error } = await actor.admin.from("comu_sellers").select("id,brand_slug,public_name").eq("brand_slug", brandSlug).maybeSingle();
  if (error) throw new PosApiError(503, "COMU_ORDER_READ_FAILED", "No se pudo consultar la tienda.");
  if (!data) throw new PosApiError(403, "COMU_SELLER_ACCESS_DENIED", "No tienes acceso a esta tienda.");
  await readSellerOrders(data.id, new URLSearchParams({ pageSize: "1" }));
  return data;
}
