import "server-only";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PosApiError, type PosRequestContext } from "@/lib/pos/server";
import { POS_STAFF_ROLE_PERMISSIONS, resolvePosMode, isPosStaffRole, staffHasRole, staffRoles, type PosStaffPermission, type PosStaffRole } from "@/lib/pos/staff-shared";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "cometa_pos_staff_session";
const SESSION_HOURS = 12;
const ADMIN_COOKIE = "cometa_pos_admin_session";

export async function getPosMode(context: PosRequestContext) {
  const { data, error } = await context.admin.from("pos_business_profiles").select("profile_code").eq("brand_slug", context.brand.slug).single();
  if (error || !data || typeof data.profile_code !== "string" || !data.profile_code.trim()) {
    throw new PosApiError(503, "POS_PROFILE_READ_FAILED", "No se pudo resolver el perfil de esta terminal. Reintenta.");
  }
  return resolvePosMode(data.profile_code);
}

export async function isStaffAdminMode(session: PosStaffSession | null, adminSessionId?: string | null) {
  const value = adminSessionId === undefined ? (await cookies()).get(ADMIN_COOKIE)?.value : adminSessionId;
  return Boolean(session && staffHasRole(session.staff, "ADMIN") && value === session.id);
}

export async function setStaffAdminMode(session: PosStaffSession, enabled: boolean) {
  const store = await cookies();
  if (!enabled) { store.delete(ADMIN_COOKIE); return; }
  if (!staffHasRole(session.staff, "ADMIN")) throw new PosApiError(403, "POS_ADMIN_OPERATOR_REQUIRED", "Se requiere un operador Administrador.");
  store.set(ADMIN_COOKIE, session.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_HOURS * 3600 });
}

export type PosStaffSafe = { id: string; name: string; role: PosStaffRole; roles?: PosStaffRole[]; locationId: string | null; active: boolean };
export type PosStaffSession = { id: string; staff: PosStaffSafe; brandSlug: string; locationId: string | null; expiresAt: string };

