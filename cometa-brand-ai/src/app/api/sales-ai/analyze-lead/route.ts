import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { slugifyBrand } from "@/lib/brand-resolver";

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
    console.warn("analyze-lead profile error:", profileError.message);
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
    console.warn("analyze-lead access error:", accessError.message);
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
      "No tienes permiso para analizar leads de esta marca. Esta marca no está asignada a tu usuario.",
    brandSlug: normalizedBrandSlug,
  };
}

function safeText(value: unknown, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeNullableText(value: unknown, maxLength = 500) {
  const text = safeText(value, maxLength);

  return text || null;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return fallback;

  return numberValue;
}

function normalizeBoolean(value: unknown) {
  return value === true;
}

function normalizeArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => safeText(item, 500)).filter(Boolean);
  }

  return [];
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
      return false;
    }

    if (!data) return true;

    return String(data.brand_name || "").trim() === String(brandName || "").trim();
  } catch (error: any) {
    console.warn("validateLeadBelongsToBrand exception:", error?.message);
    return false;
  }
}

function normalizeAnalysis(analysis: any) {
  return {
    lead_status:
      safeText(analysis?.lead_status, 80) || "new",
    lead_temperature:
      safeText(analysis?.lead_temperature, 80) || "unknown",
    intent:
      safeText(analysis?.intent, 120) || "otro",
    business_type:
      safeText(analysis?.business_type, 120) || "desconocido",
    budget_level:
      safeText(analysis?.budget_level, 120) || "desconocido",
    city:
      normalizeNullableText(analysis?.city, 180),
    is_qualified:
      normalizeBoolean(analysis?.is_qualified),
    qualification_reason:
      safeText(analysis?.qualification_reason, 1000),
    main_objection:
      safeText(analysis?.main_objection, 180) || "ninguna",
    lost_reason:
      normalizeNullableText(analysis?.lost_reason, 1000),
    close_probability:
      Math.max(0, Math.min(100, normalizeNumber(analysis?.close_probability, 0))),
    ai_summary:
      safeText(analysis?.ai_summary, 2000),
    next_action:
      safeText(analysis?.next_action, 1000),
    recommended_reply:
      safeText(analysis?.recommended_reply, 2000),
    follow_up_message:
      safeText(analysis?.follow_up_message, 2000),
    sales_diagnosis:
      safeText(analysis?.sales_diagnosis, 2000),
    detected_errors:
      normalizeArray(analysis?.detected_errors),
    questions_to_ask:
      normalizeArray(analysis?.questions_to_ask),
    tags:
      normalizeArray(analysis?.tags),
  };
}

