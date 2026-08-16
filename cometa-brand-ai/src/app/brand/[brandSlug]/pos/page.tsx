"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PosIcon, type PosIconName } from "../components/pos-icons";
import { usePosContext } from "../components/pos-shell";
import { buildPosHref } from "../components/pos-sidebar";
import type { SubscriptionLifecycle } from "@/lib/pos/lifecycle";
import {
  PosBadge,
  PosButton,
  PosCard,
  PosPage,
  PosPageHeader,
  PosSection,
} from "../components/pos-ui";

type SetupStepKey =
  | "profile"
  | "branding"
  | "location"
  | "register"
  | "products"
  | "inventory"
  | "loyalty";

type BootstrapResponse = {
  ok: true;
  setup: {
    steps: Record<SetupStepKey, boolean>;
    completedSteps: number;
    totalSteps: number;
    percentage: number;
  };
  locations: Array<{
    id: string;
    name: string;
    active: boolean;
    currency: string;
  }>;
  registers: Array<{
    id: string;
    name: string;
    status: string;
    location_id: string;
  }>;
  openSessions: Array<{
    id: string;
    opened_at: string;
    register?: { id?: string; name?: string } | null;
    location?: { id?: string; name?: string } | null;
  }>;
  counts: {
    products: number;
    variants: number;
    inventoryWithStock: number;
    customers: number;
  };
  loyaltyProgram: { id: string; active: boolean } | null;
};

type ReportSummary = {
  tickets: number;
  gross_sales: number;
  average_ticket: number;
  identified_customers: number;
  period_start: string;
  period_end: string;
};

type ReportResponse = {
  ok: true;
  period: { start: string; end: string };
  summary: ReportSummary;
};

type SalesProgressResponse = {
  ok: true;
  pagination: { total: number };
};

type CashProgressResponse = {
  ok: true;
  sessions: Array<{ id: string; status: string }>;
};

type OverviewState = {
  bootstrap: BootstrapResponse;
  report: ReportResponse | null;
  sales: SalesProgressResponse | null;
  cash: CashProgressResponse | null;
  secondaryError: boolean;
};

const SETUP_STEPS: Array<{
  key: SetupStepKey;
  label: string;
  route: string;
}> = [
  { key: "profile", label: "Completar perfil del negocio", route: "settings" },
  { key: "branding", label: "Configurar identidad de marca", route: "settings" },
  { key: "location", label: "Crear una sucursal", route: "settings" },
  { key: "register", label: "Configurar una caja", route: "cash" },
  { key: "products", label: "Agregar productos", route: "products" },
  { key: "inventory", label: "Cargar inventario", route: "inventory" },
  { key: "loyalty", label: "Configurar fidelización", route: "loyalty" },
];

const QUICK_ACTIONS: Array<{
  label: string;
  description: string;
  route: string;
  icon: PosIconName;
  primary?: boolean;
}> = [
  {
    label: "Nueva venta",
    description: "Abrir el punto de cobro",
    route: "register",
    icon: "register",
    primary: true,
  },
  {
    label: "Ventas",
    description: "Consultar transacciones",
    route: "sales",
    icon: "receipt",
  },
  {
    label: "Caja",
    description: "Sesiones y movimientos",
    route: "cash",
    icon: "cash",
  },
  {
    label: "Inventario",
    description: "Revisar existencias",
    route: "inventory",
    icon: "inventory",
  },
  {
    label: "Clientes",
    description: "Directorio y actividad",
    route: "customers",
    icon: "customers",
  },
];