export async function hashStaffPin(pin: string) {
  assertPin(pin);
  const salt = randomBytes(16);
  const derived = (await scrypt(pin, salt, 32)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyStaffPin(pin: string, encoded: string) {
  assertPin(pin);
  const [algorithm, saltValue, hashValue] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = (await scrypt(pin, Buffer.from(saltValue, "base64url"), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function assertPin(pin: unknown): asserts pin is string {
  if (typeof pin !== "string" || !/^\d{4,8}$/.test(pin)) {
    throw new PosApiError(400, "POS_STAFF_PIN_INVALID", "El PIN debe contener entre 4 y 8 dígitos.");
  }
}

export function hasStaffPermission(role: PosStaffRole, permission: PosStaffPermission) {
  return POS_STAFF_ROLE_PERMISSIONS[role].includes(permission);
}

export async function resolveStaffRoles(context: PosRequestContext, staffId: string, legacyRole: PosStaffRole): Promise<PosStaffRole[]> {
  if (await getPosMode(context) === "RETAIL") return [legacyRole];
  const { data, error } = await context.admin.from("pos_staff_roles").select("role").eq("brand_slug", context.brand.slug).eq("staff_id", staffId).eq("active", true);
  if (error) throw new PosApiError(503, "POS_STAFF_READ_FAILED", "No se pudieron validar los roles del operador.");
  return (data || []).map(row => row.role).filter(isPosStaffRole);
}

export async function createStaffSession(context: PosRequestContext, staff: PosStaffSafe) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await context.admin.from("pos_staff_sessions").insert({
    token_hash: tokenHash, host_user_id: context.user.userId, staff_id: staff.id,
    brand_id: context.brand.id, brand_slug: context.brand.slug, location_id: staff.locationId,
    expires_at: expiresAt, last_seen_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !data) throw new PosApiError(500, "POS_STAFF_SESSION_CREATE_FAILED", "No se pudo iniciar la sesión operacional.");
  const store = await cookies();
  store.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_HOURS * 3600 });
  return { id: String(data.id), staff, brandSlug: context.brand.slug, locationId: staff.locationId, expiresAt } satisfies PosStaffSession;
}

export async function getStaffSession(context: PosRequestContext, requestToken?: string | null): Promise<PosStaffSession | null> {
  const token = requestToken === undefined ? (await cookies()).get(COOKIE_NAME)?.value : requestToken;
  if (!token) return null;
  const now = new Date().toISOString();
  const { data, error } = await context.admin.from("pos_staff_sessions").select("id,brand_slug,location_id,expires_at,revoked_at,staff:pos_staff(id,name,role,location_id,active)")
    .eq("token_hash", hashToken(token)).eq("host_user_id", context.user.userId).eq("brand_slug", context.brand.slug).is("revoked_at", null).gt("expires_at", now).maybeSingle();
  if (error) throw new PosApiError(503, "POS_STAFF_SESSION_READ_FAILED", "No se pudo validar la sesión operacional.");
  if (!data) return null;
  const rawStaff = Array.isArray(data.staff) ? data.staff[0] : data.staff;
  if (!rawStaff?.active) return null;
  const staff: PosStaffSafe = { id: String(rawStaff.id), name: String(rawStaff.name), role: rawStaff.role as PosStaffRole, locationId: rawStaff.location_id ? String(rawStaff.location_id) : null, active: true };
  staff.roles = await resolveStaffRoles(context, staff.id, staff.role);
  if (staff.locationId !== (data.location_id || null)) return null;
  await context.admin.from("pos_staff_sessions").update({ last_seen_at: now }).eq("id", data.id).is("revoked_at", null);
  return { id: String(data.id), staff, brandSlug: String(data.brand_slug), locationId: data.location_id ? String(data.location_id) : null, expiresAt: String(data.expires_at) };
}

export async function revokeStaffSession(context: PosRequestContext, action: "STAFF_LOGOUT" | "STAFF_LOCK" | "STAFF_SWITCH") {
  const session = await getStaffSession(context);
  if (session) {
    const { error } = await context.admin.from("pos_staff_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", session.id).eq("brand_slug", context.brand.slug);
    if (error) throw new PosApiError(503, "POS_STAFF_SESSION_REVOKE_FAILED", "No se pudo bloquear la sesión. Reintenta.");
    await auditStaff(context.admin, { brandId: context.brand.id, brandSlug: context.brand.slug, locationId: session.locationId, actorStaffId: session.staff.id, hostUserId: context.user.userId, action, entityType: "staff_session", entityId: session.id });
  }
  (await cookies()).delete(COOKIE_NAME);
  (await cookies()).delete(ADMIN_COOKIE);
}

export async function requireStaffSession(context: PosRequestContext, permission: PosStaffPermission, locationId?: string | null) {
  const session = await getStaffSession(context);
  if (!session) throw new PosApiError(401, "POS_STAFF_SESSION_REQUIRED", "Selecciona un operador para continuar.");
  if (!staffRoles(session.staff).some(role => hasStaffPermission(role, permission))) throw new PosApiError(403, "POS_STAFF_PERMISSION_REQUIRED", "Este operador no tiene permiso para realizar la acción.");
  if (session.staff.locationId && locationId && session.staff.locationId !== locationId) throw new PosApiError(403, "POS_STAFF_LOCATION_FORBIDDEN", "El operador pertenece a otra sucursal.");
  return session;
}

export async function consumeSupervisorAuthorization(context: PosRequestContext, token: string, action: string, entityId?: string | null) {
  const now = new Date().toISOString();
  const { data, error } = await context.admin.from("pos_staff_authorizations").update({ consumed_at: now }).eq("token_hash", hashToken(token)).eq("brand_slug", context.brand.slug).eq("host_user_id", context.user.userId).eq("action", action).is("consumed_at", null).gt("expires_at", now).select("id,requested_by_staff_id,authorized_by_staff_id,entity_id").maybeSingle();
  if (error || !data || (entityId && data.entity_id !== entityId)) throw new PosApiError(403, "POS_SUPERVISOR_AUTH_INVALID", "La autorización expiró, fue utilizada o no corresponde a esta acción.");
  return data;
}

export async function auditStaff(admin: SupabaseClient, event: { brandId: string; brandSlug: string; locationId?: string | null; actorStaffId?: string | null; authorizedByStaffId?: string | null; hostUserId: string; action: string; entityType?: string | null; entityId?: string | null; metadata?: Record<string, unknown> }) {
  const { error } = await admin.from("pos_staff_audit_events").insert({ brand_id: event.brandId, brand_slug: event.brandSlug, location_id: event.locationId || null, actor_staff_id: event.actorStaffId || null, authorized_by_staff_id: event.authorizedByStaffId || null, host_user_id: event.hostUserId, action: event.action, entity_type: event.entityType || null, entity_id: event.entityId || null, metadata: event.metadata || {} });
  if (error) throw new PosApiError(500, "POS_STAFF_AUDIT_FAILED", "No se pudo registrar la acción operacional.");
}

export function canManagePosStaff(context: PosRequestContext) {
  return context.user.isAdmin || context.membership?.effectiveRole === "owner" || context.membership?.effectiveRole === "admin";
}

function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
