import type { ProductEntitlementCode } from "./entitlements";
import type { PosPermission } from "./rbac";
import type { PosStaffRole } from "./staff-shared";

type MutationPolicy = {
  entitlement: ProductEntitlementCode;
  permission: PosPermission;
  foodRoles: readonly PosStaffRole[];
  adminMode: boolean;
};

// Server selects the operation. Never accept this key or these roles from a body.
export const POS_MUTATION_POLICY = {
  "sale.create": { entitlement: "pos.sales", permission: "pos.sale.create", foodRoles: ["ADMIN", "MANAGER", "CASHIER"], adminMode: false },
  "cash.operate": { entitlement: "pos.cash", permission: "pos.cash.operate", foodRoles: ["ADMIN", "MANAGER", "CASHIER"], adminMode: false },
  "products.write": { entitlement: "pos.products", permission: "pos.products.write", foodRoles: ["ADMIN"], adminMode: true },
  "inventory.write": { entitlement: "pos.inventory", permission: "pos.inventory.write", foodRoles: ["ADMIN"], adminMode: true },
  "customers.create": { entitlement: "pos.customers", permission: "pos.customers.create", foodRoles: ["ADMIN", "MANAGER", "CASHIER", "WAITER"], adminMode: false },
  "customers.write": { entitlement: "pos.customers", permission: "pos.customers.write", foodRoles: ["ADMIN"], adminMode: true },
  "loyalty.use": { entitlement: "pos.loyalty", permission: "pos.loyalty.use", foodRoles: ["ADMIN", "MANAGER", "CASHIER"], adminMode: false },
  "loyalty.manage": { entitlement: "pos.loyalty", permission: "pos.loyalty.manage", foodRoles: ["ADMIN"], adminMode: true },
  "settings.manage": { entitlement: "pos.access", permission: "pos.settings.manage", foodRoles: ["ADMIN"], adminMode: true },
  "locations.manage": { entitlement: "pos.access", permission: "pos.locations.manage", foodRoles: ["ADMIN"], adminMode: true },
  "registers.manage": { entitlement: "pos.cash", permission: "pos.registers.manage", foodRoles: ["ADMIN"], adminMode: true },
  "team.manage": { entitlement: "pos.access", permission: "pos.team.manage", foodRoles: ["ADMIN"], adminMode: true },
  "signals.generate": { entitlement: "intelligence.signals", permission: "pos.intelligence.view", foodRoles: ["ADMIN"], adminMode: true },
  "pulsar.generate": { entitlement: "intelligence.pulsar", permission: "pos.intelligence.view", foodRoles: ["ADMIN"], adminMode: true },
} as const satisfies Record<string, MutationPolicy>;

export type PosMutation = keyof typeof POS_MUTATION_POLICY;