export default function PosHomePage() {
  const router = useRouter();
  const { brand, lifecycle, isLoading: isContextLoading } = usePosContext();
  const [overview, setOverview] = useState<OverviewState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!brand.slug) return;

    setIsLoading(true);
    setError(null);

    try {
      const query = `brandSlug=${encodeURIComponent(brand.slug)}`;
      const responses = await Promise.allSettled([
        fetch(`/api/pos/bootstrap?${query}`, { cache: "no-store" }),
        fetch(`/api/pos/reports/summary?${query}`, { cache: "no-store" }),
        fetch(`/api/pos/sales?${query}&status=completed&pageSize=1`, { cache: "no-store" }),
        fetch(`/api/pos/cash-sessions?${query}`, { cache: "no-store" }),
      ]);

      const bootstrapResponse = fulfilledResponse(responses[0]);
      if (!bootstrapResponse) {
        throw new Error("No se pudo cargar el estado operativo.");
      }
      const bootstrap = await readJson<BootstrapResponse>(bootstrapResponse);

      if (!bootstrapResponse.ok) {
        throw new Error(getApiError(bootstrap, "No se pudo cargar el estado operativo."));
      }

      for (const result of responses.slice(1)) {
        const response = fulfilledResponse(result);
        if (response?.status === 401 || response?.status === 403) {
          throw new Error("No tienes autorizaciÃ³n para consultar esta operaciÃ³n.");
        }
      }

      const report = await readOptionalJson<ReportResponse>(responses[1]);
      const sales = await readOptionalJson<SalesProgressResponse>(responses[2]);
      const cash = await readOptionalJson<CashProgressResponse>(responses[3]);

      setOverview({
        bootstrap,
        report,
        sales,
        cash,
        secondaryError: !report || !sales || !cash,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar el resumen de operación."
      );
    } finally {
      setIsLoading(false);
    }
  }, [brand.slug]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const pendingSteps = useMemo(() => {
    if (!overview) return [];
    return SETUP_STEPS.filter(
      (step) => !overview.bootstrap.setup.steps[step.key]
    );
  }, [overview]);

  if (isLoading || isContextLoading) {
    return <OverviewSkeleton />;
  }

  if (error || !overview) {
    return (
      <PosPage width="wide">
        <PosPageHeader
          title="Resumen de operación"
          description="Estado diario y accesos principales de Cometa POS."
        />
        <PosCard variant="danger" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-[var(--pos-text-primary)]">
              No pudimos cargar el resumen.
            </p>
            <p className="mt-1 text-sm text-[var(--pos-danger)]">
              {error ?? "Intenta nuevamente."}
            </p>
          </div>
          <PosButton variant="secondary" onClick={() => void loadOverview()}>
            Reintentar
          </PosButton>
        </PosCard>
      </PosPage>
    );
  }

  const { bootstrap, report, sales, cash, secondaryError } = overview;
  const completedSales = sales?.pagination.total ?? null;

  if (completedSales === null || cash === null) {
    return (
      <FirstRunUnavailable
        brandName={brand.name}
        brandSlug={brand.slug}
        onRetry={() => void loadOverview()}
      />
    );
  }

  if (completedSales === 0) {
    return (
      <FirstRunExperience
        brandName={brand.name}
        brandSlug={brand.slug}
        bootstrap={bootstrap}
        lifecycle={lifecycle}
        cashSessions={cash.sessions}
        hasSecondaryWarning={secondaryError}
      />
    );
  }

  if (!report) {
    return (
      <FirstRunUnavailable
        brandName={brand.name}
        brandSlug={brand.slug}
        onRetry={() => void loadOverview()}
        summaryMode
      />
    );
  }

  const currency = bootstrap.locations[0]?.currency || "MXN";
  const activeLocations = bootstrap.locations.filter(
    (location) => location.active !== false
  );
  const availableRegisters = bootstrap.registers.filter(
    (register) => register.status === "available"
  );
  const openSession = bootstrap.openSessions[0] ?? null;
  const reportPeriod = formatReportPeriod(report.summary.period_end || report.period.end);

  const metrics = [
    {
      label: "Ventas de hoy",
      value: formatCurrency(report.summary.gross_sales, currency),
      detail: reportPeriod,
    },
    {
      label: "Tickets",
      value: formatInteger(report.summary.tickets),
      detail: "Transacciones completadas",
    },
    {
      label: "Ticket promedio",
      value: formatCurrency(report.summary.average_ticket, currency),
      detail: "Promedio por transacción",
    },
    {
      label: "Clientes identificados",
      value: formatInteger(report.summary.identified_customers),
      detail: "Vinculados a ventas de hoy",
    },
  ];

  return (
    <PosPage width="wide" density="compact">
      <PosPageHeader
        eyebrow="Operations overview"
        title="Resumen de operación"
        description={`Actividad diaria de ${brand.name} y estado actual del punto de venta.`}
        meta={reportPeriod}
        actions={
          <PosButton
            size="normal"
            leadingIcon={<PosIcon name="register" className="h-4 w-4" />}
            onClick={() => router.push(buildPosHref(brand.slug, "register"))}
          >
            Nueva venta
          </PosButton>
        }
      />

      <section aria-label="Métricas de hoy" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map((metric) => (
          <PosCard key={metric.label} padding="compact" className="min-h-28">
            <p className="text-xs font-medium text-[var(--pos-text-muted)]">
              {metric.label}
            </p>
            <p className="mt-3 text-2xl font-bold tracking-[-0.04em] text-[var(--pos-text-primary)] lg:text-[28px]">
              {metric.value}
            </p>
            <p className="mt-2 text-xs text-[var(--pos-text-muted)]">
              {metric.detail}
            </p>
          </PosCard>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <PosSection
          title="Estado de operación"
          description="Infraestructura y preparación actual del POS."
        >
          <PosCard padding="none" className="overflow-hidden">
            <OperationalRow
              icon="store"
              label="Sucursales activas"
              value={formatInteger(activeLocations.length)}
              badge={activeLocations.length > 0 ? "Operativas" : "Pendiente"}
              tone={activeLocations.length > 0 ? "success" : "warning"}
            />
            <OperationalRow
              icon="cash"
              label="Cajas disponibles"
              value={`${availableRegisters.length} de ${bootstrap.registers.length}`}
              badge={bootstrap.registers.length > 0 ? "Configuradas" : "Pendiente"}
              tone={bootstrap.registers.length > 0 ? "neutral" : "warning"}
            />
            <OperationalRow
              icon="activity"
              label="Sesión de caja"
              value={
                openSession
                  ? openSession.register?.name || openSession.location?.name || "Sesión abierta"
                  : "Sin sesión abierta"
              }
              badge={openSession ? "Abierta" : "Cerrada"}
              tone={openSession ? "success" : "neutral"}
            />
            <OperationalRow
              icon="products"
              label="Catálogo e inventario"
              value={`${bootstrap.counts.products} productos · ${bootstrap.counts.inventoryWithStock} con stock`}
              badge={bootstrap.setup.steps.inventory ? "Listo" : "Revisar"}
              tone={bootstrap.setup.steps.inventory ? "success" : "warning"}
              last
            />
          </PosCard>
        </PosSection>

        <PosSection
          title="Acciones rápidas"
          description="Operaciones frecuentes a un clic."
        >
          <PosCard padding="none" className="overflow-hidden">
            {QUICK_ACTIONS.map((action, index) => (
              <Link
                key={action.route}
                href={buildPosHref(brand.slug, action.route)}
                className={`pos-ui-focus group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-white/[0.04] ${
                  index < QUICK_ACTIONS.length - 1
                    ? "border-b border-[var(--pos-line-subtle)]"
                    : ""
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] ${
                    action.primary
                      ? "bg-[var(--pos-primary)] text-slate-950"
                      : "bg-white/[0.05] text-[var(--pos-text-secondary)]"
                  }`}
                >
                  <PosIcon name={action.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--pos-text-primary)]">
                    {action.label}
                  </span>
                  <span className="block truncate text-xs text-[var(--pos-text-muted)]">
                    {action.description}
                  </span>
                </span>
                <PosIcon
                  name="chevron"
                  className="h-4 w-4 -rotate-90 text-[var(--pos-text-muted)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--pos-primary)]"
                />
              </Link>
            ))}
          </PosCard>
        </PosSection>
      </div>

      {pendingSteps.length > 0 ? (
        <PosSection
          divided
          title="Configuración pendiente"
          description={`${bootstrap.setup.completedSteps} de ${bootstrap.setup.totalSteps} pasos completados.`}
          actions={
            <PosBadge tone="warning">
              {bootstrap.setup.percentage}% configurado
            </PosBadge>
          }
        >
          <PosCard padding="none" className="overflow-hidden md:grid md:grid-cols-2">
            {pendingSteps.map((step, index) => (
              <Link
                key={step.key}
                href={buildPosHref(brand.slug, step.route)}
                className={`pos-ui-focus flex min-h-14 items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--pos-text-secondary)] transition-colors duration-150 hover:bg-white/[0.04] hover:text-[var(--pos-text-primary)] ${
                  index < pendingSteps.length - 1
                    ? "border-b border-[var(--pos-line-subtle)]"
                    : ""
                } md:border-b md:border-[var(--pos-line-subtle)]`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--pos-warning-soft)] text-[var(--pos-warning)]">
                  {index + 1}
                </span>
                <span className="flex-1">{step.label}</span>
                <PosIcon name="arrow" className="h-4 w-4 text-[var(--pos-text-muted)]" />
              </Link>
            ))}
          </PosCard>
        </PosSection>
      ) : null}
    </PosPage>
  );
}

