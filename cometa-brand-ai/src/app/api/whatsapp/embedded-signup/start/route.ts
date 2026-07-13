import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  formatBrandName,
  slugifyBrand,
} from "@/lib/brand-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignupType = "coexistence" | "cloud_api";

type StartEmbeddedSignupPayload = {
  brand?: string;
  brandSlug?: string;
  brandName?: string;
  signupType?: SignupType;
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
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type ExistingConnectionRow = {
  id?: string | null;
  connection_status?: string | null;
  status?: string | null;
};

type CreatedSignupSessionRow = {
  id: string;
  brand_slug: string;
  brand_name: string;
  status: string;
  expires_at: string;
  created_at: string;
};

const OPEN_SIGNUP_STATUSES = [
  "created",
  "login_started",
  "code_received",
  "exchanging_token",
  "subscribing_webhook",
  "registering_phone",
];

const SESSION_DURATION_MINUTES = 20;

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

async function requireAuthenticatedUser(): Promise<AuthCheckResult> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: jsonResponse(
        {
          ok: false,
          error:
            "Auth no configurado. Faltan variables públicas de Supabase.",
        },
        500
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
            cookiesToSet.forEach(
              ({ name, value, options }) => {
                cookieStore.set(
                  name,
                  value,
                  options
                );
              }
            );
          } catch {
            // Solo necesitamos leer la sesión.
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
      response: jsonResponse(
        {
          ok: false,
          error:
            "No autenticado. Inicia sesión para continuar.",
        },
        401
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

export async function POST(request: Request) {
  const authCheck =
    await requireAuthenticatedUser();

  if (!authCheck.ok) {
    return authCheck.response;
  }

  try {
    const body =
      await readJsonBody(request);

    const requestedBrand =
      safeText(body.brand, 200) ||
      safeText(body.brandSlug, 200) ||
      safeText(body.brandName, 200);

    if (!requestedBrand) {
      return jsonResponse(
        {
          ok: false,
          error:
            "La marca es obligatoria para iniciar la conexión con Meta.",
        },
        400
      );
    }

    const signupType =
      normalizeSignupType(body.signupType);

    const supabase =
      getSupabaseAdmin();

    const brandAccess =
      await resolveAuthorizedBrand({
        supabase,
        user: authCheck.user,
        requestedBrand,
      });

    if (!brandAccess.ok) {
      return jsonResponse(
        {
          ok: false,
          error: brandAccess.error,
        },
        brandAccess.status
      );
    }

    const { brand } = brandAccess;

    const metaConfig =
      getMetaPublicConfiguration(signupType);

    if (!metaConfig.appId) {
      return jsonResponse(
        {
          ok: false,
          ready: false,
          code: "META_APP_ID_MISSING",
          error:
            "La aplicación de Meta todavía no está configurada en Cometa OS.",
        },
        503
      );
    }

    if (!metaConfig.configId) {
      return jsonResponse(
        {
          ok: false,
          ready: false,
          code:
            signupType === "coexistence"
              ? "META_COEXISTENCE_CONFIG_ID_MISSING"
              : "META_CONFIG_ID_MISSING",
          error:
            signupType === "coexistence"
              ? "Meta todavía no ha habilitado la configuración de Coexistence para Cometa."
              : "Meta todavía no ha habilitado la configuración de Embedded Signup para Cometa.",
        },
        503
      );
    }

    const existingConnection =
      await getExistingConnection({
        supabase,
        brandSlug: brand.slug,
      });

    const existingStatus =
      normalizeConnectionStatus(
        existingConnection?.connection_status ||
          existingConnection?.status
      );

    const mayReconnect =
      !existingConnection?.id ||
      existingStatus === "error" ||
      existingStatus === "revoked" ||
      existingStatus === "not_connected";

    if (!mayReconnect) {
      return jsonResponse(
        {
          ok: false,
          code:
            "WHATSAPP_CONNECTION_ALREADY_EXISTS",
          error:
            existingStatus === "active"
              ? "Esta marca ya tiene una conexión activa de WhatsApp."
              : "Esta marca ya tiene una conexión de WhatsApp en proceso o administrada por Cometa.",
          connectionStatus: existingStatus,
        },
        409
      );
    }

    const now = new Date();

    const expiresAt = new Date(
      now.getTime() +
        SESSION_DURATION_MINUTES *
          60 *
          1000
    );

    await expireOldSessions({
      supabase,
      now: now.toISOString(),
    });

    await cancelPreviousOpenSessions({
      supabase,
      userId: authCheck.user.id,
      brandSlug: brand.slug,
    });

    const state =
      generateSecureState();

    const stateHash =
      hashSignupState(state);

    const { data, error } =
      await supabase
        .from(
          "whatsapp_embedded_signup_sessions"
        )
        .insert({
          user_id: authCheck.user.id,

          brand_slug: brand.slug,
          brand_name: brand.name,

          state_hash: stateHash,

          status: "created",

          app_id: metaConfig.appId,
          config_id: metaConfig.configId,

          graph_api_version:
            metaConfig.graphApiVersion,

          expires_at:
            expiresAt.toISOString(),

          metadata: {
            signup_type: signupType,
            intended_transport:
              "meta_direct",
            intended_agent_mode:
              "observation",
            intended_receive_enabled:
              true,
            intended_agent_enabled:
              true,
            intended_allow_real_send:
              false,
            started_from:
              "sales_ai_connect",
            is_admin:
              brandAccess.isAdmin,
          },
        })
        .select(
          `
            id,
            brand_slug,
            brand_name,
            status,
            expires_at,
            created_at
          `
        )
        .single();

    if (error) {
      throw error;
    }

    const session =
      data as unknown as CreatedSignupSessionRow;

    const { error: eventError } =
      await supabase
        .from(
          "whatsapp_connection_events"
        )
        .insert({
          signup_session_id:
            session.id,

          user_id:
            authCheck.user.id,

          brand_slug:
            brand.slug,

          event_type:
            "embedded_signup_session_created",

          severity: "info",

          message:
            "Se creó una sesión segura de Embedded Signup.",

          payload: {
            signup_type:
              signupType,

            graph_api_version:
              metaConfig.graphApiVersion,

            expires_at:
              session.expires_at,

            intended_transport:
              "meta_direct",
          },
        });

    if (eventError) {
      console.warn(
        "embedded signup start audit:",
        eventError.message
      );
    }

    return jsonResponse({
      ok: true,
      ready: true,

      protected: true,

      brand,

      signup: {
        sessionId:
          session.id,

        /**
         * Este state es una credencial temporal de Cometa OS.
         *
         * El navegador debe conservarlo y enviarlo posteriormente
         * junto con el código recibido de Meta.
         *
         * En Supabase solo almacenamos su hash.
         */
        state,

        signupType,

        appId:
          metaConfig.appId,

        configId:
          metaConfig.configId,

        graphApiVersion:
          metaConfig.graphApiVersion,

        expiresAt:
          session.expires_at,
      },

      security: {
        expiresInMinutes:
          SESSION_DURATION_MINUTES,

        tokenReturned:
          false,

        appSecretReturned:
          false,

        realSendInitiallyEnabled:
          false,
      },
    });
  } catch (error: unknown) {
    console.error(
      "POST /api/whatsapp/embedded-signup/start error:",
      error
    );

    return jsonResponse(
      {
        ok: false,
        error:
          getErrorMessage(error) ||
          "No se pudo iniciar la conexión segura con Meta.",
      },
      500
    );
  }
}

async function readJsonBody(
  request: Request
): Promise<StartEmbeddedSignupPayload> {
  try {
    const body =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return {};
    }

    return body as StartEmbeddedSignupPayload;
  } catch {
    return {};
  }
}

function getMetaPublicConfiguration(
  signupType: SignupType
) {
  const appId =
    safeEnvironmentValue(
      "META_APP_ID"
    ) ||
    safeEnvironmentValue(
      "WHATSAPP_META_APP_ID"
    ) ||
    safeEnvironmentValue(
      "NEXT_PUBLIC_META_APP_ID"
    );

  const coexistenceConfigId =
    safeEnvironmentValue(
      "META_WHATSAPP_COEXISTENCE_CONFIG_ID"
    );

  const standardConfigId =
    safeEnvironmentValue(
      "META_WHATSAPP_CONFIG_ID"
    ) ||
    safeEnvironmentValue(
      "NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID"
    );

  const configId =
    signupType === "coexistence"
      ? coexistenceConfigId ||
        standardConfigId
      : standardConfigId;

  const graphApiVersion =
    normalizeGraphApiVersion(
      safeEnvironmentValue(
        "META_GRAPH_API_VERSION"
      ) || "v25.0"
    );

  return {
    appId,
    configId,
    graphApiVersion,
  };
}

function safeEnvironmentValue(
  key: string
) {
  return String(
    process.env[key] || ""
  ).trim();
}

function normalizeGraphApiVersion(
  value: string
) {
  const normalized =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    !/^v\d+\.\d+$/.test(normalized)
  ) {
    throw new Error(
      "META_GRAPH_API_VERSION debe tener un formato como v25.0."
    );
  }

  return normalized;
}

function normalizeSignupType(
  value: unknown
): SignupType {
  const signupType =
    safeText(value, 50).toLowerCase();

  if (signupType === "cloud_api") {
    return "cloud_api";
  }

  /**
   * Coexistence es el valor predeterminado porque
   * queremos conservar WhatsApp Business en el teléfono.
   */
  return "coexistence";
}

function generateSecureState() {
  return randomBytes(32).toString(
    "base64url"
  );
}

function hashSignupState(
  state: string
) {
  return createHash("sha256")
    .update(state, "utf8")
    .digest("hex");
}

async function expireOldSessions({
  supabase,
  now,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  now: string;
}) {
  const { error } =
    await supabase
      .from(
        "whatsapp_embedded_signup_sessions"
      )
      .update({
        status: "expired",
        error_code:
          "SESSION_EXPIRED",
        error_message:
          "La sesión superó su tiempo máximo permitido.",
      })
      .in(
        "status",
        OPEN_SIGNUP_STATUSES
      )
      .lt("expires_at", now);

  if (error) {
    console.warn(
      "embedded signup expire sessions:",
      error.message
    );
  }
}

async function cancelPreviousOpenSessions({
  supabase,
  userId,
  brandSlug,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  userId: string;
  brandSlug: string;
}) {
  const { error } =
    await supabase
      .from(
        "whatsapp_embedded_signup_sessions"
      )
      .update({
        status: "cancelled",
        error_code:
          "SESSION_REPLACED",
        error_message:
          "La sesión fue reemplazada por una conexión más reciente.",
      })
      .eq("user_id", userId)
      .eq("brand_slug", brandSlug)
      .in(
        "status",
        OPEN_SIGNUP_STATUSES
      );

  if (error) {
    console.warn(
      "embedded signup cancel sessions:",
      error.message
    );
  }
}

async function getExistingConnection({
  supabase,
  brandSlug,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  brandSlug: string;
}): Promise<ExistingConnectionRow | null> {
  const { data, error } =
    await supabase
      .from(
        "whatsapp_connections"
      )
      .select(
        `
          id,
          connection_status,
          status
        `
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
    ? (data as unknown as ExistingConnectionRow)
    : null;
}

function normalizeConnectionStatus(
  value: unknown
) {
  const status =
    safeText(value, 100).toLowerCase();

  const allowed = [
    "not_connected",
    "pending",
    "connected",
    "pending_review",
    "active",
    "paused",
    "error",
    "revoked",
  ];

  if (allowed.includes(status)) {
    return status;
  }

  return status
    ? "pending_review"
    : "not_connected";
}

async function resolveAuthorizedBrand({
  supabase,
  user,
  requestedBrand,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  user: AuthenticatedUser;
  requestedBrand: string;
}): Promise<BrandAccessResult> {
  const profile =
    await getUserProfile({
      supabase,
      userId: user.id,
    });

  if (
    profile &&
    String(
      profile.status || ""
    ).toLowerCase() !== "active"
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "Tu usuario está inactivo. Solicita acceso a Cometa.",
    };
  }

  const isAdmin =
    String(
      profile?.role || ""
    ).toLowerCase() ===
      "admin" &&
    String(
      profile?.status || ""
    ).toLowerCase() ===
      "active";

  const { data: accessRows, error } =
    await supabase
      .from("user_brand_access")
      .select(
        "brand_slug,access_role,status"
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "status",
        "active"
      )
      .limit(100);

  if (error) {
    throw error;
  }

  const authorizedSlugs =
    Array.from(
      new Set(
        (
          Array.isArray(accessRows)
            ? accessRows
            : []
        )
          .map((row: any) =>
            slugifyBrand(
              String(
                row.brand_slug || ""
              )
            )
          )
          .filter(Boolean)
      )
    );

  const requestedSlug =
    slugifyBrand(requestedBrand);

  if (!requestedSlug) {
    return {
      ok: false,
      status: 400,
      error:
        "La marca solicitada no es válida.",
    };
  }

  if (
    !isAdmin &&
    !authorizedSlugs.includes(
      requestedSlug
    )
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "No tienes autorización para conectar WhatsApp en esa marca.",
    };
  }

  const brandName =
    await resolveBrandNameBySlug({
      supabase,
      brandSlug: requestedSlug,
    });

  return {
    ok: true,

    brand: {
      slug: requestedSlug,
      name: brandName,
    },

    isAdmin,
  };
}

