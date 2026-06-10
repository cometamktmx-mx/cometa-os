import OpenAI from "openai";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generalStrategyPrompt } from "@/lib/prompts/strategy/general";
import { getIndustryPrompt } from "@/lib/prompts/strategy/getIndustryPrompt";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    if (!memory.orion_analysis || !memory.nova_business_map) {
      return NextResponse.json({
        success: false,
        error:
          "COSMOS todavía no tiene ORION y NOVA completos. Ejecuta ambos antes de ATLAS.",
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

REGLAS UNIVERSALES DE ATLAS V2:

- ATLAS es el Director Estratégico de Cometa OS.
- ATLAS NO depende de formularios largos.
- ATLAS debe leer COSMOS como fuente principal de verdad.
- ATLAS debe construir la estrategia usando ORION + NOVA + variables operativas del mes.

FUENTES DE COSMOS:

1. ORION:
Diagnóstico digital, percepción de marca, presencia en redes, contenido, posicionamiento, confianza, comunidad, sitio web, benchmark y madurez digital.

2. NOVA:
Mapa de negocio, oferta real, buyer persona, objeciones, revenue drivers, diferenciadores, temporadas, promociones sugeridas, oportunidades comerciales y restricciones internas.

VARIABLES OPERATIVAS DEL MES:
- Paquete contratado.
- Meta a 90 días.
- Presupuesto mensual de pauta.
- Contexto especial del mes.

JERARQUÍA DE INFORMACIÓN:
- NOVA tiene prioridad sobre ORION para buyer persona, productos, servicios, oferta, ticket, capacidad operativa, objeciones, revenue drivers, diferenciadores, temporadas, promociones y restricciones.
- ORION tiene prioridad para percepción digital, contenido actual, branding, confianza visual, presencia social, posicionamiento y madurez digital.
- Si ORION y NOVA se contradicen, usa NOVA como realidad interna del negocio y ORION como percepción externa.
- La meta a 90 días y el contexto mensual pueden ajustar la estrategia, pero no deben contradecir la realidad de COSMOS.

REGLAS DE ESTRATEGIA:
- No hagas calendarios monotemáticos.
- No mezcles giros comerciales.
- No reutilices ejemplos literalmente.
- Cada concepto debe pertenecer al negocio analizado.
- Cada concepto debe sonar como idea publicable, no como tarea operativa.
- La estrategia debe sentirse comercial, accionable y realista.
- Usa revenue_drivers, customer_objections, buyer_persona, key_offers, main_growth_opportunity y sales_angles de NOVA.
- No inventes buyer personas si NOVA ya los detectó.
- No inventes temporadas si NOVA ya identificó estacionalidad.
- La arquitectura de contenido debe responder directamente a revenue drivers y objeciones.
- Las promociones sugeridas deben ser estratégicas, no depender únicamente de descuentos.

REGLAS DE CALENDARIO:
- El calendario debe contener exactamente 4 semanas.
- Cada semana debe contener Lunes, Martes, Miércoles, Jueves, Viernes, Sábado y Domingo.
- Si no hay publicación, marca "Sin publicación".
- Respeta exactamente las publicaciones, reels y posts del paquete.
- Responde únicamente JSON válido.
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
${JSON.stringify(memory.orion_analysis || {}, null, 2)}

MEMORIA NOVA:
${JSON.stringify(memory.nova_business_map || {}, null, 2)}

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

    await supabase
      .from("cosmos_memory")
      .update({
        atlas_strategy: parsedResult,
        last_agent: "ATLAS",
        updated_at: new Date().toISOString(),
      })
      .eq("id", memory.id);

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