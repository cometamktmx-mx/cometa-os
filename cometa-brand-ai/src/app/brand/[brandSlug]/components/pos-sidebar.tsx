"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PosBrand } from "./pos-shell";
import { PosIcon, type PosIconName } from "./pos-icons";
import { PosDrawer } from "./pos-ui";

export type PosNavItem = {
  label: string;
  route: string;
  icon: PosIconName;
  requiresTeamPermission?: boolean;
  section:
    | "Operación"
    | "Catálogo"
    | "Clientes"
    | "Inteligencia"
    | "Sistema";
};

export const POS_NAV_ITEMS: PosNavItem[] = [
  { label: "Resumen", route: "", icon: "home", section: "Operación" },
  { label: "Nueva venta", route: "register", icon: "sale", section: "Operación" },
  { label: "Caja", route: "cash", icon: "cash", section: "Operación" },
  { label: "Ventas", route: "sales", icon: "receipt", section: "Operación" },
  { label: "Productos", route: "products", icon: "product", section: "Catálogo" },
  { label: "Inventario", route: "inventory", icon: "inventory", section: "Catálogo" },
  { label: "Clientes", route: "customers", icon: "customer", section: "Clientes" },
  { label: "Fidelización", route: "loyalty", icon: "loyalty", section: "Clientes" },
  { label: "Reportes", route: "reports", icon: "report", section: "Inteligencia" },
  { label: "Suscripción", route: "subscription", icon: "settings", section: "Sistema" },
  { label: "Configuración", route: "settings", icon: "settings", section: "Sistema" },
  { label: "Equipo", route: "team", icon: "customer", section: "Sistema", requiresTeamPermission: true },
];

const teamPermissionCache = new Map<string, boolean>();
const teamPermissionRequests = new Map<string, Promise<boolean>>();

const NAV_SECTIONS: PosNavItem["section"][] = [
  "Operación",
  "Catálogo",
  "Clientes",
  "Inteligencia",
  "Sistema",
];

export function buildPosHref(brandSlug: string, route: string) {
  const baseHref = `/brand/${brandSlug}/pos`;
  return route ? `${baseHref}/${route}` : baseHref;
}

export function PosSidebar({
  brand,
  pathname,
  isLoading,
}: {
  brand: PosBrand;
  pathname: string;
  isLoading: boolean;
}) {
  const canManageTeam = usePosTeamPermission(brand.slug);

  return (
    <aside className="sticky top-0 hidden h-screen flex-col bg-[var(--pos-shell)] lg:flex">
      <div className="flex h-16 items-center border-b border-[var(--pos-line-subtle)] px-4">
        <BrandMark brand={brand} />
      </div>

      <div className="border-b border-[var(--pos-line-subtle)] px-4 py-4">
        <BrandContext brand={brand} isLoading={isLoading} />
      </div>

      <div className="pos-ui-scrollbar flex-1 overflow-y-auto px-3 py-4">
        <PosNavigation brand={brand} pathname={pathname} canManageTeam={canManageTeam} />
      </div>

      <SidebarFooter brand={brand} />
    </aside>
  );
}

