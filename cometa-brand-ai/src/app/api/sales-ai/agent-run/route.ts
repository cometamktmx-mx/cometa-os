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
import {
  canCreateSalesAiFollowups,
  canSendRealWhatsapp,
  explainWhatsappSendLock,
  getSalesAiRuntimeSettings,
  resolveSalesAiAgentMode,
} from "@/lib/sales-ai-runtime-settings";

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
    console.warn("agent-run profile error:", profileError.message);
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
    console.warn("agent-run access error:", accessError.message);
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

function validateBrandAccess({
  userContext,
  brandName,
  brandSlug,
}: {
  userContext: UserContext;
  brandName: string;
  brandSlug?: string | null;
}) {
  const normalizedBrandSlug = slugifyBrand(brandSlug || brandName);

  if (userContext.role === "admin") {
    return {
      ok: true,
      error: null,
      brandSlug: normalizedBrandSlug,
    };
  }

  if (userContext.allowedBrandSlugs.includes(normalizedBrandSlug)) {
    return {
      ok: true,
      error: null,
      brandSlug: normalizedBrandSlug,
    };
  }

  return {
    ok: false,
    error:
      "No tienes permiso para ejecutar SALES AI sobre esta marca. Esta marca no está asignada a tu usuario.",
    brandSlug: normalizedBrandSlug,
  };
}

function safeText(value: unknown, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizePhone(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[^\d+]/g, "")
    .slice(0, 40);
}

function buildForwardHeaders(req: Request) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const cookieHeader = req.headers.get("cookie");

  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  if (process.env.SALES_AI_INTERNAL_SECRET) {
    headers["x-cometa-internal-secret"] = process.env.SALES_AI_INTERNAL_SECRET;
  }

  return headers;
}

function getSafeRuntimeSnapshot(runtimeSettings: any) {
  return {
    brand_name: runtimeSettings.brand_name,
    agent_mode: runtimeSettings.agent_mode,
    whatsapp_status: runtimeSettings.whatsapp_status,
    auto_reply_enabled: runtimeSettings.auto_reply_enabled,
    send_whatsapp_enabled: runtimeSettings.send_whatsapp_enabled,
    followups_enabled: runtimeSettings.followups_enabled,
    human_escalation_enabled: runtimeSettings.human_escalation_enabled,
    max_followups: runtimeSettings.max_followups,
    first_followup_delay_minutes:
      runtimeSettings.first_followup_delay_minutes,
  };
}

async function getClientAgentConfiguration(brandName: string) {
  try {
    const { data, error } = await supabase
      .from("sales_ai_settings")
      .select(
        "brand_name,response_rules,business_hours,client_agent_preferences,followups_enabled,human_escalation_enabled,max_followups,first_followup_delay_minutes"
      )
      .eq("brand_name", brandName)
      .maybeSingle();

    if (error) {
      console.warn("getClientAgentConfiguration error:", error.message);
      return null;
    }

    return data || null;
  } catch (error: any) {
    console.warn("getClientAgentConfiguration exception:", error?.message);
    return null;
  }
}

function buildClientAgentConfigurationContext(config: any) {
  if (!config) {
    return `
CONFIGURACIÓN DEL CLIENTE:
No hay configuración personalizada guardada todavía.
Usa Knowledge Base, Playbook y contexto disponible.
`;
  }

  const preferences = config.client_agent_preferences || {};
  const responseRules = config.response_rules || {};
  const businessHours = config.business_hours || {};

  return `
CONFIGURACIÓN PERSONALIZADA DEL CLIENTE:
Esta información fue escrita por el cliente desde Cometa OS. Úsala para adaptar tus respuestas.

NEGOCIO:
- Industria: ${preferences.industry || "No especificada"}
- Objetivo principal: ${preferences.primary_goal || "No especificado"}
- Estilo de respuesta: ${preferences.response_style || "No especificado"}
- Tono deseado: ${preferences.tone || responseRules.tone || "profesional, claro y vendedor"}

DESCRIPCIÓN DEL NEGOCIO:
${preferences.business_summary || "No especificada"}

PRODUCTOS / SERVICIOS PRINCIPALES:
${preferences.products_services || "No especificados"}

PREGUNTAS OBLIGATORIAS PARA CALIFICAR:
${preferences.required_questions || "No especificadas"}

COSAS QUE EL AGENTE NO PUEDE PROMETER:
${preferences.forbidden_promises || "No especificadas"}

CASOS ESPECIALES PARA ESCALAR A HUMANO:
${preferences.escalation_notes || "No especificados"}

REGLAS DE RESPUESTA:
- No prometer sin confirmar: ${responseRules.avoid_promising_without_confirmation !== false}
- Hacer una pregunta a la vez: ${responseRules.ask_one_question_at_a_time !== false}
- Intentar calificar antes de vender: ${responseRules.always_try_to_qualify !== false}
- No aplicar descuentos sin permiso: ${responseRules.never_apply_discounts_without_permission !== false}

SEGUIMIENTOS:
- Follow-ups activados: ${config.followups_enabled !== false}
- Máximo de follow-ups: ${config.max_followups ?? 3}
- Primer follow-up después de minutos: ${config.first_followup_delay_minutes ?? 1440}

ESCALAMIENTO:
- Escalamiento humano activado: ${config.human_escalation_enabled !== false}

HORARIO:
${JSON.stringify(businessHours, null, 2)}

INSTRUCCIÓN:
Prioriza esta configuración cuando respondas. Si el cliente escribió productos, servicios, reglas o preguntas obligatorias, úsalas antes de responder de forma genérica.
`;
}

