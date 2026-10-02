import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { PosApiError, type PosRequestContext } from "./server";
import { POS_DEVICE_COOKIE, type PosDevice } from "./device-contract";

type CookieReader = { getAll(): { name: string; value: string }[] };
const SELECT = "id,host_user_id,auth_session_id,brand_slug,location_id,label,status,token_hash,created_at,last_seen_at,expires_at,revoked_at";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function findSessionDevice(context: PosRequestContext) {
  if (!context.user.authSessionId) throw new PosApiError(401, "POS_DEVICE_AUTH_SESSION_REQUIRED", "Inicia sesión nuevamente para validar la terminal.");
  const { data, error } = await context.admin.from("pos_devices").select(SELECT)
    .eq("host_user_id", context.user.userId).eq("auth_session_id", context.user.authSessionId).maybeSingle();
  if (error) throw new PosApiError(503, "POS_DEVICE_LOOKUP_FAILED", "No se pudo validar la terminal.");
  return data;
}

// The auth-session binding is authoritative: deleting the device cookie cannot
// turn an enrolled/revoked terminal back into an unrestricted web session.
export async function resolvePosDevice(context: PosRequestContext, reader?: CookieReader): Promise<PosDevice | null> {
  const row = await findSessionDevice(context);
  const jar = reader || await cookies();
  const token = jar.getAll().find(cookie => cookie.name === POS_DEVICE_COOKIE)?.value;
  if (!row) {
    if (token) throw new PosApiError(401, "POS_DEVICE_SESSION_INVALID", "La credencial de terminal no corresponde a esta cuenta.");
    return null; // Existing web sessions are not automatically enrolled.
  }
  if (row.status !== "ACTIVE" || row.revoked_at) throw new PosApiError(403, "POS_DEVICE_REVOKED", "Esta terminal fue revocada. Solicita acceso al propietario.");
  if (Date.parse(row.expires_at) <= Date.now()) throw new PosApiError(403, "POS_DEVICE_EXPIRED", "El acceso de esta terminal expiró. Inicia sesión nuevamente.");
  if (!token || hash(token) !== row.token_hash) throw new PosApiError(401, "POS_DEVICE_SESSION_INVALID", "La credencial de terminal no es válida. Inicia sesión nuevamente.");
  if (row.brand_slug !== context.brand.slug) throw new PosApiError(403, "POS_DEVICE_BRAND_FORBIDDEN", "Esta terminal pertenece a otro negocio.");
  const { data: location, error } = await context.admin.from("pos_locations").select("id")
    .eq("id", row.location_id).eq("brand_slug", context.brand.slug).eq("active", true).maybeSingle();
  if (error) throw new PosApiError(503, "POS_DEVICE_LOOKUP_FAILED", "No se pudo validar la sucursal de la terminal.");
  if (!location) throw new PosApiError(403, "POS_DEVICE_LOCATION_FORBIDDEN", "La sucursal de esta terminal no está disponible.");
  // Throttle bookkeeping; authorization never relies on last_seen_at.
  if (Date.parse(row.last_seen_at) < Date.now() - 60000) {
    const result = await context.admin.from("pos_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", row.id).eq("status", "ACTIVE");
    if (result.error) throw new PosApiError(503, "POS_DEVICE_LOOKUP_FAILED", "No se pudo validar la terminal.");
  }
  return { id: row.id, hostUserId: row.host_user_id, brandSlug: row.brand_slug, locationId: row.location_id, label: row.label,
    status: row.status, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, revokedAt: row.revoked_at };
}

export function assertDeviceLocation(context: PosRequestContext, locationId: string | null | undefined) {
  if (context.device && locationId && context.device.locationId !== locationId) {
    throw new PosApiError(403, "POS_DEVICE_LOCATION_FORBIDDEN", "La operación pertenece a otra sucursal.");
  }
}

export async function assertDeviceResource(context: PosRequestContext, table: "pos_registers" | "pos_cash_sessions", id: string) {
  if (!context.device) return;
  const { data, error } = await context.admin.from(table).select("location_id").eq("id", id).eq("brand_slug", context.brand.slug).maybeSingle();
  if (error) throw new PosApiError(503, "POS_DEVICE_LOOKUP_FAILED", "No se pudo validar la sucursal.");
  if (!data) throw new PosApiError(404, "POS_DEVICE_RESOURCE_NOT_FOUND", "El recurso no pertenece a este negocio.");
  assertDeviceLocation(context, data.location_id);
}

export async function enrollPosDevice(context: PosRequestContext, locationId: string, label: string) {
  if (await findSessionDevice(context)) throw new PosApiError(409, "POS_DEVICE_ALREADY_ENROLLED", "Esta sesión ya está asociada a una terminal. Inicia una sesión nueva para enrolar otra.");
  const { data: location, error } = await context.admin.from("pos_locations").select("id")
    .eq("id", locationId).eq("brand_slug", context.brand.slug).eq("active", true).maybeSingle();
  if (error) throw new PosApiError(503, "POS_DEVICE_LOOKUP_FAILED", "No se pudo validar la sucursal.");
  if (!location) throw new PosApiError(403, "POS_DEVICE_LOCATION_FORBIDDEN", "La sucursal no pertenece a este negocio.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
  const { data, error: insertError } = await context.admin.from("pos_devices").insert({ host_user_id: context.user.userId,
    auth_session_id: context.user.authSessionId, brand_id: context.brand.id, brand_slug: context.brand.slug,
    location_id: locationId, label, token_hash: hash(token), expires_at: expiresAt }).select("id").single();
  if (insertError?.code === "23505") throw new PosApiError(409, "POS_DEVICE_ALREADY_ENROLLED", "La sesión ya fue enrolada.");
  if (insertError || !data) throw new PosApiError(503, "POS_DEVICE_ENROLL_FAILED", "No se pudo enrolar la terminal.");
  const jar = await cookies();
  jar.set(POS_DEVICE_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 90 * 86400 });
  // A pre-enrollment operator must authenticate again in the device context.
  jar.delete("cometa_pos_staff_session"); jar.delete("cometa_pos_admin_session");
  return { id: String(data.id), expiresAt };
}

export async function revokePosDevice(context: PosRequestContext, deviceId: string) {
  const { data, error } = await context.admin.rpc("pos_revoke_device_v1", {
    p_brand_slug: context.brand.slug, p_device_id: deviceId, p_actor_user_id: context.user.userId,
  });
  if (error) throw new PosApiError(503, "POS_DEVICE_REVOKE_FAILED", "No se pudo revocar la terminal.");
  if (!data) throw new PosApiError(404, "POS_DEVICE_NOT_FOUND", "La terminal no pertenece a este negocio.");
}

export async function clearPosSessionCookies() {
  const jar = await cookies();
  for (const name of [POS_DEVICE_COOKIE, "cometa_pos_staff_session", "cometa_pos_admin_session"]) jar.delete(name);
}
