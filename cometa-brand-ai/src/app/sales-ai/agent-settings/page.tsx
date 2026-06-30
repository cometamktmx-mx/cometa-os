"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

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

type ClientAgentPreferences = {
  tone: string;
  business_hours_enabled: boolean;
  human_escalation_enabled: boolean;
  allow_followups: boolean;
  client_can_activate_automatic: boolean;
  business_summary?: string;
  products_services?: string;
  forbidden_promises?: string;
  required_questions?: string;
  escalation_notes?: string;
};

type AgentSettings = {
  brand_name: string;
  agent_mode: string;
  whatsapp_status: string;
  whatsapp_phone_number: string | null;
  client_connection_status: string;

  followups_enabled: boolean;
  human_escalation_enabled: boolean;

  max_followups: number;
  first_followup_delay_minutes: number;

  business_hours: BusinessHours;
  response_rules: ResponseRules;
  client_agent_preferences: ClientAgentPreferences;
  updated_at?: string;
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

const defaultSettings: AgentSettings = {
  brand_name: "Cometa Mkt",
  agent_mode: "observation",
  whatsapp_status: "pending_verification",
  whatsapp_phone_number: null,
  client_connection_status: "not_requested",

  followups_enabled: true,
  human_escalation_enabled: true,

  max_followups: 3,
  first_followup_delay_minutes: 1440,

  business_hours: defaultBusinessHours,

  response_rules: {
    tone: "profesional, claro y vendedor",
    avoid_promising_without_confirmation: true,
    ask_one_question_at_a_time: true,
    always_try_to_qualify: true,
    never_apply_discounts_without_permission: true,
  },

  client_agent_preferences: {
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
  },
};

const days: { key: DayKey; label: string; short: string }[] = [
  { key: "monday", label: "Lunes", short: "Lun" },
  { key: "tuesday", label: "Martes", short: "Mar" },
  { key: "wednesday", label: "Miércoles", short: "Mié" },
  { key: "thursday", label: "Jueves", short: "Jue" },
  { key: "friday", label: "Viernes", short: "Vie" },
  { key: "saturday", label: "Sábado", short: "Sáb" },
  { key: "sunday", label: "Domingo", short: "Dom" },
];

export default function SalesAIAgentSettingsPage() {
  const [brandName, setBrandName] = useState("Cometa Mkt");
  const [settings, setSettings] = useState<AgentSettings>(defaultSettings);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const status = useMemo(() => {
    if (settings.whatsapp_status === "connected") {
      return {
        label: "Activa",
        title: "Configuración activa",
        helper: "Tu agente ya tiene configuración lista para operar cuando Cometa autorice WhatsApp.",
        tone: "green" as const,
      };
    }

    if (
      settings.whatsapp_status === "connection_requested" ||
      settings.client_connection_status === "requested"
    ) {
      return {
        label: "En revisión",
        title: "Conexión solicitada",
        helper: "Puedes configurar el agente mientras Cometa valida WhatsApp con Meta.",
        tone: "blue" as const,
      };
    }

    return {
      label: "Observación",
      title: "Modo observación",
      helper: "Puedes configurar el agente, pero Cometa controla la activación real.",
      tone: "yellow" as const,
    };
  }, [settings.whatsapp_status, settings.client_connection_status]);

  const productItems = useMemo(() => {
    return String(settings.client_agent_preferences.products_services || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6);
  }, [settings.client_agent_preferences.products_services]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setErrorMsg("");

    try {
      const res = await fetch(
        `/api/sales-ai/agent-settings?brandName=${encodeURIComponent(
          brandName
        )}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo cargar la configuración.");
      }

      setSettings(normalizeSettings(data.settings));
    } catch (error: any) {
      setErrorMsg(error?.message || "Error cargando configuración.");
    } finally {
      setLoading(false);
    }
  }, [brandName]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function saveSettings() {
    setSaving(true);
    setMessage("");
    setErrorMsg("");

    try {
      const prefs = settings.client_agent_preferences;

      const res = await fetch("/api/sales-ai/agent-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandName: settings.brand_name || brandName,
          tone: settings.response_rules.tone,
          businessHours: settings.business_hours,
          allowFollowups: settings.followups_enabled,
          humanEscalationEnabled: settings.human_escalation_enabled,
          maxFollowups: settings.max_followups,
          firstFollowupDelayMinutes: settings.first_followup_delay_minutes,
          responseRules: settings.response_rules,
          businessSummary: prefs.business_summary || "",
          productsServices: prefs.products_services || "",
          forbiddenPromises: prefs.forbidden_promises || "",
          requiredQuestions: prefs.required_questions || "",
          escalationNotes: prefs.escalation_notes || "",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo guardar la configuración.");
      }

      setSettings(normalizeSettings(data.settings));
      setMessage("Configuración del agente guardada correctamente.");
    } catch (error: any) {
      setErrorMsg(error?.message || "Error guardando configuración.");
    } finally {
      setSaving(false);
    }
  }

  function updateResponseRule<K extends keyof ResponseRules>(
    field: K,
    value: ResponseRules[K]
  ) {
    setSettings((current) => ({
      ...current,
      response_rules: {
        ...current.response_rules,
        [field]: value,
      },
      client_agent_preferences: {
        ...current.client_agent_preferences,
        ...(field === "tone" ? { tone: String(value) } : {}),
      },
    }));
  }

  function updatePreference<K extends keyof ClientAgentPreferences>(
    field: K,
    value: ClientAgentPreferences[K]
  ) {
    setSettings((current) => ({
      ...current,
      client_agent_preferences: {
        ...current.client_agent_preferences,
        [field]: value,
      },
    }));
  }

  function updateBusinessHoursEnabled(value: boolean) {
    setSettings((current) => ({
      ...current,
      business_hours: {
        ...current.business_hours,
        enabled: value,
      },
      client_agent_preferences: {
        ...current.client_agent_preferences,
        business_hours_enabled: value,
      },
    }));
  }

  function updateDayClosed(day: DayKey) {
    setSettings((current) => {
      const dayConfig = current.business_hours[day];
      const isActive = !dayConfig.closed;

      return {
        ...current,
        business_hours: {
          ...current.business_hours,
          [day]: {
            ...dayConfig,
            closed: isActive,
          },
        },
      };
    });
  }

  function updateGeneralTime(field: "open" | "close", value: string) {
    setSettings((current) => {
      const nextHours = { ...current.business_hours };

      days.forEach((day) => {
        nextHours[day.key] = {
          ...nextHours[day.key],
          [field]: value,
        };
      });

      return {
        ...current,
        business_hours: nextHours,
      };
    });
  }

  function updateSimpleField<K extends keyof AgentSettings>(
    field: K,
    value: AgentSettings[K]
  ) {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7fafc] text-[#081535]">
      <div className="flex min-h-screen">
        <LeftRail />

        <div className="min-w-0 flex-1 px-4 py-5 lg:px-5 xl:px-6">
          <div className="mx-auto w-full max-w-[1480px] space-y-4">
            <header className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <HeroCard onSave={saveSettings} saving={saving || loading} />
              <SummaryPanel
                status={status}
                settings={settings}
                onSave={saveSettings}
                saving={saving || loading}
              />
            </header>

            {message ? (
              <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">
                {message}
              </div>
            ) : null}

            {errorMsg ? (
              <div className="rounded-[18px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-black text-red-700">
                {errorMsg}
              </div>
            ) : null}

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card
                icon={<IconBusiness />}
                title="Información del negocio"
                description="Datos básicos para que el agente entienda tu empresa."
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FieldGroup label="Nombre del negocio">
                    <input
                      value={settings.brand_name}
                      onChange={(e) => {
                        updateSimpleField("brand_name", e.target.value);
                        setBrandName(e.target.value);
                      }}
                      className="input"
                      placeholder="Ej. Cometa Mkt"
                    />
                  </FieldGroup>

                  <FieldGroup label="Industria">
                    <select className="input" defaultValue="marketing">
                      <option value="marketing">Marketing y publicidad</option>
                      <option value="moda">Moda / retail</option>
                      <option value="servicios">Servicios profesionales</option>
                      <option value="salud">Salud / clínica</option>
                      <option value="alimentos">Alimentos / restaurante</option>
                      <option value="otro">Otro</option>
                    </select>
                  </FieldGroup>
                </div>

                <FieldGroup label="Descripción breve de tu negocio">
                  <textarea
                    value={settings.client_agent_preferences.business_summary || ""}
                    onChange={(e) =>
                      updatePreference("business_summary", e.target.value)
                    }
                    className="input min-h-[120px]"
                    placeholder="Ej. Agencia especializada en marketing digital, generación de leads y automatización con IA..."
                  />
                </FieldGroup>
              </Card>

              <Card
                icon={<IconRobot />}
                title="Comportamiento del agente"
                description="Define cómo debe hablar y vender SALES AI."
              >
                <FieldGroup label="Tono de comunicación">
                  <select
                    value={settings.response_rules.tone}
                    onChange={(e) => updateResponseRule("tone", e.target.value)}
                    className="input"
                  >
                    <option value="profesional, claro y vendedor">
                      Profesional, claro y vendedor
                    </option>
                    <option value="amable, cercano y consultivo">
                      Amable, cercano y consultivo
                    </option>
                    <option value="directo, persuasivo y comercial">
                      Directo, persuasivo y comercial
                    </option>
                    <option value="premium, elegante y confiable">
                      Premium, elegante y confiable
                    </option>
                  </select>
                </FieldGroup>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FieldGroup label="Estilo de respuesta">
                    <select className="input" defaultValue="directo">
                      <option value="directo">Directo y persuasivo</option>
                      <option value="consultivo">Consultivo</option>
                      <option value="breve">Breve y práctico</option>
                      <option value="detallado">Detallado y educativo</option>
                    </select>
                  </FieldGroup>

                  <FieldGroup label="Objetivo principal">
                    <select className="input" defaultValue="ventas">
                      <option value="ventas">Generar ventas</option>
                      <option value="calificar">Calificar prospectos</option>
                      <option value="agendar">Agendar citas</option>
                      <option value="soporte">Atender dudas</option>
                    </select>
                  </FieldGroup>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
                  El agente usará este tono y estilo en las conversaciones.
                </div>
              </Card>

              <Card
                icon={<IconClock />}
                title="Horario de atención"
                description="Define cuándo el agente debe estar disponible."
                action={
                  <ToggleSwitch
                    checked={settings.business_hours.enabled}
                    onChange={updateBusinessHoursEnabled}
                  />
                }
              >
                <div>
                  <p className="mb-2 text-sm font-bold text-[#5b6a84]">
                    Días de atención
                  </p>

                  <div className="grid grid-cols-7 gap-2">
                    {days.map((day) => {
                      const active = !settings.business_hours[day.key].closed;

                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => updateDayClosed(day.key)}
                          className={`rounded-2xl px-2 py-3 text-xs font-black transition ${
                            active
                              ? "bg-[#effcff] text-[#08a9c6] ring-1 ring-[#cfeef6]"
                              : "bg-[#f1f5f9] text-[#7a889d]"
                          }`}
                        >
                          {day.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <FieldGroup label="Horario">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <input
                      type="time"
                      value={settings.business_hours.monday.open || "09:00"}
                      onChange={(e) => updateGeneralTime("open", e.target.value)}
                      className="input"
                    />
                    <span className="text-sm font-black text-[#7a889d]">a</span>
                    <input
                      type="time"
                      value={settings.business_hours.monday.close || "18:00"}
                      onChange={(e) => updateGeneralTime("close", e.target.value)}
                      className="input"
                    />
                  </div>
                </FieldGroup>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
                  Fuera de este horario, el agente podrá responder con un mensaje
                  automático de disponibilidad.
                </div>
              </Card>

              <Card
                icon={<IconBag />}
                title="Productos / Servicios"
                description="Describe qué ofreces para que el agente lo tenga claro."
              >
                <FieldGroup label="Lista de productos o servicios">
                  <textarea
                    value={settings.client_agent_preferences.products_services || ""}
                    onChange={(e) =>
                      updatePreference("products_services", e.target.value)
                    }
                    className="input min-h-[140px]"
                    placeholder={"Ej.\nGestión de redes sociales\nCampañas publicitarias\nAutomatización con IA\nGeneración de leads"}
                  />
                </FieldGroup>

                {productItems.length ? (
                  <div className="grid grid-cols-1 gap-2">
                    {productItems.map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] px-4 py-3 text-sm font-black text-[#081535]"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>

              <Card
                icon={<IconFollowUp />}
                title="Seguimientos automáticos"
                description="El agente puede dar seguimiento a prospectos."
                action={
                  <ToggleSwitch
                    checked={settings.followups_enabled}
                    onChange={(value) => {
                      updateSimpleField("followups_enabled", value);
                      updatePreference("allow_followups", value);
                    }}
                  />
                }
              >
                <RangeRow
                  label="Máximo de seguimientos"
                  value={settings.max_followups}
                  min={0}
                  max={10}
                  suffix="seguimientos"
                  onChange={(value) =>
                    updateSimpleField("max_followups", value)
                  }
                />

                <RangeRow
                  label="Primer seguimiento después de"
                  value={Math.round(settings.first_followup_delay_minutes / 60)}
                  min={1}
                  max={72}
                  suffix="horas"
                  onChange={(value) =>
                    updateSimpleField(
                      "first_followup_delay_minutes",
                      value * 60
                    )
                  }
                />

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
                  El agente esperará el tiempo indicado antes de hacer el primer
                  seguimiento.
                </div>
              </Card>

              <Card
                icon={<IconUsers />}
                title="Escalamiento a humano"
                description="Define cuándo el agente debe pedir ayuda humana."
                action={
                  <ToggleSwitch
                    checked={settings.human_escalation_enabled}
                    onChange={(value) => {
                      updateSimpleField("human_escalation_enabled", value);
                      updatePreference("human_escalation_enabled", value);
                    }}
                  />
                }
              >
                <div className="space-y-2">
                  <CheckRule text="Cuando el cliente pida hablar con una persona" />
                  <CheckRule text="Cuando el cliente esté molesto o confundido" />
                  <CheckRule text="Cuando se hable de precios muy altos" />
                  <CheckRule text="Cuando haya dudas de pagos, envíos o reclamos" />
                </div>

                <FieldGroup label="Casos especiales para pedir humano">
                  <textarea
                    value={settings.client_agent_preferences.escalation_notes || ""}
                    onChange={(e) =>
                      updatePreference("escalation_notes", e.target.value)
                    }
                    className="input min-h-[90px]"
                    placeholder="Ej. Cuando piden descuento especial, cambios de pedido, comprobantes, reclamos..."
                  />
                </FieldGroup>
              </Card>
            </section>

            <section className="rounded-[26px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#effcff] text-[#08a9c6]">
                    <IconShield />
                  </div>

                  <div>
                    <h2 className="text-xl font-black text-[#081535]">
                      Reglas de conversación
                    </h2>
                    <p className="mt-1 text-sm font-semibold leading-5 text-[#5b6a84]">
                      Establece límites y reglas que el agente debe seguir siempre.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={saving || loading}
                  className="inline-flex items-center justify-center gap-3 rounded-2xl bg-[#08a9c6] px-5 py-3.5 text-sm font-black text-white shadow-[0_16px_36px_rgba(8,169,198,0.24)] transition hover:bg-[#0598b5] disabled:opacity-50"
                >
                  <IconSave />
                  {saving ? "Guardando..." : "Guardar configuración"}
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                <RuleCard
                  title="No prometer cosas sin confirmar"
                  checked={
                    settings.response_rules
                      .avoid_promising_without_confirmation
                  }
                  onChange={(value) =>
                    updateResponseRule(
                      "avoid_promising_without_confirmation",
                      value
                    )
                  }
                />

                <RuleCard
                  title="Una pregunta a la vez"
                  checked={settings.response_rules.ask_one_question_at_a_time}
                  onChange={(value) =>
                    updateResponseRule("ask_one_question_at_a_time", value)
                  }
                />

                <RuleCard
                  title="Calificar antes de vender"
                  checked={settings.response_rules.always_try_to_qualify}
                  onChange={(value) =>
                    updateResponseRule("always_try_to_qualify", value)
                  }
                />

                <RuleCard
                  title="No dar descuentos sin autorización"
                  checked={
                    settings.response_rules
                      .never_apply_discounts_without_permission
                  }
                  onChange={(value) =>
                    updateResponseRule(
                      "never_apply_discounts_without_permission",
                      value
                    )
                  }
                />

                <div className="rounded-2xl border border-[#cfeef6] bg-[#effcff] p-4">
                  <p className="text-sm font-black text-[#081535]">
                    Qué no puede prometer
                  </p>
                  <textarea
                    value={
                      settings.client_agent_preferences.forbidden_promises || ""
                    }
                    onChange={(e) =>
                      updatePreference("forbidden_promises", e.target.value)
                    }
                    className="mt-3 min-h-[78px] w-full resize-none rounded-xl border border-[#dfe8f3] bg-white px-3 py-2 text-xs font-bold text-[#081535] outline-none focus:border-[#20c6df] focus:ring-4 focus:ring-[#dff8ff]"
                    placeholder="Ej. descuentos, envíos gratis, apartados..."
                  />
                </div>
              </div>
            </section>

            <div className="rounded-[18px] border border-[#cfeef6] bg-[#ecfbff] px-5 py-4 text-sm font-bold text-[#236276]">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#12bfe8] text-white">
                  i
                </span>
                <p>
                  El cliente configura cómo debe vender el agente. Cometa mantiene
                  protegida la conexión técnica, permisos y activación real de WhatsApp.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function HeroCard({
  onSave,
  saving,
}: {
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)] lg:p-7">
      <div className="relative z-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#cfeef6] bg-[#effcff] px-4 py-2 text-xs font-black tracking-wide text-[#0798b8] shadow-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-[#12bfe8]" />
          SALES AI
        </div>

        <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight text-[#081535] lg:text-[46px] lg:leading-[1.04]">
          Configuración del Agente
        </h1>

        <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-[#5b6a84]">
          Personaliza cómo SALES AI debe hablar, responder y vender por tu
          negocio. Estos ajustes ayudan al agente a representar tu marca y cerrar
          más ventas.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <HeroBenefit
            icon={<IconStar />}
            title="Más ventas"
            text="Respuestas alineadas a tu negocio"
          />
          <HeroBenefit
            icon={<IconMessage />}
            title="Mejor experiencia"
            text="Conversaciones más humanas"
          />
          <HeroBenefit
            icon={<IconShield />}
            title="100% personalizado"
            text="Tú defines las reglas del agente"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/sales-ai"
            className="rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3 text-sm font-black text-[#324159] shadow-sm transition hover:bg-[#f8fbff]"
          >
            ← Dashboard
          </Link>

          <Link
            href="/sales-ai/connect"
            className="rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3 text-sm font-black text-[#324159] shadow-sm transition hover:bg-[#f8fbff]"
          >
            Conexión WhatsApp
          </Link>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-2xl bg-[#08a9c6] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(8,169,198,0.22)] transition hover:bg-[#0598b5] disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar configuración"}
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute right-7 top-7 hidden h-40 w-40 items-center justify-center rounded-full bg-[#e7fbff] text-[#08a9c6] lg:flex">
        <IconBot />
      </div>
    </section>
  );
}

function SummaryPanel({
  status,
  settings,
  onSave,
  saving,
}: {
  status: {
    label: string;
    title: string;
    helper: string;
    tone: "green" | "blue" | "yellow";
  };
  settings: AgentSettings;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-[#081535]">
            Resumen de configuración
          </h2>
          <p
            className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${
              status.tone === "green"
                ? "bg-emerald-50 text-emerald-600"
                : status.tone === "blue"
                ? "bg-cyan-50 text-cyan-700"
                : "bg-amber-50 text-amber-600"
            }`}
          >
            {status.label}
          </p>
        </div>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-2xl bg-[#08a9c6] px-4 py-3 text-xs font-black text-white transition hover:bg-[#0598b5] disabled:opacity-50"
        >
          Guardar
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <SummaryLine
          icon={<IconClock />}
          label="Horario de atención"
          value={
            settings.business_hours.enabled
              ? `${settings.business_hours.monday.open || "09:00"} - ${
                  settings.business_hours.monday.close || "18:00"
                }`
              : "Sin restricción"
          }
        />

        <SummaryLine
          icon={<IconRobot />}
          label="Tono del agente"
          value={settings.response_rules.tone}
        />

        <SummaryLine
          icon={<IconFollowUp />}
          label="Seguimientos"
          value={
            settings.followups_enabled
              ? `Permitidos (máx. ${settings.max_followups})`
              : "Apagados"
          }
        />

        <SummaryLine
          icon={<IconUsers />}
          label="Escalamiento humano"
          value={settings.human_escalation_enabled ? "Activado" : "Apagado"}
        />
      </div>

      <div className="mt-5 rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] px-4 py-3">
        <p className="text-sm font-black text-[#081535]">{status.title}</p>
        <p className="mt-1 text-xs font-bold leading-5 text-[#60708a]">
          {status.helper}
        </p>
      </div>
    </section>
  );
}

function Card({
  icon,
  title,
  description,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#effcff] text-[#08a9c6]">
            {icon}
          </div>

          <div>
            <h2 className="text-xl font-black text-[#081535]">{title}</h2>
            <p className="mt-1 text-sm font-semibold leading-5 text-[#5b6a84]">
              {description}
            </p>
          </div>
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function HeroBenefit({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#dfe8f3] bg-white/80 px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#effcff] text-[#08a9c6]">
        {icon}
      </div>
      <div>
        <p className="text-sm font-black text-[#081535]">{title}</p>
        <p className="text-xs font-bold text-[#60708a]">{text}</p>
      </div>
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-[#5b6a84]">{label}</p>
        <div className="rounded-2xl border border-[#dfe8f3] bg-white px-4 py-2 text-sm font-black text-[#081535]">
          {value} <span className="text-xs text-[#7a889d]">{suffix}</span>
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#08a9c6]"
      />
    </div>
  );
}

function RuleCard({
  title,
  checked,
  onChange,
}: {
  title: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-2xl border p-4 text-left transition ${
        checked
          ? "border-[#cfeef6] bg-[#effcff]"
          : "border-[#dfe8f3] bg-white hover:bg-[#f8fbff]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${
            checked ? "bg-[#08a9c6] text-white" : "bg-[#f1f5f9] text-[#7a889d]"
          }`}
        >
          ✓
        </div>

        <p className="text-sm font-black leading-5 text-[#081535]">{title}</p>
      </div>
    </button>
  );
}

function CheckRule({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#08a9c6] text-xs font-black text-white">
        ✓
      </span>
      <p className="text-sm font-bold text-[#42516a]">{text}</p>
    </div>
  );
}

function SummaryLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-[#08a9c6]">{icon}</span>
        <p className="text-sm font-black text-[#42516a]">{label}</p>
      </div>
      <p className="max-w-[170px] truncate text-right text-sm font-black text-[#081535]">
        {value}
      </p>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        checked ? "bg-[#08a9c6]" : "bg-[#cbd5e1]"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-[#5b6a84]">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function normalizeSettings(data: any): AgentSettings {
  return {
    ...defaultSettings,
    ...data,
    business_hours: {
      ...defaultBusinessHours,
      ...(data?.business_hours || {}),
      monday: {
        ...defaultBusinessHours.monday,
        ...(data?.business_hours?.monday || {}),
      },
      tuesday: {
        ...defaultBusinessHours.tuesday,
        ...(data?.business_hours?.tuesday || {}),
      },
      wednesday: {
        ...defaultBusinessHours.wednesday,
        ...(data?.business_hours?.wednesday || {}),
      },
      thursday: {
        ...defaultBusinessHours.thursday,
        ...(data?.business_hours?.thursday || {}),
      },
      friday: {
        ...defaultBusinessHours.friday,
        ...(data?.business_hours?.friday || {}),
      },
      saturday: {
        ...defaultBusinessHours.saturday,
        ...(data?.business_hours?.saturday || {}),
      },
      sunday: {
        ...defaultBusinessHours.sunday,
        ...(data?.business_hours?.sunday || {}),
      },
    },
    response_rules: {
      ...defaultSettings.response_rules,
      ...(data?.response_rules || {}),
    },
    client_agent_preferences: {
      ...defaultSettings.client_agent_preferences,
      ...(data?.client_agent_preferences || {}),
    },
  };
}

function LeftRail() {
  return (
    <aside className="sticky top-0 hidden h-screen w-[108px] shrink-0 flex-col items-center border-r border-[#e4edf5] bg-white px-4 py-5 shadow-[8px_0_28px_rgba(15,23,42,0.03)] xl:flex">
      <Link
        href="/sales-ai"
        className="flex flex-col items-center justify-center text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#effcff] text-[#08a9c6]">
          <IconCometa />
        </div>
        <p className="mt-3 text-xs font-black text-[#081535]">COMETA OS</p>
      </Link>

      <nav className="mt-7 flex w-full flex-1 flex-col items-center gap-3">
        <RailLink href="/sales-ai" label="AI" icon={<IconStar />} />
        <RailLink href="/sales-ai/inbox" label="IN" icon={<IconInbox />} />
        <RailLink href="/sales-ai/connect" label="WA" icon={<IconWhatsApp />} />
        <RailLink href="/sales-ai/agent-settings" label="AG" icon={<IconUsers />} active />

        <div className="my-3 h-px w-full bg-[#e4edf5]" />

        <RailLink href="/sales-ai/analytics" label="AN" icon={<IconBars />} />
        <RailLink href="/sales-ai/settings" label="AJ" icon={<IconGear />} />
        <RailLink href="/sales-ai/help" label="AY" icon={<IconHelp />} />
      </nav>

      <div className="w-full text-center">
        <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#081535] text-lg font-black text-white shadow-[0_14px_30px_rgba(8,21,53,0.22)]">
          CM
          <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#12bfe8]" />
        </div>

        <p className="mt-2 truncate text-xs font-black text-[#081535]">
          Cometa Mkt
        </p>
      </div>
    </aside>
  );
}

function RailLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl text-xs font-black transition ${
        active
          ? "bg-[#08a9c6] text-white shadow-[0_14px_30px_rgba(8,169,198,0.22)]"
          : "border border-[#dfe8f3] bg-white text-[#62718a] hover:bg-[#f8fbff] hover:text-[#08a9c6]"
      }`}
    >
      <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
      {label}
    </Link>
  );
}

/* Icons */

function IconCometa() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="h-10 w-10">
      <path
        d="M49.2 34.4c-2.5 9.2-12 14.6-21.2 12.1-9.2-2.5-14.6-12-12.1-21.2 2.5-9.2 12-14.6 21.2-12.1"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M39 14l12-6-5 12 12-1-10 8 9 6-13 1 2 12-9-9-10 8 4-13-12-4 13-4-3-12 10 7Z"
        fill="currentColor"
        opacity=".9"
      />
    </svg>
  );
}

function IconBot() {
  return (
    <svg viewBox="0 0 120 120" fill="none" className="h-32 w-32">
      <circle cx="60" cy="60" r="52" fill="currentColor" opacity=".12" />
      <rect x="30" y="38" width="60" height="44" rx="20" fill="#081535" />
      <circle cx="48" cy="60" r="5" fill="#12bfe8" />
      <circle cx="72" cy="60" r="5" fill="#12bfe8" />
      <path d="M50 72c6 5 14 5 20 0" stroke="#12bfe8" strokeWidth="4" strokeLinecap="round" />
      <path d="M60 25v12" stroke="#12bfe8" strokeWidth="5" strokeLinecap="round" />
      <circle cx="60" cy="22" r="5" fill="#12bfe8" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M4 7h16v10H4V7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 14h4l2 3h4l2-3h4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 3a8.5 8.5 0 0 0-7.1 13.2L4 21l4.9-1.1A8.5 8.5 0 1 0 12 3Z" stroke="currentColor" strokeWidth="2" />
      <path d="M9 8.5c.4 2.4 2.1 5 5.6 6.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconBars() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M5 20V10m7 10V4m7 16v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="2" />
      <path d="M19 13.2v-2.4l-2.1-.5c-.2-.6-.4-1.1-.7-1.6l1.1-1.8-1.7-1.7-1.8 1.1c-.5-.3-1-.5-1.6-.7L11.8 3H9.4l-.5 2.1c-.6.2-1.1.4-1.6.7L5.5 4.7 3.8 6.4l1.1 1.8c-.3.5-.5 1-.7 1.6L2 10.2v2.4l2.1.5c.2.6.4 1.1.7 1.6l-1.1 1.8 1.7 1.7 1.8-1.1c.5.3 1 .5 1.6.7l.5 2.1h2.4l.5-2.1c.6-.2 1.1-.4 1.6-.7l1.8 1.1 1.7-1.7-1.1-1.8c.3-.5.5-1 .7-1.6l2.1-.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" />
      <path d="M9.8 9a2.3 2.3 0 1 1 3.7 1.8c-.9.6-1.5 1.1-1.5 2.2m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconBusiness() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M4 21V5l8-2 8 2v16M8 9h1m-1 4h1m-1 4h1m6-8h1m-1 4h1m-1 4h1M10 21v-4h4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconRobot() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M7 8h10a3 3 0 0 1 3 3v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a3 3 0 0 1 3-3Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8V4m-4 8h.01M16 12h.01M9 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconBag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M6 8h12l1 13H5L6 8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 8a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconFollowUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M4 12a8 8 0 0 1 14-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 3v4h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 12a8 8 0 0 1-14 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 20c.5-3.3 2.4-5 5-5s4.5 1.7 5 5m0 0c.4-2.4 1.7-3.9 3.8-4.4 2.1.3 3.6 1.8 4.2 4.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 3 5 6v5c0 4.5 2.7 8.5 7 10 4.3-1.5 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function IconMessage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M4 5h16v11H8l-4 4V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M5 4h12l2 2v14H5V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 4v6h8V4M8 20v-6h8v6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}