import { NextResponse } from "next/server";
import { requireComuFeature } from "@/lib/comu/features";
import { createReservation } from "@/lib/comu/reservations";
import { PosApiError } from "@/lib/pos/server";

export async function POST(request: Request) {
  try {
    requireComuFeature("catalog");
    const body = await request.json() as { idempotencyKey?: unknown };
    const key = String(body.idempotencyKey || "");
    if (!key) return NextResponse.json({ ok: false, code: "COMU_IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
    // The helper also returns server-only buyer/admin context; never serialize it.
    const { reservation } = await createReservation(key);
    return NextResponse.json({ ok: true, reservation });
  } catch (error) {
    const featureDisabled = error instanceof Error && "code" in error && error.code === "COMU_FEATURE_DISABLED";
    const status = error instanceof PosApiError ? error.status : featureDisabled ? 404 : 500;
    return NextResponse.json({
      ok: false,
      code: error instanceof PosApiError ? error.code : featureDisabled ? "COMU_FEATURE_DISABLED" : "COMU_RESERVATION_FAILED",
      error: error instanceof PosApiError && status < 500 && error.code !== "COMU_RESERVATION_FAILED"
        ? error.message
        : "No pudimos reservar tus piezas. Inténtalo nuevamente.",
    }, { status });
  }
}
