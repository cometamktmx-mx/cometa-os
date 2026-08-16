import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  resolveBrandFromSupabase,
  slugifyBrand,
} from "@/lib/brand-resolver";
import {
  PosPermissionError,
  resolvePosMembership,
  type PosMembershipAccess,
} from "@/lib/pos/rbac";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

export type PosUserRole = "admin" | "client";

export type PosUserContext = {
  userId: string;
  email: string | null;
  role: PosUserRole;
  isAdmin: boolean;
  allowedBrandSlugs: string[];
};

export type PosBrandContext = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  sourceTable: string | null;
};

export type PosRequestContext = {
  admin: SupabaseClient;
  user: PosUserContext;
  brand: PosBrandContext;
  membership: PosMembershipAccess | null;
};

export class PosApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "PosApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new PosApiError(
      500,
      "POS_ENV_MISSING",
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function getAuthenticatedUser(
  admin: SupabaseClient
): Promise<PosUserContext> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new PosApiError(
      500,
      "POS_ENV_MISSING",
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const cookieStore = await cookies();

  const authClient = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
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
            // Algunos contextos de Next.js no permiten escribir cookies.
          }
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    throw new PosApiError(
      401,
      "POS_UNAUTHORIZED",
      "Inicia sesión para utilizar Cometa POS."
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("user_id,email,role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("POS user profile warning:", profileError.message);
  }

  const role: PosUserRole =
    profile?.role === "admin" && profile?.status === "active"
      ? "admin"
      : "client";

  if (role === "admin") {
    return {
      userId: user.id,
      email: user.email || profile?.email || null,
      role,
      isAdmin: true,
      allowedBrandSlugs: [],
    };
  }

  const { data: accessRows, error: accessError } = await admin
    .from("user_brand_access")
    .select("brand_slug,status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (accessError) {
    console.warn("POS brand access warning:", accessError.message);
  }

  const allowedBrandSlugs = Array.from(
    new Set(
      (accessRows || [])
        .map((row: { brand_slug?: string | null }) =>
          slugifyBrand(row.brand_slug || "")
        )
        .filter(Boolean)
    )
  );

  return {
    userId: user.id,
    email: user.email || profile?.email || null,
    role,
    isAdmin: false,
    allowedBrandSlugs,
  };
}

export async function requirePosContext(
  requestedBrandSlug: string
): Promise<PosRequestContext> {
  const normalizedRequestedSlug = slugifyBrand(requestedBrandSlug || "");

  if (!normalizedRequestedSlug) {
    throw new PosApiError(
      400,
      "POS_BRAND_REQUIRED",
      "Se requiere brandSlug."
    );
  }

  const admin = getAdminClient();
  const user = await getAuthenticatedUser(admin);

  const resolvedBrand = await resolveBrandFromSupabase(admin, {
    brandSlug: normalizedRequestedSlug,
  });

  if (!resolvedBrand.exists || !resolvedBrand.id) {
    throw new PosApiError(
      404,
      "POS_BRAND_NOT_FOUND",
      "La marca solicitada no existe."
    );
  }

  const resolvedSlug = slugifyBrand(resolvedBrand.slug);

  if (
    !user.isAdmin &&
    !user.allowedBrandSlugs.includes(resolvedSlug)
  ) {
    throw new PosApiError(
      403,
      "POS_BRAND_FORBIDDEN",
      "No tienes acceso a esta marca."
    );
  }

  const { data: membershipRow, error: membershipError } = await admin
    .from("user_brand_access")
    .select("user_id,brand_slug,access_role,status")
    .eq("user_id", user.userId)
    .eq("brand_slug", resolvedSlug)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) {
    throw new PosApiError(
      500,
      "POS_MEMBERSHIP_LOOKUP_FAILED",
      "No se pudo resolver el acceso del usuario a la marca."
    );
  }

  const membership = resolvePosMembership(membershipRow);

  if (!user.isAdmin && !membership) {
    throw new PosApiError(
      403,
      "POS_BRAND_FORBIDDEN",
      "No tienes acceso activo a esta marca."
    );
  }

  return {
    admin,
    user,
    membership,
    brand: {
      id: String(resolvedBrand.id),
      slug: resolvedSlug,
      name: resolvedBrand.name,
      industry: resolvedBrand.industry || "Comercio",
      sourceTable: resolvedBrand.sourceTable || null,
    },
  };
}

