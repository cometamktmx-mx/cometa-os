export const POS_CANONICAL_ROLES = [
  "owner",
  "admin",
  "manager",
  "cashier",
  "inventory",
] as const;

export const POS_LEGACY_ROLES = ["editor", "viewer"] as const;

export const POS_MEMBERSHIP_ROLES = [
  ...POS_CANONICAL_ROLES,
  ...POS_LEGACY_ROLES,
] as const;

export type PosCanonicalRole = (typeof POS_CANONICAL_ROLES)[number];
export type PosLegacyRole = (typeof POS_LEGACY_ROLES)[number];
export type PosMembershipRole = (typeof POS_MEMBERSHIP_ROLES)[number];
export type PosEffectiveRole = PosCanonicalRole | "viewer";

export const POS_PERMISSION_CODES = [
  "pos.home.view",
  "pos.sale.create",
  "pos.sales.read",
  "pos.cash.read",
  "pos.cash.operate",
  "pos.products.read",
  "pos.products.write",
  "pos.inventory.read",
  "pos.inventory.write",
  "pos.customers.read",
  "pos.customers.create",
  "pos.customers.write",
  "pos.loyalty.use",
  "pos.loyalty.manage",
  "pos.reports.view",
  "pos.intelligence.view",
  "pos.settings.manage",
  "pos.team.manage",
  "pos.locations.manage",
  "pos.registers.manage",
  "pos.subscription.view",
  "pos.subscription.manage",
  "pos.owner.manage",
] as const;

export type PosPermission = (typeof POS_PERMISSION_CODES)[number];

export type PosMembershipAccess = {
  userId: string;
  brandSlug: string;
  role: PosMembershipRole;
  effectiveRole: PosEffectiveRole;
  status: "active";
  permissions: PosPermission[];
  legacy: boolean;
};

const MANAGER_PERMISSIONS: PosPermission[] = [
  "pos.home.view", "pos.sale.create", "pos.sales.read", "pos.cash.read",
  "pos.cash.operate", "pos.products.read", "pos.products.write",
  "pos.inventory.read", "pos.inventory.write", "pos.customers.read",
  "pos.customers.create", "pos.customers.write", "pos.loyalty.use",
  "pos.reports.view",
];

export const POS_ROLE_PERMISSIONS: Readonly<Record<PosEffectiveRole, readonly PosPermission[]>> = {
  owner: POS_PERMISSION_CODES,
  admin: POS_PERMISSION_CODES.filter((permission) => ![
    "pos.subscription.view",
    "pos.subscription.manage",
    "pos.owner.manage",
  ].includes(permission)),
  manager: MANAGER_PERMISSIONS,
  cashier: [
    "pos.home.view", "pos.sale.create", "pos.sales.read", "pos.cash.read",
    "pos.cash.operate", "pos.products.read", "pos.inventory.read",
    "pos.customers.read", "pos.customers.create", "pos.loyalty.use",
  ],
  inventory: [
    "pos.home.view", "pos.products.read", "pos.products.write",
    "pos.inventory.read", "pos.inventory.write",
  ],
  viewer: ["pos.home.view", "pos.products.read", "pos.inventory.read"],
};

const ROLE_SET = new Set<string>(POS_MEMBERSHIP_ROLES);

export class PosPermissionError extends Error {
  readonly status = 403;
  readonly code = "POS_PERMISSION_REQUIRED";
  readonly details: { requiredPermission: PosPermission };

  constructor(permission: PosPermission) {
    super("No tienes permiso para realizar esta acción en Cometa POS.");
    this.name = "PosPermissionError";
    this.details = { requiredPermission: permission };
  }
}

export function isPosMembershipRole(value: unknown): value is PosMembershipRole {
  return typeof value === "string" && ROLE_SET.has(value);
}

export function getEffectivePosRole(role: PosMembershipRole): PosEffectiveRole {
  if (role === "editor") return "manager";
  return role;
}

export function resolvePosMembership(row: unknown): PosMembershipAccess | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  if (value.status !== "active" || !isPosMembershipRole(value.access_role) ||
      typeof value.user_id !== "string" || typeof value.brand_slug !== "string") {
    return null;
  }

  const role = value.access_role;
  const effectiveRole = getEffectivePosRole(role);
  return {
    userId: value.user_id,
    brandSlug: value.brand_slug,
    role,
    effectiveRole,
    status: "active",
    permissions: [...POS_ROLE_PERMISSIONS[effectiveRole]],
    legacy: role === "editor" || role === "viewer",
  };
}

export function hasPosPermission(
  membership: PosMembershipAccess | null,
  permission: PosPermission
) {
  return Boolean(membership?.permissions.includes(permission));
}

export function requirePosPermission(
  context: { membership: PosMembershipAccess | null },
  permission: PosPermission
) {
  if (!hasPosPermission(context.membership, permission)) {
    throw new PosPermissionError(permission);
  }

  return context;
}
