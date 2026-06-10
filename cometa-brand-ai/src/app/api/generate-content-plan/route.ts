import OpenAI from "openai";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getCurrentMonthLabel() {
  const now = new Date();

  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(now);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { brandName, brandAnalysisId } = body;

    if (!brandName && !brandAnalysisId) {
      return NextResponse.json({
        success: false,
        error: "Se requiere brandName o brandAnalysisId.",
      });
    }

    let query = supabase.from("cosmos_memory").select("*");

    if (brandAnalysisId) {
      query = query.eq("brand_analysis_id", brandAnalysisId);
    } else {
      query = query.eq("brand_name", brandName);
    }

    const { data: memory, error: memoryError } = await query
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (memoryError) throw memoryError;

    if (!memory) {
      return NextResponse.json({
        success: false,
        error: "No existe memoria en COSMOS para esta marca.",
      });
    }

    if (!memory.orion_analysis || !memory.nova_business_map || !memory.atlas_strategy) {
      return NextResponse.json({
        success: false,
        error:
          "COSMOS todavía no tiene suficiente información. Ejecuta ORION, NOVA y ATLAS antes de MERCURY.",
      });
    }

    const currentMonth = getCurrentMonthLabel();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.42,
      messages: [
        {
          role: "system",
          content: `
Eres MERCURY, Director de Contenido de Cometa OS.

Tu trabajo NO es hacer estrategia general.
Tu trabajo es convertir la estrategia de ATLAS en un sistema de contenido mensual ejecutable.

Debes leer:
- ORION para entender percepción digital, contenido actual, redes, confianza y estilo visual.
- NOVA para entender oferta, buyer persona, objeciones, temporadas, promociones y revenue drivers.
- ATLAS para respetar frecuencia, paquete, pilares, objetivos, producción y estrategia.

No preguntes nada.
No inventes un nuevo paquete.
No cambies la estrategia de ATLAS.
No generes contenido imposible de producir.
No hagas ideas genéricas.

Responde únicamente JSON válido.
No uses markdown.
          `,
        },
        {
          role: "user",
          content: `
Crea el plan mensual de contenido para la marca.

MES DE TRABAJO:
${currentMonth}

MARCA:
${memory.brand_name}

INDUSTRIA:
${memory.industry || "No especificada"}

CIUDAD:
${memory.city || "No especificada"}

MEMORIA ORION:
${JSON.stringify(memory.orion_analysis, null, 2)}

MEMORIA NOVA:
${JSON.stringify(memory.nova_business_map, null, 2)}

MEMORIA ATLAS:
${JSON.stringify(memory.atlas_strategy, null, 2)}

ESTRUCTURA JSON OBLIGATORIA:

{
  "agent": "MERCURY",
  "month": "",
  "brand_name": "",
  "content_direction": {
    "monthly_theme": "",
    "strategic_focus": "",
    "content_tone": "",
    "visual_direction": "",
    "main_conversion_goal": ""
  },
  "content_rules": {
    "posting_frequency_detected": "",
    "reels_per_week": 0,
    "posts_per_week": 0,
    "stories_recommendation": "",
    "platforms": [],
    "content_should_avoid": []
  },
  "monthly_calendar": [
    {
      "week": 1,
      "week_goal": "",
      "items": [
        {
          "day": "",
          "format": "",
          "platform": "",
          "concept": "",
          "hook": "",
          "creative_brief": "",
          "caption_angle": "",
          "cta": "",
          "pillar": "",
          "business_objective": "",
          "production_notes": ""
        }
      ]
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
          "cta": ""
        }
      ]
    }
  ],
  "reels_pipeline": [
    {
      "title": "",
      "hook": "",
      "script_structure": "",
      "shots_needed": [],
      "editing_notes": "",
      "cta": "",
      "objective": ""
    }
  ],
  "post_pipeline": [
    {
      "title": "",
      "format": "",
      "design_brief": "",
      "copy_angle": "",
      "cta": "",
      "objective": ""
    }
  ],
  "ugc_opportunities": [],
  "promotion_opportunities": [],
  "production_requirements": {
    "photos_needed": [],
    "videos_needed": [],
    "locations_needed": [],
    "people_needed": [],
    "props_needed": [],
    "priority_shots": []
  },
  "copy_bank": {
    "hooks": [],
    "ctas": [],
    "caption_starters": []
  },
  "mercury_recommendation": {
    "what_to_record_first": "",
    "what_to_design_first": "",
    "main_risk": "",
    "quality_control_note": ""
  }
}

REGLAS CRÍTICAS:
- El calendario debe ser para el mes actual indicado.
- Respeta la frecuencia de publicación definida por ATLAS.
- Usa los pilares de contenido de ATLAS.
- Usa objeciones, buyer persona y revenue drivers de NOVA.
- Usa percepción visual y oportunidades de ORION.
- Facebook e Instagram deben considerarse plataformas base.
- TikTok solo debe incluirse si ORION detecta TikTok o si ATLAS lo recomienda.
- No repitas ideas iguales.
- Las ideas deben sonar publicables y ejecutables por una agencia real.
- Si un día no requiere publicación de feed, puede aparecer solo en stories_calendar.
- No agregues texto fuera del JSON.
          `,
        },
      ],
    });

    const rawResult = completion.choices[0].message.content || "{}";

    const cleanedResult = rawResult
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const mercuryContentPlan = JSON.parse(cleanedResult);

    const { error: updateError } = await supabase
      .from("cosmos_memory")
      .update({
        mercury_content_plan: mercuryContentPlan,
        mercury_last_execution: new Date().toISOString(),
        last_agent: "MERCURY",
        updated_at: new Date().toISOString(),
      })
      .eq("id", memory.id);

    if (updateError) throw updateError;

    await supabase.from("cosmos_agent_runs").insert([
      {
        brand_name: memory.brand_name,
        brand_analysis_id: memory.brand_analysis_id || null,
        agent_name: "MERCURY",
        action_type: "content_plan_generation",
        input_data: {
          month: currentMonth,
          memory_id: memory.id,
          brand_name: memory.brand_name,
        },
        output_data: mercuryContentPlan,
        status: "success",
      },
    ]);

    return NextResponse.json({
      success: true,
      contentPlan: mercuryContentPlan,
    });
  } catch (error) {
    console.log("Error generando contenido con MERCURY:", error);

    return NextResponse.json({
      success: false,
      error: "Error generando contenido con MERCURY.",
    });
  }
}