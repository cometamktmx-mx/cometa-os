import { NextResponse } from "next/server";
import { receiveAtHub } from "@/lib/comu/fulfillment";
import { requireComuActor } from "@/lib/comu/seller-access";
import { PosApiError } from "@/lib/pos/server";

export async function POST(request: Request) {
  try {
    const actor = await requireComuActor();
    if (!actor.isAdmin) throw new PosApiError(403, "COMU_HUB_ACCESS_DENIED", "No tienes acceso al HUB.");
    const body = await request.json() as { suborderId?: string; token?: string; note?: string };
    if (!body.suborderId || !body.token) throw new PosApiError(400, "COMU_HUB_INPUT_INVALID", "Indica el código de recepción.");
    const { data: suborder } = await actor.admin.from("comu_order_suborders").select("id,hub_handoff_token,fulfillment_status").eq("id", body.suborderId).maybeSingle();
    if (!suborder || suborder.hub_handoff_token !== body.token) throw new PosApiError(403, "COMU_HUB_TOKEN_INVALID", "El código no es válido.");
    return NextResponse.json({ ok: true, suborder: await receiveAtHub(body.suborderId, body.note) });
  } catch (error) {
    if (error instanceof PosApiError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, code: "COMU_HUB_RECEIVE_FAILED", message: "No se pudo registrar la recepción." }, { status: 409 });
  }
}
