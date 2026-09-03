import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  brandContextErrorResponse,
  invalidRequestResponse,
} from "@/lib/brand-os/api";
import { requireCanonicalBrandContext } from "@/lib/brand-os/server";
import { findSalesLeadForBrand } from "@/lib/sales-ai/tenant";
import {
  canSendApprovedWhatsapp,
  explainApprovedWhatsappSendLock,
  getSalesAiRuntimeSettings,
} from "@/lib/sales-ai-runtime-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server configuration.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * TEMPORARY AUTHORIZATION MODEL (Phase 0): an authenticated user with active
 * canonical brand membership may perform a supervised human send when the
 * Sales AI runtime permits it. COMETA does not yet have verified granular
 * Sales AI RBAC, so this is deliberately not the final permission model.
 *
 * `approved`, `approvedBy`, `brandName`, `brandSlug`, and `phoneNumberId`
 * supplied by the client are not authorization authority. The server resolves
 * the actor, canonical brand, lead ownership, and sending phone internally.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const leadId = cleanText(body?.leadId);
    const messageText =
      cleanText(body?.messageText) ||
      cleanText(body?.agentReply) ||
      cleanText(body?.reply);
    const sendReason =
      cleanText(body?.sendReason) || "Respuesta enviada manualmente";

    if (!leadId) {
      return invalidRequestResponse("Falta leadId para enviar el mensaje.");
    }

    const context = await requireCanonicalBrandContext({
      brandSlug: cleanText(body?.brandSlug),
      legacyBrandName: cleanText(body?.brandName),
    });
    const supabase = getSupabaseAdmin();
    const lead = await findSalesLeadForBrand(supabase, leadId, context);

    if (!lead) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          code: "ENTITY_NOT_FOUND",
          error: "No se encontrÃ³ el lead solicitado.",
        },
        { status: 404 }
      );
    }

    const toPhone = getFirstPhone(lead);

    if (!toPhone) {
      return invalidRequestResponse(
        "No se encontrÃ³ un nÃºmero de WhatsApp para este lead."
      );
    }

    const latestAgentRun = await getLatestAgentRun(supabase, leadId);
    const finalMessageText = messageText || cleanText(latestAgentRun?.agent_reply);

    if (!finalMessageText) {
      return invalidRequestResponse(
        "No hay respuesta para enviar. Captura un mensaje o genera una respuesta del agente."
      );
    }

    const runtimeSettings = await getSalesAiRuntimeSettings(context.brandName);
    const envAllowsWhatsappSend =
      process.env.SALES_AI_SEND_WHATSAPP_ENABLED === "true";
    const settingsAllowWhatsappSend = canSendApprovedWhatsapp(runtimeSettings);
    const lockReasons = explainApprovedWhatsappSendLock(runtimeSettings);
    const actorLabel = context.userEmail || context.userId;

    if (!envAllowsWhatsappSend || !settingsAllowWhatsappSend) {
      const blockedReason = [
        !envAllowsWhatsappSend
          ? "SALES_AI_SEND_WHATSAPP_ENABLED no estÃ¡ activo"
          : null,
        ...lockReasons,
      ]
        .filter(Boolean)
        .join(", ");

      await saveOutboundAttempt(supabase, {
        leadId,
        agentRunId: latestAgentRun?.id || null,
        brandName: context.brandName,
        toPhone,
        fromPhoneNumberId: null,
        messageText: finalMessageText,
        status: "blocked",
        sendReason,
        errorMessage: blockedReason,
      });

      return NextResponse.json(
        {
          ok: false,
          success: false,
          blocked: true,
          code: "SEND_NOT_ALLOWED",
          error: "El envÃ­o de WhatsApp estÃ¡ bloqueado por la configuraciÃ³n de seguridad.",
        },
        { status: 403 }
      );
    }

    const whatsappSettings = await getWhatsappSettings(supabase, context.brandName);
    const phoneNumberId = cleanText(whatsappSettings?.whatsapp_phone_number_id);
    const displayPhoneNumber =
      cleanText(whatsappSettings?.whatsapp_phone_number) || null;

    if (!phoneNumberId) {
      await saveOutboundAttempt(supabase, {
        leadId,
        agentRunId: latestAgentRun?.id || null,
        brandName: context.brandName,
        toPhone,
        fromPhoneNumberId: null,
        messageText: finalMessageText,
        status: "failed",
        sendReason,
        errorMessage: "Falta un phone number autorizado en Sales AI settings.",
      });

      return invalidRequestResponse(
        "No hay un nÃºmero de WhatsApp autorizado para esta marca."
      );
    }

    const whatsappSendResult = await sendWhatsappTextMessage({
      phoneNumberId,
      to: toPhone,
      message: finalMessageText,
    });

    if (!whatsappSendResult.ok) {
      await saveOutboundAttempt(supabase, {
        leadId,
        agentRunId: latestAgentRun?.id || null,
        brandName: context.brandName,
        toPhone,
        fromPhoneNumberId: phoneNumberId,
        messageText: finalMessageText,
        status: "failed",
        sendReason,
        errorMessage: whatsappSendResult.error || "WhatsApp delivery failed.",
      });

      return NextResponse.json(
        {
          ok: false,
          success: false,
          code: "SEND_FAILED",
          error: "No se pudo enviar el mensaje por WhatsApp.",
        },
        { status: 502 }
      );
    }

    const whatsappMessageId = whatsappSendResult.whatsappMessageId || null;
    const outbound = await saveOutboundSuccess(supabase, {
      brandSlug: context.brandSlug,
      brandName: context.brandName,
      leadId,
      agentRunId: latestAgentRun?.id || null,
      toPhone,
      phoneNumberId,
      displayPhoneNumber,
      messageText: finalMessageText,
      whatsappMessageId,
      rawResponse: whatsappSendResult.data,
      sendReason,
      actorLabel,
    });

    await updateLeadAfterSend(supabase, {
      leadId,
      messageText: finalMessageText,
      whatsappMessageId,
    });

    if (latestAgentRun?.id) {
      await safeUpdateById(supabase, "sales_agent_runs", latestAgentRun.id, [
        {
          action_status: "sent_whatsapp_supervised",
          whatsapp_message_id: whatsappMessageId,
          executed_at: new Date().toISOString(),
        },
        { action_status: "sent_whatsapp_supervised" },
      ]);
    }

    return NextResponse.json({
      ok: true,
      success: true,
      message: "Mensaje enviado por WhatsApp.",
      leadId,
      brand: {
        id: context.brandId,
        slug: context.brandSlug,
        name: context.brandName,
      },
      toPhone,
      whatsappMessageId,
      outbound,
    });
  } catch (error: unknown) {
    return brandContextErrorResponse(error);
  }
}

