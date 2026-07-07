import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import {
  canCreateSalesAiFollowups,
  canSendRealWhatsapp,
  getSalesAiRuntimeSettings,
} from "@/lib/sales-ai-runtime-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const followupCooldownSeconds = normalizeEnvNumber(
  process.env.SALES_AI_FOLLOWUP_COOLDOWN_SECONDS,
  300
);

const followupMaxChars = normalizeEnvNumber(
  process.env.SALES_AI_FOLLOWUP_MAX_CHARS,
  900
);

const riskyFollowupKeywords = [
  "pago",
  "pagar",
  "transferencia",
  "deposito",
  "depósito",
  "comprobante",
  "factura",
  "facturación",
  "garantía",
  "garantia",
  "devolución",
  "devolucion",
  "reembolso",
  "cancelar",
  "queja",
  "reclamo",
  "descuento",
  "rebaja",
  "urgente",
  "stock exacto",
  "existencia exacta",
];

type UserRole = "admin" | "client";

type UserContext = {
  userId: string | null;
  email: string | null;
  role: UserRole;
  isInternalRequest: boolean;
};

type FollowupSafetyResult = {
  ok: boolean;
  reasons: string[];
  context: Record<string, any>;
};

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

function isInternalRequest(request: NextRequest) {
  const expectedSecret = String(process.env.SALES_AI_INTERNAL_SECRET || "").trim();

  if (!expectedSecret) return false;

  const receivedSecret =
    request.headers.get("x-cometa-internal-secret") ||
    request.headers.get("x-sales-ai-internal-secret") ||
    "";

  return receivedSecret === expectedSecret;
}

