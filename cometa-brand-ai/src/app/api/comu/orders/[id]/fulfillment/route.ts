import { NextResponse } from "next/server";
import { getBuyerFulfillment } from "@/lib/comu/fulfillment";
import { PosApiError } from "@/lib/pos/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ ok: true, fulfillment: await getBuyerFulfillment(id) });
  } catch (error) {
    if (error instanceof PosApiError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, code: "COMU_FULFILLMENT_LOOKUP_FAILED", message: "No se pudo cargar el estado." }, { status: 500 });
  }
}
