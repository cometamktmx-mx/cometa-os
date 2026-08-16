import Link from "next/link";
import type { OsBrandIdentity, OsDashboardPayload } from "./os-dashboard-client";

type Module = {
  id: string;
  area: string;
  title: string;
  description: string;
  status: string;
  detail?: string;
  href?: string;
};

export function OsModuleGrid({
  dashboard,
  brand,
}: {
  dashboard: OsDashboardPayload | null;
  brand: OsBrandIdentity;
}) {
  const modules = getModules(dashboard, brand);
  const areas = ["Estrategia", "Growth", "Sales", "Intelligence", "Sistema"];

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/65 p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.19em] text-cyan-200">System map</p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-white">Módulos de Cometa OS</h2>
      </div>

      <div className="mt-5 grid gap-5">
        {areas.map((area) => {
          const areaModules = modules.filter((module) => module.area === area);
          if (!areaModules.length) return null;

          return (
            <section key={area} className="scroll-mt-5" aria-labelledby={`os-area-${area}`}>
              <h3 id={`os-area-${area}`} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {area}
              </h3>
              <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {areaModules.map((module) => (
                  <article
                    id={module.id}
                    key={module.id}
                    className="scroll-mt-5 rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.035]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-base font-semibold tracking-[-0.02em] text-white">{module.title}</h4>
                      <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                        {module.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{module.description}</p>
                    {module.detail ? <p className="mt-3 text-xs font-medium text-cyan-100">{module.detail}</p> : null}
                    {module.href ? (
                      <Link
                        href={module.href}
                        className="mt-4 inline-flex min-h-9 items-center text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                      >
                        Abrir →
                      </Link>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function getModules(dashboard: OsDashboardPayload | null, brand: OsBrandIdentity): Module[] {
  const query = `brandSlug=${encodeURIComponent(brand.slug)}`;
  const availability = dashboard?.dataAvailability;

  return [
    {
      id: "cuenta-digital",
      area: "Estrategia",
      title: "Cuenta Digital",
      description: "La vista empresarial de presencia, contexto y preparación de la cuenta.",
      status: dashboard?.brand.agentStatus || "Configurando",
      detail:
        dashboard && availability?.derived.readiness
          ? `Readiness ${dashboard.brand.agentScore}/100`
          : "Readiness no disponible",
    },
    {
      id: "trabajo-realizado",
      area: "Estrategia",
      title: "Trabajo realizado",
      description: "Seguimiento de cambios y avances visibles dentro del sistema operativo.",
      status: "En seguimiento",
      detail: dashboard?.latestRun?.created_at ? "Actividad reciente disponible" : "Sin actividad reciente disponible",
    },
    {
      id: "estrategia-mes",
      area: "Estrategia",
      title: "Estrategia",
      description: "Dirección mensual y decisiones de crecimiento aprobadas para la marca.",
      status: dashboard?.playbook ? "Disponible" : "Pendiente",
      detail: dashboard?.playbook?.updated_at ? "Playbook activo disponible" : undefined,
      href: `/mercury-hub?${query}`,
    },
    {
      id: "calendario-contenido",
      area: "Growth",
      title: "Calendario",
      description: "Planificación y ejecución de contenido dentro de Mercury.",
      status: "Abrir Mercury",
      href: `/mercury-hub?${query}`,
    },
    {
      id: "oportunidades",
      area: "Growth",
      title: "Oportunidades",
      description: "La lectura consolidada de oportunidades se habilitará con señales comerciales verificadas.",
      status: "Pendiente",
    },
    {
      id: "ventas-leads",
      area: "Sales",
      title: "Ventas / Leads",
      description: "Conversaciones, seguimiento y oportunidades comerciales activas.",
      status: availability?.counts.leads ? "Disponible" : "No disponible",
      detail: availability?.counts.leads ? `${dashboard?.counts.leads || 0} leads abiertos` : undefined,
      href: `/sales-ai/inbox?${query}`,
    },
    {
      id: "knowledge",
      area: "Sales",
      title: "Knowledge",
      description: "Catálogo, reglas y FAQs que dan contexto comercial a Sales AI.",
      status: availability?.derived.knowledge ? "Disponible" : "No disponible",
      detail: availability?.derived.knowledge ? `${dashboard?.brand.knowledge || 0}% preparado` : undefined,
      href: `/sales-ai/knowledge?${query}`,
    },
    {
      id: "agentes-ia",
      area: "Intelligence",
      title: "Agentes IA",
      description: "Configuración y capacidades de los agentes de Cometa para esta empresa.",
      status: "Disponible",
      href: `/sales-ai/agent-settings?${query}`,
    },
    {
      id: "learning",
      area: "Intelligence",
      title: "Learning",
      description: "Señales internas para mejorar el sistema con revisión humana.",
      status: availability?.counts.pendingInternalAlerts ? "Disponible" : "No disponible",
      detail: availability?.counts.pendingInternalAlerts
        ? `${dashboard?.counts.pendingInternalAlerts || 0} señales pendientes`
        : undefined,
      href: `/sales-ai/learning?${query}`,
    },
    {
      id: "conexiones",
      area: "Sistema",
      title: "Conexiones",
      description: "Canales e integraciones que amplían las señales disponibles para Cometa OS.",
      status: "Configurando",
    },
    {
      id: "reportes",
      area: "Sistema",
      title: "Reportes",
      description: "Lectura ejecutiva de resultados y aprendizajes cuando existan fuentes verificadas.",
      status: "Pendiente",
    },
    {
      id: "inventario",
      area: "Sistema",
      title: "Inventario",
      description: "La lectura OS de inventario se habilitará cuando sus señales operativas estén conectadas.",
      status: "Pendiente",
    },
  ];
}
