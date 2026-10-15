import { NextRequest, NextResponse } from "next/server";
import { authorizeAssetUploadWithReviewGuard } from "@/lib/mercury/admin-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ brandSlug: string; contentItemId: string }> }
) {
  try {
    const { brandSlug, contentItemId } = await params;
    const body = await request.json();
    const result = await authorizeAssetUploadWithReviewGuard(
      brandSlug,
      contentItemId,
      String(body.assetType || ""),
      String(body.fileName || ""),
      String(body.mimeType || ""),
      Number(body.size)
    );
    return NextResponse.json({
      ok: true,
      bucket: "brand-content",
      path: result.path,
      token: result.token,
      assetType: result.assetType,
      fileName: result.fileName,
      mimeType: result.mimeType,
      size: result.size,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UPLOAD_AUTH_FAILED";
    if (code === "REVIEW_PENDING_LOCK") {
      return NextResponse.json(
        { ok: false, error: "REVIEW_PENDING_LOCK" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { ok: false, error: code.includes("INVALID") ? code : "UPLOAD_AUTH_FAILED" },
      { status: code === "CONTENT_NOT_FOUND" ? 404 : 400 }
    );
  }
}
