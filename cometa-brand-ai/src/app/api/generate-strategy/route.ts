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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      brandAnalysisId,
      brandName,
      packageName,
      ninetyDayGoal,
      adsBudget,
      monthlyContext,
    } = body;

    if (!brandName && !brandAnalysisId) {
      return NextResponse.json({
        success: false,
        error: "Se requiere brandName o brandAnalysisId para leer COSMOS.",
      });
    }

    let memoryQuery = supabase.from("cosmos_memory").select("*");

    if (brandAnalysisId) {
      memoryQuery = memoryQuery.eq("brand_analysis_id", brandAnalysisId);
    } else {
      memoryQuery = memoryQuery.eq("brand_name", brandName);
    }

    const { data: memory, error: memoryError } = await memoryQuery
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (memoryError) throw memoryError;

    if (!memory) {
      return NextResponse.json({
        success: false,
        error: "COSMOS no tiene memoria para esta marca.",
      });
    }

    if (!memory.orion_memory || !memory.business_memory) {
  return NextResponse.json({
    success: false,
    error:
      "COSMOS todavía no tiene ORION y BUSINESS_MEMORY completos. Ejecuta ambos antes de ATLAS.",
  });
}

    const finalBrandName = memory.brand_name || brandName;
    const industry = memory.industry || "No especificado";
    const city = memory.city || "No especificado";
    const finalBrandAnalysisId = memory.brand_analysis_id || brandAnalysisId;

    const packageRules = getPackageRules(packageName);
    const dailyAdsBudget = calculateDailyBudget(adsBudget);
    const industryPrompt = getIndustryPrompt(industry);

    const systemPrompt = `
${generalStrategyPrompt}

${industryPrompt}

REGLAS UNIVERSALES DE ATLAS V3:

ATLAS es el Director de Crecimiento Estratégico de COMETA OS.

ATLAS NO ES:
- community manager
- creador de calendarios
- generador de ideas virales
- planificador de posts
- ejecutivo de pauta
- redactor de redes sociales

ATLAS ES:
- estratega de crecimiento
- director comercial
- analista de negocio
- arquitecto de revenue
- diseñador de hipótesis de crecimiento
- traductor de memoria COSMOS en decisiones accionables

PRINCIPIO CENTRAL:
ATLAS no debe preguntarse primero "qué contenido hacemos".
ATLAS debe preguntarse primero "cómo crece este negocio".

ANTES DE HABLAR DE CONTENIDO, ATLAS DEBE ANALIZAR:

1. Revenue drivers.
2. Ticket promedio.
3. Frecuencia de compra.
4. Recompra.
5. Retención.
6. Cross-selling.
7. Upselling.
8. Capacidad operativa.
9. Objeciones de venta.
10. Barreras de confianza.
11. Diferenciadores reales.
12. Riesgos comerciales.
13. Oportunidades de rentabilidad.
14. Proceso de compra.
15. Cuello de botella principal.

FUENTES DE COSMOS:

1. ORION:
Percepción externa, madurez digital, presencia social, confianza visual, sitio web, posicionamiento, contenido actual y oportunidad percibida.

2. BUSINESS_MEMORY:
Realidad interna del negocio, oferta, buyer persona, ticket, capacidad, diferenciadores, objeciones, revenue drivers, proceso comercial, oportunidades y riesgos.

JERARQUÍA DE VERDAD:
- BUSINESS_MEMORY manda sobre ORION para negocio, ventas, buyer persona, oferta, ticket, objeciones, diferenciadores, revenue drivers y restricciones.
- ORION manda para percepción digital, presencia, branding, confianza visual, contenido actual y madurez digital.
- Si se contradicen, explica la contradicción y usa BUSINESS_MEMORY como realidad interna.

REGLAS DE ESTRATEGIA:
- No generes una estrategia centrada en redes sociales.
- No uses "contenido viral" como solución principal.
- No recomiendes TikTok, Reels, influencers, UGC o pauta como respuesta automática.
- Las redes sociales son vehículos, no estrategia.
- El contenido debe ser consecuencia de una hipótesis comercial.
- Cada recomendación debe conectar con ventas, confianza, retención, ticket, recompra, frecuencia o posicionamiento.
- No inventes métricas exactas.
- No inventes capacidad operativa.
- No inventes márgenes.
- No inventes temporadas si BUSINESS_MEMORY no las detectó.
- Si falta información clave, conviértela en riesgo o dato pendiente.
- La estrategia debe sonar como consultoría senior, no como plan de community manager.

REGLAS PARA CALENDARIO:
- El calendario existe solo como traducción operativa de la estrategia.
- No debe ser la parte más importante.
- Debe respetar paquete, recursos y capacidad.
- Cada concepto debe tener una razón comercial.
- Si un día no hay publicación, marca "Sin publicación".

RESPUESTA:
- Responde únicamente JSON válido.
- No uses markdown.
- No agregues texto fuera del JSON.
`;
   
