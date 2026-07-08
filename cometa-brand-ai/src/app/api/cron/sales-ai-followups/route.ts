import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeBaseUrl(value?: string | null) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return fallback;

  return Math.max(min, Math.min(max, numberValue));
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized cron request.",
        },
        { status: 401 }
      );
    }

    const internalSecret = String(
      process.env.SALES_AI_INTERNAL_SECRET || ""
    ).trim();

    if (!internalSecret) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta SALES_AI_INTERNAL_SECRET en Vercel.",
        },
        { status: 500 }
      );
    }

    const requestOrigin = new URL(request.url).origin;

    const appUrl =
      normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
      normalizeBaseUrl(process.env.APP_URL) ||
      requestOrigin;

    const brandName =
      String(process.env.SALES_AI_FOLLOWUP_CRON_BRAND_NAME || "").trim() ||
      "Cometa Mkt";

    const limit = clampNumber(
      process.env.SALES_AI_FOLLOWUP_CRON_LIMIT,
      10,
      1,
      50
    );

    const runResponse = await fetch(`${appUrl}/api/sales-ai/followups/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cometa-internal-secret": internalSecret,
      },
      body: JSON.stringify({
        brandName,
        limit,
        force: false,
      }),
      cache: "no-store",
    });

    const data = await runResponse.json().catch(() => null);

    if (!runResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          source: "sales_ai_followups_cron",
          error: "El cron llamó followups/run pero respondió con error.",
          status: runResponse.status,
          data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      source: "sales_ai_followups_cron",
      message: "Cron de follow-ups ejecutado correctamente.",
      brandName,
      limit,
      result: data,
    });
  } catch (error: any) {
    console.error("SALES_AI_FOLLOWUPS_CRON_ERROR:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Error ejecutando cron de follow-ups de SALES AI.",
      },
      { status: 500 }
    );
  }
}