function buildFallbackFollowUpMessage({
  decision,
}: {
  decision: any;
}) {
  const action = String(decision?.action || "");
  const stage = String(decision?.lead_stage || "");

  if (!["send_reply", "schedule_followup"].includes(action)) {
    return null;
  }

  if (decision?.requires_human === true) {
    return null;
  }

  if (isTerminalOrHumanStage(stage)) {
    return null;
  }

  const missingInfo = Array.isArray(decision?.detected_missing_info)
    ? decision.detected_missing_info
        .map((item: any) => String(item || "").trim())
        .find(Boolean)
    : "";

  if (missingInfo) {
    return `Hola, solo para dar seguimiento. ¿Me puedes compartir ${missingInfo} para orientarte mejor?`;
  }

  return "Hola, solo para dar seguimiento. ¿Te gustaría que avancemos con más información o prefieres que te ayude a resolver alguna duda específica?";
}

async function validateLeadBelongsToBrand(leadId: string, brandName: string) {
  try {
    const { data, error } = await supabase
      .from("sales_leads")
      .select("id,brand_name")
      .eq("id", leadId)
      .maybeSingle();

    if (error) {
      console.warn("validateLeadBelongsToBrand error:", error.message);
      return true;
    }

    if (!data) return true;

    return String(data.brand_name || "").trim() === String(brandName || "").trim();
  } catch (error: any) {
    console.warn("validateLeadBelongsToBrand exception:", error?.message);
    return true;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      brandName,
      brandSlug,
      leadId,
      contactName,
      contactPhone,
      contactUsername,
      incomingMessage,
      conversationText,
      source = "whatsapp",
      campaignName,
      adName,
      agentMode,
    } = body;

    const finalBrandName = safeText(brandName, 180);
    const finalBrandSlug = safeText(brandSlug, 180);
    const finalContactName = safeText(contactName || "Prospecto", 180);
    const finalContactPhone = normalizePhone(contactPhone || "");
    const finalContactUsername = safeText(contactUsername || "", 180);
    const finalIncomingMessage = safeText(incomingMessage || "", 6000);
    const finalSource = safeText(source || "whatsapp", 80) || "whatsapp";
    const requestedAgentMode = safeText(
      agentMode || process.env.SALES_AI_AGENT_MODE || "observation",
      40
    );

    if (!finalBrandName || (!finalIncomingMessage && !conversationText)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Faltan campos obligatorios: brandName y incomingMessage o conversationText",
        },
        { status: 400 }
      );
    }

    const userContext = await getUserContext(req);

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para ejecutar SALES AI.",
        },
        { status: 401 }
      );
    }

    const accessValidation = validateBrandAccess({
      userContext,
      brandName: finalBrandName,
      brandSlug: finalBrandSlug,
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
            name: finalBrandName,
            slug: accessValidation.brandSlug,
          },
        },
        { status: 403 }
      );
    }

    const runtimeSettings = await getSalesAiRuntimeSettings(finalBrandName);

    const realWhatsappAllowedBySettings = canSendRealWhatsapp(runtimeSettings);
    const realWhatsappLockReasons = explainWhatsappSendLock(runtimeSettings);

    /**
     * Seguridad:
     * No aceptamos agentMode desde el body para activar automático.
     * El modo real sale de sales_ai_settings.
     * Además, las simulaciones siempre quedan en observation.
     */
    const finalAgentMode =
      finalSource === "whatsapp_simulation"
        ? "observation"
        : resolveSalesAiAgentMode(runtimeSettings, "observation");

    const followupsAllowedBySettings =
      canCreateSalesAiFollowups(runtimeSettings);

    const finalConversationText = safeText(
      conversationText || `Cliente: ${finalIncomingMessage}`,
      12000
    );

    const salesPlaybook = await getSalesPlaybook(finalBrandName);
    const salesPlaybookContext = buildSalesPlaybookContext(salesPlaybook);

    const knowledgeBase = await getSalesKnowledgeBase(finalBrandName);
    const salesKnowledgeContext = buildSalesKnowledgeContext(knowledgeBase);

    const clientAgentConfiguration =
  await getClientAgentConfiguration(finalBrandName);

