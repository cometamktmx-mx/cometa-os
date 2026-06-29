import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const brandName = String(body.brandName || "").trim();
    const contactName = String(body.contactName || "Cliente WhatsApp").trim();
    const contactPhone = String(body.contactPhone || "524450000000").trim();
    const incomingMessage = String(body.incomingMessage || body.message || "").trim();

    if (!brandName || !incomingMessage) {
      return NextResponse.json(
        {
          ok: false,
          error: "Faltan campos obligatorios: brandName e incomingMessage",
        },
        { status: 400 }
      );
    }

    const conversationText =
      body.conversationText ||
      `Cliente (${contactName}): ${incomingMessage}`;

    const agentResult = await runSalesAiAgent(request, {
      brandName,
      contactName,
      contactPhone,
      contactUsername: contactPhone,
      incomingMessage,
      conversationText,
      source: "whatsapp_simulation",
    });

    if (!agentResult?.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "SALES AI agent-run no pudo ejecutarse",
          details: agentResult,
        },
        { status: 500 }
      );
    }

    const leadId = agentResult.leadId;
    const decision = agentResult.decision || {};
    const now = new Date().toISOString();

    if (leadId) {
      await saveSimulatedInboundMessage({
        brandName,
        leadId,
        contactName,
        contactPhone,
        messageText: incomingMessage,
        createdAt: now,
        rawData: {
          source: "simulate-whatsapp",
          body,
        },
      });

      if (decision.agent_reply) {
        await saveSimulatedOutboundMessage({
          brandName,
          leadId,
          contactPhone,
          messageText: decision.agent_reply,
          createdAt: now,
          rawData: {
            source: "simulate-whatsapp",
            runId: agentResult.runId,
            decision,
          },
        });
      }
    }

    if (agentResult.runId) {
      await safeUpdateById("sales_agent_runs", agentResult.runId, [
        {
          action_status: decision.agent_reply
            ? "simulated_reply_ready"
            : "simulation_logged",
          simulated_at: now,
        },
        {
          action_status: decision.agent_reply
            ? "simulated_reply_ready"
            : "simulation_logged",
        },
      ]);
    }

    return NextResponse.json({
      ok: true,
      message: "Simulación de WhatsApp procesada correctamente.",
      mode: "observation_no_real_whatsapp_sent",
      leadId,
      runId: agentResult.runId,
      shouldSendWhatsapp: false,
      agentMode: agentResult.agentMode,
      actionStatus: agentResult.actionStatus,
      decision,
      analysis: agentResult.analysis,
      simulatedConversation: {
        inbound: incomingMessage,
        outbound: decision.agent_reply || null,
        followUp: decision.follow_up_message || null,
      },
    });
  } catch (error: any) {
    console.error("SALES_AI_SIMULATE_WHATSAPP_ERROR:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Error simulando mensaje de WhatsApp",
      },
      { status: 500 }
    );
  }
}

async function runSalesAiAgent(
  request: NextRequest,
  {
    brandName,
    contactName,
    contactPhone,
    contactUsername,
    incomingMessage,
    conversationText,
    source,
  }: {
    brandName: string;
    contactName: string;
    contactPhone: string;
    contactUsername?: string;
    incomingMessage: string;
    conversationText: string;
    source: string;
  }
) {
  try {
    const res = await fetch(`${getBaseUrl(request)}/api/sales-ai/agent-run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        brandName,
        contactName,
        contactPhone,
        contactUsername,
        incomingMessage,
        conversationText,
        source,
        agentMode: "observation",
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("SALES AI agent-run falló en simulación:", data);
      return data || null;
    }

    return data;
  } catch (error: any) {
    console.error(
      "Error llamando SALES AI agent-run desde simulación:",
      error?.message || error
    );
    return null;
  }
}

async function saveSimulatedInboundMessage({
  brandName,
  leadId,
  contactName,
  contactPhone,
  messageText,
  createdAt,
  rawData,
}: {
  brandName: string;
  leadId: string;
  contactName: string;
  contactPhone: string;
  messageText: string;
  createdAt: string;
  rawData: any;
}) {
  return safeInsertWithFallback("sales_messages", [
    {
      id: randomUUID(),
      lead_id: leadId,
      sender: contactName,
      message_text: messageText,
      direction: "inbound",
      sender_type: "customer",
      status: "received",
      whatsapp_message_id: `sim_in_${randomUUID()}`,
      raw_data: rawData,
      created_at: createdAt,
    },
    {
      id: randomUUID(),
      lead_id: leadId,
      sender: contactName,
      message_text: messageText,
      direction: "inbound",
      created_at: createdAt,
    },
    {
      id: randomUUID(),
      lead_id: leadId,
      sender: contactName,
      message_text: messageText,
      created_at: createdAt,
    },
    {
      id: randomUUID(),
      lead_id: leadId,
      message_text: messageText,
      created_at: createdAt,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      direction: "inbound",
      message_direction: "inbound",
      type: "inbound",
      message: messageText,
      body: messageText,
      content: messageText,
      text: messageText,
      content_text: messageText,
      incoming_message: messageText,
      sender: contactName,
      sender_name: contactName,
      from: contactPhone,
      from_number: contactPhone,
      whatsapp_message_id: `sim_in_${randomUUID()}`,
      external_message_id: `sim_in_${randomUUID()}`,
      raw_message: rawData,
      is_from_customer: true,
      created_at: createdAt,
    },
  ]);
}

async function saveSimulatedOutboundMessage({
  brandName,
  leadId,
  contactPhone,
  messageText,
  createdAt,
  rawData,
}: {
  brandName: string;
  leadId: string;
  contactPhone: string;
  messageText: string;
  createdAt: string;
  rawData: any;
}) {
  return safeInsertWithFallback("sales_messages", [
    {
      id: randomUUID(),
      lead_id: leadId,
      sender: "SALES AI",
      message_text: messageText,
      direction: "outbound",
      sender_type: "ai",
      status: "simulated",
      whatsapp_message_id: `sim_out_${randomUUID()}`,
      raw_data: rawData,
      created_at: createdAt,
    },
    {
      id: randomUUID(),
      lead_id: leadId,
      sender: "SALES AI",
      message_text: messageText,
      direction: "outbound",
      created_at: createdAt,
    },
    {
      id: randomUUID(),
      lead_id: leadId,
      sender: "SALES AI",
      message_text: messageText,
      created_at: createdAt,
    },
    {
      id: randomUUID(),
      lead_id: leadId,
      message_text: messageText,
      created_at: createdAt,
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
      to: contactPhone,
      to_number: contactPhone,
      whatsapp_message_id: `sim_out_${randomUUID()}`,
      external_message_id: `sim_out_${randomUUID()}`,
      raw_message: rawData,
      is_from_customer: false,
      created_at: createdAt,
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

function getBaseUrl(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}