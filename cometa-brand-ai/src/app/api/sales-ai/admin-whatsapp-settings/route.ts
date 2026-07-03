import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import {
  normalizeSalesAiAgentMode,
  normalizeSalesAiBrandName,
  type SalesAiAgentMode,
} from "@/lib/sales-ai-runtime-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminWhatsappSettingsPayload = {
  brandName?: string;
  whatsappStatus?: string;
  whatsappPhoneNumber?: string;
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  agentMode?: SalesAiAgentMode;
  autoReplyEnabled?: boolean;
  sendWhatsappEnabled?: boolean;
  followupsEnabled?: boolean;
  humanEscalationEnabled?: boolean;
  internalNotes?: string;
};

type AuthCheckResult =
  | {
      ok: true;
      user: {
        id?: string;
        email?: string | null;
      };
    }
  | {
      ok: false;
      response: NextResponse;
    };

const DEFAULT_ADMIN_EMAILS = ["cometa.mktmx@gmail.com"];

function getAdminEmails() {
  const raw = process.env.SALES_AI_ADMIN_EMAILS || "";

  const fromEnv = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return fromEnv.length ? fromEnv : DEFAULT_ADMIN_EMAILS;
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Faltan variables de Supabase: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function requireAdminUser(): Promise<AuthCheckResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error:
            "Auth no configurado. Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        },
        { status: 500 }
      ),
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
        } catch {
          /**
           * En route handlers puede no ser necesario setear cookies.
           */
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "No autenticado.",
        },
        { status: 401 }
      ),
    };
  }

  const email = String(user.email || "").trim().toLowerCase();

  if (!getAdminEmails().includes(email)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "No autorizado. Esta ruta es solo para administradores.",
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    user,
  };
}

function safeText(value: unknown, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeNullableText(value: unknown, maxLength = 500) {
  const clean = safeText(value, maxLength);

  return clean || null;
}

function normalizeWhatsappStatus(value?: string | null) {
  const status = String(value || "pending_verification").trim().toLowerCase();

  if (status === "connected") return "connected";
  if (status === "connection_requested") return "connection_requested";
  if (status === "error") return "error";
  if (status === "paused") return "paused";

  return "pending_verification";
}

function getGraphApiVersion() {
  return (
    process.env.WHATSAPP_GRAPH_API_VERSION ||
    process.env.META_GRAPH_API_VERSION ||
    "v23.0"
  );
}

function getPublicWebhookUrl(request: NextRequest) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  return `${baseUrl.replace(/\/+$/g, "")}/api/webhooks/whatsapp`;
}

function getSendLockPreview(settings: {
  agent_mode: string;
  whatsapp_status: string;
  auto_reply_enabled: boolean;
  send_whatsapp_enabled: boolean;
}) {
  const reasons: string[] = [];

  if (settings.agent_mode !== "automatic") {
    reasons.push(`agent_mode=${settings.agent_mode}`);
  }

  if (settings.whatsapp_status !== "connected") {
    reasons.push(`whatsapp_status=${settings.whatsapp_status}`);
  }

  if (settings.auto_reply_enabled !== true) {
    reasons.push("auto_reply_enabled=false");
  }

  if (settings.send_whatsapp_enabled !== true) {
    reasons.push("send_whatsapp_enabled=false");
  }

  if (process.env.SALES_AI_SEND_WHATSAPP_ENABLED !== "true") {
    reasons.push("SALES_AI_SEND_WHATSAPP_ENABLED=false");
  }

  return {
    canSendRealWhatsapp: reasons.length === 0,
    reasons,
  };
}

function defaultAdminSettings(brandName: string) {
  return {
    brand_name: brandName,
    agent_mode: "observation",
    whatsapp_status: "pending_verification",
    whatsapp_phone_number: null,
    whatsapp_phone_number_id: null,
    whatsapp_business_account_id: null,
    auto_reply_enabled: false,
    send_whatsapp_enabled: false,
    followups_enabled: true,
    human_escalation_enabled: true,
    timezone: "America/Mexico_City",
    max_followups: 3,
    first_followup_delay_minutes: 1440,
    client_connection_status: "not_requested",
    client_requested_phone_number: null,
    client_connection_notes: null,
    internal_notes:
      "Configuración creada desde admin WhatsApp settings. Mantener en observación hasta validar recepción real.",
  };
}