export function getBrandSlugFromUrl(request: Request) {
  const url = new URL(request.url);

  return slugifyBrand(
    url.searchParams.get("brandSlug") ||
      url.searchParams.get("slug") ||
      ""
  );
}

export async function readJsonBody<T extends Record<string, unknown>>(
  request: Request
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new PosApiError(
      400,
      "POS_INVALID_JSON",
      "El cuerpo de la solicitud no contiene JSON válido."
    );
  }
}

export function requiredText(
  value: unknown,
  field: string,
  maxLength = 180
) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new PosApiError(
      400,
      "POS_VALIDATION_ERROR",
      `El campo ${field} es obligatorio.`
    );
  }

  if (text.length > maxLength) {
    throw new PosApiError(
      400,
      "POS_VALIDATION_ERROR",
      `El campo ${field} supera ${maxLength} caracteres.`
    );
  }

  return text;
}

export function optionalText(
  value: unknown,
  maxLength = 500
): string | null {
  const text = String(value ?? "").trim();

  if (!text) return null;

  if (text.length > maxLength) {
    throw new PosApiError(
      400,
      "POS_VALIDATION_ERROR",
      `Un campo de texto supera ${maxLength} caracteres.`
    );
  }

  return text;
}

export function numberValue(
  value: unknown,
  field: string,
  options: {
    min?: number;
    max?: number;
    defaultValue?: number;
  } = {}
) {
  if (
    (value === undefined || value === null || value === "") &&
    options.defaultValue !== undefined
  ) {
    return options.defaultValue;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new PosApiError(
      400,
      "POS_VALIDATION_ERROR",
      `El campo ${field} debe ser numérico.`
    );
  }

  if (options.min !== undefined && number < options.min) {
    throw new PosApiError(
      400,
      "POS_VALIDATION_ERROR",
      `El campo ${field} no puede ser menor que ${options.min}.`
    );
  }

  if (options.max !== undefined && number > options.max) {
    throw new PosApiError(
      400,
      "POS_VALIDATION_ERROR",
      `El campo ${field} no puede ser mayor que ${options.max}.`
    );
  }

  return number;
}

export function booleanValue(
  value: unknown,
  defaultValue = false
) {
  if (value === undefined || value === null) return defaultValue;

  if (typeof value === "boolean") return value;

  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;

  return defaultValue;
}

export function uuidValue(
  value: unknown,
  field: string,
  required = true
): string | null {
  const text = String(value ?? "").trim();

  if (!text && !required) return null;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(text)) {
    throw new PosApiError(
      400,
      "POS_VALIDATION_ERROR",
      `El campo ${field} no contiene un UUID válido.`
    );
  }

  return text;
}

export function getPagination(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(
    1,
    Math.floor(Number(url.searchParams.get("page") || 1))
  );
  const pageSize = Math.min(
    100,
    Math.max(
      1,
      Math.floor(Number(url.searchParams.get("pageSize") || 25))
    )
  );

  return {
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1,
  };
}

export function ok(
  data: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(
    {
      ok: true,
      ...data,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}


export function fail(
  message: string,
  status = 400,
  code = "POS_REQUEST_ERROR",
  details: unknown = null
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      code,
      details,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export function handlePosError(error: unknown) {
  if (error instanceof PosPermissionError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        code: error.code,
        details: error.details,
      },
      {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  if (error instanceof PosApiError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        code: error.code,
        details: error.details ?? null,
      },
      {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const message =
    error instanceof Error ? error.message : String(error);

  console.error("Unhandled Cometa POS API error:", error);

  return NextResponse.json(
    {
      ok: false,
      error: "Error interno de Cometa POS.",
      code: "POS_INTERNAL_ERROR",
      details:
        process.env.NODE_ENV === "development" ? message : null,
    },
    {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export function assertDatabaseResult(
  error: { message?: string; details?: string; hint?: string } | null,
  fallbackMessage: string
) {
  if (!error) return;

  throw new PosApiError(
    500,
    "POS_DATABASE_ERROR",
    fallbackMessage,
    {
      message: error.message,
      details: error.details,
      hint: error.hint,
    }
  );
}
