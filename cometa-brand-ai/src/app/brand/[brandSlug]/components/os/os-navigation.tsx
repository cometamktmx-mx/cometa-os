import Link from "next/link";

type OsNavItem = {
  label: string;
  href: string;
};

export function OsNavigation({ brandSlug }: { brandSlug: string }) {
  const base = `/brand/${encodeURIComponent(brandSlug)}/os`;
  const brandQuery = `brandSlug=${encodeURIComponent(brandSlug)}`;
  const navigationLinkClass =
    "rounded-lg px-2.5 py-1.5 text-sm text-slate-400 transition hover:bg-cyan-300/10 hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300";
  const groups: { label: string; items: OsNavItem[] }[] = [
    { label: "Resumen", items: [{ label: "Command Center", href: `${base}#resumen` }] },
    {
      label: "Estrategia",
      items: [
        { label: "Cuenta Digital", href: `${base}#cuenta-digital` },
        { label: "Estrategia", href: `${base}#estrategia-mes` },
        { label: "Trabajo realizado", href: `${base}#trabajo-realizado` },
      ],
    },
    {
      label: "Growth",
      items: [
        { label: "Calendario", href: `${base}#calendario-contenido` },
        { label: "Oportunidades", href: `${base}#oportunidades` },
      ],
    },
    {
      label: "Sales",
      items: [
        { label: "Ventas / Leads", href: `/sales-ai/inbox?${brandQuery}` },
        { label: "Knowledge", href: `/sales-ai/knowledge?${brandQuery}` },
      ],
    },
    {
      label: "Intelligence",
      items: [
        { label: "Agentes IA", href: `/sales-ai/agent-settings?${brandQuery}` },
        { label: "Learning", href: `/sales-ai/learning?${brandQuery}` },
      ],
    },
    {
      label: "Sistema",
      items: [
        { label: "Conexiones", href: `${base}#conexiones` },
        { label: "Reportes", href: `${base}#reportes` },
      ],
    },
  ];

  return (
    <aside className="border-b border-white/8 bg-[#070d1b]/90 px-4 py-4 xl:sticky xl:top-0 xl:h-screen xl:border-b-0 xl:border-r xl:px-5 xl:py-6">
      <div className="flex items-center justify-between xl:block">
        <Link href={`/brand/${encodeURIComponent(brandSlug)}`} className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-300/10 text-xs font-black text-cyan-100">C</span>
          COMETA OS
        </Link>
        <Link href={`/brand/${encodeURIComponent(brandSlug)}`} className="text-xs font-medium text-slate-500 transition hover:text-cyan-200">
          Inicio
        </Link>
      </div>

      <nav aria-label="Navegación de Cometa OS" className="mt-4 flex gap-5 overflow-x-auto pb-1 xl:flex-col xl:gap-5 xl:overflow-visible xl:pb-0">
        {groups.map((group) => (
          <div key={group.label} className="min-w-max xl:min-w-0">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{group.label}</p>
            <div className="flex gap-1 xl:flex-col">
              {group.items.map((item) => (
                <Link key={item.label} href={item.href} className={navigationLinkClass}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
