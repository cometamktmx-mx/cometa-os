import "server-only";

import {
  createHash,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { slugifyBrand } from "@/lib/brand-resolver";
import { encryptWhatsappToken } from "@/lib/whatsapp/token-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type CompleteSignupPayload = {
  sessionId?: string;
  state?: string;
  code?: string;

  wabaId?: string;
  phoneNumberId?: string;
  metaBusinessId?: string;
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

type SignupSessionRow = {
  id: string;
  user_id: string;

  brand_slug: string;
  brand_name: string;

  state_hash: string;
  status: string;

  app_id?: string | null;
  config_id?: string | null;
  graph_api_version?: string | null;

  expires_at: string;

  metadata?: Record<string, unknown> | null;
};

type MetaTokenResponse = {
  access_token?: string;
  token_type?: string;
};

type MetaPhoneNumberRow = {
  id?: string | null;
  display_phone_number?: string | null;
  verified_name?: string | null;
  status?: string | null;
  quality_rating?: string | null;
};

type MetaPhoneNumbersResponse = {
  data?: MetaPhoneNumberRow[];
};

type ExistingConnectionRow = {
  id: string;
  brand_slug?: string | null;
  phone_number_id?: string | null;
  connection_status?: string | null;
  status?: string | null;
};

type SavedConnectionRow = {
  id: string;
  brand_slug?: string | null;
  brand_name?: string | null;
  display_phone_number?: string | null;
  phone_number_id?: string | null;
  waba_id?: string | null;
  connection_status?: string | null;
};

class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor({
    message,
    status = 500,
    code = "INTERNAL_ERROR",
    details,
  }: {
    message: string;
    status?: number;
    code?: string;
    details?: Record<string, unknown>;
  }) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class MetaApiError extends ApiError {
  metaStatus?: number;
  metaCode?: string;
  metaSubcode?: string;

  constructor({
    message,
    operation,
    metaStatus,
    metaCode,
    metaSubcode,
  }: {
    message: string;
    operation: string;
    metaStatus?: number;
    metaCode?: string;
    metaSubcode?: string;
  }) {
    super({
      message,
      status: 502,
      code: "META_API_ERROR",
      details: {
        operation,
        metaStatus,
        metaCode,
        metaSubcode,
      },
    });

    this.name = "MetaApiError";
    this.metaStatus = metaStatus;
    this.metaCode = metaCode;
    this.metaSubcode = metaSubcode;
  }
}

function getSupabaseAdmin() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new ApiError({
      message:
        "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
      status: 500,
      code: "SUPABASE_ADMIN_NOT_CONFIGURED",
    });
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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
            // Esta ruta solamente necesita leer la sesión.
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

  const supabase =
    getSupabaseAdmin();

  let signupSession:
    | SignupSessionRow
    | null = null;

  let connectionId:
    | string
    | null = null;

  try {
    const body =
      await readJsonBody(request);

    const sessionId =
      safeText(body.sessionId, 100);

    const state =
      safeText(body.state, 500);

    const code =
      safeText(body.code, 5000);

    const wabaId =
      normalizeMetaIdentifier(
        body.wabaId,
        "WABA ID"
      );

    const phoneNumberId =
      normalizeMetaIdentifier(
        body.phoneNumberId,
        "Phone Number ID"
      );

    const metaBusinessId =
      body.metaBusinessId
        ? normalizeMetaIdentifier(
            body.metaBusinessId,
            "Meta Business ID"
          )
        : null;

    if (
      !sessionId ||
      !state ||
      !code ||
      !wabaId ||
      !phoneNumberId
    ) {
      throw new ApiError({
        message:
          "Faltan los datos necesarios para completar la conexión con Meta.",
        status: 400,
        code: "EMBEDDED_SIGNUP_DATA_MISSING",
      });
    }

    signupSession =
      await getSignupSession({
        supabase,
        sessionId,
        userId: authCheck.user.id,
      });

    validateSignupSession({
      session: signupSession,
      state,
    });

    await requireCurrentBrandAccess({
      supabase,
      userId: authCheck.user.id,
      brandSlug:
        signupSession.brand_slug,
    });

    const metaConfig =
      getMetaServerConfiguration(
        signupSession
      );

    await updateSignupSession({
      supabase,
      sessionId: signupSession.id,
      update: {
        status: "code_received",
        code_received_at:
          new Date().toISOString(),
        waba_id: wabaId,
        phone_number_id:
          phoneNumberId,
        meta_business_id:
          metaBusinessId,
        error_code: null,
        error_message: null,
      },
    });

    await createAuditEvent({
      supabase,
      signupSessionId:
        signupSession.id,
      userId:
        authCheck.user.id,
      brandSlug:
        signupSession.brand_slug,
      eventType:
        "embedded_signup_code_received",
      message:
        "Cometa OS recibió el código temporal de Meta.",
      payload: {
        waba_id: wabaId,
        phone_number_id:
          phoneNumberId,
        signup_type:
          signupSession.metadata?.signup_type ||
          "coexistence",
      },
    });

    await updateSignupSession({
      supabase,
      sessionId: signupSession.id,
      update: {
        status: "exchanging_token",
        exchange_started_at:
          new Date().toISOString(),
      },
    });

    const tokenResponse =
      await exchangeMetaCode({
        appId: metaConfig.appId,
        appSecret:
          metaConfig.appSecret,
        graphApiVersion:
          metaConfig.graphApiVersion,
        code,
      });

    const accessToken =
      safeText(
        tokenResponse.access_token,
        10000
      );

    if (!accessToken) {
      throw new MetaApiError({
        message:
          "Meta no devolvió un token empresarial válido.",
        operation:
          "exchange_code",
      });
    }

    const phone =
      await validatePhoneBelongsToWaba({
        graphApiVersion:
          metaConfig.graphApiVersion,
        accessToken,
        wabaId,
        phoneNumberId,
      });

    await ensurePhoneIsNotAssignedToAnotherBrand({
      supabase,
      phoneNumberId,
      brandSlug:
        signupSession.brand_slug,
    });

    const encryptedToken =
      encryptWhatsappToken(
        accessToken
      );

    const twoStepPin =
      generateSecureSixDigitPin();

    const encryptedPin =
      encryptWhatsappToken(
        twoStepPin
      );

    const savedConnection =
      await createPendingConnection({
        supabase,

        session:
          signupSession,

        userId:
          authCheck.user.id,

        metaConfig,

        metaBusinessId,

        wabaId,
        phoneNumberId,

        phone,
      });

    connectionId =
      savedConnection.id;

    await saveEncryptedSecrets({
      supabase,
      connectionId,
      encryptedToken,
      encryptedPin,
      tokenType:
        safeText(
          tokenResponse.token_type,
          100
        ) ||
        "business_integration_system_user",
    });

    await updateSignupSession({
      supabase,
      sessionId:
        signupSession.id,
      update: {
        exchange_completed_at:
          new Date().toISOString(),
        status:
          "subscribing_webhook",
      },
    });

    await subscribeAppToWaba({
      graphApiVersion:
        metaConfig.graphApiVersion,
      accessToken,
      wabaId,
    });

    const subscribedAt =
      new Date().toISOString();

    await supabase
      .from("whatsapp_connections")
      .update({
        subscribed_apps_at:
          subscribedAt,

        webhook_status:
          "active",

        webhook_verified:
          true,

        updated_at:
          subscribedAt,
      })
      .eq("id", connectionId);

    await updateSignupSession({
      supabase,
      sessionId:
        signupSession.id,
      update: {
        status:
          "registering_phone",
      },
    });

    await registerPhoneNumber({
      graphApiVersion:
        metaConfig.graphApiVersion,
      accessToken,
      phoneNumberId,
      pin: twoStepPin,
    });

    const completedAt =
      new Date().toISOString();

    const {
      data: finalConnection,
      error: finalConnectionError,
    } = await supabase
      .from("whatsapp_connections")
      .update({
        connection_status:
          "pending_review",

        /**
         * Campo heredado de la tabla original.
         * connection_status es la fuente principal.
         */
        status: "active",

        webhook_status:
          "active",

        webhook_verified:
          true,

        receive_enabled:
          true,

        /**
         * SALES AI puede analizar.
         * Todavía no puede responder automáticamente.
         */
        agent_enabled:
          true,

        allow_real_send:
          false,

        connected_at:
          completedAt,

        phone_registered_at:
          completedAt,

        token_last_rotated_at:
          completedAt,

        last_error: null,
        last_error_code:
          null,

        updated_at:
          completedAt,
      })
      .eq("id", connectionId)
      .select(
        `
          id,
          brand_slug,
          brand_name,
          display_phone_number,
          phone_number_id,
          waba_id,
          connection_status
        `
      )
      .single();

    if (
      finalConnectionError ||
      !finalConnection
    ) {
      throw (
        finalConnectionError ||
        new Error(
          "No fue posible finalizar la conexión local."
        )
      );
    }

    await synchronizeSalesAiSettings({
      supabase,
      brandName:
        signupSession.brand_name,
      displayPhoneNumber:
        safeText(
          phone.display_phone_number,
          100
        ),
      phoneNumberId,
      wabaId,
      now: completedAt,
    });

    await updateSignupSession({
      supabase,
      sessionId:
        signupSession.id,
      update: {
        status: "completed",
        waba_id: wabaId,
        phone_number_id:
          phoneNumberId,
        meta_business_id:
          metaBusinessId,
        error_code: null,
        error_message: null,
      },
    });

    await createAuditEvent({
      supabase,
      connectionId,
      signupSessionId:
        signupSession.id,
      userId:
        authCheck.user.id,
      brandSlug:
        signupSession.brand_slug,
      eventType:
        "embedded_signup_completed",
      message:
        "La conexión de WhatsApp fue registrada y quedó pendiente de revisión de Cometa.",
      payload: {
        waba_id: wabaId,
        phone_number_id:
          phoneNumberId,
        display_phone_number:
          phone.display_phone_number ||
          null,
        verified_name:
          phone.verified_name ||
          null,
        quality_rating:
          phone.quality_rating ||
          null,
        webhook_subscribed:
          true,
        phone_registered:
          true,
        receive_enabled:
          true,
        agent_enabled:
          true,
        allow_real_send:
          false,
      },
    });

    const safeConnection =
      finalConnection as unknown as SavedConnectionRow;

    return jsonResponse({
      ok: true,

      completed: true,
      protected: true,

      message:
        "WhatsApp quedó conectado. SALES AI iniciará en observación y los envíos reales permanecerán bloqueados hasta la aprobación de Cometa.",

      brand: {
        slug:
          signupSession.brand_slug,
        name:
          signupSession.brand_name,
      },

      connection: {
        id:
          safeConnection.id,

        status:
          safeConnection.connection_status ||
          "pending_review",

        displayPhoneNumber:
          safeConnection.display_phone_number ||
          phone.display_phone_number ||
          null,

        verifiedName:
          phone.verified_name ||
          null,

        webhookStatus:
          "active",

        receiveEnabled:
          true,

        agentEnabled:
          true,

        realSendEnabled:
          false,
      },

      security: {
        tokenStoredEncrypted:
          true,

        pinStoredEncrypted:
          true,

        tokenReturned:
          false,

        pinReturned:
          false,

        appSecretReturned:
          false,
      },
    });
  } catch (error: unknown) {
    const normalizedError =
      normalizeError(error);

    console.error(
      "POST /api/whatsapp/embedded-signup/complete:",
      {
        code:
          normalizedError.code,
        status:
          normalizedError.status,
        message:
          normalizedError.message,
      }
    );

    if (connectionId) {
      await markConnectionAsFailed({
        supabase,
        connectionId,
        error:
          normalizedError,
      });
    }

    if (signupSession?.id) {
      await markSignupSessionAsFailed({
        supabase,
        session:
          signupSession,
        userId:
          authCheck.user.id,
        connectionId,
        error:
          normalizedError,
      });
    }

    return jsonResponse(
      {
        ok: false,
        code:
          normalizedError.code,
        error:
          normalizedError.message,
      },
      normalizedError.status
    );
  }
}

