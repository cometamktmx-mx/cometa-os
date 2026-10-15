import { NextResponse } from "next/server";
import { prepareDirectShipment, shipDirectShipment } from "@/lib/comu/fulfillment";
import { PosApiError } from "@/lib/pos/server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params; const body = await request.json() as { sellerId?: string; action?: string; weightKg?: number; lengthCm?: number; widthCm?: number; heightCm?: number };
    if (!body.sellerId) throw new PosApiError(400, "COMU_SELLER_REQUIRED", "Falta la tienda.");
    if (body.action === "SHIP") return NextResponse.json({ ok: true, suborder: await shipDirectShipment(id, body.sellerId) });
    if (![body.weightKg, body.lengthCm, body.widthCm, body.heightCm].every(v => typeof v === "number" && v > 0)) throw new PosApiError(400, "COMU_SHIPMENT_INPUT_INVALID", "Completa las medidas del paquete.");
    return NextResponse.json({ ok: true, shipment: await prepareDirectShipment(id, body.sellerId, { weightKg: body.weightKg!, lengthCm: body.lengthCm!, widthCm: body.widthCm!, heightCm: body.heightCm! }) });
  } catch (error) { const e = error instanceof PosApiError ? error : new PosApiError(409, "COMU_SHIPMENT_FAILED", "No se pudo preparar el envío."); return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status }); }
}
