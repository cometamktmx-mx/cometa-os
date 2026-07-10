import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import {
  formatBrandName,
  slugifyBrand,
} from "@/lib/brand-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConnectRequestPayload = {
  brand?: string;
  brandSlug?: string;
  brandName?: string;

  requestedPhoneNumber?: string;
  connectionNotes?: string;

  tone?: string;
  businessHoursEnabled?: boolean;
  humanEscalationEnabled?: boolean;
  allowFollowups?: boolean;
};

type AuthenticatedUser = {
  id: string;
  email?: string | null;
};

type AuthCheckResult =
  | {
      ok: true;
      user: AuthenticatedUser;
    }
  | {
      ok: false;
      response: NextResponse;
    };

type BrandAccessResult =
  | {
      ok: true;
      brand: {
        slug: string;
        name: string;
      };
      isAdmin: boolean;
      availableBrands: Array<{
        slug: string;
        name: string;
      }>;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type WhatsappConnectionRow = {
  id?: string | null;

  brand_slug?: string | null;
  brand_name?: string | null;
  business_name?: string | null;

  display_phone_number?: string | null;
  phone_number?: string | null;

  verified_name?: string | null;

  connection_status?: string | null;
  status?: string | null;
  webhook_status?: string | null;
  webhook_verified?: boolean | null;

  receive_enabled?: boolean | null;
  agent_enabled?: boolean | null;
  allow_real_send?: boolean | null;

  connected_at?: string | null;
  approved_at?: string | null;
  paused_at?: string | null;
  revoked_at?: string | null;

  last_webhook_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;

  last_error?: string | null;
  last_error_code?: string | null;

  created_at?: string | null;
  updated_at?: string | null;
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
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY."
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
            "Auth no configurado. Faltan variables públicas de Supabase.",
        },
        {
          status: 500,
        }
      ),
    };
  }

  const cookieStore = await cookies();

  const supabaseAuth = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
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
            // Para esta API solamente necesitamos leer la sesión.
          }
        },
      },
    }
  );

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
          error: "No autenticado. Inicia sesión para continuar.",
        },
        {
          status: 401,
        }
      ),
    };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email || null,
    },
  };
}

