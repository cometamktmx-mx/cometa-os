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
        readyRepliesCount,
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
      catalogCount,
      rulesCount,
      faqsCount,
      pendingSuggestionsCount,
      latestRunRequiresHuman: Boolean(latestRun?.requires_human),
    });

    const agentStatus = getAgentStatus({
      playbook,
      latestRun,
      knowledge,
      catalogCount,
      rulesCount,
      faqsCount,
    });

    const mainAction = getMainAction({
      knowledge,
      leadCount,
      catalogCount,
      rulesCount,
      faqsCount,
      pendingSuggestionsCount,
    });

    const headline = getHeadline({
      agentStatus,
      knowledge,
      catalogCount,
      rulesCount,
      faqsCount,
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
      permissions: getClientPermissions(userContext.role),
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
      dashboard: {
        accountDigital: {
          title: "Cuenta Digital",
          access: "view",
          description:
            "El cliente visualiza redes, señales, presencia digital, WhatsApp, web y estado general de su ecosistema.",
        },
        workDone: {
          title: "Trabajo Realizado",
          access: "view",
          description:
            "El cliente visualiza acciones realizadas por Cometa: contenido, optimizaciones, campañas, revisiones y avances.",
        },
        monthlyStrategy: {
          title: "Estrategia del Mes",
          access: "view",
          agent: "MERCURY",
          description:
            "El cliente visualiza la estrategia mensual aprobada por Cometa. Las hipótesis internas no se publican sin validación.",
        },
        salesAi: {
          title: "Ventas / Leads",
          access: "edit_business_information",
          description:
            "El cliente puede actualizar información comercial que usa SALES AI, pero no modifica la lógica interna del agente.",
        },
        aiAgentsInfo: {
          title: "Información para Agentes IA",
          access: "edit_business_information",
          description:
            "El cliente puede editar catálogo, reglas, FAQs, objeciones, restricciones, horarios, promociones y datos comerciales.",
        },
        reports: {
          title: "Reportes",
          access: "view",
          description:
            "El cliente visualiza resultados, aprendizajes visibles, trabajo realizado y siguientes pasos.",
        },
      },
      connections: {
        instagram: {
          label: "Instagram",
          status: "pending",
          editableByClient: true,
        },
        facebook: {
          label: "Facebook",
          status: "pending",
          editableByClient: true,
        },
        whatsapp: {
          label: "WhatsApp Business",
          status: "pending",
          editableByClient: true,
        },
        metaAds: {
          label: "Meta Ads",
          status: "pending",
          editableByClient: true,
        },
        shopify: {
          label: "Shopify",
          status: "coming_soon",
          editableByClient: false,
        },
        pos: {
          label: "POS",
          status: "coming_soon",
          editableByClient: false,
        },
      },
      futureModules: {
        inventory: {
          title: "Inventario",
          status: "coming_soon",
          description:
            "Conectará Shopify, POS, catálogo e inventario para analizar stock, rotación, margen y productos prioritarios.",
        },
        commercialOpportunities: {
          title: "Oportunidades Comerciales",
          status: "coming_soon",
          description:
            "Unificará ventas, redes, inventario y POS para detectar productos a empujar, campañas sugeridas y oportunidades reales.",
        },
      },
      counts: {
        leads: leadCount,
        readyReplies: readyRepliesCount,
        knowledgeSources: knowledgeSourcesCount,
        catalogItems: catalogCount,
        businessRules: rulesCount,
        faqs: faqsCount,
        pendingInternalAlerts: pendingSuggestionsCount,
        appliedInternalAlerts: appliedSuggestionsCount,
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
          // Next puede impedir setear cookies en ciertos contextos.
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

function getClientPermissions(role: UserRole) {
  const isAdmin = role === "admin";

  return {
    canViewDashboard: true,
    canViewAccountDigital: true,
    canViewWorkDone: true,
    canViewMonthlyStrategy: true,
    canViewReports: true,
    canEditBusinessInformation: true,
    canEditAgentKnowledge: true,
    canManageConnections: true,
    canEditStrategy: isAdmin,
    canApproveMercuryStrategy: isAdmin,
    canViewInternalHypotheses: isAdmin,
    canEditAgentLogic: isAdmin,
    canRunInternalAgents: isAdmin,
    canViewRawEvidence: isAdmin,
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

  if (knowledgeSourcesCount > 0) score += 15;

  if (catalogCount >= 5) score += 30;
  else score += catalogCount * 6;

  if (rulesCount >= 6) score += 30;
  else score += rulesCount * 5;

  if (faqsCount >= 5) score += 25;
  else score += faqsCount * 5;

  return clampNumber(score, 0, 100);
}

function calculateAgentScore({
  knowledge,
  leadCount,
  readyRepliesCount,
  pendingSuggestionsCount,
}: {
  knowledge: number;
  leadCount: number;
  readyRepliesCount: number;
  pendingSuggestionsCount: number;
}) {
  let score = 35;

  score += Math.round(knowledge * 0.45);

  if (leadCount > 0) score += 8;
  if (leadCount > 10) score += 5;
  if (readyRepliesCount > 0) score += 7;

  if (pendingSuggestionsCount > 0) score += 3;

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
  let score = Math.round(knowledge * 0.6 + agentScore * 0.28);

  if (readyRepliesCount > 0) score += 8;

  if (pendingSuggestionsCount >= 5) score -= 8;
  else if (pendingSuggestionsCount >= 2) score -= 4;

  return clampNumber(score, 0, 100);
}

function calculateRiskLevel({
  knowledge,
  catalogCount,
  rulesCount,
  faqsCount,
  pendingSuggestionsCount,
  latestRunRequiresHuman,
}: {
  knowledge: number;
  catalogCount: number;
  rulesCount: number;
  faqsCount: number;
  pendingSuggestionsCount: number;
  latestRunRequiresHuman: boolean;
}): RiskLevel {
  if (latestRunRequiresHuman) return "Alto";
  if (catalogCount === 0) return "Alto";
  if (rulesCount < 3) return "Alto";
  if (knowledge < 55) return "Alto";

  if (faqsCount < 3) return "Medio";
  if (pendingSuggestionsCount >= 5) return "Medio";
  if (knowledge < 85) return "Medio";

  return "Bajo";
}

function getAgentStatus({
  playbook,
  latestRun,
  knowledge,
  catalogCount,
  rulesCount,
  faqsCount,
}: {
  playbook: any;
  latestRun: any;
  knowledge: number;
  catalogCount: number;
  rulesCount: number;
  faqsCount: number;
}) {
  if (!playbook && catalogCount === 0 && rulesCount === 0) {
    return "Configuración";
  }

  if (catalogCount === 0 || rulesCount < 3 || knowledge < 55) {
    return "Preparando";
  }

  if (latestRun?.action_status === "ready_to_execute") {
    return "Activo";
  }

  if (knowledge >= 85 && faqsCount >= 5) {
    return "Listo";
  }

  return "Preparando";
}

function getMainAction({
  knowledge,
  leadCount,
  catalogCount,
  rulesCount,
  faqsCount,
  pendingSuggestionsCount,
}: {
  knowledge: number;
  leadCount: number;
  catalogCount: number;
  rulesCount: number;
  faqsCount: number;
  pendingSuggestionsCount: number;
}) {
  if (catalogCount === 0) {
    return {
      title: "Subir catálogo comercial",
      description:
        "El agente necesita productos, servicios, lotes o paquetes autorizados para responder sin inventar información.",
    };
  }

  if (rulesCount < 3) {
    return {
      title: "Completar reglas comerciales",
      description:
        "Agrega reglas de precios, pagos, envíos, horarios, descuentos, límites y condiciones para operar con seguridad.",
    };
  }

  if (faqsCount < 3) {
    return {
      title: "Agregar preguntas frecuentes",
      description:
        "Carga las dudas más comunes para que el agente responda con mayor precisión en WhatsApp y ventas.",
    };
  }

  if (knowledge < 85) {
    return {
      title: "Mejorar información para IA",
      description:
        "La base comercial aún puede fortalecerse con más productos, reglas, objeciones, FAQs y restricciones.",
    };
  }

  if (leadCount > 0) {
    return {
      title: "Revisar conversaciones activas",
      description:
        "Hay leads abiertos. Revisa oportunidades calientes, seguimiento y posibles puntos de cierre.",
    };
  }

  if (pendingSuggestionsCount > 0) {
    return {
      title: "Revisar alertas internas",
      description:
        "Cometa OS detectó señales útiles para mejorar ventas. Estas alertas no cambian la estrategia hasta que Cometa las valide.",
    };
  }

  return {
    title: "Sistema comercial listo",
    description:
      "El agente tiene una buena base comercial. Mantén actualizados productos, reglas, promociones y restricciones.",
  };
}

function getHeadline({
  agentStatus,
  knowledge,
  catalogCount,
  rulesCount,
  faqsCount,
}: {
  agentStatus: string;
  knowledge: number;
  catalogCount: number;
  rulesCount: number;
  faqsCount: number;
}) {
  if (agentStatus === "Activo") {
    return "Tu sistema comercial está operando.";
  }

  if (catalogCount === 0 || rulesCount < 3) {
    return "Tu IA necesita información comercial para operar con seguridad.";
  }

  if (knowledge >= 85 && faqsCount >= 5) {
    return "Tu agente comercial está listo.";
  }

  return "Tu cuenta digital está en preparación inteligente.";
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
    return `Cometa OS está ayudando a ${brandName} a visualizar su cuenta digital, revisar ventas, centralizar información comercial y operar SALES AI con control humano.`;
  }

  if (knowledge >= 85) {
    return `${brandName} ya tiene una base comercial sólida. El siguiente paso es mantener actualizada la información, revisar leads y conectar más fuentes de datos.`;
  }

  return `Cometa OS está preparando la base comercial de ${brandName}: catálogo, reglas, FAQs, límites, conexiones y contexto para que los agentes IA puedan operar sin inventar información.`;
}

function clampNumber(value: any, min: number, max: number) {
  const num = Number(value || 0);

  if (Number.isNaN(num)) return min;

  return Math.max(min, Math.min(max, num));
}