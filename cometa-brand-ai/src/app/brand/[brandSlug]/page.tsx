"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type RiskLevel = "Bajo" | "Medio" | "Alto";
type AccessType = "view" | "edit" | "soon";

type NavItem = {
  code: string;
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
  access?: AccessType;
};

type BrandData = {
  slug: string;
  name: string;
  industry: string;
  headline: string;
  description: string;
  agentStatus: string;
  agentScore: number;
  autonomy: number;
  knowledge: number;
  openLeads: number;
  pendingLearning: number;
  appliedLearning?: number;
  readyReplies: number;
  riskLevel: RiskLevel;
  mainAction: string;
  actionDescription: string;
};

const genericBrand: BrandData = {
  slug: "brand-os",
  name: "Brand OS",
  industry: "Sistema comercial",
  headline: "Tu sistema operativo comercial está en preparación.",
  description:
    "Cometa OS está organizando contexto, catálogo, reglas, conexiones y datos comerciales para que la marca pueda operar con inteligencia, claridad y control humano.",
  agentStatus: "Configuración",
  agentScore: 0,
  autonomy: 0,
  knowledge: 0,
  openLeads: 0,
  pendingLearning: 0,
  appliedLearning: 0,
  readyReplies: 0,
  riskLevel: "Medio",
  mainAction: "Actualizar información comercial",
  actionDescription:
    "Esta marca necesita información real de negocio para que los agentes IA puedan operar sin inventar datos.",
};

