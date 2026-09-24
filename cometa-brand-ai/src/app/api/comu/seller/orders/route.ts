import { NextResponse } from "next/server";
import { getSellerFulfillmentOrders } from "@/lib/comu/fulfillment";
import { PosApiError } from "@/lib/pos/server";

export async function GET(request: Request) {
  try {
    const sellerId = new URL(request.url).searchParams.get("sellerId");
    if (!sellerId) throw new PosApiError(400, "COMU_SELLER_REQUIRED", "Selecciona una tienda.");
    return NextResponse.json({ ok: true, orders: await getSellerFulfillmentOrders(sellerId) });
  } catch (error) {
    if (error instanceof PosApiError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, code: "COMU_FULFILLMENT_FAILED", message: "No se pudieron cargar los pedidos." }, { status: 500 });
  }
}
