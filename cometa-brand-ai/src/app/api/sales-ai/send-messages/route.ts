import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  canSendApprovedWhatsapp,
  explainApprovedWhatsappSendLock,
  getSalesAiRuntimeSettings,
} from "@/lib/sales-ai-runtime-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    const leadId = cleanText(body?.leadId);
    const approved = body?.approved === true;
    const approvedBy = cleanText(body?.approvedBy) || "Cometa";
    const sendReason =
      cleanText(body?.sendReason) || "Respuesta aprobada manualmente";

    let messageText =
      cleanText(body?.messageText) ||
      cleanText(body?.agentReply) ||
      cleanText(body?.reply);

    if (!leadId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta leadId para enviar el mensaje.",
        },
        { status: 400 }
      );
    }

    if (!approved) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Este endpoint requiere approved=true para evitar envíos accidentales.",
        },
        { status: 400 }
      );
    }

    const { data: lead, error: leadError } = await supabase
      .from("sales_leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();

    if (leadError) {
      return NextResponse.json(
        {
          ok: false,
          error: leadError.message,
        },
        { status: 500 }
      );
    }

    if (!lead) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se encontró el lead.",
        },
        { status: 404 }
      );
    }

    const brandName =
      cleanText(body?.brandName) || cleanText(lead.brand_name) || "Cometa Mkt";

    const brandSlug =
      cleanText(lead.brand_slug) ||
      cleanText(body?.brandSlug) ||
      formatBrandSlug(brandName);

    const toPhone =
      cleanPhone(body?.toPhone) ||
      cleanPhone(lead.contact_phone) ||
      cleanPhone(lead.phone) ||
      cleanPhone(lead.whatsapp) ||
      cleanPhone(lead.whatsapp_number) ||
      cleanPhone(lead.from_number);

    if (!toPhone) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se encontró el número del lead para enviar WhatsApp.",
        },
        { status: 400 }
      );
    }

    const latestAgentRun = await getLatestAgentRun(leadId);

    if (!messageText) {
      messageText = cleanText(latestAgentRun?.agent_reply);
    }

    if (!messageText) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No hay respuesta para enviar. Falta messageText o agent_reply en el último agent run.",
        },
        { status: 400 }
      );
    }

    const runtimeSettings = await getSalesAiRuntimeSettings(brandName);

    const envAllowsWhatsappSend =
      process.env.SALES_AI_SEND_WHATSAPP_ENABLED === "true";

    const settingsAllowWhatsappSend = canSendApprovedWhatsapp(runtimeSettings);

const lockReasons = explainApprovedWhatsappSendLock(runtimeSettings);

    if (!envAllowsWhatsappSend || !settingsAllowWhatsappSend) {
      const blockedReason = [
        !envAllowsWhatsappSend
          ? "SALES_AI_SEND_WHATSAPP_ENABLED no está activo"
          : null,
        ...lockReasons,
      ]
        .filter(Boolean)
        .join(", ");

      await saveOutboundAttempt({
        leadId,
        agentRunId: latestAgentRun?.id || null,
        brandName,
        toPhone,
        fromPhoneNumberId: null,
        messageText,
        status: "blocked",
        sendReason,
        errorMessage: blockedReason,
      });

      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          error: "Envío real bloqueado por configuración de seguridad.",
          reasons: [
            !envAllowsWhatsappSend
              ? "SALES_AI_SEND_WHATSAPP_ENABLED no está activo"
              : null,
            ...lockReasons,
          ].filter(Boolean),
        },
        { status: 403 }
      );
    }

    const whatsappSettings = await getWhatsappSettings(brandName);

    const runtimeSettingsAny = runtimeSettings as any;

const phoneNumberId =
  cleanText(body?.phoneNumberId) ||
  cleanText(whatsappSettings?.whatsapp_phone_number_id) ||
  cleanText(runtimeSettingsAny?.whatsapp_phone_number_id) ||
  cleanText(runtimeSettingsAny?.whatsappPhoneNumberId);

