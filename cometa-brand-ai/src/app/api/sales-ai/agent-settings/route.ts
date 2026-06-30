import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

type DaySchedule = {
  open?: string;
  close?: string;
  closed?: boolean;
};

type BusinessHours = {
  enabled: boolean;
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
};

type ResponseRules = {
  tone: string;
  avoid_promising_without_confirmation: boolean;
  ask_one_question_at_a_time: boolean;
  always_try_to_qualify: boolean;
  never_apply_discounts_without_permission: boolean;
};

type AgentSettingsPayload = {
  brandName?: string;
  tone?: string;
  businessHours?: BusinessHours;
  allowFollowups?: boolean;
  humanEscalationEnabled?: boolean;
  maxFollowups?: number;
  firstFollowupDelayMinutes?: number;
  responseRules?: Partial<ResponseRules>;
  businessSummary?: string;
  productsServices?: string;
  forbiddenPromises?: string;
  requiredQuestions?: string;
  escalationNotes?: string;
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

const defaultBusinessHours: BusinessHours = {
  enabled: false,
  monday: { open: "09:00", close: "18:00" },
  tuesday: { open: "09:00", close: "18:00" },
  wednesday: { open: "09:00", close: "18:00" },
  thursday: { open: "09:00", close: "18:00" },
  friday: { open: "09:00", close: "18:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: { closed: true },
};

const defaultResponseRules: ResponseRules = {
  tone: "profesional, claro y vendedor",
  avoid_promising_without_confirmation: true,
  ask_one_question_at_a_time: true,
  always_try_to_qualify: true,
  never_apply_discounts_without_permission: true,
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
          error: "No autenticado. Inicia sesión para configurar el agente.",
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

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, numberValue));
}

function defaultSettings(brandName: string) {
  return {
    brand_name: brandName,

    /**
     * Campos técnicos bloqueados para cliente.
     * Solo /api/sales-ai/settings puede modificarlos.
     */
    agent_mode: "observation",
    whatsapp_status: "pending_verification",
    whatsapp_phone_number: null,
    whatsapp_phone_number_id: null,
    whatsapp_business_account_id: null,
    auto_reply_enabled: false,
    send_whatsapp_enabled: false,

    /**
     * Campos seguros que sí puede configurar el cliente.
     */
    followups_enabled: true,
    human_escalation_enabled: true,
    timezone: "America/Mexico_City",
    business_hours: defaultBusinessHours,
    max_followups: 3,
    first_followup_delay_minutes: 1440,
    escalation_rules: {
      high_ticket: true,
      angry_customer: true,
      payment_problem: true,
      delivery_problem: true,
      close_probability_over: 75,
    },
    response_rules: defaultResponseRules,

    internal_notes:
      "WhatsApp pendiente de verificación de Meta. Mantener en modo observación hasta conectar número real.",

    client_connection_status: "not_requested",
    client_requested_phone_number: null,
    client_connection_notes: null,
    client_requested_at: null,
    client_agent_preferences: defaultClientPreferences,
  };
}

function normalizeBusinessHours(value: any): BusinessHours {
  return {
    ...defaultBusinessHours,
    ...(value || {}),
    enabled: Boolean(value?.enabled),
    monday: {
      ...defaultBusinessHours.monday,
      ...(value?.monday || {}),
    },
    tuesday: {
      ...defaultBusinessHours.tuesday,
      ...(value?.tuesday || {}),
    },
    wednesday: {
      ...defaultBusinessHours.wednesday,
      ...(value?.wednesday || {}),
    },
    thursday: {
      ...defaultBusinessHours.thursday,
      ...(value?.thursday || {}),
    },
    friday: {
      ...defaultBusinessHours.friday,
      ...(value?.friday || {}),
    },
    saturday: {
      ...defaultBusinessHours.saturday,
      ...(value?.saturday || {}),
    },
    sunday: {
      ...defaultBusinessHours.sunday,
      ...(value?.sunday || {}),
    },
  };
}

function normalizeResponseRules(
  currentRules: any,
  payloadRules: Partial<ResponseRules> | undefined,
  tone: string
): ResponseRules {
  return {
    ...defaultResponseRules,
    ...(currentRules || {}),
    ...(payloadRules || {}),
    tone,
    avoid_promising_without_confirmation:
      payloadRules?.avoid_promising_without_confirmation ??
      currentRules?.avoid_promising_without_confirmation ??
      defaultResponseRules.avoid_promising_without_confirmation,
    ask_one_question_at_a_time:
      payloadRules?.ask_one_question_at_a_time ??
      currentRules?.ask_one_question_at_a_time ??
      defaultResponseRules.ask_one_question_at_a_time,
    always_try_to_qualify:
      payloadRules?.always_try_to_qualify ??
      currentRules?.always_try_to_qualify ??
      defaultResponseRules.always_try_to_qualify,
    never_apply_discounts_without_permission:
      payloadRules?.never_apply_discounts_without_permission ??
      currentRules?.never_apply_discounts_without_permission ??
      defaultResponseRules.never_apply_discounts_without_permission,
  };
}