function defaultSettings(brandName: string) {
  return {
    brand_name: brandName,

    /**
     * Configuración técnica inicial.
     * El cliente nunca puede activarla desde esta API.
     */
    agent_mode: "observation",
    whatsapp_status: "pending_verification",
    whatsapp_phone_number: null,
    whatsapp_phone_number_id: null,
    whatsapp_business_account_id: null,

    auto_reply_enabled: false,
    send_whatsapp_enabled: false,

    /**
     * Preferencias permitidas para el cliente.
     */
    followups_enabled: true,
    human_escalation_enabled: true,

    timezone: "America/Mexico_City",

    business_hours: {
      enabled: false,

      monday: {
        open: "09:00",
        close: "18:00",
      },

      tuesday: {
        open: "09:00",
        close: "18:00",
      },

      wednesday: {
        open: "09:00",
        close: "18:00",
      },

      thursday: {
        open: "09:00",
        close: "18:00",
      },

      friday: {
        open: "09:00",
        close: "18:00",
      },

      saturday: {
        open: "09:00",
        close: "14:00",
      },

      sunday: {
        closed: true,
      },
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
      "WhatsApp pendiente. Mantener en observación hasta que Cometa apruebe la conexión real.",

    client_connection_status: "not_requested",
    client_requested_phone_number: null,
    client_connection_notes: null,
    client_requested_at: null,

    client_agent_preferences: defaultClientPreferences,
  };
}

export async function GET(request: Request) {
  const authCheck = await requireAuthenticatedUser();

  if (!authCheck.ok) {
    return authCheck.response;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);

    const requestedBrand =
      searchParams.get("brand") ||
      searchParams.get("brandSlug") ||
      searchParams.get("brandName") ||
      "";

    const brandAccess = await resolveAuthorizedBrand({
      supabase,
      user: authCheck.user,
      requestedBrand,
    });

    if (!brandAccess.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: brandAccess.error,
        },
        {
          status: brandAccess.status,
        }
      );
    }

    const { brand } = brandAccess;

    const [settings, connection] = await Promise.all([
      getOrCreateSalesAiSettings({
        supabase,
        brandName: brand.name,
      }),

      getWhatsappConnection({
        supabase,
        brandSlug: brand.slug,
      }),
    ]);

    return NextResponse.json({
      ok: true,

      protected: true,

      user: {
        id: authCheck.user.id,
        email: authCheck.user.email || null,
        isAdmin: brandAccess.isAdmin,
      },

      brand,

      availableBrands: brandAccess.availableBrands,

      connection: safeClientResponse({
        settings,
        connection,
        brand,
      }),
    });
  } catch (error: unknown) {
    console.error(
      "GET /api/sales-ai/connect-request error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          getErrorMessage(error) ||
          "No se pudo cargar la conexión de WhatsApp.",
      },
      {
        status: 500,
      }
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

    const requestedBrand =
      body.brand ||
      body.brandSlug ||
      body.brandName ||
      "";

    const brandAccess = await resolveAuthorizedBrand({
      supabase,
      user: authCheck.user,
      requestedBrand,
    });

    if (!brandAccess.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: brandAccess.error,
        },
        {
          status: brandAccess.status,
        }
      );
    }

    const { brand } = brandAccess;

    const requestedPhoneNumber = normalizePhone(
      body.requestedPhoneNumber
    );

    const connectionNotes =
      safeText(body.connectionNotes, 2000) || null;

    if (!requestedPhoneNumber) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Agrega el número de WhatsApp que quieres conectar.",
        },
        {
          status: 400,
        }
      );
    }

    const tone =
      safeText(
        body.tone || "profesional, claro y vendedor",
        500
      ) || "profesional, claro y vendedor";

    const [existingSettings, connection] = await Promise.all([
      getSalesAiSettings({
        supabase,
        brandName: brand.name,
      }),

      getWhatsappConnection({
        supabase,
        brandSlug: brand.slug,
      }),
    ]);

    const currentSettings =
      existingSettings || defaultSettings(brand.name);

    const currentPreferences = {
      ...defaultClientPreferences,
      ...(isObject(currentSettings.client_agent_preferences)
        ? currentSettings.client_agent_preferences
        : {}),
    };

    const clientPreferences = {
      ...currentPreferences,

      tone,

      business_hours_enabled:
        body.businessHoursEnabled === true,

      human_escalation_enabled:
        body.humanEscalationEnabled !== false,

      allow_followups:
        body.allowFollowups !== false,

      /**
       * Este permiso siempre permanece bloqueado.
       * Solo Cometa puede activar automatización real.
       */
      client_can_activate_automatic: false,
    };

    const actualConnectionStatus = normalizeConnectionStatus(
      connection?.connection_status ||
        connection?.status ||
        ""
    );

    const hasExistingConnection =
      Boolean(connection?.id) &&
      actualConnectionStatus !== "revoked";

    const requestStatus = hasExistingConnection
      ? "change_requested"
      : "requested";

    const now = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      client_connection_status: requestStatus,

      client_requested_phone_number:
        requestedPhoneNumber,

      client_connection_notes:
        connectionNotes,

      client_requested_at: now,

      client_agent_preferences:
        clientPreferences,

      followups_enabled:
        clientPreferences.allow_followups,

      human_escalation_enabled:
        clientPreferences.human_escalation_enabled,

      response_rules: {
        ...(isObject(currentSettings.response_rules)
          ? currentSettings.response_rules
          : {}),

        tone,

        avoid_promising_without_confirmation: true,
        ask_one_question_at_a_time: true,
        always_try_to_qualify: true,
        never_apply_discounts_without_permission: true,
      },

      business_hours: {
        ...(isObject(currentSettings.business_hours)
          ? currentSettings.business_hours
          : {}),

        enabled:
          clientPreferences.business_hours_enabled,
      },

      updated_at: now,
    };

    /**
     * Si todavía no existe una conexión real, mantenemos todo
     * en observación y sin envío automático.
     *
     * Si ya existe conexión, no alteramos su operación técnica
     * solamente porque el cliente pidió un cambio.
     */
    if (!hasExistingConnection) {
      updateData.whatsapp_status =
        "connection_requested";

      updateData.agent_mode =
        "observation";

      updateData.auto_reply_enabled =
        false;

      updateData.send_whatsapp_enabled =
        false;
    }

    let savedSettings: any;

    if (!existingSettings) {
      const { data, error } = await supabase
        .from("sales_ai_settings")
        .insert({
          ...defaultSettings(brand.name),
          ...updateData,

          brand_name: brand.name,

          /**
           * Nunca se crean credenciales técnicas
           * desde una solicitud manual.
           */
          whatsapp_phone_number: null,
          whatsapp_phone_number_id: null,
          whatsapp_business_account_id: null,

          agent_mode: "observation",
          auto_reply_enabled: false,
          send_whatsapp_enabled: false,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      savedSettings = data;
    } else {
      let updateQuery = supabase
        .from("sales_ai_settings")
        .update(updateData);

      if (existingSettings.id) {
        updateQuery = updateQuery.eq(
          "id",
          existingSettings.id
        );
      } else {
        updateQuery = updateQuery.ilike(
          "brand_name",
          brand.name
        );
      }

      const { data, error } = await updateQuery
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      savedSettings = data;
    }

    const updatedConnection =
      await getWhatsappConnection({
        supabase,
        brandSlug: brand.slug,
      });

    return NextResponse.json({
      ok: true,

      action: hasExistingConnection
        ? "change_requested"
        : "requested",

      message: hasExistingConnection
        ? "Solicitud de revisión recibida. La conexión actual no fue modificada."
        : "Solicitud de conexión recibida. Cometa revisará el número.",

      protected: true,

      user: {
        id: authCheck.user.id,
        email: authCheck.user.email || null,
        isAdmin: brandAccess.isAdmin,
      },

      brand,

      availableBrands:
        brandAccess.availableBrands,

      connection: safeClientResponse({
        settings: savedSettings,
        connection: updatedConnection,
        brand,
      }),
    });
  } catch (error: unknown) {
    console.error(
      "POST /api/sales-ai/connect-request error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          getErrorMessage(error) ||
          "No se pudo guardar la solicitud de WhatsApp.",
      },
      {
        status: 500,
      }
    );
  }
}