export default function BrandHomePage() {
  const router = useRouter();
  const params = useParams();

  const rawBrandSlug =
    (params as any)?.brandSlug ?? (params as any)?.slug ?? "";

  const brandSlug = Array.isArray(rawBrandSlug)
    ? rawBrandSlug[0]
    : String(rawBrandSlug || "");

  const initialBrand = useMemo<BrandData>(() => {
    return {
      ...genericBrand,
      slug: brandSlug || "brand-os",
      name: formatBrandName(brandSlug || "Brand OS"),
    };
  }, [brandSlug]);

  const [brand, setBrand] = useState<BrandData>(initialBrand);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentHash, setCurrentHash] = useState("");

  useEffect(() => {
    function syncHash() {
      setCurrentHash(window.location.hash || "");
    }

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => {
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadBrandDashboard() {
      try {
        setIsLoading(true);
        setLoadError(null);

        const res = await fetch(
          `/api/brand-dashboard?brandSlug=${encodeURIComponent(brandSlug)}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const data = await res.json();

        if (res.status === 401) {
          router.replace(
            `/login?next=${encodeURIComponent(`/brand/${brandSlug}`)}`
          );
          return;
        }

        if (res.status === 403) {
          router.replace("/workspace");
          return;
        }

        if (!res.ok || !data?.ok || !data?.brand) {
          throw new Error(
            data?.details ||
              data?.error ||
              "No se pudo cargar la información de la marca."
          );
        }

        if (!isMounted) return;

        setBrand({
          ...initialBrand,
          ...data.brand,
          slug: data.brand.slug || brandSlug,
          name: data.brand.name || initialBrand.name,
          industry: data.brand.industry || initialBrand.industry,
        });
      } catch (error: any) {
        if (!isMounted) return;

        console.error("Brand dashboard load error:", error);
        setLoadError(error?.message || "Error cargando dashboard de marca.");
        setBrand(initialBrand);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (brandSlug) {
      loadBrandDashboard();
    }

    return () => {
      isMounted = false;
    };
  }, [brandSlug, initialBrand, router]);

  const brandQuery = `brandSlug=${encodeURIComponent(brand.slug)}`;

  const nav: NavItem[] = [
    {
      code: "IN",
      label: "Resumen",
      href: `/brand/${brand.slug}`,
      active: currentHash === "",
      access: "view",
    },
    {
      code: "CD",
      label: "Cuenta Digital",
      href: `/brand/${brand.slug}#cuenta-digital`,
      active: currentHash === "#cuenta-digital",
      access: "view",
    },
    {
      code: "TR",
      label: "Trabajo Realizado",
      href: `/brand/${brand.slug}#trabajo-realizado`,
      active: currentHash === "#trabajo-realizado",
      access: "view",
    },
    {
      code: "MC",
      label: "Estrategia",
      href: `/brand/${brand.slug}#estrategia-mes`,
      active: currentHash === "#estrategia-mes",
      access: "view",
    },
    {
      code: "CA",
      label: "Calendario de contenido",
      href: `/brand/${brand.slug}#calendario-contenido`,
      active: currentHash === "#calendario-contenido",
      access: "view",
    },
    {
      code: "SA",
      label: "Ventas / Leads",
      href: `/sales-ai/inbox?${brandQuery}`,
      active: false,
      access: "edit",
    },
    {
      code: "AI",
      label: "Agentes IA",
      href: `/sales-ai/knowledge?${brandQuery}`,
      active: false,
      access: "edit",
    },
    {
      code: "CX",
      label: "Conexiones",
      href: `/brand/${brand.slug}#conexiones`,
      active: currentHash === "#conexiones",
      access: "edit",
    },
    {
      code: "RP",
      label: "Reportes",
      href: `/brand/${brand.slug}#reportes`,
      active: currentHash === "#reportes",
      access: "view",
    },
    {
      code: "IV",
      label: "Inventario",
      href: `/brand/${brand.slug}#inventario`,
      active: currentHash === "#inventario",
      disabled: true,
      access: "soon",
    },
    {
      code: "OP",
      label: "Oportunidades",
      href: `/brand/${brand.slug}#oportunidades`,
      active: currentHash === "#oportunidades",
      disabled: true,
      access: "soon",
    },
  ];

  return (
    <main className="min-h-screen bg-[#f2f7fb] text-slate-950">
      <section className="mx-auto grid min-h-screen w-full max-w-[1800px] grid-cols-1 gap-4 p-4 xl:grid-cols-[238px_minmax(0,1fr)_390px]">
        <BrandDock nav={nav} brand={brand} />

        <section className="flex min-w-0 flex-col gap-4">
          {loadError ? <LoadWarning message={loadError} /> : null}

          <BrandHero brand={brand} isLoading={isLoading} />

          <BrandMetrics brand={brand} isLoading={isLoading} />

          <DigitalAccountDashboard brand={brand} />

          <WorkDoneAndStrategy brand={brand} />

          <MercuryContentCalendar brand={brand} />

          <BrandOperatingSystem brand={brand} />

          <NextActionBlock brand={brand} />

          <BrandModules brand={brand} />

          <FutureCommercialSystem brand={brand} />
        </section>

        <aside className="sticky top-4 hidden h-fit min-w-0 flex-col gap-4 xl:flex">
          <TopControls brandSlug={brand.slug} />

          <AgentStatusCard brand={brand} isLoading={isLoading} />

          <RecommendedActions brand={brand} />

          <SystemPrinciple />
        </aside>
      </section>
    </main>
  );
}

function LoadWarning({ message }: { message: string }) {
  return (
    <div className="rounded-[26px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700">
      No se pudo cargar información real desde Supabase. Detalle: {message}
    </div>
  );
}

function BrandDock({ nav, brand }: { nav: NavItem[]; brand: BrandData }) {
  return (
    <aside className="hidden rounded-[34px] border border-white bg-white/90 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur xl:flex xl:flex-col">
      <Link
        href={`/brand/${brand.slug}`}
        className="flex items-center gap-3 rounded-[26px] bg-slate-50 px-3 py-3 transition hover:bg-cyan-50"
      >
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-slate-950 shadow-xl shadow-cyan-400/20">
          <div className="absolute h-7 w-7 rounded-full bg-cyan-400 blur-[6px]" />
          <div className="relative h-7 w-7 rounded-full bg-gradient-to-br from-cyan-300 via-emerald-400 to-slate-950" />
        </div>

        <div className="min-w-0">
          <p className="text-lg font-black leading-none tracking-[-0.06em] text-slate-950">
            cometa
          </p>
          <p className="text-lg font-black leading-none tracking-[-0.06em] text-slate-950">
            OS
          </p>
        </div>
      </Link>

      <nav className="mt-7 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {nav.map((item) => {
          const className = `flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
            item.active
              ? "border border-cyan-200 bg-cyan-50 text-slate-950 shadow-sm shadow-cyan-950/5"
              : item.disabled
              ? "cursor-not-allowed text-slate-300 opacity-70"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
          }`;

          const content = (
            <>
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[10px] font-black ${
                  item.active
                    ? "bg-white text-cyan-700 shadow-sm"
                    : item.disabled
                    ? "bg-slate-50 text-slate-300"
                    : "bg-slate-50 text-slate-400"
                }`}
              >
                {item.code}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-black">
                  {item.label}
                </span>

                <AccessPill access={item.access} />
              </span>
            </>
          );

          if (item.disabled) {
            return (
              <button key={item.code} disabled className={className}>
                {content}
              </button>
            );
          }

          return (
            <Link key={item.code} href={item.href} className={className}>
              {content}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
            {getInitials(brand.name)}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-800">
              {brand.name}
            </p>
            <p className="truncate text-xs font-bold text-slate-400">
              {brand.industry}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-[22px] bg-emerald-50 px-3 py-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />

        <div className="min-w-0">
          <p className="text-xs font-bold text-emerald-700">Sistema</p>
          <p className="truncate text-xs font-black text-emerald-950">
            {brand.agentStatus}
          </p>
        </div>
      </div>
    </aside>
  );
}

function AccessPill({ access }: { access?: AccessType }) {
  if (access === "edit") {
    return (
      <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
        Editable
      </span>
    );
  }

  if (access === "soon") {
    return (
      <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-700">
        Próximo
      </span>
    );
  }

  return (
    <span className="mt-1 inline-flex rounded-full bg-cyan-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-700">
      Visual
    </span>
  );
}

function BrandHero({
  brand,
  isLoading,
}: {
  brand: BrandData;
  isLoading: boolean;
}) {
  const brandQuery = `brandSlug=${encodeURIComponent(brand.slug)}`;

  return (
    <header
      id="resumen"
      className="relative overflow-hidden rounded-[38px] bg-slate-950 p-7 text-white shadow-[0_30px_100px_rgba(15,23,42,0.20)] md:p-8"
    >
      <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-cyan-400/25 blur-[90px]" />
      <div className="absolute bottom-[-160px] left-[25%] h-72 w-72 rounded-full bg-emerald-400/15 blur-[95px]" />

      <div className="relative z-10 grid gap-8 2xl:grid-cols-[minmax(0,1fr)_390px] 2xl:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white">
              Cuenta Digital
            </span>

            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
              {isLoading ? "Sincronizando" : brand.agentStatus}
            </span>

            <span
              className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${riskClass(
                brand.riskLevel,
                true
              )}`}
            >
              Riesgo {brand.riskLevel}
            </span>
          </div>

          <p className="mt-8 text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
            {brand.industry}
          </p>

          <h1 className="mt-3 max-w-5xl text-5xl font-black leading-[0.92] tracking-[-0.085em] md:text-6xl 2xl:text-[76px]">
            {brand.name}
            <br />
            Dashboard Digital
          </h1>

          <p className="mt-6 max-w-4xl text-[17px] font-semibold leading-8 text-slate-300">
            Cometa OS te muestra qué está pasando con tu cuenta digital, qué
            trabajo se está realizando, qué estrategia está activa, dónde está tu
            calendario de contenido y qué información necesitan los agentes IA
            para operar con seguridad.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={`/brand/${brand.slug}#calendario-contenido`}
              className="flex h-14 items-center justify-center rounded-2xl bg-cyan-300 px-6 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
            >
              Ver calendario de contenido →
            </Link>

            <Link
              href={`/sales-ai/inbox?${brandQuery}`}
              className="flex h-14 items-center justify-center rounded-2xl bg-white px-6 text-sm font-black text-slate-950 transition hover:bg-cyan-100"
            >
              Abrir ventas / leads →
            </Link>

            <Link
              href={`/sales-ai/knowledge?${brandQuery}`}
              className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-sm font-black text-white transition hover:bg-white/10"
            >
              Editar información IA
            </Link>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Preparación del sistema
          </p>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-5xl font-black leading-[0.9] tracking-[-0.09em]">
                {isLoading ? "..." : brand.agentScore}
              </h2>

              <p className="mt-2 text-sm font-bold text-slate-300">
                Score operativo
              </p>
            </div>

            <ScoreRing value={brand.agentScore} />
          </div>

          <div className="mt-6 grid gap-3">
            <ProgressLine label="Autonomía IA" value={brand.autonomy} />
            <ProgressLine label="Información aprobada" value={brand.knowledge} />
          </div>
        </div>
      </div>
    </header>
  );
}

function BrandMetrics({
  brand,
  isLoading,
}: {
  brand: BrandData;
  isLoading: boolean;
}) {
  const metrics = [
    { label: "Autonomía IA", value: `${brand.autonomy}%`, code: "AU" },
    { label: "Información IA", value: `${brand.knowledge}%`, code: "AI" },
    { label: "Leads abiertos", value: brand.openLeads, code: "LD" },
    { label: "Respuestas listas", value: brand.readyReplies, code: "RP" },
    { label: "Alertas internas", value: brand.pendingLearning, code: "AL" },
  ];

  return (
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-5">
      {metrics.map((metric) => (
        <article
          key={metric.label}
          className="min-w-0 rounded-[28px] border border-white bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-xs font-black text-cyan-700">
              {metric.code}
            </div>

            <p className="min-w-0 truncate text-right text-3xl font-black leading-none tracking-[-0.08em] text-slate-950 md:text-4xl">
              {isLoading ? "..." : metric.value}
            </p>
          </div>

          <p className="mt-4 truncate text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            {metric.label}
          </p>
        </article>
      ))}
    </section>
  );
}

function DigitalAccountDashboard({ brand }: { brand: BrandData }) {
  return (
    <section
      id="cuenta-digital"
      className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]"
    >
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Cuenta Digital
          </p>

          <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
            Estado general de {brand.name}
          </h2>
        </div>

        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-700">
          Solo visualización
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AccountSignalCard
          code="IG"
          title="Instagram"
          description="Señales de presencia, contenido, consistencia y oportunidad."
          status="En monitoreo"
        />
        <AccountSignalCard
          code="FB"
          title="Facebook"
          description="Actividad, comunidad, mensajes, pauta y confianza digital."
          status="En monitoreo"
        />
        <AccountSignalCard
          code="WA"
          title="WhatsApp"
          description="Leads, intención comercial, seguimiento y cierre."
          status={`${brand.openLeads} leads`}
          featured
        />
        <AccountSignalCard
          code="WEB"
          title="Web / Catálogo"
          description="Confianza, conversión, información y puntos de fuga."
          status="Revisión"
        />
      </div>
    </section>
  );
}

function WorkDoneAndStrategy({ brand }: { brand: BrandData }) {
  return (
    <section className="grid gap-4 2xl:grid-cols-2">
      <article
        id="trabajo-realizado"
        className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
          Trabajo Realizado
        </p>

        <h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-slate-950">
          Cambios y acciones de Cometa
        </h2>

        <p className="mt-4 text-sm font-semibold leading-7 text-slate-500">
          Este espacio es para que el cliente vea qué se está haciendo con su
          cuenta: publicaciones, ajustes, optimizaciones, revisión de leads,
          cambios de estrategia y acciones completadas.
        </p>

        <div className="mt-6 grid gap-3">
          <FlowStep number="01" title="Contenido y presencia digital revisados" />
          <FlowStep number="02" title="Señales comerciales analizadas" />
          <FlowStep number="03" title="Información IA pendiente de actualización" />
          <FlowStep number="04" title="Siguiente acción recomendada definida" />
        </div>
      </article>

      <article
        id="estrategia-mes"
        className="rounded-[38px] border border-cyan-100 bg-cyan-50 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.05)]"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
          Estrategia del Mes
        </p>

        <h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-slate-950">
          Estrategia visible aprobada por Cometa
        </h2>

        <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
          La estrategia muestra la dirección mensual aprobada. El calendario de
          contenido se consulta en el apartado de MERCURY para ver publicaciones,
          reels, historias, fechas, estados y comentarios.
        </p>

        <div className="mt-6 rounded-[30px] bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Enfoque actual
          </p>

          <p className="mt-3 text-2xl font-black leading-tight tracking-[-0.055em] text-slate-950">
            Mejorar claridad comercial, calidad de leads y seguimiento de ventas.
          </p>

          <p className="mt-3 text-sm font-semibold leading-7 text-slate-500">
            La información editable del cliente alimenta a los agentes, pero la
            decisión estratégica final se mantiene bajo control de Cometa.
          </p>
        </div>
      </article>
    </section>
  );
}

function MercuryContentCalendar({ brand }: { brand: BrandData }) {
  const brandQuery = `brandSlug=${encodeURIComponent(brand.slug)}`;

  return (
    <section
      id="calendario-contenido"
      className="rounded-[38px] border border-cyan-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]"
    >
      <div className="flex flex-col gap-5 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
            Calendario de contenido · MERCURY
          </p>

          <h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-slate-950">
            Planeación mensual de contenido
          </h2>

          <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-500">
            Aquí el cliente puede consultar qué piezas están planeadas, en qué
            etapa van, qué falta por revisar y dónde puede dejar comentarios sin
            tocar la estrategia interna de Cometa.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/mercury-hub?${brandQuery}`}
            className="flex h-13 items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-cyan-700"
          >
            Abrir calendario en MERCURY →
          </Link>

          <span className="flex h-13 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-cyan-700">
            Vista controlada
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <CalendarStageCard
          code="BR"
          title="Brief listo"
          description="Ideas y piezas con dirección clara para diseñar o grabar."
          status="Planeación"
        />

        <CalendarStageCard
          code="DI"
          title="Diseño"
          description="Contenido en producción visual, edición o armado creativo."
          status="Proceso"
          featured
        />

        <CalendarStageCard
          code="RV"
          title="Revisión"
          description="Piezas listas para validar cambios, comentarios o ajustes."
          status="Revisión"
        />

        <CalendarStageCard
          code="PR"
          title="Programado"
          description="Contenido aprobado y listo para publicación."
          status="Salida"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article className="rounded-[30px] bg-slate-950 p-6 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Qué ve el cliente
          </p>

          <h3 className="mt-4 text-3xl font-black leading-tight tracking-[-0.06em]">
            Publicaciones, reels, historias, estados y comentarios.
          </h3>

          <p className="mt-4 text-sm font-semibold leading-7 text-slate-300">
            MERCURY funciona como el espacio de ejecución: no reemplaza la
            estrategia, la aterriza en piezas concretas que el cliente puede
            revisar de forma ordenada.
          </p>
        </article>

        <article className="rounded-[30px] border border-slate-200 bg-slate-50 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Regla de acceso
          </p>

          <p className="mt-3 text-2xl font-black leading-tight tracking-[-0.055em] text-slate-950">
            El cliente revisa y comenta. Cometa controla ejecución y estrategia.
          </p>

          <p className="mt-3 text-sm font-semibold leading-7 text-slate-500">
            Esto evita que el cliente vea módulos incompletos o edite decisiones
            internas que todavía deben mantenerse bajo control del equipo.
          </p>
        </article>
      </div>
    </section>
  );
}

function BrandOperatingSystem({ brand }: { brand: BrandData }) {
  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Ventas / Leads
          </p>

          <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
            Sistema comercial de la marca
          </h2>
        </div>

        <span
          className={`w-fit rounded-full border px-5 py-2 text-xs font-black uppercase tracking-[0.16em] ${riskClass(
            brand.riskLevel
          )}`}
        >
          Riesgo {brand.riskLevel}
        </span>
      </div>

      <div className="mt-6 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[34px] bg-slate-950 p-6 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            SALES AI en operación
          </p>

          <h3 className="mt-4 max-w-3xl text-4xl font-black leading-[0.98] tracking-[-0.07em]">
            Atiende, califica, responde y aprende con información aprobada.
          </h3>

          <p className="mt-5 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
            El agente usa información comercial autorizada. El cliente puede
            modificar datos del negocio, productos, reglas, FAQs y restricciones,
            pero no cambia la lógica interna del agente.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <DarkMini label="Score" value={String(brand.agentScore)} />
            <DarkMini label="Estado" value={brand.agentStatus} />
            <DarkMini label="Control" value="Humano" />
            <DarkMini label="Riesgo" value={brand.riskLevel} />
          </div>
        </div>

        <div className="grid gap-3">
          <FlowStep number="01" title="Recibe conversaciones" />
          <FlowStep number="02" title="Detecta intención comercial" />
          <FlowStep number="03" title="Consulta información aprobada" />
          <FlowStep number="04" title="Responde, aprende o escala" />
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <WorkSignalCard
          code="AT"
          title="Atiende"
          description="Responde dudas frecuentes, primeros mensajes y solicitudes básicas."
        />

        <WorkSignalCard
          code="CL"
          title="Califica"
          description="Detecta intención, presupuesto, ciudad, urgencia y etapa del comprador."
          featured
        />

        <WorkSignalCard
          code="ES"
          title="Escala"
          description="No inventa precios, stock, pagos, descuentos, envíos ni promesas."
        />
      </div>
    </section>
  );
}

function NextActionBlock({ brand }: { brand: BrandData }) {
  const actionHref = getActionHref(brand);

  return (
    <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <article className="min-w-0 rounded-[34px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)] md:p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
          Acción recomendada
        </p>

        <div className="mt-5 max-w-4xl">
          <h2 className="text-4xl font-black leading-[0.98] tracking-[-0.07em] text-slate-950 md:text-5xl">
            {brand.mainAction}
          </h2>

          <p className="mt-5 max-w-3xl text-sm font-semibold leading-7 text-slate-500 md:text-base">
            {brand.actionDescription}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={actionHref}
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-slate-950 px-6 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-cyan-700"
            >
              Abrir acción →
            </Link>

            <Link
              href={`/brand/${brand.slug}#calendario-contenido`}
              className="inline-flex h-14 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 px-6 text-sm font-black text-cyan-700 transition hover:bg-cyan-100"
            >
              Ver calendario →
            </Link>
          </div>
        </div>
      </article>

      <article className="min-w-0 rounded-[34px] border border-cyan-100 bg-cyan-50 p-6 md:p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
          Regla base
        </p>

        <p className="mt-4 text-3xl font-black leading-tight tracking-[-0.055em] text-slate-950">
          El cliente alimenta la información. Cometa controla la estrategia.
        </p>

        <p className="mt-4 text-sm font-semibold leading-7 text-slate-600 md:text-base">
          Los agentes pueden operar mejor cuando tienen datos reales, conexiones
          activas y reglas comerciales claras.
        </p>
      </article>
    </section>
  );
}

function BrandModules({ brand }: { brand: BrandData }) {
  const brandQuery = `brandSlug=${encodeURIComponent(brand.slug)}`;

  const modules = [
    {
      code: "CA",
      title: "Calendario de contenido",
      description:
        "Planeación mensual, publicaciones, reels, historias, estados, revisión y comentarios.",
      href: `/mercury-hub?${brandQuery}`,
      status: "Visual",
      access: "Visual",
    },
    {
      code: "SA",
      title: "Ventas / Leads",
      description:
        "Conversaciones, leads, seguimiento, respuestas listas y oportunidades.",
      href: `/sales-ai/inbox?${brandQuery}`,
      status: `${brand.openLeads} leads`,
      access: "Editable",
    },
    {
      code: "AG",
      title: "Configurar agente SALES AI",
      description:
        "Tono, servicios, reglas de venta, seguimientos, límites y escalamiento humano.",
      href: `/sales-ai/agent-settings?${brandQuery}`,
      status: "Editable",
      access: "Editable",
    },
    {
      code: "CX",
      title: "Conexiones",
      description:
        "Redes sociales, WhatsApp, Meta, Shopify, POS y fuentes de datos.",
      href: `/brand/${brand.slug}#conexiones`,
      status: "Configurar",
      access: "Editable",
    },
    {
      code: "RP",
      title: "Reportes",
      description:
        "Resultados, avances, trabajo realizado, aprendizajes y siguientes pasos.",
      href: `/brand/${brand.slug}#reportes`,
      status: "Visual",
      access: "Visual",
    },
  ];

  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Accesos del cliente
          </p>

          <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
            Qué puede ver y modificar {brand.name}
          </h2>
        </div>

        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
          Acceso controlado
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {modules.map((module) => (
          <Link
            key={module.code}
            href={module.href}
            className="group rounded-[30px] border border-slate-200 bg-slate-50/70 p-5 transition hover:-translate-y-1 hover:border-cyan-200 hover:bg-cyan-50"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-xs font-black text-cyan-700 shadow-sm">
                {module.code}
              </div>

              <span
                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                  module.access === "Editable"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-cyan-50 text-cyan-700"
                }`}
              >
                {module.access}
              </span>
            </div>

            <h3 className="mt-5 text-2xl font-black tracking-[-0.055em] text-slate-950">
              {module.title}
            </h3>

            <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
              {module.description}
            </p>

            <div className="mt-5 flex items-center justify-between gap-4">
              <p className="text-sm font-black text-cyan-700">Entrar →</p>

              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                {module.status}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <ConnectionsAndReports brand={brand} />
    </section>
  );
}

function ConnectionsAndReports({ brand }: { brand: BrandData }) {
  return (
    <div className="mt-6 grid gap-4 2xl:grid-cols-2">
      <article
        id="conexiones"
        className="rounded-[30px] border border-emerald-100 bg-emerald-50 p-5"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">
          Conexiones
        </p>

        <h3 className="mt-3 text-2xl font-black tracking-[-0.055em] text-slate-950">
          Fuentes de datos conectadas
        </h3>

        <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
          Aquí el cliente podrá conectar redes sociales, WhatsApp, Meta Ads,
          Shopify, POS, catálogo e inventario cuando el módulo esté activo.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ConnectionStatus label="Instagram" status="Pendiente" />
          <ConnectionStatus label="Facebook" status="Pendiente" />
          <ConnectionStatus label="WhatsApp" status="Pendiente" />
          <ConnectionStatus label="Shopify / POS" status="Próximo" />
        </div>
      </article>

      <article
        id="reportes"
        className="rounded-[30px] border border-cyan-100 bg-cyan-50 p-5"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700">
          Reportes
        </p>

        <h3 className="mt-3 text-2xl font-black tracking-[-0.055em] text-slate-950">
          Claridad de lo que está pasando
        </h3>

        <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
          Este apartado debe mostrar avances, métricas, trabajo realizado,
          aprendizajes visibles, estrategia aprobada y siguientes pasos de
          Cometa.
        </p>

        <div className="mt-5 rounded-2xl bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            Estado
          </p>
          <p className="mt-2 text-sm font-black text-slate-950">
            Reporte visual de {brand.name} en preparación.
          </p>
        </div>
      </article>
    </div>
  );
}

function FutureCommercialSystem({ brand }: { brand: BrandData }) {
  return (
    <section className="grid gap-4 2xl:grid-cols-2">
      <article
        id="inventario"
        className="rounded-[38px] border border-dashed border-slate-300 bg-white/70 p-6"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
          Próxima evolución
        </p>

        <h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-slate-950">
          Inventario conectado
        </h2>

        <p className="mt-4 text-sm font-semibold leading-7 text-slate-500">
          A futuro, {brand.name} podrá conectar Shopify, POS, catálogo e
          inventario para que Cometa OS entienda stock, rotación, margen y
          productos prioritarios.
        </p>
      </article>

      <article
        id="oportunidades"
        className="rounded-[38px] border border-dashed border-slate-300 bg-white/70 p-6"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
          Superagente comercial
        </p>

        <h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-slate-950">
          Oportunidades comerciales
        </h2>

        <p className="mt-4 text-sm font-semibold leading-7 text-slate-500">
          Cuando ventas, redes, inventario y POS estén conectados, el sistema
          podrá detectar qué productos empujar, qué campañas activar y dónde hay
          mayor oportunidad real de venta.
        </p>
      </article>
    </section>
  );
}

function TopControls({ brandSlug }: { brandSlug: string }) {
  const brandQuery = `brandSlug=${encodeURIComponent(brandSlug)}`;

  return (
    <div className="flex justify-end gap-3">
      <Link
        href={`/brand/${brandSlug}#calendario-contenido`}
        className="flex h-12 items-center rounded-2xl bg-cyan-50 px-5 text-sm font-black text-cyan-700 shadow-sm transition hover:bg-cyan-100"
      >
        Calendario
      </Link>

      <Link
        href={`/brand/${brandSlug}#reportes`}
        className="flex h-12 items-center rounded-2xl bg-white px-5 text-sm font-black text-slate-950 shadow-sm transition hover:bg-slate-50"
      >
        Reportes
      </Link>

      <Link
        href={`/sales-ai/inbox?${brandQuery}`}
        className="flex h-12 items-center gap-3 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-300">
          <PlayIcon />
        </span>
        Ventas
      </Link>
    </div>
  );
}

function AgentStatusCard({
  brand,
  isLoading,
}: {
  brand: BrandData;
  isLoading: boolean;
}) {
  return (
    <section className="rounded-[38px] bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Agent Readiness
          </p>

          <h2 className="mt-4 whitespace-nowrap text-[46px] font-black leading-[0.92] tracking-[-0.075em]">
            {isLoading ? "..." : brand.agentScore}
          </h2>

          <div className="mt-4 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <p className="text-sm font-bold text-slate-300">
              {isLoading ? "Sincronizando" : brand.agentStatus}
            </p>
          </div>
        </div>

        <ScoreRing value={brand.agentScore} />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
          <span>Autonomía</span>
          <span>{brand.autonomy}%</span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)]"
            style={{ width: `${clampNumber(brand.autonomy, 0, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <DarkMini label="Info IA" value={`${brand.knowledge}%`} />
        <DarkMini label="Leads" value={String(brand.openLeads)} />
        <DarkMini label="Alertas" value={String(brand.pendingLearning)} />
        <DarkMini label="Control" value="Cometa" />
      </div>
    </section>
  );
}

function RecommendedActions({ brand }: { brand: BrandData }) {
  const brandQuery = `brandSlug=${encodeURIComponent(brand.slug)}`;

  const actions = [
    {
      number: "1",
      title: "Ver calendario de contenido",
      description:
        "Consultar piezas del mes, estados, revisión y comentarios en MERCURY.",
      href: `/brand/${brand.slug}#calendario-contenido`,
      priority: "Alta",
    },
    {
      number: "2",
      title: brand.mainAction,
      description: brand.actionDescription,
      href: getActionHref(brand),
      priority: brand.riskLevel === "Alto" ? "Alta" : "Media",
    },
    {
      number: "3",
      title: "Revisar conversaciones activas",
      description: "Validar leads abiertos y oportunidades calientes.",
      href: `/sales-ai/inbox?${brandQuery}`,
      priority: "Media",
    },
    {
      number: "4",
      title: "Configurar agente SALES AI",
      description: "Actualizar servicios, reglas, tono, límites y seguimientos.",
      href: `/sales-ai/agent-settings?${brandQuery}`,
      priority: "Baja",
    },
  ];

  return (
    <section className="rounded-[34px] border border-white bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
        Qué necesita tu sistema
      </p>

      <div className="mt-5 grid gap-3">
        {actions.map((action) => (
          <Link
            key={action.number}
            href={action.href}
            className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-cyan-200 hover:bg-cyan-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">
              {action.number}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-black text-slate-950">
                  {action.title}
                </p>

                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${
                    action.priority === "Alta"
                      ? "bg-rose-50 text-rose-600"
                      : action.priority === "Media"
                      ? "bg-amber-50 text-amber-600"
                      : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {action.priority}
                </span>
              </div>

              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                {action.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SystemPrinciple() {
  return (
    <section className="rounded-[34px] border border-cyan-100 bg-cyan-50 p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
        Principio del sistema
      </p>

      <p className="mt-3 text-sm font-black leading-6 text-slate-950">
        El cliente actualiza información. Cometa controla estrategia.
      </p>

      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
        Los agentes IA trabajan con datos aprobados, conexiones y reglas claras.
        Si falta información, escalan.
      </p>
    </section>
  );
}

function AccountSignalCard({
  code,
  title,
  description,
  status,
  featured,
}: {
  code: string;
  title: string;
  description: string;
  status: string;
  featured?: boolean;
}) {
  return (
    <article
      className={`rounded-[28px] border p-5 ${
        featured ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-black ${
            featured ? "bg-white text-cyan-700" : "bg-white text-slate-400"
          }`}
        >
          {code}
        </div>

        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
          {status}
        </span>
      </div>

      <h3 className="mt-5 text-2xl font-black tracking-[-0.055em] text-slate-950">
        {title}
      </h3>

      <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
        {description}
      </p>
    </article>
  );
}

function CalendarStageCard({
  code,
  title,
  description,
  status,
  featured,
}: {
  code: string;
  title: string;
  description: string;
  status: string;
  featured?: boolean;
}) {
  return (
    <article
      className={`rounded-[28px] border p-5 ${
        featured ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-black ${
            featured ? "bg-white text-cyan-700" : "bg-white text-slate-400"
          }`}
        >
          {code}
        </div>

        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
          {status}
        </span>
      </div>

      <h3 className="mt-5 text-2xl font-black tracking-[-0.055em] text-slate-950">
        {title}
      </h3>

      <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
        {description}
      </p>
    </article>
  );
}

function WorkSignalCard({
  code,
  title,
  description,
  featured,
}: {
  code: string;
  title: string;
  description: string;
  featured?: boolean;
}) {
  return (
    <article
      className={`rounded-[28px] border p-5 ${
        featured ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xs font-black ${
          featured ? "bg-white text-cyan-700" : "bg-slate-50 text-slate-400"
        }`}
      >
        {code}
      </div>

      <h3 className="mt-5 text-2xl font-black tracking-[-0.055em] text-slate-950">
        {title}
      </h3>

      <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
        {description}
      </p>
    </article>
  );
}

function FlowStep({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">
        {number}
      </div>

      <p className="min-w-0 truncate text-sm font-black text-slate-950">
        {title}
      </p>
    </div>
  );
}

function ConnectionStatus({
  label,
  status,
}: {
  label: string;
  status: "Pendiente" | "Conectado" | "Error" | "Próximo";
}) {
  const statusClass =
    status === "Conectado"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Error"
      ? "bg-rose-100 text-rose-700"
      : status === "Próximo"
      ? "bg-amber-100 text-amber-700"
      : "bg-white text-slate-500";

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3">
      <p className="truncate text-sm font-black text-slate-950">{label}</p>

      <span
        className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClass}`}
      >
        {status}
      </span>
    </div>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold text-slate-400">
        <span>{label}</span>
        <span>{value}%</span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)]"
          style={{ width: `${clampNumber(value, 0, 100)}%` }}
        />
      </div>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const safeValue = clampNumber(value, 0, 100);

  return (
    <div
      className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(#22d3ee ${
          safeValue * 3.6
        }deg, rgba(255,255,255,0.12) 0deg)`,
      }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 ring-8 ring-cyan-400/10">
        <div className="text-center">
          <p className="text-2xl font-black tracking-[-0.07em]">{safeValue}</p>
          <p className="text-[10px] font-black text-slate-400">/100</p>
        </div>
      </div>
    </div>
  );
}

function DarkMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="truncate text-[10px] font-bold text-slate-400">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-white">{value}</p>
    </div>
  );
}

function getActionHref(brand: BrandData) {
  const brandQuery = `brandSlug=${encodeURIComponent(brand.slug)}`;
  const action = `${brand.mainAction} ${brand.actionDescription}`.toLowerCase();

  if (
    action.includes("catálogo") ||
    action.includes("catalogo") ||
    action.includes("reglas") ||
    action.includes("faq") ||
    action.includes("knowledge") ||
    action.includes("información") ||
    action.includes("informacion")
  ) {
    return `/sales-ai/knowledge?${brandQuery}`;
  }

  if (
    action.includes("lead") ||
    action.includes("conversacion") ||
    action.includes("conversación") ||
    action.includes("respuestas") ||
    action.includes("ventas")
  ) {
    return `/sales-ai/inbox?${brandQuery}`;
  }

  if (
    action.includes("calendario") ||
    action.includes("contenido") ||
    action.includes("mercury")
  ) {
    return `/brand/${brand.slug}#calendario-contenido`;
  }

  if (
    action.includes("aprendiz") ||
    action.includes("learning") ||
    action.includes("mejoras detectadas") ||
    action.includes("estrategia") ||
    action.includes("hipótesis") ||
    action.includes("hipotesis")
  ) {
    return `/brand/${brand.slug}#estrategia-mes`;
  }

  return `/brand/${brand.slug}#conexiones`;
}

function riskClass(risk: RiskLevel, dark = false) {
  if (dark) {
    if (risk === "Alto") return "border-rose-300/30 bg-rose-400/10 text-rose-200";
    if (risk === "Medio")
      return "border-amber-300/30 bg-amber-400/10 text-amber-200";
    return "border-emerald-300/30 bg-emerald-400/10 text-emerald-200";
  }

  if (risk === "Alto") return "border-rose-200 bg-rose-50 text-rose-600";
  if (risk === "Medio") return "border-amber-200 bg-amber-50 text-amber-600";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatBrandName(slug: string) {
  return String(slug || "Brand OS")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getInitials(name: string) {
  const words = String(name || "Cometa OS").split(" ").filter(Boolean);
  const first = words[0]?.[0] || "C";
  const second = words[1]?.[0] || "O";
  return `${first}${second}`.toUpperCase();
}

function clampNumber(value: number, min: number, max: number) {
  const num = Number(value || 0);

  if (Number.isNaN(num)) return min;

  return Math.max(min, Math.min(max, num));
}

function PlayIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}