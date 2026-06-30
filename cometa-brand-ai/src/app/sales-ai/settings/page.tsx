"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

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

type EscalationRules = {
  high_ticket: boolean;
  angry_customer: boolean;
  payment_problem: boolean;
  delivery_problem: boolean;
  close_probability_over: number;
};

type ResponseRules = {
  tone: string;
  avoid_promising_without_confirmation: boolean;
  ask_one_question_at_a_time: boolean;
  always_try_to_qualify: boolean;
  never_apply_discounts_without_permission: boolean;
};

type SalesAiSettings = {
  id?: string;
  brand_name: string;

  agent_mode: string;
  whatsapp_status: string;

  whatsapp_phone_number: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;

  auto_reply_enabled: boolean;
  send_whatsapp_enabled: boolean;
  followups_enabled: boolean;
  human_escalation_enabled: boolean;

  timezone: string;

  business_hours: BusinessHours;
  max_followups: number;
  first_followup_delay_minutes: number;

  escalation_rules: EscalationRules;
  response_rules: ResponseRules;

  internal_notes: string | null;

  created_at?: string;
  updated_at?: string;
};

const defaultSettings: SalesAiSettings = {
  brand_name: "Cometa Mkt",

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

const days = [
  { key: "monday", label: "Lun" },
  { key: "tuesday", label: "Mar" },
  { key: "wednesday", label: "Mié" },
  { key: "thursday", label: "Jue" },
  { key: "friday", label: "Vie" },
  { key: "saturday", label: "Sáb" },
  { key: "sunday", label: "Dom" },
] as const;

export default function SalesAISettingsPage() {
  const [brandName, setBrandName] = useState("Cometa Mkt");
  const [settings, setSettings] = useState<SalesAiSettings>(defaultSettings);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const agentState = useMemo(() => {
    if (settings.agent_mode === "automatic") {
      return {
        label: "Automático",
        helper: "SALES AI está preparado para operar si Cometa autoriza el envío real.",
        tone: "green" as const,
        icon: <IconSpark />,
      };
    }

    if (settings.agent_mode === "paused") {
      return {
        label: "Pausado",
        helper: "El agente está detenido y no debe ejecutar acciones automáticas.",
        tone: "yellow" as const,
        icon: <IconPause />,
      };
    }

    return {
      label: "Observación",
      helper: "SALES AI analiza conversaciones y genera recomendaciones.",
      tone: "blue" as const,
      icon: <IconEye />,
    };
  }, [settings.agent_mode]);

  const whatsappState = useMemo(() => {
    if (settings.whatsapp_status === "connected") {
      return {
        label: "Conectado",
        helper: "WhatsApp está listo para recibir eventos reales.",
        tone: "green" as const,
      };
    }

    if (settings.whatsapp_status === "connection_requested") {
      return {
        label: "Solicitud de conexión",
        helper: "El cliente solicitó conexión. Cometa debe validar Meta.",
        tone: "blue" as const,
      };
    }

    if (settings.whatsapp_status === "error") {
      return {
        label: "Error",
        helper: "Hay un problema de conexión o permisos.",
        tone: "red" as const,
      };
    }

    if (settings.whatsapp_status === "disabled") {
      return {
        label: "Desactivado",
        helper: "La integración de WhatsApp está apagada.",
        tone: "gray" as const,
      };
    }

    return {
      label: "Pendiente",
      helper: "Esperando verificación o conexión de Meta.",
      tone: "yellow" as const,
    };
  }, [settings.whatsapp_status]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setErrorMsg("");

    try {
      const res = await fetch(
        `/api/sales-ai/settings?brandName=${encodeURIComponent(brandName)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo cargar la configuración.");
      }

      setSettings(normalizeIncomingSettings(data.settings));
    } catch (error: any) {
      setErrorMsg(error?.message || "Error cargando configuración.");
      setSettings({
        ...defaultSettings,
        brand_name: brandName,
      });
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
      const res = await fetch("/api/sales-ai/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandName: settings.brand_name || brandName,

          agent_mode: settings.agent_mode,
          whatsapp_status: settings.whatsapp_status,

          whatsapp_phone_number: settings.whatsapp_phone_number,
          whatsapp_phone_number_id: settings.whatsapp_phone_number_id,
          whatsapp_business_account_id:
            settings.whatsapp_business_account_id,

          auto_reply_enabled: settings.auto_reply_enabled,
          send_whatsapp_enabled: settings.send_whatsapp_enabled,
          followups_enabled: settings.followups_enabled,
          human_escalation_enabled: settings.human_escalation_enabled,

          timezone: settings.timezone,

          business_hours: settings.business_hours,
          max_followups: Number(settings.max_followups || 0),
          first_followup_delay_minutes: Number(
            settings.first_followup_delay_minutes || 0
          ),

          escalation_rules: settings.escalation_rules,
          response_rules: settings.response_rules,

          internal_notes: settings.internal_notes,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo guardar la configuración.");
      }

      setSettings(normalizeIncomingSettings(data.settings));
      setMessage("Configuración guardada correctamente.");
    } catch (error: any) {
      setErrorMsg(error?.message || "Error guardando configuración.");
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof SalesAiSettings>(
    field: K,
    value: SalesAiSettings[K]
  ) {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateEscalationRule<K extends keyof EscalationRules>(
    field: K,
    value: EscalationRules[K]
  ) {
    setSettings((current) => ({
      ...current,
      escalation_rules: {
        ...current.escalation_rules,
        [field]: value,
      },
    }));
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
    }));
  }

  function updateBusinessHoursEnabled(value: boolean) {
    setSettings((current) => ({
      ...current,
      business_hours: {
        ...current.business_hours,
        enabled: value,
      },
    }));
  }

  function updateDaySchedule(
    day: keyof BusinessHours,
    field: keyof DaySchedule,
    value: string | boolean
  ) {
    if (day === "enabled") return;

    setSettings((current) => ({
      ...current,
      business_hours: {
        ...current.business_hours,
        [day]: {
          ...(current.business_hours[day] as DaySchedule),
          [field]: value,
        },
      },
    }));
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7fafc] text-[#081535]">
      <div className="flex min-h-screen">
        <LeftRail />

        <div className="min-w-0 flex-1 px-4 py-5 lg:px-5 xl:px-6">
          <div className="mx-auto w-full max-w-[1480px] space-y-4">
            <header className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)] lg:p-7">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#cfeef6] bg-[#effcff] px-4 py-2 text-xs font-black tracking-wide text-[#0798b8] shadow-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#12bfe8]" />
                  SALES AI <span className="text-[#8ccbd8]">·</span> SETTINGS
                </div>

                <h1 className="mt-5 text-4xl font-black tracking-tight text-[#081535] lg:text-[48px] lg:leading-[1.04]">
                  Configuración de SALES AI
                </h1>

                <p className="mt-4 max-w-4xl text-base font-semibold leading-7 text-[#5b6a84]">
                  Ajusta el modo del agente, conexión de WhatsApp, seguridad,
                  horarios, follow-ups y reglas internas de operación.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/sales-ai"
                    className="inline-flex items-center justify-center gap-3 rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3.5 text-sm font-black text-[#17213c] shadow-sm transition hover:bg-[#f8fbff]"
                  >
                    ← Dashboard
                  </Link>

                  <Link
                    href="/sales-ai/connect"
                    className="inline-flex items-center justify-center gap-3 rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3.5 text-sm font-black text-[#17213c] shadow-sm transition hover:bg-[#f8fbff]"
                  >
                    WhatsApp
                  </Link>

                  <button
                    type="button"
                    onClick={saveSettings}
                    disabled={saving || loading}
                    className="inline-flex items-center justify-center gap-3 rounded-2xl bg-[#08a9c6] px-5 py-3.5 text-sm font-black text-white shadow-[0_16px_36px_rgba(8,169,198,0.24)] transition hover:bg-[#0598b5] disabled:opacity-50"
                  >
                    <IconSave />
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </section>

              <AgentStatusCard
                label={agentState.label}
                helper={agentState.helper}
                tone={agentState.tone}
                icon={agentState.icon}
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
                description="Datos base para identificar la configuración activa."
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <FieldGroup label="Nombre del negocio">
                    <input
                      value={settings.brand_name}
                      onChange={(e) => {
                        updateField("brand_name", e.target.value);
                        setBrandName(e.target.value);
                      }}
                      className="input"
                    />
                  </FieldGroup>

                  <FieldGroup label="Zona horaria">
                    <input
                      value={settings.timezone}
                      onChange={(e) => updateField("timezone", e.target.value)}
                      className="input"
                    />
                  </FieldGroup>
                </div>

                <FieldGroup label="Notas internas">
                  <textarea
                    value={settings.internal_notes || ""}
                    onChange={(e) =>
                      updateField("internal_notes", e.target.value || null)
                    }
                    className="input min-h-[118px]"
                    placeholder="Notas visibles solo para Cometa..."
                  />
                </FieldGroup>
              </Card>

              <Card
                icon={<IconRobot />}
                title="Comportamiento del agente"
                description="Define cómo opera SALES AI."
              >
                <FieldGroup label="Modo del agente">
                  <select
                    value={settings.agent_mode}
                    onChange={(e) => updateField("agent_mode", e.target.value)}
                    className="input"
                  >
                    <option value="observation">Observación</option>
                    <option value="automatic">Automático</option>
                    <option value="paused">Pausado</option>
                  </select>
                </FieldGroup>

                <FieldGroup label="Tono del agente">
                  <textarea
                    value={settings.response_rules.tone}
                    onChange={(e) =>
                      updateResponseRule("tone", e.target.value)
                    }
                    className="input min-h-[82px]"
                  />
                </FieldGroup>

                <div className="space-y-2">
                  <CompactToggle
                    title="Generar respuestas"
                    checked={settings.auto_reply_enabled}
                    onChange={(value) =>
                      updateField("auto_reply_enabled", value)
                    }
                  />

                  <CompactToggle
                    title="Permitir seguimientos"
                    checked={settings.followups_enabled}
                    onChange={(value) =>
                      updateField("followups_enabled", value)
                    }
                  />

                  <CompactToggle
                    title="Escalar a humano"
                    checked={settings.human_escalation_enabled}
                    onChange={(value) =>
                      updateField("human_escalation_enabled", value)
                    }
                  />
                </div>
              </Card>

              <Card
                icon={<IconClock />}
                title="Horarios de atención"
                description="Control operativo por horario."
                action={
                  <ToggleSwitch
                    checked={settings.business_hours.enabled}
                    onChange={updateBusinessHoursEnabled}
                  />
                }
              >
                <FieldGroup label="Horario general">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <input
                      type="time"
                      value={settings.business_hours.monday.open || "09:00"}
                      onChange={(e) => {
                        const value = e.target.value;
                        days.forEach((day) =>
                          updateDaySchedule(day.key, "open", value)
                        );
                      }}
                      className="input"
                    />
                    <span className="text-sm font-black text-[#7a889d]">a</span>
                    <input
                      type="time"
                      value={settings.business_hours.monday.close || "18:00"}
                      onChange={(e) => {
                        const value = e.target.value;
                        days.forEach((day) =>
                          updateDaySchedule(day.key, "close", value)
                        );
                      }}
                      className="input"
                    />
                  </div>
                </FieldGroup>

                <div>
                  <p className="mb-2 text-sm font-bold text-[#5b6a84]">
                    Días activos
                  </p>

                  <div className="grid grid-cols-7 gap-2">
                    {days.map((day) => {
                      const current = settings.business_hours[day.key];
                      const active = !current.closed;

                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() =>
                            updateDaySchedule(day.key, "closed", active)
                          }
                          className={`rounded-2xl px-2 py-3 text-xs font-black transition ${
                            active
                              ? "bg-[#effcff] text-[#08a9c6] ring-1 ring-[#cfeef6]"
                              : "bg-[#f1f5f9] text-[#7a889d]"
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>

              <Card
                icon={<IconBell />}
                title="Automatización"
                description="Controla funciones operativas del agente."
              >
                <SettingsRow
                  icon={<IconMessage />}
                  label="Auto reply"
                  helper="Genera respuestas listas para enviar."
                  checked={settings.auto_reply_enabled}
                  onChange={(value) =>
                    updateField("auto_reply_enabled", value)
                  }
                />

                <SettingsRow
                  icon={<IconWhatsAppMini />}
                  label="Enviar WhatsApp real"
                  helper="Debe estar bloqueado hasta validar Meta."
                  checked={settings.send_whatsapp_enabled}
                  onChange={(value) =>
                    updateField("send_whatsapp_enabled", value)
                  }
                  danger
                />

                <SettingsRow
                  icon={<IconCalendar />}
                  label="Follow-ups"
                  helper="Programa seguimientos automáticos."
                  checked={settings.followups_enabled}
                  onChange={(value) =>
                    updateField("followups_enabled", value)
                  }
                />

                <SettingsRow
                  icon={<IconUsers />}
                  label="Escalamiento humano"
                  helper="Pide ayuda en casos sensibles."
                  checked={settings.human_escalation_enabled}
                  onChange={(value) =>
                    updateField("human_escalation_enabled", value)
                  }
                />
              </Card>

              <Card
                icon={<IconTarget />}
                title="Reglas de calificación"
                description="Define cómo priorizar prospectos."
              >
                <FieldGroup label="Escalar si probabilidad supera">
                  <div className="grid grid-cols-[1fr_86px] gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.escalation_rules.close_probability_over}
                      onChange={(e) =>
                        updateEscalationRule(
                          "close_probability_over",
                          Number(e.target.value || 0)
                        )
                      }
                    />
                    <div className="rounded-2xl border border-[#dfe8f3] bg-white px-3 py-3 text-center text-sm font-black text-[#081535]">
                      {settings.escalation_rules.close_probability_over} / 100
                    </div>
                  </div>
                </FieldGroup>

                <div className="space-y-2">
                  <CompactToggle
                    title="Ticket alto"
                    checked={settings.escalation_rules.high_ticket}
                    onChange={(value) =>
                      updateEscalationRule("high_ticket", value)
                    }
                  />

                  <CompactToggle
                    title="Cliente molesto"
                    checked={settings.escalation_rules.angry_customer}
                    onChange={(value) =>
                      updateEscalationRule("angry_customer", value)
                    }
                  />

                  <CompactToggle
                    title="Problema de pago"
                    checked={settings.escalation_rules.payment_problem}
                    onChange={(value) =>
                      updateEscalationRule("payment_problem", value)
                    }
                  />

                  <CompactToggle
                    title="Problema de entrega"
                    checked={settings.escalation_rules.delivery_problem}
                    onChange={(value) =>
                      updateEscalationRule("delivery_problem", value)
                    }
                  />
                </div>

                <div className="rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] p-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#7a889d]">
                    Follow-up
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <FieldGroup label="Máximo">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={settings.max_followups}
                        onChange={(e) =>
                          updateField(
                            "max_followups",
                            Number(e.target.value || 0)
                          )
                        }
                        className="input"
                      />
                    </FieldGroup>

                    <FieldGroup label="Minutos">
                      <input
                        type="number"
                        min={10}
                        value={settings.first_followup_delay_minutes}
                        onChange={(e) =>
                          updateField(
                            "first_followup_delay_minutes",
                            Number(e.target.value || 10)
                          )
                        }
                        className="input"
                      />
                    </FieldGroup>
                  </div>
                </div>
              </Card>

              <Card
                icon={<IconShield />}
                title="Seguridad y privacidad"
                description="Estado técnico protegido por Cometa."
              >
                <SecurityLine
                  label="Datos protegidos por Cometa"
                  status="Activo"
                  tone="green"
                />

                <SecurityLine
                  label="Envío automatizado"
                  status={
                    settings.send_whatsapp_enabled ? "Activo" : "Bloqueado"
                  }
                  tone={settings.send_whatsapp_enabled ? "green" : "red"}
                />

                <SecurityLine
                  label="Acceso técnico Meta"
                  status={settings.whatsapp_status}
                  tone={
                    settings.whatsapp_status === "connected" ? "green" : "yellow"
                  }
                />

                <SecurityLine
                  label="Retención de datos"
                  status="90 días"
                  tone="gray"
                />

                <div className="mt-4 rounded-2xl border border-[#cfeef6] bg-[#ecfbff] p-4">
                  <p className="text-sm font-black text-[#087994]">
                    Los cambios se aplican al guardar.
                  </p>

                  <button
                    type="button"
                    onClick={saveSettings}
                    disabled={saving || loading}
                    className="mt-4 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#08a9c6] px-5 py-3.5 text-sm font-black text-white shadow-[0_16px_36px_rgba(8,169,198,0.24)] transition hover:bg-[#0598b5] disabled:opacity-50"
                  >
                    <IconSave />
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </Card>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <Card
                icon={<IconWhatsAppMini />}
                title="Conexión WhatsApp / Meta"
                description="Datos técnicos internos. El cliente no ve esta información."
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FieldGroup label="Estado WhatsApp">
                    <select
                      value={settings.whatsapp_status}
                      onChange={(e) =>
                        updateField("whatsapp_status", e.target.value)
                      }
                      className="input"
                    >
                      <option value="pending_verification">
                        Pendiente de verificación
                      </option>
                      <option value="connection_requested">
                        Solicitud de conexión
                      </option>
                      <option value="connected">Conectado</option>
                      <option value="error">Error</option>
                      <option value="disabled">Desactivado</option>
                    </select>
                  </FieldGroup>

                  <FieldGroup label="Número WhatsApp">
                    <input
                      value={settings.whatsapp_phone_number || ""}
                      onChange={(e) =>
                        updateField(
                          "whatsapp_phone_number",
                          e.target.value || null
                        )
                      }
                      className="input"
                      placeholder="+52 445 123 4567"
                    />
                  </FieldGroup>

                  <FieldGroup label="Phone Number ID">
                    <input
                      value={settings.whatsapp_phone_number_id || ""}
                      onChange={(e) =>
                        updateField(
                          "whatsapp_phone_number_id",
                          e.target.value || null
                        )
                      }
                      className="input"
                      placeholder="ID de Meta"
                    />
                  </FieldGroup>

                  <FieldGroup label="WhatsApp Business Account ID">
                    <input
                      value={settings.whatsapp_business_account_id || ""}
                      onChange={(e) =>
                        updateField(
                          "whatsapp_business_account_id",
                          e.target.value || null
                        )
                      }
                      className="input"
                      placeholder="WABA ID"
                    />
                  </FieldGroup>
                </div>
              </Card>

              <Card
                icon={<IconList />}
                title="Reglas de conversación"
                description="Candados comerciales del agente."
              >
                <CompactToggle
                  title="No prometer sin confirmar"
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

                <CompactToggle
                  title="Una pregunta a la vez"
                  checked={settings.response_rules.ask_one_question_at_a_time}
                  onChange={(value) =>
                    updateResponseRule("ask_one_question_at_a_time", value)
                  }
                />

                <CompactToggle
                  title="Siempre calificar"
                  checked={settings.response_rules.always_try_to_qualify}
                  onChange={(value) =>
                    updateResponseRule("always_try_to_qualify", value)
                  }
                />

                <CompactToggle
                  title="No aplicar descuentos sin permiso"
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
              </Card>
            </section>

            <div className="rounded-[18px] border border-[#cfeef6] bg-[#ecfbff] px-5 py-4 text-sm font-bold text-[#236276]">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#12bfe8] text-white">
                  i
                </span>
                <p>
                  Esta pantalla es interna de Cometa. El cliente configura lo
                  básico en SALES AI, pero Cometa controla conexión, seguridad,
                  permisos y activación real de WhatsApp.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function normalizeIncomingSettings(data: any): SalesAiSettings {
  return {
    ...defaultSettings,
    ...data,
    brand_name: data?.brand_name || defaultSettings.brand_name,
    business_hours: {
      ...defaultSettings.business_hours,
      ...(data?.business_hours || {}),
      monday: {
        ...defaultSettings.business_hours.monday,
        ...(data?.business_hours?.monday || {}),
      },
      tuesday: {
        ...defaultSettings.business_hours.tuesday,
        ...(data?.business_hours?.tuesday || {}),
      },
      wednesday: {
        ...defaultSettings.business_hours.wednesday,
        ...(data?.business_hours?.wednesday || {}),
      },
      thursday: {
        ...defaultSettings.business_hours.thursday,
        ...(data?.business_hours?.thursday || {}),
      },
      friday: {
        ...defaultSettings.business_hours.friday,
        ...(data?.business_hours?.friday || {}),
      },
      saturday: {
        ...defaultSettings.business_hours.saturday,
        ...(data?.business_hours?.saturday || {}),
      },
      sunday: {
        ...defaultSettings.business_hours.sunday,
        ...(data?.business_hours?.sunday || {}),
      },
    },
    escalation_rules: {
      ...defaultSettings.escalation_rules,
      ...(data?.escalation_rules || {}),
    },
    response_rules: {
      ...defaultSettings.response_rules,
      ...(data?.response_rules || {}),
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
        <RailLink href="/sales-ai" label="AI" icon={<IconSpark />} />
        <RailLink href="/sales-ai/inbox" label="IN" icon={<IconInbox />} />
        <RailLink
          href="/sales-ai/connect"
          label="WA"
          icon={<IconWhatsAppMini />}
        />

        <div className="my-3 h-px w-full bg-[#e4edf5]" />

        <RailLink href="/sales-ai/analytics" label="AN" icon={<IconBars />} />
        <RailLink href="/sales-ai/settings" label="AJ" icon={<IconGear />} active />
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

function AgentStatusCard({
  label,
  helper,
  tone,
  icon,
}: {
  label: string;
  helper: string;
  tone: "green" | "yellow" | "blue" | "red" | "gray";
  icon: ReactNode;
}) {
  const toneMap = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    yellow: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-[#a7eef6] bg-[#eafffc] text-[#087994]",
    red: "border-red-200 bg-red-50 text-red-700",
    gray: "border-[#dfe8f3] bg-[#f8fbff] text-[#5b6a84]",
  };

  return (
    <section
      className={`rounded-[28px] border p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)] ${toneMap[tone]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-[#087994]">
            Estado del agente
          </p>
          <h2 className="mt-3 text-4xl font-black tracking-tight">{label}</h2>
          <p className="mt-4 text-sm font-bold leading-6 opacity-90">
            {helper}
          </p>
        </div>

        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#bdeff5] bg-white/75 text-[#08a9c6] shadow-sm">
          {icon}
        </div>
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

function CompactToggle({
  title,
  checked,
  onChange,
}: {
  title: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] px-4 py-3">
      <p className="text-sm font-black text-[#081535]">{title}</p>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}

function SettingsRow({
  icon,
  label,
  helper,
  checked,
  onChange,
  danger,
}: {
  icon: ReactNode;
  label: string;
  helper: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#e4edf5] py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
            danger ? "bg-red-50 text-red-500" : "bg-[#effcff] text-[#08a9c6]"
          }`}
        >
          {icon}
        </div>

        <div>
          <p className="text-sm font-black text-[#081535]">{label}</p>
          <p className="mt-1 text-xs font-bold text-[#6a7890]">{helper}</p>
        </div>
      </div>

      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}

function SecurityLine({
  label,
  status,
  tone,
}: {
  label: string;
  status: string;
  tone: "green" | "red" | "yellow" | "gray";
}) {
  const toneMap = {
    green: "text-emerald-600",
    red: "text-red-500",
    yellow: "text-amber-500",
    gray: "text-[#7a889d]",
  };

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#e4edf5] py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <IconLock />
        <p className="text-sm font-black text-[#081535]">{label}</p>
      </div>

      <p className={`text-xs font-black ${toneMap[tone]}`}>{status}</p>
    </div>
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

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M4 7h16v10H4V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M4 14h4l2 3h4l2-3h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconWhatsAppMini() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M12 3a8.5 8.5 0 0 0-7.1 13.2L4 21l4.9-1.1A8.5 8.5 0 1 0 12 3Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9 8.5c.4 2.4 2.1 5 5.6 6.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBars() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M5 20V10m7 10V4m7 16v-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconGear() {
  return <IconGearSmall />;
}

function IconHelp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9.8 9a2.3 2.3 0 1 1 3.7 1.8c-.9.6-1.5 1.1-1.5 2.2m0 3h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconGearSmall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19 13.2v-2.4l-2.1-.5c-.2-.6-.4-1.1-.7-1.6l1.1-1.8-1.7-1.7-1.8 1.1c-.5-.3-1-.5-1.6-.7L11.8 3H9.4l-.5 2.1c-.6.2-1.1.4-1.6.7L5.5 4.7 3.8 6.4l1.1 1.8c-.3.5-.5 1-.7 1.6L2 10.2v2.4l2.1.5c.2.6.4 1.1.7 1.6l-1.1 1.8 1.7 1.7 1.8-1.1c.5.3 1 .5 1.6.7l.5 2.1h2.4l.5-2.1c.6-.2 1.1-.4 1.6-.7l1.8 1.1 1.7-1.7-1.1-1.8c.3-.5.5-1 .7-1.6l2.1-.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSave() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M5 4h12l2 2v14H5V4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8 4v6h8V4M8 20v-6h8v6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
      <path
        d="M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
      <path
        d="M8 5v14M16 5v14"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBusiness() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M4 21V5l8-2 8 2v16M8 9h1m-1 4h1m-1 4h1m6-8h1m-1 4h1m-1 4h1M10 21v-4h4v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRobot() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M7 8h10a3 3 0 0 1 3 3v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a3 3 0 0 1 3-3Z"
        stroke="currentColor"
        strokeWidth="2"
      />
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

function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 21h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M12 3 5 6v5c0 4.5 2.7 8.5 7 10 4.3-1.5 7-5.5 7-10V6l-7-3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
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

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M5 5h14v16H5V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 3v4m8-4v4M5 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path
        d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3 20c.5-3.3 2.4-5 5-5s4.5 1.7 5 5m0 0c.4-2.4 1.7-3.9 3.8-4.4 2.1.3 3.6 1.8 4.2 4.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 11h12v10H6V11Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}