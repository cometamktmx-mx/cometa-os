import { NextResponse } from "next/server";
import { brandContextErrorResponse } from "@/lib/brand-os/api";
import { getClientMarketingContentItem } from "@/lib/mercury/client-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ brandSlug: string; contentItemId: string }> }
) {
  try {
    const { brandSlug, contentItemId } = await params;
    const result = await getClientMarketingContentItem({ brandSlug, contentItemId });
    if (!result) {
      return NextResponse.json(
        { ok: false, code: "ENTITY_NOT_FOUND", error: "Contenido no encontrado." },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  } catch (error: unknown) {
    return brandContextErrorResponse(error);
  }
}
