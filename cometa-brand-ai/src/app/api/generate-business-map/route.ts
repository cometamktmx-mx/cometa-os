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

    if (!brandAnalysis || !discoveryData) {
      return NextResponse.json({
        success: false,
        error: "Faltan datos para generar Business Map.",
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
Eres NOVA, Business Intelligence AI de COMETA OS.

Tu función es convertir la información de ORION Brand AI + Business Discovery en una radiografía comercial profunda del negocio.

NOVA NO ES UN ESTRATEGA DE MARKETING.
NOVA NO CREA CALENDARIOS.
NOVA NO CREA CAMPAÑAS.
NOVA NO RECOMIENDA CONTENIDO.
NOVA NO HABLA DE TIKTOK, INSTAGRAM, FACEBOOK, REELS, UGC, INFLUENCERS, ADS O PAUTA.

Eso pertenece a ATLAS.

NOVA construye la línea base estratégica que ATLAS usará después.

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

NOVA no debe recomendar:
- UGC
- TikTok
- Reels
- influencers
- contenido viral
- calendarios de contenido
- campañas publicitarias
- estrategia de redes

NOVA puede mencionar redes sociales solo como señal detectada por ORION, pero no como recomendación principal.

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

NOVA debe sonar como consultor senior de negocio, no como community manager.

Responde únicamente en JSON válido.
No uses markdown.
No agregues texto fuera del JSON.
          `,
        },
        {
          role: "user",
          content: `
Construye un Business Map definitivo usando la siguiente información:

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
- El Business Map debe servir como insumo estratégico para ATLAS, no como estrategia final.
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

    let businessMap;

    try {
      businessMap = JSON.parse(cleanedResult);
    } catch (parseError) {
      console.log("Error parseando Business Map:", parseError);
      console.log("Respuesta cruda NOVA:", cleanedResult);

      return NextResponse.json({
        success: false,
        error: "NOVA generó un JSON inválido.",
        rawResult: cleanedResult,
      });
    }

    businessMap.declared_business_data = {
      ...(businessMap.declared_business_data || {}),
      offers: ensureArray(businessMap.declared_business_data?.offers),
      forbidden_topics: ensureArray(
        businessMap.declared_business_data?.forbidden_topics
      ),
    };

    businessMap.buyer_persona = businessMap.buyer_persona || {};
    businessMap.buyer_persona.needs = ensureArray(
      businessMap.buyer_persona.needs
    );
    businessMap.buyer_persona.desires = ensureArray(
      businessMap.buyer_persona.desires
    );
    businessMap.buyer_persona.fears = ensureArray(
      businessMap.buyer_persona.fears
    );
    businessMap.buyer_persona.purchase_triggers = ensureArray(
      businessMap.buyer_persona.purchase_triggers
    );

    businessMap.decision_makers = ensureArray(businessMap.decision_makers);
    businessMap.purchase_influencers = ensureArray(
      businessMap.purchase_influencers
    );
    businessMap.purchase_process = ensureArray(businessMap.purchase_process);
    businessMap.purchase_criteria = ensureArray(businessMap.purchase_criteria);

    businessMap.key_offers = ensureArray(businessMap.key_offers);
    businessMap.revenue_drivers = ensureArray(businessMap.revenue_drivers);
    businessMap.high_margin_opportunities = ensureArray(
      businessMap.high_margin_opportunities
    );
    businessMap.products_to_push = ensureArray(businessMap.products_to_push);
    businessMap.recurring_revenue_opportunities = ensureArray(
      businessMap.recurring_revenue_opportunities
    );

    businessMap.customer_objections = ensureArray(
      businessMap.customer_objections
    );
    businessMap.sales_barriers = ensureArray(businessMap.sales_barriers);
    businessMap.sales_accelerators = ensureArray(
      businessMap.sales_accelerators
    );

    businessMap.trust_assets = ensureArray(businessMap.trust_assets);
    businessMap.differentiators = ensureArray(businessMap.differentiators);
    businessMap.proof_needed_to_sell = ensureArray(
      businessMap.proof_needed_to_sell
    );

    businessMap.commercial_opportunities = ensureArray(
      businessMap.commercial_opportunities
    );
    businessMap.quick_wins = ensureArray(businessMap.quick_wins);
    businessMap.risks_or_limitations = ensureArray(
      businessMap.risks_or_limitations
    );
    businessMap.operational_considerations = ensureArray(
      businessMap.operational_considerations
    );
    businessMap.strategic_notes_for_cometa = ensureArray(
      businessMap.strategic_notes_for_cometa
    );

    businessMap.atlas_context = businessMap.atlas_context || {};
    businessMap.atlas_context.relevant_signals_for_strategy = ensureArray(
      businessMap.atlas_context.relevant_signals_for_strategy
    );
    businessMap.atlas_context.what_atlas_should_consider = ensureArray(
      businessMap.atlas_context.what_atlas_should_consider
    );
    businessMap.atlas_context.what_atlas_should_not_assume = ensureArray(
      businessMap.atlas_context.what_atlas_should_not_assume
    );

    businessMap.ai_inferences = businessMap.ai_inferences || {};
    businessMap.ai_inferences.what_ai_detected_from_orion = ensureArray(
      businessMap.ai_inferences.what_ai_detected_from_orion
    );
    businessMap.ai_inferences.what_client_declared = ensureArray(
      businessMap.ai_inferences.what_client_declared
    );
    businessMap.ai_inferences.what_ai_inferred = ensureArray(
      businessMap.ai_inferences.what_ai_inferred
    );
    businessMap.ai_inferences.missing_information = ensureArray(
      businessMap.ai_inferences.missing_information
    );

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
        .eq("brand_name", brandName)
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
      const { error: updateMemoryError } = await supabase
        .from("cosmos_memory")
        .update({
          brand_analysis_id: brandAnalysisId || existingMemory.brand_analysis_id,
          brand_name: brandName,
          industry,
          city,
          nova_business_map: businessMap,
          last_agent: "NOVA",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingMemory.id);

      if (updateMemoryError) {
        console.log(
          "Error actualizando memoria NOVA en COSMOS:",
          updateMemoryError
        );

        return NextResponse.json({
          success: false,
          error: "NOVA generó el Business Map, pero no pudo actualizar COSMOS.",
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
            nova_business_map: businessMap,
            last_agent: "NOVA",
            status: "active",
          },
        ]);

      if (insertMemoryError) {
        console.log("Error creando memoria NOVA en COSMOS:", insertMemoryError);

        return NextResponse.json({
          success: false,
          error:
            "NOVA generó el Business Map, pero no pudo crear memoria en COSMOS.",
        });
      }
    }

    const { error: runInsertError } = await supabase
      .from("cosmos_agent_runs")
      .insert([
        {
          brand_name: brandName,
          brand_analysis_id: brandAnalysisId || null,
          agent_name: "NOVA",
          action_type: "business_map",
          input_data: {
            brandAnalysisId,
            brandName,
            industry,
            city,
            discoveryData: cleanDiscoveryData,
          },
          output_data: {
            businessMap,
          },
          status: "success",
        },
      ]);

    if (runInsertError) {
      console.log("Error registrando ejecución NOVA:", runInsertError);
    }

    return NextResponse.json({
      success: true,
      brandAnalysisId,
      businessMap,
    });
  } catch (error: any) {
    console.log("Error generando Business Map:", error);

    return NextResponse.json({
      success: false,
      error: error?.message || "Error generando Business Map.",
      detail: JSON.stringify(error, null, 2),
    });
  }
}