async function resolveAuthorizedBrand({
  supabase,
  user,
  requestedBrand,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  user: AuthenticatedUser;
  requestedBrand: string;
}): Promise<BrandAccessResult> {
  const profile = await getUserProfile({
    supabase,
    userId: user.id,
  });

  if (
    profile &&
    String(profile.status || "").toLowerCase() !== "active"
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "Tu usuario está inactivo. Solicita acceso a Cometa.",
    };
  }

  const isAdmin =
    String(profile?.role || "").toLowerCase() === "admin" &&
    String(profile?.status || "").toLowerCase() === "active";

  const { data: accessRows, error: accessError } =
    await supabase
      .from("user_brand_access")
      .select(
        "brand_slug,access_role,status"
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(100);

  if (accessError) {
    throw accessError;
  }

  const authorizedSlugs = Array.from(
    new Set(
      (Array.isArray(accessRows)
        ? accessRows
        : []
      )
        .map((row: any) =>
          slugifyBrand(
            String(row.brand_slug || "")
          )
        )
        .filter(Boolean)
    )
  );

  let requestedSlug = slugifyBrand(
    requestedBrand
  );

  if (!requestedSlug) {
    requestedSlug = isAdmin
      ? "cometa-mkt"
      : authorizedSlugs[0] || "";
  }

  if (!requestedSlug) {
    return {
      ok: false,
      status: 403,
      error:
        "Tu usuario no tiene ninguna marca activa asignada.",
    };
  }

  if (
    !isAdmin &&
    !authorizedSlugs.includes(requestedSlug)
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "No tienes autorización para consultar esa marca.",
    };
  }

  const brandName =
    await resolveBrandNameBySlug({
      supabase,
      brandSlug: requestedSlug,
    });

  const availableSlugs = isAdmin
    ? Array.from(
        new Set([
          requestedSlug,
          ...authorizedSlugs,
        ])
      )
    : authorizedSlugs;

  const availableBrands = await Promise.all(
    availableSlugs.map(async (slug) => ({
      slug,
      name:
        slug === requestedSlug
          ? brandName
          : await resolveBrandNameBySlug({
              supabase,
              brandSlug: slug,
            }),
    }))
  );

  return {
    ok: true,

    brand: {
      slug: requestedSlug,
      name: brandName,
    },

    isAdmin,

    availableBrands,
  };
}

