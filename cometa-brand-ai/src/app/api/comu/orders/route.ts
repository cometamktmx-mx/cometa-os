import { NextResponse } from "next/server";
import { getBuyerOrders, getSellerOrders } from "@/lib/comu/orders";
import { requireComuFeature } from "@/lib/comu/features";
import { buyerOrderFailure, buyerOrderHeaders, readBuyerOrders } from "@/lib/comu/buyer-orders";
export async function GET(request: Request) {
  try {
    requireComuFeature("catalog");
    const params = new URL(request.url).searchParams, sellerId = params.get("sellerId");
    if (sellerId && params.get("contract") === "b1") return NextResponse.json({ ok: false, code: "COMU_BUYER_INPUT_INVALID", error: "Contexto Buyer no válido." }, { status: 400, headers: buyerOrderHeaders });
    if (sellerId) return NextResponse.json({ ok: true, orders: await getSellerOrders(sellerId) }, { headers: buyerOrderHeaders });
    const result = params.get("contract") === "b1" ? await readBuyerOrders(params) : await getBuyerOrders(params);
    return NextResponse.json({ ok: true, ...result }, { headers: buyerOrderHeaders });
  } catch (error) { const result = buyerOrderFailure(error); return NextResponse.json(result.body, { status: result.status, headers: buyerOrderHeaders }); }
}
