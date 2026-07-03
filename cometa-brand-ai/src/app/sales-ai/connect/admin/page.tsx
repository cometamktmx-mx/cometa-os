"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type AgentMode = "observation" | "automatic" | "paused";

type WhatsappStatus =
  | "pending_verification"
  | "connection_requested"
  | "connected"
  | "error"
  | "paused";

type AdminSettings = {
  brand_name: string;
  agent_mode: AgentMode;
  whatsapp_status: WhatsappStatus;
  whatsapp_phone_number: string;
  whatsapp_phone_number_id: string;
  whatsapp_business_account_id: string;
  auto_reply_enabled: boolean;
  send_whatsapp_enabled: boolean;
  followups_enabled: boolean;
  human_escalation_enabled: boolean;
  client_connection_status: string;
  client_requested_phone_number: string;
  client_connection_notes: string;
  internal_notes: string;
  webhook_url: string;
  graph_api_version: string;
  send_lock: {
    canSendRealWhatsapp: boolean;
    reasons: string[];
  };
  updated_at: string | null;
};

const emptySettings: AdminSettings = {
  brand_name: "Cometa Mkt",
  agent_mode: "observation",
  whatsapp_status: "pending_verification",
  whatsapp_phone_number: "",
  whatsapp_phone_number_id: "",
  whatsapp_business_account_id: "",
  auto_reply_enabled: false,
  send_whatsapp_enabled: false,
  followups_enabled: true,
  human_escalation_enabled: true,
  client_connection_status: "not_requested",
  client_requested_phone_number: "",
  client_connection_notes: "",
  internal_notes: "",
  webhook_url: "",
  graph_api_version: "v23.0",
  send_lock: {
    canSendRealWhatsapp: false,
    reasons: [],
  },
  updated_at: null,
};