async function getUserContext(request: NextRequest): Promise<UserContext> {
  if (isInternalRequest(request)) {
    return {
      userId: "internal-sales-ai",
      email: "internal@cometaos.local",
      role: "admin",
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
      isInternalRequest: false,
    };
  }

  if (isCometaAdmin(user)) {
    return {
      userId: user.id,
      email: user.email || null,
      role: "admin",
      isInternalRequest: false,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id,email,role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("followups-run profile error:", profileError.message);
  }

  const role: UserRole =
    profile?.role === "admin" && profile?.status === "active"
      ? "admin"
      : "client";

  return {
    userId: user.id,
    email: user.email || profile?.email || null,
    role,
    isInternalRequest: false,
  };
}

function safeText(value: unknown, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  try {
    const userContext = await getUserContext(request);

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para ejecutar follow-ups.",
        },
        { status: 401 }
      );
    }

    if (userContext.role !== "admin") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Forbidden. El motor de follow-ups es un proceso interno de Cometa OS.",
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const limit = clampNumber(body.limit || 10, 1, 50);
    const force = body.force === true;
    const dryRun = body.dryRun === true || body.mode === "simulation";
    const mode = dryRun ? "simulation" : "real";
    const brandFilterName = safeText(body.brandName, 180);

    const now = new Date().toISOString();

    let query = supabase
      .from("sales_followups")
      .select("*")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true })
      .limit(limit);

    if (!force) {
      query = query.lte("scheduled_at", now);
    }

    const { data: followups, error: followupsError } = await query;

    if (followupsError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Error leyendo sales_followups",
          details: followupsError.message,
        },
        { status: 500 }
      );
    }

    if (!followups || followups.length === 0) {
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
        message: "No hay follow-ups pendientes para ejecutar.",
        mode,
        force,
        brandFilterName: brandFilterName || null,
        processed: 0,
        sent: 0,
        simulated: 0,
        blocked: 0,
        skipped: 0,
        failed: 0,
        results: [],
      });
    }

    const results = [];

    for (const followup of followups) {
      const leadId = followup.lead_id;
      const messageText = cleanText(followup.message_text);

      if (!leadId || !messageText) {
        await markFollowupFailed({
          followupId: followup.id,
          reason: "Follow-up sin lead_id o message_text.",
        });

        results.push({
          followupId: followup.id,
          ok: false,
          skipped: false,
          blocked: false,
          reason: "Follow-up sin lead_id o message_text.",
        });

        continue;
      }

      const lead = await getLeadById(leadId);

      if (!lead) {
        await markFollowupFailed({
          followupId: followup.id,
          reason: "No se encontró el lead relacionado.",
        });

        results.push({
          followupId: followup.id,
          leadId,
          ok: false,
          skipped: false,
          blocked: false,
          reason: "No se encontró el lead relacionado.",
        });

        continue;
      }

      const brandName = String(lead.brand_name || "Cometa Mkt").trim();

      if (
        brandFilterName &&
        brandName.toLowerCase() !== brandFilterName.toLowerCase()
      ) {
        results.push({
          followupId: followup.id,
          leadId,
          brandName,
          ok: true,
          skipped: true,
          blocked: false,
          status: "skipped_by_brand_filter",
          reason: "Este follow-up no pertenece a la marca solicitada.",
        });

        continue;
      }

      const runtimeSettings = await getSalesAiRuntimeSettings(brandName);
      const followupsAllowedBySettings =
        canCreateSalesAiFollowups(runtimeSettings);

      const whatsappSettings = await getWhatsappSettingsForBrand(brandName);

      const contactPhone =
        lead.contact_phone ||
        lead.phone ||
        lead.whatsapp ||
        lead.whatsapp_number ||
        lead.from_number ||
        null;

      const contactName =
        lead.contact_name ||
        lead.customer_name ||
        lead.lead_name ||
        lead.name ||
        "Cliente";

      const auditData = {
        requested_by: {
          user_id: userContext.userId,
          email: userContext.email,
          role: userContext.role,
          is_internal_request: userContext.isInternalRequest,
        },
      };

      if (!followupsAllowedBySettings) {
        await markFollowupBlocked({
          followupId: followup.id,
          reason: "Follow-ups apagados por configuración de SALES AI.",
        });

        const run = await saveFollowupAgentRun({
          brandName,
          leadId,
          messageText,
          followup,
          mode,
          actionStatus: "followup_blocked_by_settings",
          decisionReason:
            "SALES AI no ejecutó el seguimiento porque los follow-ups están apagados o el agente está pausado.",
          runtimeSettings,
          auditData,
          whatsappMessageId: null,
          errorMessage: "Follow-ups apagados por configuración de SALES AI.",
        });

        results.push({
          followupId: followup.id,
          leadId,
          brandName,
          ok: true,
          skipped: false,
          blocked: true,
          mode,
          status: "blocked_by_settings",
          reason: "Follow-ups apagados por configuración de SALES AI.",
          agentRunId: run?.id || null,
        });

        continue;
      }

      const safety = await evaluateFollowupSafety({
        brandName,
        lead,
        followup,
        messageText,
        contactPhone,
        runtimeSettings,
        whatsappSettings,
        mode,
      });

      if (!safety.ok) {
        await markFollowupBlocked({
          followupId: followup.id,
          reason: safety.reasons.join(", "),
        });

        const run = await saveFollowupAgentRun({
          brandName,
          leadId,
          messageText,
          followup,
          mode,
          actionStatus: "followup_blocked_by_safety",
          decisionReason: `SALES AI bloqueó el seguimiento por seguridad: ${safety.reasons.join(
            ", "
          )}`,
          runtimeSettings,
          auditData,
          whatsappMessageId: null,
          errorMessage: safety.reasons.join(", "),
        });

        results.push({
          followupId: followup.id,
          leadId,
          brandName,
          contactName,
          contactPhone,
          ok: true,
          skipped: false,
          blocked: true,
          mode,
          status: "blocked_by_safety",
          reasons: safety.reasons,
          context: safety.context,
          agentRunId: run?.id || null,
        });

        continue;
      }

      if (mode === "simulation") {
        const createdMessage = await saveSimulatedFollowupMessage({
          brandName,
          leadId,
          contactPhone,
          messageText,
          rawData: {
            source: "sales_followups_run",
            mode,
            force,
            followup,
            ...auditData,
            runtime_settings: getRuntimeSnapshot(runtimeSettings),
            whatsapp_settings: whatsappSettings,
            lead_snapshot: {
              id: lead.id,
              brand_name: lead.brand_name,
              contact_name: contactName,
              contact_phone: contactPhone,
            },
          },
        });

        const run = await saveFollowupAgentRun({
          brandName,
          leadId,
          messageText,
          followup,
          mode,
          actionStatus: "simulated_followup_sent",
          decisionReason:
            "SALES AI ejecutó un seguimiento programado en modo simulación.",
          runtimeSettings,
          auditData,
          whatsappMessageId: null,
          errorMessage: null,
        });

        await markFollowupSimulatedSent({
          followupId: followup.id,
        });

        await updateLeadAfterFollowup({
          leadId,
          messageText,
          status: "followup_sent",
        });

        results.push({
          followupId: followup.id,
          leadId,
          brandName,
          contactName,
          contactPhone,
          ok: true,
          skipped: false,
          blocked: false,
          mode,
          status: "simulated_sent",
          messageText,
          salesMessageId: createdMessage?.id || null,
          agentRunId: run?.id || null,
        });

        continue;
      }

      const sendResult = await sendWhatsappTextMessage({
        phoneNumberId: whatsappSettings.phoneNumberId,
        to: normalizeWhatsappRecipient(contactPhone),
        message: messageText,
      });

      if (!sendResult.ok) {
        await markFollowupFailed({
          followupId: followup.id,
          reason: sendResult.error,
        });

        const run = await saveFollowupAgentRun({
          brandName,
          leadId,
          messageText,
          followup,
          mode,
          actionStatus: "followup_send_failed",
          decisionReason:
            "SALES AI intentó enviar el seguimiento por WhatsApp, pero Meta/API devolvió error.",
          runtimeSettings,
          auditData,
          whatsappMessageId: null,
          errorMessage: sendResult.error,
        });

        results.push({
          followupId: followup.id,
          leadId,
          brandName,
          contactName,
          contactPhone,
          ok: false,
          skipped: false,
          blocked: false,
          mode,
          status: "send_failed",
          error: sendResult.error,
          agentRunId: run?.id || null,
        });

        continue;
      }

      await saveRealFollowupMessage({
        brandName,
        brandSlug: whatsappSettings.brandSlug,
        leadId,
        contactPhone,
        phoneNumberId: whatsappSettings.phoneNumberId,
        displayPhoneNumber: whatsappSettings.displayPhoneNumber,
        messageText,
        whatsappMessageId: sendResult.whatsappMessageId,
        rawResponse: sendResult.data,
      });

      const run = await saveFollowupAgentRun({
        brandName,
        leadId,
        messageText,
        followup,
        mode,
        actionStatus: "followup_sent_whatsapp",
        decisionReason:
          "SALES AI envió un seguimiento programado por WhatsApp real.",
        runtimeSettings,
        auditData,
        whatsappMessageId: sendResult.whatsappMessageId,
        errorMessage: null,
      });

      await markFollowupSent({
        followupId: followup.id,
      });

      await updateLeadAfterFollowup({
        leadId,
        messageText,
        status: "followup_sent",
      });

      results.push({
        followupId: followup.id,
        leadId,
        brandName,
        contactName,
        contactPhone,
        ok: true,
        skipped: false,
        blocked: false,
        mode,
        status: "sent_whatsapp",
        messageText,
        whatsappMessageId: sendResult.whatsappMessageId,
        agentRunId: run?.id || null,
      });
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
      message: "Follow-ups procesados correctamente.",
      mode,
      force,
      brandFilterName: brandFilterName || null,
      processed: results.filter(
        (item: any) => item.ok && !item.skipped && !item.blocked
      ).length,
      sent: results.filter((item: any) => item.status === "sent_whatsapp").length,
      simulated: results.filter((item: any) => item.status === "simulated_sent")
        .length,
      blocked: results.filter((item: any) => item.blocked).length,
      skipped: results.filter((item: any) => item.skipped).length,
      failed: results.filter((item: any) => !item.ok).length,
      results,
    });
  } catch (error: any) {
    console.error("SALES_AI_FOLLOWUPS_RUN_ERROR:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Error ejecutando follow-ups de SALES AI.",
      },
      { status: 500 }
    );
  }
}

