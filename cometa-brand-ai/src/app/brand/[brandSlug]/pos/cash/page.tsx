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
  PosModal,
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

type MovementType = "income" | "deposit" | "expense" | "withdrawal";

type CashMovement = {
  id: string;
  movementType: MovementType;
  amount: number | string;
  reason: string;
  createdAt: string;
  createdBy?: string | null;
};

type CashSessionSummary = {
  sales_total: number | string;
  tickets_count: number | string;
  cash_sales: number | string;
  card_sales: number | string;
  transfer_sales: number | string;
  wallet_sales: number | string;
  other_sales: number | string;
  cash_income: number | string;
  cash_deposits: number | string;
  cash_expenses: number | string;
  cash_withdrawals: number | string;
  net_cash_movements: number | string;
  expected_cash: number | string | null;
  recent_movements: unknown;
};

type CashSession = {
  id: string;
  location_id: string;
  register_id: string;
  status: "open" | "closed";
  opening_amount: number | string;
  expected_cash: number | string | null;
  counted_cash: number | string | null;
  difference: number | string | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  summary: CashSessionSummary | null;
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
};

type SessionsResponse = {
  ok: true;
  sessions: CashSession[];
  blindClose: boolean;
};

const MOVEMENT_OPTIONS: Array<{
  type: MovementType;
  label: string;
  description: string;
  direction: "in" | "out";
}> = [
  {
    type: "income",
    label: "Entrada",
    description: "Efectivo que entra a la caja.",
    direction: "in",
  },
  {
    type: "deposit",
    label: "Depósito",
    description: "Fondo adicional para operar.",
    direction: "in",
  },
  {
    type: "expense",
    label: "Gasto",
    description: "Pago operativo desde caja.",
    direction: "out",
  },
  {
    type: "withdrawal",
    label: "Retiro",
    description: "Salida a caja fuerte u otro destino.",
    direction: "out",
  },
];