async function readJsonBody(
  request: Request
): Promise<CompleteSignupPayload> {
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

    return body as CompleteSignupPayload;
  } catch {
    return {};
  }
}

async function getSignupSession({
  supabase,
  sessionId,
  userId,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  sessionId: string;
  userId: string;
}): Promise<SignupSessionRow> {
  const { data, error } =
    await supabase
      .from(
        "whatsapp_embedded_signup_sessions"
      )
      .select(
        `
          id,
          user_id,
          brand_slug,
          brand_name,
          state_hash,
          status,
          app_id,
          config_id,
          graph_api_version,
          expires_at,
          metadata
        `
      )
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new ApiError({
      message:
        "La sesión de conexión no existe o no pertenece a este usuario.",
      status: 404,
      code:
        "SIGNUP_SESSION_NOT_FOUND",
    });
  }

  return data as unknown as SignupSessionRow;
}

function validateSignupSession({
  session,
  state,
}: {
  session: SignupSessionRow;
  state: string;
}) {
  if (
    session.status === "completed"
  ) {
    throw new ApiError({
      message:
        "Esta conexión ya fue completada.",
      status: 409,
      code:
        "SIGNUP_SESSION_ALREADY_COMPLETED",
    });
  }

  const allowedStatuses = [
    "created",
    "login_started",
  ];

  if (
    !allowedStatuses.includes(
      session.status
    )
  ) {
    throw new ApiError({
      message:
        "Esta sesión ya no puede utilizarse. Inicia una conexión nueva.",
      status: 409,
      code:
        "SIGNUP_SESSION_NOT_AVAILABLE",
    });
  }

  const expiresAt =
    new Date(
      session.expires_at
    ).getTime();

  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    throw new ApiError({
      message:
        "La sesión de conexión expiró. Inicia nuevamente el proceso.",
      status: 410,
      code:
        "SIGNUP_SESSION_EXPIRED",
    });
  }

  const suppliedHash =
    createHash("sha256")
      .update(state, "utf8")
      .digest("hex");

  if (
    !safeHexEqual(
      suppliedHash,
      session.state_hash
    )
  ) {
    throw new ApiError({
      message:
        "La validación de seguridad de la conexión no coincide.",
      status: 403,
      code:
        "SIGNUP_STATE_INVALID",
    });
  }
}

