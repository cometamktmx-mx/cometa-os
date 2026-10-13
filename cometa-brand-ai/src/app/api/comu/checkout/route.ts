import { randomUUID } from "node:crypto";
import { closedComuPurchaseResponse } from "@/lib/comu/purchase-access";
import { NextResponse } from "next/server";
import { requireComuFeature } from "@/lib/comu/features";
import { requireComuBuyerRead } from "@/lib/comu/buyers";
import { createReservation } from "@/lib/comu/reservations";
import { createOrderFromReservation, requireCheckoutShippingProvider } from "@/lib/comu/orders";
import { PosApiError } from "@/lib/pos/server";

export async function POST(request: Request) {
  const closed = closedComuPurchaseResponse(); if (closed) return closed;
  try {
    requireComuFeature("catalog");
    const { buyer, admin } = await requireComuBuyerRead();
    const input: unknown = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new PosApiError(400, "COMU_ADDRESS_REQUIRED", "Selecciona una dirección de entrega.");
    const body = input as Record<string, unknown>;
    // Accept the previous payload shape, but resolve all address fields on the server.
    const legacyAddress = body.shippingAddress && typeof body.shippingAddress === "object" && "id" in body.shippingAddress ? body.shippingAddress.id : null;
    const addressId = body.addressId ?? legacyAddress;
    if (typeof addressId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(addressId)) throw new PosApiError(400, "COMU_ADDRESS_REQUIRED", "Selecciona una dirección de entrega.");
    const key = String(body.idempotencyKey || randomUUID());
    const { data: existing, error: existingError } = await admin.from("comu_orders").select("buyer_id,shipping_address_snapshot").eq("idempotency_key", `${key}:order`).maybeSingle();
    if (existingError) throw new PosApiError(503, "COMU_ORDER_LOOKUP_FAILED", "No se pudo consultar el pedido.");
    if (existing && (existing.buyer_id !== buyer.id || existing.shipping_address_snapshot?.id !== addressId)) throw new PosApiError(409, "COMU_IDEMPOTENCY_CONFLICT", "La clave ya corresponde a otra solicitud.");
    if (!existing) requireCheckoutShippingProvider();
    const { data: address, error: addressError } = existing ? { data: existing.shipping_address_snapshot, error: null } : await admin.from("comu_buyer_addresses").select("*").eq("id", addressId).eq("buyer_id", buyer.id).maybeSingle();
    if (addressError) throw new PosApiError(500, "COMU_ADDRESS_FAILED", "No se pudo validar la dirección.");
    if (!address) throw new PosApiError(404, "COMU_ADDRESS_REQUIRED", "Selecciona una dirección de entrega disponible.");
    const reservation = body.reservationId ? { reservation: { id: String(body.reservationId) } } : await createReservation(`${key}:reservation`);
    const shippingMode = body.shippingMode === "FAST" ? "FAST" : "STANDARD";
    const order = await createOrderFromReservation(String(reservation.reservation.id), `${key}:order`, { ...address }, shippingMode);
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    const status = error instanceof PosApiError ? error.status : 500;
    return NextResponse.json({ ok: false, code: error instanceof PosApiError ? error.code : "COMU_CHECKOUT_FAILED", error: error instanceof PosApiError && status < 500 ? error.message : "No se pudo preparar la orden. Inténtalo nuevamente." }, { status });
  }
}
