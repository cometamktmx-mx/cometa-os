import { NextResponse } from "next/server";
import { transitionSuborder } from "@/lib/comu/fulfillment";
import { requireSellerAccess } from "@/lib/comu/seller-access";
import { PosApiError } from "@/lib/pos/server";
import { readSellerOrders, orderHeaders, orderFailure } from "@/lib/comu/seller-orders";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { sellerId?: string; status?: string; note?: string };
    if (!body.sellerId || !body.status) throw new PosApiError(400, "COMU_FULFILLMENT_INPUT_INVALID", "Faltan datos del pedido.");
    await requireSellerAccess(body.sellerId, ["OWNER", "ADMIN", "ORDER_MANAGER"]);
    const actor = await import("@/lib/comu/seller-access").then(({ requireComuActor }) => requireComuActor());
    const { data: suborder } = await actor.admin.from("comu_order_suborders").select("id,seller_id").eq("id", id).maybeSingle();
    if (!suborder || suborder.seller_id !== body.sellerId) throw new PosApiError(403, "COMU_SELLER_ACCESS_DENIED", "Este pedido no pertenece a tu tienda.");
    await transitionSuborder(id, body.status, "SELLER", body.note);
    const result = await readSellerOrders(body.sellerId, new URLSearchParams({ selected: id, pageSize: "1" }));
    return NextResponse.json({ ok: true, suborder: result.selected }, { headers: orderHeaders });
  } catch (error) {
    const e = orderFailure(error); return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status, headers: orderHeaders });
  }
}
