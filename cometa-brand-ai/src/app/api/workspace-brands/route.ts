import { NextResponse } from "next/server";
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

type UserRole = "admin" | "client";

type WorkspaceBrand = {
  id: string | null;
  slug: string;
  name: string;
  industry: string;
  city: string | null;
  sourceTable: string;
  health: number;
  salesAI: number;
  knowledge: number;
  learning: number;
  leads: number;
  status: string;
  priority: "Alta" | "Media" | "Baja";
  recommendedAction: string;
  href: string;
  missionHref: string;
  updatedAt: string | null;
};

export async function GET() {
  try {
    const userContext = await getUserContext();

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para ver el workspace.",
        },
        { status: 401 }
      );
    }

    const rawBrands = await collectBrands();
    const dedupedBrands = dedupeBrands(rawBrands);

    const visibleBrands =
      userContext.role === "admin"
        ? dedupedBrands
        : dedupedBrands.filter((brand) =>
            userContext.allowedBrandSlugs.includes(brand.slug)
          );

    const brands = await Promise.all(
      visibleBrands.map(async (brand) => enrichBrand(brand))
    );

    const sortedBrands = brands.sort((a, b) => {
      const priorityWeight = { Alta: 3, Media: 2, Baja: 1 };
      const priorityDiff =
        priorityWeight[b.priority] - priorityWeight[a.priority];

      if (priorityDiff !== 0) return priorityDiff;

      return b.health - a.health;
    });

    const totals = {
      brands: sortedBrands.length,
      activeAgents: sortedBrands.filter((brand) => brand.salesAI >= 80).length,
      leads: sortedBrands.reduce((sum, brand) => sum + brand.leads, 0),
      learning: sortedBrands.reduce((sum, brand) => sum + brand.learning, 0),
      averageHealth: sortedBrands.length
        ? Math.round(
            sortedBrands.reduce((sum, brand) => sum + brand.health, 0) /
              sortedBrands.length
          )
        : 0,
    };

    return NextResponse.json({
      ok: true,
      user: {
        id: userContext.userId,
        email: userContext.email,
        role: userContext.role,
        isAdmin: userContext.role === "admin",
        allowedBrandSlugs: userContext.allowedBrandSlugs,
      },
      totals,
      brands: sortedBrands,
      shouldRedirectToBrand:
        userContext.role === "client" && sortedBrands.length === 1,
      redirectBrandHref:
        userContext.role === "client" && sortedBrands.length === 1
          ? sortedBrands[0].href
          : null,
    });
  } catch (error: any) {
    console.error("workspace-brands error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudieron cargar las marcas del workspace.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

async function getUserContext(): Promise<{
  userId: string | null;
  email: string | null;
  role: UserRole;
  allowedBrandSlugs: string[];
}> {
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
          // En route handlers puede no ser necesario refrescar cookies aquí.
        }
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser();

  if (userError || !user) {
    return {
      userId: null,
      email: null,
      role: "client",
      allowedBrandSlugs: [],
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id,email,role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("workspace-brands profile error:", profileError.message);
  }

  const role: UserRole =
    profile?.role === "admin" && profile?.status === "active"
      ? "admin"
      : "client";

  if (role === "admin") {
    return {
      userId: user.id,
      email: user.email || profile?.email || null,
      role,
      allowedBrandSlugs: [],
    };
  }

  const { data: accessRows, error: accessError } = await supabase
    .from("user_brand_access")
    .select("brand_slug,status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (accessError) {
    console.warn("workspace-brands access error:", accessError.message);
  }

  const allowedBrandSlugs = Array.from(
    new Set(
      (accessRows || [])
        .map((row: any) => slugifyBrand(row.brand_slug || ""))
        .filter(Boolean)
    )
  );

  return {
    userId: user.id,
    email: user.email || profile?.email || null,
    role,
    allowedBrandSlugs,
  };
}

async function collectBrands() {
  const [clients, brandAnalysis, cosmosMemory] = await Promise.all([
    safeSelect("clients"),
    safeSelect("brand_analysis"),
    safeSelect("cosmos_memory"),
  ]);

  return [
    ...clients.map((row: any) => normalizeRawBrand(row, "clients")),
    ...brandAnalysis.map((row: any) =>
      normalizeRawBrand(row, "brand_analysis")
    ),
    ...cosmosMemory.map((row: any) => normalizeRawBrand(row, "cosmos_memory")),
  ].filter((brand) => brand.name || brand.slug);
}

async function safeSelect(tableName: string) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(300);

    if (error) {
      console.warn(`workspace-brands ${tableName} error:`, error.message);
      return [];
    }

    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    console.warn(`workspace-brands ${tableName} exception:`, error?.message);
    return [];
  }
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

  return Array.from(map.values());
}

function sourcePriority(sourceTable: string) {
  if (sourceTable === "clients") return 3;
  if (sourceTable === "brand_analysis") return 2;
  if (sourceTable === "cosmos_memory") return 1;
  return 0;
}

