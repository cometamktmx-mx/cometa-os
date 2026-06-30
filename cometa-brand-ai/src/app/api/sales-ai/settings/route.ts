import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

type SalesAiSettingsPayload = {
  brandName?: string;

  agent_mode?: string;
  whatsapp_status?: string;

  whatsapp_phone_number?: string | null;
  whatsapp_phone_number_id?: string | null;
  whatsapp_business_account_id?: string | null;

  auto_reply_enabled?: boolean;
  send_whatsapp_enabled?: boolean;
  followups_enabled?: boolean;
  human_escalation_enabled?: boolean;

  timezone?: string;

  business_hours?: any;
  max_followups?: number;
  first_followup_delay_minutes?: number;

  escalation_rules?: any;
  response_rules?: any;

  internal_notes?: string | null;
};

type AdminCheckResult =
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

async function requireCometaAdmin(): Promise<AdminCheckResult> {
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
           * En algunos contextos Next puede impedir setear cookies.
           * Para este endpoint solo necesitamos leer la sesión actual.
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
          error: "No autenticado. Inicia sesión para acceder a esta API.",
        },
        { status: 401 }
      ),
    };
  }

  if (!isCometaAdmin(user)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error:
            "Forbidden. Esta API es interna de Cometa y no puede ser usada por clientes.",
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

function normalizeBrandName(value?: string | null) {
  return String(value || "Cometa Mkt").trim() || "Cometa Mkt";
}

function normalizeSettingsPayload(body: SalesAiSettingsPayload) {
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  const allowedFields: (keyof SalesAiSettingsPayload)[] = [
    "agent_mode",
    "whatsapp_status",
    "whatsapp_phone_number",
    "whatsapp_phone_number_id",
    "whatsapp_business_account_id",
    "auto_reply_enabled",
    "send_whatsapp_enabled",
    "followups_enabled",
    "human_escalation_enabled",
    "timezone",
    "business_hours",
    "max_followups",
    "first_followup_delay_minutes",
    "escalation_rules",
    "response_rules",
    "internal_notes",
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  return updateData;
}

function defaultSettings(brandName: string) {
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
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  return String(error || "Error desconocido.");
}

export async function GET(request: Request) {
  const adminCheck = await requireCometaAdmin();

  if (!adminCheck.ok) {
    return adminCheck.response;
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

    if (error) {
      throw error;
    }

    if (data) {
      return NextResponse.json({
        ok: true,
        settings: data,
        createdDefault: false,
        protected: true,
        admin: adminCheck.user.email || adminCheck.user.id || null,
      });
    }

    const insertData = defaultSettings(brandName);

    const { data: created, error: insertError } = await supabase
      .from("sales_ai_settings")
      .insert(insertData)
      .select("*")
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      ok: true,
      settings: created,
      createdDefault: true,
      protected: true,
      admin: adminCheck.user.email || adminCheck.user.id || null,
    });
  } catch (error: unknown) {
    console.error("GET /api/sales-ai/settings error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error) || "Error cargando settings de SALES AI.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const adminCheck = await requireCometaAdmin();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  try {
    const supabase = getSupabaseAdmin();

    const body = (await request.json()) as SalesAiSettingsPayload;
    const brandName = normalizeBrandName(body.brandName);

    const updateData = normalizeSettingsPayload(body);

    const { data: existing, error: existingError } = await supabase
      .from("sales_ai_settings")
      .select("id")
      .eq("brand_name", brandName)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (!existing) {
      const insertData = {
        ...defaultSettings(brandName),
        ...updateData,
        brand_name: brandName,
      };

      const { data: created, error: insertError } = await supabase
        .from("sales_ai_settings")
        .insert(insertData)
        .select("*")
        .single();

      if (insertError) {
        throw insertError;
      }

      return NextResponse.json({
        ok: true,
        settings: created,
        action: "created",
        protected: true,
        admin: adminCheck.user.email || adminCheck.user.id || null,
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from("sales_ai_settings")
      .update(updateData)
      .eq("brand_name", brandName)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      ok: true,
      settings: updated,
      action: "updated",
      protected: true,
      admin: adminCheck.user.email || adminCheck.user.id || null,
    });
  } catch (error: unknown) {
    console.error("POST /api/sales-ai/settings error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          getErrorMessage(error) || "Error actualizando settings de SALES AI.",
      },
      { status: 500 }
    );
  }
}