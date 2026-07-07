import { createClient } from "@supabase/supabase-js";

export type SalesAiAgentMode =
  | "observation"
  | "supervised"
  | "automatic"
  | "paused";

export type SalesAiRuntimeSettings = {
  brand_name: string;
  agent_mode: SalesAiAgentMode;
  whatsapp_status: string;
  auto_reply_enabled: boolean;
  send_whatsapp_enabled: boolean;
  followups_enabled: boolean;
  human_escalation_enabled: boolean;
  max_followups: number;
  first_followup_delay_minutes: number;
};

type SalesAiSettingsRow = {
  brand_name?: string | null;
  agent_mode?: string | null;
  whatsapp_status?: string | null;
  auto_reply_enabled?: boolean | null;
  send_whatsapp_enabled?: boolean | null;
  followups_enabled?: boolean | null;
  human_escalation_enabled?: boolean | null;
  max_followups?: number | string | null;
  first_followup_delay_minutes?: number | string | null;
};

const defaultRuntimeSettings: SalesAiRuntimeSettings = {
  brand_name: "Cometa Mkt",
  agent_mode: "observation",
  whatsapp_status: "pending_verification",
  auto_reply_enabled: false,
  send_whatsapp_enabled: false,
  followups_enabled: true,
  human_escalation_enabled: true,
  max_followups: 3,
  first_followup_delay_minutes: 1440,
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

export function normalizeSalesAiBrandName(value?: string | null) {
  const normalized = String(value || "").trim();

  return normalized || "Cometa Mkt";
}

export function normalizeSalesAiAgentMode(
  value?: string | null
): SalesAiAgentMode {
  const mode = String(value || "observation").trim().toLowerCase();

  if (mode === "automatic") return "automatic";
  if (mode === "supervised") return "supervised";
  if (mode === "paused") return "paused";

  return "observation";
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return fallback;
  }

  return numberValue;
}

export async function getSalesAiRuntimeSettings(
  brandName?: string | null
): Promise<SalesAiRuntimeSettings> {
  const normalizedBrandName = normalizeSalesAiBrandName(brandName);

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("sales_ai_settings")
      .select(
        [
          "brand_name",
          "agent_mode",
          "whatsapp_status",
          "auto_reply_enabled",
          "send_whatsapp_enabled",
          "followups_enabled",
          "human_escalation_enabled",
          "max_followups",
          "first_followup_delay_minutes",
        ].join(",")
      )
      .eq("brand_name", normalizedBrandName)
      .maybeSingle();

    if (error) {
      console.error("Error leyendo sales_ai_settings:", error.message);

      return {
        ...defaultRuntimeSettings,
        brand_name: normalizedBrandName,
      };
    }

    if (!data) {
      return {
        ...defaultRuntimeSettings,
        brand_name: normalizedBrandName,
      };
    }

    const row = data as SalesAiSettingsRow;

    return {
      brand_name: row.brand_name || normalizedBrandName,
      agent_mode: normalizeSalesAiAgentMode(row.agent_mode),
      whatsapp_status: String(
        row.whatsapp_status || "pending_verification"
      ).trim(),
      auto_reply_enabled: row.auto_reply_enabled === true,
      send_whatsapp_enabled: row.send_whatsapp_enabled === true,
      followups_enabled: row.followups_enabled !== false,
      human_escalation_enabled: row.human_escalation_enabled !== false,
      max_followups: normalizePositiveNumber(row.max_followups, 3),
      first_followup_delay_minutes: normalizePositiveNumber(
        row.first_followup_delay_minutes,
        1440
      ),
    };
  } catch (error: unknown) {
    console.error(
      "getSalesAiRuntimeSettings error:",
      error instanceof Error ? error.message : error
    );

    return {
      ...defaultRuntimeSettings,
      brand_name: normalizedBrandName,
    };
  }
}

export function resolveSalesAiAgentMode(
  settings: SalesAiRuntimeSettings,
  fallback?: string | null
): SalesAiAgentMode {
  const settingsMode = normalizeSalesAiAgentMode(settings.agent_mode);

  if (settingsMode === "automatic") return "automatic";
  if (settingsMode === "supervised") return "supervised";
  if (settingsMode === "paused") return "paused";

  return normalizeSalesAiAgentMode(fallback || "observation");
}

/**
 * Uso exclusivo para respuestas automáticas.
 * Esta función exige auto_reply_enabled=true para evitar envíos sin aprobación.
 */
export function canSendRealWhatsapp(settings: SalesAiRuntimeSettings) {
  return (
    normalizeSalesAiAgentMode(settings.agent_mode) === "automatic" &&
    settings.whatsapp_status === "connected" &&
    settings.auto_reply_enabled === true &&
    settings.send_whatsapp_enabled === true
  );
}

/**
 * Uso para respuestas aprobadas manualmente desde el Inbox.
 * Permite modo supervised sin activar auto_reply_enabled.
 */
export function canSendApprovedWhatsapp(settings: SalesAiRuntimeSettings) {
  const agentMode = normalizeSalesAiAgentMode(settings.agent_mode);

  return (
    (agentMode === "supervised" || agentMode === "automatic") &&
    settings.whatsapp_status === "connected" &&
    settings.send_whatsapp_enabled === true
  );
}

export function canCreateSalesAiFollowups(settings: SalesAiRuntimeSettings) {
  return (
    settings.followups_enabled === true &&
    normalizeSalesAiAgentMode(settings.agent_mode) !== "paused"
  );
}

export function explainWhatsappSendLock(settings: SalesAiRuntimeSettings) {
  const reasons: string[] = [];

  const agentMode = normalizeSalesAiAgentMode(settings.agent_mode);

  if (agentMode !== "automatic") {
    reasons.push(`agent_mode=${agentMode}`);
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

  return reasons;
}

export function explainApprovedWhatsappSendLock(
  settings: SalesAiRuntimeSettings
) {
  const reasons: string[] = [];

  const agentMode = normalizeSalesAiAgentMode(settings.agent_mode);

  if (agentMode !== "supervised" && agentMode !== "automatic") {
    reasons.push(`agent_mode=${agentMode}`);
  }

  if (settings.whatsapp_status !== "connected") {
    reasons.push(`whatsapp_status=${settings.whatsapp_status}`);
  }

  if (settings.send_whatsapp_enabled !== true) {
    reasons.push("send_whatsapp_enabled=false");
  }

  return reasons;
}