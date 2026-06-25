import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { resolveBrandFromSupabase, slugifyBrand } from "@/lib/brand-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type RiskLevel = "Bajo" | "Medio" | "Alto";
type UserRole = "admin" | "client";

export async function GET(req: Request) {
  try {
    const userContext = await getUserContext();

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para ver esta marca.",
        },
        { status: 401 }
      );
    }

    const url = new URL(req.url);

    let requestedBrandSlug =
      url.searchParams.get("brandSlug") ||
      url.searchParams.get("slug") ||
      "";

    const requestedBrandName = url.searchParams.get("brandName");

    if (!requestedBrandSlug && userContext.role === "client") {
      requestedBrandSlug = userContext.allowedBrandSlugs[0] || "";
    }

    if (!requestedBrandSlug && userContext.role === "admin") {
      requestedBrandSlug = "mar-cosmetic";
    }

    if (!requestedBrandSlug) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se recibió una marca válida.",
        },
        { status: 400 }
      );
    }

    const resolvedBrand = await resolveBrandFromSupabase(supabase, {
      brandSlug: requestedBrandSlug,
      brandName: requestedBrandName,
    });

    const brandSlug = resolvedBrand.slug;
    const brandName = resolvedBrand.name;
    const industry = resolvedBrand.industry || "Sistema comercial";

    const accessValidation = validateBrandAccess({
      userContext,
      brandSlug,
    });

    if (!accessValidation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: accessValidation.error,
          user: {
            id: userContext.userId,
            email: userContext.email,
            role: userContext.role,
            isAdmin: userContext.role === "admin",
          },
          requestedBrand: {
            slug: brandSlug,
            name: brandName,
          },
        },
        { status: 403 }
      );
    }

    const [
      playbook,
      latestRun,
      leadCount,
      readyRepliesCount,
      knowledgeSourcesCount,
      catalogCount,
      rulesCount,
      faqsCount,
      pendingSuggestionsCount,
      appliedSuggestionsCount,
    ] = await Promise.all([
      getActivePlaybook(brandName),
      getLatestAgentRun(brandName),
      safeCount("sales_leads", brandName),
      safeCount("sales_agent_runs", brandName, [
        ["action", "send_reply"],
        ["action_status", "ready_to_execute"],
      ]),
      safeCount("sales_knowledge_sources", brandName),
      safeCount("sales_catalog_items", brandName),
      safeCount("sales_business_rules", brandName),
      safeCount("sales_faqs", brandName),
      safeCount("sales_playbook_suggestions", brandName, [
        ["status", "pending"],
      ]),
      safeCount("sales_playbook_suggestions", brandName, [
        ["status", "applied"],
      ]),
    ]);

    const knowledge = calculateKnowledgeScore({
      knowledgeSourcesCount,
      catalogCount,
      rulesCount,
      faqsCount,
    });

    const agentScore =
      clampNumber(latestRun?.confidence_score, 0, 100) ||
      calculateAgentScore({
        knowledge,
        leadCount,
        pendingSuggestionsCount,
      });

    const autonomy = calculateAutonomyScore({
      knowledge,
      agentScore,
      readyRepliesCount,
      pendingSuggestionsCount,
    });

    const riskLevel = calculateRiskLevel({
      knowledge,
      pendingSuggestionsCount,
      latestRunRequiresHuman: Boolean(latestRun?.requires_human),
    });

    const agentStatus = getAgentStatus({
      playbook,
      latestRun,
      knowledge,
    });

    const mainAction = getMainAction({
      knowledge,
      pendingSuggestionsCount,
      catalogCount,
      rulesCount,
      faqsCount,
    });

    const headline = getHeadline({
      agentStatus,
      knowledge,
      pendingSuggestionsCount,
    });

    const description = getDescription({
      brandName,
      agentStatus,
      knowledge,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: userContext.userId,
        email: userContext.email,
        role: userContext.role,
        isAdmin: userContext.role === "admin",
        allowedBrandSlugs: userContext.allowedBrandSlugs,
      },
      brand: {
        slug: brandSlug,
        name: brandName,
        industry,
        brandId: resolvedBrand.id,
        brandSource: resolvedBrand.sourceTable,
        brandExists: resolvedBrand.exists,
        headline,
        description,
        agentStatus,
        agentScore,
        autonomy,
        knowledge,
        openLeads: leadCount,
        pendingLearning: pendingSuggestionsCount,
        appliedLearning: appliedSuggestionsCount,
        readyReplies: readyRepliesCount,
        riskLevel,
        mainAction: mainAction.title,
        actionDescription: mainAction.description,
      },
      counts: {
        leads: leadCount,
        readyReplies: readyRepliesCount,
        knowledgeSources: knowledgeSourcesCount,
        catalogItems: catalogCount,
        businessRules: rulesCount,
        faqs: faqsCount,
        pendingSuggestions: pendingSuggestionsCount,
        appliedSuggestions: appliedSuggestionsCount,
      },
      latestRun,
      playbook: playbook
        ? {
            id: playbook.id,
            brand_name: playbook.brand_name,
            is_active: playbook.is_active,
            updated_at: playbook.updated_at,
          }
        : null,
    });
  } catch (error: any) {
    console.error("brand-dashboard error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error cargando Brand Dashboard",
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
    console.warn("brand-dashboard profile error:", profileError.message);
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
    console.warn("brand-dashboard access error:", accessError.message);
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

function validateBrandAccess({
  userContext,
  brandSlug,
}: {
  userContext: {
    role: UserRole;
    allowedBrandSlugs: string[];
  };
  brandSlug: string;
}) {
  if (userContext.role === "admin") {
    return {
      ok: true,
      error: null,
    };
  }

  const normalizedBrandSlug = slugifyBrand(brandSlug);

  if (userContext.allowedBrandSlugs.includes(normalizedBrandSlug)) {
    return {
      ok: true,
      error: null,
    };
  }

  return {
    ok: false,
    error:
      "No tienes permiso para visualizar esta marca. Esta marca no está asignada a tu usuario.",
  };
}

async function getActivePlaybook(brandName: string) {
  const { data, error } = await supabase
    .from("sales_playbooks")
    .select("*")
    .eq("brand_name", brandName)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("getActivePlaybook error:", error.message);
    return null;
  }

  return data;
}

async function getLatestAgentRun(brandName: string) {
  const { data, error } = await supabase
    .from("sales_agent_runs")
    .select(
      "id, brand_name, action, action_status, lead_stage, requires_human, confidence_score, decision_reason, created_at"
    )
    .eq("brand_name", brandName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("getLatestAgentRun error:", error.message);
    return null;
  }

  return data;
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
      console.warn(`safeCount ${tableName} error:`, error.message);
      return 0;
    }

    return count || 0;
  } catch (error: any) {
    console.warn(`safeCount ${tableName} exception:`, error?.message);
    return 0;
  }
}

