export const POS_STAFF_ROLES = ["ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN"] as const;
export type PosStaffRole = (typeof POS_STAFF_ROLES)[number];

export type StaffRoles = { role: PosStaffRole; roles?: readonly PosStaffRole[] };
// An explicit empty array grants nothing. Only legacy/Retail contracts omit it.
export function staffRoles(staff: StaffRoles): readonly PosStaffRole[] {
  return staff.roles ?? [staff.role];
}
export function staffHasRole(staff: StaffRoles, role: PosStaffRole) {
  return staffRoles(staff).includes(role);
}
export function staffHasAnyRole(staff: StaffRoles, roles: readonly PosStaffRole[]) {
  return roles.some(role => staffHasRole(staff, role));
}

export const POS_STAFF_PERMISSIONS = [
  "POS_ACCESS", "ORDER_OPEN", "ORDER_EDIT", "ORDER_SEND", "OWN_ORDERS_READ",
  "SALE_CHARGE", "CASH_OPERATE", "KDS_READ", "KDS_UPDATE",
  "RESTRICTED_AUTHORIZE", "STAFF_MANAGE",
] as const;
export type PosStaffPermission = (typeof POS_STAFF_PERMISSIONS)[number];

export const POS_STAFF_ROLE_PERMISSIONS: Readonly<Record<PosStaffRole, readonly PosStaffPermission[]>> = {
  ADMIN: POS_STAFF_PERMISSIONS,
  MANAGER: POS_STAFF_PERMISSIONS.filter((permission) => permission !== "STAFF_MANAGE"),
  CASHIER: ["POS_ACCESS", "SALE_CHARGE", "CASH_OPERATE"],
  WAITER: ["POS_ACCESS", "ORDER_OPEN", "ORDER_EDIT", "ORDER_SEND", "OWN_ORDERS_READ"],
  KITCHEN: ["POS_ACCESS", "KDS_READ", "KDS_UPDATE"],
};

export const POS_SUPERVISOR_ACTIONS = [
  "VOID_ITEM", "VOID_ORDER", "APPLY_DISCOUNT", "REOPEN_ORDER", "CASH_ADJUSTMENT",
] as const;
export type PosSupervisorAction = (typeof POS_SUPERVISOR_ACTIONS)[number];

export const POS_STAFF_AUDIT_ACTIONS = [
  "STAFF_LOGIN", "STAFF_LOGOUT", "STAFF_LOCK", "STAFF_SWITCH", "STAFF_CREATE",
  "STAFF_UPDATE", "STAFF_PIN_RESET", "SALE_CREATE", "SALE_CHARGE",
  "CASH_SESSION_OPEN", "CASH_SESSION_CLOSE", "SUPERVISOR_AUTHORIZE",
  "TABLE_OPEN", "ITEM_ADD", "ITEM_VOID", "ORDER_SEND", "ORDER_REOPEN", "DISCOUNT_APPLY",
] as const;
export type PosStaffAuditAction = (typeof POS_STAFF_AUDIT_ACTIONS)[number];

export type PosMode = "RETAIL" | "RESTAURANT" | "CAFE";

export function resolvePosMode(profileCode: string | null | undefined): PosMode {
  if (profileCode === "coffee_shop") return "CAFE";
  if (profileCode === "restaurant") return "RESTAURANT";
  return "RETAIL";
}

export function isPosStaffRole(value: unknown): value is PosStaffRole {
  return typeof value === "string" && (POS_STAFF_ROLES as readonly string[]).includes(value);
}

export function isPosSupervisorAction(value: unknown): value is PosSupervisorAction {
  return typeof value === "string" && (POS_SUPERVISOR_ACTIONS as readonly string[]).includes(value);
}

export function posStaffRoleLabel(role: PosStaffRole) {
  return ({ ADMIN: "Administrador", MANAGER: "Encargado", CASHIER: "Cajero", WAITER: "Mesero", KITCHEN: "Cocina" } as const)[role];
}