export default function PosCashPage() {
  const { brand } = usePosContext();
  const [locations, setLocations] = useState<Location[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [blindClose, setBlindClose] = useState(true);
  const [selectedRegisterId, setSelectedRegisterId] = useState("");
  const [openingAmount, setOpeningAmount] = useState("0");
  const [movementSession, setMovementSession] = useState<CashSession | null>(null);
  const [movementType, setMovementType] = useState<MovementType>("income");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [closeSession, setCloseSession] = useState<CashSession | null>(null);
  const [closeStep, setCloseStep] = useState<1 | 2 | 3 | 4>(1);
  const [countedCash, setCountedCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeResult, setCloseResult] = useState<CashSession | null>(null);
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
          `/api/pos/cash-sessions?brandSlug=${encodeURIComponent(brand.slug)}`
        ),
      ]);

      setLocations(bootstrap.locations || []);
      setRegisters(bootstrap.registers || []);
      setSessions(history.sessions || []);
      setBlindClose(history.blindClose);

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
    const timer = window.setTimeout(() => {
      void loadCashData();
    }, 0);

    return () => window.clearTimeout(timer);
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
          register.status === "available" && !openRegisterIds.has(register.id)
      ),
    [openRegisterIds, registers]
  );
  const selectedRegister = registers.find(
    (register) => register.id === selectedRegisterId
  );
  const selectedLocation = locations.find(
    (location) => location.id === selectedRegister?.location_id
  );
  const closeCountedValue = parseMoney(countedCash);

  async function handleOpenSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseMoney(openingAmount);

    if (amount === null || amount < 0) {
      setError("El fondo inicial debe ser un monto válido.");
      return;
    }

    try {
      setPendingAction("open");
      setError(null);
      setNotice(null);

      const response = await apiRequest<{ ok: true; session: CashSession }>(
        "/api/pos/cash-sessions",
        {
          method: "POST",
          body: JSON.stringify({
            brandSlug: brand.slug,
            action: "open",
            registerId: selectedRegisterId,
            openingAmount: amount,
          }),
        }
      );

      setNotice(`Turno abierto en ${selectedRegister?.name || response.session.register_id}.`);
      setOpeningAmount("0");
      setSelectedRegisterId("");
      await loadCashData();
    } catch (openError) {
      setError(getErrorMessage(openError));
    } finally {
      setPendingAction(null);
    }
  }

  function beginMovement(session: CashSession) {
    setError(null);
    setMovementSession(session);
    setMovementType("income");
    setMovementAmount("");
    setMovementReason("");
  }

  async function handleCreateMovement() {
    if (!movementSession) return;
    const amount = parseMoney(movementAmount);

    if (amount === null || amount <= 0) {
      setError("Ingresa un monto mayor a cero con máximo dos decimales.");
      return;
    }

    if (!movementReason.trim()) {
      setError("Indica el motivo del movimiento.");
      return;
    }

    try {
      setPendingAction("movement");
      setError(null);
      setNotice(null);

      await apiRequest<{ ok: true }>(
        `/api/pos/cash-movements?brandSlug=${encodeURIComponent(brand.slug)}`,
        {
          method: "POST",
          body: JSON.stringify({
            cashSessionId: movementSession.id,
            movementType,
            amount,
            reason: movementReason.trim(),
          }),
        }
      );

      setNotice("Movimiento registrado en el ledger de caja.");
      setMovementSession(null);
      await loadCashData();
    } catch (movementError) {
      setError(getErrorMessage(movementError));
    } finally {
      setPendingAction(null);
    }
  }

  function beginClose(session: CashSession) {
    setError(null);
    setCloseSession(session);
    setCloseStep(1);
    setCountedCash("");
    setCloseNotes("");
    setCloseResult(null);
  }

  function closeCashModal() {
    if (pendingAction === "close") return;
    setCloseSession(null);
    setCloseResult(null);
    setCloseStep(1);
  }

  async function handleCloseSession() {
    if (!closeSession || closeCountedValue === null || closeCountedValue < 0) {
      setError("Ingresa el efectivo contado antes de cerrar la caja.");
      return;
    }

    try {
      setPendingAction("close");
      setError(null);
      setNotice(null);

      const response = await apiRequest<{ ok: true; session: CashSession }>(
        "/api/pos/cash-sessions",
        {
          method: "POST",
          body: JSON.stringify({
            brandSlug: brand.slug,
            action: "close",
            sessionId: closeSession.id,
            countedCash: closeCountedValue,
            notes: closeNotes.trim() || undefined,
          }),
        }
      );

      setCloseResult(response.session);
      setCloseStep(4);
      setNotice("Caja cerrada. El resultado del corte quedó registrado.");
      await loadCashData();
    } catch (closeError) {
      setError(getErrorMessage(closeError));
    } finally {
      setPendingAction(null);
    }
  }

  if (isLoading) {
    return <CashPageLoading />;
  }

  return (
    <PosPage width="wide" density="compact">
      <PosPageHeader
        compact
        title="Control del turno"
        description="Apertura, ventas por método, movimientos y corte seguro de caja."
        meta={
          openSessions.length > 0
            ? `${openSessions.length} ${openSessions.length === 1 ? "caja abierta" : "cajas abiertas"}`
            : "Sin caja abierta"
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
            {openSessions.length > 0 ? "Ver cajas abiertas" : "Abrir caja"}
          </PosButton>
        }
      />

      <section aria-label="Resumen de caja" className="grid gap-3 sm:grid-cols-3">
        <Metric label="Cajas" value={String(registers.length)} icon="cash" />
        <Metric label="Turnos activos" value={String(openSessions.length)} icon="activity" />
        <Metric label="Cortes recientes" value={String(closedSessions.length)} icon="receipt" />
      </section>

      <FeedbackBanner error={error} notice={notice} onRetry={() => void loadCashData()} />

      <section className="grid gap-4 min-[1180px]:grid-cols-[340px_minmax(0,1fr)] min-[1180px]:items-start">
        <PosCard id="open-session" padding="compact">
          <div className="flex items-start gap-3 border-b border-[var(--pos-line-subtle)] pb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary-soft)] text-[var(--pos-primary)]">
              <PosIcon name="cash" className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--pos-text-muted)]">Inicio de turno</p>
              <h2 className="mt-1 text-base font-semibold text-[var(--pos-text-primary)]">Abrir caja</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--pos-text-muted)]">
                Selecciona la terminal e ingresa el fondo disponible.
              </p>
            </div>
          </div>

          {registers.length === 0 ? (
            <div className="mt-4 rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-line)] bg-[var(--pos-canvas)] p-4 text-center">
              <p className="text-sm font-semibold text-[var(--pos-text-primary)]">No hay cajas configuradas</p>
              <p className="mt-1 text-xs leading-5 text-[var(--pos-text-muted)]">Crea primero una sucursal y su Caja 01.</p>
              <Link
                href={buildPosHref(brand.slug, "settings")}
                className="mt-5 inline-flex h-11 items-center justify-center rounded-[14px] bg-cyan-300 px-5 text-sm font-black text-slate-950"
              >
                Configurar operación
              </Link>
            </div>
          ) : availableRegisters.length === 0 ? (
            <div className="mt-4 rounded-[var(--pos-radius-md)] bg-[var(--pos-success-soft)] p-4 text-center">
              <p className="text-sm font-semibold text-[var(--pos-text-primary)]">Todas las cajas disponibles están abiertas</p>
              <p className="mt-2 text-xs leading-5 text-[var(--pos-text-muted)]">Cierra un turno activo antes de abrir otro en la misma terminal.</p>
            </div>
          ) : (
            <form className="mt-4 grid gap-3" onSubmit={handleOpenSession}>
              <label className="grid gap-2">
                <span className="text-xs font-medium text-[var(--pos-text-muted)]">Caja *</span>
                <select
                  required
                  value={selectedRegisterId}
                  onChange={(event) => setSelectedRegisterId(event.target.value)}
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

              <MoneyField
                label="Fondo inicial *"
                value={openingAmount}
                onChange={setOpeningAmount}
                placeholder="0.00"
              />

              {selectedRegister ? (
                <div className="rounded-[var(--pos-radius-sm)] bg-[var(--pos-canvas)] p-3">
                  <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">Turno a iniciar</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--pos-text-primary)]">
                    {selectedRegister.location?.name} · {selectedRegister.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--pos-text-muted)]">Moneda: {selectedLocation?.currency || "MXN"}</p>
                </div>
              ) : null}

              <PosButton type="submit" fullWidth loading={pendingAction === "open"} disabled={pendingAction === "open" || !selectedRegisterId}>
                {pendingAction === "open" ? "Abriendo caja..." : "Abrir caja y comenzar"}
                {pendingAction !== "open" ? <PosIcon name="arrow" className="h-4 w-4" /> : null}
              </PosButton>
            </form>
          )}
        </PosCard>

        <PosCard id="active-sessions" padding="compact">
          <div className="flex flex-col gap-3 border-b border-[var(--pos-line-subtle)] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-[var(--pos-text-muted)]">Operación actual</p>
              <h2 className="mt-1 text-base font-semibold text-[var(--pos-text-primary)]">Cajas abiertas</h2>
            </div>
            <PosBadge tone={openSessions.length > 0 ? "success" : "neutral"} dot>
              {openSessions.length} activos
            </PosBadge>
          </div>

          <div className="mt-5 grid gap-4">
            {openSessions.length > 0 ? (
              openSessions.map((session) => (
                <OpenSessionDashboard
                  key={session.id}
                  session={session}
                  currency={getSessionCurrency(session, locations)}
                  showExpected={!blindClose}
                  onCreateMovement={() => beginMovement(session)}
                  onClose={() => beginClose(session)}
                />
              ))
            ) : (
              <EmptyActiveSessions />
            )}
          </div>
        </PosCard>
      </section>

      <PosSection
        title="Historial de cortes"
        description={`Últimos ${Math.min(closedSessions.length, 12)} turnos cerrados`}
      >
        {closedSessions.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {closedSessions.slice(0, 12).map((session) => (
              <ClosedSessionHistory
                key={session.id}
                session={session}
                currency={getSessionCurrency(session, locations)}
              />
            ))}
          </div>
        ) : (
          <PosCard padding="compact" className="border border-dashed border-[var(--pos-line)] text-center text-sm text-[var(--pos-text-muted)]">
            Los cortes aparecerán aquí al cerrar el primer turno.
          </PosCard>
        )}
      </PosSection>

      <MovementModal
        open={Boolean(movementSession)}
        session={movementSession}
        currency={movementSession ? getSessionCurrency(movementSession, locations) : "MXN"}
        movementType={movementType}
        amount={movementAmount}
        reason={movementReason}
        isSaving={pendingAction === "movement"}
        onClose={() => pendingAction !== "movement" && setMovementSession(null)}
        onMovementTypeChange={setMovementType}
        onAmountChange={setMovementAmount}
        onReasonChange={setMovementReason}
        onSave={() => void handleCreateMovement()}
      />

      <CloseCashModal
        session={closeSession}
        result={closeResult}
        currency={closeSession ? getSessionCurrency(closeSession, locations) : "MXN"}
        step={closeStep}
        countedCash={countedCash}
        closeNotes={closeNotes}
        isSaving={pendingAction === "close"}
        onClose={closeCashModal}
        onNext={() => {
          if (closeCountedValue === null || closeCountedValue < 0) {
            setError("Ingresa el efectivo contado antes de continuar.");
            return;
          }
          setCloseStep((current) => (current === 1 ? 2 : 3));
        }}
        onBack={() => setCloseStep((current) => (current === 3 ? 2 : 1))}
        onCountedCashChange={setCountedCash}
        onNotesChange={setCloseNotes}
        onConfirm={() => void handleCloseSession()}
      />
    </PosPage>
  );
}

