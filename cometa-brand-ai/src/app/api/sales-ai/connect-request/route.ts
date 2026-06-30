import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

type ConnectRequestPayload = {
  brandName?: string;
  requestedPhoneNumber?: string;
  connectionNotes?: string;
  tone?: string;
  businessHoursEnabled?: boolean;
  humanEscalationEnabled?: boolean;
  allowFollowups?: boolean;
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

const defaultClientPreferences = {
  tone: "profesional, claro y vendedor",
  business_hours_enabled: false,
  human_escalation_enabled: true,
  allow_followups: true,
  client_can_activate_automatic: false,
  business_summary: "",
  products_services: "",
  forbidden_promises: "",
  required_questions: "",
  escalation_notes: "",
};

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

async function requireAuthenticatedUser(): Promise<AuthCheckResult> {
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
           * Solo necesitamos leer la sesión actual.
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
          error: "No autenticado. Inicia sesión para solicitar conexión.",
        },
        { status: 401 }
      ),
    };
  }

  return {
    ok: true,
    user,
  };
}

function normalizeBrandName(value?: string | null) {
  return String(value || "Cometa Mkt").trim() || "Cometa Mkt";
}

function normalizePhone(value?: string | null) {
  return String(value || "").trim().slice(0, 40);
}

function safeText(value: unknown, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function defaultSettings(brandName: string) {
  return {
    brand_name: brandName,

    /**
     * Campos técnicos.
     * El cliente NO puede activarlos desde este endpoint.
     */
    agent_mode: "observation",
    whatsapp_status: "pending_verification",
    whatsapp_phone_number: null,
    whatsapp_phone_number_id: null,
    whatsapp_business_account_id: null,
    auto_reply_enabled: false,
    send_whatsapp_enabled: false,

    /**
     * Campos permitidos para configuración cliente.
     */
    followups_enabled: true,
    human_escalation_enabled: true,
    timezone: "America/Mexico_City",
    business_hours: {
      enabled: false,
      monday: { open: "09:00", close: "18:00" },
      tuesday: { open: "09:00", close: "18:00" },
      wednesday: { open: "09:00", close: "18:00" },
      thursday: { open: "09:00", close: "18:00" },
      friday: { open: "09:00", close: "18:00" },
      saturday: { open: "09:00", close: "14:00" },
      sunday: { closed: true },
    },
    max_followups: 3,
    first_followup_delay_minutes: 1440,
    escalation_rules: {
      high_ticket: true,
      angry_customer: true,
      payment_problem: true,
      delivery_problem: true,
      close_probability_over: 75,
    },
    response_rules: {
      tone: "profesional, claro y vendedor",
      avoid_promising_without_confirmation: true,
      ask_one_question_at_a_time: true,
      always_try_to_qualify: true,
      never_apply_discounts_without_permission: true,
    },

    internal_notes:
      "WhatsApp pendiente de verificación de Meta. Mantener en modo observación hasta conectar número real.",

    client_connection_status: "not_requested",
    client_requested_phone_number: null,
    client_connection_notes: null,
    client_requested_at: null,
    client_agent_preferences: defaultClientPreferences,
  };
}

function safeClientResponse(settings: any) {
  const clientPreferences = {
    ...defaultClientPreferences,
    ...(settings.client_agent_preferences || {}),
    client_can_activate_automatic: false,
  };

  return {
    brand_name: settings.brand_name,

    /**
     * Visibles para cliente, pero no editables aquí.
     */
    agent_mode: settings.agent_mode || "observation",
    whatsapp_status: settings.whatsapp_status || "pending_verification",
    whatsapp_phone_number: settings.whatsapp_phone_number || null,

    /**
     * Estado de solicitud cliente.
     */
    client_connection_status:
      settings.client_connection_status || "not_requested",
    client_requested_phone_number:
      settings.client_requested_phone_number || null,
    client_connection_notes: settings.client_connection_notes || null,
    client_requested_at: settings.client_requested_at || null,

    /**
     * Preferencias seguras.
     */
    client_agent_preferences: clientPreferences,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  return String(error || "Error desconocido.");
}

export async function GET(request: Request) {
  const authCheck = await requireAuthenticatedUser();

  if (!authCheck.ok) {
    return authCheck.response;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const brandName = normalizeBrandName(searchParams.get("brandName"));

    const { data, error } = await supabase
      .from("sales_ai_settings")
      .select("*")
      .eq("brand_name", brandName)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return NextResponse.json({
        ok: true,
        connection: safeClientResponse(data),
        protected: true,
        user: authCheck.user.email || authCheck.user.id || null,
      });
    }

    const { data: created, error: insertError } = await supabase
      .from("sales_ai_settings")
      .insert(defaultSettings(brandName))
      .select("*")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      ok: true,
      connection: safeClientResponse(created),
      protected: true,
      user: authCheck.user.email || authCheck.user.id || null,
    });
  } catch (error: unknown) {
    console.error("GET /api/sales-ai/connect-request error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error) || "Error cargando conexión de WhatsApp.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authCheck = await requireAuthenticatedUser();

  if (!authCheck.ok) {
    return authCheck.response;
  }

  try {
    const supabase = getSupabaseAdmin();

    const body = (await request.json()) as ConnectRequestPayload;

    const brandName = normalizeBrandName(body.brandName);
    const requestedPhoneNumber = normalizePhone(body.requestedPhoneNumber);

    if (!requestedPhoneNumber) {
      return NextResponse.json(
        {
          ok: false,
          error: "Agrega el número de WhatsApp que quieres conectar.",
        },
        { status: 400 }
      );
    }

    const tone =
      safeText(body.tone || "profesional, claro y vendedor", 500) ||
      "profesional, claro y vendedor";

    const { data: existing, error: existingError } = await supabase
      .from("sales_ai_settings")
      .select("*")
      .eq("brand_name", brandName)
      .maybeSingle();

    if (existingError) throw existingError;

    const currentSettings = existing || defaultSettings(brandName);

    const currentPreferences = {
      ...defaultClientPreferences,
      ...(currentSettings.client_agent_preferences || {}),
    };

    const clientPreferences = {
      ...currentPreferences,
      tone,
      business_hours_enabled: Boolean(body.businessHoursEnabled),
      human_escalation_enabled: body.humanEscalationEnabled !== false,
      allow_followups: body.allowFollowups !== false,
      client_can_activate_automatic: false,
    };

    const isAlreadyConnected =
      String(currentSettings.whatsapp_status || "").toLowerCase() ===
      "connected";

    /**
     * Si ya está conectado, el cliente NO puede romper la conexión.
     * Solo queda registrada una solicitud de cambio/revisión.
     */
    const updateData = isAlreadyConnected
      ? {
          client_connection_status: "change_requested",
          client_requested_phone_number: requestedPhoneNumber,
          client_connection_notes: safeText(body.connectionNotes, 2000) || null,
          client_requested_at: new Date().toISOString(),
          client_agent_preferences: clientPreferences,

          followups_enabled: clientPreferences.allow_followups,
          human_escalation_enabled: clientPreferences.human_escalation_enabled,

          response_rules: {
            ...(currentSettings.response_rules || {}),
            tone,
            avoid_promising_without_confirmation: true,
            ask_one_question_at_a_time: true,
            always_try_to_qualify: true,
            never_apply_discounts_without_permission: true,
          },

          business_hours: {
            ...(currentSettings.business_hours || {}),
            enabled: clientPreferences.business_hours_enabled,
          },

          updated_at: new Date().toISOString(),
        }
      : {
          /**
           * Estado seguro de solicitud.
           * El cliente puede solicitar conexión, pero no puede marcarla como connected.
           */
          whatsapp_status: "connection_requested",
          client_connection_status: "requested",
          client_requested_phone_number: requestedPhoneNumber,
          whatsapp_phone_number: requestedPhoneNumber,
          client_connection_notes: safeText(body.connectionNotes, 2000) || null,
          client_requested_at: new Date().toISOString(),
          client_agent_preferences: clientPreferences,

          /**
           * Doble seguro: cualquier solicitud deja el agente en modo observación
           * y sin envío real de WhatsApp.
           */
          agent_mode: "observation",
          auto_reply_enabled: false,
          send_whatsapp_enabled: false,

          /**
           * Preferencias cliente permitidas.
           */
          followups_enabled: clientPreferences.allow_followups,
          human_escalation_enabled: clientPreferences.human_escalation_enabled,

          response_rules: {
            tone,
            avoid_promising_without_confirmation: true,
            ask_one_question_at_a_time: true,
            always_try_to_qualify: true,
            never_apply_discounts_without_permission: true,
          },

          business_hours: {
            enabled: clientPreferences.business_hours_enabled,
            monday: { open: "09:00", close: "18:00" },
            tuesday: { open: "09:00", close: "18:00" },
            wednesday: { open: "09:00", close: "18:00" },
            thursday: { open: "09:00", close: "18:00" },
            friday: { open: "09:00", close: "18:00" },
            saturday: { open: "09:00", close: "14:00" },
            sunday: { closed: true },
          },

          updated_at: new Date().toISOString(),
        };

    if (!existing) {
      const { data: created, error: insertError } = await supabase
        .from("sales_ai_settings")
        .insert({
          ...defaultSettings(brandName),
          ...updateData,
          brand_name: brandName,

          /**
           * Doble seguro en creación:
           * nunca se crean credenciales técnicas desde connect-request.
           */
          whatsapp_phone_number_id: null,
          whatsapp_business_account_id: null,
          agent_mode: "observation",
          auto_reply_enabled: false,
          send_whatsapp_enabled: false,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      return NextResponse.json({
        ok: true,
        action: "created",
        connection: safeClientResponse(created),
        protected: true,
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
      action: isAlreadyConnected ? "change_requested" : "requested",
      connection: safeClientResponse(updated),
      protected: true,
      user: authCheck.user.email || authCheck.user.id || null,
    });
  } catch (error: unknown) {
    console.error("POST /api/sales-ai/connect-request error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          getErrorMessage(error) || "Error solicitando conexión de WhatsApp.",
      },
      { status: 500 }
    );
  }
}