"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  isEffectiveCommercialAccess,
  getLifecycleMessage,
  isSubscriptionLifecycle,
  type EffectiveCommercialAccess,
  type SubscriptionLifecycle,
} from "@/lib/pos/lifecycle";
import {
  isEffectiveEntitlementsResponse,
  type ProductEntitlementCode,
} from "@/lib/pos/entitlements";
import {
  isEffectiveCapabilities,
  isPosProfileFamily,
  type PosProfileFamily,
} from "@/lib/pos/capabilities";
import { PosSidebar } from "./pos-sidebar";
import { PosMobileSidebar } from "./pos-sidebar";
import { PosTopbar } from "./pos-topbar";

export type PosBrand = {
  slug: string;
  name: string;
  industry: string;
  brandId: string | null;
  brandExists: boolean;
};

export type PosUser = {
  id: string;
  email: string | null;
  role: "admin" | "client";
  isAdmin: boolean;
};

type PosContextValue = {
  brand: PosBrand;
  user: PosUser | null;
  isLoading: boolean;
  loadError: string | null;
  lifecycle: SubscriptionLifecycle | null;
  effectiveCommercialAccess: EffectiveCommercialAccess | null;
  effectiveEntitlements: ProductEntitlementCode[];
  profileCode: string | null;
  profileFamily: PosProfileFamily | null;
  effectiveCapabilities: string[];
};

const PosContext = createContext<PosContextValue | null>(null);

export function usePosContext() {
  const context = useContext(PosContext);

  if (!context) {
    throw new Error(
      "usePosContext debe utilizarse dentro de un componente PosShell."
    );
  }

  return context;
}