async function getLatestAgentRun(supabase: SupabaseClient, leadId: string) {
  const { data, error } = await supabase
    .from("sales_agent_runs")
    .select(
      "id,action,action_status,lead_stage,requires_human,confidence_score,decision_reason,agent_reply,created_at"
    )
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getWhatsappSettings(
  supabase: SupabaseClient,
  brandName: string
) {
  const { data, error } = await supabase
    .from("sales_ai_settings")
    .select("whatsapp_phone_number_id,whatsapp_phone_number")
    .eq("brand_name", brandName)
    .maybeSingle();

  if (error) throw error;
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
    process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_TOKEN || "";
  const graphApiVersion =
    process.env.WHATSAPP_GRAPH_API_VERSION ||
    process.env.META_GRAPH_API_VERSION ||
    "v25.0";

  if (!accessToken) {
    return {
      ok: false,
      error: "Missing WhatsApp server token.",
      data: null,
      whatsappMessageId: null,
    };
  }

  try {
    const response = await fetch(
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
          text: { preview_url: false, body: message },
        }),
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        error: "WhatsApp Graph API rejected the message.",
        data,
        whatsappMessageId: null,
      };
    }

    return {
      ok: true,
      data,
      whatsappMessageId: data?.messages?.[0]?.id || null,
    };
  } catch (error: unknown) {
    console.error("SALES_AI_WHATSAPP_SEND_ERROR:", error);
    return {
      ok: false,
      error: "WhatsApp delivery request failed.",
      data: null,
      whatsappMessageId: null,
    };
  }
}

type OutboundAttempt = {
  leadId: string;
  agentRunId: string | null;
  brandName: string;
  toPhone: string;
  fromPhoneNumberId: string | null;
  messageText: string;
  status: "blocked" | "failed";
  sendReason: string;
  errorMessage: string;
};

async function saveOutboundAttempt(
  supabase: SupabaseClient,
  input: OutboundAttempt
) {
  const now = new Date().toISOString();

  await safeInsertWithFallback(supabase, "sales_outbound_messages", [
    {
      id: randomUUID(),
      lead_id: input.leadId,
      agent_run_id: input.agentRunId,
      brand_name: input.brandName,
      to_phone: input.toPhone,
      from_phone_number_id: input.fromPhoneNumberId,
      message_text: input.messageText,
      status: input.status,
      send_reason: input.sendReason,
      error_message: input.errorMessage,
      created_at: now,
    },
    {
      id: randomUUID(),
      lead_id: input.leadId,
      brand_name: input.brandName,
      to_phone: input.toPhone,
      message_text: input.messageText,
      status: input.status,
      error_message: input.errorMessage,
      created_at: now,
    },
  ]);
}

type OutboundSuccess = {
  brandSlug: string;
  brandName: string;
  leadId: string;
  agentRunId: string | null;
  toPhone: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  messageText: string;
  whatsappMessageId: string | null;
  rawResponse: unknown;
  sendReason: string;
  actorLabel: string;
};

