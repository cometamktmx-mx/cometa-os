import Link from "next/link";
import type { OsBrandIdentity } from "./os-dashboard-client";

export function OsCommandBar({
  brand,
  systemState,
  commercialStatus,
  showInternalAccess,
}: {
  brand: OsBrandIdentity;
  systemState: string;
  commercialStatus: "active" | "paused" | "inactive" | "not_configured";
  showInternalAccess: boolean;
}) {
  const brandQuery = `brandSlug=${encodeURIComponent(brand.slug)}`;
  const actionClass =
    "inline-flex min-h-10 items-center rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm font-medium text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950";

  return (
    <header className="rounded-3xl border border-white/10 bg-slate-950/70 px-4 py-4 shadow-[0_20px_70px_rgba(0,0,0,0.24)] backdrop-blur sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-xs font-black text-cyan-100">
            OS
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-base font-semibold tracking-[-0.025em] text-white">{brand.name}</p>
              <span className="text-xs font-semibold tracking-[0.14em] text-cyan-200">COMETA OS</span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">Sistema operativo empresarial</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-medium text-slate-300">
            {systemState}
          </span>
          <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-medium text-cyan-100">
            OS {commercialStatus === "active" ? "activo" : commercialStatus}
          </span>
          {showInternalAccess ? (
            <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-xs font-medium text-violet-100">
              Acceso interno Cometa
            </span>
          ) : null}
        </div>
      </div>

      <nav aria-label="Acciones de Cometa OS" className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-4">
        <a className={actionClass} href="#calendario-contenido">Calendario</a>
        <a className={actionClass} href="#reportes">Reportes</a>
        <Link className={actionClass} href={`/sales-ai/inbox?${brandQuery}`}>Ventas / Leads</Link>
      </nav>
    </header>
  );
}
