import { randomUUID } from "node:crypto";
import { PosApiError } from "@/lib/pos/server";
import { getOrCreateCart } from "./cart";

export async function createReservation(idempotencyKey: string) {
  const { buyer, admin, items } = await getOrCreateCart();
  if (!items.length) throw new PosApiError(400, "COMU_CART_EMPTY", "Agrega productos antes de continuar.");
  const reservationItems: Array<Record<string, string | number>> = [];
  for (const item of items) {
    const variant = item.comu_variant_listings as { variant_id?: string; enabled?: boolean } | null;
    if (!variant?.enabled) throw new PosApiError(409, "COMU_VARIANT_UNAVAILABLE", "Una variante del carrito ya no está disponible.");
    const { data: inventory } = await admin.from("pos_inventory").select("location_id,variant_id,quantity,reserved_quantity").eq("variant_id", variant.variant_id).order("quantity", { ascending: false });
    const candidate = (inventory || []).find((row) => Number(row.quantity || 0) - Number(row.reserved_quantity || 0) >= Number(item.quantity));
    if (!candidate) throw new PosApiError(409, "COMU_INSUFFICIENT_STOCK", "No hay inventario suficiente para completar la reserva.");
    reservationItems.push({ seller_id: item.seller_id, listing_id: item.listing_id, variant_listing_id: item.variant_listing_id, variant_id: String(variant.variant_id), location_id: String(candidate.location_id), quantity: Number(item.quantity) });
  }
  const { data, error } = await admin.rpc("comu_reserve_inventory", { p_buyer_id: buyer.id, p_session_key: randomUUID(), p_idempotency_key: idempotencyKey, p_items: reservationItems });
  if (error || !data) throw new PosApiError(409, error?.message === "COMU_INSUFFICIENT_STOCK" ? "COMU_INSUFFICIENT_STOCK" : "COMU_RESERVATION_FAILED", error?.message === "COMU_INSUFFICIENT_STOCK" ? "No hay inventario suficiente para completar la reserva." : "No se pudo reservar el inventario.");
  return { reservation: data, buyer, admin };
}

export async function releaseReservation(reservationId: string, status: "RELEASED" | "CANCELLED" = "RELEASED") {
  const { admin } = await getOrCreateCart();
  const { data, error } = await admin.rpc("comu_release_inventory_reservation", { p_reservation_id: reservationId, p_status: status });
  if (error || !data) throw new PosApiError(409, "COMU_RESERVATION_RELEASE_FAILED", "No se pudo liberar la reserva.");
  return data;
}