export default function PosShell({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  const rawBrandSlug =
    (params as Record<string, string | string[] | undefined>)?.brandSlug ??
    (params as Record<string, string | string[] | undefined>)?.slug ??
    "";

  const brandSlug = Array.isArray(rawBrandSlug)
    ? rawBrandSlug[0]
    : String(rawBrandSlug || "");

  const initialBrand = useMemo<PosBrand>(() => {
    return {
      slug: brandSlug || "brand-os",
      name: formatBrandName(brandSlug || "Brand OS"),
      industry: "Comercio",
      brandId: null,
      brandExists: false,
    };
  }, [brandSlug]);

  const [brand, setBrand] = useState<PosBrand>(initialBrand);
  const [user, setUser] = useState<PosUser | null>(null);
  const [loadedBrandSlug, setLoadedBrandSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lifecycle, setLifecycle] =
    useState<SubscriptionLifecycle | null>(null);
  const [effectiveCommercialAccess, setEffectiveCommercialAccess] =
    useState<EffectiveCommercialAccess | null>(null);
  const [effectiveEntitlements, setEffectiveEntitlements] =
    useState<ProductEntitlementCode[]>([]);
  const [profileCode, setProfileCode] = useState<string | null>(null);
  const [profileFamily, setProfileFamily] =
    useState<PosProfileFamily | null>(null);
  const [effectiveCapabilities, setEffectiveCapabilities] =
    useState<string[]>([]);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] =
    useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadPosContext() {
      if (!brandSlug) {
        setLoadError("No se encontró una marca válida en la URL.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setLoadError(null);
        setLoadedBrandSlug(null);
        setLifecycle(null);
        setEffectiveCommercialAccess(null);
        setEffectiveEntitlements([]);
        setProfileCode(null);
        setProfileFamily(null);
        setEffectiveCapabilities([]);

        const response = await fetch(
          `/api/pos/bootstrap?brandSlug=${encodeURIComponent(brandSlug)}`,
          { method: "GET", cache: "no-store" }
        );
        const data = await response.json();

        if (response.status === 401) {
          router.replace(
            `/login?next=${encodeURIComponent(`/brand/${brandSlug}/pos`)}`
          );
          return;
        }

        if (response.status === 403) {
          router.replace("/workspace");
          return;
        }

        if (
          !response.ok ||
          !data?.ok ||
          !data?.brand ||
          !isSubscriptionLifecycle(data.lifecycle) ||
          !isEffectiveCommercialAccess(data.effectiveCommercialAccess) ||
          !isEffectiveEntitlementsResponse(data.effectiveEntitlements) ||
          typeof data.profileCode !== "string" ||
          !isPosProfileFamily(data.profileFamily) ||
          !isEffectiveCapabilities(data.effectiveCapabilities)
        ) {
          throw new Error(
            data?.details ||
              data?.error ||
              "No se pudo cargar la información de Cometa POS."
          );
        }

        if (!isMounted) return;

        setBrand({
          slug: data.brand.slug || brandSlug,
          name: data.brand.name || initialBrand.name,
          industry: data.brand.industry || "Comercio",
          brandId: data.brand.id || null,
          brandExists: Boolean(data.brand.id),
        });

        if (data.user) {
          setUser({
            id: String(data.user.userId || ""),
            email: data.user.email || null,
            role: data.user.role === "admin" ? "admin" : "client",
            isAdmin: Boolean(data.user.isAdmin),
          });
        }

        setLifecycle(data.lifecycle);
        setEffectiveCommercialAccess(data.effectiveCommercialAccess);
        setEffectiveEntitlements(
          data.effectiveEntitlements.entitlements
        );
        setProfileCode(data.profileCode);
        setProfileFamily(data.profileFamily);
        setEffectiveCapabilities(data.effectiveCapabilities);
        setLoadedBrandSlug(brandSlug);
      } catch (error: unknown) {
        if (!isMounted) return;

        const message =
          error instanceof Error
            ? error.message
            : "Error cargando Cometa POS.";

        console.error("Cometa POS context error:", error);
        setLoadError(message);
        setLoadedBrandSlug(null);
        setLifecycle(null);
        setEffectiveCommercialAccess(null);
        setEffectiveEntitlements([]);
        setProfileCode(null);
        setProfileFamily(null);
        setEffectiveCapabilities([]);
        setBrand(initialBrand);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadPosContext();

    return () => {
      isMounted = false;
    };
  }, [brandSlug, initialBrand, router]);

  const contextValue = useMemo<PosContextValue>(() => {
    const belongsToCurrentBrand = loadedBrandSlug === brandSlug;
    return {
      brand: belongsToCurrentBrand ? brand : initialBrand,
      user,
      isLoading,
      loadError,
      lifecycle: belongsToCurrentBrand ? lifecycle : null,
      effectiveCommercialAccess: belongsToCurrentBrand
        ? effectiveCommercialAccess
        : null,
      effectiveEntitlements: belongsToCurrentBrand ? effectiveEntitlements : [],
      profileCode: belongsToCurrentBrand ? profileCode : null,
      profileFamily: belongsToCurrentBrand ? profileFamily : null,
      effectiveCapabilities: belongsToCurrentBrand ? effectiveCapabilities : [],
    };
  }, [
    brand,
    brandSlug,
    initialBrand,
    user,
    isLoading,
    loadError,
    loadedBrandSlug,
    lifecycle,
    effectiveCommercialAccess,
    effectiveEntitlements,
    profileCode,
    profileFamily,
    effectiveCapabilities,
  ]);

  const visibleLifecycle = loadedBrandSlug === brandSlug ? lifecycle : null;
  const visibleCommercialAccess = loadedBrandSlug === brandSlug
    ? effectiveCommercialAccess
    : null;
  const visibleBrand = loadedBrandSlug === brandSlug ? brand : initialBrand;
  const nativeLifecycleBlocked = Boolean(
    visibleLifecycle && !visibleLifecycle.accessAllowed
  );
  const commercialAccessBlocked = Boolean(
    visibleCommercialAccess && !visibleCommercialAccess.effective.accessAllowed
  );

  return (
    <PosContext.Provider value={contextValue}>
      <main className="cometa-pos min-h-screen bg-[var(--pos-shell)] text-[var(--pos-text-primary)]">
        <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)]">
          <PosSidebar
            brand={visibleBrand}
            pathname={pathname}
            isLoading={isLoading}
          />

          <section className="min-w-0 bg-[var(--pos-canvas)]">
            <PosTopbar
              brand={visibleBrand}
              user={user}
              pathname={pathname}
              isLoading={isLoading}
              onOpenNavigation={() =>
                setIsMobileNavigationOpen(true)
              }
            />

            <PosMobileSidebar
              brand={visibleBrand}
              pathname={pathname}
              isLoading={isLoading}
              open={isMobileNavigationOpen}
              onClose={() => setIsMobileNavigationOpen(false)}
            />

            {loadError ? (
              <div className="mx-4 mt-4 rounded-[var(--pos-radius-md)] bg-[var(--pos-warning-soft)] px-4 py-3 text-sm font-medium text-[var(--pos-warning)] md:mx-6 xl:mx-8">
                Cometa POS no pudo sincronizar toda la información de la marca.
                Detalle: {loadError}
              </div>
            ) : null}

            {visibleLifecycle ? (
              <LifecycleBanner
                brandSlug={visibleBrand.slug}
                lifecycle={visibleLifecycle}
                effectiveCommercialAccess={visibleCommercialAccess}
              />
            ) : null}

            <div className="p-4 md:p-6 xl:p-8">
              {visibleLifecycle && nativeLifecycleBlocked && commercialAccessBlocked && !isSubscriptionPath(pathname) ? (
                <PosCommercialLockedState
                  brandSlug={visibleBrand.slug}
                  lifecycle={visibleLifecycle}
                />
              ) : (
                children
              )}
            </div>
          </section>
        </div>
      </main>
    </PosContext.Provider>
  );
}