async function enrichBrand(brand: any): Promise<WorkspaceBrand> {
  const [
    leads,
    readyReplies,
    knowledgeSources,
    catalogItems,
    businessRules,
    faqs,
    pendingLearning,
    agentRuns,
  ] = await Promise.all([
    safeCount("sales_leads", brand.name),
    safeCount("sales_agent_runs", brand.name, [
      ["action_status", "ready_to_execute"],
    ]),
    safeCount("sales_knowledge_sources", brand.name),
    safeCount("sales_catalog_items", brand.name),
    safeCount("sales_business_rules", brand.name),
    safeCount("sales_faqs", brand.name),
    safeCount("sales_playbook_suggestions", brand.name, [["status", "pending"]]),
    safeCount("sales_agent_runs", brand.name),
  ]);

  const knowledge = calculateKnowledgeScore({
    knowledgeSources,
    catalogItems,
    businessRules,
    faqs,
  });

  const salesAI = calculateSalesAIScore({
    knowledge,
    leads,
    readyReplies,
    agentRuns,
  });

  const health = calculateHealth({
    knowledge,
    salesAI,
    pendingLearning,
    leads,
  });

  const priority = calculatePriority({
    knowledge,
    salesAI,
    pendingLearning,
  });

  const status = getStatus({
    knowledge,
    salesAI,
    agentRuns,
  });

  const recommendedAction = getRecommendedAction({
    knowledge,
    catalogItems,
    businessRules,
    faqs,
    pendingLearning,
  });

  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    industry: brand.industry,
    city: brand.city,
    sourceTable: brand.sourceTable,
    health,
    salesAI,
    knowledge,
    learning: pendingLearning,
    leads,
    status,
    priority,
    recommendedAction,
    href: `/brand/${brand.slug}`,
    missionHref: `/cometa-os/design?brandSlug=${encodeURIComponent(
      brand.slug
    )}`,
    updatedAt: brand.updatedAt,
  };
}

async function safeCount(
  tableName: string,
  brandName: string,
  filters: [string, string | number | boolean][] = []
) {
  try {
    let query = supabase
      .from(tableName)
      .select("id", { count: "exact", head: true })
      .eq("brand_name", brandName);

    for (const [column, value] of filters) {
      query = query.eq(column, value);
    }

    const { count, error } = await query;

    if (error) {
      console.warn(`workspace-brands count ${tableName}:`, error.message);
      return 0;
    }

    return count || 0;
  } catch (error: any) {
    console.warn(`workspace-brands count ${tableName}:`, error?.message);
    return 0;
  }
}

function calculateKnowledgeScore({
  knowledgeSources,
  catalogItems,
  businessRules,
  faqs,
}: {
  knowledgeSources: number;
  catalogItems: number;
  businessRules: number;
  faqs: number;
}) {
  let score = 0;

  if (knowledgeSources > 0) score += 20;

  if (catalogItems >= 3) score += 25;
  else score += catalogItems * 8;

  if (businessRules >= 6) score += 30;
  else score += businessRules * 5;

  if (faqs >= 4) score += 25;
  else score += faqs * 6;

  return clamp(score, 0, 100);
}

function calculateSalesAIScore({
  knowledge,
  leads,
  readyReplies,
  agentRuns,
}: {
  knowledge: number;
  leads: number;
  readyReplies: number;
  agentRuns: number;
}) {
  let score = 50;

  score += Math.round(knowledge * 0.35);

  if (leads > 0) score += 8;
  if (leads >= 10) score += 5;
  if (readyReplies > 0) score += 6;
  if (agentRuns > 0) score += 6;

  return clamp(score, 0, 100);
}

function calculateHealth({
  knowledge,
  salesAI,
  pendingLearning,
  leads,
}: {
  knowledge: number;
  salesAI: number;
  pendingLearning: number;
  leads: number;
}) {
  let score = Math.round(knowledge * 0.45 + salesAI * 0.45);

  if (leads > 0) score += 5;
  if (pendingLearning > 0) score -= Math.min(pendingLearning * 2, 12);

  return clamp(score, 0, 100);
}

function calculatePriority({
  knowledge,
  salesAI,
  pendingLearning,
}: {
  knowledge: number;
  salesAI: number;
  pendingLearning: number;
}): "Alta" | "Media" | "Baja" {
  if (knowledge < 55 || salesAI < 60) return "Alta";
  if (pendingLearning >= 3) return "Media";
  if (knowledge < 85 || salesAI < 85) return "Media";
  return "Baja";
}

function getStatus({
  knowledge,
  salesAI,
  agentRuns,
}: {
  knowledge: number;
  salesAI: number;
  agentRuns: number;
}) {
  if (knowledge < 45) return "Configuración";
  if (knowledge < 75) return "Preparando";
  if (agentRuns > 0 || salesAI >= 85) return "Activo";
  return "Listo";
}

function getRecommendedAction({
  knowledge,
  catalogItems,
  businessRules,
  faqs,
  pendingLearning,
}: {
  knowledge: number;
  catalogItems: number;
  businessRules: number;
  faqs: number;
  pendingLearning: number;
}) {
  if (pendingLearning > 0) {
    return "Revisar aprendizajes pendientes";
  }

  if (catalogItems === 0) {
    return "Subir catálogo comercial";
  }

  if (businessRules < 3) {
    return "Completar reglas comerciales";
  }

  if (faqs < 3) {
    return "Agregar preguntas frecuentes";
  }

  if (knowledge < 85) {
    return "Mejorar Knowledge Brain";
  }

  return "Sistema listo para operar";
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}