export default function SalesAIConnectAdminPage() {
  const [brandName, setBrandName] = useState("Cometa Mkt");
  const [settings, setSettings] = useState<AdminSettings>(emptySettings);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const sendState = useMemo(() => {
    if (settings.send_lock.canSendRealWhatsapp) {
      return {
        label: "Envío real habilitado",
        helper:
          "El sistema cumple los candados de configuración. Asegúrate de que el ENV global también esté activo.",
        tone: "green" as const,
      };
    }

    return {
      label: "Envío real bloqueado",
      helper:
        settings.send_lock.reasons.length > 0
          ? settings.send_lock.reasons.join(" · ")
          : "Aún hay candados de seguridad activos.",
      tone: "yellow" as const,
    };
  }, [settings.send_lock]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setErrorMsg("");

    try {
      const res = await fetch(
        `/api/sales-ai/admin-whatsapp-settings?brandName=${encodeURIComponent(
          brandName
        )}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(
          data?.error || "No se pudo cargar configuración de WhatsApp."
        );
      }

      setSettings({
        ...emptySettings,
        ...data.settings,
      });
    } catch (error: any) {
      setErrorMsg(error?.message || "Error cargando configuración.");
    } finally {
      setLoading(false);
    }
  }, [brandName]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function updateSetting<K extends keyof AdminSettings>(
    key: K,
    value: AdminSettings[K]
  ) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveSettings() {
    setSaving(true);
    setMessage("");
    setErrorMsg("");

    try {
      const res = await fetch("/api/sales-ai/admin-whatsapp-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandName,
          whatsappStatus: settings.whatsapp_status,
          whatsappPhoneNumber: settings.whatsapp_phone_number,
          whatsappPhoneNumberId: settings.whatsapp_phone_number_id,
          whatsappBusinessAccountId: settings.whatsapp_business_account_id,
          agentMode: settings.agent_mode,
          autoReplyEnabled: settings.auto_reply_enabled,
          sendWhatsappEnabled: settings.send_whatsapp_enabled,
          followupsEnabled: settings.followups_enabled,
          humanEscalationEnabled: settings.human_escalation_enabled,
          internalNotes: settings.internal_notes,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo guardar configuración.");
      }

      setSettings({
        ...emptySettings,
        ...data.settings,
      });

      setMessage("Configuración técnica de WhatsApp guardada.");
    } catch (error: any) {
      setErrorMsg(error?.message || "Error guardando configuración.");
    } finally {
      setSaving(false);
    }
  }

  function applySafeObservationMode() {
    setSettings((current) => ({
      ...current,
      whatsapp_status: "connected",
      agent_mode: "observation",
      auto_reply_enabled: false,
      send_whatsapp_enabled: false,
      followups_enabled: true,
      human_escalation_enabled: true,
      internal_notes:
        current.internal_notes ||
        "WhatsApp conectado en modo observación. Recibe mensajes reales, crea leads y corre SALES AI, pero no envía respuestas automáticas.",
    }));
  }

  function applyAutomaticLockedMode() {
    setSettings((current) => ({
      ...current,
      whatsapp_status: "connected",
      agent_mode: "automatic",
      auto_reply_enabled: true,
      send_whatsapp_enabled: false,
      followups_enabled: true,
      human_escalation_enabled: true,
      internal_notes:
        current.internal_notes ||
        "Modo automático preparado, pero envío real sigue bloqueado por send_whatsapp_enabled=false.",
    }));
  }

  return (
    <main className="min-h-screen bg-[#f7fafc] text-[#081535]">
      <div className="mx-auto max-w-[1500px] px-6 py-7">
        <header className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="overflow-hidden rounded-[34px] border border-[#dfe8f3] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
            <div className="relative overflow-hidden bg-[#081535] px-7 py-8 text-white">
              <div className="absolute right-[-120px] top-[-160px] h-96 w-96 rounded-full bg-[#08a9c6]/25 blur-3xl" />
              <div className="absolute bottom-[-180px] right-[220px] h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl" />

              <div className="relative">
                <div className="inline-flex rounded-full bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#9eefff] ring-1 ring-white/10">
                  Admin interno · WhatsApp Cloud API
                </div>

                <h1 className="mt-5 max-w-4xl text-5xl font-black tracking-[-0.06em]">
                  Configuración técnica de WhatsApp
                </h1>

                <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
                  Guarda aquí los datos aprobados de Meta. Esta pantalla no es
                  para clientes: controla Phone Number ID, WABA ID, modo del
                  agente y candados de envío real.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/sales-ai/connect"
                    className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15"
                  >
                    ← Vista cliente
                  </Link>

                  <Link
                    href="/sales-ai"
                    className="rounded-2xl bg-[#08a9c6] px-5 py-3 text-sm font-black text-white shadow-[0_16px_36px_rgba(8,169,198,0.24)] transition hover:bg-[#0598b5]"
                  >
                    Abrir SALES AI →
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <StatusCard
            label={sendState.label}
            helper={sendState.helper}
            tone={sendState.tone}
            loading={loading}
          />
        </header>

        {message ? (
          <div className="mt-5 rounded-[18px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">
            {message}
          </div>
        ) : null}

        {errorMsg ? (
          <div className="mt-5 rounded-[18px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-black text-red-700">
            {errorMsg}
          </div>
        ) : null}

        <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-5">
            <Card title="Marca y datos de Meta" subtitle="Relación entre Cometa OS y el número aprobado en Meta.">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field label="Marca activa">
                  <input
                    value={brandName}
                    onChange={(event) => setBrandName(event.target.value)}
                    className="input"
                    placeholder="Cometa Mkt"
                  />
                </Field>

                <Field label="Número visible de WhatsApp">
                  <input
                    value={settings.whatsapp_phone_number}
                    onChange={(event) =>
                      updateSetting(
                        "whatsapp_phone_number",
                        event.target.value
                      )
                    }
                    className="input"
                    placeholder="+52 445 000 0000"
                  />
                </Field>

                <Field label="Phone Number ID">
                  <input
                    value={settings.whatsapp_phone_number_id}
                    onChange={(event) =>
                      updateSetting(
                        "whatsapp_phone_number_id",
                        event.target.value
                      )
                    }
                    className="input"
                    placeholder="Ej. 123456789012345"
                  />
                </Field>

                <Field label="WhatsApp Business Account ID / WABA ID">
                  <input
                    value={settings.whatsapp_business_account_id}
                    onChange={(event) =>
                      updateSetting(
                        "whatsapp_business_account_id",
                        event.target.value
                      )
                    }
                    className="input"
                    placeholder="Ej. 987654321098765"
                  />
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={loadSettings}
                  disabled={loading}
                  className="rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3 text-sm font-black text-[#17213c] transition hover:bg-[#f8fbff] disabled:opacity-50"
                >
                  {loading ? "Cargando..." : "Cargar marca"}
                </button>

                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={saving || loading}
                  className="rounded-2xl bg-[#08a9c6] px-5 py-3 text-sm font-black text-white shadow-[0_16px_36px_rgba(8,169,198,0.22)] transition hover:bg-[#0598b5] disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar configuración"}
                </button>
              </div>
            </Card>

            <Card title="Modo de operación" subtitle="Controla qué puede hacer SALES AI con mensajes reales.">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Field label="Estado de WhatsApp">
                  <select
                    value={settings.whatsapp_status}
                    onChange={(event) =>
                      updateSetting(
                        "whatsapp_status",
                        event.target.value as WhatsappStatus
                      )
                    }
                    className="input"
                  >
                    <option value="pending_verification">
                      Pendiente de verificación
                    </option>
                    <option value="connection_requested">
                      Solicitud recibida
                    </option>
                    <option value="connected">Conectado</option>
                    <option value="paused">Pausado</option>
                    <option value="error">Error</option>
                  </select>
                </Field>

                <Field label="Modo del agente">
                  <select
                    value={settings.agent_mode}
                    onChange={(event) =>
                      updateSetting(
                        "agent_mode",
                        event.target.value as AgentMode
                      )
                    }
                    className="input"
                  >
                    <option value="observation">Observación</option>
                    <option value="automatic">Automático</option>
                    <option value="paused">Pausado</option>
                  </select>
                </Field>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                <SwitchRow
                  title="Auto reply interno"
                  subtitle="Permite que el agente decida respuesta."
                  checked={settings.auto_reply_enabled}
                  onChange={(value) =>
                    updateSetting("auto_reply_enabled", value)
                  }
                />

                <SwitchRow
                  title="Enviar WhatsApp real"
                  subtitle="Último candado por cliente/marca."
                  checked={settings.send_whatsapp_enabled}
                  onChange={(value) =>
                    updateSetting("send_whatsapp_enabled", value)
                  }
                />

                <SwitchRow
                  title="Follow-ups activos"
                  subtitle="Permite programar seguimientos."
                  checked={settings.followups_enabled}
                  onChange={(value) =>
                    updateSetting("followups_enabled", value)
                  }
                />

                <SwitchRow
                  title="Escalamiento humano"
                  subtitle="Permite marcar casos sensibles."
                  checked={settings.human_escalation_enabled}
                  onChange={(value) =>
                    updateSetting("human_escalation_enabled", value)
                  }
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={applySafeObservationMode}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-100"
                >
                  Aplicar modo seguro: conectado + observación
                </button>

                <button
                  type="button"
                  onClick={applyAutomaticLockedMode}
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-black text-amber-700 transition hover:bg-amber-100"
                >
                  Preparar automático sin envío real
                </button>
              </div>
            </Card>

            <Card title="Notas internas" subtitle="Solo visible para Cometa.">
              <textarea
                value={settings.internal_notes}
                onChange={(event) =>
                  updateSetting("internal_notes", event.target.value)
                }
                className="input min-h-[150px]"
                placeholder="Ej. Cuenta aprobada por Meta. Primer test en modo observación..."
              />
            </Card>
          </div>

          <aside className="space-y-5">
            <Card title="Webhook para Meta" subtitle="Usa esta URL como Callback URL.">
              <CopyBox label="Callback URL" value={settings.webhook_url} />
              <CopyBox
                label="Graph API version"
                value={settings.graph_api_version}
              />

              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-black text-amber-800">
                  Verify Token
                </p>
                <p className="mt-1 text-xs font-bold leading-5 text-amber-700">
                  Debe ser el mismo valor que tengas en Vercel como
                  WHATSAPP_VERIFY_TOKEN. No se muestra aquí por seguridad.
                </p>
              </div>
            </Card>

            <Card title="Solicitud del cliente" subtitle="Datos enviados desde la pantalla simple.">
              <MiniInfo
                label="Estado cliente"
                value={settings.client_connection_status || "N/A"}
              />
              <MiniInfo
                label="Número solicitado"
                value={settings.client_requested_phone_number || "N/A"}
              />
              <MiniInfo
                label="Notas"
                value={settings.client_connection_notes || "Sin notas"}
              />
            </Card>

            <Card title="Candados activos" subtitle="Razones por las que no manda WhatsApp real.">
              {settings.send_lock.canSendRealWhatsapp ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-700">
                  No hay candados activos. El envío real está habilitado.
                </div>
              ) : (
                <div className="space-y-2">
                  {settings.send_lock.reasons.map((reason) => (
                    <div
                      key={reason}
                      className="rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] px-4 py-3 text-xs font-black text-[#5b6a84]"
                    >
                      {reason}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <button
              type="button"
              onClick={saveSettings}
              disabled={saving || loading}
              className="w-full rounded-[22px] bg-[#081535] px-5 py-4 text-sm font-black text-white shadow-[0_18px_45px_rgba(8,21,53,0.18)] transition hover:bg-[#08a9c6] disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar todo"}
            </button>
          </aside>
        </section>
      </div>
    </main>
  );
}

function StatusCard({
  label,
  helper,
  tone,
  loading,
}: {
  label: string;
  helper: string;
  tone: "green" | "yellow";
  loading: boolean;
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <section
      className={`rounded-[34px] border p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)] ${toneClass}`}
    >
      <p className="text-xs font-black uppercase tracking-[0.18em] opacity-90">
        Estado de seguridad
      </p>

      <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">
        {loading ? "Cargando..." : label}
      </h2>

      <p className="mt-3 text-sm font-bold leading-6 opacity-90">{helper}</p>
    </section>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div>
        <h2 className="text-xl font-black text-[#081535]">{title}</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-[#5b6a84]">
          {subtitle}
        </p>
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-[#5b6a84]">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function SwitchRow({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition ${
        checked
          ? "border-[#9ee5f0] bg-[#ecfbff]"
          : "border-[#dfe8f3] bg-white hover:bg-[#f8fbff]"
      }`}
    >
      <span>
        <span className="block text-sm font-black text-[#081535]">{title}</span>
        <span className="mt-1 block text-xs font-bold leading-5 text-[#5b6a84]">
          {subtitle}
        </span>
      </span>

      <span
        className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${
          checked ? "bg-[#08a9c6]" : "bg-[#dfe8f3]"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mb-3 rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6a7890]">
        {label}
      </p>

      <p className="mt-2 break-all text-sm font-black text-[#081535]">
        {value || "N/A"}
      </p>

      <button
        type="button"
        onClick={copyValue}
        disabled={!value}
        className="mt-3 rounded-xl border border-[#dfe8f3] bg-white px-4 py-2 text-xs font-black text-[#17213c] transition hover:bg-[#f8fbff] disabled:opacity-50"
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 rounded-2xl border border-[#dfe8f3] bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6a7890]">
        {label}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm font-bold leading-6 text-[#081535]">
        {value}
      </p>
    </div>
  );
}