function PosCommercialLockedState({
  brandSlug,
  lifecycle,
}: {
  brandSlug: string;
  lifecycle: SubscriptionLifecycle;
}) {
  return (
    <section className="mx-auto flex min-h-[55vh] max-w-2xl items-center justify-center">
      <div className="w-full rounded-[var(--pos-radius-lg)] border border-amber-400/25 bg-[var(--pos-panel-raised)] p-6 text-center shadow-2xl shadow-black/20 sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/10 text-2xl text-amber-200">
          <span aria-hidden="true">!</span>
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
          Acceso operacional pausado
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--pos-text-primary)]">
          Cometa POS necesita atención comercial
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--pos-text-secondary)]">
          {getLifecycleMessage(lifecycle) ||
            "La suscripción no permite usar los módulos operacionales en este momento."}
        </p>
        <p className="mt-3 text-xs text-[var(--pos-text-muted)]">
          Estado efectivo: {lifecycle.effectiveStatus}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={`/brand/${brandSlug}/pos/subscription`}
            className="pos-ui-focus inline-flex min-h-11 items-center justify-center rounded-[var(--pos-radius-sm)] bg-white px-5 text-sm font-semibold text-slate-950"
          >
            Ver suscripción y activación
          </Link>
          <Link
            href="/workspace"
            className="pos-ui-focus inline-flex min-h-11 items-center justify-center rounded-[var(--pos-radius-sm)] border border-[var(--pos-line)] px-5 text-sm font-semibold text-[var(--pos-text-primary)]"
          >
            Cambiar de marca
          </Link>
        </div>
        <p className="mt-5 text-xs text-[var(--pos-text-muted)]">
          Tus ventas, productos, clientes e inventario permanecen guardados.
        </p>
      </div>
    </section>
  );
}

function isSubscriptionPath(pathname: string) {
  return pathname.endsWith("/pos/subscription");
}

function LifecycleBanner({
  brandSlug,
  lifecycle,
  effectiveCommercialAccess,
}: {
  brandSlug: string;
  lifecycle: SubscriptionLifecycle;
  effectiveCommercialAccess: EffectiveCommercialAccess | null;
}) {
  if (effectiveCommercialAccess?.effective.accessSource === "commercial_grant") {
    return null;
  }

  const message = getLifecycleMessage(lifecycle);
  if (!message || lifecycle.effectiveStatus === "active") return null;

  const urgent = !lifecycle.accessAllowed;
  const title = lifecycle.effectiveStatus === "trial"
    ? lifecycle.trial.expiringSoon
      ? "Tu prueba está por terminar"
      : "Prueba gratuita de Cometa POS"
    : lifecycle.effectiveStatus === "grace_period"
      ? "Periodo de gracia"
      : "Acción requerida";

  return (
    <div
      className={`mx-4 mt-4 flex flex-col gap-3 rounded-[var(--pos-radius-md)] border px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:mx-6 xl:mx-8 ${
        urgent
          ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
          : "border-[var(--pos-primary)]/20 bg-[var(--pos-primary-soft)] text-[var(--pos-text-primary)]"
      }`}
      role="status"
    >
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs opacity-80">{message}</p>
      </div>
      {(lifecycle.requiresActivation || lifecycle.effectiveStatus === "grace_period") ? (
        <Link
          href={`/brand/${brandSlug}/pos/subscription`}
          className="pos-ui-focus inline-flex min-h-10 shrink-0 items-center justify-center rounded-[var(--pos-radius-sm)] bg-white px-4 text-sm font-semibold text-slate-950 transition-opacity hover:opacity-90"
        >
          {lifecycle.effectiveStatus === "trial_expired"
            ? "Activar Cometa POS"
            : "Ver suscripción"}
        </Link>
      ) : null}
    </div>
  );
}

function formatBrandName(slug: string) {
  return String(slug || "Brand OS")
    .split("-")
    .filter(Boolean)
    .map((word) => {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}
