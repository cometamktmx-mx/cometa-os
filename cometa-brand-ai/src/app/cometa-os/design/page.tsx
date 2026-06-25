"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type NavItem = {
  code: string;
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
};

type BrandContext = {
  id: string | null;
  slug: string;
  name: string;
  industry: string;
  city: string | null;
  exists: boolean;
  sourceTable: string | null;
};

type MissionStats = {
  autonomy: number;
  knowledge: number;
  agentScore: number;
  openLeads: number;
  pendingLearning: number;
  appliedLearning: number;
  readyReplies: number;
  riskLevel: string;
  agentStatus: string;
  mainAction: string;
  actionDescription: string;
};

type AgentCard = {
  code: string;
  title: string;
  eyebrow: string;
  score: number;
  status: string;
  description: string;
  href?: string;
  active?: boolean;
};

const fallbackBrand: BrandContext = {
  id: null,
  slug: "brand-os",
  name: "Brand OS",
  industry: "Sistema comercial",
  city: null,
  exists: false,
  sourceTable: null,
};

const fallbackStats: MissionStats = {
  autonomy: 0,
  knowledge: 0,
  agentScore: 0,
  openLeads: 0,
  pendingLearning: 0,
  appliedLearning: 0,
  readyReplies: 0,
  riskLevel: "Controlado",
  agentStatus: "Configuración",
  mainAction: "Configurar sistema comercial",
  actionDescription:
    "Completa contexto, conocimiento, reglas y datos comerciales para elevar la autonomía del sistema.",
};

export default function CometaOSMissionControlPage() {
  return (
    <Suspense fallback={<MissionLoadingShell />}>
      <CometaOSMissionControlContent />
    </Suspense>
  );
}

function CometaOSMissionControlContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedBrandSlug = searchParams.get("brandSlug") || "";

  const [brand, setBrand] = useState<BrandContext>(fallbackBrand);
  const [stats, setStats] = useState<MissionStats>(fallbackStats);
  const [loading, setLoading] = useState(true);
  const [systemMessage, setSystemMessage] = useState("");

  const activeBrandSlug = brand.slug || requestedBrandSlug || "brand-os";
  const brandQuery = `brandSlug=${encodeURIComponent(activeBrandSlug)}`;

  const nav = useMemo(() => buildNav(activeBrandSlug), [activeBrandSlug]);

  useEffect(() => {
    loadMissionControl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedBrandSlug]);

  async function loadMissionControl() {
    try {
      setLoading(true);
      setSystemMessage("");

      const query = requestedBrandSlug
        ? `?brandSlug=${encodeURIComponent(requestedBrandSlug)}`
        : "";

      const res = await fetch(`/api/brand-dashboard${query}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json();

      if (res.status === 401) {
        router.replace(
          `/login?next=${encodeURIComponent(
            requestedBrandSlug
              ? `/cometa-os/design?brandSlug=${requestedBrandSlug}`
              : "/cometa-os/design"
          )}`
        );
        return;
      }

      if (res.status === 403) {
        router.replace("/workspace");
        return;
      }

      if (!res.ok || data.ok === false) {
        throw new Error(data?.error || "No se pudo cargar Mission Control.");
      }

      setBrand(normalizeBrand(data.brand, requestedBrandSlug));
      setStats(normalizeMissionStats(data));
    } catch (error: any) {
      setSystemMessage(error?.message || "Error cargando Mission Control.");
      setBrand({
        ...fallbackBrand,
        slug: requestedBrandSlug || fallbackBrand.slug,
        name: formatBrandName(requestedBrandSlug || fallbackBrand.slug),
      });
      setStats(fallbackStats);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f2f7fb] text-slate-950">
      <section className="mx-auto grid min-h-screen w-full max-w-[1800px] grid-cols-1 gap-4 p-4 xl:grid-cols-[214px_minmax(0,1fr)_390px]">
        <Dock nav={nav} brand={brand} />

        <section className="flex min-w-0 flex-col gap-4">
          {systemMessage ? <LoadWarning message={systemMessage} /> : null}

          <MissionHero
            brand={brand}
            stats={stats}
            loading={loading}
            brandQuery={brandQuery}
          />

          <MissionMetrics stats={stats} loading={loading} />

          <AgentNetwork
            brand={brand}
            stats={stats}
            brandQuery={brandQuery}
            brandSlug={activeBrandSlug}
          />

          <MissionTimeline stats={stats} brandQuery={brandQuery} />

          <SystemLayers brand={brand} />
        </section>

        <aside className="sticky top-4 hidden h-fit min-w-0 flex-col gap-4 xl:flex">
          <TopControls loading={loading} onRefresh={loadMissionControl} />

          <ActiveAgentPanel stats={stats} loading={loading} />

          <NextActions
            stats={stats}
            brandSlug={activeBrandSlug}
            brandQuery={brandQuery}
          />

          <QuickLinks brandQuery={brandQuery} brandSlug={activeBrandSlug} />

          <CometaPrinciple />
        </aside>
      </section>
    </main>
  );
}

function buildNav(brandSlug: string): NavItem[] {
  const safeBrandSlug = encodeURIComponent(brandSlug || "brand-os");
  const brandQuery = `brandSlug=${safeBrandSlug}`;

  return [
    { code: "WS", label: "Workspace", href: "/workspace" },
    { code: "HM", label: "Brand OS", href: `/brand/${safeBrandSlug}` },
    {
      code: "MC",
      label: "Misión",
      href: `/cometa-os/design?${brandQuery}`,
      active: true,
    },
    { code: "IN", label: "Inbox", href: `/sales-ai/inbox?${brandQuery}` },
    {
      code: "KB",
      label: "Knowledge",
      href: `/sales-ai/knowledge?${brandQuery}`,
    },
    {
      code: "LR",
      label: "Learning",
      href: `/sales-ai/learning?${brandQuery}`,
    },
  ];
}

function LoadWarning({ message }: { message: string }) {
  return (
    <div className="rounded-[26px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700">
      No se pudo cargar información real desde Supabase. Detalle: {message}
    </div>
  );
}

function Dock({ nav, brand }: { nav: NavItem[]; brand: BrandContext }) {
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
            Mission conectado
          </p>
        </div>
      </div>
    </aside>
  );
}

function MissionHero({
  brand,
  stats,
  loading,
  brandQuery,
}: {
  brand: BrandContext;
  stats: MissionStats;
  loading: boolean;
  brandQuery: string;
}) {
  return (
    <header className="relative overflow-hidden rounded-[38px] bg-slate-950 p-7 text-white shadow-[0_30px_100px_rgba(15,23,42,0.20)] md:p-8">
      <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-cyan-400/25 blur-[90px]" />
      <div className="absolute bottom-[-160px] left-[25%] h-72 w-72 rounded-full bg-emerald-400/15 blur-[95px]" />

      <div className="relative z-10 grid gap-8 2xl:grid-cols-[minmax(0,1fr)_390px] 2xl:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white">
              Cometa OS
            </span>

            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
              Mission Control
            </span>

            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
              {loading ? "Sincronizando" : brand.name}
            </span>
          </div>

          <p className="mt-8 text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
            {brand.industry}
            {brand.city ? ` · ${brand.city}` : ""}
          </p>

          <h1 className="mt-3 max-w-5xl text-5xl font-black leading-[0.92] tracking-[-0.085em] md:text-6xl 2xl:text-[76px]">
            Mission
            <br />
            Command Center
          </h1>

          <p className="mt-6 max-w-4xl text-[17px] font-semibold leading-8 text-slate-300">
            Opera ventas, conocimiento, aprendizaje, memoria y decisiones para{" "}
            <span className="font-black text-white">{brand.name}</span> desde un
            solo sistema inteligente.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={`/sales-ai/inbox?${brandQuery}`}
              className="flex h-14 items-center justify-center rounded-2xl bg-white px-6 text-sm font-black text-slate-950 transition hover:bg-cyan-100"
            >
              Abrir Inbox →
            </Link>

            <Link
              href={`/sales-ai/knowledge?${brandQuery}`}
              className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-sm font-black text-white transition hover:bg-white/10"
            >
              Knowledge Brain
            </Link>

            <Link
              href={`/sales-ai/learning?${brandQuery}`}
              className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-sm font-black text-white transition hover:bg-white/10"
            >
              Learning Hub
            </Link>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            System Health
          </p>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-5xl font-black leading-[0.9] tracking-[-0.09em]">
                {loading ? "..." : stats.agentScore}
              </h2>

              <p className="mt-2 text-sm font-bold text-slate-300">
                Score operativo
              </p>
            </div>

            <ScoreRing value={loading ? 0 : stats.agentScore} />
          </div>

          <div className="mt-6 grid gap-3">
            <ProgressLine label="Autonomía" value={stats.autonomy} />
            <ProgressLine label="Knowledge" value={stats.knowledge} />
          </div>
        </div>
      </div>
    </header>
  );
}

function MissionMetrics({
  stats,
  loading,
}: {
  stats: MissionStats;
  loading: boolean;
}) {
  const items = [
    { label: "Autonomía", value: `${stats.autonomy}%`, code: "AU" },
    { label: "Knowledge", value: `${stats.knowledge}%`, code: "KB" },
    { label: "Leads", value: stats.openLeads, code: "LD" },
    { label: "Learning", value: stats.pendingLearning, code: "LR" },
    { label: "Respuestas", value: stats.readyReplies, code: "RP" },
  ];

  return (
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-5">
      {items.map((item) => (
        <article
          key={item.label}
          className="min-w-0 rounded-[28px] border border-white bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-xs font-black text-cyan-700">
              {item.code}
            </div>

            <p className="min-w-0 truncate text-right text-3xl font-black leading-none tracking-[-0.08em] text-slate-950 md:text-4xl">
              {loading ? "..." : item.value}
            </p>
          </div>

          <p className="mt-4 truncate text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            {item.label}
          </p>
        </article>
      ))}
    </section>
  );
}

function TopControls({
  loading,
  onRefresh,
}: {
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex justify-end gap-3">
      <Link
        href="/workspace"
        className="flex h-12 items-center rounded-2xl bg-white px-5 text-sm font-black text-slate-950 shadow-sm transition hover:bg-slate-50"
      >
        Workspace
      </Link>

      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex h-12 items-center gap-3 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800 disabled:opacity-50"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-300">
          <RefreshIcon />
        </span>
        {loading ? "..." : "Actualizar"}
      </button>
    </div>
  );
}

function ActiveAgentPanel({
  stats,
  loading,
}: {
  stats: MissionStats;
  loading: boolean;
}) {
  return (
    <section className="rounded-[38px] bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Agente activo
          </p>

          <h2 className="mt-5 text-[50px] font-black leading-[0.88] tracking-[-0.085em]">
            SALES
            <br />
            AI
          </h2>

          <div className="mt-5 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <p className="text-sm font-bold text-slate-300">
              {loading ? "Sincronizando" : stats.agentStatus}
            </p>
          </div>
        </div>

        <ScoreRing value={loading ? 0 : stats.agentScore} />
      </div>

      <div className="mt-7">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
          <span>Autonomía</span>
          <span>{loading ? "..." : `${stats.autonomy}%`}</span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)]"
            style={{ width: `${loading ? 0 : clampNumber(stats.autonomy)}%` }}
          />
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3">
        <DarkMini label="Leads" value={loading ? "..." : String(stats.openLeads)} />
        <DarkMini
          label="Respuestas"
          value={loading ? "..." : String(stats.readyReplies)}
        />
        <DarkMini
          label="Learning"
          value={loading ? "..." : String(stats.pendingLearning)}
        />
        <DarkMini
          label="Control"
          value={loading ? "..." : String(stats.riskLevel || "Alto")}
        />
      </div>
    </section>
  );
}

function AgentNetwork({
  brand,
  stats,
  brandQuery,
  brandSlug,
}: {
  brand: BrandContext;
  stats: MissionStats;
  brandQuery: string;
  brandSlug: string;
}) {
  const agents = buildAgents(stats, brandQuery, brandSlug);

  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Agent Operating Core
          </p>
          <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
            Núcleo inteligente de {brand.name}
          </h2>
        </div>

        <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
          Ecosistema conectado
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {agents.map((agent) => (
          <AgentCardItem key={agent.code} agent={agent} />
        ))}
      </div>
    </section>
  );
}

function AgentCardItem({ agent }: { agent: AgentCard }) {
  const card = (
    <article
      className={`group min-h-[245px] rounded-[30px] border p-5 transition hover:-translate-y-1 ${
        agent.active
          ? "border-cyan-200 bg-cyan-50"
          : "border-slate-200 bg-slate-50/70 hover:border-cyan-200 hover:bg-cyan-50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-xs font-black text-cyan-700 shadow-sm">
          {agent.code}
        </div>

        <ScoreMini value={agent.score} />
      </div>

      <p className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
        {agent.eyebrow}
      </p>

      <h3 className="mt-2 text-2xl font-black tracking-[-0.055em] text-slate-950">
        {agent.title}
      </h3>

      <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
        {agent.description}
      </p>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
          {agent.status}
        </span>

        <span className="text-sm font-black text-cyan-700">
          {agent.href ? "Entrar →" : "Activo"}
        </span>
      </div>
    </article>
  );

  if (!agent.href) return card;

  return (
    <Link href={agent.href} className="block">
      {card}
    </Link>
  );
}

function MissionTimeline({
  stats,
  brandQuery,
}: {
  stats: MissionStats;
  brandQuery: string;
}) {
  const steps = [
    {
      number: "01",
      title: "Diagnóstico",
      description:
        "ORION detecta señales de marca, presencia digital y oportunidades comerciales.",
      status: "Activo",
      href: "#",
    },
    {
      number: "02",
      title: "Mapa comercial",
      description:
        "NOVA organiza oferta, buyer persona, objeciones, diferenciadores y proceso de compra.",
      status: "Listo",
      href: "#",
    },
    {
      number: "03",
      title: "Ventas",
      description: `${stats.openLeads} leads abiertos y ${stats.readyReplies} respuestas listas para revisar.`,
      status: "En operación",
      href: `/sales-ai/inbox?${brandQuery}`,
    },
    {
      number: "04",
      title: "Aprendizaje",
      description:
        stats.pendingLearning > 0
          ? `${stats.pendingLearning} aprendizajes pendientes por revisar.`
          : "Sin aprendizajes pendientes críticos.",
      status: stats.pendingLearning > 0 ? "Revisión" : "Saludable",
      href: `/sales-ai/learning?${brandQuery}`,
    },
  ];

  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Mission Flow
          </p>
          <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
            Flujo operativo
          </h2>
        </div>

        <span className="w-fit rounded-full border border-cyan-200 bg-cyan-50 px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-700">
          Ciclo inteligente
        </span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        {steps.map((step) => {
          const content = (
            <article className="h-full rounded-[30px] border border-slate-200 bg-slate-50/70 p-5 transition hover:border-cyan-200 hover:bg-cyan-50">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">
                {step.number}
              </div>

              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
                {step.status}
              </p>

              <h3 className="mt-2 text-2xl font-black tracking-[-0.055em] text-slate-950">
                {step.title}
              </h3>

              <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                {step.description}
              </p>
            </article>
          );

          if (step.href === "#") return <div key={step.number}>{content}</div>;

          return (
            <Link key={step.number} href={step.href}>
              {content}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function NextActions({
  stats,
  brandSlug,
  brandQuery,
}: {
  stats: MissionStats;
  brandSlug: string;
  brandQuery: string;
}) {
  const actions = [
    {
      number: "1",
      title: stats.mainAction || "Revisar señales de compra",
      description:
        stats.actionDescription || "SALES AI detectó una acción prioritaria.",
      priority: "Alta",
      href: `/brand/${brandSlug}`,
    },
    {
      number: "2",
      title:
        stats.readyReplies > 0
          ? "Revisar respuestas listas"
          : "Abrir Inbox de ventas",
      description: `${stats.readyReplies} respuestas listas · ${stats.openLeads} leads abiertos`,
      priority: stats.readyReplies > 0 ? "Alta" : "Media",
      href: `/sales-ai/inbox?${brandQuery}`,
    },
    {
      number: "3",
      title:
        stats.pendingLearning > 0
          ? "Revisar aprendizajes"
          : "Validar Knowledge Brain",
      description:
        stats.pendingLearning > 0
          ? `${stats.pendingLearning} sugerencias pendientes`
          : `${stats.knowledge}% de conocimiento configurado`,
      priority: stats.pendingLearning > 0 ? "Media" : "Baja",
      href:
        stats.pendingLearning > 0
          ? `/sales-ai/learning?${brandQuery}`
          : `/sales-ai/knowledge?${brandQuery}`,
    },
  ];

  return (
    <section className="rounded-[34px] border border-white bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
        Próximas acciones
      </p>

      <div className="mt-5 grid gap-3">
        {actions.map((action) => (
          <Link
            key={action.number}
            href={action.href}
            className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-cyan-200 hover:bg-cyan-50"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">
              {action.number}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-black text-slate-950">
                  {action.title}
                </p>

                <span
                  className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${
                    action.priority === "Alta"
                      ? "bg-rose-50 text-rose-600"
                      : action.priority === "Media"
                      ? "bg-amber-50 text-amber-600"
                      : "bg-emerald-50 text-emerald-700"
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

function QuickLinks({
  brandQuery,
  brandSlug,
}: {
  brandQuery: string;
  brandSlug: string;
}) {
  const links = [
    { label: "Brand OS", href: `/brand/${brandSlug}` },
    { label: "Sales Inbox", href: `/sales-ai/inbox?${brandQuery}` },
    { label: "Knowledge Brain", href: `/sales-ai/knowledge?${brandQuery}` },
    { label: "Learning Hub", href: `/sales-ai/learning?${brandQuery}` },
  ];

  return (
    <section className="rounded-[34px] border border-cyan-100 bg-cyan-50 p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
        Navegación de marca
      </p>

      <div className="mt-4 grid gap-2">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-800 transition hover:bg-cyan-100"
          >
            {link.label} →
          </Link>
        ))}
      </div>
    </section>
  );
}

function CometaPrinciple() {
  return (
    <section className="rounded-[34px] border border-cyan-100 bg-cyan-50 p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
        Principio Cometa
      </p>

      <p className="mt-3 text-sm font-black leading-6 text-slate-950">
        La IA no reemplaza el criterio comercial.
      </p>

      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
        Lo organiza, lo ejecuta y lo mejora con memoria y aprendizaje
        supervisado.
      </p>
    </section>
  );
}

function SystemLayers({ brand }: { brand: BrandContext }) {
  const layers = [
    {
      eyebrow: "Qué vende",
      title: "Business Context",
      description: `Oferta, ticket, buyer persona, objeciones y proceso comercial de ${brand.name}.`,
    },
    {
      eyebrow: "Qué sabe",
      title: "Knowledge Brain",
      description: "Catálogo, reglas, FAQs, políticas y límites autorizados.",
    },
    {
      eyebrow: "Qué aprende",
      title: "Learning Hub",
      description:
        "Aprendizajes detectados por IA para mejorar ventas sin perder control humano.",
    },
    {
      eyebrow: "Qué decide",
      title: "Decision Core",
      description:
        "Responder, preguntar, seguir, escalar o detener la conversación.",
    },
  ];

  return (
    <section className="rounded-[38px] border border-white bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Operating Layers
          </p>
          <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
            Capas de inteligencia
          </h2>
        </div>

        <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
          Sistema inteligente
        </span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {layers.map((layer) => (
          <article
            key={layer.title}
            className="rounded-[30px] border border-slate-200 bg-slate-50/70 p-6"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
              {layer.eyebrow}
            </p>
            <h3 className="mt-3 text-2xl font-black tracking-[-0.055em] text-slate-950">
              {layer.title}
            </h3>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              {layer.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  const safeValue = clampNumber(value);

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold text-slate-400">
        <span>{label}</span>
        <span>{safeValue}%</span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)]"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const safeValue = clampNumber(value);

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

function ScoreMini({ value }: { value: number }) {
  const safeValue = clampNumber(value);

  return (
    <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
      <p className="text-2xl font-black leading-none tracking-[-0.07em] text-slate-950">
        {safeValue}
      </p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        score
      </p>
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

function MissionLoadingShell() {
  return (
    <main className="min-h-screen bg-[#f2f7fb] p-6">
      <div className="mx-auto max-w-6xl rounded-[38px] bg-slate-950 p-10 text-white">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
          Mission Control
        </p>
        <h1 className="mt-4 text-5xl font-black tracking-[-0.08em]">
          Cargando sistema operativo...
        </h1>
      </div>
    </main>
  );
}

function normalizeBrand(rawBrand: any, fallbackSlug: string): BrandContext {
  const slug = rawBrand?.slug || fallbackSlug || "brand-os";

  return {
    id: rawBrand?.id || null,
    slug,
    name: rawBrand?.name || formatBrandName(slug),
    industry: rawBrand?.industry || "Sistema comercial",
    city: rawBrand?.city || null,
    exists: Boolean(rawBrand?.exists),
    sourceTable: rawBrand?.sourceTable || null,
  };
}

function normalizeMissionStats(data: any): MissionStats {
  const brand = data?.brand || {};
  const knowledge = data?.knowledge || brand?.knowledge || {};
  const metrics = data?.metrics || {};

  const autonomy = toNumber(brand.autonomy, fallbackStats.autonomy);
  const agentScore = toNumber(brand.agentScore, fallbackStats.agentScore);

  const knowledgeScore =
    typeof brand.knowledge === "number"
      ? brand.knowledge
      : toNumber(
          knowledge.score || knowledge.readiness || brand.knowledgeScore,
          fallbackStats.knowledge
        );

  return {
    autonomy,
    knowledge: knowledgeScore,
    agentScore,
    openLeads: toNumber(
      brand.openLeads || metrics.openLeads,
      fallbackStats.openLeads
    ),
    pendingLearning: toNumber(
      brand.pendingLearning || metrics.pendingLearning,
      fallbackStats.pendingLearning
    ),
    appliedLearning: toNumber(
      brand.appliedLearning || metrics.appliedLearning,
      fallbackStats.appliedLearning
    ),
    readyReplies: toNumber(
      brand.readyReplies || metrics.readyReplies,
      fallbackStats.readyReplies
    ),
    riskLevel: String(brand.riskLevel || fallbackStats.riskLevel),
    agentStatus: String(brand.agentStatus || fallbackStats.agentStatus),
    mainAction: String(brand.mainAction || fallbackStats.mainAction),
    actionDescription: String(
      brand.actionDescription || fallbackStats.actionDescription
    ),
  };
}

function buildAgents(
  stats: MissionStats,
  brandQuery: string,
  brandSlug: string
): AgentCard[] {
  return [
    {
      code: "SA",
      title: "SALES AI",
      eyebrow: "Ventas 24/7",
      score: stats.agentScore,
      status: stats.agentStatus,
      active: true,
      href: `/sales-ai/inbox?${brandQuery}`,
      description:
        "Atiende prospectos, califica intención, recomienda respuestas y escala cuando hay riesgo.",
    },
    {
      code: "KB",
      title: "Knowledge",
      eyebrow: "Base comercial",
      score: stats.knowledge,
      status: "Activo",
      href: `/sales-ai/knowledge?${brandQuery}`,
      description:
        "Centraliza catálogo, reglas, FAQs, límites comerciales y contexto autorizado.",
    },
    {
      code: "LR",
      title: "Learning",
      eyebrow: "Mejora continua",
      score:
        stats.pendingLearning > 0
          ? Math.max(45, 100 - stats.pendingLearning * 10)
          : 100,
      status: stats.pendingLearning > 0 ? "Revisión" : "Saludable",
      href: `/sales-ai/learning?${brandQuery}`,
      description:
        "Detecta objeciones, dudas repetidas, errores y oportunidades para entrenar al agente.",
    },
    {
      code: "OR",
      title: "ORION",
      eyebrow: "Diagnóstico",
      score: 92,
      status: "Listo",
      href: `/brand/${brandSlug}`,
      description:
        "Organiza señales de marca, presencia digital y oportunidades comerciales.",
    },
    {
      code: "NV",
      title: "NOVA",
      eyebrow: "Business Map",
      score: 88,
      status: "Preparado",
      description:
        "Estructura oferta, buyer persona, diferenciadores, objeciones y proceso comercial.",
    },
    {
      code: "AT",
      title: "ATLAS",
      eyebrow: "Estrategia",
      score: 81,
      status: "Manual",
      description:
        "Convierte diagnóstico y señales comerciales en prioridades de acción estratégica.",
    },
  ];
}

function toNumber(value: any, fallback: number) {
  const num = Number(value);

  if (Number.isNaN(num)) return fallback;

  return Math.round(num);
}

function clampNumber(value: any) {
  const num = Number(value || 0);

  if (Number.isNaN(num)) return 0;

  return Math.max(0, Math.min(100, Math.round(num)));
}

function formatBrandName(slug: string) {
  return String(slug || "Brand OS")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getInitials(name: string) {
  const words = String(name || "Cometa OS").split(" ").filter(Boolean);
  const first = words[0]?.[0] || "C";
  const second = words[1]?.[0] || "O";

  return `${first}${second}`.toUpperCase();
}

function RefreshIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 11-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}