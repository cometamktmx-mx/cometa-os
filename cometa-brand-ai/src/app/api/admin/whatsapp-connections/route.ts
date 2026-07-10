import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const CONNECTION_STATUSES = [
  "pending",
  "connected",
  "pending_review",
  "active",
  "paused",
  "error",
  "revoked",
] as const;

const CONTROL_FIELDS = [
  "receive_enabled",
  "agent_enabled",
  "allow_real_send",
] as const;

type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
type ControlField = (typeof CONTROL_FIELDS)[number];

type AdminResult =
  | {
      ok: true;
      userId: string;
      email: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

type WhatsappConnectionRow = {
  id: string;

  client_id?: string | null;

  brand_slug?: string | null;
  brand_name?: string | null;

  business_name?: string | null;

  phone_number?: string | null;
  phone_number_id?: string | null;
  display_phone_number?: string | null;

  whatsapp_business_account_id?: string | null;
  waba_id?: string | null;

  verified_name?: string | null;

  webhook_verified?: boolean | null;
  webhook_status?: string | null;

  status?: string | null;
  connection_status?: string | null;

  receive_enabled?: boolean | null;
  agent_enabled?: boolean | null;
  allow_real_send?: boolean | null;

  token_source?: string | null;
  token_expires_at?: string | null;

  connected_at?: string | null;
  approved_at?: string | null;
  paused_at?: string | null;
  revoked_at?: string | null;

  last_webhook_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  last_health_check_at?: string | null;

  last_error_code?: string | null;
  last_error?: string | null;

  metadata?: Record<string, any> | null;

  created_at?: string | null;
  updated_at?: string | null;
};

export async function GET() {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: admin.error,
        },
        {
          status: admin.status,
        }
      );
    }

    const { data, error } = await supabase
      .from("whatsapp_connections")
      .select(
        [
          "id",
          "client_id",
          "brand_slug",
          "brand_name",
          "business_name",
          "phone_number",
          "phone_number_id",
          "display_phone_number",
          "whatsapp_business_account_id",
          "waba_id",
          "verified_name",
          "webhook_verified",
          "webhook_status",
          "status",
          "connection_status",
          "receive_enabled",
          "agent_enabled",
          "allow_real_send",
          "token_source",
          "token_expires_at",
          "connected_at",
          "approved_at",
          "paused_at",
          "revoked_at",
          "last_webhook_at",
          "last_inbound_at",
          "last_outbound_at",
          "last_health_check_at",
          "last_error_code",
          "last_error",
          "metadata",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .order("updated_at", {
        ascending: false,
      });

    if (error) {
      console.error("whatsapp-connections GET select error:", error);

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudieron cargar las conexiones de WhatsApp.",
          detail: error.message,
        },
        {
          status: 500,
        }
      );
    }

    const connectionRows = Array.isArray(data) ? data : [];