const displayPhoneNumber =
  cleanText(whatsappSettings?.whatsapp_phone_number) ||
  cleanText(runtimeSettingsAny?.whatsapp_phone_number) ||
  cleanText(runtimeSettingsAny?.whatsappPhoneNumber) ||
  null;

    if (!phoneNumberId) {
      await saveOutboundAttempt({
        leadId,
        agentRunId: latestAgentRun?.id || null,
        brandName,
        toPhone,
        fromPhoneNumberId: null,
        messageText,
        status: "failed",
        sendReason,
        errorMessage:
          "Falta whatsapp_phone_number_id en sales_ai_settings o runtime settings.",
      });

      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta whatsapp_phone_number_id para enviar WhatsApp real.",
        },
        { status: 400 }
      );
    }

    const whatsappSendResult = await sendWhatsappTextMessage({
      phoneNumberId,
      to: toPhone,
      message: messageText,
    });

    if (!whatsappSendResult.ok) {
      await saveOutboundAttempt({
        leadId,
        agentRunId: latestAgentRun?.id || null,
        brandName,
        toPhone,
        fromPhoneNumberId: phoneNumberId,
        messageText,
        status: "failed",
        sendReason,
        errorMessage: whatsappSendResult.error,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo enviar el mensaje por WhatsApp.",
          details: whatsappSendResult.error,
          meta: whatsappSendResult.data || null,
        },
        { status: 502 }
      );
    }

    const whatsappMessageId = whatsappSendResult.whatsappMessageId || null;

    const outbound = await saveOutboundSuccess({
      brandSlug,
      brandName,
      leadId,
      agentRunId: latestAgentRun?.id || null,
      toPhone,
      phoneNumberId,
      displayPhoneNumber,
      messageText,
      whatsappMessageId,
      rawResponse: whatsappSendResult.data,
      sendReason,
      approvedBy,
    });

    await updateLeadAfterSend({
      leadId,
      messageText,
      whatsappMessageId,
    });

    if (latestAgentRun?.id) {
      await safeUpdateById("sales_agent_runs", latestAgentRun.id, [
        {
          action_status: "sent_whatsapp_supervised",
          whatsapp_message_id: whatsappMessageId,
          executed_at: new Date().toISOString(),
        },
        {
          action_status: "sent_whatsapp_supervised",
        },
      ]);
    }

    return NextResponse.json({
      ok: true,
      message: "Mensaje enviado por WhatsApp.",
      leadId,
      brandName,
      toPhone,
      whatsappMessageId,
      outbound,
    });
  } catch (error: any) {
    console.error("SALES_AI_SEND_MESSAGE_ERROR:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Error enviando mensaje por WhatsApp.",
      },
      { status: 500 }
    );
  }
}

