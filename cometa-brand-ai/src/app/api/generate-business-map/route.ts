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

function ensureArray(value: any) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [String(value)];
}

function normalizeDiscoveryData(discoveryData: any) {
  return {
    offers: discoveryData?.offers || "",
    priority_offer: discoveryData?.priority_offer || "",
    average_ticket: discoveryData?.average_ticket || "",
    operational_capacity: discoveryData?.operational_capacity || "",
    real_differentiator: discoveryData?.real_differentiator || "",
    forbidden_topics: Array.isArray(discoveryData?.forbidden_topics)
      ? discoveryData.forbidden_topics
      : [],
    internal_notes: discoveryData?.internal_notes || "",
  };
}

export async function POST(req: Request) {
  console.log("🔥 BUSINESS MEMORY NUEVO EJECUTANDO");
  try {
    const body = await req.json();

    const {
      brandAnalysisId,
      brandName,
      industry,
      city,
      brandAnalysis,
      discoveryData,
    } = body;

    if (!brandAnalysis || !discoveryData || !brandName) {
      return NextResponse.json({
        success: false,
        error: "Faltan datos para generar Business Memory.",
      });
    }

    const cleanDiscoveryData = normalizeDiscoveryData(discoveryData);

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: `
Eres BUSINESS MEMORY AI de COMETA OS.

Tu función es construir la memoria comercial viva del negocio a partir de ORION + Business Discovery.

BUSINESS MEMORY AI NO ES UN ESTRATEGA DE MARKETING.
BUSINESS MEMORY AI NO CREA CALENDARIOS.
BUSINESS MEMORY AI NO CREA CAMPAÑAS.
BUSINESS MEMORY AI NO RECOMIENDA CONTENIDO.
BUSINESS MEMORY AI NO HABLA DE TIKTOK, INSTAGRAM, FACEBOOK, REELS, UGC, INFLUENCERS, ADS O PAUTA COMO RECOMENDACIÓN.

Eso pertenece a ATLAS o STRATEGY AI.

Tu trabajo es entender el negocio, el cliente, la oferta, las objeciones, las oportunidades comerciales, los diferenciadores reales y las señales que otros agentes usarán después.

TU ENFOQUE ES:

- modelo de negocio
- oferta comercial
- cliente ideal
- buyer persona
- tomadores de decisión
- influenciadores de compra
- proceso de compra
- objeciones
- barreras de venta
- aceleradores de venta
- revenue drivers
- oportunidades comerciales
- riesgos operativos/comerciales
- diferenciadores reales
- activos de confianza
- información faltante
- señales que ATLAS debe considerar después

BUSINESS DISCOVERY ES VERDAD PRIORITARIA.

Business Discovery contiene información que la IA no puede saber por redes:
- oferta completa
- producto o servicio prioritario
- ticket promedio
- capacidad operativa
- diferenciador real
- restricciones
- notas internas

Si ORION y Business Discovery se contradicen, prioriza Business Discovery.

REGLAS DE NO INVENCIÓN:

- No inventes métricas exactas.
- No inventes ticket promedio si no fue declarado.
- No inventes capacidad operativa si no fue declarada.
- No inventes márgenes.
- No inventes número de pedidos.
- No inventes temporadas específicas sin lógica comercial.
- No uses "No especificado" como respuesta final.
- Si falta información, dilo en missing_information.
- Si haces una inferencia, explica la lógica en inference_reason o ai_inferences.what_ai_inferred.
- Si falta información importante, baja confidence_level.

REGLAS SOBRE MARKETING Y CONTENIDO:

No debes recomendar:
- UGC
- TikTok
- Reels
- influencers
- contenido viral
- calendarios de contenido
- campañas publicitarias
- estrategia de redes

Puedes mencionar redes sociales solo como señal detectada por ORION, pero no como recomendación principal.

Si detectas necesidades de marketing, colócalas únicamente en:
"atlas_context.relevant_signals_for_strategy"

Ejemplo:
"ORION detectó baja presencia digital, ATLAS deberá considerar esto al construir la estrategia."

REGLAS PARA B2B:

Si el negocio es B2B, corporativo, industrial, manufacturero, hotelero, educativo, médico, legal, inmobiliario o de servicios especializados, prioriza:

- proceso comercial
- confianza
- casos de éxito
- portafolio
- muestras
- demostraciones
- cotización clara
- cumplimiento
- tiempos de entrega
- garantías
- compradores institucionales
- tomadores de decisión
- recompra
- contratos
- pedidos recurrentes

REGLAS PARA B2C:

Si el negocio es B2C, prioriza:

- motivaciones de compra
- experiencia
- ticket
- recompra
- confianza
- diferenciación
- ocasión de consumo
- temporadas
- fricción de compra

Debes sonar como consultor senior de negocio, no como community manager.

Responde únicamente en JSON válido.
No uses markdown.
No agregues texto fuera del JSON.
          `,
        },
        {
          role: "user",
          content: `
Construye Business Memory usando la siguiente información:

DATOS GENERALES:
Nombre de marca: ${brandName}
Industria: ${industry}
Ciudad: ${city || ""}

ORION BRAND AI:
${
  typeof brandAnalysis === "string"
    ? brandAnalysis
    : JSON.stringify(brandAnalysis, null, 2)
}

BUSINESS DISCOVERY:
${JSON.stringify(cleanDiscoveryData, null, 2)}

Estructura exacta del JSON:

{
  "business_summary": "",
  "business_model": "",
  "industry_context": "",
  "commercial_diagnosis": "",
  "target_market": "",

  "declared_business_data": {
    "offers": [],
    "priority_offer": "",
    "average_ticket": "",
    "operational_capacity": "",
    "real_differentiator": "",
    "forbidden_topics": [],
    "internal_notes": ""
  },

  "buyer_persona": {
    "primary_persona": "",
    "secondary_persona": "",
    "needs": [],
    "desires": [],
    "fears": [],
    "purchase_triggers": [],
    "confidence_level": 0,
    "inference_reason": ""
  },

  "decision_makers": [],
  "purchase_influencers": [],
  "purchase_process": [],
  "purchase_criteria": [],

  "key_offers": [],
  "revenue_drivers": [],
  "high_margin_opportunities": [],
  "products_to_push": [],
  "recurring_revenue_opportunities": [],

  "customer_psychology": {
    "main_problem": "",
    "hidden_problem": "",
    "main_desire": "",
    "main_fear": "",
    "emotional_trigger": "",
    "rational_trigger": "",
    "status_trigger": ""
  },

  "customer_objections": [],
  "sales_barriers": [],
  "sales_accelerators": [],

  "trust_assets": [],
  "differentiators": [],
  "proof_needed_to_sell": [],

  "commercial_opportunities": [],
  "quick_wins": [],
  "risks_or_limitations": [],
  "operational_considerations": [],

  "brand_positioning": "",
  "brand_voice": "",

  "sales_channels": [],
  "commercial_journey": {
    "lead_generation": "",
    "qualification": "",
    "proposal": "",
    "closing": "",
    "retention": ""
  },

  "main_growth_opportunity": "",
  "strategic_notes_for_cometa": [],

  "atlas_context": {
    "relevant_signals_for_strategy": [],
    "what_atlas_should_consider": [],
    "what_atlas_should_not_assume": []
  },

  "ai_inferences": {
    "what_ai_detected_from_orion": [],
    "what_client_declared": [],
    "what_ai_inferred": [],
    "missing_information": []
  }
}

Reglas finales:

- Todo debe estar escrito en español.
- Usa lenguaje claro, ejecutivo y consultivo.
- No uses frases genéricas como "activar comunidad" o "generar contenido viral".
- No recomiendes UGC.
- No recomiendes TikTok.
- No recomiendes Instagram.
- No recomiendes campañas.
- No recomiendes calendario de contenido.
- Si algo corresponde a marketing, pásalo a atlas_context.
- Business Memory debe servir como memoria estratégica para los demás agentes, no como estrategia final.
- Los quick_wins deben ser comerciales, operativos o de confianza, no de contenido.
- Las oportunidades deben estar conectadas al modelo de negocio.
- El buyer persona debe ser específico al tipo de venta.
- Si es B2B, separa compradores, influenciadores y usuarios finales.
- confidence_level debe ser de 0 a 100.
- Si falta ticket, capacidad, márgenes, tiempos, volumen de venta o proceso de cierre, agrégalo en missing_information.
          `,
        },
      ],
    });

    const rawResult = completion.choices[0].message.content || "{}";

    const cleanedResult = rawResult
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let businessMemory;

    try {
      businessMemory = JSON.parse(cleanedResult);
    } catch (parseError) {
      console.log("Error parseando Business Memory:", parseError);
      console.log("Respuesta cruda BUSINESS_MEMORY:", cleanedResult);

      return NextResponse.json({
        success: false,
        error: "BUSINESS_MEMORY generó un JSON inválido.",
        rawResult: cleanedResult,
      });
    }

    businessMemory.declared_business_data = {
      ...(businessMemory.declared_business_data || {}),
      offers: ensureArray(businessMemory.declared_business_data?.offers),
      forbidden_topics: ensureArray(
        businessMemory.declared_business_data?.forbidden_topics
      ),
    };

    businessMemory.buyer_persona = businessMemory.buyer_persona || {};
    businessMemory.buyer_persona.needs = ensureArray(
      businessMemory.buyer_persona.needs
    );
    businessMemory.buyer_persona.desires = ensureArray(
      businessMemory.buyer_persona.desires
    );
    businessMemory.buyer_persona.fears = ensureArray(
      businessMemory.buyer_persona.fears
    );
    businessMemory.buyer_persona.purchase_triggers = ensureArray(
      businessMemory.buyer_persona.purchase_triggers
    );

    businessMemory.decision_makers = ensureArray(businessMemory.decision_makers);
    businessMemory.purchase_influencers = ensureArray(
      businessMemory.purchase_influencers
    );
    businessMemory.purchase_process = ensureArray(
      businessMemory.purchase_process
    );
    businessMemory.purchase_criteria = ensureArray(
      businessMemory.purchase_criteria
    );

    businessMemory.key_offers = ensureArray(businessMemory.key_offers);
    businessMemory.revenue_drivers = ensureArray(
      businessMemory.revenue_drivers
    );
    businessMemory.high_margin_opportunities = ensureArray(
      businessMemory.high_margin_opportunities
    );
    businessMemory.products_to_push = ensureArray(
      businessMemory.products_to_push
    );
    businessMemory.recurring_revenue_opportunities = ensureArray(
      businessMemory.recurring_revenue_opportunities
    );

    businessMemory.customer_objections = ensureArray(
      businessMemory.customer_objections
    );
    businessMemory.sales_barriers = ensureArray(
      businessMemory.sales_barriers
    );
    businessMemory.sales_accelerators = ensureArray(
      businessMemory.sales_accelerators
    );

    businessMemory.trust_assets = ensureArray(businessMemory.trust_assets);
    businessMemory.differentiators = ensureArray(
      businessMemory.differentiators
    );
    businessMemory.proof_needed_to_sell = ensureArray(
      businessMemory.proof_needed_to_sell
    );

    businessMemory.commercial_opportunities = ensureArray(
      businessMemory.commercial_opportunities
    );
    businessMemory.quick_wins = ensureArray(businessMemory.quick_wins);
    businessMemory.risks_or_limitations = ensureArray(
      businessMemory.risks_or_limitations
    );
    businessMemory.operational_considerations = ensureArray(
      businessMemory.operational_considerations
    );
    businessMemory.strategic_notes_for_cometa = ensureArray(
      businessMemory.strategic_notes_for_cometa
    );

    businessMemory.atlas_context = businessMemory.atlas_context || {};
    businessMemory.atlas_context.relevant_signals_for_strategy = ensureArray(
      businessMemory.atlas_context.relevant_signals_for_strategy
    );
    businessMemory.atlas_context.what_atlas_should_consider = ensureArray(
      businessMemory.atlas_context.what_atlas_should_consider
    );
    businessMemory.atlas_context.what_atlas_should_not_assume = ensureArray(
      businessMemory.atlas_context.what_atlas_should_not_assume
    );

    businessMemory.ai_inferences = businessMemory.ai_inferences || {};
    businessMemory.ai_inferences.what_ai_detected_from_orion = ensureArray(
      businessMemory.ai_inferences.what_ai_detected_from_orion
    );
    businessMemory.ai_inferences.what_client_declared = ensureArray(
      businessMemory.ai_inferences.what_client_declared
    );
    businessMemory.ai_inferences.what_ai_inferred = ensureArray(
      businessMemory.ai_inferences.what_ai_inferred
    );
    businessMemory.ai_inferences.missing_information = ensureArray(
      businessMemory.ai_inferences.missing_information
    );

    const now = new Date().toISOString();

    const timelineEvent = {
      timestamp: now,
      agent: "BUSINESS_MEMORY",
      action: "generate_business_memory",
      memory_column: "business_memory",
      summary:
        businessMemory?.business_summary ||
        businessMemory?.commercial_diagnosis ||
        null,
    };

    let existingMemory = null;

    if (brandAnalysisId) {
      const { data, error } = await supabase
        .from("cosmos_memory")
        .select("*")
        .eq("brand_analysis_id", brandAnalysisId)
        .maybeSingle();

      if (error) {
        console.log("Error buscando memoria por brandAnalysisId:", error);

        return NextResponse.json({
          success: false,
          error: "Error buscando memoria por brandAnalysisId.",
        });
      }

      existingMemory = data;
    }

    if (!existingMemory) {
      const { data, error } = await supabase
        .from("cosmos_memory")
        .select("*")
        .ilike("brand_name", brandName)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.log("Error buscando memoria por brandName:", error);

        return NextResponse.json({
          success: false,
          error: "Error buscando memoria por brandName.",
        });
      }

      existingMemory = data;
    }

    if (existingMemory) {
      const currentTimeline = Array.isArray(existingMemory.activity_timeline)
        ? existingMemory.activity_timeline
        : [];

      const { error: updateMemoryError } = await supabase
        .from("cosmos_memory")
        .update({
          brand_analysis_id: brandAnalysisId || existingMemory.brand_analysis_id,
          brand_name: brandName,
          industry,
          city,
          business_memory: businessMemory,
          last_agent: "BUSINESS_MEMORY",
          activity_timeline: [...currentTimeline, timelineEvent],
          updated_at: now,
        })
        .eq("id", existingMemory.id);

      if (updateMemoryError) {
        console.log(
          "Error actualizando Business Memory en COSMOS:",
          updateMemoryError
        );

        return NextResponse.json({
          success: false,
          error:
            "BUSINESS_MEMORY generó la memoria, pero no pudo actualizar COSMOS.",
        });
      }
    } else {
      const { error: insertMemoryError } = await supabase
        .from("cosmos_memory")
        .insert([
          {
            brand_analysis_id: brandAnalysisId || null,
            brand_name: brandName,
            industry,
            city,
            business_memory: businessMemory,
            last_agent: "BUSINESS_MEMORY",
            activity_timeline: [timelineEvent],
            status: "active",
          },
        ]);

      if (insertMemoryError) {
        console.log(
          "Error creando Business Memory en COSMOS:",
          insertMemoryError
        );

        return NextResponse.json({
          success: false,
          error:
            "BUSINESS_MEMORY generó la memoria, pero no pudo crear memoria en COSMOS.",
        });
      }
    }

    const { error: runInsertError } = await supabase
      .from("cosmos_agent_runs")
      .insert([
        {
          brand_name: brandName,
          brand_analysis_id: brandAnalysisId || null,
          agent_name: "BUSINESS_MEMORY",
          action_type: "generate_business_memory",
          input_data: {
            brandAnalysisId,
            brandName,
            industry,
            city,
            discoveryData: cleanDiscoveryData,
          },
          output_data: {
            businessMemory,
          },
          status: "success",
        },
      ]);

    if (runInsertError) {
      console.log(
        "Error registrando ejecución BUSINESS_MEMORY:",
        runInsertError
      );
    }

    return NextResponse.json({
      success: true,
      brandAnalysisId,
      businessMemory,
    });
  } catch (error: any) {
    console.log("Error generando Business Memory:", error);

    return NextResponse.json({
      success: false,
      error: error?.message || "Error generando Business Memory.",
      detail: JSON.stringify(error, null, 2),
    });
  }
}