function OpenSessionDashboard({
  session,
  currency,
  showExpected,
  onCreateMovement,
  onClose,
}: {
  session: CashSession;
  currency: string;
  showExpected: boolean;
  onCreateMovement: () => void;
  onClose: () => void;
}) {
  const summary = getSummary(session);
  const movements = normalizeMovements(summary.recent_movements);

  return (
    <article className="overflow-hidden rounded-[var(--pos-radius-md)] border border-[var(--pos-line-subtle)] bg-[var(--pos-canvas)]">
      <div className="flex flex-col gap-4 border-b border-[var(--pos-line-subtle)] p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-success-soft)] text-[var(--pos-success)]">
            <PosIcon name="activity" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-[var(--pos-text-primary)]">
                {session.location?.name || "Sucursal"} · {session.register?.name || "Caja"}
              </h3>
              <PosBadge tone="success" size="compact" dot>CAJA ABIERTA</PosBadge>
            </div>
            <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
              Abierta {formatDateTime(session.opened_at)} · {formatDuration(session.opened_at)} de turno
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-right">
          <SmallValue label="Fondo inicial" value={formatMoney(toNumber(session.opening_amount), currency)} />
          <SmallValue label="Ventas del turno" value={formatMoney(toNumber(summary.sales_total), currency)} />
        </div>
      </div>

      <div className="grid gap-4 p-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-muted)]">Pagos por método</p>
            <span className="text-xs text-[var(--pos-text-muted)]">{toNumber(summary.tickets_count)} tickets</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <MethodValue label="Efectivo" value={summary.cash_sales} currency={currency} />
            <MethodValue label="Tarjeta" value={summary.card_sales} currency={currency} />
            <MethodValue label="Transferencia" value={summary.transfer_sales} currency={currency} />
            <MethodValue label="Wallet" value={summary.wallet_sales} currency={currency} />
            <MethodValue label="Otros" value={summary.other_sales} currency={currency} />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_250px]">
          <div className="rounded-[var(--pos-radius-sm)] border border-[var(--pos-line-subtle)] bg-[var(--pos-panel)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--pos-text-primary)]">Movimientos de caja</p>
                <p className="mt-1 text-xs text-[var(--pos-text-muted)]">Entradas y salidas quedan registradas sin edición.</p>
              </div>
              <PosButton variant="secondary" size="compact" onClick={onCreateMovement}>
                + Movimiento
              </PosButton>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MovementMetric label="Entradas" value={toNumber(summary.cash_income) + toNumber(summary.cash_deposits)} tone="in" currency={currency} />
              <MovementMetric label="Retiros/gastos" value={toNumber(summary.cash_expenses) + toNumber(summary.cash_withdrawals)} tone="out" currency={currency} />
              <MovementMetric label="Depósitos" value={summary.cash_deposits} tone="in" currency={currency} />
              <MovementMetric label="Gastos" value={summary.cash_expenses} tone="out" currency={currency} />
            </div>
          </div>

          <div className="rounded-[var(--pos-radius-sm)] bg-[var(--pos-panel-raised)] p-3">
            <p className="text-[11px] font-medium text-[var(--pos-text-muted)]">
              {showExpected ? "Efectivo esperado · supervisión" : "Conteo ciego activo"}
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--pos-text-primary)]">
              {showExpected && session.expected_cash !== null
                ? formatMoney(toNumber(session.expected_cash), currency)
                : "Se revela al cerrar"}
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--pos-text-muted)]">
              {showExpected
                ? "Calculado con efectivo aplicado y movimientos del turno."
                : "Cuenta el efectivo físico antes de conocer el esperado."}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--pos-text-primary)]">Movimientos recientes</p>
            {movements.length > 0 ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {movements.slice(0, 4).map((movement) => (
                  <MovementRow key={movement.id} movement={movement} currency={currency} />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--pos-text-muted)]">Sin movimientos manuales en este turno.</p>
            )}
          </div>
          <PosButton type="button" variant="danger" size="normal" onClick={onClose} className="min-h-11">
            Cerrar turno
          </PosButton>
        </div>
      </div>
    </article>
  );
}

