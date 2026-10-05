import { NextResponse } from "next/server";
import { PosApiError } from "@/lib/pos/server";
import { isNotificationId, markNotifications, notificationContext, notificationFailure, notificationHeaders, readNotifications } from "@/lib/comu/notifications";

function failure(error: unknown) {
  const e = notificationFailure(error);
  return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status, headers: notificationHeaders });
}
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const context = notificationContext(query.get("audience") || "SELLER", query.get("sellerId"));
    const text = query.get("limit") || "20", limit = Number(text);
    if (!/^\d+$/.test(text) || limit < 1 || limit > 50) throw new PosApiError(400, "COMU_N1_INPUT_INVALID", "Límite inválido.");
    return NextResponse.json({ ok: true, ...await readNotifications(context.audience, context.sellerId, limit) }, { headers: notificationHeaders });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new PosApiError(400, "COMU_N1_INPUT_INVALID", "Solicitud inválida.");
    const input = body as Record<string, unknown>;
    const context = notificationContext(input.audience, input.sellerId);
    if (input.action !== "read" && input.action !== "read-all") throw new PosApiError(400, "COMU_N1_INPUT_INVALID", "Acción inválida.");
    if (input.action === "read" && (typeof input.id !== "string" || !isNotificationId(input.id))) throw new PosApiError(400, "COMU_N1_INPUT_INVALID", "Notificación inválida.");
    const changed = await markNotifications(input.action === "read" ? String(input.id) : null, context.audience, context.sellerId);
    return NextResponse.json({ ok: true, changed }, { headers: notificationHeaders });
  } catch (error) { return failure(error); }
}
