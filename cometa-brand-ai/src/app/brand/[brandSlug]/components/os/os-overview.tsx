import type { OsDashboardPayload } from "./os-dashboard-client";

export function OsOverview({
  dashboard,
  isLoading,
}: {
  dashboard: OsDashboardPayload | null;
  isLoading: boolean;
}) {
  const cards = dashboard
    ? [
        {
          label: "Readiness",
          value: dashboard.dataAvailability.derived.readiness
            ? `${dashboard.brand.agentScore}/100`
            : "No disponible",
          detail: "Preparación del sistema",
          available: dashboard.dataAvailability.derived.readiness,
        },
        {
          label: "Leads",
          value: dashboard.dataAvailability.counts.leads
            ? String(dashboard.counts.leads)
            : "No disponible",
          detail: "Conversaciones abiertas",
          available: dashboard.dataAvailability.counts.leads,
        },
        {
          label: "Knowledge",
          value: dashboard.dataAvailability.derived.knowledge
            ? `${dashboard.brand.knowledge}%`
            : "No disponible",
          detail: "Base comercial preparada",
          available: dashboard.dataAvailability.derived.knowledge,
        },
        {
          label: "Prioridad",
          value: dashboard.dataAvailability.derived.nextAction
            ? dashboard.brand.mainAction
            : "No disponible",
          detail: dashboard.dataAvailability.derived.nextAction
            ? "Siguiente mejora sugerida"
            : "Señales sin disponibilidad",
          available: dashboard.dataAvailability.derived.nextAction,
        },
      ]
    : [];

  return (
    <section id="resumen" className="scroll-mt-5 rounded-3xl border border-white/10 bg-slate-950/65 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.19em] text-cyan-200">Executive overview</p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-white sm:text-2xl">
            Señales que importan ahora
          </h1>
        </div>
        <p className="text-xs text-slate-500">Datos operativos y derivados con disponibilidad explícita.</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl border border-white/8 bg-white/[0.035]" />
            ))
          : cards.map((card) => (
              <article key={card.label} className="min-w-0 rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
                <p
                  className={`mt-3 truncate text-xl font-semibold tracking-[-0.035em] ${
                    card.available ? "text-white" : "text-slate-500"
                  }`}
                  title={card.value}
                >
                  {card.value}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{card.detail}</p>
              </article>
            ))}
      </div>
    </section>
  );
}
