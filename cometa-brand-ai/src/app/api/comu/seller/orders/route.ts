import { NextResponse } from "next/server";
import { getSellerFulfillmentOrders } from "@/lib/comu/fulfillment";
import { PosApiError } from "@/lib/pos/server";
import { orderHeaders, readSellerOrders, orderFailure } from "@/lib/comu/seller-orders";

export async function GET(request: Request) {
  try {
    const sellerId = new URL(request.url).searchParams.get("sellerId");
    if (!sellerId) throw new PosApiError(400, "COMU_SELLER_REQUIRED", "Selecciona una tienda.");
    const query = new URL(request.url).searchParams;
    if (query.get("contract") === "o1") return NextResponse.json({ ok: true, ...await readSellerOrders(sellerId, query) }, { headers: orderHeaders });
    return NextResponse.json({ ok: true, orders: await getSellerFulfillmentOrders(sellerId) }, { headers: orderHeaders });
  } catch (error) {
    const failure = orderFailure(error); return NextResponse.json({ ok: false, code: failure.code, message: failure.message }, { status: failure.status, headers: orderHeaders });
  }
}
