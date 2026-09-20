import Link from "next/link";
import { redirect } from "next/navigation";
import { PosApiError } from "@/lib/pos/server";
import { requirePosAdminSurfaceAccess } from "@/lib/pos/admin-access";
import { getPosMode } from "@/lib/pos/staff-server";

const ADMIN_LINKS = [
  ["Operadores", "staff"], ["Personalización", "settings/personalization"], ["Ventas", "sales"], ["Caja", "cash"], ["Productos", "products"],
  ["Modificadores", "admin/modifiers"], ["Inventario", "inventory"], ["Clientes", "customers"], ["Fidelización", "loyalty"],
  ["Reportes", "reports"], ["Equipo", "team"], ["Configuración", "settings"], ["Suscripción", "subscription"],
] as const;

export default async function PosAdminPage({ params }: { params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params;
  let food = false;
  try {
    const context = await requirePosAdminSurfaceAccess(brandSlug);
    food = await getPosMode(context) !== "RETAIL";
  } catch (error) {
    if (error instanceof PosApiError && error.status === 401) redirect(`/login?next=${encodeURIComponent(`/brand/${brandSlug}/pos/admin`)}`);
    if (error instanceof PosApiError && error.status === 403) redirect(`/brand/${brandSlug}/pos`);
    throw error;
  }
  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--pos-primary-text)]">Administración POS</p><h1 className="mt-2 text-3xl font-black text-[var(--pos-text)]">Controla tu operación</h1><p className="mt-2 max-w-xl text-sm text-[var(--pos-text-muted)]">Configuración, equipo y herramientas de gestión de tu negocio.</p></div>
        <Link href={`/brand/${brandSlug}/pos`} className="rounded-xl border border-[var(--pos-border)] px-4 py-2.5 text-sm font-semibold text-[var(--pos-text-secondary)] hover:bg-white/5">Volver a operación</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ADMIN_LINKS.map(([label, route]) => <Link prefetch={false} key={route || "home"} href={`/brand/${brandSlug}/pos/${food && route === "inventory" ? "admin/inventory" : route}`} className="rounded-2xl border border-[var(--pos-border)] bg-[var(--pos-surface-2)] p-5 transition hover:border-cyan-300/30 hover:bg-[var(--pos-surface-2)]"><span className="text-base font-semibold text-[var(--pos-text)]">{label}</span><span className="mt-2 block text-xs text-[var(--pos-text-muted)]">Abrir sección administrativa</span></Link>)}</div>
    </section>
  );
}
