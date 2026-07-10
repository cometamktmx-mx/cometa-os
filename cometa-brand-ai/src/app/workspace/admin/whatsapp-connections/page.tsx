"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ConnectionStatus =
  | "pending"
  | "connected"
  | "pending_review"
  | "active"
  | "paused"
  | "error"
  | "revoked";

type WhatsappConnection = {
  id: string;

  clientId: string | null;

  brandSlug: string;
  brandName: string;
  verifiedName: string | null;

  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  wabaId: string | null;

  connectionStatus: ConnectionStatus;
  webhookStatus: string;

  receiveEnabled: boolean;
  agentEnabled: boolean;
  allowRealSend: boolean;

  tokenSource: string;
  tokenExpiresAt: string | null;

  connectedAt: string | null;
  approvedAt: string | null;
  pausedAt: string | null;
  revokedAt: string | null;

  lastWebhookAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastHealthCheckAt: string | null;

  lastErrorCode: string | null;
  lastError: string | null;

  metadata: Record<string, unknown>;

  createdAt: string | null;
  updatedAt: string | null;
};

type WhatsappConnectionsResponse = {
  ok: boolean;
  error?: string;
  detail?: string;

  admin?: {
    id: string;
    email: string | null;
  };

  totals?: {
    connections: number;
    active: number;
    paused: number;
    errors: number;
    automatic: number;
  };

  connections?: WhatsappConnection[];
};

type ControlField =
  | "receive_enabled"
  | "agent_enabled"
  | "allow_real_send";

type ConnectionAction =
  | "approve"
  | "pause"
  | "resume"
  | "revoke"
  | "clear_error";

export default function WhatsappConnectionsAdminPage() {
  const [data, setData] = useState<WhatsappConnectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingConnectionId, setSavingConnectionId] = useState<string | null>(
    null
  );

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const connections = useMemo(() => {
    return Array.isArray(data?.connections) ? data.connections : [];
  }, [data?.connections]);

  const loadConnections = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const response = await fetch("/api/admin/whatsapp-connections", {
        method: "GET",
        cache: "no-store",
      });

      const json = (await response
        .json()
        .catch(() => null)) as WhatsappConnectionsResponse | null;

      if (!response.ok || !json || json.ok === false) {
        throw new Error(
          json?.error ||
            json?.detail ||
            "No se pudieron cargar las conexiones de WhatsApp."
        );
      }

      setData(json);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  async function updateConnection({
    connectionId,
    action,
    field,
    value,
  }: {
    connectionId: string;
    action?: ConnectionAction;
    field?: ControlField;
    value?: boolean;
  }) {
    try {
      setSavingConnectionId(connectionId);
      setMessage("");
      setErrorMessage("");

      const response = await fetch("/api/admin/whatsapp-connections", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionId,
          ...(action ? { action } : {}),
          ...(field ? { field, value } : {}),
        }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok || !json || json.ok === false) {
        throw new Error(
          json?.error ||
            json?.detail ||
            "No se pudo actualizar la conexión."
        );
      }

      setMessage(json.message || "Conexión actualizada correctamente.");

      await loadConnections();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSavingConnectionId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f2f7fb] p-4 text-slate-950 lg:p-6">
      <section className="mx-auto grid w-full max-w-[1800px] gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <AdminDock />

        <section className="min-w-0 space-y-5">
          <Hero
            loading={loading}
            totals={data?.totals}
            adminEmail={data?.admin?.email}
            onRefresh={loadConnections}
          />

          {message ? (
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">
              {message}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-black text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <SecurityNotice />

          {loading ? (
            <LoadingState />
          ) : connections.length === 0 ? (
            <EmptyState />
          ) : (
            <section className="grid gap-5">
              {connections.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  saving={savingConnectionId === connection.id}
                  onAction={(action) =>
                    updateConnection({
                      connectionId: connection.id,
                      action,
                    })
                  }
                  onControl={(field, value) =>
                    updateConnection({
                      connectionId: connection.id,
                      field,
                      value,
                    })
                  }
                />
              ))}
            </section>
          )}
        </section>
      </section>
    </main>
  );
}

