"use client";

import Link from "next/link";
import type { PosBrand, PosUser } from "./pos-shell";
import {
  buildPosHref,
  isActivePath,
  POS_NAV_ITEMS,
} from "./pos-sidebar";
import { PosIcon } from "./pos-icons";

export function PosTopbar({
  brand,
  user,
  pathname,
  isLoading,
  onOpenNavigation,
}: {
  brand: PosBrand;
  user: PosUser | null;
  pathname: string;
  isLoading: boolean;
  onOpenNavigation: () => void;
}) {
  const currentItem = getCurrentNavItem({
    brandSlug: brand.slug,
    pathname,
  });
  const isRegister = currentItem?.route === "register";

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

          {!isRegister ? (
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
