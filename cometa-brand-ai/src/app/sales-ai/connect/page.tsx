"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type ClientConnection = {
  brand_name: string;
  agent_mode: string;
  whatsapp_status: string;
  whatsapp_phone_number: string | null;
  client_connection_status: string;
  client_requested_phone_number: string | null;
  client_connection_notes: string | null;
  client_requested_at: string | null;
  client_agent_preferences: {
    tone: string;
    business_hours_enabled: boolean;
    human_escalation_enabled: boolean;
    allow_followups: boolean;
    client_can_activate_automatic: boolean;
  };
};

const defaultConnection: ClientConnection = {
  brand_name: "Cometa Mkt",
  agent_mode: "observation",
  whatsapp_status: "pending_verification",
  whatsapp_phone_number: null,
  client_connection_status: "not_requested",
  client_requested_phone_number: null,
  client_connection_notes: null,
  client_requested_at: null,
  client_agent_preferences: {
    tone: "profesional, claro y vendedor",
    business_hours_enabled: false,
    human_escalation_enabled: true,
    allow_followups: true,
    client_can_activate_automatic: false,
  },
};

export default function SalesAIConnectPage() {
  const [brandName, setBrandName] = useState("Cometa Mkt");
  const [requestedPhoneNumber, setRequestedPhoneNumber] = useState("");
  const [connectionNotes, setConnectionNotes] = useState("");
  const [connection, setConnection] =
    useState<ClientConnection>(defaultConnection);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const phoneDisplay =
    connection.client_requested_phone_number ||
    connection.whatsapp_phone_number ||
    requestedPhoneNumber ||
    "Sin número solicitado";

  const isRequested =
    connection.client_connection_status === "requested" ||
    connection.whatsapp_status === "connection_requested";

  const isConnected = connection.whatsapp_status === "connected";

  const state = useMemo(() => {
    if (isConnected) {
      return {
        label: "WhatsApp conectado",
        helper:
          "Tu número ya está conectado. SALES AI puede operar según el modo autorizado por Cometa.",
        tone: "green" as const,
      };
    }

    if (isRequested) {
      return {
        label: "Solicitud recibida",
        helper:
          "Cometa revisará la conexión con Meta y preparará WhatsApp en modo observación.",
        tone: "blue" as const,
      };
    }

    if (connection.whatsapp_status === "error") {
      return {
        label: "Requiere revisión",
        helper:
          "Hay un detalle con la conexión. Cometa revisará la integración técnica.",
        tone: "red" as const,
      };
    }

    return {
      label: "Pendiente de conexión",
      helper:
        "Solicita la conexión de WhatsApp. Cometa se encarga de la parte técnica.",
      tone: "yellow" as const,
    };
  }, [connection.whatsapp_status, isConnected, isRequested]);

  const loadConnection = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setErrorMsg("");

    try {
      const res = await fetch(
        `/api/sales-ai/connect-request?brandName=${encodeURIComponent(
          brandName
        )}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo cargar la conexión.");
      }

      const loaded = normalizeConnection(data.connection);

      setConnection(loaded);
      setRequestedPhoneNumber(
        loaded.client_requested_phone_number ||
          loaded.whatsapp_phone_number ||
          ""
      );
      setConnectionNotes(loaded.client_connection_notes || "");
    } catch (error: any) {
      setErrorMsg(error?.message || "Error cargando conexión.");
    } finally {
      setLoading(false);
    }
  }, [brandName]);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  async function submitRequest() {
    setSaving(true);
    setMessage("");
    setErrorMsg("");

    try {
      const res = await fetch("/api/sales-ai/connect-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandName,
          requestedPhoneNumber,
          connectionNotes,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo guardar la solicitud.");
      }

      const loaded = normalizeConnection(data.connection);
      setConnection(loaded);
      setMessage(
        isRequested
          ? "Solicitud actualizada. Cometa revisará la conexión técnica de WhatsApp."
          : "Solicitud enviada. Cometa revisará la conexión técnica de WhatsApp."
      );
    } catch (error: any) {
      setErrorMsg(error?.message || "Error guardando solicitud.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7fafc] text-[#081535]">
      <div className="flex min-h-screen">
        <LeftRail />

        <div className="min-w-0 flex-1 px-4 py-5 lg:px-5 xl:px-6">
          <div className="mx-auto w-full max-w-[1440px] space-y-4">
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
              <HeroCard />
              <StatusCard
                label={state.label}
                helper={state.helper}
                phone={phoneDisplay}
                tone={state.tone}
              />
            </section>

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

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="min-w-0 space-y-4">
                <SalesChannelCard
                  phone={phoneDisplay}
                  stateLabel={state.label}
                  isRequested={isRequested}
                  isConnected={isConnected}
                  onRefresh={loadConnection}
                  loading={loading}
                />

                <UpdateRequestCard
                  brandName={brandName}
                  setBrandName={setBrandName}
                  requestedPhoneNumber={requestedPhoneNumber}
                  setRequestedPhoneNumber={setRequestedPhoneNumber}
                  connectionNotes={connectionNotes}
                  setConnectionNotes={setConnectionNotes}
                  onSubmit={submitRequest}
                  saving={saving}
                  loading={loading}
                  isRequested={isRequested}
                />
              </div>

              <div className="min-w-0 space-y-4">
                <ChecklistCard
                  isRequested={isRequested}
                  isConnected={isConnected}
                />

                <SecurityCard />

                <CapabilitiesCard />
              </div>
            </section>

            <div className="rounded-[18px] border border-[#cfeef6] bg-[#ecfbff] px-5 py-4 text-sm font-bold text-[#236276]">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#12bfe8] text-white">
                  i
                </span>
                <p>
                  Primero analizamos mensajes sin enviar respuestas reales.
                  Después activamos el canal de forma controlada.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function HeroCard() {
  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)] lg:p-7">
      <div className="inline-flex items-center gap-2 rounded-full border border-[#cfeef6] bg-[#effcff] px-4 py-2 text-xs font-black tracking-wide text-[#0798b8] shadow-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-[#12bfe8]" />
        SALES AI <span className="text-[#8ccbd8]">·</span> WHATSAPP
      </div>

      <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight text-[#081535] lg:text-[48px] lg:leading-[1.04] 2xl:text-[52px]">
        Conecta WhatsApp a SALES AI
      </h1>

      <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-[#5b6a84]">
        Activa el canal donde tus prospectos ya están preguntando. Cometa se
        encarga de Meta, permisos, webhooks y validación técnica.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/sales-ai"
          className="inline-flex items-center justify-center gap-3 rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3.5 text-sm font-black text-[#17213c] shadow-sm transition hover:bg-[#f8fbff]"
        >
          <span className="text-lg">←</span>
          Volver a SALES AI
        </Link>

        <Link
          href="/sales-ai/agent-settings"
          className="inline-flex items-center justify-center gap-3 rounded-2xl bg-[#08a9c6] px-5 py-3.5 text-sm font-black text-white shadow-[0_16px_36px_rgba(8,169,198,0.24)] transition hover:bg-[#0598b5]"
        >
          Configurar agente
          <span className="text-lg">→</span>
        </Link>
      </div>
    </section>
  );
}

function StatusCard({
  label,
  helper,
  phone,
  tone,
}: {
  label: string;
  helper: string;
  phone: string;
  tone: "green" | "yellow" | "blue" | "red";
}) {
  const toneMap = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    yellow: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-[#a7eef6] bg-[#eafffc] text-[#087994]",
    red: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <section
      className={`rounded-[28px] border p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)] ${toneMap[tone]}`}
    >
      <p className="text-xs font-black uppercase tracking-[0.22em] opacity-90">
        Estado
      </p>

      <h2 className="mt-3 text-3xl font-black tracking-tight">{label}</h2>

      <p className="mt-3 text-sm font-bold leading-6 opacity-90">{helper}</p>

      <div className="mt-6 flex items-center justify-between rounded-3xl border border-[#9ee5f0] bg-white/75 p-5 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0aa6c4]">
            Número
          </p>
          <p className="mt-2 truncate text-2xl font-black text-[#081535]">
            {phone}
          </p>
        </div>

        <div className="ml-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#20c75a] text-white shadow-[0_12px_28px_rgba(32,199,90,0.24)] ring-4 ring-white">
          <IconWhatsAppBubble />
        </div>
      </div>
    </section>
  );
}

function SalesChannelCard({
  phone,
  stateLabel,
  isRequested,
  isConnected,
  onRefresh,
  loading,
}: {
  phone: string;
  stateLabel: string;
  isRequested: boolean;
  isConnected: boolean;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <section className="rounded-[26px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <h2 className="text-xl font-black text-[#081535]">Tu canal de ventas</h2>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[110px_minmax(0,1fr)_250px] lg:items-center">
        <div className="flex h-[112px] items-center justify-center rounded-3xl border border-[#dfe8f3] bg-white shadow-[0_16px_35px_rgba(15,23,42,0.06)]">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#28cc4b] text-5xl font-black text-white shadow-[0_16px_30px_rgba(40,204,75,0.25)] ring-4 ring-[#eaffef]">
            B
            <span className="absolute -bottom-1 -left-1 h-6 w-6 rotate-[-25deg] rounded-sm bg-[#28cc4b]" />
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="text-2xl font-black text-[#081535]">
            WhatsApp Business
          </h3>
          <p className="mt-1 text-base font-bold text-[#5b6a84]">{phone}</p>

          <div className="mt-4 space-y-2 text-sm font-bold text-[#4e5d77]">
            <InfoLine
              icon={<IconClock />}
              iconClass="text-[#168fff]"
              label="Estado:"
              value={stateLabel}
            />
            <InfoLine
              icon={<IconEye />}
              iconClass="text-[#53647f]"
              label="Modo:"
              value={isConnected ? "Disponible" : "Observación"}
            />
            <InfoLine
              icon={<IconLock />}
              iconClass="text-[#ef314d]"
              label="Envío real:"
              value={
                isConnected
                  ? "Controlado por Cometa"
                  : "Bloqueado por seguridad"
              }
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold text-[#6a7890]">
            Última actualización: hoy, 10:42 a. m.
          </p>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#dfe8f3] bg-white px-4 py-3 text-sm font-black text-[#17213c] transition hover:bg-[#f8fbff] disabled:opacity-50"
          >
            <IconRefresh />
            Actualizar solicitud
          </button>

          <Link
            href="/sales-ai/agent-settings"
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#dfe8f3] bg-white px-4 py-3 text-sm font-black text-[#17213c] transition hover:bg-[#f8fbff]"
          >
            <IconGearSmall />
            Configuración del agente
          </Link>
        </div>
      </div>

      <ConnectionTimeline isRequested={isRequested} isConnected={isConnected} />
    </section>
  );
}

function ConnectionTimeline({
  isRequested,
  isConnected,
}: {
  isRequested: boolean;
  isConnected: boolean;
}) {
  return (
    <div className="mt-5 rounded-[22px] border border-[#dfe8f3] bg-white p-4">
      <h3 className="text-lg font-black text-[#081535]">
        Proceso de conexión
      </h3>

      <div className="mt-6 grid grid-cols-5 gap-1">
        <TimelineStep
          index="1"
          title="Solicitud enviada"
          status={isRequested || isConnected ? "Completado" : "Pendiente"}
          variant={isRequested || isConnected ? "done" : "pending"}
        />
        <TimelineStep
          index="2"
          title="Validación técnica"
          status={
            isConnected ? "Completado" : isRequested ? "En progreso" : "Pendiente"
          }
          variant={isConnected ? "done" : isRequested ? "progress" : "pending"}
        />
        <TimelineStep
          index="3"
          title="Modo observación"
          status={isConnected ? "Completado" : "Pendiente"}
          variant={isConnected ? "done" : "pending"}
        />
        <TimelineStep
          index="4"
          title="Activación controlada"
          status="Bloqueado"
          variant="locked"
        />
        <TimelineStep
          index="5"
          title="WhatsApp real"
          status="Bloqueado"
          variant="locked"
        />
      </div>
    </div>
  );
}

function TimelineStep({
  index,
  title,
  status,
  variant,
}: {
  index: string;
  title: string;
  status: string;
  variant: "done" | "progress" | "pending" | "locked";
}) {
  const dot =
    variant === "done"
      ? "bg-[#1cc857] text-white border-[#1cc857]"
      : variant === "progress"
      ? "bg-[#effcff] text-[#08a9c6] border-[#08a9c6]"
      : "bg-white text-[#748197] border-[#d6e0eb]";

  const line =
    variant === "done"
      ? "bg-[#1cc857]"
      : variant === "progress"
      ? "bg-[#08a9c6]"
      : "bg-[#dfe8f3]";

  const statusClass =
    variant === "done"
      ? "text-[#12a64a]"
      : variant === "progress"
      ? "text-[#08a9c6]"
      : "text-[#748197]";

  return (
    <div className="relative text-center">
      <div
        className={`absolute left-1/2 top-4 h-[2px] w-full ${line} ${
          index === "5" ? "hidden" : ""
        }`}
      />

      <div className="relative z-10 mx-auto flex h-9 w-9 items-center justify-center rounded-full border-2 bg-white">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-black ${dot}`}
        >
          {variant === "done" ? "✓" : variant === "locked" ? "🔒" : index}
        </div>
      </div>

      <p className="mt-3 text-sm font-black text-[#081535]">{index}</p>
      <p className="mx-auto mt-1 max-w-[110px] text-xs font-black leading-4 text-[#17213c]">
        {title}
      </p>
      <p className={`mt-1 text-[11px] font-black ${statusClass}`}>{status}</p>
    </div>
  );
}

