import Link from "next/link";
import type { OsDashboardPayload } from "./os-dashboard-client";

type Action = {
  title: string;
  description: string;
  href: string;
  kind: "Prioridad" | "Ventas" | "Learning";
};

export function OsNextActions({ dashboard }: { dashboard: OsDashboardPayload | null }) {
  const actions = getActions(dashboard);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/65 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.19em] text-cyan-200">Next best actions</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-white">Lo que necesita tu negocio ahora</h2>
        </div>
        <p className="text-xs text-slate-500">Solo se muestran acciones respaldadas por señales disponibles.</p>
      </div>

      {actions.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {actions.map((action) => (
            <article key={action.title} className="flex min-w-0 flex-col rounded-2xl border border-white/8 bg-white/[0.035] p-4">
              <span className="w-fit rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-2.5 py-1 text-[11px] font-medium text-cyan-100">
                {action.kind}
              </span>
              <h3 className="mt-3 text-base font-semibold tracking-[-0.02em] text-white">{action.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">{action.description}</p>
              <Link
                href={action.href}
                className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300"
              >
                Abrir →
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm leading-6 text-slate-500">
          No hay acciones priorizadas con datos disponibles.
        </div>
      )}
    </section>
  );
}

function getActions(dashboard: OsDashboardPayload | null): Action[] {
  if (!dashboard) return [];

  const { brand, counts, dataAvailability } = dashboard;
  const query = `brandSlug=${encodeURIComponent(brand.slug)}`;
  const actions: Action[] = [];

  if (dataAvailability.derived.nextAction && brand.mainAction) {
    const href = dataAvailability.derived.knowledge && brand.knowledge < 100
      ? `/sales-ai/knowledge?${query}`
      : dataAvailability.counts.leads && counts.leads > 0
        ? `/sales-ai/inbox?${query}`
        : "#cuenta-digital";

    actions.push({
      title: brand.mainAction,
      description: brand.actionDescription,
      href,
      kind: "Prioridad",
    });
  }

  if (dataAvailability.counts.leads && counts.leads > 0) {
    actions.push({
      title: "Revisar conversaciones activas",
      description: `${counts.leads} leads abiertos necesitan seguimiento comercial.`,
      href: `/sales-ai/inbox?${query}`,
      kind: "Ventas",
    });
  }

  if (dataAvailability.counts.pendingInternalAlerts && counts.pendingInternalAlerts > 0) {
    actions.push({
      title: "Revisar señales de aprendizaje",
      description: `${counts.pendingInternalAlerts} señales internas esperan revisión antes de modificar la operación.`,
      href: `/sales-ai/learning?${query}`,
      kind: "Learning",
    });
  }

  return actions.slice(0, 3);
}
