"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePosContext } from "../../components/pos-shell";
import { buildPosHref } from "../../components/pos-sidebar";
import { PosIcon } from "../../components/pos-icons";
import {
  PosBadge,
  PosButton,
  PosCard,
  PosDataTable,
  PosPage,
  PosPageHeader,
  PosSection,
} from "../../components/pos-ui";

type Location = {
  id: string;
  name: string;
  code: string;
  currency: string;
};

type Register = {
  id: string;
  location_id: string;
  name: string;
  code: string;
  status: "available" | "disabled";
  location?: {
    id: string;
    name: string;
    code: string;
  } | null;
};

type CashSession = {
  id: string;
  location_id: string;
  register_id: string;
  status: "open" | "closed";
  opening_amount: number;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  register?: {
    id: string;
    name: string;
    code: string;
  } | null;
  location?: {
    id: string;
    name: string;
    code: string;
  } | null;
};

type BootstrapResponse = {
  ok: true;
  locations: Location[];
  registers: Register[];
  openSessions: CashSession[];
};

type SessionsResponse = {
  ok: true;
  sessions: CashSession[];
};

type CloseForm = {
  countedCash: string;
  notes: string;
};

export default function PosCashPage() {
  const { brand } = usePosContext();

  const [locations, setLocations] = useState<Location[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState("");
  const [openingAmount, setOpeningAmount] = useState("0");
  const [closeForms, setCloseForms] = useState<Record<string, CloseForm>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadCashData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [bootstrap, history] = await Promise.all([
        apiRequest<BootstrapResponse>(
          `/api/pos/bootstrap?brandSlug=${encodeURIComponent(brand.slug)}`
        ),
        apiRequest<SessionsResponse>(
          `/api/pos/cash-sessions?brandSlug=${encodeURIComponent(
            brand.slug
          )}`
        ),
      ]);

      setLocations(bootstrap.locations || []);
      setRegisters(bootstrap.registers || []);
      setSessions(history.sessions || []);

      const openRegisterIds = new Set(
        (history.sessions || [])
          .filter((session) => session.status === "open")
          .map((session) => session.register_id)
      );

      const firstAvailable = (bootstrap.registers || []).find(
        (register) =>
          register.status === "available" && !openRegisterIds.has(register.id)
      );

      setSelectedRegisterId((current) => current || firstAvailable?.id || "");
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [brand.slug]);

  useEffect(() => {
    loadCashData();
  }, [loadCashData]);

  const openSessions = useMemo(
    () => sessions.filter((session) => session.status === "open"),
    [sessions]
  );

  const closedSessions = useMemo(
    () => sessions.filter((session) => session.status === "closed"),
    [sessions]
  );

  const openRegisterIds = useMemo(
    () => new Set(openSessions.map((session) => session.register_id)),
    [openSessions]
  );

  const availableRegisters = useMemo(
    () =>
      registers.filter(
        (register) =>
          register.status === "available" &&
          !openRegisterIds.has(register.id)
      ),
    [registers, openRegisterIds]
  );

  const selectedRegister = registers.find(
    (register) => register.id === selectedRegisterId
  );

  const selectedLocation = locations.find(
    (location) => location.id === selectedRegister?.location_id
  );

  async function handleOpenSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setPendingAction("open");
      setError(null);
      setNotice(null);

      const response = await apiRequest<{
        ok: true;
        session: CashSession;
      }>("/api/pos/cash-sessions", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          action: "open",
          registerId: selectedRegisterId,
          openingAmount: Number(openingAmount || 0),
        }),
      });

      setNotice(
        `Turno abierto en ${
          selectedRegister?.name || response.session.register_id
        }.`
      );
      setOpeningAmount("0");
      setSelectedRegisterId("");
      await loadCashData();
    } catch (openError) {
      setError(getErrorMessage(openError));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCloseSession(session: CashSession) {
    const form = closeForms[session.id] || {
      countedCash: "",
      notes: "",
    };

    if (form.countedCash === "") {
      setError("Ingresa el efectivo contado antes de cerrar la caja.");
      return;
    }

    try {
      setPendingAction(session.id);
      setError(null);
      setNotice(null);

      const response = await apiRequest<{
        ok: true;
        session: CashSession;
      }>("/api/pos/cash-sessions", {
        method: "POST",
        body: JSON.stringify({
          brandSlug: brand.slug,
          action: "close",
          sessionId: session.id,
          countedCash: Number(form.countedCash),
          notes: form.notes,
        }),
      });

      setNotice(
        `Caja cerrada. Diferencia: ${formatMoney(
          Number(response.session.difference || 0),
          getSessionCurrency(session)
        )}.`
      );
      setCloseForms((current) => {
        const next = { ...current };
        delete next[session.id];
        return next;
      });
      await loadCashData();
    } catch (closeError) {
      setError(getErrorMessage(closeError));
    } finally {
      setPendingAction(null);
    }
  }

  if (isLoading) {
    return (
      <PosPage width="wide" density="compact" aria-busy="true">
        <div className="h-20 animate-pulse border-b border-[var(--pos-line-subtle)]" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />
          ))}
        </div>
        <div className="grid gap-4 min-[1180px]:grid-cols-[360px_minmax(0,1fr)]">
          <div className="h-80 animate-pulse rounded-[var(--pos-radius-lg)] bg-white/[0.035]" />
          <div className="h-80 animate-pulse rounded-[var(--pos-radius-lg)] bg-white/[0.035]" />
        </div>
        <div className="h-64 animate-pulse rounded-[var(--pos-radius-lg)] bg-white/[0.035]" />
      </PosPage>
    );
  }

  return (
    <PosPage width="wide" density="compact">
      <PosPageHeader
        compact
        title="Caja"
        description="Apertura, operación y corte de sesiones de efectivo."
        meta={
          openSessions.length > 0
            ? `${openSessions.length} ${openSessions.length === 1 ? "sesión abierta" : "sesiones abiertas"}`
            : "Sin sesión abierta"
        }
        actions={
          <PosButton
            size="normal"
            onClick={() =>
              document
                .getElementById(openSessions.length > 0 ? "active-sessions" : "open-session")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            {openSessions.length > 0 ? "Cerrar caja" : "Abrir caja"}
          </PosButton>
        }
      />

      <section aria-label="Resumen de caja" className="grid grid-cols-3 gap-3">
        <Metric label="Cajas" value={String(registers.length)} icon="cash" />
        <Metric label="Abiertas" value={String(openSessions.length)} icon="activity" />
        <Metric label="Cortes" value={String(closedSessions.length)} icon="receipt" />
      </section>

      <FeedbackBanner error={error} notice={notice} onRetry={() => void loadCashData()} />

      <section className="grid gap-4 min-[1180px]:grid-cols-[360px_minmax(0,1fr)] min-[1180px]:items-start">
        <PosCard id="open-session" padding="compact">
          <div className="flex items-start gap-3 border-b border-[var(--pos-line-subtle)] pb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary-soft)] text-[var(--pos-primary)]">
              <PosIcon name="cash" className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-medium text-[var(--pos-text-muted)]">
                Iniciar turno
              </p>
              <h3 className="mt-1 text-base font-semibold text-[var(--pos-text-primary)]">
                Abrir caja
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--pos-text-muted)]">
                Selecciona la terminal e ingresa el fondo disponible.
              </p>
            </div>
          </div>

          {registers.length === 0 ? (
            <div className="mt-4 rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-line)] bg-[var(--pos-canvas)] p-4 text-center">
              <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
                No hay cajas configuradas
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--pos-text-muted)]">
                Crea primero una sucursal y su Caja 01.
              </p>
              <Link
                href={buildPosHref(brand.slug, "settings")}
                className="mt-5 inline-flex h-11 items-center justify-center rounded-[14px] bg-cyan-300 px-5 text-sm font-black text-slate-950"
              >
                Configurar operación
              </Link>
            </div>
          ) : availableRegisters.length === 0 ? (
            <div className="mt-4 rounded-[var(--pos-radius-md)] bg-[var(--pos-success-soft)] p-4 text-center">
              <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
                Todas las cajas disponibles están abiertas
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Utiliza la terminal o cierra uno de los turnos activos.
              </p>
            </div>
          ) : (
            <form className="mt-4 grid gap-3" onSubmit={handleOpenSession}>
              <label className="grid gap-2">
                <span className="text-xs font-medium text-[var(--pos-text-muted)]">
                  Caja *
                </span>
                <select
                  required
                  value={selectedRegisterId}
                  onChange={(event) =>
                    setSelectedRegisterId(event.target.value)
                  }
                  className="pos-ui-focus h-11 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 text-sm text-[var(--pos-text-primary)] outline-none"
                >
                  <option value="">Seleccionar caja</option>
                  {availableRegisters.map((register) => (
                    <option key={register.id} value={register.id}>
                      {register.location?.name || "Sucursal"} · {register.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-medium text-[var(--pos-text-muted)]">
                  Fondo inicial *
                </span>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-600">
                    $
                  </span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingAmount}
                    onChange={(event) => setOpeningAmount(event.target.value)}
                    className="pos-ui-focus h-12 w-full rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] pl-8 pr-3 text-xl font-semibold text-[var(--pos-text-primary)] outline-none"
                  />
                </div>
              </label>

              {selectedRegister ? (
                <div className="rounded-[var(--pos-radius-sm)] bg-[var(--pos-canvas)] p-3">
                  <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
                    Turno a iniciar
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--pos-text-primary)]">
                    {selectedRegister.location?.name} · {selectedRegister.name}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    Moneda: {selectedLocation?.currency || "MXN"}
                  </p>
                </div>
              ) : null}

              <PosButton
                type="submit"
                fullWidth
                loading={pendingAction === "open"}
                disabled={pendingAction === "open" || !selectedRegisterId}
              >
                {pendingAction === "open"
                  ? "Abriendo caja..."
                  : "Abrir caja y comenzar"}
                {pendingAction !== "open" ? (
                  <PosIcon name="arrow" className="h-4 w-4" />
                ) : null}
              </PosButton>
            </form>
          )}
        </PosCard>

        <PosCard id="active-sessions" padding="compact">
          <div className="flex flex-col gap-2 border-b border-[var(--pos-line-subtle)] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-[var(--pos-text-muted)]">
                Operación actual
              </p>
              <h3 className="mt-1 text-base font-semibold text-[var(--pos-text-primary)]">
                Turnos activos
              </h3>
            </div>

            <PosBadge tone={openSessions.length > 0 ? "success" : "neutral"} dot>
              {openSessions.length} abiertos
            </PosBadge>
          </div>

          <div className="mt-5 grid gap-4">
            {isLoading ? (
              <LoadingRows />
            ) : openSessions.length > 0 ? (
              openSessions.map((session) => {
                const closeForm = closeForms[session.id] || {
                  countedCash: "",
                  notes: "",
                };
                const currency = getSessionCurrency(session);
                const countedCash =
                  closeForm.countedCash === ""
                    ? null
                    : Number(closeForm.countedCash);
                const previewDifference =
                  countedCash !== null && session.expected_cash !== null
                    ? countedCash - Number(session.expected_cash)
                    : null;

                return (
                  <div
                    key={session.id}
                    className="rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)] p-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-success-soft)] text-[var(--pos-success)]">
                          <PosIcon name="activity" className="h-5 w-5" />
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
                            {session.location?.name} · {session.register?.name}
                          </p>
                          <PosBadge tone="success" size="compact" dot>Abierta</PosBadge>
                          </div>
                          <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
                            Abierta {formatDateTime(session.opened_at)} ·{" "}
                            {formatDuration(session.opened_at)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
                          Fondo inicial
                        </p>
                        <p className="mt-1 text-lg font-semibold text-[var(--pos-text-primary)]">
                          {formatMoney(session.opening_amount, currency)}
                        </p>
                      </div>
                    </div>

                    {session.expected_cash !== null ? (
                      <div className="mt-4 grid grid-cols-2 gap-3 border-y border-[var(--pos-line-subtle)] py-3">
                        <CashValue label="Efectivo esperado" value={formatMoney(Number(session.expected_cash), currency)} />
                        <CashValue
                          label="Diferencia estimada"
                          value={previewDifference === null ? "—" : formatMoney(previewDifference, currency)}
                          tone={
                            previewDifference === null || previewDifference === 0
                              ? "neutral"
                              : previewDifference < 0
                              ? "danger"
                              : "warning"
                          }
                        />
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-[170px_minmax(0,1fr)_auto]">
                      <label className="grid gap-2">
                        <span className="text-xs font-medium text-[var(--pos-text-muted)]">
                          Efectivo contado
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={closeForm.countedCash}
                          onChange={(event) =>
                            setCloseForms((current) => ({
                              ...current,
                              [session.id]: {
                                ...closeForm,
                                countedCash: event.target.value,
                              },
                            }))
                          }
                          placeholder="0.00"
                          className="pos-ui-focus h-11 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-panel)] px-3 text-sm font-semibold text-[var(--pos-text-primary)] outline-none"
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-medium text-[var(--pos-text-muted)]">
                          Notas del corte
                        </span>
                        <input
                          value={closeForm.notes}
                          onChange={(event) =>
                            setCloseForms((current) => ({
                              ...current,
                              [session.id]: {
                                ...closeForm,
                                notes: event.target.value,
                              },
                            }))
                          }
                          placeholder="Opcional"
                          className="pos-ui-focus h-11 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-panel)] px-3 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
                        />
                      </label>

                      <PosButton
                        type="button"
                        variant="danger"
                        size="normal"
                        loading={pendingAction === session.id}
                        disabled={pendingAction === session.id}
                        onClick={() => handleCloseSession(session)}
                        className="self-end"
                      >
                        {pendingAction === session.id
                          ? "Cerrando..."
                          : "Cerrar turno"}
                      </PosButton>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex min-h-40 items-center justify-center rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-line)] bg-[var(--pos-canvas)] p-5 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-amber-300/[0.08] text-amber-200">
                    <PosIcon name="cash" className="h-6 w-6" />
                  </div>
                  <h4 className="mt-3 text-sm font-semibold text-[var(--pos-text-primary)]">
                    No hay turnos activos
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-[var(--pos-text-muted)]">
                    Abre una caja para que el equipo pueda comenzar a vender.
                  </p>
                </div>
              </div>
            )}
          </div>
        </PosCard>
      </section>

      <PosSection
        title="Cortes recientes"
        description={`Últimos ${Math.min(closedSessions.length, 12)} turnos cerrados`}
      >
        {closedSessions.length > 0 ? (
          <>
            <div className="hidden md:block">
              <PosDataTable caption="Historial de cortes de caja" density="compact" minWidth={760}>
                <thead className="bg-[var(--pos-panel-raised)] text-left text-[11px] font-semibold text-[var(--pos-text-muted)]">
                  <tr>
                    <th>Caja</th>
                    <th>Apertura</th>
                    <th>Cierre</th>
                    <th className="text-right">Fondo inicial</th>
                    <th className="text-right">Esperado</th>
                    <th className="text-right">Contado</th>
                    <th className="text-right">Diferencia</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {closedSessions.slice(0, 12).map((session) => {
                    const currency = getSessionCurrency(session);
                    const difference = Number(session.difference || 0);
                    return (
                      <tr key={session.id} className="border-t border-[var(--pos-line-subtle)] text-xs text-[var(--pos-text-secondary)]">
                        <td className="font-medium text-[var(--pos-text-primary)]">
                          {session.location?.name} · {session.register?.name}
                        </td>
                        <td className="whitespace-nowrap">{formatDateTime(session.opened_at)}</td>
                        <td className="whitespace-nowrap">{session.closed_at ? formatDateTime(session.closed_at) : "—"}</td>
                        <td className="whitespace-nowrap text-right">{formatMoney(session.opening_amount, currency)}</td>
                        <td className="whitespace-nowrap text-right">{formatNullableMoney(session.expected_cash, currency)}</td>
                        <td className="whitespace-nowrap text-right">{formatNullableMoney(session.counted_cash, currency)}</td>
                        <td className={`whitespace-nowrap text-right font-semibold ${difference === 0 ? "text-[var(--pos-success)]" : difference < 0 ? "text-[var(--pos-danger)]" : "text-[var(--pos-warning)]"}`}>
                          {formatMoney(difference, currency)}
                        </td>
                        <td><PosBadge tone="neutral" size="compact">Cerrada</PosBadge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </PosDataTable>
            </div>

            <div className="grid gap-2 md:hidden">
              {closedSessions.slice(0, 12).map((session) => {
                const currency = getSessionCurrency(session);
                const difference = Number(session.difference || 0);
                return (
                  <PosCard key={session.id} padding="compact">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--pos-text-primary)]">{session.location?.name} · {session.register?.name}</p>
                        <p className="mt-1 text-xs text-[var(--pos-text-muted)]">{formatDateTime(session.opened_at)}</p>
                      </div>
                      <PosBadge tone="neutral" size="compact">Cerrada</PosBadge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--pos-line-subtle)] pt-3">
                      <CashValue label="Esperado" value={formatNullableMoney(session.expected_cash, currency)} />
                      <CashValue label="Contado" value={formatNullableMoney(session.counted_cash, currency)} />
                      <CashValue label="Diferencia" value={formatMoney(difference, currency)} tone={difference === 0 ? "success" : difference < 0 ? "danger" : "warning"} />
                    </div>
                  </PosCard>
                );
              })}
            </div>
          </>
        ) : (
          <PosCard padding="compact" className="border border-dashed border-[var(--pos-line)] text-center text-sm text-[var(--pos-text-muted)]">
            Los cortes aparecerán aquí al cerrar el primer turno.
          </PosCard>
        )}
      </PosSection>
    </PosPage>
  );

  function getSessionCurrency(session: CashSession) {
    return (
      locations.find((location) => location.id === session.location_id)
        ?.currency || "MXN"
    );
  }
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: "cash" | "activity" | "receipt";
}) {
  return (
    <PosCard padding="compact" className="min-h-20">
      <div className="flex items-center gap-2 text-[var(--pos-text-muted)]">
        <PosIcon name={icon} className="h-4 w-4" />
        <p className="text-[11px] font-medium">{label}</p>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-[var(--pos-text-primary)]">
        {value}
      </p>
    </PosCard>
  );
}

function CashValue({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const valueClass =
    tone === "success"
      ? "text-[var(--pos-success)]"
      : tone === "warning"
      ? "text-[var(--pos-warning)]"
      : tone === "danger"
      ? "text-[var(--pos-danger)]"
      : "text-[var(--pos-text-primary)]";

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function FeedbackBanner({
  error,
  notice,
  onRetry,
}: {
  error: string | null;
  notice: string | null;
  onRetry: () => void;
}) {
  if (!error && !notice) return null;

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-[var(--pos-radius-md)] px-4 py-3 text-sm font-medium ${
        error
          ? "bg-[var(--pos-danger-soft)] text-rose-200"
          : "bg-[var(--pos-success-soft)] text-emerald-200"
      }`}
    >
      <span>{error || notice}</span>
      {error ? (
        <PosButton variant="secondary" size="compact" onClick={onRetry}>
          Reintentar
        </PosButton>
      ) : null}
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      {[1, 2].map((row) => (
        <div
          key={row}
          className="h-40 animate-pulse rounded-[24px] bg-white/[0.035]"
        />
      ))}
    </>
  );
}

function formatMoney(value: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatNullableMoney(value: number | null, currency = "MXN") {
  return value === null ? "—" : formatMoney(Number(value), currency);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(openedAt: string) {
  const milliseconds = Math.max(
    0,
    Date.now() - new Date(openedAt).getTime()
  );
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

async function apiRequest<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await response.json();

  if (!response.ok || !data?.ok) {
    throw new Error(
      data?.error || data?.message || "No se pudo completar la operación."
    );
  }

  return data as T;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}
