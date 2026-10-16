import "server-only";
import { requirePosOperationalAccess } from "./access";
import { requirePosPermission } from "./rbac";
import { getPosMode, getStaffSession, isStaffAdminMode, requireRetailPermission } from "./staff-server";
import { staffHasAnyRole } from "./staff-shared";
import { PosApiError, uuidValue } from "./server";
import { assertDeviceLocation } from "./device-server";
import { POS_MUTATION_POLICY, type PosMutation } from "./mutation-policy";

export async function requirePosMutationAccess({ brandSlug, operation, locationId }: { brandSlug: string; operation: PosMutation; locationId?: unknown }) {
  const policy = POS_MUTATION_POLICY[operation];
  const context = await requirePosOperationalAccess({ brandSlug, entitlement: policy.entitlement });
  // Preserve the existing canonical platform-admin exception; local operators
  // still constrain a Food terminal even when its host is a platform admin.
  if (!context.user.isAdmin) requirePosPermission(context, policy.permission);
  if (locationId != null && locationId !== "") assertDeviceLocation(context, uuidValue(locationId, "locationId"));
  const mode = await getPosMode(context);
  if (mode === "RETAIL") {
    const permissions = { "sale.create":"SELL", "cash.operate":"CASH", "products.write":"PRODUCTS_WRITE", "inventory.write":"INVENTORY", "customers.create":"CUSTOMERS", "customers.write":"CUSTOMERS", "loyalty.use":"SELL", "loyalty.manage":"SETTINGS", "settings.manage":"SETTINGS", "locations.manage":"SETTINGS", "registers.manage":"SETTINGS", "team.manage":"STAFF", "signals.generate":"REPORTS", "pulsar.generate":"REPORTS" } as const;
    await requireRetailPermission(context, permissions[operation]);
  } else {
    const session = await getStaffSession(context);
    if (!session) throw new PosApiError(401, "POS_STAFF_SESSION_REQUIRED", "Selecciona un operador para continuar.");
    if (!staffHasAnyRole(session.staff, policy.foodRoles)) {
      throw new PosApiError(403, "POS_STAFF_PERMISSION_REQUIRED", "El operador no tiene permiso para esta operación.");
    }
    if (policy.adminMode && !(await isStaffAdminMode(session))) {
      throw new PosApiError(403, "POS_ADMIN_OPERATOR_REQUIRED", "Ingresa al modo administrativo con un operador Administrador.");
    }
  }
  return context;
}