function safeHexEqual(
  first: string,
  second: string
) {
  try {
    const firstBuffer =
      Buffer.from(first, "hex");

    const secondBuffer =
      Buffer.from(second, "hex");

    if (
      firstBuffer.length === 0 ||
      firstBuffer.length !==
        secondBuffer.length
    ) {
      return false;
    }

    return timingSafeEqual(
      firstBuffer,
      secondBuffer
    );
  } catch {
    return false;
  }
}

function getMetaServerConfiguration(
  session: SignupSessionRow
) {
  const appId =
    safeText(
      process.env.META_APP_ID ||
        process.env.WHATSAPP_META_APP_ID ||
        process.env.NEXT_PUBLIC_META_APP_ID,
      100
    );

  const appSecret =
    safeText(
      process.env.META_APP_SECRET,
      500
    );

  const graphApiVersion =
    normalizeGraphApiVersion(
      session.graph_api_version ||
        process.env.META_GRAPH_API_VERSION ||
        "v25.0"
    );

  if (!appId) {
    throw new ApiError({
      message:
        "META_APP_ID no está configurado.",
      status: 503,
      code:
        "META_APP_ID_MISSING",
    });
  }

  if (!appSecret) {
    throw new ApiError({
      message:
        "META_APP_SECRET no está configurado.",
      status: 503,
      code:
        "META_APP_SECRET_MISSING",
    });
  }

  if (
    session.app_id &&
    session.app_id !== appId
  ) {
    throw new ApiError({
      message:
        "La sesión pertenece a otra configuración de Meta.",
      status: 409,
      code:
        "META_APP_SESSION_MISMATCH",
    });
  }

  return {
    appId,
    appSecret,
    graphApiVersion,
    configId:
      session.config_id || null,
  };
}