const clientAgentConfigurationContext =
  buildClientAgentConfigurationContext(clientAgentConfiguration);

    console.log("SALES AI playbook cargado:", {
      brandName: salesPlaybook.brandName,
      playbookId: salesPlaybook.id,
      questions: salesPlaybook.qualificationQuestions.length,
      offers: salesPlaybook.priorityOffers.length,
      objections: salesPlaybook.objectionHandlers.length,
      canDoAlone: salesPlaybook.canDoAlone.length,
      shouldNotDo: salesPlaybook.shouldNotDo.length,
      escalationRules: salesPlaybook.escalationRules.length,
    });

    console.log("SALES AI Knowledge Base cargada:", {
      brandName: knowledgeBase.brandName,
      knowledgeSources: knowledgeBase.knowledgeSources.length,
      catalogItems: knowledgeBase.catalogItems.length,
      businessRules: knowledgeBase.businessRules.length,
      faqs: knowledgeBase.faqs.length,
      suggestions: knowledgeBase.suggestions.length,
    });

    console.log("SALES AI configuración cliente cargada:", {
  brandName: finalBrandName,
  hasClientConfiguration: Boolean(clientAgentConfiguration),
  preferences:
    clientAgentConfiguration?.client_agent_preferences || null,
  responseRules: clientAgentConfiguration?.response_rules || null,
});

    console.log("SALES AI runtime settings:", {
      brandName: finalBrandName,
      brandSlug: accessValidation.brandSlug,
      requestedAgentMode,
      finalAgentMode,
      followupsAllowedBySettings,
      realWhatsappAllowedBySettings,
      realWhatsappLockReasons,
      requestedBy: {
        userId: userContext.userId,
        email: userContext.email,
        role: userContext.role,
        isInternalRequest: userContext.isInternalRequest,
      },
      runtimeSettings: getSafeRuntimeSnapshot(runtimeSettings),
    });

    const analysisRes = await fetch(
      `${getBaseUrl(req)}/api/sales-ai/analyze-lead`,
      {
        method: "POST",
        headers: buildForwardHeaders(req),
        body: JSON.stringify({
          brandName: finalBrandName,
          brandSlug: accessValidation.brandSlug,
          leadId,
          contactName: finalContactName,
          contactPhone: finalContactPhone,
          contactUsername: finalContactUsername,
          conversationText: finalConversationText,
          source: finalSource,
          campaignName,
          adName,
        }),
      }
    );

    const analysisData = await analysisRes.json();

    if (!analysisRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Error en analyze-lead",
          details: analysisData,
        },
        { status: 500 }
      );
    }

    const finalLeadId = analysisData.leadId;
    const analysis = analysisData.analysis;

    if (finalLeadId) {
      const leadBelongsToBrand = await validateLeadBelongsToBrand(
        finalLeadId,
        finalBrandName
      );

      if (!leadBelongsToBrand) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "El lead generado o solicitado no pertenece a la marca indicada.",
          },
          { status: 403 }
        );
      }
    }

    const recentContext = await getRecentContext(finalLeadId);

    const systemPrompt = `
Eres SALES AI, el agente comercial 24/7 de Cometa OS.

Tu trabajo NO es sonar como chatbot.
Tu trabajo es actuar como un vendedor digital real: entender, calificar, responder, guiar la venta y preparar el siguiente paso.

OBJETIVO PRINCIPAL:
1. Entender qué quiere el prospecto.
2. Usar el conocimiento real de la marca.
3. Calificar solo lo que haga falta.
4. Recomendar productos, servicios, lotes, paquetes o rutas de compra cuando haya información suficiente.
5. Hacer una respuesta útil, corta y lista para WhatsApp.
6. No inventar precios, stock, promociones, tiempos, garantías ni condiciones.
7. Escalar a humano solo cuando sea necesario.

JERARQUÍA DE INFORMACIÓN:
1. Reglas comerciales y restricciones de Knowledge Base.
2. Catálogo, precios, FAQs y políticas cargadas en Knowledge Base.
3. Playbook comercial de la marca.
4. Historial reciente del lead.
5. Análisis previo del lead.
6. Razonamiento comercial general.

Si hay conflicto entre Knowledge Base y Playbook, gana Knowledge Base.
Si falta información crítica, pregunta de forma concreta.
Si no hay información suficiente del negocio, no respondas genérico: haz una pregunta comercial inteligente para avanzar.

${salesKnowledgeContext}

${salesPlaybookContext}

${clientAgentConfigurationContext}

ESTILO DE RESPUESTA PARA WHATSAPP:
- Escribe como una persona de ventas real.
- Máximo 2 a 4 frases.
- Sin párrafos largos.
- Sin sonar robótico.
- Sin explicar que eres IA.
- Sin decir "estoy aquí para ayudarte" como frase genérica.
- Evita respuestas tipo: "¿Qué tipo de productos o servicios te interesan?" salvo que realmente no haya contexto.
- Haz una sola pregunta principal por mensaje.
- Si el cliente saluda con "hola", responde cálido y avanza rápido con una pregunta útil.
- Si el cliente pregunta precio, pide el dato mínimo necesario para cotizar si no hay precio exacto autorizado.
- Si hay catálogo o precios autorizados, usa esa información.
- Si el cliente muestra intención de compra, reduce preguntas y acerca al cierre.
- Si hay mayoreo/menudeo, pregunta si busca mayoreo o menudeo solo cuando sea relevante.
- Si hay ciudad/envío, pregunta ciudad solo si afecta cotización, cobertura o envío.
- Si el cliente ya dio un dato, no lo vuelvas a pedir.

REGLAS DE SEGURIDAD:
- No confirmes pagos.
- No prometas stock exacto si no aparece confirmado.
- No prometas envío mismo día si no hay regla autorizada.
- No inventes descuentos.
- No cierres pedidos si requieren validación humana.
- No pidas muchos datos al mismo tiempo.
- No escales a humano por defecto.

CUÁNDO ESCALAR A HUMANO:
- El cliente quiere pagar o enviar comprobante.
- El cliente pide descuento especial.
- El cliente solicita stock exacto no confirmado.
- El cliente hace una queja o reclamo.
- El cliente pide factura, garantía, devolución o tema legal.
- La Knowledge Base marca requires_human_confirmation.
- Responder implicaría inventar información.

MODO DEL AGENTE:
- observation: genera decisión y respuesta recomendada, pero no envía.
- supervised: genera una respuesta lista para aprobación humana. should_send_now debe ser false.
- automatic: puede marcar should_send_now=true solo si la respuesta es segura, action=send_reply, no requiere humano y la configuración lo permite.
- paused: solo registra decisión. No debe enviar ni programar acciones automáticas.

CONFIGURACIÓN ACTUAL:
- agent_mode: ${runtimeSettings.agent_mode}
- resolved_agent_mode: ${finalAgentMode}
- whatsapp_status: ${runtimeSettings.whatsapp_status}
- auto_reply_enabled: ${runtimeSettings.auto_reply_enabled}
- send_whatsapp_enabled: ${runtimeSettings.send_whatsapp_enabled}
- followups_enabled: ${runtimeSettings.followups_enabled}
- human_escalation_enabled: ${runtimeSettings.human_escalation_enabled}
- max_followups: ${runtimeSettings.max_followups}
- first_followup_delay_minutes: ${runtimeSettings.first_followup_delay_minutes}
- real_whatsapp_allowed_by_settings: ${realWhatsappAllowedBySettings}
- real_whatsapp_lock_reasons: ${realWhatsappLockReasons.join(", ") || "none"}

CRITERIOS DE DECISIÓN:
- action debe ser "send_reply" si conviene responder ahora.
- action debe ser "schedule_followup" si el cliente dijo que lo revisa, no responde o necesita seguimiento.
- action debe ser "escalate_to_human" solo si hay bloqueo real.
- requires_human debe ser false salvo que exista una regla clara para escalar.
- confidence_score debe ir de 0 a 100.
- follow_up_delay_minutes debe ser 0 si no aplica.
- detected_missing_info debe listar solo datos realmente necesarios.
- decision_reason debe explicar qué dato, regla, FAQ, playbook o contexto usaste.

IMPORTANTE:
Aunque el modo sea observation o supervised, sí debes generar agent_reply cuando la mejor acción sea responder.
La diferencia es que should_send_now debe ser false salvo en automatic.

Devuelve EXCLUSIVAMENTE JSON válido con esta estructura:

{
  "action": "send_reply | wait | schedule_followup | escalate_to_human | mark_unqualified | mark_lost",
  "lead_stage": "new | qualifying | waiting_response | followup_scheduled | hot | human_required | closed | lost | unqualified",
  "should_send_now": false,
  "agent_reply": "string | null",
  "follow_up_message": "string | null",
  "follow_up_delay_minutes": 0,
  "requires_human": false,
  "confidence_score": 0,
  "decision_reason": "string",
  "next_action": "string",
  "risk_level": "low | medium | high",
  "detected_missing_info": ["string"],
  "memory_learning": "string"
}
`;

    const userPrompt = `
MARCA:
${finalBrandName}

MODO ACTUAL DEL AGENTE:
${finalAgentMode}

CANAL:
${finalSource}

PROSPECTO:
- Nombre: ${finalContactName}
- Teléfono: ${finalContactPhone || "No disponible"}
- Usuario: ${finalContactUsername || "No disponible"}

ANÁLISIS PREVIO DEL LEAD:
${JSON.stringify(analysis || {}, null, 2)}

CONTEXTO RECIENTE GUARDADO:
${JSON.stringify(recentContext || {}, null, 2)}

MENSAJE / CONVERSACIÓN RECIBIDA:
"""
${finalConversationText}
"""

TAREA:
Decide qué debe hacer SALES AI como vendedor digital.

Prioridad:
1. Responder útil y concreto.
2. Usar Knowledge Base, catálogo, FAQs y reglas si existen.
3. Si falta información, preguntar solo lo más importante.
4. Evitar respuestas genéricas.
5. No inventar datos.
6. No escalar si puedes avanzar con una pregunta segura.
7. Si el modo es supervised, prepara una respuesta lista para que una persona la apruebe.

La respuesta agent_reply debe sentirse lista para enviarse por WhatsApp.
Devuelve únicamente JSON válido.
`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const rawDecision = completion.choices[0]?.message?.content || "{}";
    const decision = safeJsonParse(rawDecision);

    if (!decision) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo convertir la decisión del agente a JSON",
          raw: rawDecision,
        },
        { status: 500 }
      );
    }

    const normalizedDecision = normalizeDecision(decision, finalAgentMode);