function ClosedSessionHistory({ session, currency }: { session: CashSession; currency: string }) {
  const summary = getSummary(session);
  const difference = toNumber(session.difference);
  const state = getDifferenceState(difference);

  return (
    <PosCard padding="compact" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--pos-text-primary)]">
            {session.location?.name || "Sucursal"} · {session.register?.name || "Caja"}
          </p>
          <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
            Abrió {formatDateTime(session.opened_at)} · Cerró {session.closed_at ? formatDateTime(session.closed_at) : "—"}
            {session.closed_at ? ` · ${formatDurationBetween(session.opened_at, session.closed_at)}` : ""}
          </p>
        </div>
        <PosBadge tone={state.tone} size="compact" dot>{state.label}</PosBadge>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-y border-[var(--pos-line-subtle)] py-3">
        <SmallValue label="Esperado" value={formatNullableMoney(session.expected_cash, currency)} />
        <SmallValue label="Contado" value={formatNullableMoney(session.counted_cash, currency)} />
        <SmallValue label="Diferencia" value={formatSignedMoney(difference, currency)} tone={state.tone} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
        <HistoryLine label="Fondo inicial" value={formatMoney(toNumber(session.opening_amount), currency)} />
        <HistoryLine label="Efectivo" value={formatMoney(toNumber(summary.cash_sales), currency)} />
        <HistoryLine label="Tarjeta" value={formatMoney(toNumber(summary.card_sales), currency)} />
        <HistoryLine label="Transferencia" value={formatMoney(toNumber(summary.transfer_sales), currency)} />
        <HistoryLine label="Wallet" value={formatMoney(toNumber(summary.wallet_sales), currency)} />
        <HistoryLine label="Otros" value={formatMoney(toNumber(summary.other_sales), currency)} />
        <HistoryLine label="Entradas" value={formatMoney(toNumber(summary.cash_income) + toNumber(summary.cash_deposits), currency)} />
        <HistoryLine label="Retiros/gastos" value={formatMoney(toNumber(summary.cash_expenses) + toNumber(summary.cash_withdrawals), currency)} />
      </div>

      {session.notes ? (
        <p className="mt-3 rounded-[var(--pos-radius-sm)] bg-[var(--pos-canvas)] px-3 py-2 text-xs leading-5 text-[var(--pos-text-muted)]">
          Nota: {session.notes}
        </p>
      ) : null}
    </PosCard>
  );
}

