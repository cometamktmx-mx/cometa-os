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
    const body = await request.json().catch(() => ({}));

    const limit = clampNumber(body.limit || 10, 1, 50);
    const force = body.force === true;
    const mode = String(body.mode || "simulation").toLowerCase();

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
        message: "No hay follow-ups pendientes para ejecutar.",
        mode,
        force,
        processed: 0,
        followups: [],
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
          reason: "No se encontró el lead relacionado.",
        });

        continue;
      }

      const brandName = lead.brand_name || "Cometa Mkt";
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
      });

      await markFollowupSimulatedSent({
        followupId: followup.id,
      });

      await updateLeadAfterFollowup({
        leadId,
        messageText,
      });

      results.push({
        followupId: followup.id,
        leadId,
        brandName,
        contactName,
        contactPhone,
        ok: true,
        mode,
        status: "simulated_sent",
        messageText,
        salesMessageId: createdMessage?.id || null,
        agentRunId: run?.id || null,
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Follow-ups procesados correctamente.",
      mode,
      force,
      processed: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
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
      lead_id: leadId,
      sender: "SALES AI",
      message_text: messageText,
      direction: "outbound",
      created_at: now,
    },
    {
      id: randomUUID(),
      lead_id: leadId,
      sender: "SALES AI",
      message_text: messageText,
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
      to: contactPhone,
      to_number: contactPhone,
      whatsapp_message_id: `sim_followup_${randomUUID()}`,
      external_message_id: `sim_followup_${randomUUID()}`,
      raw_message: rawData,
      is_from_customer: false,
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
}: {
  brandName: string;
  leadId: string;
  messageText: string;
  followup: any;
  mode: string;
}) {
  const now = new Date().toISOString();

  return safeInsertWithFallback("sales_agent_runs", [
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      agent_mode: mode,
      action: "send_followup",
      action_status: "simulated_followup_sent",
      agent_reply: messageText,
      decision_reason:
        "SALES AI ejecutó un seguimiento programado en modo simulación.",
      lead_stage: "followup_sent",
      requires_human: false,
      confidence_score: 90,
      raw_data: {
        source: "sales_followups_run",
        mode,
        followup,
      },
      created_at: now,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      action: "send_followup",
      action_status: "simulated_followup_sent",
      agent_reply: messageText,
      created_at: now,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      action: "send_followup",
      action_status: "simulated_followup_sent",
      created_at: now,
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
}: {
  leadId: string;
  messageText: string;
}) {
  const now = new Date().toISOString();

  return safeUpdateById("sales_leads", leadId, [
    {
      updated_at: now,
      last_agent_action: "send_followup",
      next_action: "Esperar respuesta del prospecto al seguimiento.",
      recommended_reply: messageText,
      agent_stage: "followup_sent",
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

function cleanText(value: any) {
  if (value === null || value === undefined) return "";

  return String(value).trim();
}

function clampNumber(value: any, min: number, max: number) {
  const num = Number(value || 0);

  if (Number.isNaN(num)) return min;

  return Math.max(min, Math.min(max, num));
}