function safeText(value: unknown, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeClientResponse(settings: any) {
  const businessHours = normalizeBusinessHours(settings.business_hours);

  const responseRules = {
    ...defaultResponseRules,
    ...(settings.response_rules || {}),
  };

  const clientPreferences = {
    ...defaultClientPreferences,
    ...(settings.client_agent_preferences || {}),
    client_can_activate_automatic: false,
  };

  return {
    brand_name: settings.brand_name,

    /**
     * Estos campos se pueden mostrar porque no permiten modificar nada técnico.
     * No incluimos phone_number_id, WABA, tokens, send_whatsapp_enabled ni auto_reply_enabled.
     */
    agent_mode: settings.agent_mode || "observation",
    whatsapp_status: settings.whatsapp_status || "pending_verification",
    whatsapp_phone_number: settings.whatsapp_phone_number || null,
    client_connection_status:
      settings.client_connection_status || "not_requested",

    followups_enabled: settings.followups_enabled !== false,
    human_escalation_enabled: settings.human_escalation_enabled !== false,

    max_followups: settings.max_followups ?? 3,
    first_followup_delay_minutes:
      settings.first_followup_delay_minutes ?? 1440,

    business_hours: businessHours,
    response_rules: responseRules,
    client_agent_preferences: clientPreferences,
    updated_at: settings.updated_at,
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
        settings: safeClientResponse(data),
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
      settings: safeClientResponse(created),
      protected: true,
      user: authCheck.user.email || authCheck.user.id || null,
    });
  } catch (error: unknown) {
    console.error("GET /api/sales-ai/agent-settings error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error) || "Error cargando configuración del agente.",
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
    const body = (await request.json()) as AgentSettingsPayload;

    const brandName = normalizeBrandName(body.brandName);

    const { data: existing, error: existingError } = await supabase
      .from("sales_ai_settings")
      .select("*")
      .eq("brand_name", brandName)
      .maybeSingle();

    if (existingError) throw existingError;

    const currentSettings = existing || defaultSettings(brandName);

    const tone =
      safeText(
        body.tone || body.responseRules?.tone || currentSettings.response_rules?.tone,
        500
      ) || defaultResponseRules.tone;

    const businessHours = normalizeBusinessHours(
      body.businessHours || currentSettings.business_hours
    );

    const allowFollowups = body.allowFollowups !== false;
    const humanEscalationEnabled = body.humanEscalationEnabled !== false;

    const maxFollowups = clampNumber(body.maxFollowups, 0, 10, 3);

    const firstFollowupDelayMinutes = clampNumber(
      body.firstFollowupDelayMinutes,
      10,
      43200,
      1440
    );

    const responseRules = normalizeResponseRules(
      currentSettings.response_rules,
      body.responseRules,
      tone
    );

    const currentPreferences = {
      ...defaultClientPreferences,
      ...(currentSettings.client_agent_preferences || {}),
    };

    const clientPreferences = {
      ...currentPreferences,
      tone,
      business_hours_enabled: businessHours.enabled,
      human_escalation_enabled: humanEscalationEnabled,
      allow_followups: allowFollowups,
      client_can_activate_automatic: false,
      business_summary: safeText(body.businessSummary, 4000),
      products_services: safeText(body.productsServices, 4000),
      forbidden_promises: safeText(body.forbiddenPromises, 4000),
      required_questions: safeText(body.requiredQuestions, 4000),
      escalation_notes: safeText(body.escalationNotes, 4000),
    };

    /**
     * Importante:
     * Aquí solo van campos seguros para cliente.
     * No se permite actualizar:
     * - agent_mode
     * - whatsapp_status
     * - auto_reply_enabled
     * - send_whatsapp_enabled
     * - whatsapp_phone_number_id
     * - whatsapp_business_account_id
     * - internal_notes
     */
    const updateData = {
      response_rules: responseRules,
      business_hours: businessHours,
      followups_enabled: allowFollowups,
      human_escalation_enabled: humanEscalationEnabled,
      max_followups: maxFollowups,
      first_followup_delay_minutes: firstFollowupDelayMinutes,
      client_agent_preferences: clientPreferences,
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
           * Doble seguro:
           * aunque el body intente mandar campos técnicos, aquí se fuerzan seguros.
           */
          agent_mode: "observation",
          whatsapp_status: "pending_verification",
          auto_reply_enabled: false,
          send_whatsapp_enabled: false,
          whatsapp_phone_number_id: null,
          whatsapp_business_account_id: null,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      return NextResponse.json({
        ok: true,
        action: "created",
        settings: safeClientResponse(created),
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
      action: "updated",
      settings: safeClientResponse(updated),
      protected: true,
      user: authCheck.user.email || authCheck.user.id || null,
    });
  } catch (error: unknown) {
    console.error("POST /api/sales-ai/agent-settings error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error) || "Error guardando configuración del agente.",
      },
      { status: 500 }
    );
  }
}