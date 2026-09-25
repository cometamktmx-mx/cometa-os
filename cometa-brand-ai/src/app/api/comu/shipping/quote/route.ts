import { NextResponse } from "next/server";
import { PosApiError } from "@/lib/pos/server";
import { requireComuBuyer } from "@/lib/comu/buyers";
import { LocalTestShippingProvider, SkydropxShippingProvider } from "@/lib/comu/shipping-provider";
import { allocateShipping, chooseServices, estimateTextilePackage } from "@/lib/comu/shipping-pricing";
export async function POST(request: Request) {
  try {
    const { buyer, admin } = await requireComuBuyer();
    const body = await request.json() as { orderId?: string; subtotal?: number; provider?: "LOCAL_TEST" | "SKYDROPX"; packages?: Array<{ weightKg: number; lengthCm: number; widthCm: number; heightCm: number }>; policy?: Parameters<typeof allocateShipping>[3] };
    if (!body.orderId || typeof body.subtotal !== "number") throw new PosApiError(400, "COMU_SHIPPING_INPUT", "Datos de envío incompletos.");
    if (body.orderId !== "cart-preview") { const { data: order } = await admin.from("comu_orders").select("id").eq("id", body.orderId).eq("buyer_id", buyer.id).maybeSingle(); if (!order) throw new PosApiError(404, "COMU_ORDER_NOT_FOUND", "La orden no existe."); }
    const packages = body.packages?.length ? body.packages : estimateTextilePackage({ itemCount: 1, totalWeightG: 500 }).map(p => ({ weightKg: p.weightKg, lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm }));
    const provider = body.provider === "SKYDROPX" ? new SkydropxShippingProvider() : new LocalTestShippingProvider();
    if (!provider.quote) throw new PosApiError(501, "COMU_SHIPPING_QUOTE_UNAVAILABLE", "La cotización no está disponible.");
    const quotes = await provider.quote({ orderId: body.orderId, destination: null, packages });
    const selected = chooseServices(quotes.map(q => ({ ...q, provider: body.provider ?? "LOCAL_TEST", package: { ...packages[0], itemCount: 1, preset: "CUSTOM" } })));
    const result = [selected.standard, selected.fast].filter(Boolean).map(q => ({ ...q, allocation: allocateShipping(q!.cost, selected.standard?.cost ?? q!.cost, body.subtotal!, body.policy) }));
    return NextResponse.json({ ok: true, quotes: result });
  } catch (error) { const status = error instanceof PosApiError ? error.status : 502; return NextResponse.json({ ok: false, code: error instanceof PosApiError ? error.code : "COMU_SHIPPING_QUOTE_FAILED", message: error instanceof PosApiError ? error.message : "No se pudo cotizar el envío." }, { status }); }
}
