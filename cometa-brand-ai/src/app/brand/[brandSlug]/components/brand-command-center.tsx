import { BrandCommandHeader } from "./brand-command-header";
import { EcosystemCore } from "./ecosystem-core";
import { EcosystemStatus } from "./ecosystem-status";
import {
  ProductCard,
  type ProductCardAction,
  type ProductStatusTone,
} from "./product-card";
import type { PassivePosProductAvailability } from "@/lib/pos/access";

type OsStatus = "active" | "paused" | "inactive" | "not_configured";

type Brand = {
  slug: string;
  name: string;
  industry: string;
};

export function BrandCommandCenter({
  brand,
  userEmail,
  isPlatformAdmin,
  osStatus,
  posAvailability,
}: {
  brand: Brand;
  userEmail: string | null;
  isPlatformAdmin: boolean;
  osStatus: OsStatus;
  posAvailability: PassivePosProductAvailability;
}) {
  const baseHref = `/brand/${encodeURIComponent(brand.slug)}`;
  const osAction = getOsAction({
    osStatus,
    isPlatformAdmin,
    href: `${baseHref}/os`,
  });
  const posAction = getPosAction({
    state: posAvailability.state,
    href: `${baseHref}/pos`,
  });
  const internalPosAction: ProductCardAction | undefined =
    isPlatformAdmin && !posAvailability.available
      ? {
          label: "Abrir entorno POS →",
          href: `${baseHref}/pos`,
          internal: true,
        }
      : undefined;

  return (
    <main className="min-h-screen overflow-hidden bg-[#050916] px-4 py-4 text-slate-100 sm:px-6 sm:py-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(6,182,212,0.14),transparent_27%),radial-gradient(circle_at_88%_18%,rgba(37,99,235,0.16),transparent_31%),radial-gradient(circle_at_55%_88%,rgba(20,184,166,0.08),transparent_28%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col">
        <BrandCommandHeader brandName={brand.name} userEmail={userEmail} />

        <div className="my-auto py-8 sm:py-10">
          <section className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Cometa Command Center</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-white sm:text-5xl">
              Tu empresa, conectada en un solo lugar.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
              Cometa reúne los sistemas que acompañan la estrategia y la operación de {brand.name}.
            </p>
          </section>

          <EcosystemCore
            brandName={brand.name}
            osStatus={osStatus}
            posState={posAvailability.state}
          />

          <section aria-label="Sistemas de Cometa" className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.16fr)_minmax(0,0.84fr)]">
            <ProductCard
              product="os"
              eyebrow="COMETA OS"
              title="El cerebro estratégico de tu empresa."
              description="Estrategia, inteligencia, Sales AI, agentes, automatización y crecimiento."
              status={getOsStatusLabel(osStatus)}
              statusTone={getOsStatusTone(osStatus)}
              primaryAction={osAction.primary}
              secondaryAction={osAction.secondary}
              unavailableCopy={osAction.unavailableCopy}
            />
            <ProductCard
              product="pos"
              eyebrow="COMETA POS"
              title="El motor operativo de tu negocio."
              description="Ventas, caja, inventario, clientes, fidelización e inteligencia operativa."
              status={getPosStatusLabel(posAvailability.state)}
              statusTone={getPosStatusTone(posAvailability.state)}
              primaryAction={posAction.primary}
              unavailableCopy={posAction.unavailableCopy}
              secondaryAction={internalPosAction}
              internalNote={
                internalPosAction
                  ? "Entorno interno. Al abrirlo conserva la inicialización actual de POS."
                  : undefined
              }
            />
          </section>

          <EcosystemStatus
            osStatus={osStatus}
            posState={posAvailability.state}
          />
        </div>
      </div>
    </main>
  );
}

function getOsAction({
  osStatus,
  isPlatformAdmin,
  href,
}: {
  osStatus: OsStatus;
  isPlatformAdmin: boolean;
  href: string;
}): {
  primary?: ProductCardAction;
  secondary?: ProductCardAction;
  unavailableCopy?: string;
} {
  if (osStatus === "active") {
    return { primary: { label: "Entrar a Cometa OS →", href } };
  }

  if (isPlatformAdmin) {
    return {
      secondary: { label: "Acceso interno →", href, internal: true },
      unavailableCopy: getOsUnavailableCopy(osStatus),
    };
  }

  return { unavailableCopy: getOsUnavailableCopy(osStatus) };
}

function getPosAction({
  state,
  href,
}: {
  state: PassivePosProductAvailability["state"];
  href: string;
}): {
  primary?: ProductCardAction;
  unavailableCopy?: string;
} {
  if (state === "active") {
    return { primary: { label: "Entrar a Cometa POS →", href } };
  }

  if (state === "preparation") {
    return {
      unavailableCopy:
        "Cometa POS estará disponible próximamente para la operación comercial de tu empresa.",
    };
  }

  return {
    unavailableCopy:
      "Cometa POS no está disponible para la operación comercial de esta empresa.",
  };
}

function getOsStatusLabel(status: OsStatus) {
  if (status === "active") return "Activo";
  if (status === "paused") return "Pausado";
  if (status === "inactive") return "No activo";
  return "Disponible";
}

function getOsStatusTone(status: OsStatus): ProductStatusTone {
  if (status === "active") return "active";
  if (status === "paused") return "paused";
  if (status === "inactive") return "inactive";
  return "available";
}

function getPosStatusLabel(
  status: PassivePosProductAvailability["state"]
) {
  if (status === "active") return "Activo";
  if (status === "preparation") return "En preparación";
  return "No disponible";
}

function getPosStatusTone(
  status: PassivePosProductAvailability["state"]
): ProductStatusTone {
  if (status === "active") return "active";
  if (status === "preparation") return "preparation";
  return "inactive";
}

function getOsUnavailableCopy(status: Exclude<OsStatus, "active">) {
  if (status === "paused") return "Cometa OS está temporalmente pausado para esta empresa.";
  if (status === "inactive") return "Cometa OS no está activo para esta empresa.";
  return "Cometa OS aún no está habilitado para esta empresa.";
}
