import { NextResponse } from "next/server";
import { requireComuBuyer } from "@/lib/comu/buyers";
import { PosApiError } from "@/lib/pos/server";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { buyer, admin } = await requireComuBuyer();
    const id = new URL(request.url).searchParams.get("orderId");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "Pedido no disponible.");
    const { data: order, error } = await admin.from("comu_orders").select("id,subtotal,shipping_total").eq("id", id).eq("buyer_id", buyer.id).maybeSingle();
    if (error) throw error;
    if (!order) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "Pedido no disponible.");
    const { data: shipments, error: shipmentError } = await admin.from("comu_shipments").select("tracking_number,carrier").eq("master_order_id", order.id);
    if (shipmentError) throw shipmentError;
    return NextResponse.json({ ok: true, subtotal: Number(order.subtotal), shipping: Number(order.shipping_total), shipments: (shipments || []).filter(row => row.tracking_number) }, { headers });
  } catch (error) { return NextResponse.json({ ok: false, error: "No pudimos consultar la entrega." }, { status: error instanceof PosApiError ? error.status : 500, headers }); }
}