function MovementModal({
  open,
  session,
  currency,
  movementType,
  amount,
  reason,
  isSaving,
  onClose,
  onMovementTypeChange,
  onAmountChange,
  onReasonChange,
  onSave,
}: {
  open: boolean;
  session: CashSession | null;
  currency: string;
  movementType: MovementType;
  amount: string;
  reason: string;
  isSaving: boolean;
  onClose: () => void;
  onMovementTypeChange: (value: MovementType) => void;
  onAmountChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSave: () => void;
}) {
  const selected = MOVEMENT_OPTIONS.find((option) => option.type === movementType) || MOVEMENT_OPTIONS[0];

  return (
    <PosModal
      open={open}
      onClose={onClose}
      title="Movimiento de caja"
      description={session ? `${session.location?.name || "Sucursal"} · ${session.register?.name || "Caja"}` : undefined}
      size="small"
      footer={
        <>
          <PosButton variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</PosButton>
          <PosButton onClick={onSave} loading={isSaving} disabled={isSaving}>Registrar movimiento</PosButton>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-2">
          {MOVEMENT_OPTIONS.map((option) => {
            const active = option.type === movementType;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => onMovementTypeChange(option.type)}
                className={`pos-ui-focus min-w-0 rounded-[var(--pos-radius-sm)] border p-3 text-left outline-none transition ${
                  active
                    ? "border-cyan-300/60 bg-cyan-300/[0.1] text-cyan-100"
                    : "border-[var(--pos-line)] bg-[var(--pos-canvas)] text-[var(--pos-text-secondary)] hover:border-[var(--pos-line-strong)]"
                }`}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-[11px] leading-4 opacity-75">{option.description}</span>
              </button>
            );
          })}
        </div>

        <div className={`rounded-[var(--pos-radius-sm)] px-3 py-2 text-xs ${selected.direction === "in" ? "bg-[var(--pos-success-soft)] text-[var(--pos-success)]" : "bg-[var(--pos-danger-soft)] text-[var(--pos-danger)]"}`}>
          {selected.direction === "in" ? "Este movimiento aumentará el efectivo esperado." : "Este movimiento disminuirá el efectivo esperado."}
        </div>

        <MoneyField label={`Monto (${currency}) *`} value={amount} onChange={onAmountChange} placeholder="0.00" autoFocus />

        <label className="grid gap-2">
          <span className="text-xs font-medium text-[var(--pos-text-muted)]">Motivo *</span>
          <textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Ej. Fondo adicional, pago de proveedor o retiro a caja fuerte"
            className="pos-ui-focus w-full resize-y rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 py-2 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
          />
        </label>
      </div>
    </PosModal>
  );
}

