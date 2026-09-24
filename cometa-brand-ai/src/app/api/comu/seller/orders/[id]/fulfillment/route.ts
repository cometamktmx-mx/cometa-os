import { NextResponse } from "next/server";
import { transitionSuborder } from "@/lib/comu/fulfillment";
import { requireSellerAccess } from "@/lib/comu/seller-access";
import { PosApiError } from "@/lib/pos/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { sellerId?: string; status?: string; note?: string };
    if (!body.sellerId || !body.status) throw new PosApiError(400, "COMU_FULFILLMENT_INPUT_INVALID", "Faltan datos del pedido.");
    await requireSellerAccess(body.sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
    const actor = await import("@/lib/comu/seller-access").then(({ requireComuActor }) => requireComuActor());
    const { data: suborder } = await actor.admin.from("comu_order_suborders").select("id,seller_id").eq("id", id).maybeSingle();
    if (!suborder || suborder.seller_id !== body.sellerId) throw new PosApiError(403, "COMU_SELLER_ACCESS_DENIED", "Este pedido no pertenece a tu tienda.");
    return NextResponse.json({ ok: true, suborder: await transitionSuborder(id, body.status, "SELLER", body.note) });
  } catch (error) {
    if (error instanceof PosApiError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, code: "COMU_FULFILLMENT_FAILED", message: "No se pudo actualizar el pedido." }, { status: 409 });
  }
}