async function getLeadById(leadId: string) {
  const { data, error } = await supabase
    .from("sales_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    console.error("Error leyendo sales_leads:", error.message);
    return null;
  }

  return data;
}

async function getWhatsappSettingsForBrand(brandName: string) {
  const { data, error } = await supabase
    .from("sales_ai_settings")
    .select("*")
    .eq("brand_name", brandName)
    .maybeSingle();

  if (error) {
    console.warn("getWhatsappSettingsForBrand error:", error.message);
  }

  const brandSlug =
    cleanText(data?.brand_slug) ||
    slugFromBrandName(brandName);

  return {
    brandSlug,
    phoneNumberId: cleanText(data?.whatsapp_phone_number_id),
    displayPhoneNumber: cleanText(data?.whatsapp_phone_number),
    raw: data || null,
  };
}

async function evaluateFollowupSafety({
  brandName,
  lead,
  followup,
  messageText,
  contactPhone,
  runtimeSettings,
  whatsappSettings,
  mode,
}: {
  brandName: string;
  lead: any;
  followup: any;
  messageText: string;
  contactPhone?: string | null;
  runtimeSettings: any;
  whatsappSettings: any;
  mode: "real" | "simulation";
}): Promise<FollowupSafetyResult> {
  const reasons: string[] = [];

  const envAllowsWhatsappSend =
    process.env.SALES_AI_SEND_WHATSAPP_ENABLED === "true";

  const settingsAllowWhatsappSend = canSendRealWhatsapp(runtimeSettings);

  if (!messageText) {
    reasons.push("missing_message_text");
  }

  if (messageText.length > followupMaxChars) {
    reasons.push(`message_too_long=${messageText.length}`);
  }

  if (!contactPhone) {
    reasons.push("missing_contact_phone");
  }

  const riskyKeyword = findRiskyKeyword(messageText);

  if (riskyKeyword) {
    reasons.push(`risky_followup_keyword=${riskyKeyword}`);
  }

  if (mode === "real") {
    if (!envAllowsWhatsappSend) {
      reasons.push("env_sales_ai_send_whatsapp_enabled=false");
    }

    if (!settingsAllowWhatsappSend) {
      reasons.push("settings_do_not_allow_real_whatsapp");
    }

    if (!whatsappSettings.phoneNumberId) {
      reasons.push("missing_whatsapp_phone_number_id");
    }
  }

  const latestInbound = await getLatestInboundMessage(lead.id);

  if (latestInbound?.createdAt) {
    const followupCreatedAt =
      followup.created_at ||
      followup.inserted_at ||
      followup.scheduled_at ||
      null;

    if (
      followupCreatedAt &&
      new Date(latestInbound.createdAt).getTime() >
        new Date(followupCreatedAt).getTime()
    ) {
      reasons.push("customer_replied_after_followup_was_scheduled");
    }
  }

  const recentOutbound = await getLatestOutboundMessage(lead.id);

  if (recentOutbound?.createdAt) {
    const secondsSinceLastOutbound = Math.floor(
      (Date.now() - new Date(recentOutbound.createdAt).getTime()) / 1000
    );

    if (
      Number.isFinite(secondsSinceLastOutbound) &&
      secondsSinceLastOutbound >= 0 &&
      secondsSinceLastOutbound < followupCooldownSeconds
    ) {
      reasons.push(`followup_cooldown_active=${secondsSinceLastOutbound}s`);
    }

    const previousText = cleanText(recentOutbound.messageText).toLowerCase();
    const nextText = cleanText(messageText).toLowerCase();

    if (previousText && nextText && previousText === nextText) {
      reasons.push("duplicate_followup_message");
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    context: {
      brandName,
      leadId: lead.id,
      followupId: followup.id,
      mode,
      envAllowsWhatsappSend,
      settingsAllowWhatsappSend,
      agentMode: runtimeSettings?.agent_mode,
      whatsappStatus: runtimeSettings?.whatsapp_status,
      followupsEnabled: runtimeSettings?.followups_enabled,
      sendWhatsappEnabled: runtimeSettings?.send_whatsapp_enabled,
      autoReplyEnabled: runtimeSettings?.auto_reply_enabled,
      phoneNumberId: whatsappSettings?.phoneNumberId,
      contactPhone,
      followupCooldownSeconds,
      followupMaxChars,
      latestInbound,
      recentOutbound,
    },
  };
}

async function getLatestInboundMessage(leadId: string) {
  try {
    const { data, error } = await supabase
      .from("sales_messages")
      .select("*")
      .eq("lead_id", leadId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id || null,
        createdAt: data.created_at || null,
        messageText:
          data.message_text ||
          data.content_text ||
          data.message ||
          data.body ||
          data.text ||
          "",
      };
    }
  } catch (error: any) {
    console.warn("getLatestInboundMessage error:", error?.message);
  }

  return null;
}

