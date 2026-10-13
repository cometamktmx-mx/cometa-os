import { randomUUID } from "node:crypto";
import { PosApiError } from "@/lib/pos/server";
import { getOrCreateCart } from "./cart";
import { requireComuBuyerRead } from "./buyers";

type CartIntent = { seller_id: string; listing_id: string; variant_listing_id: string; quantity: number; purchase_mode?: string; run_id?: string | null; run_count?: number };
function intent(items: CartIntent[]) {
  return items.map(item => ({ seller_id: item.seller_id, listing_id: item.listing_id, variant_listing_id: item.variant_listing_id,
    quantity: Number(item.quantity), purchase_mode: item.purchase_mode || "PIECES",
    run_id: item.purchase_mode === "RUN" ? item.run_id : null, run_count: item.purchase_mode === "RUN" ? Number(item.run_count || 1) : 1,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function conflict(): never { throw new PosApiError(409, "COMU_IDEMPOTENCY_CONFLICT", "La clave ya corresponde a otra solicitud."); }

export async function createReservation(idempotencyKey: string) {
  const { buyer, admin } = await requireComuBuyerRead();
  if (!idempotencyKey.trim()) throw new PosApiError(400, "COMU_IDEMPOTENCY_KEY_REQUIRED", "Falta la clave de la solicitud.");
  const { data: cart, error: cartError } = await admin.from("comu_carts").select("id").eq("buyer_id", buyer.id).maybeSingle();
  if (cartError) throw new PosApiError(503, "COMU_CART_LOOKUP_FAILED", "No se pudo consultar tu carrito.");
  const { data: rawItems, error: itemError } = cart ? await admin.from("comu_cart_items").select("seller_id,listing_id,variant_listing_id,quantity,purchase_mode,run_id,run_count").eq("cart_id", cart.id) : { data: [], error: null };
  if (itemError) throw new PosApiError(503, "COMU_CART_ITEMS_FAILED", "No se pudo consultar tu carrito.");
  const requestIntent = intent(rawItems || []);
  async function replay() {
    const { data: existing, error } = await admin.from("comu_inventory_reservations").select("id,buyer_id").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (error) throw new PosApiError(503, "COMU_RESERVATION_LOOKUP_FAILED", "No se pudo consultar la reserva.");
    if (!existing) return null;
    if (existing.buyer_id !== buyer.id) conflict();
    const { data: saved, error: savedError } = await admin.from("comu_inventory_reservation_items").select("seller_id,listing_id,variant_listing_id,variant_id,location_id,quantity,pricing_snapshot").eq("reservation_id", existing.id);
    if (savedError || !saved?.length) throw new PosApiError(503, "COMU_RESERVATION_LOOKUP_FAILED", "No se pudo consultar la reserva.");
    const original = saved[0].pricing_snapshot?.reservationRequestV1;
    if (original) {
      if (!Array.isArray(original) || JSON.stringify(intent(original)) !== JSON.stringify(requestIntent)) conflict();
    } else {
      // Legacy PIECES can be proved from persisted selection/quantity. A RUN
      // without its original selection snapshot cannot be reconstructed safely.
      if (requestIntent.some(item => item.purchase_mode === "RUN") || JSON.stringify(intent(saved)) !== JSON.stringify(requestIntent)) conflict();
    }
    const result = await admin.rpc("comu_reserve_inventory", { p_buyer_id: buyer.id, p_session_key: randomUUID(), p_idempotency_key: idempotencyKey, p_items: saved });
    if (result.error || !result.data) throw new PosApiError(409, "COMU_RESERVATION_FAILED", "No se pudo recuperar la reserva.");
    return { reservation: result.data, buyer, admin };
  }
  const prior = await replay();
  if (prior) return prior;
  try {
    const { buyer: pricedBuyer, items } = await getOrCreateCart();
    if (pricedBuyer.id !== buyer.id || JSON.stringify(intent(items)) !== JSON.stringify(requestIntent)) conflict();
    if (!items.length) throw new PosApiError(400, "COMU_CART_EMPTY", "Agrega productos antes de continuar.");
    const reservationItems: Array<Record<string, string | number | Record<string, unknown> | null>> = [];
    for (const item of items) {
      const variant = item.comu_variant_listings as { variant_id?: string; enabled?: boolean } | null;
      if (!variant?.enabled) throw new PosApiError(409, "COMU_VARIANT_UNAVAILABLE", "Una variante del carrito ya no está disponible.");
      const runCount = Number((item as { run_count?: number }).run_count || 1);
      const runId = (item as { run_id?: string | null }).run_id;
      const runItems = item.purchase_mode === "RUN" && runId ? (await admin.from("comu_product_run_items").select("variant_listing_id,variant_id,quantity_per_run").eq("run_id", runId)).data || [] : [{ variant_listing_id: item.variant_listing_id, variant_id: variant.variant_id, quantity_per_run: Number(item.quantity) }];
      if (!runItems.length) throw new PosApiError(409, "COMU_RUN_UNAVAILABLE", "La corrida no está disponible.");
      for (const runItem of runItems) {
        const requested = Number(runItem.quantity_per_run) * (item.purchase_mode === "RUN" ? runCount : 1);
        const { data: inventory, error: inventoryError } = await admin.from("pos_inventory").select("location_id,variant_id,quantity,reserved_quantity").eq("variant_id", runItem.variant_id).order("quantity", { ascending: false });
        if (inventoryError) throw new PosApiError(503, "COMU_RESERVATION_LOOKUP_FAILED", "No se pudo consultar la disponibilidad.");
        const candidate = (inventory || []).find((row) => Number(row.quantity || 0) - Number(row.reserved_quantity || 0) >= requested);
        if (!candidate) throw new PosApiError(409, "COMU_INSUFFICIENT_STOCK", "No hay inventario suficiente para completar la reserva.");
        const reservationItem: Record<string, string | number | Record<string, unknown>> = { seller_id: item.seller_id, listing_id: item.listing_id, variant_listing_id: String(runItem.variant_listing_id), variant_id: String(runItem.variant_id), location_id: String(candidate.location_id), quantity: requested };
        if (item.pricing_snapshot && typeof item.pricing_snapshot === "object") reservationItem.pricing_snapshot = { ...item.pricing_snapshot, reservationRequestV1: requestIntent };
        reservationItems.push(reservationItem);
      }
    }
    const { data, error } = await admin.rpc("comu_reserve_inventory", { p_buyer_id: buyer.id, p_session_key: randomUUID(), p_idempotency_key: idempotencyKey, p_items: reservationItems });
    if (error || !data) throw new PosApiError(409, error?.message === "COMU_INSUFFICIENT_STOCK" ? "COMU_INSUFFICIENT_STOCK" : "COMU_RESERVATION_FAILED", error?.message === "COMU_INSUFFICIENT_STOCK" ? "No hay inventario suficiente para completar la reserva." : "No se pudo reservar el inventario.");
    return { reservation: data, buyer, admin };
  } catch (error) {
    // Another request may have won after the initial lookup, including while
    // this request was checking availability or calculating current pricing.
    const winner = await replay();
    if (winner) return winner;
    throw error;
  }
}

export async function releaseReservation(reservationId: string, status: "RELEASED" | "CANCELLED" = "RELEASED") {
  const { admin } = await getOrCreateCart();
  const { data, error } = await admin.rpc("comu_release_inventory_reservation", { p_reservation_id: reservationId, p_status: status });
  if (error || !data) throw new PosApiError(409, "COMU_RESERVATION_RELEASE_FAILED", "No se pudo liberar la reserva.");
  return data;
}