function Hero({
  loading,
  totals,
  adminEmail,
  onRefresh,
}: {
  loading: boolean;
  totals?: WhatsappConnectionsResponse["totals"];
  adminEmail?: string | null;
  onRefresh: () => Promise<void>;
}) {
  return (
    <section className="relative overflow-hidden rounded-[38px] bg-slate-950 p-7 text-white shadow-[0_30px_100px_rgba(15,23,42,0.2)] md:p-9">
      <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-emerald-400/20 blur-[90px]" />
      <div className="absolute bottom-[-140px] left-[35%] h-72 w-72 rounded-full bg-cyan-400/10 blur-[100px]" />

      <div className="relative z-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">
              WhatsApp Control Center
            </p>

            <h1 className="mt-4 text-5xl font-black leading-[0.94] tracking-[-0.08em] md:text-6xl">
              Conexiones controladas.
            </h1>

            <p className="mt-5 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
              Administra cada número conectado a Cometa OS. Controla recepción,
              SALES AI y envíos reales sin exponer tokens ni configuraciones
              técnicas al cliente.
            </p>

            {adminEmail ? (
              <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
                Admin activo: {adminEmail}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/workspace/admin"
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
            >
              Centro de accesos
            </Link>

            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={loading}
              className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Actualizando..." : "Actualizar conexiones"}
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <HeroMetric
            value={loading ? "..." : totals?.connections || 0}
            label="Conexiones"
          />

          <HeroMetric
            value={loading ? "..." : totals?.active || 0}
            label="Activas"
          />

          <HeroMetric
            value={loading ? "..." : totals?.paused || 0}
            label="Pausadas"
          />

          <HeroMetric
            value={loading ? "..." : totals?.automatic || 0}
            label="Automáticas"
          />

          <HeroMetric
            value={loading ? "..." : totals?.errors || 0}
            label="Con error"
          />
        </div>
      </div>
    </section>
  );
}

function HeroMetric({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      <p className="text-4xl font-black tracking-[-0.07em] text-white">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
    </div>
  );
}

function SecurityNotice() {
  return (
    <section className="rounded-[30px] border border-cyan-100 bg-cyan-50 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700">
            Seguridad activa
          </p>

          <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
            Cada mensaje se resuelve por su conexión exacta.
          </h2>

          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
            Un número desconocido no se asigna a otra marca. Los tokens
            permanecen ocultos y los envíos reales requieren autorización
            administrativa.
          </p>
        </div>

        <div className="rounded-2xl border border-cyan-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-cyan-700">
          Aislamiento por phone_number_id
        </div>
      </div>
    </section>
  );
}

function ConnectionCard({
  connection,
  saving,
  onAction,
  onControl,
}: {
  connection: WhatsappConnection;
  saving: boolean;
  onAction: (action: ConnectionAction) => void;
  onControl: (field: ControlField, value: boolean) => void;
}) {
  const status = getConnectionStatusMeta(connection.connectionStatus);
  const isActive = connection.connectionStatus === "active";
  const isPaused = connection.connectionStatus === "paused";
  const isRevoked = connection.connectionStatus === "revoked";
  const needsApproval =
    connection.connectionStatus === "pending" ||
    connection.connectionStatus === "connected" ||
    connection.connectionStatus === "pending_review";

  return (
    <article className="overflow-hidden rounded-[34px] border border-white bg-white shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="border-b border-slate-100 p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${status.className}`}
              >
                {status.label}
              </span>

              <span
                className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
                  connection.webhookStatus === "active"
                    ? "bg-emerald-100 text-emerald-700"
                    : connection.webhookStatus === "error"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                }`}
              >
                Webhook {connection.webhookStatus}
              </span>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-600">
                {connection.tokenSource}
              </span>
            </div>

            <h2 className="mt-4 text-3xl font-black tracking-[-0.06em] text-slate-950">
              {connection.brandName}
            </h2>

            <p className="mt-2 text-sm font-bold text-slate-500">
              {connection.brandSlug}
            </p>

            {connection.verifiedName ? (
              <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-700">
                Meta: {connection.verifiedName}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {needsApproval ? (
              <ActionButton
                label="Aprobar conexión"
                tone="primary"
                disabled={saving}
                onClick={() => onAction("approve")}
              />
            ) : null}

            {isActive ? (
              <ActionButton
                label="Pausar todo"
                tone="warning"
                disabled={saving}
                onClick={() => onAction("pause")}
              />
            ) : null}

            {isPaused ? (
              <ActionButton
                label="Reactivar conexión"
                tone="primary"
                disabled={saving}
                onClick={() => onAction("resume")}
              />
            ) : null}

            {!isRevoked ? (
              <ActionButton
                label="Revocar"
                tone="danger"
                disabled={saving}
                onClick={() => {
                  const confirmed = window.confirm(
                    `¿Seguro que deseas revocar el WhatsApp de ${connection.brandName}? La recepción y los envíos quedarán desactivados.`
                  );

                  if (confirmed) {
                    onAction("revoke");
                  }
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-6 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoBox
              label="Número conectado"
              value={connection.displayPhoneNumber || "No registrado"}
            />

            <InfoBox
              label="Phone Number ID"
              value={connection.phoneNumberId || "No registrado"}
              mono
            />

            <InfoBox
              label="WABA ID"
              value={connection.wabaId || "No registrado"}
              mono
            />

            <InfoBox
              label="Última actualización"
              value={formatDate(connection.updatedAt)}
            />
          </div>

          <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Control operativo
              </p>

              <h3 className="mt-2 text-2xl font-black tracking-[-0.05em]">
                Permisos de la conexión
              </h3>

              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Los controles se aplican únicamente a este número y a esta
                marca.
              </p>
            </div>

            <div className="mt-5 grid gap-3">
              <ControlRow
                title="Recepción de mensajes"
                description="Permite que Cometa OS procese mensajes entrantes de este número."
                enabled={connection.receiveEnabled}
                disabled={saving || !isActive || isRevoked}
                onChange={(value) =>
                  onControl("receive_enabled", value)
                }
              />

              <ControlRow
                title="SALES AI"
                description="Permite que el agente analice la conversación y genere decisiones."
                enabled={connection.agentEnabled}
                disabled={
                  saving ||
                  !isActive ||
                  !connection.receiveEnabled ||
                  isRevoked
                }
                onChange={(value) => onControl("agent_enabled", value)}
              />

              <ControlRow
                title="Envíos reales"
                description="Autoriza que SALES AI envíe respuestas reales por WhatsApp."
                enabled={connection.allowRealSend}
                disabled={
                  saving ||
                  !isActive ||
                  !connection.receiveEnabled ||
                  !connection.agentEnabled ||
                  isRevoked
                }
                onChange={(value) =>
                  onControl("allow_real_send", value)
                }
                danger
              />
            </div>
          </section>
        </section>

        <section className="space-y-5">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Actividad
            </p>

            <div className="mt-4 grid gap-3">
              <ActivityRow
                label="Último webhook"
                value={formatDate(connection.lastWebhookAt)}
              />

              <ActivityRow
                label="Último mensaje recibido"
                value={formatDate(connection.lastInboundAt)}
              />

              <ActivityRow
                label="Último mensaje enviado"
                value={formatDate(connection.lastOutboundAt)}
              />

              <ActivityRow
                label="Última revisión"
                value={formatDate(connection.lastHealthCheckAt)}
              />
            </div>
          </section>

          <section
            className={`rounded-[28px] border p-5 ${
              connection.lastError
                ? "border-red-200 bg-red-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <p
              className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                connection.lastError
                  ? "text-red-700"
                  : "text-emerald-700"
              }`}
            >
              Diagnóstico
            </p>

            {connection.lastError ? (
              <>
                <p className="mt-3 text-sm font-black text-red-800">
                  {connection.lastError}
                </p>

                {connection.lastErrorCode ? (
                  <p className="mt-2 text-xs font-bold text-red-600">
                    Código: {connection.lastErrorCode}
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onAction("clear_error")}
                  className="mt-4 rounded-2xl bg-white px-4 py-2 text-xs font-black text-red-700 shadow-sm transition hover:bg-red-100 disabled:opacity-50"
                >
                  Limpiar error registrado
                </button>
              </>
            ) : (
              <>
                <p className="mt-3 text-lg font-black text-emerald-800">
                  Sin errores registrados
                </p>

                <p className="mt-2 text-sm font-semibold leading-6 text-emerald-700">
                  La conexión no tiene alertas técnicas pendientes.
                </p>
              </>
            )}
          </section>
        </section>
      </div>

      {saving ? (
        <div className="border-t border-cyan-100 bg-cyan-50 px-6 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-cyan-700">
          Actualizando conexión...
        </div>
      ) : null}
    </article>
  );
}

function ControlRow({
  title,
  description,
  enabled,
  disabled,
  danger = false,
  onChange,
}: {
  title: string;
  description: string;
  enabled: boolean;
  disabled: boolean;
  danger?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[22px] border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-black text-slate-950">{title}</p>

          <span
            className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
              enabled
                ? danger
                  ? "bg-red-100 text-red-700"
                  : "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {enabled ? "Activo" : "Apagado"}
          </span>
        </div>

        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
          {description}
        </p>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`shrink-0 rounded-2xl px-5 py-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
          enabled
            ? danger
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-slate-950 text-white hover:bg-slate-800"
            : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
        }`}
      >
        {enabled ? "Desactivar" : "Activar"}
      </button>
    </div>
  );
}

function InfoBox({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>

      <p
        className={`mt-2 break-all text-sm font-black text-slate-950 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ActivityRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-slate-50 p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: "primary" | "warning" | "danger";
  disabled: boolean;
  onClick: () => void;
}) {
  const className =
    tone === "primary"
      ? "bg-slate-950 text-white hover:bg-cyan-700"
      : tone === "warning"
        ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
        : "bg-red-50 text-red-700 hover:bg-red-100";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl px-5 py-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  );
}

function LoadingState() {
  return (
    <section className="rounded-[34px] border border-white bg-white p-10 text-center shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <p className="text-lg font-black text-slate-950">
        Cargando conexiones...
      </p>

      <p className="mt-2 text-sm font-semibold text-slate-500">
        Consultando la infraestructura segura de WhatsApp.
      </p>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="rounded-[34px] border border-white bg-white p-10 text-center shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-950 text-sm font-black text-cyan-300">
        WA
      </div>

      <h2 className="mt-5 text-3xl font-black tracking-[-0.06em]">
        No hay conexiones registradas
      </h2>

      <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-500">
        Cuando un número sea conectado mediante Meta, aparecerá aquí para que
        Cometa lo apruebe y configure.
      </p>
    </section>
  );
}

function AdminDock() {
  const items = [
    {
      label: "Workspace",
      href: "/workspace",
      code: "WS",
    },
    {
      label: "Accesos",
      href: "/workspace/admin",
      code: "AC",
    },
    {
      label: "WhatsApp",
      href: "/workspace/admin/whatsapp-connections",
      code: "WA",
      active: true,
    },
    {
      label: "Mercury Hub",
      href: "/mercury-hub",
      code: "MH",
    },
    {
      label: "Designer Hub",
      href: "/designer-hub",
      code: "DH",
    },
    {
      label: "Sales AI",
      href: "/sales-ai/inbox",
      code: "SA",
    },
  ];

  return (
    <aside className="hidden rounded-[34px] border border-white bg-white/90 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.08)] xl:flex xl:flex-col">
      <div className="flex items-center gap-3 rounded-[26px] bg-slate-50 px-3 py-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-slate-950">
          <div className="absolute h-7 w-7 rounded-full bg-cyan-400 blur-[6px]" />
          <div className="relative h-7 w-7 rounded-full bg-gradient-to-br from-cyan-300 via-emerald-400 to-slate-950" />
        </div>

        <div>
          <p className="text-lg font-black leading-none tracking-[-0.06em]">
            cometa
          </p>
          <p className="text-lg font-black leading-none tracking-[-0.06em]">
            OS
          </p>
        </div>
      </div>

      <nav className="mt-7 grid gap-2">
        {items.map((item) => (
          <Link
            key={item.code}
            href={item.href}
            className={`flex h-12 items-center gap-3 rounded-2xl px-3 transition ${
              item.active
                ? "border border-cyan-200 bg-cyan-50 text-slate-950"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
            }`}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-xl text-[10px] font-black ${
                item.active ? "bg-white text-cyan-700" : "bg-slate-50"
              }`}
            >
              {item.code}
            </span>

            <span className="text-sm font-black">{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}

function getConnectionStatusMeta(status: ConnectionStatus) {
  if (status === "active") {
    return {
      label: "Activa",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  if (status === "paused") {
    return {
      label: "Pausada",
      className: "bg-amber-100 text-amber-700",
    };
  }

  if (status === "error") {
    return {
      label: "Con error",
      className: "bg-red-100 text-red-700",
    };
  }

  if (status === "revoked") {
    return {
      label: "Revocada",
      className: "bg-slate-900 text-white",
    };
  }

  if (status === "connected") {
    return {
      label: "Conectada",
      className: "bg-blue-100 text-blue-700",
    };
  }

  if (status === "pending_review") {
    return {
      label: "Pendiente de revisión",
      className: "bg-violet-100 text-violet-700",
    };
  }

  return {
    label: "Pendiente",
    className: "bg-slate-100 text-slate-600",
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Sin actividad";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrió un error inesperado.";
}