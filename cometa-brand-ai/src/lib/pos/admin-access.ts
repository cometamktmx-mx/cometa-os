import { staffHasRole, staffRoles } from "./staff-shared";
import "server-only";

import { requirePosCommercialAccess, requirePosOperationalAccess, type PosOperationalAccessContext } from "@/lib/pos/access";
import { getStaffSession, getPosMode, isStaffAdminMode } from "@/lib/pos/staff-server";
import { PosApiError } from "@/lib/pos/server";
import { canAccessFoodPage, getFoodPageKind } from "@/lib/pos/surface-policy";

/** Called for every POS page request, including RSC navigations, by the proxy. */
export async function requirePosPageAccess(brandSlug: string, pathname: string, requestCookies: { getAll(): { name: string; value: string }[]; get(name: string): { value: string } | undefined }) {
  const { requirePosContext } = await import("@/lib/pos/server");
  const context = await requirePosContext(brandSlug, requestCookies);
  if (await getPosMode(context) === "RETAIL") return;
  const kind = getFoodPageKind(pathname, brandSlug);
  if (kind === "operation" || kind === "recovery") return;
  const access = await requirePosCommercialAccess(context, "pos.access");
  const session = await getStaffSession(access, requestCookies.get("cometa_pos_staff_session")?.value || null);
  if (!canAccessFoodPage(kind, session ? staffRoles(session.staff) : null, await isStaffAdminMode(session, requestCookies.get("cometa_pos_admin_session")?.value || null))) {
    throw new PosApiError(403, "POS_ADMIN_OPERATOR_REQUIRED", "Regresa a operación para ingresar con un operador autorizado.");
  }
}

export async function requirePosAdminSurfaceAccess(brandSlug: string): Promise<PosOperationalAccessContext> {
  const access = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.access" });
  const session = await getStaffSession(access);
  if (!session || !staffHasRole(session.staff, "ADMIN") || !(await isStaffAdminMode(session))) {
    throw new PosApiError(403, "POS_ADMIN_OPERATOR_REQUIRED", "Se requiere un operador local Administrador.");
  }
  return access;
}
