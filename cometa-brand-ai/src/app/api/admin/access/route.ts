import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { formatBrandName, slugifyBrand } from "@/lib/brand-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return NextResponse.json(
        { ok: false, error: admin.error },
        { status: admin.status }
      );
    }

    const [{ data: authUsersData, error: usersError }, profiles, access, brands] =
      await Promise.all([
        supabase.auth.admin.listUsers({
          page: 1,
          perPage: 500,
        }),
        safeSelect("user_profiles"),
        safeSelect("user_brand_access"),
        collectBrands(),
      ]);

    if (usersError) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudieron cargar los usuarios de Supabase Auth.",
          detail: usersError.message,
        },
        { status: 500 }
      );
    }

    const authUsers = authUsersData?.users || [];

    const normalizedUsers = authUsers.map((user: any) => {
      const profile = profiles.find((item: any) => item.user_id === user.id);
      const userAccess = access.filter((item: any) => item.user_id === user.id);

      return {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at,
        profile: {
          exists: Boolean(profile),
          fullName: profile?.full_name || null,
          role: profile?.role || "client",
          status: profile?.status || "inactive",
        },
        brandAccess: userAccess.map((item: any) => ({
          id: item.id,
          brandSlug: item.brand_slug,
          brandName: formatBrandName(item.brand_slug),
          accessRole: item.access_role,
          status: item.status,
          updatedAt: item.updated_at,
        })),
      };
    });

    return NextResponse.json({
      ok: true,
      admin: {
        id: admin.userId,
        email: admin.email,
      },
      totals: {
        users: normalizedUsers.length,
        brands: brands.length,
        accessRules: access.length,
      },
      users: normalizedUsers,
      brands,
      access,
    });
  } catch (error: any) {
    console.error("admin access GET error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo cargar el centro de accesos.",
        detail: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return NextResponse.json(
        { ok: false, error: admin.error },
        { status: admin.status }
      );
    }

    const body = await request.json();

    const email = String(body.email || "").trim().toLowerCase();
    const userIdFromBody = String(body.userId || body.user_id || "").trim();
    const fullName = String(body.fullName || body.full_name || "").trim();
    const role = body.role === "admin" ? "admin" : "client";
    const profileStatus = body.profileStatus || body.status || "active";

    const brandSlug = slugifyBrand(
      String(body.brandSlug || body.brand_slug || "")
    );

    const accessRole =
      body.accessRole === "owner" ||
      body.accessRole === "editor" ||
      body.accessRole === "viewer"
        ? body.accessRole
        : "viewer";

    if (!email && !userIdFromBody) {
      return NextResponse.json(
        {
          ok: false,
          error: "Necesitas enviar email o userId.",
        },
        { status: 400 }
      );
    }

    const targetUser = await findAuthUser({
      userId: userIdFromBody,
      email,
    });

    if (!targetUser) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No encontré ese usuario en Supabase Auth. Primero créalo en Authentication > Users.",
        },
        { status: 404 }
      );
    }

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .upsert(
        {
          user_id: targetUser.id,
          email: targetUser.email || email,
          full_name: fullName || null,
          role,
          status: profileStatus === "inactive" ? "inactive" : "active",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      )
      .select()
      .single();

    if (profileError) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo guardar el perfil del usuario.",
          detail: profileError.message,
        },
        { status: 500 }
      );
    }

    let accessData = null;

    if (brandSlug) {
      const { data, error } = await supabase
        .from("user_brand_access")
        .upsert(
          {
            user_id: targetUser.id,
            brand_slug: brandSlug,
            access_role: accessRole,
            status: "active",
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id,brand_slug",
          }
        )
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          {
            ok: false,
            error: "No se pudo conectar la marca con el usuario.",
            detail: error.message,
          },
          { status: 500 }
        );
      }

      accessData = data;
    }

    return NextResponse.json({
      ok: true,
      message: brandSlug
        ? "Usuario actualizado y marca conectada correctamente."
        : "Usuario actualizado correctamente.",
      user: {
        id: targetUser.id,
        email: targetUser.email,
      },
      profile: profileData,
      access: accessData,
    });
  } catch (error: any) {
    console.error("admin access POST error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo actualizar el acceso.",
        detail: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return NextResponse.json(
        { ok: false, error: admin.error },
        { status: admin.status }
      );
    }

    const body = await request.json();

    const userId = String(body.userId || body.user_id || "").trim();
    const brandSlug = slugifyBrand(
      String(body.brandSlug || body.brand_slug || "")
    );

    const status = body.status === "inactive" ? "inactive" : "active";

    if (!userId || !brandSlug) {
      return NextResponse.json(
        {
          ok: false,
          error: "Necesitas enviar userId y brandSlug.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("user_brand_access")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("brand_slug", brandSlug)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo actualizar el acceso.",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message:
        status === "active"
          ? "Acceso activado correctamente."
          : "Acceso desactivado correctamente.",
      access: data,
    });
  } catch (error: any) {
    console.error("admin access PATCH error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo actualizar el acceso.",
        detail: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

async function requireAdmin(): Promise<
  | {
      ok: true;
      userId: string;
      email: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
    }
> {
  const cookieStore = await cookies();

  const supabaseAuth = createServerClient(supabaseUrl, supabaseAnonKey, {
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
          // No hacemos nada aquí.
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      status: 401,
      error: "No autorizado. Inicia sesión.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role,status,email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      status: 500,
      error: "No se pudo validar el perfil del usuario.",
    };
  }

  if (profile?.role !== "admin" || profile?.status !== "active") {
    return {
      ok: false,
      status: 403,
      error: "Acceso solo para administradores.",
    };
  }

  return {
    ok: true,
    userId: user.id,
    email: user.email || profile?.email || null,
  };
}

async function findAuthUser({
  userId,
  email,
}: {
  userId?: string;
  email?: string;
}) {
  if (userId) {
    const { data, error } = await supabase.auth.admin.getUserById(userId);

    if (!error && data?.user) {
      return data.user;
    }
  }

  if (!email) return null;

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    console.warn("findAuthUser listUsers error:", error.message);
    return null;
  }

  return (data?.users || []).find(
    (user: any) => String(user.email || "").toLowerCase() === email
  );
}

async function safeSelect(tableName: string) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) {
      console.warn(`admin access ${tableName} error:`, error.message);
      return [];
    }

    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    console.warn(`admin access ${tableName} exception:`, error?.message);
    return [];
  }
}

