import { getBrandSlugFromUrl, handlePosError, ok, PosApiError, readJsonBody, requiredText, requirePosContext, uuidValue } from "@/lib/pos/server";
import { resolveStaffRoles, auditStaff, createStaffSession, getStaffSession, getPosMode, isStaffAdminMode, setStaffAdminMode, revokeStaffSession, verifyStaffPin, assertPin } from "@/lib/pos/staff-server";
import { type PosStaffRole } from "@/lib/pos/staff-shared";
import { requirePosCommercialAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { RETAIL_ROLES } from "@/lib/pos/retail-permissions";
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

export async function GET(request: Request) {
  try {
    const context = await requirePosContext(getBrandSlugFromUrl(request));
    await requirePosCommercialAccess(context, "pos.access");
    const [mode, brandingResult, staffResult, locationsResult, session] = await Promise.all([
      getPosMode(context),
      context.admin.from("pos_branding").select("display_name,logo_url,primary_color,secondary_color,accent_color,text_color,theme_mode,legal_name,tax_id,phone,whatsapp,ticket_footer,receipt_message").eq("brand_slug", context.brand.slug).maybeSingle(),
      context.admin.from("pos_staff").select("id,name,role,retail_role,retail_permissions,location_id,active,locked_until,roles:pos_staff_roles(role,active)").eq("brand_slug", context.brand.slug).eq("active", true).order("name"),
      context.admin.from("pos_locations").select("id,name").eq("brand_slug", context.brand.slug).eq("active", true).order("name"),
      getStaffSession(context),
    ]);
    if (brandingResult.error || staffResult.error || locationsResult.error) throw new PosApiError(503, "POS_STAFF_READ_FAILED", "No se pudo preparar la terminal. Reintenta.");
    const staff = staffResult.data || [];
    const branding = brandingResult.data;
    const locations = locationsResult.data;
    return ok({ deviceId: context.device?.id || null, mode, adminMode: await isStaffAdminMode(session), gateRequired: true, firstRun: mode === "RETAIL" ? !staff.some(row=>row.role==="ADMIN"&&(!row.retail_permissions || row.retail_permissions.includes("STAFF")&&row.retail_permissions.includes("SETTINGS"))) : (staff || []).length === 0, canConfigure: context.user.isAdmin || ["owner", "admin"].includes(context.membership?.effectiveRole || ""), branding: branding || null, locations: locations || [], staff: (staff || []).map((row) => ({ id: row.id, name: row.name, role: row.role, retailRole: row.retail_role, retailPermissions: row.retail_permissions, roleLabel: mode === "RETAIL" ? (row.retail_role ? RETAIL_ROLES[row.retail_role as keyof typeof RETAIL_ROLES] : row.role === "ADMIN" ? "Administrador" : "Usuario existente · revisar permisos") : undefined, roles: mode === "RETAIL" ? [row.role] : (row.roles || []).filter(r => r.active).map(r => r.role), locationId: row.location_id, lockedUntil: row.locked_until })), session });
  } catch (error) { return handlePosError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const context = await requirePosContext(requiredText(body.brandSlug, "brandSlug", 120));
    const action = requiredText(body.action, "action", 20);
    if (["logout", "lock", "switch"].includes(action)) { await revokeStaffSession(context, action === "lock" ? "STAFF_LOCK" : action === "switch" ? "STAFF_SWITCH" : "STAFF_LOGOUT"); return ok({ session: null }); }
    if (action === "activity") {
      const session = await getStaffSession(context);
      if (!session) throw new PosApiError(401, "POS_STAFF_SESSION_REQUIRED", "Desbloquea la terminal con tu PIN.");
      const result = await context.admin.from("pos_staff_sessions").update({last_human_at: new Date().toISOString()}).eq("id",session.id).eq("brand_slug",context.brand.slug).is("revoked_at",null);
      if (result.error) throw new PosApiError(503,"POS_STAFF_SESSION_READ_FAILED","No se pudo renovar la sesión.");
      return ok({active:true});
    }
    if (action === "admin" || action === "operation") {
      await requirePosCommercialAccess(context, "pos.access");
      const session = await getStaffSession(context);
      if (!session) throw new PosApiError(401, "POS_STAFF_SESSION_REQUIRED", "Selecciona un operador.");
      await setStaffAdminMode(session, action === "admin");
      return ok({ adminMode: action === "admin" });
    }
    if (action !== "login") throw new PosApiError(400, "POS_STAFF_SESSION_ACTION_INVALID", "La acción operacional no es válida.");
    await requirePosCommercialAccess(context, "pos.access");
    await getPosMode(context);
    const staffId = uuidValue(body.staffId, "staffId") as string;
    const { data: staff, error: staffError } = await context.admin.from("pos_staff").select("id,name,role,retail_role,retail_permissions,location_id,active,pin_hash,failed_pin_attempts,locked_until").eq("id", staffId).eq("brand_slug", context.brand.slug).maybeSingle();
    if (staffError) throw new PosApiError(503, "POS_STAFF_READ_FAILED", "No se pudo validar el operador.");
    if (!staff?.active) throw new PosApiError(404, "POS_STAFF_NOT_FOUND", "El operador no está disponible.");
    if (staff.locked_until && new Date(staff.locked_until).getTime() > Date.now()) throw new PosApiError(429, "POS_STAFF_LOCKED", "Demasiados intentos. Espera unos minutos.", { lockedUntil: staff.locked_until });
    const retail = await getPosMode(context) === "RETAIL";
    if(retail){assertPin(body.pin);const claim=await context.admin.rpc("pos_retail_pin_attempt_v1",{p_brand:context.brand.slug,p_staff:staff.id});if(claim.error)throw new PosApiError(503,"POS_STAFF_READ_FAILED","No se pudo validar el l?mite de intentos.");if(claim.data!==true)throw new PosApiError(429,"POS_STAFF_LOCKED","Demasiados intentos. Espera cinco minutos.");}
    const valid = await verifyStaffPin(body.pin as string, staff.pin_hash);
    if (!valid) {
      if(retail)throw new PosApiError(401,"POS_STAFF_PIN_INCORRECT","El PIN no es correcto. Tras cinco intentos deberás esperar cinco minutos.");
      const attempts = Number(staff.failed_pin_attempts || 0) + 1;
      const lockedUntil = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
      await context.admin.from("pos_staff").update({ failed_pin_attempts: attempts >= MAX_ATTEMPTS ? 0 : attempts, locked_until: lockedUntil }).eq("id", staff.id).eq("brand_slug", context.brand.slug);
      throw new PosApiError(401, "POS_STAFF_PIN_INCORRECT", lockedUntil ? "Demasiados intentos. El operador fue bloqueado temporalmente." : "El PIN no es correcto.", { lockedUntil });
    }
    await context.admin.from("pos_staff").update({ failed_pin_attempts: 0, locked_until: null }).eq("id", staff.id);
    await revokeStaffSession(context, "STAFF_SWITCH");
    const safeStaff = { id: String(staff.id), name: String(staff.name), role: staff.role as PosStaffRole, retailRole: staff.retail_role, retailPermissions: staff.retail_permissions, locationId: staff.location_id ? String(staff.location_id) : null, active: true };
    const roles = await resolveStaffRoles(context, safeStaff.id, safeStaff.role);
    if (!roles.length) throw new PosApiError(403, "POS_STAFF_PERMISSION_REQUIRED", "El operador no tiene roles activos.");
    const session = await createStaffSession(context, { ...safeStaff, roles });
    await auditStaff(context.admin, { brandId: context.brand.id, brandSlug: context.brand.slug, locationId: safeStaff.locationId, actorStaffId: safeStaff.id, hostUserId: context.user.userId, action: "STAFF_LOGIN", entityType: "staff_session", entityId: session.id });
    return ok({ session });
  } catch (error) { return handlePosError(error); }
}