async function getLatestOutboundMessage(leadId: string) {
  try {
    const { data, error } = await supabase
      .from("sales_messages")
      .select("*")
      .eq("lead_id", leadId)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id || null,
        createdAt: data.created_at || null,
        messageText:
          data.message_text ||
          data.content_text ||
          data.message ||
          data.body ||
          data.text ||
          "",
      };
    }
  } catch (error: any) {
    console.warn("getLatestOutboundMessage error:", error?.message);
  }

  return null;
}

async function sendWhatsappTextMessage({
  phoneNumberId,
  to,
  message,
}: {
  phoneNumberId: string;
  to: string;
  message: string;
}) {
  const accessToken =
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.META_WHATSAPP_TOKEN ||
    "";

  const graphApiVersion =
    process.env.WHATSAPP_GRAPH_API_VERSION ||
    process.env.META_GRAPH_API_VERSION ||
    "v25.0";

  if (!accessToken) {
    return {
      ok: false,
      error: "Falta WHATSAPP_ACCESS_TOKEN o META_WHATSAPP_TOKEN",
      data: null,
      whatsappMessageId: null,
    };
  }

  if (!phoneNumberId) {
    return {
      ok: false,
      error: "Falta phoneNumberId para enviar WhatsApp",
      data: null,
      whatsappMessageId: null,
    };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: {
            preview_url: false,
            body: message,
          },
        }),
      }
    );

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        ok: false,
        error: JSON.stringify(data || {}),
        data,
        whatsappMessageId: null,
      };
    }

    return {
      ok: true,
      error: null,
      data,
      whatsappMessageId: data?.messages?.[0]?.id || null,
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message || String(error),
      data: null,
      whatsappMessageId: null,
    };
  }
}