const fallbackFollowUpMessage = buildFallbackFollowUpMessage({
  decision: normalizedDecision,
});

const plannedFollowUpMessage =
  normalizedDecision.follow_up_message || fallbackFollowUpMessage;

const shouldPlanFollowUpCandidate =
  followupsAllowedBySettings &&
  finalAgentMode !== "paused" &&
  Boolean(plannedFollowUpMessage) &&
  normalizedDecision.requires_human !== true &&
  ["send_reply", "schedule_followup"].includes(normalizedDecision.action) &&
  !isTerminalOrHumanStage(normalizedDecision.lead_stage);

const effectiveFollowUpDelayMinutes = shouldPlanFollowUpCandidate
  ? clampNumber(
      normalizedDecision.follow_up_delay_minutes ||
        runtimeSettings.first_followup_delay_minutes ||
        1440,
      1,
      10080
    )
  : 0;

normalizedDecision.follow_up_message = shouldPlanFollowUpCandidate
  ? plannedFollowUpMessage
  : normalizedDecision.follow_up_message;

normalizedDecision.follow_up_delay_minutes = effectiveFollowUpDelayMinutes;

const nextFollowUpAt = shouldPlanFollowUpCandidate
  ? getNextFollowUpAt(effectiveFollowUpDelayMinutes)
  : null;

    const canPrepareRealSend =
      finalAgentMode === "automatic" &&
      realWhatsappAllowedBySettings &&
      normalizedDecision.should_send_now &&
      normalizedDecision.action === "send_reply" &&
      normalizedDecision.requires_human !== true;

    const actionStatus =
      finalAgentMode === "paused"
        ? "paused_logged"
        : canPrepareRealSend
        ? "ready_to_execute"
        : finalAgentMode === "supervised" &&
          normalizedDecision.action === "send_reply" &&
          Boolean(normalizedDecision.agent_reply)
        ? "ready_for_approval"
        : finalAgentMode === "supervised" &&
          normalizedDecision.action === "escalate_to_human"
        ? "human_review_required"
        : followupsAllowedBySettings &&
          normalizedDecision.action === "schedule_followup" &&
          Boolean(nextFollowUpAt)
        ? "followup_scheduled"
        : finalAgentMode === "automatic"
        ? "automatic_logged"
        : "observation_logged";

    const { data: run, error: runError } = await supabase
      .from("sales_agent_runs")
      .insert({
        lead_id: finalLeadId,
        brand_name: finalBrandName,
        agent_mode: finalAgentMode,
        action: normalizedDecision.action,
        action_status: actionStatus,
        incoming_message: finalIncomingMessage || finalConversationText,
        agent_reply: normalizedDecision.agent_reply || null,
        decision_reason: normalizedDecision.decision_reason || null,
        lead_stage: normalizedDecision.lead_stage || null,
        requires_human: normalizedDecision.requires_human || false,
        next_follow_up_at: nextFollowUpAt,
        confidence_score: normalizedDecision.confidence_score || 0,
        analysis_snapshot: analysis || {},
        raw_data: {
          requested_by: {
            user_id: userContext.userId,
            email: userContext.email,
            role: userContext.role,
            is_internal_request: userContext.isInternalRequest,
          },
          brand_access: {
            brand_name: finalBrandName,
            brand_slug: accessValidation.brandSlug,
          },
          agent_decision: normalizedDecision,
          real_whatsapp: {
            allowed_by_settings: realWhatsappAllowedBySettings,
            lock_reasons: realWhatsappLockReasons,
          },
          runtime_settings: getSafeRuntimeSnapshot(runtimeSettings),
          playbook: {
            id: salesPlaybook.id,
            brandName: salesPlaybook.brandName,
            questions: salesPlaybook.qualificationQuestions,
            offers: salesPlaybook.priorityOffers,
            objections: salesPlaybook.objectionHandlers,
            escalationRules: salesPlaybook.escalationRules,
          },
          client_agent_configuration: clientAgentConfiguration
  ? {
      response_rules: clientAgentConfiguration.response_rules || {},
      client_agent_preferences:
        clientAgentConfiguration.client_agent_preferences || {},
      business_hours: clientAgentConfiguration.business_hours || {},
      followups_enabled: clientAgentConfiguration.followups_enabled,
      human_escalation_enabled:
        clientAgentConfiguration.human_escalation_enabled,
      max_followups: clientAgentConfiguration.max_followups,
      first_followup_delay_minutes:
        clientAgentConfiguration.first_followup_delay_minutes,
    }
  : null,
          knowledge_base: {
            brandName: knowledgeBase.brandName,
            counts: {
              knowledgeSources: knowledgeBase.knowledgeSources.length,
              catalogItems: knowledgeBase.catalogItems.length,
              businessRules: knowledgeBase.businessRules.length,
              faqs: knowledgeBase.faqs.length,
              suggestions: knowledgeBase.suggestions.length,
            },
            catalogItems: knowledgeBase.catalogItems.map((item: any) => ({
              id: item.id,
              name: item.name,
              item_type: item.item_type,
              price_text: item.price_text,
              availability_status: item.availability_status,
              requires_human_confirmation: item.requires_human_confirmation,
            })),
            businessRules: knowledgeBase.businessRules.map((rule: any) => ({
              id: rule.id,
              rule_type: rule.rule_type,
              rule_name: rule.rule_name,
              requires_human_confirmation: rule.requires_human_confirmation,
            })),
            faqs: knowledgeBase.faqs.map((faq: any) => ({
              id: faq.id,
              question: faq.question,
              intent: faq.intent,
              requires_human_confirmation: faq.requires_human_confirmation,
            })),
          },
        },
      })
      .select("id")
      .single();

    if (runError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Error guardando sales_agent_runs",
          details: runError.message,
        },
        { status: 500 }
      );
    }

    const { error: leadUpdateError } = await supabase
      .from("sales_leads")
      .update({
        agent_stage: normalizedDecision.lead_stage || "new",
        agent_mode: finalAgentMode,
        requires_human: normalizedDecision.requires_human || false,
        last_agent_action: normalizedDecision.action,
        last_agent_reason: normalizedDecision.decision_reason || null,
        recommended_reply:
          normalizedDecision.agent_reply || analysis?.recommended_reply || null,
        next_action:
          normalizedDecision.next_action || analysis?.next_action || null,
        next_follow_up_at: nextFollowUpAt,
        raw_data: {
          ...(analysis || {}),
          requested_by: {
            user_id: userContext.userId,
            email: userContext.email,
            role: userContext.role,
            is_internal_request: userContext.isInternalRequest,
          },
          brand_access: {
            brand_name: finalBrandName,
            brand_slug: accessValidation.brandSlug,
          },
          agent_decision: normalizedDecision,
          real_whatsapp: {
            allowed_by_settings: realWhatsappAllowedBySettings,
            lock_reasons: realWhatsappLockReasons,
          },
          runtime_settings: {
            agent_mode: runtimeSettings.agent_mode,
            whatsapp_status: runtimeSettings.whatsapp_status,
            auto_reply_enabled: runtimeSettings.auto_reply_enabled,
            send_whatsapp_enabled: runtimeSettings.send_whatsapp_enabled,
            followups_enabled: runtimeSettings.followups_enabled,
            max_followups: runtimeSettings.max_followups,
          },
          client_agent_configuration: clientAgentConfiguration
  ? {
      response_rules: clientAgentConfiguration.response_rules || {},
      client_agent_preferences:
        clientAgentConfiguration.client_agent_preferences || {},
      business_hours: clientAgentConfiguration.business_hours || {},
    }
  : null,
          playbook_id: salesPlaybook.id || null,
          knowledge_base_counts: {
            knowledgeSources: knowledgeBase.knowledgeSources.length,
            catalogItems: knowledgeBase.catalogItems.length,
            businessRules: knowledgeBase.businessRules.length,
            faqs: knowledgeBase.faqs.length,
            suggestions: knowledgeBase.suggestions.length,
          },
        },
      })
      .eq("id", finalLeadId);

    if (leadUpdateError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Error actualizando sales_leads",
          details: leadUpdateError.message,
        },
        { status: 500 }
      );
    }

    const existingFollowupsCount = await getExistingFollowupCount(finalLeadId);
