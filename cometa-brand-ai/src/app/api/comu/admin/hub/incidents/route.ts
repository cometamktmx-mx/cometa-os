import { NextResponse } from "next/server";
import { recordFulfillmentIncident } from "@/lib/comu/fulfillment";
import { PosApiError } from "@/lib/pos/server";
import { orderFailure, orderHeaders, validateOrderId } from "@/lib/comu/seller-orders";
export async function POST(request: Request) {
  try {
    const body = await request.json() as { suborderId?: string; incidentType?: "INCOMPLETE_PACKAGE" | "WRONG_PRODUCT" | "DAMAGED_PACKAGE" | "OTHER"; note?: string; requestId?: string };
    if (!body.suborderId || !body.incidentType || (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 2000))) throw new PosApiError(400, "COMU_INCIDENT_INPUT_INVALID", "Completa la incidencia.");
    validateOrderId(body.suborderId);
    if (body.requestId) validateOrderId(body.requestId);
    return NextResponse.json({ ok: true, incident: await recordFulfillmentIncident(body.suborderId, body.incidentType, body.note, body.requestId) }, { headers: orderHeaders });
  } catch (error) {
    const failure = orderFailure(error);
    return NextResponse.json({ ok: false, code: failure.code, message: failure.message }, { status: failure.status, headers: orderHeaders });
  }
}
