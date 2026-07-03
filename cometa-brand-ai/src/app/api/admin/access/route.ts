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

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const MERCURY_ROLES = [
  "designer",
  "cm",
  "copywriter",
  "video",
  "manager",
  "admin",
];

const NO_MERCURY_ACCESS_ROLES = ["none", "client", "viewer", "owner", ""];

export async function GET() {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return NextResponse.json(
        { ok: false, error: admin.error },
        { status: admin.status }
      );
    }

    const [
      { data: authUsersData, error: usersError },
      profiles,
      brandAccess,
      mercuryAssignments,
      brands,
    ] = await Promise.all([
      supabase.auth.admin.listUsers({
        page: 1,
        perPage: 500,
      }),
      safeSelect("user_profiles", "updated_at"),
      safeSelect("user_brand_access", "updated_at"),
      safeSelect("mercury_team_assignments", null),
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
      const profile = profiles.find(
        (item: any) => item.user_id === user.id || item.id === user.id
      );

      const userBrandAccess = brandAccess.filter(
        (item: any) => item.user_id === user.id
      );

      const userMercuryAssignments = mercuryAssignments.filter(
        (item: any) => item.user_id === user.id
      );

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
        brandAccess: userBrandAccess.map((item: any) => ({
          id: item.id,
          brandSlug: item.brand_slug,
          brandName: formatBrandName(item.brand_slug),
          accessRole: item.access_role,
          status: item.status,
          updatedAt: item.updated_at,
        })),
        mercuryAssignments: userMercuryAssignments.map((item: any) => ({
          id: item.id,
          brandSlug: item.brand_slug,
          brandName:
            item.brand_name || formatBrandName(item.brand_slug || ""),
          role: item.role || "designer",
          active: item.active !== false,
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
        accessRules: brandAccess.length,
        mercuryAssignments: mercuryAssignments.length,
      },
      users: normalizedUsers,
      brands,
      access: brandAccess,
      mercuryAssignments,
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

    const rawProfileRole = String(body.role || body.profileRole || "client")
      .trim()
      .toLowerCase();

    const profileRole = rawProfileRole === "admin" ? "admin" : "client";
    const profileStatus = body.profileStatus || body.status || "active";

    const brandSlug = slugifyBrand(
      String(body.brandSlug || body.brand_slug || "")
    );

    const accessRole = normalizeAccessRole(body.accessRole || body.access_role);

    const mercuryRole = normalizeMercuryRole(
      body.mercuryRole ||
        body.teamRole ||
        body.assignmentRole ||
        body.assignment_role ||
        body.designerRole ||
        null
    );

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

    const now = new Date().toISOString();

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .upsert(
        {
          user_id: targetUser.id,
          email: targetUser.email || email,
          full_name: fullName || null,
          role: profileRole,
          status: profileStatus === "inactive" ? "inactive" : "active",
          updated_at: now,
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
    let mercuryAssignment = null;

    if (brandSlug) {
      const { data, error } = await supabase
        .from("user_brand_access")
        .upsert(
          {
            user_id: targetUser.id,
            brand_slug: brandSlug,
            access_role: accessRole,
            status: "active",
            updated_at: now,
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

      if (mercuryRole) {
        mercuryAssignment = await upsertMercuryTeamAssignment({
          userId: targetUser.id,
          brandSlug,
          role: mercuryRole,
          active: true,
        });
      } else {
        mercuryAssignment = await setMercuryAssignmentActive({
          userId: targetUser.id,
          brandSlug,
          active: false,
        });
      }
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
      mercuryAssignment,
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
    const active = status === "active";
    const now = new Date().toISOString();

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
        updated_at: now,
      })
      .eq("user_id", userId)
      .eq("brand_slug", brandSlug)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo actualizar el acceso general.",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    let mercuryAssignment = null;

    if (!active) {
      mercuryAssignment = await setMercuryAssignmentActive({
        userId,
        brandSlug,
        active: false,
      });
    }

    return NextResponse.json({
      ok: true,
      message:
        status === "active"
          ? "Acceso activado correctamente."
          : "Acceso desactivado correctamente.",
      access: data,
      mercuryAssignment,
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
    .or(`user_id.eq.${user.id},id.eq.${user.id}`)
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

function normalizeAccessRole(value?: string | null) {
  const role = String(value || "").trim().toLowerCase();

  if (role === "owner" || role === "editor" || role === "viewer") {
    return role;
  }

  if (
    role === "designer" ||
    role === "cm" ||
    role === "copywriter" ||
    role === "video" ||
    role === "manager" ||
    role === "admin"
  ) {
    return "editor";
  }

  if (role === "client") {
    return "viewer";
  }

  return "viewer";
}

function normalizeMercuryRole(value?: string | null) {
  const role = String(value || "").trim().toLowerCase();

  if (NO_MERCURY_ACCESS_ROLES.includes(role)) {
    return null;
  }

  if (role === "editor") return "designer";
  if (role === "community_manager") return "cm";
  if (role === "community-manager") return "cm";

  if (MERCURY_ROLES.includes(role)) {
    return role;
  }

  return null;
}

async function upsertMercuryTeamAssignment({
  userId,
  brandSlug,
  role,
  active,
}: {
  userId: string;
  brandSlug: string;
  role: string;
  active: boolean;
}) {
  const brandName = await resolveBrandNameForMercury(brandSlug);
  const now = new Date().toISOString();

  const { data: existingRows, error: findError } = await supabase
    .from("mercury_team_assignments")
    .select("*")
    .eq("user_id", userId)
    .eq("brand_slug", brandSlug)
    .limit(1);

  if (findError) throw findError;

  const existing = existingRows?.[0];

  if (existing?.id) {
    const { data, error } = await supabase
      .from("mercury_team_assignments")
      .update({
        brand_name: brandName,
        role,
        active,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw error;

    return data;
  }

  const { data, error } = await supabase
    .from("mercury_team_assignments")
    .insert({
      user_id: userId,
      brand_name: brandName,
      brand_slug: brandSlug,
      role,
      active,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

async function setMercuryAssignmentActive({
  userId,
  brandSlug,
  active,
}: {
  userId: string;
  brandSlug: string;
  active: boolean;
}) {
  const { data: existingRows, error: findError } = await supabase
    .from("mercury_team_assignments")
    .select("*")
    .eq("user_id", userId)
    .eq("brand_slug", brandSlug)
    .limit(1);

  if (findError) throw findError;

  const existing = existingRows?.[0];

  if (!existing?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from("mercury_team_assignments")
    .update({
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

async function safeSelect(tableName: string, orderColumn: string | null = null) {
  try {
    let query = supabase.from(tableName).select("*").limit(500);

    if (orderColumn) {
      query = query.order(orderColumn, { ascending: false });
    }

    const { data, error } = await query;

    if (!error) {
      return Array.isArray(data) ? data : [];
    }

    if (orderColumn) {
      const retry = await supabase.from(tableName).select("*").limit(500);

      if (!retry.error) {
        return Array.isArray(retry.data) ? retry.data : [];
      }
    }

    console.warn(`admin access ${tableName} error:`, error.message);
    return [];
  } catch (error: any) {
    console.warn(`admin access ${tableName} exception:`, error?.message);
    return [];
  }
}

async function collectBrands() {
  const [
    mercurySettings,
    mercuryCalendars,
    clients,
    brandAnalysis,
    cosmosMemory,
  ] = await Promise.all([
    safeSelect("mercury_brand_settings", "updated_at"),
    safeSelect("mercury_calendars", "created_at"),
    safeSelect("clients", "updated_at"),
    safeSelect("brand_analysis", "updated_at"),
    safeSelect("cosmos_memory", "updated_at"),
  ]);

  const rawBrands = [
    ...mercurySettings.map((row: any) =>
      normalizeRawBrand(row, "mercury_brand_settings")
    ),
    ...mercuryCalendars.map((row: any) =>
      normalizeRawBrand(row, "mercury_calendars")
    ),
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
  if (sourceTable === "mercury_brand_settings") return 5;
  if (sourceTable === "mercury_calendars") return 4;
  if (sourceTable === "clients") return 3;
  if (sourceTable === "brand_analysis") return 2;
  if (sourceTable === "cosmos_memory") return 1;
  return 0;
}

async function resolveBrandNameForMercury(brandSlug: string) {
  const cleanSlug = slugifyBrand(brandSlug);

  if (!cleanSlug) return "Marca sin nombre";

  const sources = [
    {
      table: "mercury_brand_settings",
      slugColumn: "brand_slug",
      nameColumns: ["brand_name", "name"],
    },
    {
      table: "mercury_calendars",
      slugColumn: "brand_slug",
      nameColumns: ["brand_name", "name"],
    },
    {
      table: "clients",
      slugColumn: "brand_slug",
      nameColumns: ["brand_name", "name", "client_name", "business_name"],
    },
    {
      table: "brand_analysis",
      slugColumn: "brand_slug",
      nameColumns: ["brand_name", "name", "business_name"],
    },
    {
      table: "cosmos_memory",
      slugColumn: "brand_slug",
      nameColumns: ["brand_name", "name", "business_name"],
    },
  ];

  for (const source of sources) {
    try {
      const { data, error } = await supabase
        .from(source.table)
        .select("*")
        .eq(source.slugColumn, cleanSlug)
        .limit(1);

      if (error) continue;

      const row = data?.[0];
      if (!row) continue;

      const name = getFirstValue(row, source.nameColumns);
      if (name) return name;
    } catch {
      // Intentamos con la siguiente tabla.
    }
  }

  return formatBrandName(cleanSlug);
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