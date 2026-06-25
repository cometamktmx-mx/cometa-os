import { NextResponse } from "next/server";
import {
  buildSalesPlaybookContext,
  getSalesPlaybook,
} from "@/lib/sales-ai/playbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const brandName = searchParams.get("brandName") || "Mar Cosmetic";

    const playbook = await getSalesPlaybook(brandName);
    const context = buildSalesPlaybookContext(playbook);

    return NextResponse.json({
      ok: true,
      brandName,
      playbook,
      context,
    });
  } catch (error: any) {
    console.error("Error generando contexto del playbook:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error generando contexto del playbook",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}