function CloseCashModal({
  session,
  result,
  currency,
  step,
  countedCash,
  closeNotes,
  isSaving,
  onClose,
  onNext,
  onBack,
  onCountedCashChange,
  onNotesChange,
  onConfirm,
}: {
  session: CashSession | null;
  result: CashSession | null;
  currency: string;
  step: 1 | 2 | 3 | 4;
  countedCash: string;
  closeNotes: string;
  isSaving: boolean;
  onClose: () => void;
  onNext: () => void;
  onBack: () => void;
  onCountedCashChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const summary = session ? getSummary(session) : null;
  const difference = result ? toNumber(result.difference) : 0;
  const state = getDifferenceState(difference);

  return (
    <PosModal
      open={Boolean(session)}
      onClose={onClose}
      title={step === 4 ? "Resultado del corte" : "Cerrar caja"}
      description={session ? `${session.location?.name || "Sucursal"} · ${session.register?.name || "Caja"}` : undefined}
      size="small"
      dismissible={!isSaving}
      footer={
        step === 1 ? (
          <>
            <PosButton variant="secondary" onClick={onClose}>Cancelar</PosButton>
            <PosButton onClick={onNext}>Continuar al conteo</PosButton>
          </>
        ) : step === 2 ? (
          <>
            <PosButton variant="secondary" onClick={onBack}>Volver</PosButton>
            <PosButton onClick={onNext}>Revisar cierre</PosButton>
          </>
        ) : step === 3 ? (
          <>
            <PosButton variant="secondary" onClick={onBack} disabled={isSaving}>Volver</PosButton>
            <PosButton variant="danger" onClick={onConfirm} loading={isSaving} disabled={isSaving}>Cerrar caja</PosButton>
          </>
        ) : (
          <PosButton onClick={onClose}>Listo</PosButton>
        )
      }
    >
      {session && summary && step === 1 ? <CloseSummary session={session} summary={summary} currency={currency} /> : null}
      {step === 2 ? (
        <div className="grid gap-5">
          <div className="rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-muted)]">Paso 2 de 3 · Conteo ciego</p>
            <h3 className="mt-2 text-xl font-semibold text-[var(--pos-text-primary)]">¿Cuánto efectivo hay físicamente en caja?</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--pos-text-muted)]">Cuenta primero. El efectivo esperado se revela únicamente después del cierre.</p>
          </div>
          <MoneyField label="Efectivo contado *" value={countedCash} onChange={onCountedCashChange} placeholder="0.00" autoFocus large />
          <label className="grid gap-2">
            <span className="text-xs font-medium text-[var(--pos-text-muted)]">Nota de cierre (opcional)</span>
            <textarea
              value={closeNotes}
              onChange={(event) => onNotesChange(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Observaciones del turno"
              className="pos-ui-focus w-full resize-y rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] px-3 py-2 text-sm text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)]"
            />
          </label>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="grid gap-4">
          <div className="rounded-[var(--pos-radius-md)] bg-[var(--pos-warning-soft)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pos-warning)]">Paso 3 de 3 · Confirmación</p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--pos-text-primary)]">Confirma el cierre del turno</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--pos-text-muted)]">Una vez cerrada la caja no podrás registrar nuevas ventas ni movimientos en esta sesión.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line-subtle)] p-3">
            <SmallValue label="Efectivo contado" value={formatMoney(parseMoney(countedCash) || 0, currency)} />
            <SmallValue label="Nota" value={closeNotes.trim() ? "Incluida" : "Sin nota"} />
          </div>
        </div>
      ) : null}
      {step === 4 && result ? (
        <div className="grid gap-4">
          <div className={`rounded-[var(--pos-radius-md)] p-4 ${state.tone === "success" ? "bg-[var(--pos-success-soft)]" : state.tone === "danger" ? "bg-[var(--pos-danger-soft)]" : "bg-[var(--pos-warning-soft)]"}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-muted)]">Cierre registrado</p>
            <h3 className={`mt-2 text-2xl font-bold ${state.tone === "success" ? "text-[var(--pos-success)]" : state.tone === "danger" ? "text-[var(--pos-danger)]" : "text-[var(--pos-warning)]"}`}>{state.label}</h3>
            <p className="mt-1 text-sm text-[var(--pos-text-secondary)]">El resultado quedó guardado en el historial de cortes.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-[var(--pos-radius-sm)] border border-[var(--pos-line-subtle)] p-3">
            <SmallValue label="Esperado" value={formatNullableMoney(result.expected_cash, currency)} />
            <SmallValue label="Contado" value={formatNullableMoney(result.counted_cash, currency)} />
            <SmallValue label="Diferencia" value={formatSignedMoney(difference, currency)} tone={state.tone} />
          </div>
        </div>
      ) : null}
    </PosModal>
  );
}

function CloseSummary({ session, summary, currency }: { session: CashSession; summary: CashSessionSummary; currency: string }) {
  return (
    <div className="grid gap-5">
      <div className="rounded-[var(--pos-radius-md)] bg-[var(--pos-canvas)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-muted)]">Paso 1 de 3 · Resumen</p>
        <h3 className="mt-2 text-xl font-semibold text-[var(--pos-text-primary)]">Revisa el turno antes de contar</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--pos-text-muted)]">Este resumen no revela el efectivo esperado.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SmallValue label="Fondo inicial" value={formatMoney(toNumber(session.opening_amount), currency)} />
        <SmallValue label="Duración" value={formatDuration(session.opened_at)} />
        <SmallValue label="Ventas totales" value={formatMoney(toNumber(summary.sales_total), currency)} />
        <SmallValue label="Tickets" value={String(toNumber(summary.tickets_count))} />
      </div>
      <div>
        <p className="text-xs font-semibold text-[var(--pos-text-primary)]">Ventas por método</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MethodValue label="Efectivo" value={summary.cash_sales} currency={currency} />
          <MethodValue label="Tarjeta" value={summary.card_sales} currency={currency} />
          <MethodValue label="Transferencia" value={summary.transfer_sales} currency={currency} />
          <MethodValue label="Wallet" value={summary.wallet_sales} currency={currency} />
          <MethodValue label="Otros" value={summary.other_sales} currency={currency} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-[var(--pos-line-subtle)] pt-4">
        <SmallValue label="Entradas / depósitos" value={formatMoney(toNumber(summary.cash_income) + toNumber(summary.cash_deposits), currency)} tone="success" />
        <SmallValue label="Retiros / gastos" value={formatMoney(toNumber(summary.cash_expenses) + toNumber(summary.cash_withdrawals), currency)} tone="danger" />
      </div>
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus = false,
  large = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  large?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium text-[var(--pos-text-muted)]">{label}</span>
      <div className="relative">
        <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-500 ${large ? "text-lg" : "text-sm"}`}>$</span>
        <input
          autoFocus={autoFocus}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(normalizeMoneyText(event.target.value))}
          placeholder={placeholder}
          className={`pos-ui-focus w-full rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] bg-[var(--pos-canvas)] pl-8 pr-3 font-semibold text-[var(--pos-text-primary)] outline-none placeholder:text-[var(--pos-text-muted)] ${large ? "h-16 text-3xl" : "h-12 text-xl"}`}
        />
      </div>
    </label>
  );
}

