"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import MetaEmbeddedSignupCard from "@/components/whatsapp/MetaEmbeddedSignupCard";

type ConnectionStatus =
  | "not_connected"
  | "pending"
  | "connected"
  | "pending_review"
  | "active"
  | "paused"
  | "error"
  | "revoked";

type AvailableBrand = {
  slug: string;
  name: string;
};

type ClientConnection = {
  brand_slug: string;
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

    business_summary?: string;
    products_services?: string;
    forbidden_promises?: string;
    required_questions?: string;
    escalation_notes?: string;
  };

  connection_status: ConnectionStatus;
  webhook_status: string;
  verified_name: string | null;

  receive_enabled: boolean;
  agent_enabled: boolean;
  real_send_enabled: boolean;

  connected_at: string | null;
  approved_at: string | null;
  paused_at: string | null;
  revoked_at: string | null;

  last_webhook_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;

  last_error: string | null;
  last_error_code: string | null;

  updated_at: string | null;
};

type ConnectApiResponse = {
  ok: boolean;
  error?: string;
  detail?: string;

  user?: {
    id: string;
    email: string | null;
    isAdmin: boolean;
  };

  brand?: AvailableBrand;
  availableBrands?: AvailableBrand[];
  connection?: ClientConnection;

  message?: string;
  action?: string;
};

const defaultConnection: ClientConnection = {
  brand_slug: "",
  brand_name: "Marca",

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

  connection_status: "not_connected",
  webhook_status: "not_connected",
  verified_name: null,

  receive_enabled: false,
  agent_enabled: false,
  real_send_enabled: false,

  connected_at: null,
  approved_at: null,
  paused_at: null,
  revoked_at: null,

  last_webhook_at: null,
  last_inbound_at: null,
  last_outbound_at: null,

  last_error: null,
  last_error_code: null,

  updated_at: null,
};

export default function SalesAIConnectPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <SalesAIConnectContent />
    </Suspense>
  );
}

function SalesAIConnectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedBrandSlug = searchParams.get("brand")?.trim() || "";

  const [connection, setConnection] =
    useState<ClientConnection>(defaultConnection);

  const [availableBrands, setAvailableBrands] = useState<AvailableBrand[]>([]);
  const [selectedBrandSlug, setSelectedBrandSlug] =
    useState(requestedBrandSlug);

  const [isAdmin, setIsAdmin] = useState(false);

  const [requestedPhoneNumber, setRequestedPhoneNumber] = useState("");
  const [connectionNotes, setConnectionNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const statusMeta = useMemo(
    () => getConnectionStatusMeta(connection),
    [connection]
  );

  const phoneDisplay =
    connection.whatsapp_phone_number ||
    connection.client_requested_phone_number ||
    requestedPhoneNumber ||
    "Sin número conectado";

  const hasRealConnection =
    connection.connection_status !== "not_connected" &&
    connection.connection_status !== "revoked";

  const isActive = connection.connection_status === "active";

  const hasRequestedHelp =
    connection.client_connection_status === "requested" ||
    connection.client_connection_status === "change_requested";

  const loadConnection = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const query = requestedBrandSlug
        ? `?brand=${encodeURIComponent(requestedBrandSlug)}`
        : "";

      const response = await fetch(`/api/sales-ai/connect-request${query}`, {
        method: "GET",
        cache: "no-store",
      });

      const json = (await response
        .json()
        .catch(() => null)) as ConnectApiResponse | null;

      if (!response.ok || !json || json.ok === false) {
        throw new Error(
          json?.error ||
            json?.detail ||
            "No se pudo cargar la conexión de WhatsApp."
        );
      }

      const loadedConnection = normalizeConnection(json.connection);
      const resolvedBrandSlug =
        json.brand?.slug || loadedConnection.brand_slug || "";

      setConnection(loadedConnection);
      setAvailableBrands(
        Array.isArray(json.availableBrands) ? json.availableBrands : []
      );
      setSelectedBrandSlug(resolvedBrandSlug);
      setIsAdmin(json.user?.isAdmin === true);

      setRequestedPhoneNumber(
        loadedConnection.whatsapp_phone_number ||
  loadedConnection.client_requested_phone_number ||
  ""
      );

      setConnectionNotes(
        loadedConnection.client_connection_notes || ""
      );

      if (!requestedBrandSlug && resolvedBrandSlug) {
        router.replace(
          `/sales-ai/connect?brand=${encodeURIComponent(
            resolvedBrandSlug
          )}`
        );
      }
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [requestedBrandSlug, router]);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  function changeBrand(nextBrandSlug: string) {
    if (!nextBrandSlug || nextBrandSlug === selectedBrandSlug) {
      return;
    }

    setMessage("");
    setErrorMessage("");

    router.push(
      `/sales-ai/connect?brand=${encodeURIComponent(nextBrandSlug)}`
    );
  }

  async function submitManualRequest() {
    try {
      setSaving(true);
      setMessage("");
      setErrorMessage("");

      if (!selectedBrandSlug) {
        throw new Error("No hay una marca seleccionada.");
      }

      if (!requestedPhoneNumber.trim()) {
        throw new Error(
          "Agrega el número de WhatsApp que quieres conectar."
        );
      }

      const response = await fetch("/api/sales-ai/connect-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brand: selectedBrandSlug,
          requestedPhoneNumber,
          connectionNotes,

          tone:
            connection.client_agent_preferences?.tone ||
            "profesional, claro y vendedor",

          businessHoursEnabled:
            connection.client_agent_preferences
              ?.business_hours_enabled === true,

          humanEscalationEnabled:
            connection.client_agent_preferences
              ?.human_escalation_enabled !== false,

          allowFollowups:
            connection.client_agent_preferences?.allow_followups !==
            false,
        }),
      });

      const json = (await response
        .json()
        .catch(() => null)) as ConnectApiResponse | null;

      if (!response.ok || !json || json.ok === false) {
        throw new Error(
          json?.error ||
            json?.detail ||
            "No se pudo guardar la solicitud."
        );
      }

      const loadedConnection = normalizeConnection(json.connection);

      setConnection(loadedConnection);
      setRequestedPhoneNumber(
        loadedConnection.client_requested_phone_number ||
          loadedConnection.whatsapp_phone_number ||
          ""
      );
      setConnectionNotes(
        loadedConnection.client_connection_notes || ""
      );

      setMessage(
        json.message ||
          "Solicitud recibida. Cometa revisará la conexión."
      );
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7fafc] text-[#081535]">
      <div className="flex min-h-screen">
        <LeftRail brandSlug={selectedBrandSlug} />

        <div className="min-w-0 flex-1 px-4 py-5 lg:px-5 xl:px-6">
          <div className="mx-auto w-full max-w-[1480px] space-y-5">
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
              <HeroCard
                connection={connection}
                availableBrands={availableBrands}
                selectedBrandSlug={selectedBrandSlug}
                isAdmin={isAdmin}
                loading={loading}
                onBrandChange={changeBrand}
              />

              <StatusCard
                status={statusMeta}
                connection={connection}
                phone={phoneDisplay}
              />
            </section>

            {message ? (
              <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">
                {message}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-[22px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-black text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
              <div className="min-w-0 space-y-5">
                <MetaEmbeddedSignupCard
  brandSlug={selectedBrandSlug}
  connectionStatus={connection.connection_status}
  webhookStatus={connection.webhook_status}
  realSendEnabled={connection.real_send_enabled}
  statusLabel={statusMeta.label}
  statusTone={statusMeta.pillTone}
  loading={loading}
  onCompleted={loadConnection}
/>

                <SalesChannelCard
                  connection={connection}
                  phone={phoneDisplay}
                  loading={loading}
                  onRefresh={loadConnection}
                />

                <ManualRequestCard
                  connection={connection}
                  requestedPhoneNumber={requestedPhoneNumber}
                  setRequestedPhoneNumber={setRequestedPhoneNumber}
                  connectionNotes={connectionNotes}
                  setConnectionNotes={setConnectionNotes}
                  saving={saving}
                  loading={loading}
                  hasRealConnection={hasRealConnection}
                  hasRequestedHelp={hasRequestedHelp}
                  onSubmit={submitManualRequest}
                />
              </div>

              <div className="min-w-0 space-y-5">
                <OperationalStatusCard connection={connection} />

                <ConnectionTimeline connection={connection} />

                <SecurityCard />

                <CapabilitiesCard />
              </div>
            </section>

            <div className="rounded-[22px] border border-[#cfeef6] bg-[#ecfbff] px-5 py-4 text-sm font-bold text-[#236276]">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#12bfe8] text-white">
                  i
                </span>

                <p>
                  Aunque el número quede conectado, los envíos reales solo
                  pueden ser autorizados desde el panel administrativo de
                  Cometa.
                </p>
              </div>
            </div>

            {isActive ? (
              <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800">
                La conexión de esta marca está activa y aislada mediante su
                propio identificador de WhatsApp.
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <style jsx>{`
  .input {
    width: 100%;
    border-radius: 1rem;
    border: 1px solid #dfe8f3;
    background: #f8fbff;
    padding: 1rem;
    color: #081535;
    outline: none;
    font-weight: 700;
    transition: all 0.2s ease;
  }

  .input:focus {
    border-color: #12bfe8;
    box-shadow: 0 0 0 4px rgba(18, 191, 232, 0.12);
    background: white;
  }

  .input:disabled {
    background: #f1f5f9;
  }
`}</style>
    </main>
  );
}

function HeroCard({
  connection,
  availableBrands,
  selectedBrandSlug,
  isAdmin,
  loading,
  onBrandChange,
}: {
  connection: ClientConnection;
  availableBrands: AvailableBrand[];
  selectedBrandSlug: string;
  isAdmin: boolean;
  loading: boolean;
  onBrandChange: (brandSlug: string) => void;
}) {
  const canSelectBrand = availableBrands.length > 1;

  return (
    <section className="rounded-[30px] border border-[#dfe8f3] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] lg:p-8">
      <div className="inline-flex items-center gap-2 rounded-full border border-[#cfeef6] bg-[#effcff] px-4 py-2 text-xs font-black tracking-wide text-[#0798b8]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#12bfe8]" />
        SALES AI · WHATSAPP
      </div>

      <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-[-0.06em] text-[#081535] lg:text-[52px] lg:leading-[1.02]">
        Conecta WhatsApp a SALES AI
      </h1>

      <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-[#5b6a84]">
        Conecta el número comercial de tu empresa. Cometa OS administra la
        seguridad, los webhooks y la activación del agente.
      </p>

      <div className="mt-6 rounded-[22px] border border-[#dfe8f3] bg-[#f8fbff] p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#718097]">
          Marca autorizada
        </p>

        {canSelectBrand ? (
          <select
            value={selectedBrandSlug}
            onChange={(event) => onBrandChange(event.target.value)}
            disabled={loading}
            className="mt-2 w-full rounded-2xl border border-[#dfe8f3] bg-white px-4 py-3 text-sm font-black text-[#081535] outline-none transition focus:border-[#12bfe8]"
          >
            {availableBrands.map((brand) => (
              <option key={brand.slug} value={brand.slug}>
                {brand.name} · {brand.slug}
              </option>
            ))}
          </select>
        ) : (
          <div className="mt-2">
            <p className="text-xl font-black text-[#081535]">
              {connection.brand_name}
            </p>

            <p className="mt-1 text-sm font-bold text-[#718097]">
              {connection.brand_slug || selectedBrandSlug}
            </p>
          </div>
        )}

        {isAdmin ? (
          <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#08a9c6]">
            Vista administrativa
          </p>
        ) : (
          <p className="mt-3 text-xs font-bold text-[#718097]">
            La marca se obtiene automáticamente desde tus permisos de acceso.
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/sales-ai"
          className="inline-flex items-center justify-center rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3 text-sm font-black text-[#17213c] transition hover:bg-[#f8fbff]"
        >
          ← Volver a SALES AI
        </Link>

        <Link
          href={`/sales-ai/agent-settings${
            selectedBrandSlug
              ? `?brand=${encodeURIComponent(selectedBrandSlug)}`
              : ""
          }`}
          className="inline-flex items-center justify-center rounded-2xl bg-[#081535] px-5 py-3 text-sm font-black text-white transition hover:bg-[#08a9c6]"
        >
          Configurar agente →
        </Link>
      </div>
    </section>
  );
}

function StatusCard({
  status,
  connection,
  phone,
}: {
  status: StatusMeta;
  connection: ClientConnection;
  phone: string;
}) {
  return (
    <section
      className={`rounded-[30px] border p-6 shadow-[0_18px_50px_rgba(15,23,42,0.05)] ${status.containerClass}`}
    >
      <p className="text-xs font-black uppercase tracking-[0.22em] opacity-90">
        Estado actual
      </p>

      <h2 className="mt-3 text-3xl font-black tracking-[-0.05em]">
        {status.label}
      </h2>

      <p className="mt-3 text-sm font-bold leading-6 opacity-90">
        {status.helper}
      </p>

      <div className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0aa6c4]">
          WhatsApp
        </p>

        <p className="mt-2 break-words text-2xl font-black text-[#081535]">
          {phone}
        </p>

        {connection.verified_name ? (
          <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[#5b6a84]">
            {connection.verified_name}
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MiniMetric
          label="Webhook"
          value={formatSimpleStatus(connection.webhook_status)}
        />

        <MiniMetric
          label="Agente"
          value={connection.agent_enabled ? "Activo" : "Apagado"}
        />
      </div>
    </section>
  );
}

function SalesChannelCard({
  connection,
  phone,
  loading,
  onRefresh,
}: {
  connection: ClientConnection;
  phone: string;
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#718097]">
            Canal de ventas
          </p>

          <h2 className="mt-2 text-2xl font-black text-[#081535]">
            WhatsApp Business
          </h2>

          <p className="mt-2 text-lg font-black text-[#08a9c6]">
            {phone}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading}
          className="rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3 text-sm font-black text-[#17213c] transition hover:bg-[#f8fbff] disabled:opacity-50"
        >
          {loading ? "Actualizando..." : "Actualizar estado"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoBox
          label="Última actualización"
          value={formatDate(connection.updated_at)}
        />

        <InfoBox
          label="Último webhook"
          value={formatDate(connection.last_webhook_at)}
        />

        <InfoBox
          label="Último mensaje recibido"
          value={formatDate(connection.last_inbound_at)}
        />

        <InfoBox
          label="Último mensaje enviado"
          value={formatDate(connection.last_outbound_at)}
        />
      </div>

      {connection.last_error ? (
        <div className="mt-5 rounded-[22px] border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-red-700">
            Requiere revisión
          </p>

          <p className="mt-2 text-sm font-black text-red-800">
            {connection.last_error}
          </p>

          {connection.last_error_code ? (
            <p className="mt-1 text-xs font-bold text-red-600">
              Código: {connection.last_error_code}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ManualRequestCard({
  connection,
  requestedPhoneNumber,
  setRequestedPhoneNumber,
  connectionNotes,
  setConnectionNotes,
  saving,
  loading,
  hasRealConnection,
  hasRequestedHelp,
  onSubmit,
}: {
  connection: ClientConnection;
  requestedPhoneNumber: string;
  setRequestedPhoneNumber: (value: string) => void;
  connectionNotes: string;
  setConnectionNotes: (value: string) => void;
  saving: boolean;
  loading: boolean;
  hasRealConnection: boolean;
  hasRequestedHelp: boolean;
  onSubmit: () => void;
}) {
  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#718097]">
        Asistencia Cometa
      </p>

      <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#081535]">
        {hasRealConnection
          ? "Solicitar cambio o revisión"
          : "Solicitar conexión manual"}
      </h2>

      <p className="mt-2 text-sm font-semibold leading-6 text-[#5b6a84]">
        Esta opción sirve cuando prefieres que Cometa te acompañe durante la
        conexión o necesitas cambiar el número registrado.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <FieldGroup label="Marca">
          <input
            value={connection.brand_name}
            disabled
            className="input cursor-not-allowed text-[#718097]"
          />
        </FieldGroup>

        <FieldGroup label="Número de WhatsApp">
          <input
            value={requestedPhoneNumber}
            onChange={(event) =>
              setRequestedPhoneNumber(event.target.value)
            }
            className="input"
            placeholder="+52 445 123 4567"
          />
        </FieldGroup>
      </div>

      <div className="mt-4">
        <FieldGroup label="Notas para Cometa">
          <textarea
            value={connectionNotes}
            onChange={(event) => setConnectionNotes(event.target.value)}
            className="input min-h-[110px] resize-y"
            placeholder="Cuéntanos si el número ya utiliza WhatsApp Business, si está dentro de otro portafolio o si necesitas ayuda."
          />
        </FieldGroup>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={saving || loading}
        className="mt-5 inline-flex min-w-[240px] items-center justify-center rounded-2xl bg-[#081535] px-6 py-4 text-sm font-black text-white transition hover:bg-[#08a9c6] disabled:opacity-50"
      >
        {saving
          ? "Guardando..."
          : hasRequestedHelp
            ? "Actualizar solicitud"
            : hasRealConnection
              ? "Solicitar revisión"
              : "Enviar solicitud a Cometa"}
      </button>

      {connection.client_requested_at ? (
        <p className="mt-3 text-xs font-bold text-[#718097]">
          Última solicitud: {formatDate(connection.client_requested_at)}
        </p>
      ) : null}
    </section>
  );
}

function OperationalStatusCard({
  connection,
}: {
  connection: ClientConnection;
}) {
  const rows = [
    {
      label: "Recepción de mensajes",
      enabled: connection.receive_enabled,
      helper: "Cometa OS puede procesar mensajes entrantes.",
    },
    {
      label: "SALES AI",
      enabled: connection.agent_enabled,
      helper: "El agente puede analizar y decidir acciones.",
    },
    {
      label: "Envíos reales",
      enabled: connection.real_send_enabled,
      helper: "Solo Cometa puede autorizar este permiso.",
      danger: true,
    },
  ];

  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#718097]">
        Operación
      </p>

      <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#081535]">
        Permisos actuales
      </h2>

      <div className="mt-5 grid gap-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-[20px] border border-[#dfe8f3] bg-[#f8fbff] p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-black text-[#081535]">
                {row.label}
              </p>

              <span
                className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
                  row.enabled
                    ? row.danger
                      ? "bg-red-100 text-red-700"
                      : "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {row.enabled ? "Activo" : "Apagado"}
              </span>
            </div>

            <p className="mt-2 text-xs font-semibold leading-5 text-[#718097]">
              {row.helper}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConnectionTimeline({
  connection,
}: {
  connection: ClientConnection;
}) {
  const requested =
    connection.client_connection_status === "requested" ||
    connection.client_connection_status === "change_requested";

  const technicalConnected =
    connection.connection_status === "connected" ||
    connection.connection_status === "pending_review" ||
    connection.connection_status === "active" ||
    connection.connection_status === "paused";

  const approved =
    connection.connection_status === "active" ||
    connection.connection_status === "paused";

  const automatic =
    connection.connection_status === "active" &&
    connection.real_send_enabled;

  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#718097]">
        Proceso
      </p>

      <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#081535]">
        Etapas de conexión
      </h2>

      <div className="mt-5 grid gap-3">
        <TimelineRow
          index="1"
          title="Solicitud o conexión iniciada"
          completed={requested || technicalConnected}
        />

        <TimelineRow
          index="2"
          title="Cuenta de Meta vinculada"
          completed={technicalConnected}
        />

        <TimelineRow
          index="3"
          title="Revisión de Cometa"
          completed={approved}
        />

        <TimelineRow
          index="4"
          title="Recepción y observación"
          completed={connection.receive_enabled}
        />

        <TimelineRow
          index="5"
          title="Envío automático autorizado"
          completed={automatic}
        />
      </div>
    </section>
  );
}

function TimelineRow({
  index,
  title,
  completed,
}: {
  index: string;
  title: string;
  completed: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[20px] border border-[#dfe8f3] bg-[#f8fbff] p-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${
          completed
            ? "bg-emerald-500 text-white"
            : "border border-[#d6e0eb] bg-white text-[#718097]"
        }`}
      >
        {completed ? "✓" : index}
      </span>

      <div>
        <p className="text-sm font-black text-[#081535]">{title}</p>

        <p
          className={`mt-1 text-xs font-bold ${
            completed ? "text-emerald-600" : "text-[#718097]"
          }`}
        >
          {completed ? "Completado" : "Pendiente"}
        </p>
      </div>
    </div>
  );
}

function SecurityCard() {
  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#08a9c6]">
        Seguridad Cometa
      </p>

      <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#081535]">
        Datos técnicos protegidos
      </h2>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <SecurityTile title="Tokens" subtitle="Ocultos al cliente" />
        <SecurityTile title="Webhooks" subtitle="Administrados por Cometa" />
        <SecurityTile title="Aislamiento" subtitle="Por número y marca" />
        <SecurityTile title="Automatización" subtitle="Requiere aprobación" />
      </div>
    </section>
  );
}

function CapabilitiesCard() {
  const items = [
    "Recibir mensajes en tiempo real",
    "Detectar intención de compra",
    "Calificar prospectos",
    "Recomendar respuestas",
    "Programar seguimientos",
    "Escalar casos sensibles",
  ];

  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#718097]">
        SALES AI
      </p>

      <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#081535]">
        Qué hará al conectarse
      </h2>

      <div className="mt-5 grid gap-3">
        {items.map((item) => (
          <div
            key={item}
            className="flex items-center gap-3 rounded-[18px] border border-[#dfe8f3] bg-[#f8fbff] p-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#effcff] text-sm font-black text-[#08a9c6]">
              ✓
            </span>

            <p className="text-sm font-black text-[#081535]">{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LeftRail({ brandSlug }: { brandSlug: string }) {
  const brandQuery = brandSlug
    ? `?brand=${encodeURIComponent(brandSlug)}`
    : "";

  const links = [
    {
      href: `/sales-ai${brandQuery}`,
      label: "AI",
    },
    {
      href: `/sales-ai/inbox${brandQuery}`,
      label: "IN",
    },
    {
      href: `/sales-ai/connect${brandQuery}`,
      label: "WA",
      active: true,
    },
    {
      href: `/sales-ai/agent-settings${brandQuery}`,
      label: "AG",
    },
    {
      href: `/sales-ai/analytics${brandQuery}`,
      label: "AN",
    },
  ];

  return (
    <aside className="sticky top-0 hidden h-screen w-[108px] shrink-0 flex-col items-center border-r border-[#e4edf5] bg-white px-4 py-5 shadow-[8px_0_28px_rgba(15,23,42,0.03)] xl:flex">
      <Link
        href="/workspace"
        className="flex flex-col items-center justify-center text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#081535] text-sm font-black text-[#5ee8ff]">
          OS
        </div>

        <p className="mt-3 text-xs font-black text-[#081535]">
          COMETA
        </p>
      </Link>

      <nav className="mt-7 flex w-full flex-1 flex-col items-center gap-3">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className={`flex h-[54px] w-full items-center justify-center rounded-2xl text-xs font-black transition ${
              link.active
                ? "bg-[#08a9c6] text-white shadow-[0_14px_30px_rgba(8,169,198,0.22)]"
                : "border border-[#dfe8f3] bg-white text-[#62718a] hover:bg-[#f8fbff] hover:text-[#08a9c6]"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/70 bg-white/70 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#718097]">
        {label}
      </p>

      <p className="mt-1 text-sm font-black text-[#081535]">{value}</p>
    </div>
  );
}

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-[#dfe8f3] bg-[#f8fbff] p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#718097]">
        {label}
      </p>

      <p className="mt-2 text-sm font-black leading-5 text-[#081535]">
        {value}
      </p>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "yellow" | "red" | "blue" | "neutral";
}) {
  const toneClass = {
    green: "bg-emerald-100 text-emerald-700",
    yellow: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    neutral: "bg-slate-100 text-slate-600",
  }[tone];

  return (
    <span
      className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] ${toneClass}`}
    >
      {label}
    </span>
  );
}

function SecurityTile({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-[20px] border border-[#dfe8f3] bg-[#f8fbff] p-4">
      <p className="text-sm font-black text-[#081535]">{title}</p>
      <p className="mt-1 text-xs font-bold text-[#718097]">{subtitle}</p>
    </div>
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

function PageLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7fafc] px-5">
      <div className="rounded-[30px] border border-[#dfe8f3] bg-white p-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
        <p className="text-xl font-black text-[#081535]">
          Cargando conexión…
        </p>

        <p className="mt-2 text-sm font-semibold text-[#718097]">
          Validando tu marca y permisos.
        </p>
      </div>
    </main>
  );
}

type StatusMeta = {
  label: string;
  helper: string;
  containerClass: string;
  pillTone: "green" | "yellow" | "red" | "blue" | "neutral";
};

function getConnectionStatusMeta(
  connection: ClientConnection
): StatusMeta {
  if (connection.connection_status === "active") {
    return {
      label: "WhatsApp conectado",
      helper:
        "La conexión está activa. Cometa controla la operación y los envíos reales.",
      containerClass:
        "border-emerald-200 bg-emerald-50 text-emerald-800",
      pillTone: "green",
    };
  }

  if (connection.connection_status === "paused") {
    return {
      label: "Conexión pausada",
      helper:
        "Cometa pausó temporalmente la operación de este número.",
      containerClass:
        "border-amber-200 bg-amber-50 text-amber-800",
      pillTone: "yellow",
    };
  }

  if (connection.connection_status === "error") {
    return {
      label: "Requiere revisión",
      helper:
        "La conexión tiene una alerta técnica que debe revisar Cometa.",
      containerClass: "border-red-200 bg-red-50 text-red-800",
      pillTone: "red",
    };
  }

  if (connection.connection_status === "revoked") {
    return {
      label: "Conexión revocada",
      helper:
        "Este número debe volver a conectarse mediante Meta.",
      containerClass:
        "border-slate-300 bg-slate-100 text-slate-800",
      pillTone: "neutral",
    };
  }

  if (
    connection.connection_status === "pending" ||
    connection.connection_status === "connected" ||
    connection.connection_status === "pending_review"
  ) {
    return {
      label: "Pendiente de aprobación",
      helper:
        "La cuenta ya inició su conexión y está pendiente de revisión por Cometa.",
      containerClass: "border-blue-200 bg-blue-50 text-blue-800",
      pillTone: "blue",
    };
  }

  if (
    connection.client_connection_status === "requested" ||
    connection.client_connection_status === "change_requested"
  ) {
    return {
      label: "Solicitud recibida",
      helper:
        "Cometa recibió tu solicitud y revisará los datos del número.",
      containerClass:
        "border-cyan-200 bg-cyan-50 text-cyan-800",
      pillTone: "blue",
    };
  }

  return {
    label: "Pendiente de conexión",
    helper:
      "Conecta tu cuenta de Meta o solicita asistencia al equipo Cometa.",
    containerClass: "border-amber-200 bg-amber-50 text-amber-800",
    pillTone: "yellow",
  };
}

function normalizeConnection(
  value: ClientConnection | undefined
): ClientConnection {
  return {
    ...defaultConnection,
    ...(value || {}),

    client_agent_preferences: {
      ...defaultConnection.client_agent_preferences,
      ...(value?.client_agent_preferences || {}),
      client_can_activate_automatic: false,
    },
  };
}

function formatSimpleStatus(value: string | null | undefined) {
  const status = String(value || "").trim().toLowerCase();

  if (status === "active") return "Activo";
  if (status === "pending") return "Pendiente";
  if (status === "error") return "Error";
  if (status === "disabled") return "Desactivado";
  if (status === "not_connected") return "No conectado";

  return status || "No disponible";
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