async function exchangeMetaCode({
  appId,
  appSecret,
  graphApiVersion,
  code,
}: {
  appId: string;
  appSecret: string;
  graphApiVersion: string;
  code: string;
}): Promise<MetaTokenResponse> {
  const query =
    new URLSearchParams({
      client_id: appId,
      client_secret:
        appSecret,
      code,
    });

  return metaFetchJson<MetaTokenResponse>({
    url:
      `https://graph.facebook.com/${graphApiVersion}` +
      `/oauth/access_token?${query.toString()}`,

    operation:
      "exchange_code",

    init: {
      method: "GET",
      cache: "no-store",
    },
  });
}

async function validatePhoneBelongsToWaba({
  graphApiVersion,
  accessToken,
  wabaId,
  phoneNumberId,
}: {
  graphApiVersion: string;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
}): Promise<MetaPhoneNumberRow> {
  const fields = [
    "id",
    "display_phone_number",
    "verified_name",
    "status",
    "quality_rating",
  ].join(",");

  const response =
    await metaFetchJson<MetaPhoneNumbersResponse>({
      url:
        `https://graph.facebook.com/${graphApiVersion}` +
        `/${encodeURIComponent(wabaId)}` +
        `/phone_numbers?fields=${encodeURIComponent(fields)}`,

      operation:
        "validate_phone_number",

      init: {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    });

  const phone =
    Array.isArray(response.data)
      ? response.data.find(
          (item) =>
            safeText(item.id, 100) ===
            phoneNumberId
        )
      : null;

  if (!phone) {
    throw new ApiError({
      message:
        "El número recibido no pertenece a la cuenta de WhatsApp seleccionada.",
      status: 403,
      code:
        "PHONE_NUMBER_WABA_MISMATCH",
    });
  }

  return phone;
}

async function subscribeAppToWaba({
  graphApiVersion,
  accessToken,
  wabaId,
}: {
  graphApiVersion: string;
  accessToken: string;
  wabaId: string;
}) {
  await metaFetchJson<{
    success?: boolean;
  }>({
    url:
      `https://graph.facebook.com/${graphApiVersion}` +
      `/${encodeURIComponent(wabaId)}` +
      `/subscribed_apps`,

    operation:
      "subscribe_webhook",

    init: {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({}),
    },
  });
}

async function registerPhoneNumber({
  graphApiVersion,
  accessToken,
  phoneNumberId,
  pin,
}: {
  graphApiVersion: string;
  accessToken: string;
  phoneNumberId: string;
  pin: string;
}) {
  await metaFetchJson<{
    success?: boolean;
  }>({
    url:
      `https://graph.facebook.com/${graphApiVersion}` +
      `/${encodeURIComponent(phoneNumberId)}` +
      `/register`,

    operation:
      "register_phone_number",

    init: {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        messaging_product:
          "whatsapp",
        pin,
      }),
    },
  });
}

