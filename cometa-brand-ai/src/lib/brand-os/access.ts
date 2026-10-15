import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const BRAND_OS_ACCESS_STATUSES = [
  "active",
  "paused",
  "inactive",
  "not_configured",
] as const;

export type BrandOsAccessStatus =
  (typeof BRAND_OS_ACCESS_STATUSES)[number];

export type BrandOsAccessRecord = {
  brandSlug: string;
  status: Exclude<BrandOsAccessStatus, "not_configured">;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BrandOsAccess = {
  brandSlug: string;
  status: BrandOsAccessStatus;
  configured: boolean;
  commercialAccessActive: boolean;
  record: BrandOsAccessRecord | null;
};

export type BrandOsProductAccess = {
  commercialAccessActive: boolean;
  effectiveAccessAllowed: boolean;
  authorizationSource:
    | "platform_admin_bypass"
    | "active_membership_and_os_access"
    | "membership_required"
    | "os_access_not_active";
};

type BrandOsAccessRow = {
  brand_slug: string;
  status: "active" | "paused" | "inactive";
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

type BrandOsAccessClient = Pick<SupabaseClient, "from">;

const STORED_STATUS_SET = new Set<BrandOsAccessRow["status"]>([
  "active",
  "paused",
  "inactive",
]);

export class BrandOsAccessLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrandOsAccessLookupError";
  }
}

/**
 * Resolves only the dedicated Cometa OS product record. A missing row is the
 * explicit not_configured state; this function never infers access from POS,
 * memberships, historical analysis, or any other product surface.
 */
export async function getBrandOsAccess(
  admin: BrandOsAccessClient,
  brandSlug: string
): Promise<BrandOsAccess> {
  const normalizedBrandSlug = normalizeBrandSlug(brandSlug);

  if (!normalizedBrandSlug) {
    throw new BrandOsAccessLookupError("Se requiere un brandSlug válido.");
  }

  const { data, error } = await admin
    .from("brand_os_access")
    .select("brand_slug,status,started_at,ended_at,created_at,updated_at")
    .eq("brand_slug", normalizedBrandSlug)
    .maybeSingle();

  if (error) {
    throw new BrandOsAccessLookupError(
      "No se pudo resolver el acceso de Cometa OS para esta marca."
    );
  }

  if (!data) {
    return {
      brandSlug: normalizedBrandSlug,
      status: "not_configured",
      configured: false,
      commercialAccessActive: false,
      record: null,
    };
  }

  const record = parseBrandOsAccessRow(data);

  if (!record || record.brandSlug !== normalizedBrandSlug) {
    throw new BrandOsAccessLookupError(
      "El registro de acceso de Cometa OS no tiene una forma válida."
    );
  }

  return {
    brandSlug: normalizedBrandSlug,
    status: record.status,
    configured: true,
    commercialAccessActive: record.status === "active",
    record,
  };
}

/**
 * Pure authorization resolution for a future Brand OS guard. It deliberately
 * does not create membership, ownership, seats, or POS entitlements.
 */
export function resolveBrandOsProductAccess(input: {
  membershipActive: boolean;
  isPlatformAdmin: boolean;
  osAccess: Pick<BrandOsAccess, "status" | "commercialAccessActive">;
}): BrandOsProductAccess {
  const commercialAccessActive = input.osAccess.commercialAccessActive;

  if (input.isPlatformAdmin) {
    return {
      commercialAccessActive,
      effectiveAccessAllowed: true,
      authorizationSource: "platform_admin_bypass",
    };
  }

  if (!input.membershipActive) {
    return {
      commercialAccessActive,
      effectiveAccessAllowed: false,
      authorizationSource: "membership_required",
    };
  }

  if (!commercialAccessActive) {
    return {
      commercialAccessActive: false,
      effectiveAccessAllowed: false,
      authorizationSource: "os_access_not_active",
    };
  }

  return {
    commercialAccessActive: true,
    effectiveAccessAllowed: true,
    authorizationSource: "active_membership_and_os_access",
  };
}

function parseBrandOsAccessRow(value: unknown): BrandOsAccessRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;

  if (
    typeof row.brand_slug !== "string" ||
    !STORED_STATUS_SET.has(row.status as BrandOsAccessRow["status"]) ||
    !isNullableString(row.started_at) ||
    !isNullableString(row.ended_at) ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }

  return {
    brandSlug: row.brand_slug,
    status: row.status as BrandOsAccessRow["status"],
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function normalizeBrandSlug(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