async function getUserProfile({
  supabase,
  userId,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  userId: string;
}) {
  const byUserId =
    await supabase
      .from("user_profiles")
      .select(
        "user_id,id,email,role,status"
      )
      .eq(
        "user_id",
        userId
      )
      .maybeSingle();

  if (
    !byUserId.error &&
    byUserId.data
  ) {
    return byUserId.data;
  }

  const byId =
    await supabase
      .from("user_profiles")
      .select(
        "user_id,id,email,role,status"
      )
      .eq(
        "id",
        userId
      )
      .maybeSingle();

  if (
    !byId.error &&
    byId.data
  ) {
    return byId.data;
  }

  if (
    byUserId.error &&
    byId.error
  ) {
    console.warn(
      "embedded signup profile lookup:",
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
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  brandSlug: string;
}) {
  const cleanSlug =
    slugifyBrand(brandSlug);

  if (!cleanSlug) {
    return "Marca sin nombre";
  }

  const { data: connection } =
    await supabase
      .from(
        "whatsapp_connections"
      )
      .select(
        "brand_name,business_name"
      )
      .eq(
        "brand_slug",
        cleanSlug
      )
      .order("updated_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  const connectionName =
    cleanText(
      connection?.brand_name
    ) ||
    cleanText(
      connection?.business_name
    );

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
      const { data, error } =
        await supabase
          .from(source.table)
          .select("*")
          .eq(
            source.slugColumn,
            cleanSlug
          )
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

  try {
    const { data, error } =
      await supabase
        .from(
          "sales_ai_settings"
        )
        .select("brand_name")
        .limit(500);

    if (
      !error &&
      Array.isArray(data)
    ) {
      const matchingSetting =
        data.find(
          (row: any) =>
            slugifyBrand(
              String(
                row.brand_name || ""
              )
            ) === cleanSlug
        );

      if (
        matchingSetting?.brand_name
      ) {
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

function safeText(
  value: unknown,
  maxLength = 1000
) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function cleanText(
  value: unknown
) {
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
    const value =
      cleanText(row?.[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function getErrorMessage(
  error: unknown
) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(
    error ||
      "Error desconocido."
  );
}