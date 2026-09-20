import { createHash, randomBytes } from "node:crypto";
import { resolveStaffRoles, auditStaff, getStaffSession, verifyStaffPin } from "@/lib/pos/staff-server";
import { handlePosError, ok, PosApiError, readJsonBody, requiredText, requirePosContext, uuidValue } from "@/lib/pos/server";
import { isPosSupervisorAction, isPosStaffRole } from "@/lib/pos/staff-shared";
import { requirePosCommercialAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const context = await requirePosContext(requiredText(body.brandSlug, "brandSlug", 120));
    await requirePosCommercialAccess(context, "pos.access");
    const session = await getStaffSession(context);
    if (!session) throw new PosApiError(401, "POS_STAFF_SESSION_REQUIRED", "Selecciona un operador para continuar.");
    const action = requiredText(body.action, "action", 40);
    if (!isPosSupervisorAction(action)) throw new PosApiError(400, "POS_SUPERVISOR_ACTION_INVALID", "Esta acción no admite autorización de encargado.");
    const supervisorId = uuidValue(body.supervisorStaffId, "supervisorStaffId") as string;
    const entityId = uuidValue(body.entityId, "entityId", false);
    const { data: supervisor } = await context.admin.from("pos_staff").select("id,role,pin_hash,location_id,active,locked_until,failed_pin_attempts").eq("id", supervisorId).eq("brand_slug", context.brand.slug).maybeSingle();
    const roles = supervisor && isPosStaffRole(supervisor.role) ? await resolveStaffRoles(context, supervisor.id, supervisor.role) : [];
    if (!supervisor?.active || !roles.some(role => ["ADMIN", "MANAGER"].includes(role)) || supervisor.id === session.staff.id) throw new PosApiError(403, "POS_SUPERVISOR_INVALID", "Se requiere otro encargado o administrador activo.");
    if (supervisor.location_id && session.locationId && supervisor.location_id !== session.locationId) throw new PosApiError(403, "POS_STAFF_LOCATION_FORBIDDEN", "El encargado pertenece a otra sucursal.");
    if (supervisor.locked_until && new Date(supervisor.locked_until).getTime() > Date.now()) throw new PosApiError(429, "POS_STAFF_LOCKED", "El encargado está bloqueado temporalmente.");
    if (!(await verifyStaffPin(body.pin as string, supervisor.pin_hash))) {
      const attempts = Number(supervisor.failed_pin_attempts || 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 5 * 60_000).toISOString() : null;
      await context.admin.from("pos_staff").update({ failed_pin_attempts: attempts >= 5 ? 0 : attempts, locked_until: lockedUntil }).eq("id", supervisor.id).eq("brand_slug", context.brand.slug);
      throw new PosApiError(401, "POS_STAFF_PIN_INCORRECT", lockedUntil ? "El encargado fue bloqueado temporalmente." : "El PIN del encargado no es correcto.");
    }
    await context.admin.from("pos_staff").update({ failed_pin_attempts: 0, locked_until: null }).eq("id", supervisor.id);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
    const { data, error } = await context.admin.from("pos_staff_authorizations").insert({ token_hash: createHash("sha256").update(token).digest("hex"), brand_id: context.brand.id, brand_slug: context.brand.slug, location_id: session.locationId, requested_by_staff_id: session.staff.id, authorized_by_staff_id: supervisor.id, host_user_id: context.user.userId, action, entity_type: body.entityType ? requiredText(body.entityType, "entityType", 60) : null, entity_id: entityId, expires_at: expiresAt }).select("id").single();
    if (error || !data) throw new PosApiError(500, "POS_SUPERVISOR_AUTH_FAILED", "No se pudo registrar la autorización.");
    await auditStaff(context.admin, { brandId: context.brand.id, brandSlug: context.brand.slug, locationId: session.locationId, actorStaffId: session.staff.id, authorizedByStaffId: supervisor.id, hostUserId: context.user.userId, action: "SUPERVISOR_AUTHORIZE", entityType: body.entityType ? String(body.entityType) : null, entityId, metadata: { authorizedAction: action, authorizationId: data.id } });
    return ok({ authorization: { token, action, entityId, expiresAt } });
  } catch (error) { return handlePosError(error); }
}