function safeAdminResponse(settings: any, request: NextRequest) {
  const normalized = {
    brand_name: settings.brand_name || "Cometa Mkt",
    agent_mode: normalizeSalesAiAgentMode(settings.agent_mode),
    whatsapp_status: normalizeWhatsappStatus(settings.whatsapp_status),
    whatsapp_phone_number: settings.whatsapp_phone_number || "",
    whatsapp_phone_number_id: settings.whatsapp_phone_number_id || "",
    whatsapp_business_account_id:
      settings.whatsapp_business_account_id || "",
    auto_reply_enabled: settings.auto_reply_enabled === true,
    send_whatsapp_enabled: settings.send_whatsapp_enabled === true,
    followups_enabled: settings.followups_enabled !== false,
    human_escalation_enabled: settings.human_escalation_enabled !== false,
    client_connection_status:
      settings.client_connection_status || "not_requested",
    client_requested_phone_number:
      settings.client_requested_phone_number || "",
    client_connection_notes: settings.client_connection_notes || "",
    internal_notes: settings.internal_notes || "",
    updated_at: settings.updated_at || null,
  };

  return {
    ...normalized,
    webhook_url: getPublicWebhookUrl(request),
    graph_api_version: getGraphApiVersion(),
    send_lock: getSendLockPreview({
      agent_mode: normalized.agent_mode,
      whatsapp_status: normalized.whatsapp_status,
      auto_reply_enabled: normalized.auto_reply_enabled,
      send_whatsapp_enabled: normalized.send_whatsapp_enabled,
    }),
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  return String(error || "Error desconocido.");
}

export async function GET(request: NextRequest) {
  const authCheck = await requireAdminUser();

  if (!authCheck.ok) {
    return authCheck.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const brandName = normalizeSalesAiBrandName(
      request.nextUrl.searchParams.get("brandName")
    );

    const { data, error } = await supabase
      .from("sales_ai_settings")
      .select("*")
      .eq("brand_name", brandName)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return NextResponse.json({
        ok: true,
        settings: safeAdminResponse(data, request),
        user: authCheck.user.email || authCheck.user.id || null,
      });
    }

    const { data: created, error: insertError } = await supabase
      .from("sales_ai_settings")
      .insert(defaultAdminSettings(brandName))
      .select("*")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      ok: true,
      settings: safeAdminResponse(created, request),
      user: authCheck.user.email || authCheck.user.id || null,
    });
  } catch (error) {
    console.error("GET /api/sales-ai/admin-whatsapp-settings error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          getErrorMessage(error) ||
          "Error cargando configuración admin de WhatsApp.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdminUser();

  if (!authCheck.ok) {
    return authCheck.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = (await request.json()) as AdminWhatsappSettingsPayload;

    const brandName = normalizeSalesAiBrandName(body.brandName);
    const whatsappStatus = normalizeWhatsappStatus(body.whatsappStatus);
    const agentMode = normalizeSalesAiAgentMode(body.agentMode);

    const updateData = {
      brand_name: brandName,
      whatsapp_status: whatsappStatus,
      whatsapp_phone_number: safeNullableText(body.whatsappPhoneNumber, 80),
      whatsapp_phone_number_id: safeNullableText(
        body.whatsappPhoneNumberId,
        120
      ),
      whatsapp_business_account_id: safeNullableText(
        body.whatsappBusinessAccountId,
        120
      ),
      agent_mode: agentMode,
      auto_reply_enabled: body.autoReplyEnabled === true,
      send_whatsapp_enabled: body.sendWhatsappEnabled === true,
      followups_enabled: body.followupsEnabled !== false,
      human_escalation_enabled: body.humanEscalationEnabled !== false,
      internal_notes: safeText(body.internalNotes, 3000) || null,
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: existingError } = await supabase
      .from("sales_ai_settings")
      .select("*")
      .eq("brand_name", brandName)
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing) {
      const { data: created, error: insertError } = await supabase
        .from("sales_ai_settings")
        .insert({
          ...defaultAdminSettings(brandName),
          ...updateData,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      return NextResponse.json({
        ok: true,
        action: "created",
        settings: safeAdminResponse(created, request),
        user: authCheck.user.email || authCheck.user.id || null,
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from("sales_ai_settings")
      .update(updateData)
      .eq("brand_name", brandName)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      action: "updated",
      settings: safeAdminResponse(updated, request),
      user: authCheck.user.email || authCheck.user.id || null,
    });
  } catch (error) {
    console.error("POST /api/sales-ai/admin-whatsapp-settings error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          getErrorMessage(error) ||
          "Error guardando configuración admin de WhatsApp.",
      },
      { status: 500 }
    );
  }
}