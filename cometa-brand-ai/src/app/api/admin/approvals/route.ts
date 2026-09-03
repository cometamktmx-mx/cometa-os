import { NextResponse } from "next/server";
import { mutateApproval } from "@/lib/workspace/approvals";

const ACTIONS = new Set(["request_internal_changes", "approve_internal", "send_to_client"]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const brandSlug = typeof body.brandSlug === "string" ? body.brandSlug.trim() : "";
    const contentItemId = typeof body.contentItemId === "string" ? body.contentItemId.trim() : "";
    if (!ACTIONS.has(action) || !brandSlug || !contentItemId) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
    const result = await mutateApproval({ action: action as "request_internal_changes" | "approve_internal" | "send_to_client", brandSlug, contentItemId, comment: typeof body.comment === "string" ? body.comment : undefined });
    return NextResponse.json({ ok: true, result });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "APPROVAL_ACTION_FAILED";
    const status = code === "INVALID_COMMENT" ? 400 : code.includes("NOT_ALLOWED") || code.includes("CONFLICT") ? 409 : code === "CONTENT_NOT_FOUND" ? 404 : code.includes("AUTH") || code.includes("ACCESS") ? 403 : 500;
    console.error("[APPROVAL_CENTER_ACTION_FAILED]", { code, status });
    return NextResponse.json({ error: code === "INVALID_COMMENT" ? "Escribe un comentario para solicitar los cambios." : "No se pudo completar la acción." }, { status });
  }
}
