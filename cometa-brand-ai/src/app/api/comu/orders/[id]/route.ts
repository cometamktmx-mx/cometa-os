import { NextResponse } from "next/server";
import { buyerOrderFailure, buyerOrderHeaders, readBuyerOrder } from "@/lib/comu/buyer-orders";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json({ ok: true, order: await readBuyerOrder((await params).id, new URL(request.url).searchParams) }, { headers: buyerOrderHeaders }); }
  catch (error) { const result = buyerOrderFailure(error); return NextResponse.json(result.body, { status: result.status, headers: buyerOrderHeaders }); }
}