async function getLatestAgentRun(leadId: string) {
  const { data } = await supabase
    .from("sales_agent_runs")
    .select(
      `
      id,
      action,
      action_status,
      lead_stage,
      requires_human,
      confidence_score,
      decision_reason,
      agent_reply,
      created_at
    `
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}

async function getWhatsappSettings(brandName: string) {
  const { data, error } = await supabase
    .from("sales_ai_settings")
    .select("*")
    .eq("brand_name", brandName)
    .maybeSingle();

  if (error) {
    console.warn("No se pudieron cargar sales_ai_settings:", error.message);
  }

  return data || null;
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
      error: "Falta WHATSAPP_ACCESS_TOKEN o META_WHATSAPP_TOKEN.",
      data: null,
      whatsappMessageId: null,
    };
  }

  if (!phoneNumberId) {
    return {
      ok: false,
      error: "Falta phoneNumberId para enviar WhatsApp.",
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

async function saveOutboundAttempt({
  leadId,
  agentRunId,
  brandName,
  toPhone,
  fromPhoneNumberId,
  messageText,
  status,
  sendReason,
  errorMessage,
}: {
  leadId: string;
  agentRunId: string | null;
  brandName: string;
  toPhone: string;
  fromPhoneNumberId: string | null;
  messageText: string;
  status: "blocked" | "failed";
  sendReason: string;
  errorMessage: string;
}) {
  const now = new Date().toISOString();

  await safeInsertWithFallback("sales_outbound_messages", [
    {
      id: randomUUID(),
      lead_id: leadId,
      agent_run_id: agentRunId,
      brand_name: brandName,
      to_phone: toPhone,
      from_phone_number_id: fromPhoneNumberId,
      message_text: messageText,
      status,
      send_reason: sendReason,
      error_message: errorMessage,
      created_at: now,
    },
    {
      id: randomUUID(),
      lead_id: leadId,
      brand_name: brandName,
      to_phone: toPhone,
      message_text: messageText,
      status,
      error_message: errorMessage,
      created_at: now,
    },
  ]);
}

async function saveOutboundSuccess({
  brandSlug,
  brandName,
  leadId,
  agentRunId,
  toPhone,
  phoneNumberId,
  displayPhoneNumber,
  messageText,
  whatsappMessageId,
  rawResponse,
  sendReason,
  approvedBy,
}: {
  brandSlug: string;
  brandName: string;
  leadId: string;
  agentRunId: string | null;
  toPhone: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  messageText: string;
  whatsappMessageId: string | null;
  rawResponse: any;
  sendReason: string;
  approvedBy: string;
}) {
  const now = new Date().toISOString();

  const outbound = await safeInsertWithFallback("sales_outbound_messages", [
    {
      id: randomUUID(),
      lead_id: leadId,
      agent_run_id: agentRunId,
      brand_name: brandName,
      to_phone: toPhone,
      from_phone_number_id: phoneNumberId,
      message_text: messageText,
      status: "sent",
      send_reason: sendReason,
      whatsapp_message_id: whatsappMessageId,
      created_at: now,
      sent_at: now,
    },
    {
      id: randomUUID(),
      lead_id: leadId,
      brand_name: brandName,
      to_phone: toPhone,
      message_text: messageText,
      status: "sent",
      whatsapp_message_id: whatsappMessageId,
      created_at: now,
      sent_at: now,
    },
  ]);

  await safeInsertWithFallback("whatsapp_messages", [
    {
      brand_slug: brandSlug,
      message_id: whatsappMessageId || randomUUID(),
      wa_id: toPhone,
      phone_number_id: phoneNumberId,
      display_phone_number: displayPhoneNumber,
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
      wa_id: toPhone,
      direction: "outbound",
      content_text: messageText,
      status: "sent",
    },
  ]);

  await safeInsertWithFallback("sales_messages", [
    {
      id: randomUUID(),
      lead_id: leadId,
      agent_run_id: agentRunId,
      outbound_message_id: outbound?.id || null,
      brand_name: brandName,
      platform: "whatsapp",
      direction: "outbound",
      sender_type: "sales_ai",
      contact_phone: toPhone,
      from_phone_number_id: phoneNumberId,
      message_text: messageText,
      whatsapp_message_id: whatsappMessageId,
      status: "sent",
      raw_data: {
        approved_by: approvedBy,
        send_reason: sendReason,
        meta_response: rawResponse,
      },
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
      body: messageText,
      content: messageText,
      text: messageText,
      content_text: messageText,
      sender: "SALES AI",
      sender_name: "SALES AI",
      to: toPhone,
      to_number: toPhone,
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
      direction: "outbound",
      content_text: messageText,
      sender: "SALES AI",
      created_at: now,
    },
  ]);

  return outbound;
}

async function updateLeadAfterSend({
  leadId,
  messageText,
  whatsappMessageId,
}: {
  leadId: string;
  messageText: string;
  whatsappMessageId: string | null;
}) {
  const now = new Date().toISOString();

  await safeUpdateById("sales_leads", leadId, [
    {
      updated_at: now,
      last_message_at: now,
      last_agent_action: "sent_whatsapp_supervised",
      last_agent_reason: "Respuesta aprobada manualmente desde SALES AI.",
      last_outbound_message: messageText,
      last_whatsapp_message_id: whatsappMessageId,
      agent_stage: "waiting_response",
    },
    {
      updated_at: now,
      last_message_at: now,
      last_agent_action: "sent_whatsapp_supervised",
      agent_stage: "waiting_response",
    },
    {
      updated_at: now,
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

function cleanText(value: any) {
  if (value === null || value === undefined) return "";

  return String(value).trim();
}

function cleanPhone(value: any) {
  return String(value || "").replace(/\D/g, "");
}

function formatBrandSlug(value: string) {
  return String(value || "brand-os")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}