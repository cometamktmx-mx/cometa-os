import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { slugifyBrand } from "@/lib/brand-resolver";
import {
  canSendRealWhatsapp,
  explainWhatsappSendLock,
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
  allowedBrandSlugs: string[];
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

async function getUserContext(): Promise<UserContext> {
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
    };
  }

  if (isCometaAdmin(user)) {
    return {
      userId: user.id,
      email: user.email || null,
      role: "admin",
      allowedBrandSlugs: [],
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id,email,role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("simulate-whatsapp profile error:", profileError.message);
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
    };
  }

  const { data: accessRows, error: accessError } = await supabase
    .from("user_brand_access")
    .select("brand_slug,status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (accessError) {
    console.warn("simulate-whatsapp access error:", accessError.message);
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
  };
}

function validateBrandAccess({
  userContext,
  brandName,
}: {
  userContext: UserContext;
  brandName: string;
}) {
  if (userContext.role === "admin") {
    return {
      ok: true,
      error: null,
      brandSlug: slugifyBrand(brandName),
    };
  }

  const brandSlug = slugifyBrand(brandName);

  if (userContext.allowedBrandSlugs.includes(brandSlug)) {
    return {
      ok: true,
      error: null,
      brandSlug,
    };
  }

  return {
    ok: false,
    error:
      "No tienes permiso para simular mensajes sobre esta marca. Esta marca no está asignada a tu usuario.",
    brandSlug,
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

export async function POST(request: NextRequest) {
  try {
    const userContext = await getUserContext();

    if (!userContext.userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Inicia sesión para simular WhatsApp.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const brandName = safeText(body.brandName, 180);
    const contactName = safeText(body.contactName || "Cliente WhatsApp", 180);
    const contactPhone = normalizePhone(body.contactPhone || "524450000000");
    const incomingMessage = safeText(
      body.incomingMessage || body.message || "",
      6000
    );

    if (!brandName || !incomingMessage) {
      return NextResponse.json(
        {
          ok: false,
          error: "Faltan campos obligatorios: brandName e incomingMessage",
        },
        { status: 400 }
      );
    }

    const accessValidation = validateBrandAccess({
      userContext,
      brandName,
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
            name: brandName,
            slug: accessValidation.brandSlug,
          },
        },
        { status: 403 }
      );
    }

    const runtimeSettings = await getSalesAiRuntimeSettings(brandName);

    const realWhatsappAllowedBySettings = canSendRealWhatsapp(runtimeSettings);
    const realWhatsappLockReasons = explainWhatsappSendLock(runtimeSettings);

    const conversationText = safeText(
      body.conversationText ||
        `Cliente (${contactName}): ${incomingMessage}`,
      10000
    );

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
          runtimeSettings: getSafeRuntimeSnapshot(runtimeSettings),
        },
        { status: 500 }
      );
    }

    const leadId = agentResult.leadId;
    const decision = agentResult.decision || {};
    const now = new Date().toISOString();

    const agentReply =
      typeof decision.agent_reply === "string"
        ? decision.agent_reply.trim()
        : "";

    const safeRawData = {
      source: "simulate-whatsapp",
      requested_by: {
        user_id: userContext.userId,
        email: userContext.email,
        role: userContext.role,
      },
      simulation_input: {
        brandName,
        contactName,
        contactPhone,
        incomingMessage,
        conversationText,
      },
      runtime_settings: getSafeRuntimeSnapshot(runtimeSettings),
    };

    if (leadId) {
      await saveSimulatedInboundMessage({
        brandName,
        leadId,
        contactName,
        contactPhone,
        messageText: incomingMessage,
        createdAt: now,
        rawData: safeRawData,
      });

      if (agentReply) {
        await saveSimulatedOutboundMessage({
          brandName,
          leadId,
          contactPhone,
          messageText: agentReply,
          createdAt: now,
          rawData: {
            ...safeRawData,
            runId: agentResult.runId,
            decision,
            note: "Mensaje simulado. No se envió WhatsApp real.",
          },
        });
      }
    }

    if (agentResult.runId) {
      await safeUpdateById("sales_agent_runs", agentResult.runId, [
        {
          action_status: agentReply
            ? "simulated_reply_ready"
            : "simulation_logged",
          simulated_at: now,
          raw_data: {
            simulation: {
              source: "simulate-whatsapp",
              requested_by: {
                user_id: userContext.userId,
                email: userContext.email,
                role: userContext.role,
              },
              real_whatsapp_sent: false,
              real_whatsapp_allowed_by_settings: realWhatsappAllowedBySettings,
              real_whatsapp_lock_reasons: realWhatsappLockReasons,
            },
            original_decision: decision,
            runtime_settings: getSafeRuntimeSnapshot(runtimeSettings),
          },
        },
        {
          action_status: agentReply
            ? "simulated_reply_ready"
            : "simulation_logged",
        },
      ]);
    }

    return NextResponse.json({
      ok: true,
      message: "Simulación de WhatsApp procesada correctamente.",
      mode: "simulation_no_real_whatsapp_sent",
      user: {
        id: userContext.userId,
        email: userContext.email,
        role: userContext.role,
        isAdmin: userContext.role === "admin",
      },
      brand: {
        name: brandName,
        slug: accessValidation.brandSlug,
      },
      leadId,
      runId: agentResult.runId,
      shouldSendWhatsapp: false,
      realWhatsappSent: false,
      realWhatsappAllowedBySettings,
      realWhatsappLockReasons,
      agentMode: agentResult.agentMode,
      actionStatus: agentResult.actionStatus,
      runtimeSettings: getSafeRuntimeSnapshot(runtimeSettings),
      decision,
      analysis: agentResult.analysis,
      followups: agentResult.followups || null,
      simulatedConversation: {
        inbound: incomingMessage,
        outbound: agentReply || null,
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
    const cookieHeader = request.headers.get("cookie");

    const res = await fetch(`${getBaseUrl(request)}/api/sales-ai/agent-run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
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
      brand_name: brandName,
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
      brand_name: brandName,
      lead_id: leadId,
      sender: contactName,
      message_text: messageText,
      direction: "inbound",
      created_at: createdAt,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      sender: contactName,
      message_text: messageText,
      created_at: createdAt,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
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
      brand_name: brandName,
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
      brand_name: brandName,
      lead_id: leadId,
      sender: "SALES AI",
      message_text: messageText,
      direction: "outbound",
      created_at: createdAt,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
      lead_id: leadId,
      sender: "SALES AI",
      message_text: messageText,
      created_at: createdAt,
    },
    {
      id: randomUUID(),
      brand_name: brandName,
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