"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type RiskLevel = "Bajo" | "Medio" | "Alto";

type NavItem = {
  code: string;
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
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
    "Cometa OS está organizando contexto, catálogo, reglas y aprendizajes para operar ventas con inteligencia y control humano.",
  agentStatus: "Configuración",
  agentScore: 0,
  autonomy: 0,
  knowledge: 0,
  openLeads: 0,
  pendingLearning: 0,
  appliedLearning: 0,
  readyReplies: 0,
  riskLevel: "Medio",
  mainAction: "Configurar marca",
  actionDescription:
    "Esta marca necesita contexto comercial para activar su operación con IA.",
};

export default function BrandHomePage() {
  const router = useRouter();
  const params = useParams();

  const rawBrandSlug = params?.brandSlug;
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
    { code: "WS", label: "Workspace", href: "/workspace" },
    { code: "HM", label: "Brand OS", href: `/brand/${brand.slug}`, active: true },
    { code: "IN", label: "Inbox", href: `/sales-ai/inbox?${brandQuery}` },
    { code: "KB", label: "Knowledge", href: `/sales-ai/knowledge?${brandQuery}` },
    { code: "LR", label: "Learning", href: `/sales-ai/learning?${brandQuery}` },
    { code: "MC", label: "Misión", href: `/cometa-os/design?${brandQuery}` },
  ];

  return (
    <main className="min-h-screen bg-[#f2f7fb] text-slate-950">
      <section className="mx-auto grid min-h-screen w-full max-w-[1800px] grid-cols-1 gap-4 p-4 xl:grid-cols-[214px_minmax(0,1fr)_390px]">
        <BrandDock nav={nav} brand={brand} />

        <section className="flex min-w-0 flex-col gap-4">
          {loadError ? <LoadWarning message={loadError} /> : null}

          <BrandHero brand={brand} isLoading={isLoading} />

          <BrandMetrics brand={brand} isLoading={isLoading} />

          <BrandOperatingSystem brand={brand} />

          <NextActionBlock brand={brand} />

          <BrandModules brand={brand} />
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
      <div className="flex items-center gap-3 rounded-[26px] bg-slate-50 px-3 py-3">
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
      </div>

      <nav className="mt-7 flex flex-1 flex-col gap-2">
        {nav.map((item) => {
          const className = `flex h-12 items-center gap-3 rounded-2xl px-3 text-left transition ${
            item.active
              ? "border border-cyan-200 bg-cyan-50 text-slate-950 shadow-sm shadow-cyan-950/5"
              : item.disabled
              ? "cursor-not-allowed text-slate-300"
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

              <span className="truncate text-[13px] font-black">
                {item.label}
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

function BrandHero({
  brand,
  isLoading,
}: {
  brand: BrandData;
  isLoading: boolean;
}) {
  return (
    <header className="relative overflow-hidden rounded-[38px] bg-slate-950 p-7 text-white shadow-[0_30px_100px_rgba(15,23,42,0.20)] md:p-8">
      <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-cyan-400/25 blur-[90px]" />
      <div className="absolute bottom-[-160px] left-[25%] h-72 w-72 rounded-full bg-emerald-400/15 blur-[95px]" />

      <div className="relative z-10 grid gap-8 2xl:grid-cols-[minmax(0,1fr)_390px] 2xl:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white">
              Brand OS
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
            Command Center
          </h1>

          <p className="mt-6 max-w-4xl text-[17px] font-semibold leading-8 text-slate-300">
            {brand.description}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={`/sales-ai/inbox?brandSlug=${encodeURIComponent(
                brand.slug
              )}`}
              className="flex h-14 items-center justify-center rounded-2xl bg-white px-6 text-sm font-black text-slate-950 transition hover:bg-cyan-100"
            >
              Abrir Inbox →
            </Link>

            <Link
              href={`/sales-ai/knowledge?brandSlug=${encodeURIComponent(
                brand.slug
              )}`}
              className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-sm font-black text-white transition hover:bg-white/10"
            >
              Knowledge Brain
            </Link>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Commercial Readiness
          </p>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-5xl font-black leading-[0.9] tracking-[-0.09em]">
                {isLoading ? "..." : brand.agentScore}
              </h2>

              <p className="mt-2 text-sm font-bold text-slate-300">
                Score del agente
              </p>
            </div>

            <ScoreRing value={brand.agentScore} />
          </div>

          <div className="mt-6 grid gap-3">
            <ProgressLine label="Autonomía" value={brand.autonomy} />
            <ProgressLine label="Knowledge" value={brand.knowledge} />
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
    { label: "Autonomía", value: `${brand.autonomy}%`, code: "AU" },
    { label: "Knowledge", value: `${brand.knowledge}%`, code: "KB" },
    { label: "Leads abiertos", value: brand.openLeads, code: "LD" },
    { label: "Respuestas listas", value: brand.readyReplies, code: "RP" },
    { label: "Learning", value: brand.pendingLearning, code: "LR" },
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

function BrandOperatingSystem({ brand }: { brand: BrandData }) {
  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Operating System
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
            Atiende, califica, responde y aprende con control humano.
          </h3>

          <p className="mt-5 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
            El agente usa información aprobada del Knowledge Brain. Si detecta
            riesgo comercial, falta de datos o una condición sensible, escala a
            revisión humana.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <DarkMini label="Score" value={String(brand.agentScore)} />
            <DarkMini label="Estado" value={brand.agentStatus} />
            <DarkMini label="Control" value="Humano" />
            <DarkMini label="Riesgo" value={brand.riskLevel} />
          </div>
        </div>

        <div className="grid gap-3">
          <FlowStep number="01" title="Recibe conversación" />
          <FlowStep number="02" title="Detecta intención comercial" />
          <FlowStep number="03" title="Consulta Knowledge Brain" />
          <FlowStep number="04" title="Responde, aprende o escala" />
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <WorkSignalCard
          code="AT"
          title="Atiende"
          description="Responde primeros mensajes, dudas frecuentes y solicitudes básicas."
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

          <div className="mt-7">
            <Link
              href={actionHref}
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-slate-950 px-6 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-cyan-700"
            >
              Ejecutar acción →
            </Link>
          </div>
        </div>
      </article>

      <article className="min-w-0 rounded-[34px] border border-cyan-100 bg-cyan-50 p-6 md:p-7">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
          Regla base
        </p>

        <p className="mt-4 text-3xl font-black leading-tight tracking-[-0.055em] text-slate-950">
          Tu IA vende con información aprobada.
        </p>

        <p className="mt-4 text-sm font-semibold leading-7 text-slate-600 md:text-base">
          Si no sabe, pregunta. Si hay riesgo, escala. Si aprende algo útil, lo
          propone para aprobación.
        </p>
      </article>
    </section>
  );
}

function BrandModules({ brand }: { brand: BrandData }) {
  const brandQuery = `brandSlug=${encodeURIComponent(brand.slug)}`;

  const modules = [
    {
      code: "IN",
      title: "Inbox de ventas",
      description: "Conversaciones, leads, respuestas listas y seguimiento.",
      href: `/sales-ai/inbox?${brandQuery}`,
      status: `${brand.openLeads} leads`,
    },
    {
      code: "KB",
      title: "Knowledge Brain",
      description: "Catálogo, reglas, FAQs y límites comerciales aprobados.",
      href: `/sales-ai/knowledge?${brandQuery}`,
      status: `${brand.knowledge}% listo`,
    },
    {
      code: "LR",
      title: "Learning Hub",
      description: "Aprendizajes detectados por la IA para revisar y aprobar.",
      href: `/sales-ai/learning?${brandQuery}`,
      status: `${brand.pendingLearning} pendientes`,
    },
    {
      code: "MC",
      title: "Mission Control",
      description: "Vista profunda del sistema completo de la marca.",
      href: `/cometa-os/design?${brandQuery}`,
      status: brand.agentStatus,
    },
  ];

  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Módulos Brand OS
          </p>

          <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
            Control operativo de {brand.name}
          </h2>
        </div>

        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
          Acceso autorizado
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

              <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                {module.status}
              </span>
            </div>

            <h3 className="mt-5 text-2xl font-black tracking-[-0.055em] text-slate-950">
              {module.title}
            </h3>

            <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
              {module.description}
            </p>

            <p className="mt-5 text-sm font-black text-cyan-700">Entrar →</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TopControls({ brandSlug }: { brandSlug: string }) {
  const brandQuery = `brandSlug=${encodeURIComponent(brandSlug)}`;

  return (
    <div className="flex justify-end gap-3">
      <Link
        href="/workspace"
        className="flex h-12 items-center rounded-2xl bg-white px-5 text-sm font-black text-slate-950 shadow-sm transition hover:bg-slate-50"
      >
        Workspace
      </Link>

      <Link
        href={`/sales-ai/inbox?${brandQuery}`}
        className="flex h-12 items-center gap-3 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-300">
          <PlayIcon />
        </span>
        Inbox
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
        <DarkMini label="Knowledge" value={`${brand.knowledge}%`} />
        <DarkMini label="Leads" value={String(brand.openLeads)} />
        <DarkMini label="Learning" value={String(brand.pendingLearning)} />
        <DarkMini label="Control" value="Humano" />
      </div>
    </section>
  );
}

function RecommendedActions({ brand }: { brand: BrandData }) {
  const brandQuery = `brandSlug=${encodeURIComponent(brand.slug)}`;

  const actions = [
    {
      number: "1",
      title: brand.mainAction,
      description: brand.actionDescription,
      href: getActionHref(brand),
      priority: brand.riskLevel === "Alto" ? "Alta" : "Media",
    },
    {
      number: "2",
      title: "Revisar conversaciones activas",
      description: "Validar leads abiertos y oportunidades calientes.",
      href: `/sales-ai/inbox?${brandQuery}`,
      priority: "Media",
    },
    {
      number: "3",
      title: "Actualizar información comercial",
      description: "Mantener reglas, FAQs y catálogo aprobados.",
      href: `/sales-ai/knowledge?${brandQuery}`,
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
        Tu IA vende con información aprobada.
      </p>

      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
        Si no sabe, pregunta. Si hay riesgo, escala. Si aprende algo útil, lo
        propone para aprobación.
      </p>
    </section>
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
    action.includes("aprendiz") ||
    action.includes("learning") ||
    action.includes("mejoras detectadas")
  ) {
    return `/sales-ai/learning?${brandQuery}`;
  }

  if (
    action.includes("catálogo") ||
    action.includes("catalogo") ||
    action.includes("reglas") ||
    action.includes("faq") ||
    action.includes("knowledge")
  ) {
    return `/sales-ai/knowledge?${brandQuery}`;
  }

  if (
    action.includes("lead") ||
    action.includes("conversacion") ||
    action.includes("conversación") ||
    action.includes("respuestas")
  ) {
    return `/sales-ai/inbox?${brandQuery}`;
  }

  return `/cometa-os/design?${brandQuery}`;
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