async function getUserProfile({
  supabase,
  userId,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  userId: string;
}) {
  const byUserId = await supabase
    .from("user_profiles")
    .select("user_id,id,email,role,status")
    .eq("user_id", userId)
    .maybeSingle();

  if (!byUserId.error && byUserId.data) {
    return byUserId.data;
  }

  const byId = await supabase
    .from("user_profiles")
    .select("user_id,id,email,role,status")
    .eq("id", userId)
    .maybeSingle();

  if (!byId.error && byId.data) {
    return byId.data;
  }

  if (
    byUserId.error &&
    byId.error
  ) {
    console.warn(
      "connect-request profile lookup:",
      byUserId.error.message,
      byId.error.message
    );
  }

  return null;
}

async function resolveBrandNameBySlug({
  supabase,
  brandSlug,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  brandSlug: string;
}) {
  const cleanSlug =
    slugifyBrand(brandSlug);

  if (!cleanSlug) {
    return "Marca sin nombre";
  }

  const { data: connection } =
    await supabase
      .from("whatsapp_connections")
      .select(
        "brand_name,business_name"
      )
      .eq("brand_slug", cleanSlug)
      .order("updated_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  const connectionName =
    cleanText(connection?.brand_name) ||
    cleanText(connection?.business_name);

  if (connectionName) {
    return connectionName;
  }

  const sources = [
    {
      table: "mercury_brand_settings",
      slugColumn: "brand_slug",
    },
    {
      table: "mercury_calendars",
      slugColumn: "brand_slug",
    },
    {
      table: "clients",
      slugColumn: "brand_slug",
    },
    {
      table: "brand_analysis",
      slugColumn: "brand_slug",
    },
    {
      table: "cosmos_memory",
      slugColumn: "brand_slug",
    },
  ];

  for (const source of sources) {
    try {
      const { data, error } = await supabase
        .from(source.table)
        .select("*")
        .eq(source.slugColumn, cleanSlug)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        continue;
      }

      const name =
        getFirstText(data, [
          "brand_name",
          "brandName",
          "name",
          "business_name",
          "client_name",
        ]);

      if (name) {
        return name;
      }
    } catch {
      // Intentamos la siguiente fuente.
    }
  }

  /**
   * Compatibilidad con sales_ai_settings,
   * que históricamente no tenía brand_slug.
   */
  try {
    const { data, error } = await supabase
      .from("sales_ai_settings")
      .select("brand_name")
      .limit(500);

    if (!error && Array.isArray(data)) {
      const matchingSetting = data.find(
        (row: any) =>
          slugifyBrand(
            String(row.brand_name || "")
          ) === cleanSlug
      );

      if (matchingSetting?.brand_name) {
        return String(
          matchingSetting.brand_name
        ).trim();
      }
    }
  } catch {
    // Conservamos el nombre generado.
  }

  return formatBrandName(cleanSlug);
}

