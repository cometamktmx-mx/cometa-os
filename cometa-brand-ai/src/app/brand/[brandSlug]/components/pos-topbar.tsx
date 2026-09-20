"use client";

import Link from "next/link";
import type { PosBrand, PosUser } from "./pos-shell";
import {
  buildPosHref,
  isActivePath,
  POS_NAV_ITEMS,
} from "./pos-sidebar";
import { PosIcon } from "./pos-icons";
import { posStaffRoleLabel, staffRoles } from "@/lib/pos/staff-shared";
import type { PosOperator } from "./pos-operator-gate";

export function PosTopbar({
  brand,
  user,
  pathname,
  isLoading,
  onOpenNavigation,
  operator,
  operatorGateRequired,
  onOperatorAction,
  foodOperational,
  showAdminAction,
  adminHref,
  onAdminAction,
  onReturnToOperation,
  showFoodNavigation,
  foodLocationName,
}: {
  brand: PosBrand;
  user: PosUser | null;
  pathname: string;
  isLoading: boolean;
  onOpenNavigation: () => void;
  operator: PosOperator | null;
  operatorGateRequired: boolean;
  onOperatorAction: (action: "switch" | "lock") => Promise<void>;
  foodOperational?: boolean;
  showAdminAction?: boolean;
  adminHref?: string;
  onAdminAction?: () => Promise<void>;
  onReturnToOperation?: () => Promise<void>;
  showFoodNavigation?: boolean;
  foodLocationName?: string;
}) {
  const currentItem = getCurrentNavItem({
    brandSlug: brand.slug,
    pathname,
  });
  const isRegister = currentItem?.route === "register";

  if (foodOperational && operator) return <header className="pos-chrome sticky top-0 z-40 border-b border-white/[0.08] bg-[#0d1822]/95 px-4 py-4 shadow-[0_8px_32px_-20px_#000] backdrop-blur-xl md:px-8">
    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
      <div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200 shadow-[0_0_25px_-10px_#22d3ee]"><PosIcon name="sparkles" className="h-6 w-6" /></span><div className="min-w-0"><p className="text-xs font-bold tracking-[0.2em] text-white">COMETA <span className="text-cyan-300">POS</span></p><p className="mt-1 break-words text-xs font-medium text-slate-400">{brand.name}</p></div></div>
      <div className="hidden items-center gap-5 text-xs xl:flex"><span className="flex items-center gap-2 text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Operación en vivo</span>{foodLocationName ? <span className="flex items-center gap-2 border-l border-white/10 pl-5 text-slate-300"><PosIcon name="branch" className="h-4 w-4 text-slate-500" />{foodLocationName}</span> : null}</div>
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-bold text-cyan-200">{operator.name.split(/\s+/).map(part=>part[0]).slice(0,2).join("")}</span><div><p className="text-sm font-semibold text-white">{operator.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{staffRoles(operator).map(posStaffRoleLabel).join(" / ")} · Sesión activa</p></div></div>
    </div>
    <nav aria-label="Acciones del operador" className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3 text-[11px] font-semibold text-slate-300 [&_button]:min-h-11 [&_button]:rounded-xl [&_button]:border [&_button]:border-white/10 [&_button]:bg-white/[0.025] [&_button]:px-4 [&_button]:transition-colors [&_button]:hover:bg-white/[0.08] md:justify-end">
      {showFoodNavigation ? <button className="pos-ui-focus lg:hidden" onClick={onOpenNavigation}>Menú</button> : null}
      {onReturnToOperation ? <button className="pos-ui-focus" onClick={() => void onReturnToOperation()}>Volver a operación</button> : null}
      <button className="pos-ui-focus" onClick={() => void onOperatorAction("switch")}>Cambiar operador</button>
      <button className="pos-ui-focus" onClick={() => void onOperatorAction("lock")}>Bloquear</button>
      {showAdminAction && onAdminAction ? <button className="pos-ui-focus text-cyan-200" onClick={() => void onAdminAction()}>Administrar POS</button> : null}
    </nav>
  </header>;

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-[var(--pos-line-subtle)] bg-[color:var(--pos-canvas)]/95 backdrop-blur-xl">
      <div className="flex h-full items-center justify-between gap-3 px-4 md:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenNavigation}
            className="pos-ui-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] text-[var(--pos-text-secondary)] transition-colors duration-150 hover:bg-white/[0.05] hover:text-[var(--pos-text-primary)] lg:hidden"
            aria-label="Abrir navegación de Cometa POS"
          >
            <PosIcon name="menu" className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2 text-[11px] text-[var(--pos-text-muted)]">
              <span className="hidden font-medium sm:inline">{isLoading ? "Sincronizando" : brand.name}</span>
              <span className="hidden text-[var(--pos-line-strong)] sm:inline">/</span>
              <span className="truncate">Cometa POS</span>
            </div>
            <h1 className="mt-0.5 truncate text-lg font-bold tracking-[-0.025em] text-[var(--pos-text-primary)] md:text-xl">
              {currentItem?.label || "Operaciones"}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {operatorGateRequired && operator ? (
            <div className="hidden items-center gap-2 rounded-xl border border-[var(--pos-line-subtle)] bg-white/[0.04] px-3 py-1.5 md:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold text-white">{operator.name} · {staffRoles(operator).map(posStaffRoleLabel).join(" / ")}</span>
              <button type="button" onClick={() => void onOperatorAction("switch")} className="ml-2 text-[11px] text-cyan-300 hover:text-cyan-200">Cambiar usuario</button>
              <button type="button" onClick={() => void onOperatorAction("lock")} className="text-[11px] text-slate-400 hover:text-white">Bloquear</button>
            </div>
          ) : null}
          {user ? (
            <div className="hidden min-w-0 items-center gap-2.5 pr-2 md:flex">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--pos-radius-pill)] bg-[var(--pos-panel-raised)] text-[11px] font-bold text-[var(--pos-text-primary)]">
                {user.isAdmin ? "AD" : "CL"}
              </span>
              <span className="hidden max-w-44 min-w-0 2xl:block">
                <span className="block truncate text-xs font-semibold text-[var(--pos-text-primary)]">
                  {user.isAdmin ? "Administrador" : "Cliente"}
                </span>
                {user.email ? (
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--pos-text-muted)]">
                    {user.email}
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}

          {showAdminAction && adminHref ? <Link href={adminHref} className="pos-ui-focus hidden min-h-10 items-center rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] px-3 text-xs font-semibold text-[var(--pos-text-primary)] sm:inline-flex">Administrar POS</Link> : null}
          {!foodOperational && !isRegister ? (
            <Link
              href={buildPosHref(brand.slug, "register")}
              className="pos-ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary)] px-3 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-[var(--pos-primary-hover)] sm:px-4"
            >
              <PosIcon name="sale" className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva venta</span>
              <span className="sm:hidden">Vender</span>
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function getCurrentNavItem({
  brandSlug,
  pathname,
}: {
  brandSlug: string;
  pathname: string;
}) {
  return POS_NAV_ITEMS.find((item) => {
    const href = buildPosHref(brandSlug, item.route);
    return isActivePath({
      pathname,
      href,
      isHome: item.route === "",
    });
  });
}