function FirstRunExperience({
  brandName,
  brandSlug,
  bootstrap,
  lifecycle,
  cashSessions,
  hasSecondaryWarning,
}: {
  brandName: string;
  brandSlug: string;
  bootstrap: BootstrapResponse;
  lifecycle: SubscriptionLifecycle | null;
  cashSessions: Array<{ id: string; status: string }>;
  hasSecondaryWarning: boolean;
}) {
  const activeLocation = bootstrap.locations.find((item) => item.active !== false);
  const register = bootstrap.registers[0] ?? null;
  const hasProduct = bootstrap.counts.products > 0;
  const hasInventory = bootstrap.counts.inventoryWithStock > 0;
  const hasCashHistory = cashSessions.length > 0;
  const hasOpenCash = bootstrap.openSessions.length > 0;

  const steps = [
    {
      label: "Agregar mi primer producto",
      detail: "Crea el artÃ­culo que vas a vender.",
      complete: hasProduct,
      route: "products",
      icon: "product" as PosIconName,
    },
    {
      label: "Registrar inventario",
      detail: "Carga existencias para comenzar a operar.",
      complete: hasInventory,
      route: "inventory",
      icon: "inventory" as PosIconName,
    },
    {
      label: "Abrir caja",
      detail: hasCashHistory
        ? "Ya abriste tu primera sesiÃ³n de caja."
        : "Registra el fondo inicial de Caja 1.",
      complete: hasCashHistory,
      route: "cash",
      icon: "cash" as PosIconName,
    },
    {
      label: "Realizar primera venta",
      detail: "Completa tu primer cobro en Cometa POS.",
      complete: false,
      route: "register",
      icon: "receipt" as PosIconName,
    },
  ];

  const completedCount = steps.filter((step) => step.complete).length;
  const nextAction = !hasProduct
    ? { label: "Agregar mi primer producto", route: "products", step: 0 }
    : !hasInventory
      ? { label: "Registrar inventario", route: "inventory", step: 1 }
      : !hasOpenCash
        ? { label: "Abrir caja", route: "cash", step: 2 }
        : { label: "Hacer mi primera venta", route: "register", step: 3 };

  const trialDays = lifecycle?.effectiveStatus === "trial"
    ? lifecycle.trial.daysRemaining
    : null;
  const statusItems = [
    { label: "Negocio creado", value: brandName, complete: true, icon: "store" as PosIconName },
    {
      label: activeLocation ? `${activeLocation.name} lista` : "Sucursal pendiente",
      value: activeLocation ? "UbicaciÃ³n activa" : "Revisa configuraciÃ³n",
      complete: Boolean(activeLocation),
      icon: "branch" as PosIconName,
    },
    {
      label: register ? `${register.name} configurada` : "Caja pendiente",
      value: register ? "Lista para abrir" : "Revisa configuraciÃ³n",
      complete: Boolean(register),
      icon: "cash" as PosIconName,
    },
    {
      label: trialDays !== null ? "Prueba gratuita activa" : "Cometa POS activo",
      value: trialDays !== null
        ? `${trialDays} ${trialDays === 1 ? "dÃ­a restante" : "dÃ­as restantes"}`
        : "Acceso operacional disponible",
      complete: Boolean(lifecycle?.accessAllowed),
      icon: "activity" as PosIconName,
    },
  ];

  return (
    <PosPage width="wide" density="compact">
      <section className="relative overflow-hidden rounded-[32px] border border-cyan-300/15 bg-[linear-gradient(135deg,#0b1d31_0%,#07131f_58%,#091824_100%)] px-5 py-7 shadow-[0_28px_80px_rgba(0,0,0,0.24)] sm:px-8 sm:py-9 lg:px-10">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
            Cometa POS Â· Listo para empezar
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-[-0.055em] text-white sm:text-5xl">
            Tu negocio ya estÃ¡ listo.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            <strong className="font-semibold text-white">{brandName}</strong> ya tiene Cometa POS activo. Empieza a vender en minutos.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={buildPosHref(brandSlug, nextAction.route)}
              className="pos-ui-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-cyan-300 px-6 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
            >
              {nextAction.label}
              <PosIcon name="arrow" className="h-4 w-4" />
            </Link>
            <Link
              href={buildPosHref(brandSlug, "register")}
              className="pos-ui-focus inline-flex min-h-12 items-center justify-center rounded-[14px] border border-white/10 px-6 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.05]"
            >
              Ir al POS
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="Estado inicial" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statusItems.map((item) => (
          <PosCard key={item.label} padding="compact" className="min-h-24">
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.complete ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}>
                <PosIcon name={item.complete ? "check" : item.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--pos-text-primary)]">{item.label}</p>
                <p className="mt-1 truncate text-xs text-[var(--pos-text-muted)]">{item.value}</p>
              </div>
            </div>
          </PosCard>
        ))}
      </section>

      <PosCard className="overflow-hidden" padding="none">
        <div className="flex flex-col gap-4 border-b border-[var(--pos-line-subtle)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-cyan-300">Primeros pasos</p>
            <h2 className="mt-1 text-xl font-bold text-[var(--pos-text-primary)]">Prepara tu primera venta</h2>
          </div>
          <div className="min-w-40">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--pos-text-muted)]">
              <span>Progreso</span><span>{completedCount}/4</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${completedCount * 25}%` }} />
            </div>
          </div>
        </div>
        <div className="grid lg:grid-cols-2">
          {steps.map((step, index) => {
            const highlighted = index === nextAction.step;
            return (
              <Link
                key={step.label}
                href={buildPosHref(brandSlug, step.route)}
                className={`pos-ui-focus flex min-h-20 items-center gap-4 border-b border-[var(--pos-line-subtle)] px-5 py-4 transition lg:px-6 ${index % 2 === 0 ? "lg:border-r" : ""} ${highlighted ? "bg-cyan-300/[0.055]" : "hover:bg-white/[0.025]"}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${step.complete ? "bg-emerald-400/10 text-emerald-300" : highlighted ? "bg-cyan-300 text-slate-950" : "bg-white/[0.05] text-slate-400"}`}>
                  {step.complete ? <PosIcon name="check" className="h-4 w-4" /> : <PosIcon name={step.icon} className="h-[18px] w-[18px]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--pos-text-primary)]">{step.label}</span>
                  <span className="mt-1 block text-xs text-[var(--pos-text-muted)]">{step.detail}</span>
                </span>
                {highlighted ? <PosBadge tone="info" size="compact">Siguiente</PosBadge> : null}
              </Link>
            );
          })}
        </div>
      </PosCard>

      <div className="flex flex-col gap-2 text-xs text-[var(--pos-text-muted)] sm:flex-row sm:items-center sm:justify-between">
        <p>{hasSecondaryWarning ? "Algunos indicadores secundarios se actualizarÃ¡n al recargar." : "El progreso se actualiza con tu operaciÃ³n real."}</p>
        <Link href={buildPosHref(brandSlug, "onboarding")} className="font-semibold text-slate-400 hover:text-cyan-200">
          Perfil del negocio
        </Link>
      </div>
    </PosPage>
  );
}

function FirstRunUnavailable({
  brandName,
  brandSlug,
  onRetry,
  summaryMode = false,
}: {
  brandName: string;
  brandSlug: string;
  onRetry: () => void;
  summaryMode?: boolean;
}) {
  return (
    <PosPage width="wide">
      <PosPageHeader
        eyebrow="Cometa POS"
        title={summaryMode ? "Resumen de operaciÃ³n" : "Tu negocio ya estÃ¡ listo."}
        description={`${brandName} puede continuar operando. No pudimos confirmar todos los indicadores en este momento.`}
      />
      <PosCard className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-[var(--pos-text-primary)]">Tu informaciÃ³n permanece segura.</p>
          <p className="mt-1 text-sm text-[var(--pos-text-muted)]">Reintenta la lectura o entra directamente al punto de venta.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PosButton variant="secondary" onClick={onRetry}>Reintentar</PosButton>
          <Link href={buildPosHref(brandSlug, "register")} className="pos-ui-focus inline-flex min-h-11 items-center justify-center rounded-[var(--pos-radius-sm)] bg-cyan-300 px-5 text-sm font-semibold text-slate-950">Ir al POS</Link>
        </div>
      </PosCard>
    </PosPage>
  );
}

function OperationalRow({
  icon,
  label,
  value,
  badge,
  tone,
  last = false,
}: {
  icon: PosIconName;
  label: string;
  value: string;
  badge: string;
  tone: "neutral" | "success" | "warning";
  last?: boolean;
}) {
  return (
    <div
      className={`grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 ${
        last ? "" : "border-b border-[var(--pos-line-subtle)]"
      }`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-[var(--pos-radius-sm)] bg-white/[0.05] text-[var(--pos-text-secondary)]">
        <PosIcon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-[var(--pos-text-muted)]">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-[var(--pos-text-primary)]">
          {value}
        </p>
      </div>
      <PosBadge tone={tone} size="compact" dot>
        {badge}
      </PosBadge>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <PosPage width="wide" density="compact" aria-busy="true">
      <div className="border-b border-[var(--pos-line-subtle)] pb-5">
        <div className="h-3 w-32 animate-pulse rounded bg-white/[0.07]" />
        <div className="mt-3 h-7 w-64 animate-pulse rounded bg-white/[0.08]" />
        <div className="mt-3 h-4 w-full max-w-lg animate-pulse rounded bg-white/[0.05]" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <PosCard key={index} padding="compact" className="min-h-28 animate-pulse">
            <div className="h-3 w-24 rounded bg-white/[0.06]" />
            <div className="mt-4 h-8 w-32 rounded bg-white/[0.08]" />
            <div className="mt-3 h-3 w-28 rounded bg-white/[0.05]" />
          </PosCard>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        {[4, 5].map((rows) => (
          <div key={rows}>
            <div className="mb-4 h-5 w-40 animate-pulse rounded bg-white/[0.07]" />
            <PosCard padding="none" className="overflow-hidden">
              {Array.from({ length: rows }).map((_, index) => (
                <div
                  key={index}
                  className="flex min-h-16 animate-pulse items-center gap-3 border-b border-[var(--pos-line-subtle)] px-4 last:border-b-0"
                >
                  <div className="h-9 w-9 rounded bg-white/[0.06]" />
                  <div className="h-4 flex-1 rounded bg-white/[0.05]" />
                </div>
              ))}
            </PosCard>
          </div>
        ))}
      </div>
    </PosPage>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`El servidor respondió con un formato inesperado (${response.status}).`);
  }
  return (await response.json()) as T;
}

function fulfilledResponse(
  result: PromiseSettledResult<Response> | undefined
) {
  return result?.status === "fulfilled" ? result.value : null;
}

async function readOptionalJson<T>(
  result: PromiseSettledResult<Response> | undefined
): Promise<T | null> {
  const response = fulfilledResponse(result);
  if (!response?.ok) return null;

  try {
    return await readJson<T>(response);
  } catch {
    return null;
  }
}

function getApiError(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(
    Number(value) || 0
  );
}

function formatReportPeriod(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Actividad de hoy";
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}
