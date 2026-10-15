import { NextResponse } from "next/server";
import { readSellerOrders, validateOrderId, orderHeaders, orderFailure } from "@/lib/comu/seller-orders";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const seller = validateOrderId(new URL(request.url).searchParams.get("sellerId")); const result = await readSellerOrders(seller, new URLSearchParams({ selected: validateOrderId(id), pageSize: "1" })); return NextResponse.json({ ok: true, order: result.selected }, { headers: orderHeaders }); }
  catch (error) { const e = orderFailure(error); return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status, headers: orderHeaders }); }
}