const existingPendingFollowupsCount =
  await getExistingPendingFollowupCount(finalLeadId);

const maxFollowups = Number(runtimeSettings.max_followups || 3);

const shouldCreateFollowUp =
  followupsAllowedBySettings &&
  finalAgentMode !== "paused" &&
  existingFollowupsCount < maxFollowups &&
  existingPendingFollowupsCount === 0 &&
  Boolean(normalizedDecision.follow_up_message) &&
  Boolean(nextFollowUpAt) &&
  normalizedDecision.requires_human !== true &&
  !isTerminalOrHumanStage(normalizedDecision.lead_stage);

    if (shouldCreateFollowUp) {
      const { error: followupError } = await supabase
        .from("sales_followups")
        .insert({
          lead_id: finalLeadId,
          followup_number: existingFollowupsCount + 1,
          scheduled_at: nextFollowUpAt,
          status: "pending",
          message_text: normalizedDecision.follow_up_message,
        });

      if (followupError) {
        console.error("Error creando sales_followups:", followupError.message);
      }
    } else if (normalizedDecision.follow_up_message) {
      console.log("SALES AI follow-up bloqueado o no creado:", {
        brandName: finalBrandName,
        followupsAllowedBySettings,
        finalAgentMode,
        existingFollowupsCount,
        maxFollowups,
        nextFollowUpAt,
        requiresHuman: normalizedDecision.requires_human,
        leadStage: normalizedDecision.lead_stage,
      });
    }

    await triggerLearningEngine(req, {
      brandName: finalBrandName,
      leadId: finalLeadId,
      agentRunId: run.id,
    });

    return NextResponse.json({
      success: true,
      ok: true,
      user: {
        id: userContext.userId,
        email: userContext.email,
        role: userContext.role,
        isAdmin: userContext.role === "admin",
        isInternalRequest: userContext.isInternalRequest,
      },
      brand: {
        name: finalBrandName,
        slug: accessValidation.brandSlug,
      },
      leadId: finalLeadId,
      runId: run.id,
      agentMode: finalAgentMode,
      requestedAgentMode,
      actionStatus,
      shouldSendWhatsapp: canPrepareRealSend,
      realWhatsappAllowedBySettings,
      realWhatsappLockReasons,
      followups: {
  allowed: followupsAllowedBySettings,
  created: shouldCreateFollowUp,
  existingFollowupsCount,
  existingPendingFollowupsCount,
  maxFollowups,
  nextFollowUpAt,
},
      playbook: {
        id: salesPlaybook.id,
        brandName: salesPlaybook.brandName,
      },
      knowledgeBase: {
        brandName: knowledgeBase.brandName,
        counts: {
          knowledgeSources: knowledgeBase.knowledgeSources.length,
          catalogItems: knowledgeBase.catalogItems.length,
          businessRules: knowledgeBase.businessRules.length,
          faqs: knowledgeBase.faqs.length,
          suggestions: knowledgeBase.suggestions.length,
        },
      },
      runtimeSettings: getSafeRuntimeSnapshot(runtimeSettings),
      decision: normalizedDecision,
      analysis,
    });
  } catch (error: any) {
    console.error("SALES AI agent-run error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno en SALES AI Agent Runner",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

async function getRecentContext(leadId?: string | null) {
  if (!leadId) return null;

  const { data: runs, error: runsError } = await supabase
    .from("sales_agent_runs")
    .select(
      "action, action_status, lead_stage, requires_human, decision_reason, agent_reply, created_at"
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (runsError) {
    console.error("Error leyendo recent runs:", runsError.message);
  }

  const { data: messages, error: messagesError } = await supabase
    .from("sales_messages")
    .select(
      "direction, sender_type, message_text, status, whatsapp_message_id, created_at"
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (messagesError) {
    console.error("Error leyendo recent messages:", messagesError.message);
  }

  return {
    recent_runs: runs || [],
    recent_messages: messages || [],
  };
}

async function getExistingFollowupCount(leadId?: string | null) {
  if (!leadId) return 0;

  try {
    const { count, error } = await supabase
      .from("sales_followups")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId);

    if (error) {
      console.error("Error contando followups existentes:", error.message);
      return 0;
    }

    return Number(count || 0);
  } catch (error: any) {
    console.error("getExistingFollowupCount error:", error?.message || error);
    return 0;
  }
}

async function getExistingPendingFollowupCount(leadId?: string | null) {
  if (!leadId) return 0;

  try {
    const { count, error } = await supabase
      .from("sales_followups")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId)
      .eq("status", "pending");

    if (error) {
      console.error(
        "Error contando followups pendientes:",
        error.message
      );
      return 0;
    }

    return Number(count || 0);
  } catch (error: any) {
    console.error(
      "getExistingPendingFollowupCount error:",
      error?.message || error
    );
    return 0;
  }
}

function normalizeDecision(decision: any, agentMode: string) {
  const allowedActions = [
    "send_reply",
    "wait",
    "schedule_followup",
    "escalate_to_human",
    "mark_unqualified",
    "mark_lost",
  ];

  const allowedStages = [
    "new",
    "qualifying",
    "waiting_response",
    "followup_scheduled",
    "hot",
    "human_required",
    "closed",
    "lost",
    "unqualified",
  ];

  let action = allowedActions.includes(decision.action)
    ? decision.action
    : "send_reply";

  let leadStage = allowedStages.includes(decision.lead_stage)
    ? decision.lead_stage
    : "qualifying";

  let requiresHuman = Boolean(decision.requires_human);

  if (agentMode === "paused") {
    action = "wait";
    leadStage = "waiting_response";
    requiresHuman = false;
  }

  if (action === "escalate_to_human") {
    requiresHuman = true;
    leadStage = "human_required";
  }

  if (requiresHuman && action === "send_reply") {
    action = "escalate_to_human";
    leadStage = "human_required";
  }

  if (action === "schedule_followup") {
    leadStage = "followup_scheduled";
  }

  if (action === "mark_unqualified") {
    leadStage = "unqualified";
  }

  if (action === "mark_lost") {
    leadStage = "lost";
  }

  const agentReply =
    typeof decision.agent_reply === "string" && decision.agent_reply.trim()
      ? decision.agent_reply.trim()
      : null;

  const followUpMessage =
    typeof decision.follow_up_message === "string" &&
    decision.follow_up_message.trim()
      ? decision.follow_up_message.trim()
      : null;

  const followUpDelayMinutes =
    action === "schedule_followup"
      ? Number(decision.follow_up_delay_minutes || 240)
      : Number(decision.follow_up_delay_minutes || 0);

  const shouldSendNow =
    agentMode === "automatic" &&
    action === "send_reply" &&
    requiresHuman !== true &&
    Boolean(agentReply);

  return {
    action,
    lead_stage: leadStage,
    should_send_now: shouldSendNow,
    agent_reply: agentReply,
    follow_up_message: followUpMessage,
    follow_up_delay_minutes: followUpDelayMinutes,
    requires_human: requiresHuman,
    confidence_score: clampNumber(decision.confidence_score, 0, 100),
    decision_reason:
      decision.decision_reason ||
      "SALES AI tomó una decisión con base en Knowledge Base, playbook y contexto disponible.",
    next_action:
      decision.next_action ||
      "Continuar la conversación de acuerdo con la etapa del prospecto.",
    risk_level: normalizeRiskLevel(decision.risk_level),
    detected_missing_info: Array.isArray(decision.detected_missing_info)
      ? decision.detected_missing_info
      : [],
    memory_learning: decision.memory_learning || "",
  };
}

function isTerminalOrHumanStage(stage: any) {
  return ["lost", "unqualified", "closed", "human_required"].includes(
    String(stage || "").trim()
  );
}

function normalizeRiskLevel(value: any) {
  const risk = String(value || "low").toLowerCase();

  if (["low", "medium", "high"].includes(risk)) {
    return risk;
  }

  return "low";
}

function clampNumber(value: any, min: number, max: number) {
  const num = Number(value || 0);

  if (Number.isNaN(num)) return min;

  return Math.max(min, Math.min(max, num));
}

function getNextFollowUpAt(delayMinutes?: number | null) {
  if (!delayMinutes || delayMinutes <= 0) return null;

  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
}

async function triggerLearningEngine(
  req: Request,
  {
    brandName,
    leadId,
    agentRunId,
  }: {
    brandName: string;
    leadId: string;
    agentRunId: string;
  }
) {
  try {
    const autoLearningEnabled = process.env.SALES_AI_AUTO_LEARNING !== "false";

    if (!autoLearningEnabled) {
      return;
    }

    const learningRes = await fetch(
      `${getBaseUrl(req)}/api/sales-ai/learning/run`,
      {
        method: "POST",
        headers: buildForwardHeaders(req),
        body: JSON.stringify({
          brandName,
          leadId,
          agentRunId,
          minConfidence: 75,
          maxSuggestions: 3,
        }),
      }
    );

    if (!learningRes.ok) {
      const errorText = await learningRes.text();

      console.error("Learning Engine no pudo ejecutarse:", {
        status: learningRes.status,
        error: errorText,
      });

      return;
    }

    const learningData = await learningRes.json();

    console.log("Learning Engine ejecutado:", {
      brandName,
      leadId,
      agentRunId,
      insertedCount: learningData.insertedCount,
      generatedCount: learningData.generatedCount,
    });
  } catch (error: any) {
    console.error("Error disparando Learning Engine:", error?.message || error);
  }
}

function getBaseUrl(req: Request) {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  const url = new URL(req.url);

  return `${url.protocol}//${url.host}`;
}