async function saveRealFollowupMessage({
  brandName,
  brandSlug,
  leadId,
  contactPhone,
  phoneNumberId,
  displayPhoneNumber,
  messageText,
  whatsappMessageId,
  rawResponse,
}: {
  brandName: string;
  brandSlug: string;
  leadId: string;
  contactPhone?: string | null;
  phoneNumberId: string;
  displayPhoneNumber?: string | null;
  messageText: string;
  whatsappMessageId?: string | null;
  rawResponse: any;
}) {
  const now = new Date().toISOString();

  await safeInsertWithFallback("whatsapp_messages", [
    {
      brand_slug: brandSlug,
      message_id: whatsappMessageId || randomUUID(),
      wa_id: normalizeWhatsappRecipient(contactPhone),
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber || null,
      direction: "outbound",
      message_type: "text",
      content_text: messageText,
      raw_message: rawResponse,
      timestamp_at: now,
      status: "sent",
    },
    {
      brand_slug: brandSlug,
      message_id: whatsappMessageId || randomUUID(),
      wa_id: normalizeWhatsappRecipient(contactPhone),
      direction: "outbound",
      content_text: messageText,
      status: "sent",
    },
  ]);

  return safeInsertWithFallback("sales_messages", [
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      sender: "SALES AI",
      message_text: messageText,
      direction: "outbound",
      sender_type: "ai",
      status: "sent_followup",
      whatsapp_message_id: whatsappMessageId,
      raw_data: rawResponse,
      created_at: now,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      direction: "outbound",
      message_direction: "outbound",
      type: "outbound",
      message: messageText,
      message_text: messageText,
      body: messageText,
      content: messageText,
      text: messageText,
      content_text: messageText,
      sender: "SALES AI",
      sender_name: "SALES AI",
      to: contactPhone,
      to_number: contactPhone,
      whatsapp_message_id: whatsappMessageId,
      external_message_id: whatsappMessageId,
      raw_message: rawResponse,
      is_from_customer: false,
      created_at: now,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      sender: "SALES AI",
      message_text: messageText,
      direction: "outbound",
      created_at: now,
    },
  ]);
}

