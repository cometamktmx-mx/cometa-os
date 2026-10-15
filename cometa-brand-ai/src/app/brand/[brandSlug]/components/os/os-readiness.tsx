import type { OsDashboardPayload } from "./os-dashboard-client";

type ReadinessRow = {
  label: string;
  value: string;
  ready: boolean;
};

export function OsReadiness({ dashboard }: { dashboard: OsDashboardPayload | null }) {
  const availability = dashboard?.dataAvailability;
  const readinessAvailable = availability?.derived.readiness === true;
  const score = readinessAvailable && dashboard ? `${dashboard.brand.agentScore}/100` : "No disponible";
  const rows: ReadinessRow[] = dashboard
    ? [
        {
          label: "Knowledge",
          value: availability?.derived.knowledge ? `${dashboard.brand.knowledge}% preparado` : "No disponible",
          ready: availability?.derived.knowledge === true && dashboard.brand.knowledge >= 85,
        },
        {
          label: "Ventas / Leads",
          value: availability?.counts.leads
            ? `${dashboard.counts.leads} conversaciones abiertas`
            : "No disponible",
          ready: availability?.counts.leads === true,
        },
        {
          label: "Learning",
          value: availability?.counts.pendingInternalAlerts
            ? `${dashboard.counts.pendingInternalAlerts} señales pendientes`
            : "No disponible",
          ready:
            availability?.counts.pendingInternalAlerts === true &&
            dashboard.counts.pendingInternalAlerts === 0,
        },
        {
          label: "Autonomía IA",
          value: availability?.derived.autonomy ? `${dashboard.brand.autonomy}%` : "No disponible",
          ready: availability?.derived.autonomy === true && dashboard.brand.autonomy >= 75,
        },
      ]
    : [];

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/65 p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1fr)] lg:items-center">
        <div className="rounded-2xl border border-cyan-300/15 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.16),transparent_50%),rgba(8,47,73,0.22)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.19em] text-cyan-200">System readiness</p>
          <p className={`mt-3 text-4xl font-semibold tracking-[-0.06em] ${readinessAvailable ? "text-white" : "text-slate-500"}`}>
            {score}
          </p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
            {readinessAvailable && dashboard?.dataAvailability.derived.nextAction
              ? dashboard.brand.actionDescription
              : "La preparación se mostrará cuando las fuentes operativas estén disponibles."}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.025em] text-white">Qué está listo</h2>
            <span className="text-xs text-slate-500">Una sola lectura del sistema</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-200">{row.label}</p>
                  <span className={`h-2 w-2 rounded-full ${row.ready ? "bg-cyan-300" : "bg-slate-600"}`} />
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{row.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