function MethodValue({ label, value, currency }: { label: string; value: number | string; currency: string }) {
  return (
    <div className="min-w-0 rounded-[var(--pos-radius-sm)] bg-[var(--pos-panel)] px-3 py-2">
      <p className="truncate text-[11px] font-medium text-[var(--pos-text-muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--pos-text-primary)]">{formatMoney(toNumber(value), currency)}</p>
    </div>
  );
}

function MovementMetric({ label, value, tone, currency }: { label: string; value: number | string; tone: "in" | "out"; currency: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-[var(--pos-text-muted)]">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${tone === "in" ? "text-[var(--pos-success)]" : "text-[var(--pos-danger)]"}`}>
        {tone === "in" ? "+" : "−"}{formatMoney(toNumber(value), currency)}
      </p>
    </div>
  );
}

function MovementRow({ movement, currency }: { movement: CashMovement; currency: string }) {
  const option = MOVEMENT_OPTIONS.find((item) => item.type === movement.movementType) || MOVEMENT_OPTIONS[0];
  const isInflow = option.direction === "in";

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-[var(--pos-panel)] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-[var(--pos-text-primary)]">{option.label} · {movement.reason}</p>
        <p className="mt-1 text-[11px] text-[var(--pos-text-muted)]">{formatTime(movement.createdAt)}</p>
      </div>
      <p className={`shrink-0 text-sm font-semibold ${isInflow ? "text-[var(--pos-success)]" : "text-[var(--pos-danger)]"}`}>
        {isInflow ? "+" : "−"}{formatMoney(toNumber(movement.amount), currency)}
      </p>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: "cash" | "activity" | "receipt" }) {
  return (
    <PosCard padding="compact" className="min-h-20">
      <div className="flex items-center gap-2 text-[var(--pos-text-muted)]">
        <PosIcon name={icon} className="h-4 w-4" />
        <p className="text-[11px] font-medium">{label}</p>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-[-0.035em] text-[var(--pos-text-primary)]">{value}</p>
    </PosCard>
  );
}

