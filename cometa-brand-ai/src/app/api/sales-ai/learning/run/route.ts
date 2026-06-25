import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  buildSalesPlaybookContext,
  getSalesPlaybook,
} from "@/lib/sales-ai/playbook";
import {
  buildSalesKnowledgeContext,
  getSalesKnowledgeBase,
} from "@/lib/sales-ai/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      brandName,
      leadId,
      agentRunId,
      minConfidence = 70,
      maxSuggestions = 5,
    } = body;

    let finalBrandName = String(brandName || "").trim();
    let finalLeadId = leadId || null;
    let finalAgentRunId = agentRunId || null;

    if (!finalBrandName && !finalLeadId && !finalAgentRunId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Debes enviar brandName, leadId o agentRunId",
        },
        { status: 400 }
      );
    }

    const resolved = await resolveContext({
      brandName: finalBrandName,
      leadId: finalLeadId,
      agentRunId: finalAgentRunId,
    });

    finalBrandName = resolved.brandName;
    finalLeadId = resolved.leadId;
    finalAgentRunId = resolved.agentRunId;

    if (!finalBrandName) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo resolver brandName",
        },
        { status: 400 }
      );
    }

    const salesPlaybook = await getSalesPlaybook(finalBrandName);
    const playbookContext = buildSalesPlaybookContext(salesPlaybook);

    const knowledgeBase = await getSalesKnowledgeBase(finalBrandName);
    const knowledgeContext = buildSalesKnowledgeContext(knowledgeBase);

    const conversationContext = await getConversationContext({
      brandName: finalBrandName,
      leadId: finalLeadId,
      agentRunId: finalAgentRunId,
    });

    const systemPrompt = `
Eres SALES AI Learning Engine, el motor de aprendizaje comercial de Cometa OS.

Tu trabajo NO es responderle al cliente.
Tu trabajo es analizar conversaciones reales, decisiones del agente, playbook y Knowledge Base para detectar mejoras.

Debes encontrar oportunidades como:
1. Nuevas objeciones frecuentes.
2. Preguntas frecuentes que deberían agregarse.
3. Reglas comerciales faltantes.
4. Información que el agente necesitó pero no tenía.
5. Errores o riesgos en la respuesta del agente.
6. Nuevas oportunidades de oferta.
7. Reglas de escalación necesarias.
8. Promesas que deberían prohibirse.
9. Seguimientos que podrían mejorar.
10. Datos que el negocio debe cargar para vender mejor.

IMPORTANTE:
- No inventes aprendizajes si no hay señal suficiente.
- No sugieras cosas obvias si ya existen en el playbook o Knowledge Base.
- No modifiques nada directamente.
- Solo genera sugerencias para aprobación humana.
- Cada sugerencia debe ser accionable.
- Si no hay nada útil que aprender, devuelve suggestions: [].

TIPOS PERMITIDOS:
- objection
- faq
- business_rule
- catalog_item
- escalation_rule
- forbidden_promise
- followup
- offer
- general

ESTADOS:
Todas las sugerencias nuevas deben quedar como pending.

Responde exclusivamente JSON válido con esta estructura:

{
  "summary": "string",
  "should_create_suggestions": boolean,
  "suggestions": [
    {
      "suggestion_type": "objection | faq | business_rule | catalog_item | escalation_rule | forbidden_promise | followup | offer | general",
      "title": "string",
      "current_value": "string | null",
      "suggested_value": "string",
      "reason": "string",
      "confidence_score": 0,
      "metadata": {
        "evidence": "string",
        "detected_intent": "string",
        "risk_level": "low | medium | high",
        "where_to_apply": "playbook | knowledge_base | catalog | faq | rules"
      }
    }
  ]
}
`;

    const userPrompt = `
MARCA:
${finalBrandName}

PLAYBOOK ACTUAL:
${playbookContext}

KNOWLEDGE BASE ACTUAL:
${knowledgeContext}

CONTEXTO DE CONVERSACIÓN / DECISIONES:
${JSON.stringify(conversationContext, null, 2)}

Instrucciones:
Analiza si esta conversación deja algún aprendizaje útil para mejorar SALES AI.
No repitas lo que ya está cargado.
No inventes datos de precios, stock, envíos o políticas.
Genera máximo ${maxSuggestions} sugerencias.
Solo genera sugerencias con confianza real.
Devuelve únicamente JSON válido.
`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = safeJsonParse(raw);

    if (!parsed) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo convertir la respuesta del Learning Engine a JSON",
          raw,
        },
        { status: 500 }
      );
    }

    const normalizedSuggestions = normalizeSuggestions(
      parsed.suggestions,
      Number(minConfidence || 70),
      Number(maxSuggestions || 5)
    );

    const insertedSuggestions = [];

    for (const suggestion of normalizedSuggestions) {
      const alreadyExists = await suggestionAlreadyExists({
        brandName: finalBrandName,
        title: suggestion.title,
        suggestedValue: suggestion.suggested_value,
      });

      if (alreadyExists) {
        continue;
      }

      const { data, error } = await supabase
        .from("sales_playbook_suggestions")
        .insert({
          brand_name: finalBrandName,
          source_lead_id: finalLeadId || null,
          source_agent_run_id: finalAgentRunId || null,
          suggestion_type: suggestion.suggestion_type,
          title: suggestion.title,
          current_value: suggestion.current_value || null,
          suggested_value: suggestion.suggested_value,
          reason: suggestion.reason || null,
          confidence_score: suggestion.confidence_score || 0,
          status: "pending",
          metadata: suggestion.metadata || {},
        })
        .select("*")
        .single();

      if (error) {
        console.error("Error guardando sugerencia:", error.message);
        continue;
      }

      insertedSuggestions.push(data);
    }

    return NextResponse.json({
      ok: true,
      brandName: finalBrandName,
      leadId: finalLeadId,
      agentRunId: finalAgentRunId,
      summary:
        parsed.summary ||
        "Learning Engine analizó la conversación y el contexto comercial.",
      shouldCreateSuggestions: insertedSuggestions.length > 0,
      generatedCount: normalizedSuggestions.length,
      insertedCount: insertedSuggestions.length,
      skippedDuplicates:
        normalizedSuggestions.length - insertedSuggestions.length,
      suggestions: insertedSuggestions,
      rawLearning: parsed,
    });
  } catch (error: any) {
    console.error("SALES AI Learning Engine error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno en SALES AI Learning Engine",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

async function resolveContext({
  brandName,
  leadId,
  agentRunId,
}: {
  brandName?: string | null;
  leadId?: string | null;
  agentRunId?: string | null;
}) {
  let finalBrandName = String(brandName || "").trim();
  let finalLeadId = leadId || null;
  let finalAgentRunId = agentRunId || null;

  if (finalAgentRunId) {
    const { data: run } = await supabase
      .from("sales_agent_runs")
      .select("id, brand_name, lead_id")
      .eq("id", finalAgentRunId)
      .maybeSingle();

    if (run) {
      finalBrandName = finalBrandName || run.brand_name;
      finalLeadId = finalLeadId || run.lead_id;
      finalAgentRunId = run.id;
    }
  }

  if (!finalAgentRunId && finalLeadId) {
    const { data: run } = await supabase
      .from("sales_agent_runs")
      .select("id, brand_name, lead_id")
      .eq("lead_id", finalLeadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (run) {
      finalBrandName = finalBrandName || run.brand_name;
      finalLeadId = finalLeadId || run.lead_id;
      finalAgentRunId = run.id;
    }
  }

  if (!finalAgentRunId && finalBrandName) {
    const { data: run } = await supabase
      .from("sales_agent_runs")
      .select("id, brand_name, lead_id")
      .eq("brand_name", finalBrandName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (run) {
      finalBrandName = finalBrandName || run.brand_name;
      finalLeadId = finalLeadId || run.lead_id;
      finalAgentRunId = run.id;
    }
  }

  return {
    brandName: finalBrandName,
    leadId: finalLeadId,
    agentRunId: finalAgentRunId,
  };
}

async function getConversationContext({
  brandName,
  leadId,
  agentRunId,
}: {
  brandName: string;
  leadId?: string | null;
  agentRunId?: string | null;
}) {
  const { data: selectedRun } = agentRunId
    ? await supabase
        .from("sales_agent_runs")
        .select("*")
        .eq("id", agentRunId)
        .maybeSingle()
    : { data: null };

  const runsQuery = supabase
    .from("sales_agent_runs")
    .select(
      "id, brand_name, lead_id, agent_mode, action, action_status, incoming_message, agent_reply, decision_reason, lead_stage, requires_human, confidence_score, raw_data, created_at"
    )
    .eq("brand_name", brandName)
    .order("created_at", { ascending: false })
    .limit(10);

  const messagesQuery = supabase
    .from("sales_messages")
    .select(
      "id, lead_id, brand_name, direction, sender_type, contact_phone, message_text, status, created_at"
    )
    .eq("brand_name", brandName)
    .order("created_at", { ascending: false })
    .limit(20);

  if (leadId) {
    runsQuery.eq("lead_id", leadId);
    messagesQuery.eq("lead_id", leadId);
  }

  const [{ data: runs, error: runsError }, { data: messages, error }] =
    await Promise.all([runsQuery, messagesQuery]);

  if (runsError) {
    console.error("Error leyendo runs para learning:", runsError.message);
  }

  if (error) {
    console.error("Error leyendo messages para learning:", error.message);
  }

  return {
    selected_run: selectedRun || null,
    recent_runs: runs || [],
    recent_messages: messages || [],
  };
}

function normalizeSuggestions(
  suggestions: any,
  minConfidence: number,
  maxSuggestions: number
) {
  if (!Array.isArray(suggestions)) return [];

  const allowedTypes = [
    "objection",
    "faq",
    "business_rule",
    "catalog_item",
    "escalation_rule",
    "forbidden_promise",
    "followup",
    "offer",
    "general",
  ];

  return suggestions
    .map((item: any) => {
      const suggestionType = allowedTypes.includes(item?.suggestion_type)
        ? item.suggestion_type
        : "general";

      return {
        suggestion_type: suggestionType,
        title: cleanText(item?.title),
        current_value: cleanText(item?.current_value),
        suggested_value: cleanText(item?.suggested_value),
        reason: cleanText(item?.reason),
        confidence_score: clampNumber(item?.confidence_score, 0, 100),
        metadata: item?.metadata && typeof item.metadata === "object"
          ? item.metadata
          : {},
      };
    })
    .filter((item: any) => {
      return (
        item.title &&
        item.suggested_value &&
        item.confidence_score >= minConfidence
      );
    })
    .slice(0, maxSuggestions);
}

async function suggestionAlreadyExists({
  brandName,
  title,
  suggestedValue,
}: {
  brandName: string;
  title: string;
  suggestedValue: string;
}) {
  const { data } = await supabase
    .from("sales_playbook_suggestions")
    .select("id")
    .eq("brand_name", brandName)
    .eq("title", title)
    .eq("suggested_value", suggestedValue)
    .in("status", ["pending", "approved", "applied"])
    .limit(1)
    .maybeSingle();

  return Boolean(data?.id);
}

function cleanText(value: any) {
  if (value === null || value === undefined) return "";

  return String(value).trim();
}

function clampNumber(value: any, min: number, max: number) {
  const num = Number(value || 0);

  if (Number.isNaN(num)) return min;

  return Math.max(min, Math.min(max, num));
}