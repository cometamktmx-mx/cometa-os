import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generalStrategyPrompt } from "@/lib/prompts/strategy/general";
import { getIndustryPrompt } from "@/lib/prompts/strategy/getIndustryPrompt";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getPackageRules(packageName: string) {
  const packages: any = {
    Starter: {
      posting_days_per_week: 3,
      reels_per_week: 2,
      posts_per_week: 1,
      monthly_visits: 2,
      production_level: "Básico",
      allowed_resources:
        "Contenido orgánico básico, recursos existentes, levantamiento quincenal ligero, historias simples y ejecución sin producción compleja.",
      not_allowed:
        "Modelos, producción profesional avanzada, comerciales, campañas narrativas complejas, contenido diario o ideas que dependan de muchos recursos.",
    },
    Growth: {
      posting_days_per_week: 4,
      reels_per_week: 2,
      posts_per_week: 2,
      monthly_visits: 2,
      production_level: "Intermedio",
      allowed_resources:
        "Contenido real, levantamiento quincenal, historias, reels comerciales, contenido de confianza, prueba social básica y piezas de conversión.",
      not_allowed:
        "Producciones de alto costo, múltiples modelos, contenido diario, comerciales elaborados o ideas difíciles de ejecutar con equipo estándar.",
    },
    Scale: {
      posting_days_per_week: 5,
      reels_per_week: 3,
      posts_per_week: 2,
      monthly_visits: 2,
      production_level: "Avanzado",
      allowed_resources:
        "Storytelling, testimonios, contenido de autoridad, contenido aspiracional, reels de valor, UGC moderado y producción estratégica.",
      not_allowed:
        "Producciones excesivamente costosas, comerciales complejos, modelos múltiples sin justificación o acciones que comprometan la rentabilidad.",
    },
    Dominio: {
      posting_days_per_week: 6,
      reels_per_week: 3,
      posts_per_week: 3,
      monthly_visits: 2,
      production_level: "Premium",
      allowed_resources:
        "Producción avanzada, modelos cuando sea rentable, fotografía profesional, UGC, branding fuerte, campañas agresivas y contenido más aspiracional.",
      not_allowed:
        "Producciones que comprometan rentabilidad, ideas sobredimensionadas o acciones fuera del presupuesto aprobado.",
    },
  };

  return packages[packageName] || packages.Growth;
}

function calculateDailyBudget(adsBudget: any) {
  const budget = Number(adsBudget || 0);
  if (!budget || budget <= 0) return 0;
  return Math.round((budget / 30) * 100) / 100;
}

function slugifyBrand(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatBrandName(value: string) {
  const cleaned = String(value || "")
    .replace(/[-_]+/g, " ")
    .trim();

  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getOrionMemory(memory: any) {
  return (
    memory?.orion_memory ||
    memory?.orion_analysis ||
    memory?.orion_data ||
    null
  );
}

function getBusinessMemory(memory: any) {
  return (
    memory?.business_memory ||
    memory?.nova_business_map ||
    memory?.business_map ||
    memory?.nova_memory ||
    null
  );
}

async function findCosmosMemory({
  brandAnalysisId,
  brandName,
}: {
  brandAnalysisId?: string | null;
  brandName?: string | null;
}) {
  const rawBrandName = String(brandName || "").trim();
  const brandSlug = slugifyBrand(rawBrandName);
  const formattedBrandName = formatBrandName(rawBrandName);

  if (brandAnalysisId) {
    const { data, error } = await supabase
      .from("cosmos_memory")
      .select("*")
      .eq("brand_analysis_id", brandAnalysisId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (brandSlug) {
    const { data, error } = await supabase
      .from("cosmos_memory")
      .select("*")
      .eq("brand_slug", brandSlug)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("ATLAS findCosmosMemory brand_slug error:", error.message);
    }

    if (data) return data;
  }

  if (rawBrandName) {
    const { data, error } = await supabase
      .from("cosmos_memory")
      .select("*")
      .eq("brand_name", rawBrandName)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("ATLAS findCosmosMemory exact brand_name error:", error.message);
    }

    if (data) return data;
  }

  if (formattedBrandName) {
    const { data, error } = await supabase
      .from("cosmos_memory")
      .select("*")
      .ilike("brand_name", formattedBrandName)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("ATLAS findCosmosMemory formatted brand_name error:", error.message);
    }

    if (data) return data;
  }

  if (brandSlug) {
    const searchText = `%${brandSlug.replace(/-/g, "%")}%`;

    const { data, error } = await supabase
      .from("cosmos_memory")
      .select("*")
      .ilike("brand_name", searchText)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("ATLAS findCosmosMemory fuzzy brand_name error:", error.message);
    }

    if (data) return data;
  }

  return null;
}