const userPrompt = `
Crea una estrategia operativa de 90 días para esta marca usando COSMOS.

DATOS BASE DESDE COSMOS:
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
${JSON.stringify(memory.orion_memory || {}, null, 2)}

MEMORIA BUSINESS_MEMORY:
${JSON.stringify(memory.business_memory || {}, null, 2)}

INSTRUCCIÓN ESTRATÉGICA CRÍTICA:

Antes de llenar el JSON, razona como director de crecimiento:

- ¿Cuál es el verdadero cuello de botella comercial?
- ¿Qué debe crecer primero: ticket, frecuencia, recompra, confianza, leads, cierre o posicionamiento?
- ¿Qué revenue driver tiene más potencial?
- ¿Qué objeción impide la venta?
- ¿Qué acción tendría mayor impacto en 30 días?
- ¿Qué acción tendría mayor impacto en 90 días?
- ¿Qué NO debe hacer Cometa aunque parezca atractivo?
- ¿Qué debe hacer ATLAS antes de pensar en contenido?

La estrategia debe priorizar crecimiento del negocio.
El contenido, pauta y calendario deben aparecer solo como ejecución.

ESTRUCTURA JSON OBLIGATORIA:

{
  "strategy_score": 0,
  "strategy_level": "",

  "executive_summary": {
    "current_situation": "",
    "main_objective": "",
    "biggest_opportunity": "",
    "biggest_risk": "",
    "execution_priority": ""
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
    "what_this_business_sells": ["", "", ""],
    "what_this_business_does_not_sell": ["", "", ""],
    "customer_desires": ["", "", ""],
    "customer_problems": ["", "", ""],
    "customer_situations": ["", "", ""],
    "allowed_content_topics": ["", "", ""],
    "forbidden_content_topics": ["", "", ""]
  },

  "commercial_content_engine": {
    "business_type_detected": "",
    "revenue_categories": ["", "", ""],
    "trust_categories": ["", "", ""],
    "experience_categories": ["", "", ""],
    "community_categories": ["", "", ""],
    "conversion_categories": ["", "", ""],
    "objections_to_address": ["", "", ""],
    "ticket_growth_opportunities": ["", "", ""],
    "recommended_monthly_content_mix": [
      {
        "category": "",
        "percentage": 0,
        "reason": ""
      }
    ],
    "content_balance_rule": ""
  },

  "commercial_offer_map": {
    "detected_offer": ["", "", ""],
    "main_revenue_opportunity": "",
    "offer_balance_warning": "",
    "content_mix_recommendation": ""
  },

  "creative_concept_engine": {
    "creative_direction": "",
    "tone_of_content": "",
    "hook_style": "",
    "visual_style": "",
    "content_should_avoid": ["", "", ""],
    "example_hooks": ["", "", ""]
  },

  "smart_objectives": {
    "thirty_days": ["", "", ""],
    "ninety_days": ["", "", ""],
    "six_months": ["", "", ""]
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

  "growth_accelerators": [
    {
      "accelerator": "",
      "priority": 0,
      "reason": "",
      "recommended_action": ""
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

  "monthly_content_calendar": [
    {
      "week": 1,
      "items": [
        {
          "day": "Lunes",
          "format": "",
          "platform": "",
          "concept": "",
          "objective": "",
          "pillar": "",
          "creative_brief": "",
          "cta": "",
          "production_needs": ""
        },
        {
          "day": "Martes",
          "format": "",
          "platform": "",
          "concept": "",
          "objective": "",
          "pillar": "",
          "creative_brief": "",
          "cta": "",
          "production_needs": ""
        },
        {
          "day": "Miércoles",
          "format": "",
          "platform": "",
          "concept": "",
          "objective": "",
          "pillar": "",
          "creative_brief": "",
          "cta": "",
          "production_needs": ""
        },
        {
          "day": "Jueves",
          "format": "",
          "platform": "",
          "concept": "",
          "objective": "",
          "pillar": "",
          "creative_brief": "",
          "cta": "",
          "production_needs": ""
        },
        {
          "day": "Viernes",
          "format": "",
          "platform": "",
          "concept": "",
          "objective": "",
          "pillar": "",
          "creative_brief": "",
          "cta": "",
          "production_needs": ""
        },
        {
          "day": "Sábado",
          "format": "",
          "platform": "",
          "concept": "",
          "objective": "",
          "pillar": "",
          "creative_brief": "",
          "cta": "",
          "production_needs": ""
        },
        {
          "day": "Domingo",
          "format": "",
          "platform": "",
          "concept": "",
          "objective": "",
          "pillar": "",
          "creative_brief": "",
          "cta": "",
          "production_needs": ""
        }
      ]
    },
    {
      "week": 2,
      "items": []
    },
    {
      "week": 3,
      "items": []
    },
    {
      "week": 4,
      "items": []
    }
  ],

  "production_plan": {
    "monthly_visits": 0,
    "visit_1_objective": "",
    "visit_2_objective": "",
    "photos_needed": "",
    "videos_needed": "",
    "models_needed": "",
    "ugc_needed": "",
    "client_material_needed": ""
  },

  "operational_calendar": [
    {
      "task": "",
      "responsible_area": "",
      "suggested_day": "",
      "priority": "",
      "notes": ""
    }
  ],

  "kpis": {
    "reach_goal": "",
    "engagement_goal": "",
    "followers_goal": "",
    "leads_goal": "",
    "sales_goal": "",
    "ads_kpis": "",
    "main_success_metric": ""
  },

  "risk_control": {
    "strategic_risks": ["", "", ""],
    "operational_risks": ["", "", ""],
    "financial_risks": ["", "", ""],
    "how_to_prevent_failure": ""
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
- monthly_content_calendar debe contener exactamente 4 semanas.
- Cada semana debe contener exactamente 7 días.
- Si no hay publicación ese día:
  format: "Sin publicación"
  platform: "No aplica"
  concept: "Sin publicación programada"
  objective: "Descanso operativo / sin publicación"
  pillar: "No aplica"
  creative_brief: "No se publica contenido de feed este día."
  cta: "No aplica"
  production_needs: "Sin producción"
- Cada semana debe respetar exactamente:
  posting_days_per_week,
  reels_per_week,
  posts_per_week.
- Los porcentajes de content_architecture.pillars deben sumar 100.
- Los porcentajes de commercial_content_engine.recommended_monthly_content_mix deben sumar 100.
- recommended_distribution debe sumar 100.
- growth_model debe ser la parte más importante de la estrategia.
- No pongas redes sociales como primary_growth_lever salvo que el negocio dependa directamente de ellas.
- primary_growth_lever debe ser comercial: ticket, frecuencia, recompra, confianza, cierre, leads, conversión, retención, posicionamiento o capacidad.
- Cada recomendación debe explicar cómo ayuda a crecer el negocio.
- No agregues texto fuera del JSON.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.38,
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

    const cleanedResult = rawResult
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsedResult = JSON.parse(cleanedResult);

    const { data: savedStrategy, error } = await supabase
      .from("strategy_analysis")
      .insert([
        {
          brand_analysis_id: finalBrandAnalysisId || null,
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
      console.log(error);
      return NextResponse.json({
        success: false,
        error: "Error guardando estrategia",
      });
    }

    const now = new Date().toISOString();

const currentTimeline = Array.isArray(memory.activity_timeline)
  ? memory.activity_timeline
  : [];

const timelineEvent = {
  timestamp: now,
  agent: "ATLAS",
  action: "generate_strategy",
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
        brand_analysis_id: finalBrandAnalysisId || null,
        agent_name: "ATLAS",
        action_type: "strategy_generation_v2",
        input_data: {
          brandName: finalBrandName,
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
      strategy: parsedResult,
    });
  } catch (error) {
    console.log(error);

    return NextResponse.json({
      success: false,
      error: "Error generando estrategia",
    });
  }
}