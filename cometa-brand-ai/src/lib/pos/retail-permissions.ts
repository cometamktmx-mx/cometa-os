export const RETAIL_PERMISSIONS = {
  SELL: "Vender y cobrar", PRODUCTS_READ: "Consultar productos", DISCOUNT: "Aplicar descuentos",
  PRICE_CHANGE: "Cambiar precio de venta", CANCEL: "Cancelar ventas", REFUND: "Procesar devoluciones",
  REPRINT: "Reimprimir tickets", DRAWER: "Abrir cajón manualmente", CASH: "Abrir/cerrar turno y consultar cortes",
  PRODUCTS_WRITE: "Crear/editar productos y precios", INVENTORY: "Ajustar inventario", IMPORT: "Importar información",
  CUSTOMERS: "Gestionar clientes", REPORTS: "Ver reportes", STAFF: "Administrar usuarios", SETTINGS: "Administrar configuración",
} as const;
export type RetailPermission = keyof typeof RETAIL_PERMISSIONS;
export const RETAIL_ROLES = { ADMIN: "Administrador", SALES: "Ventas", INVENTORY: "Inventario" } as const;
export type RetailRole = keyof typeof RETAIL_ROLES;
export const RETAIL_DEFAULTS: Record<RetailRole, readonly RetailPermission[]> = {
  ADMIN: Object.keys(RETAIL_PERMISSIONS) as RetailPermission[],
  SALES: ["SELL", "PRODUCTS_READ", "REPRINT"],
  INVENTORY: ["PRODUCTS_READ", "PRODUCTS_WRITE", "INVENTORY", "IMPORT"],
};
export function retailPermissions(staff: {role: string; retailPermissions?: readonly RetailPermission[] | null}) {
  // No role relabeling grants new authority to existing operators.
  return staff.retailPermissions ?? (staff.role === "ADMIN" ? RETAIL_DEFAULTS.ADMIN : staff.role === "CASHIER" || staff.role === "MANAGER" ? ["SELL", "PRODUCTS_READ", "CASH"] as const : []);
}
export function retailAdministrative(permissions: readonly RetailPermission[], role?:string) {
  return role==="ADMIN" || permissions.some(p => ["STAFF", "SETTINGS", "REPORTS", "DISCOUNT", "PRICE_CHANGE", "CANCEL", "REFUND", "DRAWER", "CASH"].includes(p));
}
export const RETAIL_IDLE_MS = 180_000;
export function retailExpired(permissions: readonly RetailPermission[], lastHumanAt: string, now = Date.now(), role?:string) {
  return retailAdministrative(permissions,role) && (!Number.isFinite(Date.parse(lastHumanAt)) || now - Date.parse(lastHumanAt) >= RETAIL_IDLE_MS);
}