async function saveSimulatedFollowupMessage({
  brandName,
  leadId,
  contactPhone,
  messageText,
  rawData,
}: {
  brandName: string;
  leadId: string;
  contactPhone?: string | null;
  messageText: string;
  rawData: any;
}) {
  const now = new Date().toISOString();

  return safeInsertWithFallback("sales_messages", [
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      sender: "SALES AI",
      message_text: messageText,
      direction: "outbound",
      sender_type: "ai",
      status: "simulated_followup",
      whatsapp_message_id: `sim_followup_${randomUUID()}`,
      raw_data: rawData,
      created_at: now,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      direction: "outbound",
      message_direction: "outbound",
      type: "outbound",
      message: messageText,
      message_text: messageText,
      body: messageText,
      content: messageText,
      text: messageText,
      content_text: messageText,
      sender: "SALES AI",
      sender_name: "SALES AI",
      to: contactPhone,
      to_number: contactPhone,
      whatsapp_message_id: `sim_followup_${randomUUID()}`,
      external_message_id: `sim_followup_${randomUUID()}`,
      raw_message: rawData,
      is_from_customer: false,
      created_at: now,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      sender: "SALES AI",
      message_text: messageText,
      direction: "outbound",
      created_at: now,
    },
  ]);
}

async function saveFollowupAgentRun({
  brandName,
  leadId,
  messageText,
  followup,
  mode,
  actionStatus,
  decisionReason,
  runtimeSettings,
  auditData,
  whatsappMessageId,
  errorMessage,
}: {
  brandName: string;
  leadId: string;
  messageText: string;
  followup: any;
  mode: string;
  actionStatus: string;
  decisionReason: string;
  runtimeSettings: any;
  auditData: any;
  whatsappMessageId?: string | null;
  errorMessage?: string | null;
}) {
  const now = new Date().toISOString();

  return safeInsertWithFallback("sales_agent_runs", [
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      agent_mode: mode,
      action: "send_followup",
      action_status: actionStatus,
      agent_reply: messageText,
      decision_reason: decisionReason,
      lead_stage:
        actionStatus.includes("blocked") || actionStatus.includes("failed")
          ? "waiting_response"
          : "followup_sent",
      requires_human: false,
      confidence_score: actionStatus.includes("blocked") ? 0 : 90,
      whatsapp_message_id: whatsappMessageId || null,
      raw_data: {
        source: "sales_followups_run",
        mode,
        followup,
        error_message: errorMessage || null,
        ...auditData,
        runtime_settings: getRuntimeSnapshot(runtimeSettings),
      },
      created_at: now,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      action: "send_followup",
      action_status: actionStatus,
      agent_reply: messageText,
      whatsapp_message_id: whatsappMessageId || null,
      created_at: now,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      action: "send_followup",
      action_status: actionStatus,
      created_at: now,
    },
  ]);
}