function calculateKnowledgeScore({
  knowledgeSourcesCount,
  catalogCount,
  rulesCount,
  faqsCount,
}: {
  knowledgeSourcesCount: number;
  catalogCount: number;
  rulesCount: number;
  faqsCount: number;
}) {
  let score = 0;

  if (knowledgeSourcesCount > 0) score += 20;

  if (catalogCount >= 3) score += 25;
  else score += catalogCount * 8;

  if (rulesCount >= 6) score += 30;
  else score += rulesCount * 5;

  if (faqsCount >= 4) score += 25;
  else score += faqsCount * 6;

  return clampNumber(score, 0, 100);
}

function calculateAgentScore({
  knowledge,
  leadCount,
  pendingSuggestionsCount,
}: {
  knowledge: number;
  leadCount: number;
  pendingSuggestionsCount: number;
}) {
  let score = 60;

  score += Math.round(knowledge * 0.25);

  if (leadCount > 0) score += 8;
  if (leadCount > 10) score += 5;
  if (pendingSuggestionsCount > 0) score += 4;

  return clampNumber(score, 0, 100);
}

function calculateAutonomyScore({
  knowledge,
  agentScore,
  readyRepliesCount,
  pendingSuggestionsCount,
}: {
  knowledge: number;
  agentScore: number;
  readyRepliesCount: number;
  pendingSuggestionsCount: number;
}) {
  let score = Math.round(knowledge * 0.55 + agentScore * 0.35);

  if (readyRepliesCount > 0) score += 6;
  if (pendingSuggestionsCount > 0) score += 2;

  return clampNumber(score, 0, 100);
}

