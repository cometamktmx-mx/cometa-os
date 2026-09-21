import { NextResponse } from "next/server";
import { requireComuBuyer } from "@/lib/comu/buyers";
import { PosApiError } from "@/lib/pos/server";

export const dynamic = "force-dynamic";

export type PaymentStatus = {
  ok: true;
  order: {
    id: string; order_number: number; status: string; grand_total: number; currency: string; created_at: string;
    shipping_address: Record<string, string>;
    sellers: Array<{ id: string; name: string; total: number }>;
    items: Array<{ id: string; suborder_id: string; title: string; variant: string; quantity: number; subtotal: number }>;
  };
  payment: { status: string; amount_cents: number; currency: string; updated_at: string } | null;
  reservation: { status: string; expires_at: string } | null;
  canRetry: boolean;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { buyer, admin } = await requireComuBuyer();
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "Pedido no disponible.");
    const { data: order, error } = await admin.from("comu_orders")
      .select("id,order_number,status,grand_total,currency,created_at,reservation_id,shipping_address_snapshot,comu_order_suborders(id,grand_total,comu_sellers(public_name)),comu_order_items(id,suborder_id,quantity,subtotal,comu_order_item_snapshots(snapshot))")
      .eq("id", id).eq("buyer_id", buyer.id).maybeSingle();
    if (error) throw new Error("order lookup");
    if (!order) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "Pedido no disponible.");
    const [paymentResult, reservationResult] = await Promise.all([
      admin.from("comu_payment_intents").select("status,amount_cents,currency,updated_at").eq("order_id", id).eq("buyer_id", buyer.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("comu_inventory_reservations").select("status,expires_at").eq("id", order.reservation_id).eq("buyer_id", buyer.id).maybeSingle(),
    ]);
    if (paymentResult.error || reservationResult.error) throw new Error("payment status lookup");
    const payment = paymentResult.data;
    const reservation = reservationResult.data;
    const address = order.shipping_address_snapshot || {};
    const payload: PaymentStatus = {
      ok: true,
      order: {
        id: order.id, order_number: Number(order.order_number), status: order.status,
        grand_total: Number(order.grand_total), currency: order.currency, created_at: order.created_at,
        shipping_address: Object.fromEntries(["recipient_name", "line1", "line2", "city", "state", "postal_code", "country", "references"].map((key) => [key, typeof address[key] === "string" ? address[key] : ""])),
        sellers: order.comu_order_suborders.map((suborder) => ({ id: suborder.id, name: (Array.isArray(suborder.comu_sellers) ? suborder.comu_sellers[0] : suborder.comu_sellers)?.public_name || "Tienda", total: Number(suborder.grand_total) })),
        items: order.comu_order_items.map((item) => {
          const snapshots = item.comu_order_item_snapshots;
          const snapshot = (Array.isArray(snapshots) ? snapshots[0] : snapshots)?.snapshot || {};
          return { id: item.id, suborder_id: item.suborder_id, title: String(snapshot.listingTitle || snapshot.productTitle || "Producto"), variant: String(snapshot.variant || ""), quantity: Number(item.quantity), subtotal: Number(item.subtotal) };
        }),
      },
      payment: payment ? { status: payment.status, amount_cents: Number(payment.amount_cents), currency: payment.currency, updated_at: payment.updated_at } : null,
      reservation: reservation ? { status: reservation.status, expires_at: reservation.expires_at } : null,
      canRetry: order.status === "PAYMENT_PENDING" && ["REQUIRES_PAYMENT", "FAILED"].includes(payment?.status || "") && reservation?.status === "COMMITTED" && new Date(reservation.expires_at).getTime() > Date.now(),
    };
    return NextResponse.json(payload, { headers });
  } catch (error) {
    const status = error instanceof PosApiError && [401, 403, 404].includes(error.status) ? error.status : 500;
    return NextResponse.json({ ok: false, error: status === 401 ? "Inicia sesión para consultar tu pedido." : "No pudimos consultar tu pedido. Inténtalo nuevamente." }, { status, headers });
  }
}