const connections = connectionRows.map((row) =>
  normalizeConnection(row as unknown as WhatsappConnectionRow)
);

    const activeConnections = connections.filter(
      (connection) => connection.connectionStatus === "active"
    );

    const pausedConnections = connections.filter(
      (connection) => connection.connectionStatus === "paused"
    );

    const errorConnections = connections.filter(
      (connection) =>
        connection.connectionStatus === "error" ||
        Boolean(connection.lastError)
    );

    const automaticConnections = connections.filter(
      (connection) =>
        connection.connectionStatus === "active" &&
        connection.agentEnabled &&
        connection.allowRealSend
    );

    return NextResponse.json({
      ok: true,
      admin: {
        id: admin.userId,
        email: admin.email,
      },
      totals: {
        connections: connections.length,
        active: activeConnections.length,
        paused: pausedConnections.length,
        errors: errorConnections.length,
        automatic: automaticConnections.length,
      },
      connections,
    });
  } catch (error: any) {
    console.error("whatsapp-connections GET error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo cargar el panel de conexiones de WhatsApp.",
        detail: error?.message || String(error),
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();

    if (!admin.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: admin.error,
        },
        {
          status: admin.status,
        }
      );
    }

    const body = await request.json();

    const connectionId = String(
      body.connectionId || body.connection_id || body.id || ""
    ).trim();

    const action = String(body.action || "")
      .trim()
      .toLowerCase();

    const field = String(body.field || "")
      .trim()
      .toLowerCase() as ControlField;

    const hasValue = typeof body.value === "boolean";
    const value = body.value === true;

    if (!connectionId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta connectionId.",
        },
        {
          status: 400,
        }
      );
    }

    if (!isUuid(connectionId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "El connectionId no tiene un formato válido.",
        },
        {
          status: 400,
        }
      );
    }

    const { data: currentConnection, error: currentError } = await supabase
      .from("whatsapp_connections")
      .select("*")
      .eq("id", connectionId)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo consultar la conexión.",
          detail: currentError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!currentConnection) {
      return NextResponse.json(
        {
          ok: false,
          error: "No encontré esa conexión de WhatsApp.",
        },
        {
          status: 404,
        }
      );
    }

    const normalizedCurrent = normalizeConnection(currentConnection);
    const now = new Date().toISOString();

    let updatePayload: Record<string, any> = {
      updated_at: now,
    };

    let message = "Conexión actualizada correctamente.";

    if (action) {
      const actionResult = buildActionUpdate({
        action,
        current: normalizedCurrent,
        now,
      });

      if (!actionResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: actionResult.error,
          },
          {
            status: actionResult.status,
          }
        );
      }

      updatePayload = {
        ...updatePayload,
        ...actionResult.payload,
      };

      message = actionResult.message;
    } else if (field) {
      if (!CONTROL_FIELDS.includes(field)) {
        return NextResponse.json(
          {
            ok: false,
            error: "El control enviado no está permitido.",
          },
          {
            status: 400,
          }
        );
      }

      if (!hasValue) {
        return NextResponse.json(
          {
            ok: false,
            error: "El campo value debe ser true o false.",
          },
          {
            status: 400,
          }
        );
      }

      const controlResult = buildControlUpdate({
        field,
        value,
        current: normalizedCurrent,
      });

      if (!controlResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: controlResult.error,
          },
          {
            status: controlResult.status,
          }
        );
      }

      updatePayload = {
        ...updatePayload,
        ...controlResult.payload,
      };

      message = controlResult.message;
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: "Debes enviar una acción o un control para actualizar.",
        },
        {
          status: 400,
        }
      );
    }

    const { data: updatedConnection, error: updateError } = await supabase
      .from("whatsapp_connections")
      .update(updatePayload)
      .eq("id", connectionId)
      .select(
        [
          "id",
          "client_id",
          "brand_slug",
          "brand_name",
          "business_name",
          "phone_number",
          "phone_number_id",
          "display_phone_number",
          "whatsapp_business_account_id",
          "waba_id",
          "verified_name",
          "webhook_verified",
          "webhook_status",
          "status",
          "connection_status",
          "receive_enabled",
          "agent_enabled",
          "allow_real_send",
          "token_source",
          "token_expires_at",
          "connected_at",
          "approved_at",
          "paused_at",
          "revoked_at",
          "last_webhook_at",
          "last_inbound_at",
          "last_outbound_at",
          "last_health_check_at",
          "last_error_code",
          "last_error",
          "metadata",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .single();

    if (updateError || !updatedConnection) {
  console.error(
    "whatsapp-connections PATCH update error:",
    updateError || "Supabase no devolvió la conexión actualizada."
  );

  return NextResponse.json(
    {
      ok: false,
      error: "No se pudo actualizar la conexión de WhatsApp.",
      detail:
        updateError?.message ||
        "Supabase no devolvió la conexión actualizada.",
    },
    {
      status: 500,
    }
  );
}

const normalizedUpdatedConnection = normalizeConnection(
  updatedConnection as unknown as WhatsappConnectionRow
);

return NextResponse.json({
  ok: true,
  message,
  connection: normalizedUpdatedConnection,
});
  } catch (error: any) {
    console.error("whatsapp-connections PATCH error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo actualizar la conexión.",
        detail: error?.message || String(error),
      },
      {
        status: 500,
      }
    );
  }
}

