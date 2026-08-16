import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { slugifyBrand } from "@/lib/brand-resolver";
import {
  getBrandOsAccess,
  resolveBrandOsProductAccess,
  type BrandOsAccess,
  type BrandOsProductAccess,
} from "@/lib/brand-os/access";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

type BrandOsUser = {
  userId: string;
  email: string | null;
};

type CanonicalBrand = {
  id: string;
  slug: string;
  name: string;
  industry: string;
};

export type BrandServerAccess = {
  user: BrandOsUser;
  brand: CanonicalBrand;
  activeBrandSlugs: string[];
  membershipActive: boolean;
  isPlatformAdmin: boolean;
  osAccess: BrandOsAccess;
};

export type BrandOsServerAccess = BrandServerAccess & {
  bypassUsed: boolean;
  productAccess: BrandOsProductAccess;
};

export class BrandOsGuardError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BrandOsGuardError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Resolves a canonical brand that the current user may open as a company
 * surface. It intentionally does not require Cometa OS to be active so the
 * temporary Brand launcher can remain available to POS-only brands.
 */
export async function requireBrandAccess(
  requestedBrandSlug: string
): Promise<BrandServerAccess> {
  const normalizedBrandSlug = slugifyBrand(requestedBrandSlug || "");

  if (!normalizedBrandSlug) {
    throw new BrandOsGuardError(
      400,
      "BRAND_OS_BRAND_REQUIRED",
      "Se requiere una marca válida para abrir esta empresa."
    );
  }

  const admin = getAdminClient();
  const user = await getAuthenticatedUser();
  const brand = await getCanonicalBrand(admin, normalizedBrandSlug);
  const isPlatformAdmin = await resolvePlatformAdmin(admin, user.userId);

  const activeBrandSlugs = isPlatformAdmin
    ? []
    : await getActiveBrandSlugs(admin, user.userId);
  const membershipActive = isPlatformAdmin
    ? false
    : activeBrandSlugs.includes(brand.slug);

  if (!isPlatformAdmin && !membershipActive) {
    throw new BrandOsGuardError(
      403,
      "BRAND_OS_MEMBERSHIP_REQUIRED",
      "Necesitas una membresía activa para abrir esta empresa."
    );
  }

  let osAccess: BrandOsAccess;
  try {
    osAccess = await getBrandOsAccess(admin, brand.slug);
  } catch {
    throw new BrandOsGuardError(
      500,
      "BRAND_OS_ACCESS_LOOKUP_FAILED",
      "No se pudo resolver el acceso de Cometa OS para esta empresa."
    );
  }

  return {
    user,
    brand,
    activeBrandSlugs,
    membershipActive,
    isPlatformAdmin,
    osAccess,
  };
}

/**
 * Resolves the dedicated Cometa OS access rule without borrowing POS context:
 * active membership plus active OS product access, or an explicit platform
 * admin bypass. No membership, ownership, entitlement, or OS access row is
 * ever synthesized here.
 */
export async function requireBrandOsAccess(
  requestedBrandSlug: string
): Promise<BrandOsServerAccess> {
  const brandAccess = await requireBrandAccess(requestedBrandSlug);
  const productAccess = resolveBrandOsProductAccess({
    membershipActive: brandAccess.membershipActive,
    isPlatformAdmin: brandAccess.isPlatformAdmin,
    osAccess: brandAccess.osAccess,
  });

  if (!productAccess.effectiveAccessAllowed) {
    throw createProductAccessError(brandAccess.osAccess.status);
  }

  return {
    ...brandAccess,
    bypassUsed: productAccess.authorizationSource === "platform_admin_bypass",
    productAccess,
  };
}

function getAdminClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new BrandOsGuardError(
      500,
      "BRAND_OS_SERVER_CONFIG_INVALID",
      "Cometa OS no tiene configuración de servidor disponible."
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

async function getAuthenticatedUser(): Promise<BrandOsUser> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new BrandOsGuardError(
      500,
      "BRAND_OS_SERVER_CONFIG_INVALID",
      "Cometa OS no tiene configuración de autenticación disponible."
    );
  }

  const cookieStore = await cookies();
  const auth = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Route handlers may not be allowed to persist refreshed cookies.
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await auth.auth.getUser();

  if (error || !user) {
    throw new BrandOsGuardError(
      401,
      "BRAND_OS_AUTH_REQUIRED",
      "Inicia sesión para abrir Cometa OS."
    );
  }

  return {
    userId: user.id,
    email: user.email || null,
  };
}

async function getCanonicalBrand(
  admin: SupabaseClient,
  brandSlug: string
): Promise<CanonicalBrand> {
  const { data, error } = await admin
    .from("brands")
    .select("id,slug,name")
    .eq("slug", brandSlug)
    .maybeSingle();

  if (error) {
    throw new BrandOsGuardError(
      500,
      "BRAND_OS_BRAND_LOOKUP_FAILED",
      "No se pudo resolver la empresa solicitada."
    );
  }

  if (!isCanonicalBrand(data)) {
    throw new BrandOsGuardError(
      404,
      "BRAND_NOT_FOUND",
      "La empresa solicitada no existe."
    );
  }

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    industry: "Sistema comercial",
  };
}

async function resolvePlatformAdmin(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("user_profiles")
    .select("role,status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new BrandOsGuardError(
      500,
      "BRAND_OS_PROFILE_LOOKUP_FAILED",
      "No se pudo resolver el perfil de acceso."
    );
  }

  return data?.role === "admin" && data.status === "active";
}

async function getActiveBrandSlugs(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await admin
    .from("user_brand_access")
    .select("brand_slug")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    throw new BrandOsGuardError(
      500,
      "BRAND_OS_MEMBERSHIP_LOOKUP_FAILED",
      "No se pudo resolver la membresía de esta empresa."
    );
  }

  return Array.from(
    new Set(
      (data || [])
        .map((row: { brand_slug?: string | null }) =>
          slugifyBrand(row.brand_slug || "")
        )
        .filter(Boolean)
    )
  );
}

function createProductAccessError(status: BrandOsAccess["status"]): BrandOsGuardError {
  if (status === "paused") {
    return new BrandOsGuardError(
      403,
      "BRAND_OS_ACCESS_PAUSED",
      "Cometa OS está temporalmente pausado para esta empresa."
    );
  }

  if (status === "inactive") {
    return new BrandOsGuardError(
      403,
      "BRAND_OS_ACCESS_INACTIVE",
      "Cometa OS no está activo para esta empresa."
    );
  }

  return new BrandOsGuardError(
    403,
    "BRAND_OS_ACCESS_NOT_CONFIGURED",
    "Cometa OS todavía no está habilitado para esta empresa."
  );
}

function isCanonicalBrand(value: unknown): value is {
  id: string;
  slug: string;
  name: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.slug === "string" &&
    typeof row.name === "string"
  );
}
