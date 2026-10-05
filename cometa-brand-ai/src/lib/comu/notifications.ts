import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireComuActor } from "./seller-access";
import { PosApiError } from "@/lib/pos/server";
import type { NotificationAudience, NotificationInbox } from "./notification-contract";

export const notificationHeaders = { "Cache-Control": "private, no-store" };
export function notificationContext(audience: unknown, sellerId: unknown) {
  if (audience !== "SELLER" && audience !== "BUYER") throw new PosApiError(400, "COMU_N1_INPUT_INVALID", "Contexto inválido.");
  if (sellerId !== null && sellerId !== undefined && (typeof sellerId !== "string" || !isNotificationId(sellerId))) throw new PosApiError(400, "COMU_N1_INPUT_INVALID", "Tienda inválida.");
  if (audience === "BUYER" && sellerId) throw new PosApiError(400, "COMU_N1_INPUT_INVALID", "Contexto inválido.");
  return { audience: audience as NotificationAudience, sellerId: typeof sellerId === "string" ? sellerId : null };
}
export function isNotificationId(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
export async function readNotifications(audience: NotificationAudience, sellerId: string | null, limit: number): Promise<NotificationInbox> {
  await requireComuActor();
  const { data, error } = await (await createClient()).rpc("comu_notifications_read_n1", { p_audience: audience, p_seller: sellerId, p_limit: limit });
  if (error || !data) throw new PosApiError(503, "COMU_NOTIFICATIONS_UNAVAILABLE", "No se pudieron consultar las notificaciones.");
  return data as NotificationInbox;
}
export async function markNotifications(id: string | null, audience: NotificationAudience, sellerId: string | null): Promise<number> {
  await requireComuActor();
  const { data, error } = await (await createClient()).rpc("comu_notifications_mark_n1", { p_id: id, p_audience: audience, p_seller: sellerId });
  if (error?.message.includes("COMU_NOTIFICATION_NOT_FOUND")) throw new PosApiError(404, "COMU_NOTIFICATION_NOT_FOUND", "Notificación no disponible.");
  if (error || typeof data !== "number") throw new PosApiError(503, "COMU_NOTIFICATIONS_UNAVAILABLE", "No se pudo actualizar la notificación.");
  return data;
}
export function notificationFailure(error: unknown) {
  return error instanceof PosApiError
    ? { status: error.status, code: error.code, message: error.status >= 500 ? "Notificaciones no disponibles." : error.message }
    : { status: 500, code: "COMU_NOTIFICATIONS_FAILED", message: "No se pudo completar la operación." };
}
