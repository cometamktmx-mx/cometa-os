import { getBrandSlugFromUrl, handlePosError, ok, PosApiError, readJsonBody, requiredText, uuidValue, requirePosContext } from "@/lib/pos/server";
import { canManagePosStaff, getStaffSession, getPosMode, hashStaffPin } from "@/lib/pos/staff-server";
import { isPosStaffRole, staffHasRole } from "@/lib/pos/staff-shared";
import { requirePosCommercialAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requirePosContext(getBrandSlugFromUrl(request));
    await requireStaffAdministrator(context, false);
    const multiRole = await getPosMode(context) !== "RETAIL";
    const { data, error } = await context.admin.from("pos_staff").select("id,name,role,location_id,active,locked_until,created_at,updated_at,roles:pos_staff_roles(role,active)").eq("brand_slug", context.brand.slug).order("name");
    if (error) throw new PosApiError(500, "POS_STAFF_READ_FAILED", "No se pudo cargar el equipo operativo.");
    return ok({ multiRole, staff: (data || []).map((row) => ({ id: row.id, name: row.name, role: row.role, roles: multiRole ? (row.roles || []).filter(r => r.active).map(r => r.role) : [row.role], locationId: row.location_id, active: row.active, lockedUntil: row.locked_until, createdAt: row.created_at, updatedAt: row.updated_at })) });
  } catch (error) { return handlePosError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const context = await requirePosContext(requiredText(body.brandSlug, "brandSlug", 120));
    const bootstrap = await requireStaffAdministrator(context, true);
    const roles = parseRoles(body.roles);
    const role = roles?.[0] || requiredText(body.role, "role", 20).toUpperCase();
    if (!isPosStaffRole(role)) throw new PosApiError(400, "POS_STAFF_ROLE_INVALID", "El rol operativo no es válido.");
    if (bootstrap === "empty" && !(roles || [role]).includes("ADMIN")) throw new PosApiError(400, "POS_STAFF_FIRST_ROLE_INVALID", "El primer operador debe ser Administrador.");
    const locationId = uuidValue(body.locationId, "locationId", false);
    if (locationId) await assertLocation(context, locationId);
    const pinHash = await hashStaffPin(body.pin as string);
    const session = await getStaffSession(context);
    const { data, error } = await context.admin.rpc("pos_staff_save_v2", { p_brand_slug: context.brand.slug, p_host_user_id: context.user.userId, p_session_id: session?.id || null, p_staff_id: null, p_fields: { location_id: locationId, name: requiredText(body.name, "name", 120), role, pin_hash: pinHash }, p_roles: roles });
    if (error || !data) throw new PosApiError(500, "POS_STAFF_CREATE_FAILED", "No se pudo crear el operador.");
    return ok({ staff: { id: data.id, name: data.name, role: data.role, locationId: data.location_id, active: data.active } }, 201);
  } catch (error) { return handlePosError(error); }
}

export async function PATCH(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const context = await requirePosContext(requiredText(body.brandSlug, "brandSlug", 120));
    await requireStaffAdministrator(context, false);
    const staffId = uuidValue(body.staffId, "staffId") as string;
    const updates: Record<string, unknown> = { updated_by: context.user.userId };
    if (body.name !== undefined) updates.name = requiredText(body.name, "name", 120);
    if (body.role !== undefined) { const role = requiredText(body.role, "role", 20).toUpperCase(); if (!isPosStaffRole(role)) throw new PosApiError(400, "POS_STAFF_ROLE_INVALID", "El rol operativo no es válido."); updates.role = role; }
    if (body.active !== undefined) updates.active = body.active === true;
    if (body.locationId !== undefined) { const locationId = uuidValue(body.locationId, "locationId", false); if (locationId) await assertLocation(context, locationId); updates.location_id = locationId; }
    if (body.pin !== undefined) { updates.pin_hash = await hashStaffPin(body.pin as string); updates.pin_changed_at = new Date().toISOString(); updates.failed_pin_attempts = 0; updates.locked_until = null; }
    const session = await getStaffSession(context);
    const roles = parseRoles(body.roles);
    const food = await getPosMode(context) !== "RETAIL";
    const { data, error } = await context.admin.rpc("pos_staff_save_v2", { p_brand_slug: context.brand.slug, p_host_user_id: context.user.userId, p_session_id: session?.id || null, p_staff_id: staffId, p_fields: updates, p_roles: roles || (food && isPosStaffRole(updates.role) ? [updates.role] : null) });
    if (error || !data) throw new PosApiError(400, "POS_STAFF_UPDATE_FAILED", "No se pudo actualizar el operador.");
    return ok({ staff: { id: data.id, name: data.name, role: data.role, locationId: data.location_id, active: data.active } });
  } catch (error) { return handlePosError(error); }
}

async function assertLocation(context: Awaited<ReturnType<typeof requirePosContext>>, locationId: string) {
  const { data } = await context.admin.from("pos_locations").select("id").eq("id", locationId).eq("brand_slug", context.brand.slug).maybeSingle();
  if (!data) throw new PosApiError(400, "POS_STAFF_LOCATION_INVALID", "La sucursal no pertenece a esta marca.");
}

async function requireStaffAdministrator(context: Awaited<ReturnType<typeof requirePosContext>>, allowFirstRun: boolean) {
  await requirePosCommercialAccess(context, "pos.access");
  if (!canManagePosStaff(context)) throw new PosApiError(403, "POS_STAFF_MANAGE_REQUIRED", "No tienes permiso para administrar operadores.");
  const { data: rows, error } = await context.admin.from("pos_staff").select("role").eq("brand_slug", context.brand.slug).eq("active", true);
  if (error) throw new PosApiError(500, "POS_STAFF_COUNT_FAILED", "No se pudo validar el equipo operativo.");
  const firstRun = (rows || []).length === 0;
  if (firstRun && allowFirstRun) return "empty" as const;
  const session = await getStaffSession(context);
  if (!session || !staffHasRole(session.staff, "ADMIN")) throw new PosApiError(403, "POS_STAFF_ADMIN_REQUIRED", "Se requiere un operador Administrador para gestionar el equipo.");
  return "admin" as const;
}

function parseRoles(value: unknown) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || !value.length || value.length > 5 || !value.every(isPosStaffRole) || new Set(value).size !== value.length) throw new PosApiError(400, "POS_STAFF_ROLE_INVALID", "Selecciona roles válidos, sin duplicados.");
  return value;
}