function ChecklistCard({
  isRequested,
  isConnected,
}: {
  isRequested: boolean;
  isConnected: boolean;
}) {
  return (
    <section className="rounded-[26px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <h2 className="text-xl font-black text-[#081535]">
        Checklist de conexión
      </h2>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[#dfe8f3]">
        <ChecklistRow
          icon="check"
          label="Número recibido"
          status={isRequested || isConnected ? "Completado" : "Pendiente"}
          statusClass={
            isRequested || isConnected ? "text-[#12a64a]" : "text-[#748197]"
          }
        />
        <ChecklistRow
          icon="check"
          label="Solicitud enviada a Cometa"
          status={isRequested || isConnected ? "Completado" : "Pendiente"}
          statusClass={
            isRequested || isConnected ? "text-[#12a64a]" : "text-[#748197]"
          }
        />
        <ChecklistRow
          icon="clock"
          label="Verificación de Meta"
          status={
            isConnected ? "Completado" : isRequested ? "En progreso" : "Pendiente"
          }
          statusClass={
            isConnected
              ? "text-[#12a64a]"
              : isRequested
              ? "text-[#168fff]"
              : "text-[#748197]"
          }
        />
        <ChecklistRow
          icon="clock"
          label="Modo observación"
          status={isConnected ? "Completado" : "Pendiente"}
          statusClass={isConnected ? "text-[#12a64a]" : "text-[#748197]"}
        />
        <ChecklistRow
          icon="lock"
          label="Envío automático"
          status="Bloqueado"
          statusClass="text-[#748197]"
        />
      </div>
    </section>
  );
}

function SecurityCard() {
  return (
    <section className="rounded-[26px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-3">
        <IconShield />
        <h2 className="text-xl font-black text-[#081535]">Seguridad Cometa</h2>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <SecurityTile
          icon={<IconShield />}
          title="Tokens protegidos"
          subtitle="por Cometa"
        />
        <SecurityTile
          icon={<IconWebhook />}
          title="Webhook configurado"
          subtitle="por Cometa"
        />
        <SecurityTile
          icon={<IconMeta />}
          title="Meta validado"
          subtitle="por Cometa"
        />
        <SecurityTile
          icon={<IconPerson />}
          title="Cliente solo"
          subtitle="configura reglas"
        />
      </div>
    </section>
  );
}

function CapabilitiesCard() {
  const items = [
    {
      icon: <IconMessage />,
      title: "Recibir mensajes",
      subtitle: "En tiempo real",
    },
    {
      icon: <IconTarget />,
      title: "Detectar intención",
      subtitle: "de cada mensaje",
    },
    {
      icon: <IconUsersSmall />,
      title: "Calificar prospectos",
      subtitle: "con IA",
    },
    {
      icon: <IconSparkSmall />,
      title: "Recomendar respuestas",
      subtitle: "contextuales",
    },
    {
      icon: <IconCalendar />,
      title: "Programar seguimientos",
      subtitle: "automáticos",
    },
    {
      icon: <IconAlert />,
      title: "Escalar casos sensibles",
      subtitle: "a tu equipo",
    },
  ];

  return (
    <section className="rounded-[26px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <h2 className="text-xl font-black text-[#081535]">
        Qué hará SALES AI conectado
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.title}
            className="flex items-center gap-3 rounded-2xl border border-[#dfe8f3] bg-white p-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#effcff] text-[#08a9c6]">
              {item.icon}
            </div>
            <div>
              <p className="text-sm font-black leading-4 text-[#081535]">
                {item.title}
              </p>
              <p className="mt-1 text-xs font-bold text-[#5f6f88]">
                {item.subtitle}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function UpdateRequestCard({
  brandName,
  setBrandName,
  requestedPhoneNumber,
  setRequestedPhoneNumber,
  connectionNotes,
  setConnectionNotes,
  onSubmit,
  saving,
  loading,
  isRequested,
}: {
  brandName: string;
  setBrandName: (value: string) => void;
  requestedPhoneNumber: string;
  setRequestedPhoneNumber: (value: string) => void;
  connectionNotes: string;
  setConnectionNotes: (value: string) => void;
  onSubmit: () => void;
  saving: boolean;
  loading: boolean;
  isRequested: boolean;
}) {
  return (
    <section className="rounded-[26px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <h2 className="text-xl font-black text-[#081535]">
        {isRequested ? "Actualizar solicitud" : "Solicitar conexión"}
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1.15fr]">
        <FieldGroup label="Nombre del negocio">
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className="input"
            placeholder="Ej. Cometa Mkt"
          />
        </FieldGroup>

        <FieldGroup label="Número de WhatsApp">
          <input
            value={requestedPhoneNumber}
            onChange={(e) => setRequestedPhoneNumber(e.target.value)}
            className="input"
            placeholder="Ej. +52 445 123 4567"
          />
        </FieldGroup>

        <FieldGroup label="Notas para Cometa">
          <textarea
            value={connectionNotes}
            onChange={(e) => setConnectionNotes(e.target.value)}
            className="input min-h-[88px]"
            placeholder="Escribe aquí cualquier detalle importante para la conexión..."
          />
        </FieldGroup>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={saving || loading}
        className="mt-4 inline-flex min-w-[210px] items-center justify-center gap-3 rounded-xl bg-[#08a9c6] px-5 py-3.5 text-sm font-black text-white shadow-[0_12px_28px_rgba(8,169,198,0.22)] transition hover:bg-[#0598b5] disabled:opacity-50"
      >
        <IconSave />
        {saving
          ? "Guardando..."
          : isRequested
          ? "Guardar cambios"
          : "Enviar solicitud"}
      </button>
    </section>
  );
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
          active
        />
        <RailLink href="/sales-ai/agent-settings" label="AG" icon={<IconUsers />} />

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

function InfoLine({
  icon,
  iconClass,
  label,
  value,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={iconClass}>{icon}</span>
      <span className="text-[#6a7890]">{label}</span>
      <span className="text-[#17213c]">{value}</span>
    </div>
  );
}

function ChecklistRow({
  icon,
  label,
  status,
  statusClass,
}: {
  icon: "check" | "clock" | "lock";
  label: string;
  status: string;
  statusClass: string;
}) {
  return (
    <div className="grid grid-cols-[30px_minmax(0,1fr)_86px] items-center border-b border-[#dfe8f3] px-3 py-3 last:border-b-0">
      <div>
        {icon === "check" ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1cc857] text-xs font-black text-white">
            ✓
          </span>
        ) : icon === "clock" ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#168fff] text-[#168fff]">
            <IconClock />
          </span>
        ) : (
          <span className="flex h-6 w-6 items-center justify-center text-[#ef314d]">
            <IconLock />
          </span>
        )}
      </div>

      <p className="truncate text-sm font-bold text-[#17213c]">{label}</p>
      <p className={`text-right text-[11px] font-black ${statusClass}`}>
        {status}
      </p>
    </div>
  );
}

function SecurityTile({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#dfe8f3] bg-white p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#effcff] text-[#168fff]">
        {icon}
      </div>
      <div>
        <p className="text-sm font-black leading-4 text-[#081535]">{title}</p>
        <p className="text-sm font-black leading-4 text-[#081535]">{subtitle}</p>
      </div>
    </div>
  );
}

function normalizeConnection(data: any): ClientConnection {
  return {
    ...defaultConnection,
    ...data,
    client_agent_preferences: {
      ...defaultConnection.client_agent_preferences,
      ...(data?.client_agent_preferences || {}),
    },
  };
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

function IconWhatsAppBubble() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="h-7 w-7">
      <path
        d="M16 4C9.373 4 4 9.097 4 15.385c0 2.37.764 4.57 2.07 6.392L5 28l6.54-1.588A12.65 12.65 0 0 0 16 26.77c6.627 0 12-5.097 12-11.385C28 9.097 22.627 4 16 4Z"
        fill="currentColor"
      />
      <path
        d="M11.5 10.7c.3-.6.6-.7 1-.7h.7c.2 0 .5.1.7.5.2.5.8 2 .9 2.2.1.2.1.4 0 .6-.2.4-.4.6-.7.9-.1.2-.3.4-.1.7.3.5 1.1 1.8 2.3 2.8 1.6 1.3 2.9 1.7 3.3 1.9.3.1.6.1.8-.2.2-.3.9-1 1.1-1.4.3-.3.5-.3.9-.2.3.1 2.1 1 2.5 1.2.4.2.6.3.7.5.1.2.1 1.4-.4 2.4-.5.9-2.2 1.8-3 1.8-.8.1-1.8.1-4.1-.8-3.5-1.4-5.8-4.8-6-5.1-.2-.3-1.4-1.9-1.4-3.6 0-1.7.8-2.7 1.1-3.2Z"
        fill="white"
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

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path
        d="M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="2" />
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

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M20 12a8 8 0 0 1-14 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12a8 8 0 0 1 14-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
      <path d="M5 4h12l2 2v14H5V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 4v6h8V4M8 20v-6h8v6" stroke="currentColor" strokeWidth="2" />
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

function IconWebhook() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M8 7a4 4 0 1 1 4 4H8m8 6a4 4 0 1 1-4-4h4M8 7l8 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconMeta() {
  return (
    <svg viewBox="0 0 32 20" fill="none" className="h-5 w-8">
      <path
        d="M2 15c2.6-8 5.2-12 8.3-12 3 0 5 4.2 5.7 6 .7-1.8 2.7-6 5.7-6 3.1 0 5.7 4 8.3 12"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M2 15c1.8 3 4.2 3 6 0l4.5-8.2M30 15c-1.8 3-4.2 3-6 0l-4.5-8.2"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPerson() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21c.8-4.2 3.4-6 8-6s7.2 1.8 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconUsersSmall() {
  return <IconUsers />;
}

function IconSparkSmall() {
  return <IconSpark />;
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M5 5h14v16H5V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 3v4m8-4v4M5 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v7m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}