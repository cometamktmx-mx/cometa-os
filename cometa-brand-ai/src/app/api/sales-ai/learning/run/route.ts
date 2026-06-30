import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { slugifyBrand } from "@/lib/brand-resolver";
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
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type UserRole = "admin" | "client";

type UserContext = {
  userId: string | null;
  email: string | null;
  role: UserRole;
  allowedBrandSlugs: string[];
  isInternalRequest: boolean;
};

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

function parseCsv(value?: string | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isCometaAdmin(user: { id?: string; email?: string | null } | null) {
  if (!user) return false;

  const adminEmails = parseCsv(process.env.COMETA_ADMIN_EMAILS);
  const adminUserIds = parseCsv(process.env.COMETA_ADMIN_USER_IDS);

  const userEmail = String(user.email || "").trim().toLowerCase();
  const userId = String(user.id || "").trim().toLowerCase();

  if (!adminEmails.length && !adminUserIds.length) {
    return false;
  }

  return adminEmails.includes(userEmail) || adminUserIds.includes(userId);
}

function isInternalRequest(req: Request) {
  const expectedSecret = String(process.env.SALES_AI_INTERNAL_SECRET || "").trim();

  if (!expectedSecret) return false;

  const receivedSecret =
    req.headers.get("x-cometa-internal-secret") ||
    req.headers.get("x-sales-ai-internal-secret") ||
    "";

  return receivedSecret === expectedSecret;
}

async function getUserContext(req: Request): Promise<UserContext> {
  if (isInternalRequest(req)) {
    return {
      userId: "internal-sales-ai",
      email: "internal@cometaos.local",
      role: "admin",
      allowedBrandSlugs: [],
      isInternalRequest: true,
    };
  }

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
        } catch {}
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
      isInternalRequest: false,
    };
  }

  if (isCometaAdmin(user)) {
    return {
      userId: user.id,
      email: user.email || null,
      role: "admin",
      allowedBrandSlugs: [],
      isInternalRequest: false,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id,email,role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("learning-run profile error:", profileError.message);
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
      isInternalRequest: false,
    };
  }

  const { data: accessRows, error: accessError } = await supabase
    .from("user_brand_access")
    .select("brand_slug,status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (accessError) {
    console.warn("learning-run access error:", accessError.message);
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
    isInternalRequest: false,
  };
}

function safeText(value: unknown, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function clampNumber(value: unknown, min: number, max: number, fallback = min) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return fallback;

  return Math.max(min, Math.min(max, numberValue));
}

async function validateResolvedContext({
  brandName,
  leadId,
  agentRunId,
}: {
  brandName: string;
  leadId?: string | null;
  agentRunId?: string | null;
}) {
  if (agentRunId) {
    const { data, error } = await supabase
      .from("sales_agent_runs")
      .select("id,brand_name,lead_id")
      .eq("id", agentRunId)
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        error: "No se encontró el agentRunId indicado.",
      };
    }

    if (String(data.brand_name || "").trim() !== brandName) {
      return {
        ok: false,
        error: "El agentRunId no pertenece a la marca indicada.",
      };
    }
  }

  if (leadId) {
    const { data, error } = await supabase
      .from("sales_leads")
      .select("id,brand_name")
      .eq("id", leadId)
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        error: "No se encontró el leadId indicado.",
      };
    }

    if (String(data.brand_name || "").trim() !== brandName) {
      return {
        ok: false,
        error: "El leadId no pertenece a la marca indicada.",
      };
    }
  }

  return {
    ok: true,
    error: null,
  };
}

export async function POST(req: Request) {
  try {
    const userContext = await getUserContext(req);

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para ejecutar Learning Engine.",
        },
        { status: 401 }
      );
    }

    /**
     * Este motor es interno:
     * - Cometa admin puede correrlo manualmente.
     * - agent-run puede correrlo con SALES_AI_INTERNAL_SECRET.
     * - Cliente normal NO debe dispararlo directamente.
     */
    if (userContext.role !== "admin") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Forbidden. Learning Engine es un proceso interno de Cometa OS.",
        },
        { status: 403 }
      );
    }

    const body = await req.json();

    const {
      brandName,
      leadId,
      agentRunId,
      minConfidence = 70,
      maxSuggestions = 5,
    } = body;

    let finalBrandName = safeText(brandName, 180);
    let finalLeadId = safeText(leadId, 120) || null;
    let finalAgentRunId = safeText(agentRunId, 120) || null;

    const safeMinConfidence = clampNumber(minConfidence, 0, 100, 70);
    const safeMaxSuggestions = clampNumber(maxSuggestions, 1, 10, 5);

    if (!finalBrandName && !finalLeadId && !finalAgentRunId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Debes enviar brandName, leadId o agentRunId.",
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
          error: "No se pudo resolver brandName.",
        },
        { status: 400 }
      );
    }

    const contextValidation = await validateResolvedContext({
      brandName: finalBrandName,
      leadId: finalLeadId,
      agentRunId: finalAgentRunId,
    });

    if (!contextValidation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: contextValidation.error,
        },
        { status: 403 }
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
Genera máximo ${safeMaxSuggestions} sugerencias.
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
      safeMinConfidence,
      safeMaxSuggestions
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
          metadata: {
            ...(suggestion.metadata || {}),
            learning_summary:
              parsed.summary ||
              "Learning Engine analizó la conversación y el contexto comercial.",
            requested_by: {
              user_id: userContext.userId,
              email: userContext.email,
              role: userContext.role,
              is_internal_request: userContext.isInternalRequest,
            },
          },
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
      protected: true,
      user: {
        id: userContext.userId,
        email: userContext.email,
        role: userContext.role,
        isAdmin: userContext.role === "admin",
        isInternalRequest: userContext.isInternalRequest,
      },
      brandName: finalBrandName,
      brandSlug: slugifyBrand(finalBrandName),
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
  let finalBrandName = safeText(brandName, 180);
  let finalLeadId = safeText(leadId, 120) || null;
  let finalAgentRunId = safeText(agentRunId, 120) || null;

  if (finalAgentRunId) {
    const { data: run } = await supabase
      .from("sales_agent_runs")
      .select("id, brand_name, lead_id")
      .eq("id", finalAgentRunId)
      .maybeSingle();

    if (run) {
      finalBrandName = String(run.brand_name || finalBrandName || "").trim();
      finalLeadId = String(run.lead_id || finalLeadId || "").trim() || null;
      finalAgentRunId = run.id;
    }
  }

  if (!finalBrandName && finalLeadId) {
    const { data: lead } = await supabase
      .from("sales_leads")
      .select("id, brand_name")
      .eq("id", finalLeadId)
      .maybeSingle();

    if (lead) {
      finalBrandName = String(lead.brand_name || "").trim();
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
      finalBrandName = String(run.brand_name || finalBrandName || "").trim();
      finalLeadId = String(run.lead_id || finalLeadId || "").trim() || null;
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
      finalBrandName = String(run.brand_name || finalBrandName || "").trim();
      finalLeadId = String(run.lead_id || finalLeadId || "").trim() || null;
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
        .eq("brand_name", brandName)
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
        title: cleanText(item?.title, 300),
        current_value: cleanText(item?.current_value, 2000),
        suggested_value: cleanText(item?.suggested_value, 3000),
        reason: cleanText(item?.reason, 2000),
        confidence_score: clampNumber(item?.confidence_score, 0, 100, 0),
        metadata:
          item?.metadata && typeof item.metadata === "object"
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

function cleanText(value: any, maxLength = 4000) {
  if (value === null || value === undefined) return "";

  return String(value).trim().slice(0, maxLength);
}