import Link from "next/link";
import { redirect } from "next/navigation";
import OsDashboardClient from "../components/os/os-dashboard-client";
import {
  BrandOsGuardError,
  requireBrandOsAccess,
} from "@/lib/brand-os/server";

export const dynamic = "force-dynamic";

export default async function CometaOsPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const rootHref = `/brand/${encodeURIComponent(brandSlug || "")}`;

  try {
    const access = await requireBrandOsAccess(brandSlug);

    return (
      <OsDashboardClient
        brand={{
          slug: access.brand.slug,
          name: access.brand.name,
          industry: access.brand.industry,
        }}
        commercialStatus={access.osAccess.status}
        isPlatformAdmin={access.isPlatformAdmin}
        bypassUsed={access.bypassUsed}
      />
    );
  } catch (error: unknown) {
    if (error instanceof BrandOsGuardError && error.status === 401) {
      redirect(`/login?next=${encodeURIComponent(`${rootHref}/os`)}`);
    }

    if (error instanceof BrandOsGuardError) {
      const state = getAccessState(error.code);

      return (
        <main className="flex min-h-screen items-center justify-center bg-[#060b18] p-6 text-slate-100">
          <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.045] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
            <p className="text-xs font-semibold tracking-[0.22em] text-cyan-200">COMETA OS</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white">
              {state.title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">{state.description}</p>
            <Link
              href={rootHref}
              className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-[#060b18]"
            >
              Volver al inicio
            </Link>
          </section>
        </main>
      );
    }

    throw error;
  }
}

function getAccessState(code: string) {
  if (code === "BRAND_OS_ACCESS_PAUSED") {
    return {
      title: "Cometa OS está pausado",
      description: "Cometa OS está temporalmente pausado para esta empresa.",
    };
  }

  if (code === "BRAND_OS_ACCESS_INACTIVE") {
    return {
      title: "Cometa OS no está activo",
      description: "Cometa OS no está activo para esta empresa.",
    };
  }

  if (code === "BRAND_OS_ACCESS_NOT_CONFIGURED") {
    return {
      title: "Cometa OS todavía no está habilitado",
      description: "Esta empresa aún no tiene Cometa OS configurado.",
    };
  }

  if (code === "BRAND_OS_MEMBERSHIP_REQUIRED") {
    return {
      title: "No tienes acceso a esta empresa",
      description: "Necesitas una membresía activa para abrir Cometa OS de esta empresa.",
    };
  }

  if (code === "BRAND_NOT_FOUND") {
    return {
      title: "Empresa no encontrada",
      description: "La empresa solicitada no existe o ya no está disponible.",
    };
  }

  return {
    title: "Cometa OS no está disponible",
    description: "No pudimos resolver el acceso de Cometa OS para esta empresa.",
  };
}