async function markFollowupSent({ followupId }: { followupId: string }) {
  const now = new Date().toISOString();

  return safeUpdateById("sales_followups", followupId, [
    {
      status: "sent",
      sent_at: now,
    },
    {
      status: "sent",
    },
  ]);
}

async function markFollowupSimulatedSent({
  followupId,
}: {
  followupId: string;
}) {
  const now = new Date().toISOString();

  return safeUpdateById("sales_followups", followupId, [
    {
      status: "simulated_sent",
      sent_at: now,
    },
    {
      status: "sent",
      sent_at: now,
    },
  ]);
}

async function markFollowupBlocked({
  followupId,
  reason,
}: {
  followupId: string;
  reason: string;
}) {
  return safeUpdateById("sales_followups", followupId, [
    {
      status: "blocked",
      error_message: reason,
    },
    {
      status: "blocked",
    },
  ]);
}

async function markFollowupFailed({
  followupId,
  reason,
}: {
  followupId: string;
  reason: string;
}) {
  return safeUpdateById("sales_followups", followupId, [
    {
      status: "failed",
      error_message: reason,
    },
    {
      status: "failed",
    },
  ]);
}

async function updateLeadAfterFollowup({
  leadId,
  messageText,
  status,
}: {
  leadId: string;
  messageText: string;
  status: string;
}) {
  const now = new Date().toISOString();

  return safeUpdateById("sales_leads", leadId, [
    {
      updated_at: now,
      last_agent_action: "send_followup",
      next_action: "Esperar respuesta del prospecto al seguimiento.",
      recommended_reply: messageText,
      agent_stage: status,
    },
    {
      updated_at: now,
      next_action: "Esperar respuesta del prospecto al seguimiento.",
      recommended_reply: messageText,
    },
  ]);
}

async function safeInsertWithFallback(tableName: string, payloads: any[]) {
  for (const payload of payloads) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .insert(payload)
        .select("*")
        .maybeSingle();

      if (!error) {
        return data;
      }

      console.warn(`${tableName} insert fallback:`, error.message);
    } catch (error: any) {
      console.warn(`${tableName} insert exception:`, error?.message);
    }
  }

  return null;
}

async function safeUpdateById(tableName: string, id: string, payloads: any[]) {
  for (const payload of payloads) {
    try {
      const { error } = await supabase
        .from(tableName)
        .update(payload)
        .eq("id", id);

      if (!error) return true;

      console.warn(`${tableName} update fallback:`, error.message);
    } catch (error: any) {
      console.warn(`${tableName} update exception:`, error?.message);
    }
  }

  return false;
}

function getRuntimeSnapshot(runtimeSettings: any) {
  return {
    brand_name: runtimeSettings?.brand_name,
    agent_mode: runtimeSettings?.agent_mode,
    whatsapp_status: runtimeSettings?.whatsapp_status,
    auto_reply_enabled: runtimeSettings?.auto_reply_enabled,
    send_whatsapp_enabled: runtimeSettings?.send_whatsapp_enabled,
    followups_enabled: runtimeSettings?.followups_enabled,
    human_escalation_enabled: runtimeSettings?.human_escalation_enabled,
    max_followups: runtimeSettings?.max_followups,
    first_followup_delay_minutes:
      runtimeSettings?.first_followup_delay_minutes,
  };
}

function findRiskyKeyword(value: string) {
  const clean = cleanText(value).toLowerCase();

  if (!clean) return null;

  return riskyFollowupKeywords.find((keyword) => clean.includes(keyword)) || null;
}

function normalizeWhatsappRecipient(value?: string | null) {
  return String(value || "")
    .replace(/[^\d]/g, "")
    .slice(0, 40);
}

function slugFromBrandName(value: string) {
  return String(value || "brand-os")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeEnvNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }

  return numberValue;
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