async function collectBrands() {
  const [clients, brandAnalysis, cosmosMemory] = await Promise.all([
    safeSelect("clients"),
    safeSelect("brand_analysis"),
    safeSelect("cosmos_memory"),
  ]);

  const rawBrands = [
    ...clients.map((row: any) => normalizeRawBrand(row, "clients")),
    ...brandAnalysis.map((row: any) =>
      normalizeRawBrand(row, "brand_analysis")
    ),
    ...cosmosMemory.map((row: any) => normalizeRawBrand(row, "cosmos_memory")),
  ].filter((brand) => brand.name || brand.slug);

  return dedupeBrands(rawBrands);
}

function normalizeRawBrand(row: any, sourceTable: string) {
  const name =
    getFirstValue(row, [
      "brand_name",
      "brandName",
      "name",
      "client_name",
      "business_name",
    ]) || "";

  const rawSlug =
    getFirstValue(row, ["brand_slug", "brandSlug", "slug", "client_slug"]) ||
    slugifyBrand(name);

  const slug = slugifyBrand(rawSlug || name);

  return {
    id: String(row.id || row.client_id || row.brand_analysis_id || "") || null,
    slug,
    name: name || formatBrandName(slug),
    industry:
      getFirstValue(row, ["industry", "business_type", "category"]) ||
      "Sistema comercial",
    city: getFirstValue(row, ["city", "location"]) || null,
    sourceTable,
    updatedAt:
      getFirstValue(row, ["updated_at", "created_at"]) ||
      row.updated_at ||
      row.created_at ||
      null,
  };
}

function dedupeBrands(rawBrands: any[]) {
  const map = new Map<string, any>();

  for (const brand of rawBrands) {
    const key = brand.slug || slugifyBrand(brand.name);

    if (!key) continue;

    const existing = map.get(key);

    if (!existing) {
      map.set(key, brand);
      continue;
    }

    const existingScore = sourcePriority(existing.sourceTable);
    const newScore = sourcePriority(brand.sourceTable);

    if (newScore > existingScore) {
      map.set(key, {
        ...existing,
        ...brand,
        updatedAt: brand.updatedAt || existing.updatedAt,
      });
      continue;
    }

    map.set(key, {
      ...existing,
      industry:
        existing.industry !== "Sistema comercial"
          ? existing.industry
          : brand.industry,
      city: existing.city || brand.city,
      updatedAt: existing.updatedAt || brand.updatedAt,
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );
}

function sourcePriority(sourceTable: string) {
  if (sourceTable === "clients") return 3;
  if (sourceTable === "brand_analysis") return 2;
  if (sourceTable === "cosmos_memory") return 1;
  return 0;
}

function getFirstValue(row: any, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}