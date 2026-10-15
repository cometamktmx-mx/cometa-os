import { NextResponse } from "next/server";
import { requireComuFeature } from "@/lib/comu/features";
import { getOnboardingSnapshot, saveOnboarding } from "@/lib/comu/onboarding";

function failure(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) || 500 : 500;
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "COMU_ONBOARDING_FAILED";
  return NextResponse.json({ ok: false, code, message: error instanceof Error ? error.message : "No se pudo preparar la activación de COMU." }, { status });
}

export async function GET(request: Request) {
  try {
    requireComuFeature("sellerOnboarding");
    const brandSlug = new URL(request.url).searchParams.get("brandSlug") || "";
    return NextResponse.json({ ok: true, onboarding: await getOnboardingSnapshot(brandSlug) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    requireComuFeature("sellerOnboarding");
    const body = await request.json() as Record<string, unknown>;
    const brandSlug = String(body.brandSlug || "");
    return NextResponse.json({ ok: true, onboarding: await saveOnboarding(brandSlug, body) });
  } catch (error) { return failure(error); }
}
