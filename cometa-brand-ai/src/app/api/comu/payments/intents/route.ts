import { NextResponse } from "next/server";
import { createComuPaymentIntent, getBuyerPayment } from "@/lib/comu/payments";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const orderId = new URL(request.url).searchParams.get("orderId");
    if (!orderId) return NextResponse.json({ ok: false, code: "COMU_ORDER_REQUIRED" }, { status: 400 });
    return NextResponse.json({ ok: true, payment: await getBuyerPayment(orderId) });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
    return NextResponse.json({ ok: false, code: "COMU_PAYMENT_LOOKUP_FAILED", error: error instanceof Error ? error.message : "No se pudo cargar el pago." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { orderId?: unknown; idempotencyKey?: unknown };
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.length >= 12 ? body.idempotencyKey : crypto.randomUUID();
    if (!orderId) return NextResponse.json({ ok: false, code: "COMU_ORDER_REQUIRED" }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await createComuPaymentIntent(orderId, idempotencyKey)) });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
    return NextResponse.json({ ok: false, code: typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "COMU_PAYMENT_INTENT_FAILED", error: error instanceof Error ? error.message : "No se pudo iniciar el pago." }, { status });
  }
}