async function saveOutboundSuccess(
  supabase: SupabaseClient,
  input: OutboundSuccess
) {
  const now = new Date().toISOString();
  const outbound = await safeInsertWithFallback(supabase, "sales_outbound_messages", [
    {
      id: randomUUID(),
      lead_id: input.leadId,
      agent_run_id: input.agentRunId,
      brand_name: input.brandName,
      to_phone: input.toPhone,
      from_phone_number_id: input.phoneNumberId,
      message_text: input.messageText,
      status: "sent",
      send_reason: input.sendReason,
      whatsapp_message_id: input.whatsappMessageId,
      created_at: now,
      sent_at: now,
    },
    {
      id: randomUUID(),
      lead_id: input.leadId,
      brand_name: input.brandName,
      to_phone: input.toPhone,
      message_text: input.messageText,
      status: "sent",
      whatsapp_message_id: input.whatsappMessageId,
      created_at: now,
      sent_at: now,
    },
  ]);

  await safeInsertWithFallback(supabase, "whatsapp_messages", [
    {
      brand_slug: input.brandSlug,
      message_id: input.whatsappMessageId || randomUUID(),
      wa_id: input.toPhone,
      phone_number_id: input.phoneNumberId,
      display_phone_number: input.displayPhoneNumber,
      direction: "outbound",
      message_type: "text",
      content_text: input.messageText,
      raw_message: input.rawResponse,
      timestamp_at: now,
      status: "sent",
    },
    {
      brand_slug: input.brandSlug,
      message_id: input.whatsappMessageId || randomUUID(),
      wa_id: input.toPhone,
      direction: "outbound",
      content_text: input.messageText,
      status: "sent",
    },
  ]);

  await safeInsertWithFallback(supabase, "sales_messages", [
    {
      id: randomUUID(),
      lead_id: input.leadId,
      agent_run_id: input.agentRunId,
      outbound_message_id: getRecordId(outbound),
      brand_name: input.brandName,
      platform: "whatsapp",
      direction: "outbound",
      sender_type: "sales_ai",
      contact_phone: input.toPhone,
      from_phone_number_id: input.phoneNumberId,
      message_text: input.messageText,
      whatsapp_message_id: input.whatsappMessageId,
      status: "sent",
      raw_data: {
        sent_by: input.actorLabel,
        send_reason: input.sendReason,
        meta_response: input.rawResponse,
      },
      created_at: now,
    },
    {
      id: randomUUID(),
      brand_name: input.brandName,
      lead_id: input.leadId,
      direction: "outbound",
      content_text: input.messageText,
      sender: "SALES AI",
      created_at: now,
    },
  ]);

  return outbound;
}

async function updateLeadAfterSend(
  supabase: SupabaseClient,
  input: {
    leadId: string;
    messageText: string;
    whatsappMessageId: string | null;
  }
) {
  const now = new Date().toISOString();

  await safeUpdateById(supabase, "sales_leads", input.leadId, [
    {
      updated_at: now,
      last_message_at: now,
      last_agent_action: "sent_whatsapp_supervised",
      last_agent_reason: "Respuesta enviada manualmente desde SALES AI.",
      last_outbound_message: input.messageText,
      last_whatsapp_message_id: input.whatsappMessageId,
      agent_stage: "waiting_response",
    },
    {
      updated_at: now,
      last_message_at: now,
      last_agent_action: "sent_whatsapp_supervised",
      agent_stage: "waiting_response",
    },
    { updated_at: now },
  ]);
}

async function safeInsertWithFallback(
  supabase: SupabaseClient,
  tableName: string,
  payloads: Record<string, unknown>[]
) {
  for (const payload of payloads) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .insert(payload)
        .select("*")
        .maybeSingle();

      if (!error) return data;
      console.warn(`${tableName} insert fallback:`, error.message);
    } catch (error: unknown) {
      console.warn(`${tableName} insert exception:`, error);
    }
  }

  return null;
}

async function safeUpdateById(
  supabase: SupabaseClient,
  tableName: string,
  id: string,
  payloads: Record<string, unknown>[]
) {
  for (const payload of payloads) {
    try {
      const { error } = await supabase
        .from(tableName)
        .update(payload)
        .eq("id", id);

      if (!error) return true;
      console.warn(`${tableName} update fallback:`, error.message);
    } catch (error: unknown) {
      console.warn(`${tableName} update exception:`, error);
    }
  }

  return false;
}

function getFirstPhone(lead: Record<string, unknown>) {
  const keys = [
    "contact_phone",
    "phone",
    "whatsapp",
    "whatsapp_number",
    "from_number",
  ];

  for (const key of keys) {
    const value = cleanPhone(lead[key]);
    if (value) return value;
  }

  return "";
}

function getRecordId(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

function cleanText(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function cleanPhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}
