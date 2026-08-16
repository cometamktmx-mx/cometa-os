"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OsCommandBar } from "./os-command-bar";
import { OsModuleGrid } from "./os-module-grid";
import { OsNavigation } from "./os-navigation";
import { OsNextActions } from "./os-next-actions";
import { OsOverview } from "./os-overview";
import { OsReadiness } from "./os-readiness";

export type OsBrandIdentity = {
  slug: string;
  name: string;
  industry: string;
};

export type OsDashboardBrand = OsBrandIdentity & {
  agentStatus: string;
  agentScore: number;
  autonomy: number;
  knowledge: number;
  openLeads: number;
  pendingLearning: number;
  appliedLearning: number;
  readyReplies: number;
  riskLevel: "Bajo" | "Medio" | "Alto";
  mainAction: string;
  actionDescription: string;
};

export type OsDataAvailability = {
  counts: {
    leads: boolean;
    readyReplies: boolean;
    knowledgeSources: boolean;
    catalogItems: boolean;
    businessRules: boolean;
    faqs: boolean;
    pendingInternalAlerts: boolean;
    appliedInternalAlerts: boolean;
  };
  derived: {
    knowledge: boolean;
    readiness: boolean;
    autonomy: boolean;
    risk: boolean;
    nextAction: boolean;
  };
};

export type OsDashboardPayload = {
  ok: true;
  brand: OsDashboardBrand;
  counts: {
    leads: number;
    readyReplies: number;
    knowledgeSources: number;
    catalogItems: number;
    businessRules: number;
    faqs: number;
    pendingInternalAlerts: number;
    appliedInternalAlerts: number;
  };
  dataAvailability: OsDataAvailability;
  latestRun: {
    action: string | null;
    action_status: string | null;
    created_at: string | null;
  } | null;
  playbook: {
    updated_at: string | null;
  } | null;
};

type OsCommercialStatus = "active" | "paused" | "inactive" | "not_configured";

export default function OsDashboardClient({
  brand,
  commercialStatus,
  isPlatformAdmin,
  bypassUsed,
}: {
  brand: OsBrandIdentity;
  commercialStatus: OsCommercialStatus;
  isPlatformAdmin: boolean;
  bypassUsed: boolean;
}) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<OsDashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadDashboard() {
      try {
        setIsLoading(true);
        setLoadError(null);

        const response = await fetch(
          `/api/brand-dashboard?brandSlug=${encodeURIComponent(brand.slug)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const payload: unknown = await response.json().catch(() => null);

        if (response.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(`/brand/${brand.slug}/os`)}`);
          return;
        }

        if (!response.ok || !isOsDashboardPayload(payload)) {
          throw new Error("No pudimos cargar las señales de Cometa OS.");
        }

        if (active) setDashboard(payload);
      } catch (error: unknown) {
        if (controller.signal.aborted || !active) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "No pudimos cargar las señales de Cometa OS."
        );
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      active = false;
      controller.abort();
    };
  }, [brand.slug, router]);

  const displayBrand = useMemo<OsDashboardBrand | null>(() => {
    if (!dashboard) return null;
    return dashboard.brand;
  }, [dashboard]);
  const systemState = getSystemState(dashboard, isLoading);

  return (
    <main className="min-h-screen overflow-hidden bg-[#060b18] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_22%_0%,rgba(8,145,178,0.16),transparent_27%),radial-gradient(circle_at_82%_72%,rgba(37,99,235,0.16),transparent_31%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-[1720px] xl:grid-cols-[248px_minmax(0,1fr)]">
        <OsNavigation brandSlug={brand.slug} />

        <section className="min-w-0 px-4 py-4 sm:px-6 sm:py-6 xl:px-8">
          <OsCommandBar
            brand={displayBrand || brand}
            systemState={systemState}
            commercialStatus={commercialStatus}
            showInternalAccess={isPlatformAdmin && bypassUsed}
          />

          {loadError ? (
            <section className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
              {loadError} Vuelve a intentarlo más tarde.
            </section>
          ) : null}

          <div className="mt-5 grid gap-5">
            <OsOverview dashboard={dashboard} isLoading={isLoading} />
            <OsNextActions dashboard={dashboard} />
            <OsReadiness dashboard={dashboard} />
            <OsModuleGrid dashboard={dashboard} brand={displayBrand || brand} />
          </div>
        </section>
      </div>
    </main>
  );
}

function getSystemState(
  dashboard: OsDashboardPayload | null,
  isLoading: boolean
): string {
  if (isLoading) return "Sincronizando";
  if (!dashboard?.dataAvailability.derived.readiness) return "Datos no disponibles";
  if (dashboard.brand.riskLevel === "Alto") return "Requiere atención";
  return dashboard.brand.agentStatus || "Configurando";
}

function isOsDashboardPayload(value: unknown): value is OsDashboardPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const payload = value as Record<string, unknown>;
  const brand = payload.brand as Record<string, unknown> | undefined;
  const availability = payload.dataAvailability as Record<string, unknown> | undefined;

  return (
    payload.ok === true &&
    Boolean(brand) &&
    typeof brand?.slug === "string" &&
    typeof brand?.name === "string" &&
    Boolean(availability) &&
    typeof availability?.counts === "object" &&
    typeof availability?.derived === "object"
  );
}
