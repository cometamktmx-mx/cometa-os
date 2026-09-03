import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandCommandCenter } from "./components/brand-command-center";
import { BrandHomeHashRedirect } from "./components/brand-home-hash-redirect";
import {
  BrandOsGuardError,
  requireClientBrandAccess,
} from "@/lib/brand-os/server";
import { resolveBrandOsProductAccess } from "@/lib/brand-os/access";
import { getPassivePosProductAvailability } from "@/lib/pos/access";

export const dynamic = "force-dynamic";

export default async function BrandCommandCenterPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const safeRequestedSlug = encodeURIComponent(brandSlug || "");

  try {
    const access = await requireClientBrandAccess(brandSlug);
    const posAvailability = await getPassivePosProductAvailability(
      access.brand.slug
    );
    const osProductAccess = resolveBrandOsProductAccess({
      membershipActive: access.membershipActive,
      isPlatformAdmin: access.isPlatformAdmin,
      osAccess: access.osAccess,
    });

    return (
      <>
        <BrandHomeHashRedirect brandSlug={access.brand.slug} />
        <BrandCommandCenter
          brand={access.brand}
          userEmail={access.user.email}
          osStatus={osProductAccess.effectiveAccessAllowed ? "active" : access.osAccess.status}
          osAccessAllowed={osProductAccess.effectiveAccessAllowed}
          posAvailability={posAvailability}
        />
      </>
    );
  } catch (error: unknown) {
    if (error instanceof BrandOsGuardError && error.status === 401) {
      redirect(`/login?next=/brand/${safeRequestedSlug}`);
    }

    const isNotFound =
      error instanceof BrandOsGuardError && error.code === "BRAND_NOT_FOUND";
    const message = isNotFound
      ? "La empresa solicitada no existe o ya no está disponible."
      : "No tienes acceso para abrir esta empresa.";

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050916] p-6 text-slate-100">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.045] p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
          <p className="text-xs font-semibold tracking-[0.2em] text-cyan-200">COMETA</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Acceso no disponible</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">{message}</p>
          <Link
            href="/workspace"
            className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-[#050916]"
          >
            Volver al workspace
          </Link>
        </section>
      </main>
    );
  }
}