function SmallValue({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const color = tone === "success" ? "text-[var(--pos-success)]" : tone === "warning" ? "text-[var(--pos-warning)]" : tone === "danger" ? "text-[var(--pos-danger)]" : "text-[var(--pos-text-primary)]";
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium text-[var(--pos-text-muted)]">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function HistoryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="truncate text-[var(--pos-text-muted)]">{label}</span>
      <span className="shrink-0 font-semibold text-[var(--pos-text-primary)]">{value}</span>
    </div>
  );
}

function EmptyActiveSessions() {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-[var(--pos-radius-md)] border border-dashed border-[var(--pos-line)] bg-[var(--pos-canvas)] p-5 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-amber-300/[0.08] text-amber-200">
          <PosIcon name="cash" className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-[var(--pos-text-primary)]">No hay turnos activos</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--pos-text-muted)]">Abre una caja para que el equipo pueda comenzar a vender.</p>
      </div>
    </div>
  );
}

function CashPageLoading() {
  return (
    <PosPage width="wide" density="compact" aria-busy="true">
      <div className="h-20 animate-pulse border-b border-[var(--pos-line-subtle)]" />
      <div className="grid gap-3 sm:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-[var(--pos-radius-md)] bg-white/[0.035]" />)}</div>
      <div className="grid gap-4 min-[1180px]:grid-cols-[340px_minmax(0,1fr)]">
        <div className="h-80 animate-pulse rounded-[var(--pos-radius-lg)] bg-white/[0.035]" />
        <div className="h-80 animate-pulse rounded-[var(--pos-radius-lg)] bg-white/[0.035]" />
      </div>
    </PosPage>
  );
}

function FeedbackBanner({ error, notice, onRetry }: { error: string | null; notice: string | null; onRetry: () => void }) {
  if (!error && !notice) return null;
  return (
    <div className={`flex items-center justify-between gap-4 rounded-[var(--pos-radius-md)] px-4 py-3 text-sm font-medium ${error ? "bg-[var(--pos-danger-soft)] text-rose-200" : "bg-[var(--pos-success-soft)] text-emerald-200"}`}>
      <span>{error || notice}</span>
      {error ? <PosButton variant="secondary" size="compact" onClick={onRetry}>Reintentar</PosButton> : null}
    </div>
  );
}

function getSummary(session: CashSession): CashSessionSummary {
  return session.summary || {
    sales_total: 0,
    tickets_count: 0,
    cash_sales: 0,
    card_sales: 0,
    transfer_sales: 0,
    wallet_sales: 0,
    other_sales: 0,
    cash_income: 0,
    cash_deposits: 0,
    cash_expenses: 0,
    cash_withdrawals: 0,
    net_cash_movements: 0,
    expected_cash: null,
    recent_movements: [],
  };
}

function normalizeMovements(value: unknown): CashMovement[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CashMovement => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const movement = item as Record<string, unknown>;
    return typeof movement.id === "string" &&
      typeof movement.movementType === "string" &&
      typeof movement.reason === "string" &&
      typeof movement.createdAt === "string" &&
      (typeof movement.amount === "string" || typeof movement.amount === "number");
  });
}

function getSessionCurrency(session: CashSession, locations: Location[]) {
  return locations.find((location) => location.id === session.location_id)?.currency || "MXN";
}

function getDifferenceState(difference: number): { label: string; tone: "success" | "warning" | "danger" } {
  if (difference === 0) return { label: "CUADRA", tone: "success" };
  if (difference > 0) return { label: "SOBRANTE", tone: "warning" };
  return { label: "FALTANTE", tone: "danger" };
}

function normalizeMoneyText(value: string) {
  const normalized = value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const [whole = "", ...decimals] = normalized.split(".");
  return decimals.length > 0 ? `${whole}.${decimals.join("").slice(0, 2)}` : whole;
}

function parseMoney(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
}

function formatNullableMoney(value: number | string | null, currency = "MXN") {
  return value === null ? "—" : formatMoney(toNumber(value), currency);
}

function formatSignedMoney(value: number, currency = "MXN") {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatMoney(Math.abs(value), currency)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDuration(openedAt: string) {
  const minutes = Math.floor(Math.max(0, Date.now() - new Date(openedAt).getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes} min` : `${hours} h ${minutes % 60} min`;
}

function formatDurationBetween(openedAt: string, closedAt: string) {
  const minutes = Math.floor(
    Math.max(0, new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60000
  );
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes} min` : `${hours} h ${minutes % 60} min`;
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || data?.message || "No se pudo completar la operación.");
  }
  return data as T;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}
