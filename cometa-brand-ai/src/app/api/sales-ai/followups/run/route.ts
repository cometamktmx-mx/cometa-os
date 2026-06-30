import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import {
  canCreateSalesAiFollowups,
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

type UserRole = "admin" | "client";

type UserContext = {
  userId: string | null;
  email: string | null;
  role: UserRole;
  isInternalRequest: boolean;
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

    /**
     * Este motor es interno:
     * - Cometa admin puede correrlo manualmente.
     * - Un proceso interno/cron puede correrlo con SALES_AI_INTERNAL_SECRET.
     * - Cliente normal NO debe dispararlo directamente.
     */
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
    const mode = "simulation";
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
        skipped: 0,
        failed: 0,
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
          skipped: false,
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
          reason: "No se encontró el lead relacionado.",
        });

        continue;
      }

      const brandName = String(lead.brand_name || "Cometa Mkt").trim();

      if (brandFilterName && brandName !== brandFilterName) {
        results.push({
          followupId: followup.id,
          leadId,
          brandName,
          ok: true,
          skipped: true,
          status: "skipped_by_brand_filter",
          reason: "Este follow-up no pertenece a la marca solicitada.",
        });

        continue;
      }

      const runtimeSettings = await getSalesAiRuntimeSettings(brandName);
      const followupsAllowedBySettings =
        canCreateSalesAiFollowups(runtimeSettings);

      const auditData = {
        requested_by: {
          user_id: userContext.userId,
          email: userContext.email,
          role: userContext.role,
          is_internal_request: userContext.isInternalRequest,
        },
      };

      if (!followupsAllowedBySettings) {
        await markFollowupBlockedBySettings({
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
        });

        results.push({
          followupId: followup.id,
          leadId,
          brandName,
          ok: true,
          skipped: true,
          mode,
          status: "blocked_by_settings",
          reason: "Follow-ups apagados por configuración de SALES AI.",
          settings: {
            agent_mode: runtimeSettings.agent_mode,
            followups_enabled: runtimeSettings.followups_enabled,
          },
          agentRunId: run?.id || null,
        });

        continue;
      }

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
          ...auditData,
          runtime_settings: {
            brand_name: runtimeSettings.brand_name,
            agent_mode: runtimeSettings.agent_mode,
            followups_enabled: runtimeSettings.followups_enabled,
            max_followups: runtimeSettings.max_followups,
            first_followup_delay_minutes:
              runtimeSettings.first_followup_delay_minutes,
          },
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
        skipped: false,
        mode,
        status: "simulated_sent",
        messageText,
        salesMessageId: createdMessage?.id || null,
        agentRunId: run?.id || null,
        settings: {
          agent_mode: runtimeSettings.agent_mode,
          followups_enabled: runtimeSettings.followups_enabled,
        },
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
      processed: results.filter((item) => item.ok && !item.skipped).length,
      skipped: results.filter((item) => item.skipped).length,
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
      sender: "SALES AI",
      message_text: messageText,
      direction: "outbound",
      created_at: now,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
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
  actionStatus,
  decisionReason,
  runtimeSettings,
  auditData,
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
        actionStatus === "followup_blocked_by_settings"
          ? "waiting_response"
          : "followup_sent",
      requires_human: false,
      confidence_score: 90,
      raw_data: {
        source: "sales_followups_run",
        mode,
        followup,
        ...auditData,
        runtime_settings: {
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
        },
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

async function markFollowupBlockedBySettings({
  followupId,
  reason,
}: {
  followupId: string;
  reason: string;
}) {
  return safeUpdateById("sales_followups", followupId, [
    {
      status: "blocked_by_settings",
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