async function metaFetchJson<T>({
  url,
  operation,
  init,
}: {
  url: string;
  operation: string;
  init: RequestInit;
}): Promise<T> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, 30000);

  try {
    const response =
      await fetch(url, {
        ...init,
        signal:
          controller.signal,
      });

    const text =
      await response.text();

    let payload: any = {};

    if (text) {
      try {
        payload =
          JSON.parse(text);
      } catch {
        payload = {};
      }
    }

    if (!response.ok) {
      const metaError =
        payload?.error || {};

      throw new MetaApiError({
        message:
          safeText(
            metaError.message,
            1000
          ) ||
          `Meta rechazó la operación ${operation}.`,

        operation,

        metaStatus:
          response.status,

        metaCode:
          metaError.code !==
          undefined
            ? String(
                metaError.code
              )
            : undefined,

        metaSubcode:
          metaError.error_subcode !==
          undefined
            ? String(
                metaError.error_subcode
              )
            : undefined,
      });
    }

    return payload as T;
  } catch (error: unknown) {
    if (
      error instanceof
      MetaApiError
    ) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new MetaApiError({
        message:
          "Meta tardó demasiado en responder.",
        operation,
        metaStatus: 504,
      });
    }

    throw new MetaApiError({
      message:
        error instanceof Error
          ? error.message
          : "No fue posible comunicarse con Meta.",
      operation,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function createPendingConnection({
  supabase,
  session,
  userId,
  metaConfig,
  metaBusinessId,
  wabaId,
  phoneNumberId,
  phone,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  session: SignupSessionRow;
  userId: string;

  metaConfig: {
    appId: string;
    appSecret: string;
    graphApiVersion: string;
    configId: string | null;
  };

  metaBusinessId: string | null;
  wabaId: string;
  phoneNumberId: string;
  phone: MetaPhoneNumberRow;
}): Promise<SavedConnectionRow> {
  const brandSlug =
    slugifyBrand(
      session.brand_slug
    );

  const now =
    new Date().toISOString();

  const connectionData = {
    brand_slug:
      brandSlug,

    brand_name:
      session.brand_name,

    business_name:
      session.brand_name,

    display_phone_number:
      safeText(
        phone.display_phone_number,
        100
      ) || null,

    phone_number:
      safeText(
        phone.display_phone_number,
        100
      ) || null,

    phone_number_id:
      phoneNumberId,

    whatsapp_business_account_id:
      wabaId,

    waba_id:
      wabaId,

    verified_name:
      safeText(
        phone.verified_name,
        300
      ) || null,

    connection_status:
      "pending",

    /**
     * Compatibilidad con el campo heredado.
     */
    status:
      "active",

    webhook_status:
      "pending",

    webhook_verified:
      false,

    receive_enabled:
      false,

    agent_enabled:
      false,

    allow_real_send:
      false,

    created_by_user_id:
      userId,

    meta_business_id:
      metaBusinessId,

    meta_app_id:
      metaConfig.appId,

    meta_config_id:
      metaConfig.configId,

    onboarding_source:
      "embedded_signup",

    onboarding_session_id:
      session.id,

    last_error:
      null,

    last_error_code:
      null,

    updated_at:
      now,
  };

  const { data: existing } =
    await supabase
      .from(
        "whatsapp_connections"
      )
      .select(
        `
          id,
          brand_slug,
          phone_number_id,
          connection_status,
          status
        `
      )
      .eq(
        "brand_slug",
        brandSlug
      )
      .order("updated_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (existing?.id) {
    const { data, error } =
      await supabase
        .from(
          "whatsapp_connections"
        )
        .update(
          connectionData
        )
        .eq(
          "id",
          existing.id
        )
        .select(
          `
            id,
            brand_slug,
            brand_name,
            display_phone_number,
            phone_number_id,
            waba_id,
            connection_status
          `
        )
        .single();

    if (error || !data) {
      throw (
        error ||
        new Error(
          "No fue posible actualizar la conexión."
        )
      );
    }

    return data as unknown as SavedConnectionRow;
  }

  const { data, error } =
    await supabase
      .from(
        "whatsapp_connections"
      )
      .insert(
        connectionData
      )
      .select(
        `
          id,
          brand_slug,
          brand_name,
          display_phone_number,
          phone_number_id,
          waba_id,
          connection_status
        `
      )
      .single();

  if (error || !data) {
    throw (
      error ||
      new Error(
        "No fue posible crear la conexión."
      )
    );
  }

  return data as unknown as SavedConnectionRow;
}

async function saveEncryptedSecrets({
  supabase,
  connectionId,
  encryptedToken,
  encryptedPin,
  tokenType,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;

  connectionId: string;

  encryptedToken:
    ReturnType<
      typeof encryptWhatsappToken
    >;

  encryptedPin:
    ReturnType<
      typeof encryptWhatsappToken
    >;

  tokenType: string;
}) {
  const { error } =
    await supabase
      .from(
        "whatsapp_connection_secrets"
      )
      .upsert(
        {
          connection_id:
            connectionId,

          token_ciphertext:
            encryptedToken.tokenCiphertext,

          token_iv:
            encryptedToken.tokenIv,

          token_auth_tag:
            encryptedToken.tokenAuthTag,

          token_algorithm:
            encryptedToken.tokenAlgorithm,

          token_type:
            tokenType,

          key_version:
            encryptedToken.keyVersion,

          token_expires_at:
            null,

          phone_pin_ciphertext:
            encryptedPin.tokenCiphertext,

          phone_pin_iv:
            encryptedPin.tokenIv,

          phone_pin_auth_tag:
            encryptedPin.tokenAuthTag,

          phone_pin_algorithm:
            encryptedPin.tokenAlgorithm,

          phone_pin_key_version:
            encryptedPin.keyVersion,

          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "connection_id",
        }
      );

  if (error) {
    throw error;
  }
}

async function ensurePhoneIsNotAssignedToAnotherBrand({
  supabase,
  phoneNumberId,
  brandSlug,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  phoneNumberId: string;
  brandSlug: string;
}) {
  const { data, error } =
    await supabase
      .from(
        "whatsapp_connections"
      )
      .select(
        `
          id,
          brand_slug,
          phone_number_id,
          connection_status,
          status
        `
      )
      .eq(
        "phone_number_id",
        phoneNumberId
      )
      .neq(
        "brand_slug",
        slugifyBrand(brandSlug)
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (data?.id) {
    throw new ApiError({
      message:
        "Este número de WhatsApp ya está asignado a otra marca dentro de Cometa OS.",
      status: 409,
      code:
        "PHONE_NUMBER_ALREADY_ASSIGNED",
    });
  }
}

async function requireCurrentBrandAccess({
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
  const profile =
    await getUserProfile({
      supabase,
      userId,
    });

  const profileStatus =
    safeText(
      profile?.status,
      100
    ).toLowerCase();

  const profileRole =
    safeText(
      profile?.role,
      100
    ).toLowerCase();

  if (
    profile &&
    profileStatus !== "active"
  ) {
    throw new ApiError({
      message:
        "Tu usuario está inactivo.",
      status: 403,
      code:
        "USER_INACTIVE",
    });
  }

  if (
    profileRole === "admin" &&
    profileStatus === "active"
  ) {
    return;
  }

  const { data, error } =
    await supabase
      .from(
        "user_brand_access"
      )
      .select("id")
      .eq(
        "user_id",
        userId
      )
      .eq(
        "brand_slug",
        slugifyBrand(brandSlug)
      )
      .eq(
        "status",
        "active"
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new ApiError({
      message:
        "Ya no tienes autorización para conectar WhatsApp en esta marca.",
      status: 403,
      code:
        "BRAND_ACCESS_REVOKED",
    });
  }
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
        "id,user_id,role,status"
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
        "id,user_id,role,status"
      )
      .eq("id", userId)
      .maybeSingle();

  if (
    !byId.error &&
    byId.data
  ) {
    return byId.data;
  }

  return null;
}

async function updateSignupSession({
  supabase,
  sessionId,
  update,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  sessionId: string;
  update: Record<
    string,
    unknown
  >;
}) {
  const { error } =
    await supabase
      .from(
        "whatsapp_embedded_signup_sessions"
      )
      .update(update)
      .eq("id", sessionId);

  if (error) {
    throw error;
  }
}

async function synchronizeSalesAiSettings({
  supabase,
  brandName,
  displayPhoneNumber,
  phoneNumberId,
  wabaId,
  now,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  brandName: string;
  displayPhoneNumber: string;
  phoneNumberId: string;
  wabaId: string;
  now: string;
}) {
  const { error } =
    await supabase
      .from(
        "sales_ai_settings"
      )
      .update({
        whatsapp_status:
          "connected",

        whatsapp_phone_number:
          displayPhoneNumber ||
          null,

        whatsapp_phone_number_id:
          phoneNumberId,

        whatsapp_business_account_id:
          wabaId,

        agent_mode:
          "observation",

        auto_reply_enabled:
          false,

        send_whatsapp_enabled:
          false,

        client_connection_status:
          "connected",

        updated_at:
          now,
      })
      .ilike(
        "brand_name",
        brandName
      );

  if (error) {
    console.warn(
      "embedded signup sales_ai_settings:",
      error.message
    );
  }
}

async function createAuditEvent({
  supabase,
  connectionId,
  signupSessionId,
  userId,
  brandSlug,
  eventType,
  message,
  severity = "info",
  payload = {},
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;

  connectionId?: string | null;
  signupSessionId?: string | null;
  userId?: string | null;

  brandSlug: string;
  eventType: string;
  message: string;

  severity?:
    | "info"
    | "warning"
    | "error"
    | "critical";

  payload?: Record<
    string,
    unknown
  >;
}) {
  const { error } =
    await supabase
      .from(
        "whatsapp_connection_events"
      )
      .insert({
        connection_id:
          connectionId || null,

        signup_session_id:
          signupSessionId || null,

        user_id:
          userId || null,

        brand_slug:
          brandSlug,

        event_type:
          eventType,

        severity,

        message,

        payload,
      });

  if (error) {
    console.warn(
      "embedded signup audit:",
      error.message
    );
  }
}

async function markConnectionAsFailed({
  supabase,
  connectionId,
  error,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;
  connectionId: string;
  error: ApiError;
}) {
  await supabase
    .from(
      "whatsapp_connections"
    )
    .update({
      connection_status:
        "error",

      receive_enabled:
        false,

      agent_enabled:
        false,

      allow_real_send:
        false,

      last_error:
        error.message,

      last_error_code:
        error.code,

      updated_at:
        new Date().toISOString(),
    })
    .eq("id", connectionId);
}

async function markSignupSessionAsFailed({
  supabase,
  session,
  userId,
  connectionId,
  error,
}: {
  supabase: ReturnType<
    typeof getSupabaseAdmin
  >;

  session:
    SignupSessionRow;

  userId: string;

  connectionId:
    string | null;

  error:
    ApiError;
}) {
  await supabase
    .from(
      "whatsapp_embedded_signup_sessions"
    )
    .update({
      status: "failed",
      error_code:
        error.code,
      error_message:
        error.message,
    })
    .eq("id", session.id);

  await createAuditEvent({
    supabase,
    connectionId,
    signupSessionId:
      session.id,
    userId,
    brandSlug:
      session.brand_slug,
    eventType:
      "embedded_signup_failed",
    severity: "error",
    message:
      error.message,
    payload: {
      error_code:
        error.code,
      ...(error.details || {}),
    },
  });
}

function generateSecureSixDigitPin() {
  return randomInt(
    0,
    1000000
  )
    .toString()
    .padStart(6, "0");
}

function normalizeMetaIdentifier(
  value: unknown,
  label: string
) {
  const identifier =
    safeText(value, 100);

  if (
    !identifier ||
    !/^\d{5,40}$/.test(
      identifier
    )
  ) {
    throw new ApiError({
      message:
        `${label} no tiene un formato válido.`,
      status: 400,
      code:
        "META_IDENTIFIER_INVALID",
    });
  }

  return identifier;
}

function normalizeGraphApiVersion(
  value: string
) {
  const normalized =
    safeText(
      value,
      20
    ).toLowerCase();

  if (
    !/^v\d+\.\d+$/.test(
      normalized
    )
  ) {
    throw new ApiError({
      message:
        "META_GRAPH_API_VERSION debe tener un formato como v25.0.",
      status: 500,
      code:
        "META_GRAPH_VERSION_INVALID",
    });
  }

  return normalized;
}

function safeText(
  value: unknown,
  maxLength = 1000
) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function normalizeError(
  error: unknown
): ApiError {
  if (
    error instanceof ApiError
  ) {
    return error;
  }

  if (
    error instanceof Error
  ) {
    return new ApiError({
      message:
        error.message ||
        "No fue posible completar la conexión con Meta.",
      status: 500,
      code:
        "EMBEDDED_SIGNUP_COMPLETE_FAILED",
    });
  }

  return new ApiError({
    message:
      "No fue posible completar la conexión con Meta.",
    status: 500,
    code:
      "EMBEDDED_SIGNUP_COMPLETE_FAILED",
  });
}