export function PosMobileSidebar({
  brand,
  pathname,
  isLoading,
  open,
  onClose,
}: {
  brand: PosBrand;
  pathname: string;
  isLoading: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const canManageTeam = usePosTeamPermission(brand.slug);

  return (
    <PosDrawer
      open={open}
      onClose={onClose}
      side="left"
      width="small"
      title="COMETA POS"
      description={isLoading ? "Sincronizando marca" : brand.name}
      className="pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="border-b border-[var(--pos-line-subtle)] pb-4">
        <BrandContext brand={brand} isLoading={isLoading} />
      </div>
      <div className="pt-4">
        <PosNavigation brand={brand} pathname={pathname} onNavigate={onClose} canManageTeam={canManageTeam} />
      </div>
      <div className="mt-5 border-t border-[var(--pos-line-subtle)] pt-4">
        <BackToCometaLink brand={brand} onNavigate={onClose} />
      </div>
    </PosDrawer>
  );
}

function PosNavigation({
  brand,
  pathname,
  onNavigate,
  canManageTeam,
}: {
  brand: PosBrand;
  pathname: string;
  onNavigate?: () => void;
  canManageTeam: boolean;
}) {
  return (
    <nav aria-label="Navegación de Cometa POS">
      {NAV_SECTIONS.map((section) => {
        const items = POS_NAV_ITEMS.filter(
          (item) => item.section === section && (!item.requiresTeamPermission || canManageTeam)
        );

        if (items.length === 0) return null;

        return (
          <div key={section} className="mb-5 last:mb-0">
            <p className="mb-1.5 px-3 text-[11px] font-medium text-[var(--pos-text-muted)]">
              {section}
            </p>
            <div className="grid gap-1">
              {items.map((item) => {
                const href = buildPosHref(brand.slug, item.route);
                const active = isActivePath({
                  pathname,
                  href,
                  isHome: item.route === "",
                });
                const primary = item.route === "register";

                return (
                  <Link
                    key={item.route || "home"}
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`pos-ui-focus group relative flex min-h-10 items-center gap-3 rounded-[var(--pos-radius-sm)] px-3 text-[13px] font-medium transition-colors duration-150 ${
                      active
                        ? "bg-white/[0.07] font-semibold text-[var(--pos-text-primary)]"
                        : primary
                          ? "bg-[var(--pos-primary)] font-semibold text-slate-950 hover:bg-[var(--pos-primary-hover)]"
                          : "text-[var(--pos-text-secondary)] hover:bg-white/[0.04] hover:text-[var(--pos-text-primary)]"
                    }`}
                  >
                    {active ? (
                      <span
                        className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--pos-primary)]"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--pos-radius-xs)] ${
                        active
                          ? "bg-[var(--pos-primary-soft)] text-[var(--pos-primary)]"
                          : primary
                            ? "bg-slate-950/10 text-slate-950"
                            : "text-[var(--pos-text-muted)] group-hover:text-current"
                      }`}
                    >
                      <PosIcon name={item.icon} className="h-4 w-4" />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function usePosTeamPermission(brandSlug: string) {
  const [canManageTeam, setCanManageTeam] = useState(
    () => teamPermissionCache.get(brandSlug) || false
  );

  useEffect(() => {
    let active = true;
    setCanManageTeam(teamPermissionCache.get(brandSlug) || false);

    async function loadPermission() {
      const cached = teamPermissionCache.get(brandSlug);
      if (cached !== undefined) return cached;

      const pending = teamPermissionRequests.get(brandSlug);
      if (pending) return pending;

      const request = fetch(`/api/pos/bootstrap?brandSlug=${encodeURIComponent(brandSlug)}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as unknown;
          const permissions =
            payload && typeof payload === "object"
              ? (payload as { membership?: { permissions?: unknown } | null }).membership?.permissions
              : null;
          const allowed = response.ok && Array.isArray(permissions) && permissions.includes("pos.team.manage");
          teamPermissionCache.set(brandSlug, allowed);
          return allowed;
        })
        .catch(() => false)
        .finally(() => teamPermissionRequests.delete(brandSlug));

      teamPermissionRequests.set(brandSlug, request);
      return request;
    }

    void loadPermission().then((allowed) => {
      if (active) setCanManageTeam(allowed);
    });

    return () => {
      active = false;
    };
  }, [brandSlug]);

  return canManageTeam;
}

function BrandMark({ brand }: { brand: PosBrand }) {
  return (
    <Link
      href={buildPosHref(brand.slug, "")}
      className="pos-ui-focus flex min-w-0 items-center gap-3 rounded-[var(--pos-radius-sm)]"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-primary)]">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-950" />
        <span className="absolute right-1.5 top-1.5 h-1 w-1 rounded-full bg-white/80" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold tracking-[-0.025em] text-[var(--pos-text-primary)]">
          COMETA
        </span>
        <span className="block text-[10px] font-semibold tracking-[0.16em] text-[var(--pos-primary)]">
          POS
        </span>
      </span>
    </Link>
  );
}

function BrandContext({
  brand,
  isLoading,
}: {
  brand: PosBrand;
  isLoading: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] bg-[var(--pos-panel-raised)] text-xs font-bold text-[var(--pos-text-primary)]">
        {getInitials(brand.name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-[var(--pos-text-primary)]">
          {isLoading ? "Sincronizando..." : brand.name}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-[var(--pos-text-muted)]">
          {brand.industry}
        </span>
      </span>
    </div>
  );
}

function SidebarFooter({ brand }: { brand: PosBrand }) {
  return (
    <div className="border-t border-[var(--pos-line-subtle)] p-3">
      <BackToCometaLink brand={brand} />
    </div>
  );
}

function BackToCometaLink({
  brand,
  onNavigate,
}: {
  brand: PosBrand;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={`/brand/${brand.slug}`}
      onClick={onNavigate}
      className="pos-ui-focus flex min-h-10 items-center gap-3 rounded-[var(--pos-radius-sm)] px-3 text-[13px] font-medium text-[var(--pos-text-muted)] transition-colors duration-150 hover:bg-white/[0.04] hover:text-[var(--pos-text-primary)]"
    >
      <span className="flex h-7 w-7 items-center justify-center">
        <PosIcon name="grid" className="h-4 w-4" />
      </span>
      Volver a Cometa OS
    </Link>
  );
}

export function isActivePath({
  pathname,
  href,
  isHome,
}: {
  pathname: string;
  href: string;
  isHome: boolean;
}) {
  if (isHome) return pathname === href || pathname === `${href}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getInitials(name: string) {
  const words = String(name || "Cometa POS").split(" ").filter(Boolean);
  const first = words[0]?.charAt(0) || "C";
  const second = words[1]?.charAt(0) || "P";
  return `${first}${second}`.toUpperCase();
}
