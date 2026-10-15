import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getPassivePosProductAvailability } from "@/lib/pos/access";
import { BrandOsGuardError, requireBrandOsAccess } from "@/lib/brand-os/server";
import { OsShell } from "./components/os-shell";

export const dynamic = "force-dynamic";

export default async function OsLayout({ children, params }: { children: ReactNode; params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params;
  let access: Awaited<ReturnType<typeof requireBrandOsAccess>> | null = null;
  let posAvailable = false;
  let denied = false;
  try {
    access = await requireBrandOsAccess(brandSlug);
    const pos = await getPassivePosProductAvailability(access.brand.slug);
    posAvailable = pos.available;
  } catch (error: unknown) {
    if (error instanceof BrandOsGuardError && error.status === 401) redirect(`/login?next=${encodeURIComponent(`/brand/${brandSlug}/os`)}`);
    if (error instanceof BrandOsGuardError) denied = true;
    else throw error;
  }
  if (denied || !access) return <div className="mx-auto max-w-xl py-16"><div className="os-card"><p className="os-label">COMETA OS</p><h1 className="mt-3 text-2xl font-semibold">No tienes acceso a esta empresa</h1><p className="mt-2 text-sm text-[var(--os-text-muted)]">Esta sección no está disponible para tu cuenta.</p></div></div>;
  return <OsShell brand={{ slug: access.brand.slug, name: access.brand.name }} posAvailable={posAvailable}>{children}</OsShell>;
}
