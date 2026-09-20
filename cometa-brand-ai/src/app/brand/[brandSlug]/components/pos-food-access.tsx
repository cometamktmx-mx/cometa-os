"use client";

import Link from "next/link";
import { PosFoodOperations } from "./pos-food-operations";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { canAccessFoodPage, getFoodPageKind } from "@/lib/pos/surface-policy";
import { PosOperatorGate, type PosOperator } from "./pos-operator-gate";
import { PosTopbar } from "./pos-topbar";
import { PosSidebar, PosMobileSidebar } from "./pos-sidebar";
import { posThemeStyle, type PosBrand, type PosBranding, type PosUser } from "./pos-shell";
import { staffRoles, staffHasRole, staffHasAnyRole } from "@/lib/pos/staff-shared";
import { PosConnectionStatus } from "./pos-connection-status";

export function PosFoodAccess({ brand, user, pathname, entitlements, branding, children, onOperatorChange }: {
  brand: PosBrand; user: PosUser | null; pathname: string; entitlements: readonly string[];
  branding: PosBranding | null;
  children: ReactNode; onOperatorChange: (operator: PosOperator | null, required: boolean) => void;
}) {
  const router = useRouter();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const base = `/brand/${brand.slug}/pos`;
  return <main className="cometa-pos min-h-screen bg-[var(--pos-bg)] text-[var(--pos-text)]" data-pos-theme={branding?.theme_mode || "dark"} style={posThemeStyle(branding)}>
    <PosOperatorGate requireFood brandSlug={brand.slug} fallbackName={brand.name} onOperatorChange={onOperatorChange} onActionComplete={(actionName) => {
      setNavigationOpen(false);
      router.replace(actionName === "admin" ? `${base}/admin` : base);
      router.refresh();
    }}>
      {(data, action) => {
        const operator = data.session?.staff;
        if (!operator) return null;
        const kind = getFoodPageKind(pathname, brand.slug);
        const roles = staffRoles(operator);
        const admin = Boolean(data.adminMode && staffHasRole(operator, "ADMIN") && kind !== "operation");
        const allowed = canAccessFoodPage(kind, roles, Boolean(data.adminMode));
        const tool = allowed && (kind === "cash" || admin);
        async function navigate(actionName: "admin" | "operation" | "switch" | "lock") {
          try {
            await action(actionName);
          } catch { /* Gate displays the error and retains the failed action for retry. */ }
        }
        return <div data-food-state={admin ? "authenticated-admin" : "authenticated-operational"} className={admin ? "lg:grid lg:grid-cols-[240px_minmax(0,1fr)]" : ""}>
          {admin ? <PosSidebar brand={brand} pathname={pathname} isLoading={false} operator={operator} foodMode /> : null}
          <section className="min-w-0">
            <PosTopbar brand={brand} user={user} pathname={pathname} isLoading={false} operator={operator} operatorGateRequired foodOperational
              onOpenNavigation={() => setNavigationOpen(true)} showFoodNavigation={admin}
              foodLocationName={data.locations.find(location => location.id === operator.locationId)?.name || (data.locations.length === 1 ? data.locations[0].name : undefined)}
              showAdminAction={staffHasRole(operator, "ADMIN") && !admin} adminHref={`${base}/admin`}
              onAdminAction={() => navigate("admin")} onReturnToOperation={tool ? () => navigate("operation") : undefined}
              onOperatorAction={navigate} />
            <div className="px-4 md:px-8"><PosConnectionStatus brandSlug={brand.slug} /></div>
            {admin ? <PosMobileSidebar brand={brand} pathname={pathname} isLoading={false} operator={operator} foodMode open={navigationOpen} onClose={() => setNavigationOpen(false)} /> : null}
            <div className="p-4 md:p-8">
              {tool ? children : <FoodOperationalSurface operator={operator} base={base} entitlements={entitlements} branding={branding} />}
            </div>
          </section>
        </div>;
      }}
    </PosOperatorGate>
  </main>;
}

export function FoodOperationalSurface({ operator, base, entitlements, branding }: { operator: PosOperator; base: string; entitlements: readonly string[]; branding: PosBranding | null }) {
  const kitchen = staffRoles(operator).length === 1 && staffHasRole(operator, "KITCHEN");
  const cashier = staffHasRole(operator, "CASHIER");
  const title = kitchen ? "Cocina" : cashier ? "Caja" : "Salón";
  return <section className="mx-auto max-w-[1600px]">
    {kitchen || cashier ? <div className="flex flex-wrap items-center justify-between gap-3 py-5">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--pos-primary)]">Operación</p><h1 className="mt-2 text-3xl font-bold">{title}</h1></div>
      <span className="rounded-full bg-[var(--pos-success-soft)] px-4 py-2 text-xs font-semibold text-[var(--pos-success)]">Sesión activa</span>
    </div> : null}
    {cashier ? <section aria-label="Acciones de caja" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Link prefetch={false} href={base} className="rounded-xl border border-[var(--pos-line)] bg-[var(--pos-panel)] px-3 py-3 text-center text-sm font-semibold text-[var(--pos-text-primary)]">Cobrar cuenta</Link>
      <Link prefetch={false} href={`${base}/cash`} className="rounded-xl border border-[var(--pos-line)] bg-[var(--pos-panel)] px-3 py-3 text-center text-sm font-semibold text-[var(--pos-text-primary)]">Resumen de turno</Link>
      <Link prefetch={false} href={`${base}/cash#active-sessions`} className="rounded-xl border border-[var(--pos-line)] bg-[var(--pos-panel)] px-3 py-3 text-center text-sm font-semibold text-[var(--pos-text-primary)]">Movimientos</Link>
      <Link prefetch={false} href={`${base}/register`} className="rounded-xl bg-[var(--pos-primary)] px-3 py-3 text-center text-sm font-semibold text-[var(--pos-on-primary)]">Venta directa</Link>
    </section> : null}
    <PosFoodOperations key={operator.id} operator={operator} brandSlug={base.split("/")[2]} branding={branding} />
    {staffHasAnyRole(operator, ["ADMIN", "MANAGER", "CASHIER"]) ? <div className="mt-6 flex flex-wrap gap-3">
      {entitlements.includes("pos.cash") ? <Link prefetch={false} href={`${base}/cash`} className="pos-ui-focus rounded-lg border border-[var(--pos-line)] px-5 py-3 font-semibold">Abrir caja</Link> : null}
      {cashier && entitlements.includes("pos.sales") ? <Link prefetch={false} href={`${base}/register`} className="pos-ui-focus rounded-lg border border-[var(--pos-line)] px-5 py-3 font-semibold">Venta directa</Link> : null}
    </div> : null}
  </section>;
}