async function getSalesAiSettings({
  supabase,
  brandName,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  brandName: string;
}) {
  const { data, error } = await supabase
    .from("sales_ai_settings")
    .select("*")
    .ilike("brand_name", brandName)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getOrCreateSalesAiSettings({
  supabase,
  brandName,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  brandName: string;
}) {
  const existing =
    await getSalesAiSettings({
      supabase,
      brandName,
    });

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("sales_ai_settings")
    .insert({
      ...defaultSettings(brandName),
      brand_name: brandName,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getWhatsappConnection({
  supabase,
  brandSlug,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  brandSlug: string;
}): Promise<WhatsappConnectionRow | null> {
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select(
      [
        "id",
        "brand_slug",
        "brand_name",
        "business_name",
        "display_phone_number",
        "phone_number",
        "verified_name",
        "connection_status",
        "status",
        "webhook_status",
        "webhook_verified",
        "receive_enabled",
        "agent_enabled",
        "allow_real_send",
        "connected_at",
        "approved_at",
        "paused_at",
        "revoked_at",
        "last_webhook_at",
        "last_inbound_at",
        "last_outbound_at",
        "last_error",
        "last_error_code",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .eq(
      "brand_slug",
      slugifyBrand(brandSlug)
    )
    .order("updated_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? (data as unknown as WhatsappConnectionRow)
    : null;
}

function safeClientResponse({
  settings,
  connection,
  brand,
}: {
  settings: any;
  connection: WhatsappConnectionRow | null;
  brand: {
    slug: string;
    name: string;
  };
}) {
  const clientPreferences = {
    ...defaultClientPreferences,

    ...(isObject(
      settings?.client_agent_preferences
    )
      ? settings.client_agent_preferences
      : {}),

    client_can_activate_automatic: false,
  };

  const connectionStatus =
    connection
      ? normalizeConnectionStatus(
          connection.connection_status ||
            connection.status ||
            "pending_review"
        )
      : "not_connected";

  const webhookStatus =
    connection
      ? cleanText(
          connection.webhook_status
        ) ||
        (connection.webhook_verified
          ? "active"
          : "pending")
      : "not_connected";

  const whatsappStatus =
    connection
      ? mapConnectionToClientWhatsappStatus(
          connectionStatus
        )
      : cleanText(
          settings?.whatsapp_status
        ) || "pending_verification";

  const displayPhoneNumber =
    connection
      ? cleanText(
          connection.display_phone_number
        ) ||
        cleanText(
          connection.phone_number
        ) ||
        null
      : cleanText(
          settings?.whatsapp_phone_number
        ) || null;

  return {
    brand_slug: brand.slug,
    brand_name: brand.name,

    /**
     * Compatibilidad con la pantalla anterior.
     */
    agent_mode:
      settings?.agent_mode ||
      "observation",

    whatsapp_status:
      whatsappStatus,

    whatsapp_phone_number:
      displayPhoneNumber,

    client_connection_status:
      settings?.client_connection_status ||
      "not_requested",

    client_requested_phone_number:
      settings?.client_requested_phone_number ||
      null,

    client_connection_notes:
      settings?.client_connection_notes ||
      null,

    client_requested_at:
      settings?.client_requested_at ||
      null,

    client_agent_preferences:
      clientPreferences,

    /**
     * Estado real de whatsapp_connections.
     */
    connection_status:
      connectionStatus,

    webhook_status:
      webhookStatus,

    verified_name:
      cleanText(
        connection?.verified_name
      ) || null,

    receive_enabled:
      connection?.receive_enabled === true,

    agent_enabled:
      connection?.agent_enabled === true,

    real_send_enabled:
      connection?.allow_real_send === true,

    connected_at:
      connection?.connected_at ||
      null,

    approved_at:
      connection?.approved_at ||
      null,

    paused_at:
      connection?.paused_at ||
      null,

    revoked_at:
      connection?.revoked_at ||
      null,

    last_webhook_at:
      connection?.last_webhook_at ||
      null,

    last_inbound_at:
      connection?.last_inbound_at ||
      null,

    last_outbound_at:
      connection?.last_outbound_at ||
      null,

    last_error:
      cleanText(
        connection?.last_error
      ) || null,

    last_error_code:
      cleanText(
        connection?.last_error_code
      ) || null,

    updated_at:
      connection?.updated_at ||
      settings?.updated_at ||
      settings?.client_requested_at ||
      null,
  };
}

function mapConnectionToClientWhatsappStatus(
  connectionStatus: string
) {
  if (connectionStatus === "active") {
    return "connected";
  }

  if (connectionStatus === "paused") {
    return "paused";
  }

  if (connectionStatus === "error") {
    return "error";
  }

  if (connectionStatus === "revoked") {
    return "revoked";
  }

  if (
    connectionStatus === "pending" ||
    connectionStatus === "connected" ||
    connectionStatus === "pending_review"
  ) {
    return "connection_requested";
  }

  return "pending_verification";
}

function normalizeConnectionStatus(
  value: unknown
) {
  const status = cleanText(value).toLowerCase();

  const allowedStatuses = [
    "pending",
    "connected",
    "pending_review",
    "active",
    "paused",
    "error",
    "revoked",
  ];

  if (allowedStatuses.includes(status)) {
    return status;
  }

  return "pending_review";
}

function normalizePhone(
  value?: string | null
) {
  return String(value || "")
    .trim()
    .slice(0, 40);
}

function safeText(
  value: unknown,
  maxLength = 1000
) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function cleanText(value: unknown) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

function getFirstText(
  row: any,
  keys: string[]
) {
  for (const key of keys) {
    const value = cleanText(row?.[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function isObject(
  value: unknown
): value is Record<string, any> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(
    error ||
      "Error desconocido."
  );
}