function buildActionUpdate({
  action,
  current,
  now,
}: {
  action: string;
  current: ReturnType<typeof normalizeConnection>;
  now: string;
}):
  | {
      ok: true;
      payload: Record<string, any>;
      message: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    } {
  if (action === "approve") {
    if (current.connectionStatus === "revoked") {
      return {
        ok: false,
        status: 409,
        error:
          "La conexión está revocada. No puede aprobarse sin volver a realizar la conexión con Meta.",
      };
    }

    return {
      ok: true,
      payload: {
        connection_status: "active",
        status: "active",
        approved_at: current.approvedAt || now,
        connected_at: current.connectedAt || now,
        paused_at: null,
        revoked_at: null,
        last_error: null,
        last_error_code: null,
      },
      message: "Conexión aprobada y activada correctamente.",
    };
  }

  if (action === "pause") {
    if (current.connectionStatus === "revoked") {
      return {
        ok: false,
        status: 409,
        error: "Una conexión revocada ya no puede pausarse.",
      };
    }

    return {
      ok: true,
      payload: {
        connection_status: "paused",
        status: "paused",
        agent_enabled: false,
        allow_real_send: false,
        paused_at: now,
      },
      message:
        "Conexión pausada. SALES AI y los envíos reales quedaron bloqueados.",
    };
  }

  if (action === "resume") {
    if (current.connectionStatus === "revoked") {
      return {
        ok: false,
        status: 409,
        error:
          "La conexión está revocada. Debe volver a conectarse desde Meta.",
      };
    }

    return {
      ok: true,
      payload: {
        connection_status: "active",
        status: "active",
        paused_at: null,
        revoked_at: null,
      },
      message:
        "Conexión reactivada. Los controles de SALES AI permanecen apagados hasta que Cometa los habilite.",
    };
  }

  if (action === "revoke") {
    return {
      ok: true,
      payload: {
        connection_status: "revoked",
        status: "revoked",
        receive_enabled: false,
        agent_enabled: false,
        allow_real_send: false,
        revoked_at: now,
      },
      message:
        "Conexión revocada. La recepción, SALES AI y los envíos quedaron desactivados.",
    };
  }

  if (action === "clear_error") {
    return {
      ok: true,
      payload: {
        last_error: null,
        last_error_code: null,
      },
      message: "El error registrado fue limpiado.",
    };
  }

  return {
    ok: false,
    status: 400,
    error: "La acción solicitada no está permitida.",
  };
}

function buildControlUpdate({
  field,
  value,
  current,
}: {
  field: ControlField;
  value: boolean;
  current: ReturnType<typeof normalizeConnection>;
}):
  | {
      ok: true;
      payload: Record<string, any>;
      message: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    } {
  const connectionIsActive = current.connectionStatus === "active";

  if (current.connectionStatus === "revoked") {
    return {
      ok: false,
      status: 409,
      error:
        "La conexión está revocada. No puedes modificar sus controles hasta volver a conectarla con Meta.",
    };
  }

  if (field === "receive_enabled") {
    if (value && !connectionIsActive) {
      return {
        ok: false,
        status: 409,
        error:
          "Primero debes activar la conexión antes de habilitar la recepción.",
      };
    }

    if (!value) {
      return {
        ok: true,
        payload: {
          receive_enabled: false,
          agent_enabled: false,
          allow_real_send: false,
        },
        message:
          "Recepción desactivada. SALES AI y los envíos reales también fueron bloqueados.",
      };
    }

    return {
      ok: true,
      payload: {
        receive_enabled: true,
      },
      message: "Recepción de mensajes habilitada.",
    };
  }

  if (field === "agent_enabled") {
    if (value && !connectionIsActive) {
      return {
        ok: false,
        status: 409,
        error:
          "Primero debes activar la conexión antes de habilitar SALES AI.",
      };
    }

    if (value && !current.receiveEnabled) {
      return {
        ok: false,
        status: 409,
        error:
          "Primero debes habilitar la recepción de mensajes antes de activar SALES AI.",
      };
    }

    if (!value) {
      return {
        ok: true,
        payload: {
          agent_enabled: false,
          allow_real_send: false,
        },
        message:
          "SALES AI desactivado. Los envíos reales también quedaron bloqueados.",
      };
    }

    return {
      ok: true,
      payload: {
        agent_enabled: true,
      },
      message:
        "SALES AI habilitado. Todavía no enviará mensajes reales hasta activar el permiso correspondiente.",
    };
  }

  if (field === "allow_real_send") {
    if (value && !connectionIsActive) {
      return {
        ok: false,
        status: 409,
        error:
          "Primero debes activar la conexión antes de permitir envíos reales.",
      };
    }

    if (value && !current.receiveEnabled) {
      return {
        ok: false,
        status: 409,
        error:
          "La recepción debe estar habilitada antes de permitir envíos reales.",
      };
    }

    if (value && !current.agentEnabled) {
      return {
        ok: false,
        status: 409,
        error:
          "Primero debes habilitar SALES AI antes de permitir envíos reales.",
      };
    }

    return {
      ok: true,
      payload: {
        allow_real_send: value,
      },
      message: value
        ? "Envíos reales autorizados por Cometa."
        : "Envíos reales bloqueados por Cometa.",
    };
  }

  return {
    ok: false,
    status: 400,
    error: "El control solicitado no está permitido.",
  };
}