export async function POST(req: Request) {
  try {
    const userContext = await getUserContext(req);

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para analizar leads.",
        },
        { status: 401 }
      );
    }

    const body = await req.json();

    const {
      brandName,
      brandSlug,
      brandAnalysisId,
      clientId,
      leadId,
      contactName,
      contactPhone,
      contactUsername,
      conversationText,
      source = "whatsapp",
      campaignName,
      adName,
    } = body;

    const finalBrandName = safeText(brandName, 180);
    const finalBrandSlug = safeText(brandSlug, 180);
    const finalConversationText = safeText(conversationText, 12000);

    if (!finalBrandName || !finalConversationText) {
      return NextResponse.json(
        {
          ok: false,
          error: "Faltan campos obligatorios: brandName y conversationText",
        },
        { status: 400 }
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
            isInternalRequest: userContext.isInternalRequest,
          },
          requestedBrand: {
            name: finalBrandName,
            slug: accessValidation.brandSlug,
          },
        },
        { status: 403 }
      );
    }

    const finalLeadIdFromBody = safeText(leadId, 120) || null;

    if (finalLeadIdFromBody) {
      const leadBelongsToBrand = await validateLeadBelongsToBrand(
        finalLeadIdFromBody,
        finalBrandName
      );

      if (!leadBelongsToBrand) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "No puedes actualizar este lead porque no pertenece a la marca indicada.",
          },
          { status: 403 }
        );
      }
    }

    const { data: playbook } = await supabase
      .from("sales_playbooks")
      .select("*")
      .eq("brand_name", finalBrandName)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const systemPrompt = `
Eres SALES AI, un agente comercial especializado en analizar conversaciones de WhatsApp y detectar oportunidades de venta.

Tu trabajo NO es hacer marketing general.
Tu trabajo es diagnosticar si un prospecto puede convertirse en venta, qué salió mal en la conversación y qué debería responder el vendedor.

Analiza la conversación con criterio comercial.

Debes responder EXCLUSIVAMENTE en JSON válido.

Campos obligatorios:

{
  "lead_status": "new | contacted | qualified | follow_up | closed | lost | unqualified",
  "lead_temperature": "hot | warm | cold | unknown",
  "intent": "mayoreo | menudeo | precio | catalogo | envio | ubicacion | reventa | surtir_negocio | curiosidad | otro",
  "business_type": "revendedora | tienda | bazar | negocio_belleza | consumidor_final | desconocido",
  "budget_level": "alto | medio | bajo | sin_presupuesto | desconocido",
  "city": "string | null",
  "is_qualified": true,
  "qualification_reason": "string",
  "main_objection": "precio | envio | confianza | presupuesto | pedido_minimo | falta_de_urgencia | comparando | no_responde | ninguna | otra",
  "lost_reason": "string | null",
  "close_probability": 0,
  "ai_summary": "string",
  "next_action": "string",
  "recommended_reply": "string",
  "follow_up_message": "string",
  "sales_diagnosis": "string",
  "detected_errors": ["string"],
  "questions_to_ask": ["string"],
  "tags": ["string"]
}

Reglas:
- close_probability debe ser número de 0 a 100.
- recommended_reply debe ser un mensaje listo para copiar y pegar al cliente.
- No inventes ventas.
- No prometas descuentos, envíos gratis o disponibilidad si no está en la conversación o playbook.
- Si el prospecto solo pidió información y desapareció, detecta falta de seguimiento.
- Si se mandó catálogo demasiado rápido, márcalo como error.
- Si el negocio vende mayoreo, prioriza filtrar presupuesto, ciudad, intención de reventa y tipo de lote.
`;

    const businessContext = playbook
      ? `
Contexto comercial del negocio:
Marca: ${finalBrandName}
Modelo de negocio: ${playbook.business_model || "No especificado"}
Cliente ideal: ${playbook.ideal_customer || "No especificado"}
Reglas comerciales: ${JSON.stringify(playbook.sales_rules || {})}
Preguntas de calificación: ${JSON.stringify(
          playbook.qualification_questions || []
        )}
Objeciones conocidas: ${JSON.stringify(playbook.objections || [])}
Promesas prohibidas: ${JSON.stringify(playbook.forbidden_promises || [])}
Tono: ${playbook.tone || "friendly_professional"}
`
      : `
Contexto comercial del negocio:
Marca: ${finalBrandName}
No hay playbook registrado todavía. Analiza con base en la conversación.
`;

    const userPrompt = `
${businessContext}

Conversación a analizar:
"""
${finalConversationText}
"""

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

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsedAnalysis = safeJsonParse(raw);

    if (!parsedAnalysis) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo convertir la respuesta de SALES AI a JSON",
          raw,
        },
        { status: 500 }
      );
    }

    const analysis = normalizeAnalysis(parsedAnalysis);

    let finalLeadId = finalLeadIdFromBody;

    if (finalLeadIdFromBody) {
      const { error: updateError } = await supabase
        .from("sales_leads")
        .update({
          lead_status: analysis.lead_status,
          lead_temperature: analysis.lead_temperature,
          intent: analysis.intent,
          business_type: analysis.business_type,
          budget_level: analysis.budget_level,
          city: analysis.city,
          is_qualified: analysis.is_qualified,
          qualification_reason: analysis.qualification_reason,
          main_objection: analysis.main_objection,
          lost_reason: analysis.lost_reason,
          close_probability: analysis.close_probability,
          ai_summary: analysis.ai_summary,
          next_action: analysis.next_action,
          recommended_reply: analysis.recommended_reply,
          last_message_at: new Date().toISOString(),
          raw_data: {
            ...analysis,
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
          },
        })
        .eq("id", finalLeadIdFromBody)
        .eq("brand_name", finalBrandName);

      if (updateError) {
        return NextResponse.json(
          {
            ok: false,
            error: updateError.message,
          },
          { status: 500 }
        );
      }
    } else {
      const { data: insertedLead, error: insertError } = await supabase
        .from("sales_leads")
        .insert({
          client_id: clientId || null,
          brand_analysis_id: brandAnalysisId || null,
          brand_name: finalBrandName,
          contact_name: normalizeNullableText(contactName, 180),
          contact_phone: normalizeNullableText(contactPhone, 80),
          contact_username: normalizeNullableText(contactUsername, 180),
          source: safeText(source, 80) || "whatsapp",
          campaign_name: normalizeNullableText(campaignName, 180),
          ad_name: normalizeNullableText(adName, 180),
          lead_status: analysis.lead_status,
          lead_temperature: analysis.lead_temperature,
          intent: analysis.intent,
          business_type: analysis.business_type,
          budget_level: analysis.budget_level,
          city: analysis.city,
          is_qualified: analysis.is_qualified,
          qualification_reason: analysis.qualification_reason,
          main_objection: analysis.main_objection,
          lost_reason: analysis.lost_reason,
          close_probability: analysis.close_probability,
          ai_summary: analysis.ai_summary,
          next_action: analysis.next_action,
          recommended_reply: analysis.recommended_reply,
          last_message_at: new Date().toISOString(),
          raw_data: {
            ...analysis,
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
          },
        })
        .select("id")
        .single();

      if (insertError) {
        return NextResponse.json(
          {
            ok: false,
            error: insertError.message,
          },
          { status: 500 }
        );
      }

      finalLeadId = insertedLead.id;
    }

    /**
     * Historial de conversación desactivado aquí.
     * El webhook/simulador son responsables de guardar sales_messages.
     */
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
      analysis,
    });
  } catch (error: any) {
    console.error("SALES AI analyze-lead error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno en SALES AI",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}