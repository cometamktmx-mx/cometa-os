"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import type { CSSProperties } from "react";
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
import { type PosOperator } from "./pos-operator-gate";
import { PosFoodAccess } from "./pos-food-access";
import { getPosSurfaceState, isFoodProfile } from "@/lib/pos/surface-policy";
import { offlineGet, offlinePut, offlineScope } from "@/lib/pos/offline-storage";
import { PosConnectionStatus } from "./pos-connection-status";

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

export type PosBranding = {
  display_name: string;
  logo_url: string | null;
  legal_name?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  ticket_footer?: string | null;
  receipt_message?: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  text_color: string;
  theme_mode?: "dark" | "light" | "system" | null;
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
  currentOperator: PosOperator | null;
  branding: PosBranding | null;
  updateBranding: (next: PosBranding | null) => void;
  networkState: "ONLINE" | "OFFLINE" | "SYNCING" | "PENDING" | "SYNC_ERROR";
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
  const [currentOperator, setCurrentOperator] = useState<PosOperator | null>(null);
  const [branding, setBranding] = useState<PosBranding | null>(null);
  const [networkState, setNetworkState] = useState<PosContextValue["networkState"]>(() => typeof navigator !== "undefined" && !navigator.onLine ? "OFFLINE" : "ONLINE");
  const lastRevalidation = useRef(0);
  const revalidationInFlight = useRef<Promise<void> | null>(null);
  const [operatorGateRequired, setOperatorGateRequired] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const handleOperatorChange = useCallback((operator: PosOperator | null, required: boolean) => {
    setCurrentOperator(operator);
    setOperatorGateRequired(required);
  }, []);

  const updateBranding = useCallback((next: PosBranding | null) => {
    setBranding((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    if (next) void offlinePut("branding", offlineScope(brandSlug), next);
  }, [brandSlug]);

  useEffect(() => {
    let isMounted = true;

    async function loadPosContext() {
      if (!brandSlug) {
        setLoadError("No se encontrÃ³ una marca vÃ¡lida en la URL.");
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
        setBranding(null);

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
              "No se pudo cargar la informaciÃ³n de Cometa POS."
          );
        }

        if (!isMounted) return;

        void offlinePut("bootstrap", offlineScope(brandSlug), data);

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
        updateBranding(data.branding || null);
        setLoadedBrandSlug(brandSlug);
        setNetworkState("ONLINE");
      } catch (error: unknown) {
        if (!isMounted) return;

        const cached = await offlineGet<Record<string, unknown>>("bootstrap", offlineScope(brandSlug));
        if (cached?.value && typeof cached.value === "object") {
          const data = cached.value as Record<string, unknown>;
          const cachedBrand = data.brand as { slug?: unknown };
          if (cachedBrand.slug === brandSlug && data.branding) {
            setBrand(data.brand as PosBrand);
            updateBranding(data.branding as PosBranding);
            setLoadedBrandSlug(brandSlug);
            setNetworkState("OFFLINE");
            setIsLoading(false);
            return;
          }
        }

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
        setBranding(null);
        setBrand(initialBrand);
        setNetworkState("OFFLINE");
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
  }, [brandSlug, initialBrand, router, retryVersion, updateBranding]);

  const revalidate = useCallback(async () => {
    if (!brandSlug || Date.now() - lastRevalidation.current < 15000 || revalidationInFlight.current) return;
    lastRevalidation.current = Date.now();
    const promise = (async () => {
      setNetworkState("SYNCING");
      try {
        const response = await fetch(`/api/pos/bootstrap?brandSlug=${encodeURIComponent(brandSlug)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("BOOTSTRAP_REVALIDATION_FAILED");
        const data = await response.json();
        if (data?.branding && JSON.stringify(data.branding) !== JSON.stringify(branding)) updateBranding(data.branding);
        void offlinePut("bootstrap", offlineScope(brandSlug), data);
        setNetworkState("ONLINE");
      } catch { setNetworkState(navigator.onLine ? "SYNC_ERROR" : "OFFLINE"); }
      finally { revalidationInFlight.current = null; }
    })();
    revalidationInFlight.current = promise; await promise;
  }, [brandSlug, branding, updateBranding]);

  useEffect(() => {
    const onOnline = () => { void revalidate(); };
    const onFocus = () => { void revalidate(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void revalidate(); };
    const onOffline = () => setNetworkState("OFFLINE");
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline); window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => void revalidate(), 60000);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); window.clearInterval(timer); };
  }, [revalidate]);

  useEffect(() => { if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js"); const link = document.createElement("link"); link.rel = "manifest"; link.href = "/manifest.json"; document.head.appendChild(link); return () => { link.remove(); }; }, []);

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
      currentOperator,
      branding: belongsToCurrentBrand ? branding : null,
      updateBranding,
      networkState,
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
    currentOperator,
    branding,
    updateBranding,
    networkState,
  ]);

  const visibleLifecycle = loadedBrandSlug === brandSlug ? lifecycle : null;
  const visibleCommercialAccess = loadedBrandSlug === brandSlug
    ? effectiveCommercialAccess
    : null;
  const visibleBrand = loadedBrandSlug === brandSlug ? brand : initialBrand;
  const foodProfile = isFoodProfile(profileCode);
  const surfaceState = getPosSurfaceState({
    pathname, brandSlug,
    ready: !isLoading && !loadError && loadedBrandSlug === brandSlug,
    commercialAccessAllowed: visibleCommercialAccess?.effective.accessAllowed === true,
    entitlements: loadedBrandSlug === brandSlug ? effectiveEntitlements : [],
  });

  if (foodProfile && surfaceState === "operation") {
    return <PosContext.Provider value={contextValue}><PosFoodAccess key={brandSlug} brand={visibleBrand} user={user} pathname={pathname} entitlements={effectiveEntitlements} branding={branding} onOperatorChange={handleOperatorChange}>{children}</PosFoodAccess></PosContext.Provider>;
  }

  const showSidebar = !foodProfile;
  return (
    <PosContext.Provider value={contextValue}>
      <main className="cometa-pos min-h-screen bg-[var(--pos-bg)] text-[var(--pos-text)]" data-pos-theme={branding?.theme_mode || "dark"} style={posThemeStyle(branding)}>
        <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)]">
          {showSidebar ? <PosSidebar brand={visibleBrand} pathname={pathname} isLoading={isLoading} operator={currentOperator} /> : null}

          <section className={`min-w-0 bg-[var(--pos-canvas)] ${showSidebar ? "" : "lg:col-span-2"}`}>
            <PosTopbar
              brand={visibleBrand}
              user={user}
              pathname={pathname}
              isLoading={isLoading}
              operator={currentOperator}
              operatorGateRequired={operatorGateRequired}
              foodOperational={false}
              showAdminAction={false}
              adminHref={`/brand/${visibleBrand.slug}/pos/admin`}
              onOperatorAction={async (action) => {
                const response = await fetch("/api/pos/operator-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandSlug: visibleBrand.slug, action }) });
                if (!response.ok) {
                  setLoadError("No se pudo cerrar la sesiÃ³n operacional.");
                  return;
                }
                setCurrentOperator(null);
                router.refresh();
              }}
              onOpenNavigation={() =>
                setIsMobileNavigationOpen(true)
              }
            />
            <PosConnectionStatus brandSlug={visibleBrand.slug} />

            {showSidebar ? <PosMobileSidebar
              brand={visibleBrand}
              pathname={pathname}
              isLoading={isLoading}
              open={isMobileNavigationOpen}
              onClose={() => setIsMobileNavigationOpen(false)}
              operator={currentOperator}
            /> : null}

            {loadError ? (
              <div className="mx-4 mt-4 rounded-[var(--pos-radius-md)] bg-[var(--pos-warning-soft)] px-4 py-3 text-sm font-medium text-[var(--pos-warning)] md:mx-6 xl:mx-8">
                Cometa POS no pudo sincronizar toda la informaciÃ³n de la marca.
                Detalle: {loadError}
                <button className="pos-ui-focus ml-3 underline" onClick={() => setRetryVersion((value) => value + 1)}>Reintentar</button>
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
              {surfaceState === "recovery" ? children : surfaceState === "loading" ? (
                <p className="py-12 text-center text-sm text-[var(--pos-text-muted)]">
                  {loadError ? "No se pudo preparar Cometa POS." : "Preparando Cometa POSâ€¦"}
                </p>
              ) : surfaceState === "blocked" && visibleLifecycle ? (
                <PosCommercialLockedState
                  brandSlug={visibleBrand.slug}
                  lifecycle={visibleLifecycle}
                />
              ) : children}
            </div>
          </section>
        </div>
      </main>
    </PosContext.Provider>
  );
}

export function posThemeStyle(branding: PosBranding | null): CSSProperties {
  const primary = normalizeHex(branding?.primary_color, "#22D3EE");
  const accent = normalizeHex(branding?.accent_color, "#34D399");
  return {
    "--pos-brand-primary": primary,
    "--pos-brand-accent": accent,
    "--pos-brand-on-primary": contrastText(primary),
  } as CSSProperties;
}

function normalizeHex(value: string | null | undefined, fallback: string) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{3}$/i.test(raw)) return `#${raw.slice(1).split("").map((part) => part + part).join("")}`.toUpperCase();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toUpperCase() : fallback;
}

function contrastText(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 155 ? "#07101C" : "#FFFFFF";
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
          Cometa POS necesita atenciÃ³n comercial
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--pos-text-secondary)]">
          {getLifecycleMessage(lifecycle) ||
            "La suscripciÃ³n no permite usar los mÃ³dulos operacionales en este momento."}
        </p>
        <p className="mt-3 text-xs text-[var(--pos-text-muted)]">
          Estado efectivo: {lifecycle.effectiveStatus}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={`/brand/${brandSlug}/pos/subscription`}
            className="pos-ui-focus inline-flex min-h-11 items-center justify-center rounded-[var(--pos-radius-sm)] bg-white px-5 text-sm font-semibold text-slate-950"
          >
            Ver suscripciÃ³n y activaciÃ³n
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
      ? "Tu prueba estÃ¡ por terminar"
      : "Prueba gratuita de Cometa POS"
    : lifecycle.effectiveStatus === "grace_period"
      ? "Periodo de gracia"
      : "AcciÃ³n requerida";

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
            : "Ver suscripciÃ³n"}
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