function normalizeConnection(row: WhatsappConnectionRow) {
  const connectionStatus = normalizeConnectionStatus(
    row.connection_status || row.status || "pending_review"
  );

  const webhookStatus =
    cleanText(row.webhook_status) ||
    (row.webhook_verified ? "active" : "pending");

  const brandName =
    cleanText(row.brand_name) ||
    cleanText(row.business_name) ||
    "Marca sin nombre";

  const brandSlug =
    cleanText(row.brand_slug) || slugifyValue(brandName) || "marca";

  const displayPhoneNumber =
    cleanText(row.display_phone_number) ||
    cleanText(row.phone_number) ||
    null;

  const wabaId =
    cleanText(row.waba_id) ||
    cleanText(row.whatsapp_business_account_id) ||
    null;

  return {
    id: String(row.id),

    clientId: row.client_id || null,

    brandSlug,
    brandName,

    verifiedName: cleanText(row.verified_name) || null,

    phoneNumberId: cleanText(row.phone_number_id) || null,
    displayPhoneNumber,

    wabaId,

    connectionStatus,
    webhookStatus,

    receiveEnabled: row.receive_enabled !== false,
    agentEnabled: row.agent_enabled === true,
    allowRealSend: row.allow_real_send === true,

    tokenSource: cleanText(row.token_source) || "legacy_env",
    tokenExpiresAt: row.token_expires_at || null,

    connectedAt: row.connected_at || null,
    approvedAt: row.approved_at || null,
    pausedAt: row.paused_at || null,
    revokedAt: row.revoked_at || null,

    lastWebhookAt: row.last_webhook_at || null,
    lastInboundAt: row.last_inbound_at || null,
    lastOutboundAt: row.last_outbound_at || null,
    lastHealthCheckAt: row.last_health_check_at || null,

    lastErrorCode: cleanText(row.last_error_code) || null,
    lastError: cleanText(row.last_error) || null,

    metadata:
      row.metadata && typeof row.metadata === "object" ? row.metadata : {},

    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeConnectionStatus(value: unknown): ConnectionStatus {
  const clean = cleanText(value).toLowerCase();

  if (CONNECTION_STATUSES.includes(clean as ConnectionStatus)) {
    return clean as ConnectionStatus;
  }

  return "pending_review";
}

async function requireAdmin(): Promise<AdminResult> {
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
          // Los Server Components pueden impedir la escritura de cookies.
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
      status: 401,
      error: "No autorizado. Inicia sesión.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role,status,email")
    .or(`user_id.eq.${user.id},id.eq.${user.id}`)
    .maybeSingle();

  if (profileError) {
    console.error(
      "whatsapp-connections requireAdmin profile error:",
      profileError
    );

    return {
      ok: false,
      status: 500,
      error: "No se pudo validar el perfil del usuario.",
    };
  }

  if (profile?.role !== "admin" || profile?.status !== "active") {
    return {
      ok: false,
      status: 403,
      error: "Acceso solo para administradores activos de Cometa.",
    };
  }

  return {
    ok: true,
    userId: user.id,
    email: user.email || profile?.email || null,
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function slugifyValue(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}