import { NextResponse } from "next/server";
import { prepareShipment } from "@/lib/comu/fulfillment";
import { PosApiError } from "@/lib/pos/server";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { orderId?: string; weightKg?: number; lengthCm?: number; widthCm?: number; heightCm?: number };
    if (!body.orderId || ![body.weightKg, body.lengthCm, body.widthCm, body.heightCm].every((value) => typeof value === "number" && value > 0)) throw new PosApiError(400, "COMU_SHIPMENT_INPUT_INVALID", "Completa las medidas del paquete.");
    return NextResponse.json({ ok: true, shipment: await prepareShipment(body.orderId, { weightKg: body.weightKg!, lengthCm: body.lengthCm!, widthCm: body.widthCm!, heightCm: body.heightCm! }) });
  } catch (error) {
    if (error instanceof PosApiError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, code: "COMU_SHIPMENT_FAILED", message: "No se pudo preparar el envío." }, { status: 409 });
  }
}