function safeJsonParse(raw: string) {
  const cleaned = String(raw || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }

    throw new Error("ATLAS no devolvió JSON válido.");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      brandAnalysisId,
      brandName,
      packageName = "Growth",
      ninetyDayGoal = "",
      adsBudget = 0,
      monthlyContext = "",
    } = body;

    if (!brandName && !brandAnalysisId) {
      return NextResponse.json({
        success: false,
        error: "Se requiere brandName o brandAnalysisId para leer COSMOS.",
      });
    }

    const memory = await findCosmosMemory({
      brandAnalysisId,
      brandName,
    });

    if (!memory) {
      return NextResponse.json({
        success: false,
        error:
          "COSMOS no tiene memoria para esta marca. Primero ejecuta ORION y NOVA, o revisa que el brandSlug/brandName coincida con la memoria guardada.",
        debug: {
          receivedBrandName: brandName || null,
          receivedBrandAnalysisId: brandAnalysisId || null,
          searchedBrandSlug: slugifyBrand(brandName || ""),
          formattedBrandName: formatBrandName(brandName || ""),
        },
      });
    }

    const orionMemory = getOrionMemory(memory);
    const businessMemory = getBusinessMemory(memory);

    if (!orionMemory || !businessMemory) {
      return NextResponse.json({
        success: false,
        error:
          "ATLAS necesita ORION y NOVA / BUSINESS_MEMORY completos para generar estrategia de crecimiento.",
        debug: {
          cosmosMemoryId: memory.id,
          brandName: memory.brand_name,
          brandSlug: memory.brand_slug,
          hasOrionMemory: Boolean(orionMemory),
          hasBusinessMemory: Boolean(businessMemory),
          availableKeys: Object.keys(memory || {}),
        },
      });
    }

    const finalBrandName =
      memory.brand_name || formatBrandName(brandName || "Marca sin nombre");

    const industry = memory.industry || "No especificado";
    const city = memory.city || "No especificado";
    const finalBrandAnalysisId = memory.brand_analysis_id || brandAnalysisId || null;

    const packageRules = getPackageRules(packageName);
    const dailyAdsBudget = calculateDailyBudget(adsBudget);
    const industryPrompt = getIndustryPrompt(industry);

    const systemPrompt = `
${generalStrategyPrompt}

${industryPrompt}

ATLAS STRATEGY AI V4 — DOCTRINA ESTABLE COMETA OS

ATLAS es el agente de estrategia de crecimiento de COMETA OS.

ATLAS NO ES:
- community manager
- creador de calendarios
- generador de ideas virales
- planificador de posts diarios
- redactor de copys
- ejecutivo de pauta
- agente de atención de WhatsApp
- creador de buyer persona desde cero

ATLAS SÍ ES:
- estratega de crecimiento
- director comercial
- analista de negocio
- arquitecto de revenue
- diseñador de hipótesis de crecimiento
- traductor de ORION + NOVA + COSMOS en decisiones estratégicas
- generador de dirección para agentes posteriores

ARQUITECTURA COMETA OS:
- ORION analiza la realidad externa de la marca: presencia digital, redes, sitio, competencia, confianza visual, señales públicas y evidencia.
- NOVA / Business Map estructura la realidad interna: oferta, buyer persona, objeciones, proceso de compra, ticket, diferenciadores, revenue drivers, restricciones y capacidad.
- ATLAS crea estrategia de crecimiento: qué debe crecer, cuál es el cuello de botella, cuál es la hipótesis, qué priorizar y qué no hacer.
- El agente de contenido toma la estrategia aprobada de ATLAS y la convierte en estrategia de contenido mensual.
- Calendar Engine convierte la estrategia de contenido en calendario día por día.
- SALES AI atiende, califica, da seguimiento, aprende de conversaciones y mejora conversión en WhatsApp.

REGLA CENTRAL:
ATLAS piensa estrategia.
ATLAS NO genera calendario diario.
ATLAS NO sustituye SALES AI.
ATLAS NO sustituye NOVA.
ATLAS NO debe tratar la capacitación humana de WhatsApp como solución principal si SALES AI puede resolver seguimiento, calificación, objeciones y cierre.

JERARQUÍA DE VERDAD:
- NOVA / BUSINESS_MEMORY manda sobre oferta, buyer persona, objeciones, revenue drivers, ticket, capacidad, reglas comerciales y proceso de compra.
- ORION manda sobre percepción externa, madurez digital, confianza visual, contenido actual, redes, sitio web y competencia.
- Si ORION y NOVA se contradicen, ATLAS debe detectar la contradicción y usar NOVA como realidad interna.
- ATLAS puede inferir riesgos estratégicos, pero no debe inventar datos duros.

PRINCIPIO ESTRATÉGICO:
ATLAS no debe preguntarse primero "qué contenido hacemos".
ATLAS debe preguntarse primero "cómo crece este negocio y qué agente debe actuar".

ANTES DE RECOMENDAR, ATLAS DEBE ANALIZAR:
1. Cuello de botella real.
2. Palanca de crecimiento primaria.
3. Revenue driver prioritario.
4. Ticket promedio y oportunidad de ticket.
5. Frecuencia y recompra.
6. Retención.
7. Cross-selling y upselling.
8. Capacidad operativa.
9. Objeciones de venta.
10. Barreras de confianza.
11. Diferenciadores reales.
12. Riesgos comerciales.
13. Proceso de compra.
14. Calidad de leads.
15. Conversión de conversaciones.
16. Qué debe ejecutar SALES AI.
17. Qué debe traducir el agente de contenido.
18. Qué debe convertir Calendar Engine en calendario.

REGLAS DE ESTRATEGIA:
- No generes una estrategia centrada en redes sociales.
- No uses "contenido viral" como solución principal.
- No recomiendes TikTok, Reels, influencers, UGC o pauta como respuesta automática.
- Las redes sociales son vehículos, no estrategia.
- El contenido debe ser consecuencia de una hipótesis comercial.
- Cada recomendación debe conectar con ventas, confianza, retención, ticket, recompra, frecuencia, posicionamiento, conversión o capacidad.
- No inventes métricas exactas.
- No inventes márgenes.
- No inventes capacidad operativa.
- No inventes temporadas.
- Si falta información clave, conviértela en riesgo, pendiente o pregunta para NOVA.
- Si WhatsApp es cuello de botella, la acción estratégica debe ser activar o ajustar SALES AI, no solo capacitar humanos.
- Si la marca depende de contenido, ATLAS debe dar dirección estratégica, no calendario.
- La estrategia debe sonar como consultoría senior, no como plan de community manager.

CAPA VISIBLE VS INTERNA:
- client_visible_strategy debe ser clara, profesional y segura para mostrar al cliente.
- internal_strategy puede contener hipótesis sensibles, riesgos y decisiones que Cometa debe revisar.
- approval_control debe indicar que Cometa debe aprobar antes de publicar.
- La versión visible no debe exponer razonamiento interno fuerte, críticas duras o dudas sensibles.

RESPUESTA:
- Responde únicamente JSON válido.
- No uses markdown.
- No agregues texto fuera del JSON.
`;

    const userPrompt = `
Crea una estrategia de crecimiento de 90 días para esta marca usando COSMOS.

DATOS BASE:
Marca: ${finalBrandName}
Industria: ${industry}
Ciudad: ${city}

VARIABLES OPERATIVAS:
Paquete contratado: ${packageName}
Meta a 90 días: ${ninetyDayGoal || "No especificado"}
Presupuesto mensual de pauta: ${adsBudget || 0}
Presupuesto diario aproximado: ${dailyAdsBudget}
Contexto especial del mes: ${monthlyContext || "Sin contexto especial"}

REGLAS INTERNAS DEL PAQUETE:
${JSON.stringify(packageRules, null, 2)}

MEMORIA ORION:
${JSON.stringify(orionMemory || {}, null, 2)}

MEMORIA NOVA / BUSINESS_MEMORY:
${JSON.stringify(businessMemory || {}, null, 2)}

ESTRATEGIA ANTERIOR / GROWTH MEMORY:
${JSON.stringify(memory.growth_memory || null, null, 2)}

ACTIVITY TIMELINE:
${JSON.stringify(memory.activity_timeline || [], null, 2)}

INSTRUCCIÓN ESTRATÉGICA CRÍTICA:

Antes de llenar el JSON, razona como director de crecimiento:

- ¿Cuál es el verdadero cuello de botella comercial?
- ¿Qué debe crecer primero: ticket, frecuencia, recompra, confianza, leads, cierre, conversión, retención o posicionamiento?
- ¿Qué revenue driver tiene más potencial?
- ¿Qué objeción impide la venta?
- ¿Qué acción tendría mayor impacto en 30 días?
- ¿Qué acción tendría mayor impacto en 90 días?
- ¿Qué NO debe hacer Cometa aunque parezca atractivo?
- ¿Qué debe ejecutar SALES AI?
- ¿Qué debe recibir el agente de contenido como dirección?
- ¿Qué debe recibir Calendar Engine como límites?
- ¿Qué debe quedar visible para el cliente?
- ¿Qué debe quedar interno para Cometa?

ATLAS debe generar estrategia de crecimiento.
ATLAS no debe generar calendario diario.
ATLAS no debe crear buyer persona desde cero; debe usar NOVA / BUSINESS_MEMORY.
ATLAS no debe decir únicamente "capacitar al equipo de WhatsApp" si el problema puede ser resuelto por SALES AI.

ESTRUCTURA JSON OBLIGATORIA:

{
  "strategy_score": 0,
  "strategy_level": "",

  "data_quality": {
    "has_orion_memory": true,
    "has_business_memory": true,
    "confidence_level": "",
    "missing_information": ["", "", ""],
    "strategic_limitations": ["", "", ""],
    "questions_for_nova": ["", "", ""]
  },

  "executive_summary": {
    "current_situation": "",
    "main_objective": "",
    "biggest_opportunity": "",
    "biggest_risk": "",
    "execution_priority": ""
  },

  "client_visible_strategy": {
    "monthly_objective": "",
    "client_summary": "",
    "content_focus": "",
    "sales_focus": "",
    "priority_offers": "",
    "main_actions": "",
    "visible_hypothesis": "",
    "next_steps": ""
  },

  "internal_strategy": {
    "internal_reading": "",
    "sensitive_hypothesis": "",
    "cometa_decision_needed": "",
    "what_to_validate_before_publishing": "",
    "what_not_to_show_client": ""
  },

  "strategic_diagnosis": {
    "real_problem": "",
    "real_bottleneck": "",
    "wrong_assumption_to_avoid": "",
    "growth_hypothesis": "",
    "strategic_focus": "",
    "what_not_to_do": ""
  },

  "growth_model": {
    "primary_growth_lever": "",
    "secondary_growth_lever": "",
    "revenue_driver_to_prioritize": "",
    "ticket_strategy": "",
    "frequency_strategy": "",
    "retention_strategy": "",
    "cross_sell_or_upsell_strategy": "",
    "trust_strategy": "",
    "conversion_strategy": "",
    "operational_dependency": "",
    "main_growth_hypothesis": ""
  },

  "brand_context_lock": {
    "business_type": "",
    "buyer_persona_source": "NOVA / BUSINESS_MEMORY",
    "what_this_business_sells": ["", "", ""],
    "what_this_business_does_not_sell": ["", "", ""],
    "customer_desires": ["", "", ""],
    "customer_problems": ["", "", ""],
    "customer_situations": ["", "", ""],
    "allowed_strategic_topics": ["", "", ""],
    "forbidden_strategic_topics": ["", "", ""]
  },

  "offer_strategy": {
    "detected_priority_offers": ["", "", ""],
    "main_revenue_opportunity": "",
    "offer_positioning": "",
    "offer_risk": "",
    "recommended_offer_focus": ""
  },

  "sales_ai_directives": {
    "should_sales_ai_be_activated": true,
    "sales_ai_priority": "",
    "main_whatsapp_problem_to_solve": "",
    "lead_qualification_rules_needed": ["", "", ""],
    "objections_sales_ai_must_handle": ["", "", ""],
    "follow_up_strategy": "",
    "handoff_rules_to_humans": "",
    "sales_playbook_needed": ["", "", ""],
    "what_sales_ai_should_report_back_to_atlas": ["", "", ""]
  },

  "content_strategy_directives": {
    "strategic_communication_role": "",
    "main_content_direction": "",
    "content_principle": "",
    "messages_to_amplify": ["", "", ""],
    "objections_to_address_with_content": ["", "", ""],
    "trust_assets_needed": ["", "", ""],
    "content_should_avoid": ["", "", ""],
    "recommended_pillars": [
      {
        "pillar": "",
        "percentage": 0,
        "strategic_role": "",
        "example_angle": ""
      }
    ]
  },

  "calendar_engine_directives": {
    "calendar_should_prioritize": ["", "", ""],
    "calendar_must_respect": ["", "", ""],
    "formats_recommended": ["", "", ""],
    "formats_to_avoid": ["", "", ""],
    "production_limits": "",
    "approval_notes": ""
  },

  "budget_strategy": {
    "management_package": "",
    "ads_budget": 0,
    "daily_ads_budget": 0,
    "ads_budget_reading": "",
    "budget_reality": "",
    "recommended_distribution": {
      "awareness": 0,
      "engagement": 0,
      "conversion": 0,
      "remarketing": 0
    },
    "ads_execution_notes": "",
    "what_not_to_do_with_ads": ""
  },

  "package_execution_limits": {
    "posting_days_per_week": 0,
    "reels_per_week": 0,
    "posts_per_week": 0,
    "monthly_visits": 0,
    "production_level": "",
    "what_is_allowed": "",
    "what_is_not_allowed": "",
    "operational_warning": ""
  },

  "roadmap_90_days": [
    {
      "title": "Fase 1",
      "period": "Días 1–30",
      "focus": "",
      "strategic_reason": "",
      "main_owner": ""
    },
    {
      "title": "Fase 2",
      "period": "Días 31–60",
      "focus": "",
      "strategic_reason": "",
      "main_owner": ""
    },
    {
      "title": "Fase 3",
      "period": "Días 61–90",
      "focus": "",
      "strategic_reason": "",
      "main_owner": ""
    }
  ],

  "content_architecture": {
    "main_content_direction": "",
    "content_principle": "",
    "pillars": [
      {
        "pillar": "",
        "percentage": 0,
        "role": "",
        "example_angle": ""
      }
    ]
  },

  "kpis": {
    "reach_goal": "",
    "engagement_goal": "",
    "followers_goal": "",
    "leads_goal": "",
    "sales_goal": "",
    "ads_kpis": "",
    "sales_ai_kpis": "",
    "main_success_metric": ""
  },

  "risk_control": {
    "strategic_risks": ["", "", ""],
    "operational_risks": ["", "", ""],
    "financial_risks": ["", "", ""],
    "sales_risks": ["", "", ""],
    "how_to_prevent_failure": ""
  },

  "learning_loop": {
    "what_atlas_should_watch_next_cycle": ["", "", ""],
    "what_sales_ai_should_report": ["", "", ""],
    "what_content_strategy_agent_should_report": ["", "", ""],
    "what_calendar_engine_should_report": ["", "", ""],
    "memory_updates_recommended": ["", "", ""]
  },

  "approval_control": {
    "requires_cometa_review": true,
    "safe_to_show_client": false,
    "client_visible_summary_ready": true,
    "reason_for_review": "",
    "suggested_publication_status": "draft"
  },

  "ceo_recommendation": {
    "what_i_would_do_first": "",
    "what_not_to_do": "",
    "where_to_focus_budget": "",
    "final_decision": ""
  },

  "next_steps": ["", "", ""]
}

REGLAS CRÍTICAS:
- No incluyas monthly_content_calendar.
- No incluyas calendario por día.
- No incluyas lista de publicaciones diarias.
- No actúes como Calendar Engine.
- No actúes como SALES AI.
- No actúes como NOVA.
- content_architecture solo debe ser dirección estratégica de comunicación, no calendario.
- content_strategy_directives debe servir para que el agente de contenido pueda crear la estrategia de contenido después.
- calendar_engine_directives debe servir para que Calendar Engine pueda crear el calendario después.
- sales_ai_directives debe servir para que SALES AI mejore WhatsApp, calificación, objeciones, seguimiento y cierre.
- Los porcentajes de content_architecture.pillars deben sumar 100.
- Los porcentajes de content_strategy_directives.recommended_pillars deben sumar 100.
- recommended_distribution debe sumar 100.
- growth_model debe ser la parte más importante de la estrategia.
- No pongas redes sociales como primary_growth_lever salvo que el negocio dependa directamente de ellas.
- primary_growth_lever debe ser comercial: ticket, frecuencia, recompra, confianza, cierre, leads, conversión, retención, posicionamiento o capacidad.
- Si el cuello de botella es WhatsApp, recomienda activar/optimizar SALES AI como sistema, no solo capacitar humanos.
- Cada recomendación debe explicar cómo ayuda a crecer el negocio.
- No agregues texto fuera del JSON.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.28,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const rawResult = completion.choices[0].message.content || "{}";
    const parsedResult = safeJsonParse(rawResult);

    parsedResult._cometa_meta = {
      agent: "ATLAS",
      version: "atlas_strategy_ai_v4",
      generated_at: new Date().toISOString(),
      brand_name: finalBrandName,
      brand_analysis_id: finalBrandAnalysisId,
      source_memory_id: memory.id,
      depends_on: ["ORION", "NOVA / BUSINESS_MEMORY"],
      downstream_agents: [
        "CONTENT_STRATEGY_AGENT",
        "CALENDAR_ENGINE",
        "SALES_AI",
      ],
      requires_cometa_approval: true,
      client_visible_only_after_publish: true,
    };

    const { data: savedStrategy, error } = await supabase
      .from("strategy_analysis")
      .insert([
        {
          brand_analysis_id: finalBrandAnalysisId,
          brand_name: finalBrandName,
          industry,
          city,
          package_name: packageName,
          main_objective: ninetyDayGoal || null,
          ninety_day_goal: ninetyDayGoal,
          ads_budget: Number(adsBudget || 0),
          influencer_enabled: false,
          influencer_level: null,
          influencer_budget: 0,
          ugc_access: null,
          strong_season: false,
          season_name: monthlyContext || null,
          restrictions: null,
          strategy_json: parsedResult,
        },
      ])
      .select("id")
      .single();

    if (error) {
      console.log("Error guardando strategy_analysis:", error);

      return NextResponse.json({
        success: false,
        error: "Error guardando estrategia de ATLAS.",
      });
    }

    const now = new Date().toISOString();

    const currentTimeline = Array.isArray(memory.activity_timeline)
      ? memory.activity_timeline
      : [];

    const timelineEvent = {
      timestamp: now,
      agent: "ATLAS",
      action: "generate_growth_strategy",
      memory_column: "growth_memory",
      summary:
        parsedResult?.executive_summary?.current_situation ||
        parsedResult?.executive_summary?.main_objective ||
        null,
    };

    const { error: updateCosmosError } = await supabase
      .from("cosmos_memory")
      .update({
        growth_memory: parsedResult,
        last_agent: "ATLAS",
        activity_timeline: [...currentTimeline, timelineEvent],
        updated_at: now,
      })
      .eq("id", memory.id);

    if (updateCosmosError) {
      console.log("Error guardando ATLAS en COSMOS:", updateCosmosError);

      return NextResponse.json({
        success: false,
        error: "ATLAS generó la estrategia, pero no pudo guardar en COSMOS.",
      });
    }

    await supabase.from("cosmos_agent_runs").insert([
      {
        brand_name: finalBrandName,
        brand_analysis_id: finalBrandAnalysisId,
        agent_name: "ATLAS",
        action_type: "growth_strategy_generation_v4",
        input_data: {
          brandName: finalBrandName,
          requestedBrandName: brandName,
          brandAnalysisId: finalBrandAnalysisId,
          packageName,
          ninetyDayGoal,
          adsBudget,
          monthlyContext,
          cosmos_memory_id: memory.id,
        },
        output_data: {
          strategyId: savedStrategy?.id || null,
          strategy: parsedResult,
        },
        status: "success",
      },
    ]);

    return NextResponse.json({
      success: true,
      strategyId: savedStrategy?.id || null,
      strategy: parsedResult,
    });
  } catch (error: any) {
    console.log("generate-strategy ATLAS error:", error);

    return NextResponse.json({
      success: false,
      error: error?.message || "Error generando estrategia con ATLAS.",
    });
  }
}