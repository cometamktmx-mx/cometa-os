import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getCurrentMonthLabel() {
  const now = new Date();

  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(now);
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

function getAtlasStrategy(memory: any) {
  return (
    memory?.growth_memory ||
    memory?.atlas_strategy ||
    memory?.strategy_memory ||
    null
  );
}

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

function detectPackageName(atlasStrategy: any, requestedPackageName?: string) {
  return (
    requestedPackageName ||
    atlasStrategy?.package_execution_limits?.management_package ||
    atlasStrategy?._cometa_meta?.package_name ||
    "Growth"
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
      console.warn("MERCURY findCosmosMemory brand_slug error:", error.message);
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
      console.warn("MERCURY findCosmosMemory exact brand_name error:", error.message);
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
      console.warn(
        "MERCURY findCosmosMemory formatted brand_name error:",
        error.message
      );
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
      console.warn("MERCURY findCosmosMemory fuzzy brand_name error:", error.message);
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

    throw new Error("MERCURY no devolvió JSON válido.");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      brandName,
      brandAnalysisId,
      packageName: requestedPackageName,
      monthLabel,
      monthlyContext = "",
      campaignFocus = "",
    } = body;

    if (!brandName && !brandAnalysisId) {
      return NextResponse.json({
        success: false,
        error: "Se requiere brandName o brandAnalysisId.",
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
          "No existe memoria en COSMOS para esta marca. Ejecuta ORION, NOVA y ATLAS antes de MERCURY.",
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
    const atlasStrategy = getAtlasStrategy(memory);

    if (!orionMemory || !businessMemory || !atlasStrategy) {
      return NextResponse.json({
        success: false,
        error:
          "COSMOS todavía no tiene suficiente información. Ejecuta ORION, NOVA y ATLAS antes de MERCURY.",
        debug: {
          cosmosMemoryId: memory.id,
          brandName: memory.brand_name,
          brandSlug: memory.brand_slug,
          hasOrionMemory: Boolean(orionMemory),
          hasBusinessMemory: Boolean(businessMemory),
          hasAtlasStrategy: Boolean(atlasStrategy),
          availableKeys: Object.keys(memory || {}),
        },
      });
    }

    const currentMonth = monthLabel || getCurrentMonthLabel();
    const finalBrandName =
      memory.brand_name || formatBrandName(brandName || "Marca sin nombre");

    const packageName = detectPackageName(atlasStrategy, requestedPackageName);
    const packageRules = getPackageRules(packageName);

    const systemPrompt = `
MERCURY CONTENT STRATEGY + CALENDAR ENGINE V1 — COMETA OS

Eres MERCURY, el agente de estrategia de contenido y calendario de Cometa OS.

MERCURY NO ES:
- ATLAS
- ORION
- NOVA
- SALES AI
- generador de ideas virales sin estrategia
- community manager genérico
- redactor improvisado
- diseñador visual
- ejecutivo de pauta

MERCURY SÍ ES:
- director mensual de contenido
- traductor de estrategia de ATLAS a comunicación
- creador de estrategia de contenido mensual
- diseñador de campañas de contenido
- generador de calendario ejecutable
- creador de briefs para producción
- organizador de reels, posts, stories, CTAs y líneas creativas
- puente entre estrategia y ejecución

ARQUITECTURA:
- ORION muestra percepción externa: redes, contenido actual, confianza visual, oportunidades, competencia y evidencia.
- NOVA / Business Map muestra realidad interna: oferta, buyer persona, objeciones, proceso de compra, diferenciadores, ticket, revenue drivers y restricciones.
- ATLAS define estrategia de crecimiento: cuello de botella, hipótesis, prioridad, riesgo, directivas para contenido, SALES AI y Calendar Engine.
- MERCURY convierte ATLAS en contenido mensual y calendario.
- SALES AI maneja conversaciones, leads, objeciones, seguimiento y cierre en WhatsApp.

REGLA CENTRAL:
ATLAS decide qué debe crecer.
MERCURY decide cómo comunicarlo.
Calendar Engine organiza cuándo y cómo publicarlo.
SALES AI convierte conversaciones en ventas.

REGLAS DE MERCURY:
- No cambies la estrategia de ATLAS.
- No inventes nuevo buyer persona; usa NOVA / Business Memory.
- No inventes nuevas ofertas si NOVA no las declaró.
- No inventes métricas exactas.
- No hagas ideas genéricas.
- No hagas calendario imposible de producir.
- No uses "viral" como criterio.
- Cada pieza debe tener una razón comercial.
- Cada pieza debe conectar con confianza, conversión, objeción, oferta, diferenciador, posicionamiento, comunidad o venta.
- Si ATLAS detecta problema en WhatsApp, el contenido debe alimentar mejores conversaciones, no reemplazar SALES AI.
- Si falta información, conviértela en nota de producción o riesgo, no la inventes.
- Facebook e Instagram son plataformas base.
- TikTok solo se incluye si ORION detecta TikTok, ATLAS lo recomienda o el contexto del cliente lo justifica claramente.
- El calendario debe respetar paquete, frecuencia, recursos y capacidad.

CALIDAD ESPERADA:
El resultado debe sentirse como un calendario profesional de agencia:
- ideas específicas
- conceptos publicables
- hooks usables
- briefs claros para grabación/diseño
- CTAs concretos
- intención comercial
- variedad por semana
- no repetir formatos sin razón
- no llenar por llenar

RESPUESTA:
- Responde únicamente JSON válido.
- No uses markdown.
- No agregues texto fuera del JSON.
`;

    const userPrompt = `
Crea la estrategia de contenido mensual y calendario ejecutable para esta marca usando COSMOS.

MES DE TRABAJO:
${currentMonth}

MARCA:
${finalBrandName}

INDUSTRIA:
${memory.industry || "No especificada"}

CIUDAD:
${memory.city || "No especificada"}

CONTEXTO ESPECIAL DEL MES:
${monthlyContext || "Sin contexto adicional declarado"}

ENFOQUE DE CAMPAÑA SOLICITADO:
${campaignFocus || "Sin enfoque adicional declarado"}

PAQUETE / REGLAS OPERATIVAS:
Paquete: ${packageName}
${JSON.stringify(packageRules, null, 2)}

MEMORIA ORION:
${JSON.stringify(orionMemory, null, 2)}

MEMORIA NOVA / BUSINESS MAP:
${JSON.stringify(businessMemory, null, 2)}

ESTRATEGIA ATLAS / GROWTH MEMORY:
${JSON.stringify(atlasStrategy, null, 2)}

INSTRUCCIÓN CRÍTICA:

MERCURY debe crear un plan de contenido del mes que respete ATLAS.
No debe cambiar la estrategia.
No debe crear buyer persona.
No debe actuar como SALES AI.
Debe convertir estrategia en comunicación, calendario y producción.

Debe usar:
- directivas de contenido de ATLAS si existen.
- calendar_engine_directives de ATLAS si existen.
- sales_ai_directives de ATLAS para crear contenido que alimente mejores conversaciones.
- buyer persona, objeciones y revenue drivers de NOVA.
- percepción visual y oportunidades de ORION.
- límites operativos del paquete.

ESTRUCTURA JSON OBLIGATORIA:

{
  "agent": "MERCURY",
  "version": "mercury_content_strategy_calendar_v1",
  "month": "",
  "brand_name": "",

  "source_alignment": {
    "orion_used_for": ["", "", ""],
    "nova_used_for": ["", "", ""],
    "atlas_used_for": ["", "", ""],
    "strategy_locked_from_atlas": "",
    "what_mercury_must_not_change": ["", "", ""]
  },

  "content_strategy": {
    "monthly_theme": "",
    "strategic_focus": "",
    "content_tone": "",
    "visual_direction": "",
    "main_conversion_goal": "",
    "audience_emotion_to_activate": "",
    "main_message_of_the_month": "",
    "content_positioning": ""
  },

  "content_rules": {
    "posting_frequency_detected": "",
    "posting_days_per_week": 0,
    "reels_per_week": 0,
    "posts_per_week": 0,
    "stories_recommendation": "",
    "platforms": ["Facebook", "Instagram"],
    "tiktok_rule": "",
    "content_should_avoid": ["", "", ""],
    "production_limits": ["", "", ""]
  },

  "pillar_mix": [
    {
      "pillar": "",
      "percentage": 0,
      "strategic_role": "",
      "business_reason": "",
      "example_angles": ["", "", ""]
    }
  ],

  "monthly_campaign_concept": {
    "campaign_name": "",
    "campaign_idea": "",
    "why_it_fits_strategy": "",
    "main_hook": "",
    "visual_universe": "",
    "conversion_path": ""
  },

  "monthly_calendar": [
    {
      "week": 1,
      "week_goal": "",
      "week_message": "",
      "items": [
        {
          "day": "Lunes",
          "publish_status": "",
          "format": "",
          "platform": "",
          "concept": "",
          "hook": "",
          "creative_brief": "",
          "caption_angle": "",
          "cta": "",
          "pillar": "",
          "business_objective": "",
          "sales_ai_connection": "",
          "production_notes": "",
          "approval_status": "draft"
        },
        {
          "day": "Martes",
          "publish_status": "",
          "format": "",
          "platform": "",
          "concept": "",
          "hook": "",
          "creative_brief": "",
          "caption_angle": "",
          "cta": "",
          "pillar": "",
          "business_objective": "",
          "sales_ai_connection": "",
          "production_notes": "",
          "approval_status": "draft"
        },
        {
          "day": "Miércoles",
          "publish_status": "",
          "format": "",
          "platform": "",
          "concept": "",
          "hook": "",
          "creative_brief": "",
          "caption_angle": "",
          "cta": "",
          "pillar": "",
          "business_objective": "",
          "sales_ai_connection": "",
          "production_notes": "",
          "approval_status": "draft"
        },
        {
          "day": "Jueves",
          "publish_status": "",
          "format": "",
          "platform": "",
          "concept": "",
          "hook": "",
          "creative_brief": "",
          "caption_angle": "",
          "cta": "",
          "pillar": "",
          "business_objective": "",
          "sales_ai_connection": "",
          "production_notes": "",
          "approval_status": "draft"
        },
        {
          "day": "Viernes",
          "publish_status": "",
          "format": "",
          "platform": "",
          "concept": "",
          "hook": "",
          "creative_brief": "",
          "caption_angle": "",
          "cta": "",
          "pillar": "",
          "business_objective": "",
          "sales_ai_connection": "",
          "production_notes": "",
          "approval_status": "draft"
        },
        {
          "day": "Sábado",
          "publish_status": "",
          "format": "",
          "platform": "",
          "concept": "",
          "hook": "",
          "creative_brief": "",
          "caption_angle": "",
          "cta": "",
          "pillar": "",
          "business_objective": "",
          "sales_ai_connection": "",
          "production_notes": "",
          "approval_status": "draft"
        },
        {
          "day": "Domingo",
          "publish_status": "",
          "format": "",
          "platform": "",
          "concept": "",
          "hook": "",
          "creative_brief": "",
          "caption_angle": "",
          "cta": "",
          "pillar": "",
          "business_objective": "",
          "sales_ai_connection": "",
          "production_notes": "",
          "approval_status": "draft"
        }
      ]
    },
    {
      "week": 2,
      "week_goal": "",
      "week_message": "",
      "items": []
    },
    {
      "week": 3,
      "week_goal": "",
      "week_message": "",
      "items": []
    },
    {
      "week": 4,
      "week_goal": "",
      "week_message": "",
      "items": []
    }
  ],

  "stories_calendar": [
    {
      "week": 1,
      "items": [
        {
          "day": "",
          "story_type": "",
          "idea": "",
          "interaction": "",
          "cta": "",
          "business_reason": ""
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

  "reels_pipeline": [
    {
      "title": "",
      "hook": "",
      "script_structure": "",
      "shots_needed": ["", "", ""],
      "editing_notes": "",
      "cta": "",
      "objective": "",
      "pillar": "",
      "sales_ai_connection": ""
    }
  ],

  "post_pipeline": [
    {
      "title": "",
      "format": "",
      "design_brief": "",
      "copy_angle": "",
      "cta": "",
      "objective": "",
      "pillar": ""
    }
  ],

  "production_plan": {
    "recording_priority": ["", "", ""],
    "photos_needed": ["", "", ""],
    "videos_needed": ["", "", ""],
    "locations_needed": ["", "", ""],
    "people_needed": ["", "", ""],
    "props_needed": ["", "", ""],
    "priority_shots": ["", "", ""],
    "client_material_needed": ["", "", ""]
  },

  "copy_bank": {
    "hooks": ["", "", "", "", ""],
    "ctas": ["", "", "", "", ""],
    "caption_starters": ["", "", "", "", ""],
    "story_prompts": ["", "", "", "", ""]
  },

  "sales_alignment": {
    "what_content_should_make_people_ask": ["", "", ""],
    "questions_sales_ai_should_expect": ["", "", ""],
    "objections_content_should_prehandle": ["", "", ""],
    "recommended_whatsapp_entry_points": ["", "", ""]
  },

  "quality_control": {
    "review_before_publishing": ["", "", ""],
    "risk_of_generic_content": "",
    "brand_consistency_notes": "",
    "approval_rule": "Cometa debe revisar antes de publicar."
  },

  "mercury_recommendation": {
    "what_to_record_first": "",
    "what_to_design_first": "",
    "main_risk": "",
    "quality_control_note": "",
    "next_cycle_learning": ""
  }
}

REGLAS CRÍTICAS:
- monthly_calendar debe contener exactamente 4 semanas.
- Cada semana debe contener exactamente 7 días.
- En días sin publicación de feed usa:
  publish_status: "Sin publicación de feed"
  format: "Sin publicación"
  platform: "No aplica"
  concept: "Sin publicación programada"
  hook: "No aplica"
  creative_brief: "No se publica contenido de feed este día."
  caption_angle: "No aplica"
  cta: "No aplica"
  pillar: "No aplica"
  business_objective: "Descanso operativo / soporte con stories si aplica"
  sales_ai_connection: "No aplica"
  production_notes: "Sin producción"
- Cada semana debe respetar posting_days_per_week, reels_per_week y posts_per_week del paquete o de ATLAS.
- Los porcentajes de pillar_mix deben sumar 100.
- No repitas la misma idea con diferente título.
- Cada reel debe tener hook, estructura y shots_needed.
- Cada post debe tener design_brief y copy_angle.
- Cada contenido debe tener objetivo comercial.
- No agregues texto fuera del JSON.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.34,
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
    const mercuryContentPlan = safeJsonParse(rawResult);

    mercuryContentPlan._cometa_meta = {
      agent: "MERCURY",
      version: "mercury_content_strategy_calendar_v1",
      generated_at: new Date().toISOString(),
      month: currentMonth,
      brand_name: finalBrandName,
      brand_analysis_id: memory.brand_analysis_id || brandAnalysisId || null,
      source_memory_id: memory.id,
      depends_on: ["ORION", "NOVA / BUSINESS_MEMORY", "ATLAS / GROWTH_MEMORY"],
      role:
        "MERCURY translates ATLAS growth strategy into monthly content strategy and executable calendar.",
      requires_cometa_approval: true,
      client_visible_only_after_publish: true,
    };

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("cosmos_memory")
      .update({
        mercury_content_plan: mercuryContentPlan,
        mercury_last_execution: now,
        last_agent: "MERCURY",
        updated_at: now,
      })
      .eq("id", memory.id);

    if (updateError) {
      console.log("Error guardando MERCURY en COSMOS:", updateError);

      return NextResponse.json({
        success: false,
        error: "MERCURY generó el calendario, pero no pudo guardar en COSMOS.",
      });
    }

    const { error: runLogError } = await supabase.from("cosmos_agent_runs").insert([
      {
        brand_name: finalBrandName,
        brand_analysis_id: memory.brand_analysis_id || brandAnalysisId || null,
        agent_name: "MERCURY",
        action_type: "content_strategy_calendar_generation_v1",
        input_data: {
          month: currentMonth,
          memory_id: memory.id,
          brand_name: finalBrandName,
          requestedBrandName: brandName || null,
          brandAnalysisId: brandAnalysisId || null,
          packageName,
          monthlyContext,
          campaignFocus,
        },
        output_data: mercuryContentPlan,
        status: "success",
      },
    ]);

    if (runLogError) {
      console.warn("MERCURY run log error:", runLogError.message);
    }

    return NextResponse.json({
      success: true,
      contentPlan: mercuryContentPlan,
    });
  } catch (error: any) {
    console.log("Error generando contenido con MERCURY:", error);

    return NextResponse.json({
      success: false,
      error: error?.message || "Error generando contenido con MERCURY.",
    });
  }
}