function calculateRiskLevel({
  knowledge,
  pendingSuggestionsCount,
  latestRunRequiresHuman,
}: {
  knowledge: number;
  pendingSuggestionsCount: number;
  latestRunRequiresHuman: boolean;
}): RiskLevel {
  if (latestRunRequiresHuman) return "Alto";
  if (knowledge < 60) return "Alto";
  if (pendingSuggestionsCount >= 3) return "Medio";
  if (knowledge < 85) return "Medio";
  return "Bajo";
}

function getAgentStatus({
  playbook,
  latestRun,
  knowledge,
}: {
  playbook: any;
  latestRun: any;
  knowledge: number;
}) {
  if (!playbook && knowledge < 40) return "Configuración";
  if (knowledge < 60) return "Preparando";
  if (latestRun?.action_status === "ready_to_execute") return "Activo";
  if (knowledge >= 85) return "Listo";
  return "Preparando";
}

function getMainAction({
  knowledge,
  pendingSuggestionsCount,
  catalogCount,
  rulesCount,
  faqsCount,
}: {
  knowledge: number;
  pendingSuggestionsCount: number;
  catalogCount: number;
  rulesCount: number;
  faqsCount: number;
}) {
  if (pendingSuggestionsCount > 0) {
    return {
      title: "Revisar aprendizajes pendientes",
      description: `Hay ${pendingSuggestionsCount} mejoras detectadas por la IA que pueden aumentar la calidad de respuesta del agente.`,
    };
  }

  if (catalogCount === 0) {
    return {
      title: "Subir catálogo comercial",
      description:
        "El agente necesita productos, servicios o lotes autorizados para recomendar sin inventar información.",
    };
  }

  if (rulesCount < 3) {
    return {
      title: "Completar reglas comerciales",
      description:
        "Agrega reglas de precios, pagos, envíos, horarios, límites y condiciones para operar con más seguridad.",
    };
  }

  if (faqsCount < 3) {
    return {
      title: "Agregar preguntas frecuentes",
      description:
        "Carga las dudas más comunes para que el agente responda con mayor precisión.",
    };
  }

  if (knowledge < 85) {
    return {
      title: "Mejorar Knowledge Brain",
      description:
        "La base comercial aún puede fortalecerse antes de activar mayor autonomía.",
    };
  }

  return {
    title: "Sistema comercial listo",
    description:
      "El agente tiene buena base para operar. Mantén actualizado catálogo, reglas y aprendizajes.",
  };
}

function getHeadline({
  agentStatus,
  knowledge,
  pendingSuggestionsCount,
}: {
  agentStatus: string;
  knowledge: number;
  pendingSuggestionsCount: number;
}) {
  if (agentStatus === "Activo") return "Tu sistema comercial está operando.";
  if (pendingSuggestionsCount > 0)
    return "Tu agente está aprendiendo de conversaciones reales.";
  if (knowledge >= 85) return "Tu agente comercial está listo.";
  return "Tu sistema comercial está en preparación.";
}

function getDescription({
  brandName,
  agentStatus,
  knowledge,
}: {
  brandName: string;
  agentStatus: string;
  knowledge: number;
}) {
  if (agentStatus === "Activo") {
    return `SALES AI atiende prospectos de ${brandName}, califica intención de compra, aprende de conversaciones y escala solo cuando necesita validación humana.`;
  }

  if (knowledge >= 85) {
    return `El agente de ${brandName} ya tiene una base comercial sólida para responder con información aprobada y operar con control humano.`;
  }

  return `Cometa OS está preparando la base comercial de ${brandName}: catálogo, reglas, FAQs, límites y contexto para que SALES AI pueda operar con seguridad.`;
}

function clampNumber(value: any, min: number, max: number) {
  const num = Number(value || 0);

  if (Number.isNaN(num)) return min;
  return Math.max(min, Math.min(max, num));
}