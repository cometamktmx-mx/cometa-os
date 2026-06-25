"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type SuggestionStatus = "pending" | "approved" | "rejected" | "applied";

type Suggestion = {
  id: string;
  brand_name: string;
  suggestion_type: string;
  title: string;
  current_value?: string | null;
  suggested_value: string;
  reason?: string | null;
  confidence_score: number;
  status: SuggestionStatus;
  applied_at?: string | null;
  metadata?: {
    evidence?: string;
    detected_intent?: string;
    risk_level?: "low" | "medium" | "high";
    where_to_apply?: string;
    review_note?: string | null;
    reviewed_at?: string;
    applied_to?: any;
    applied_at?: string;
    [key: string]: any;
  };
  created_at: string;
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

type NavItem = {
  code: string;
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
};

type LearningStats = {
  total: number;
  pending: number;
  approved: number;
  applied: number;
  rejected: number;
  highImpact: number;
  avgConfidence: number;
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

const STATUS_OPTIONS = [
  { label: "Pendientes", value: "pending" },
  { label: "Aprobadas", value: "approved" },
  { label: "Integradas", value: "applied" },
  { label: "Descartadas", value: "rejected" },
  { label: "Todas", value: "all" },
];

const TYPE_VISUALS: Record<
  string,
  {
    label: string;
    icon: string;
    headline: string;
    color: string;
    bg: string;
    border: string;
  }
> = {
  objection: {
    label: "Objeción",
    icon: "💬",
    headline: "La IA encontró una barrera de venta.",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-100",
  },
  faq: {
    label: "FAQ",
    icon: "❓",
    headline: "La IA detectó una pregunta repetible.",
    color: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-100",
  },
  business_rule: {
    label: "Regla",
    icon: "⚙️",
    headline: "La IA recomienda una regla comercial.",
    color: "text-slate-800",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
  catalog_item: {
    label: "Catálogo",
    icon: "📦",
    headline: "La IA detectó algo que puede vivir en catálogo.",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-100",
  },
  escalation_rule: {
    label: "Escalación",
    icon: "👤",
    headline: "La IA detectó un caso que podría requerir humano.",
    color: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-100",
  },
  forbidden_promise: {
    label: "Bloqueo",
    icon: "🔒",
    headline: "La IA detectó una promesa que debe evitarse.",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-100",
  },
  followup: {
    label: "Seguimiento",
    icon: "🔁",
    headline: "La IA encontró una oportunidad de seguimiento.",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
  },
  offer: {
    label: "Oferta",
    icon: "🏷️",
    headline: "La IA encontró una posible ruta de venta.",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-100",
  },
  general: {
    label: "Insight",
    icon: "🧠",
    headline: "La IA detectó un aprendizaje útil.",
    color: "text-cyan-700",
    bg: "bg-cyan-50",
    border: "border-cyan-100",
  },
};

const INTENT_LABELS: Record<string, string> = {
  pricing: "Precio",
  payment_request: "Pago",
  follow_up: "Seguimiento",
  catalog_request: "Catálogo",
  shipping: "Envío",
  retail_request: "Menudeo",
  learned_faq: "FAQ aprendida",
};

const DESTINATION_LABELS: Record<string, string> = {
  rules: "Reglas comerciales",
  playbook: "Playbook",
  faq: "FAQs",
  knowledge_base: "Knowledge Base",
  catalog: "Catálogo",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  applied: "Integrado",
  rejected: "Descartado",
};

const RISK_LABELS: Record<string, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
};

export default function SalesAILearningPage() {
  return (
    <Suspense fallback={<LearningLoadingShell />}>
      <SalesAILearningContent />
    </Suspense>
  );
}

function SalesAILearningContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedBrandSlug = searchParams.get("brandSlug") || "";

  const [brand, setBrand] = useState<BrandContext>(fallbackBrand);
  const [status, setStatus] = useState("pending");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  const activeBrandSlug = brand.slug || requestedBrandSlug || "brand-os";
  const brandQuery = `brandSlug=${encodeURIComponent(activeBrandSlug)}`;

  const nav = useMemo(() => buildNav(activeBrandSlug), [activeBrandSlug]);

  const activeSuggestion = suggestions[activeIndex] || null;

  const stats = useMemo<LearningStats>(() => {
    const total = suggestions.length;
    const pending = suggestions.filter((item) => item.status === "pending").length;
    const approved = suggestions.filter((item) => item.status === "approved").length;
    const applied = suggestions.filter((item) => item.status === "applied").length;
    const rejected = suggestions.filter((item) => item.status === "rejected").length;
    const highImpact = suggestions.filter((item) => isHighImpact(item)).length;

    const avgConfidence =
      total > 0
        ? Math.round(
            suggestions.reduce(
              (sum, item) => sum + Number(item.confidence_score || 0),
              0
            ) / total
          )
        : 0;

    return {
      total,
      pending,
      approved,
      applied,
      rejected,
      highImpact,
      avgConfidence,
    };
  }, [suggestions]);

  useEffect(() => {
    loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedBrandSlug, status]);

  async function loadSuggestions(manageLoading = true) {
    try {
      if (manageLoading) setLoading(true);
      setMessage("");

      const params = new URLSearchParams();

      if (requestedBrandSlug) {
        params.set("brandSlug", requestedBrandSlug);
      }

      params.set("status", status);
      params.set("limit", "50");

      const res = await fetch(
        `/api/sales-ai/learning/suggestions?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (res.status === 401) {
        router.replace(
          `/login?next=${encodeURIComponent(
            requestedBrandSlug
              ? `/sales-ai/learning?brandSlug=${requestedBrandSlug}`
              : "/sales-ai/learning"
          )}`
        );
        return;
      }

      if (res.status === 403) {
        router.replace("/workspace");
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudieron cargar aprendizajes");
      }

      const nextBrand = data.brand || fallbackBrand;
      const nextSuggestions: Suggestion[] = data.suggestions || [];

      setBrand(nextBrand);
      setSuggestions(nextSuggestions);
      setActiveIndex(0);
      setDetailOpen(false);
      setQueueOpen(false);
    } catch (error: any) {
      setMessage(error?.message || "Error cargando aprendizajes");
      setBrand(fallbackBrand);
      setSuggestions([]);
      setActiveIndex(0);
    } finally {
      if (manageLoading) setLoading(false);
    }
  }

  async function runLearningEngine() {
    try {
      setLoading(true);
      setMessage("");

      const res = await fetch("/api/sales-ai/learning/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandSlug: activeBrandSlug,
          brandName: brand.name,
          minConfidence: 70,
          maxSuggestions: 5,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo analizar conversaciones");
      }

      setMessage(
        `Análisis listo · ${data.insertedCount || 0} aprendizajes nuevos`
      );

      await loadSuggestions(false);
    } catch (error: any) {
      setMessage(error?.message || "Error ejecutando Learning Engine");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(
    suggestionId: string,
    nextStatus: "approved" | "rejected"
  ) {
    try {
      setActionLoading(true);
      setMessage("");

      const res = await fetch("/api/sales-ai/learning/suggestions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          suggestionId,
          status: nextStatus,
          reviewNote:
            nextStatus === "approved"
              ? "Aprobado desde Learning Command Center"
              : "Descartado desde Learning Command Center",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo actualizar el aprendizaje");
      }

      setMessage(
        nextStatus === "approved"
          ? "Aprendizaje aprobado."
          : "Aprendizaje descartado."
      );

      await loadSuggestions(false);
    } catch (error: any) {
      setMessage(error?.message || "Error actualizando aprendizaje");
    } finally {
      setActionLoading(false);
    }
  }

  async function applySuggestion(suggestionId: string) {
    try {
      setActionLoading(true);
      setMessage("");

      const res = await fetch("/api/sales-ai/learning/suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ suggestionId }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "No se pudo integrar el aprendizaje");
      }

      setMessage("Aprendizaje integrado al agente.");

      await loadSuggestions(false);
    } catch (error: any) {
      setMessage(error?.message || "Error integrando aprendizaje");
    } finally {
      setActionLoading(false);
    }
  }

  function goNext() {
    if (suggestions.length === 0) return;
    setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    setDetailOpen(false);
  }

  function goPrev() {
    if (suggestions.length === 0) return;
    setActiveIndex((current) => Math.max(current - 1, 0));
    setDetailOpen(false);
  }

  return (
    <main className="min-h-screen bg-[#f2f7fb] text-slate-950">
      <section className="mx-auto grid min-h-screen w-full max-w-[1800px] grid-cols-1 gap-4 p-4 xl:grid-cols-[214px_minmax(0,1fr)_390px]">
        <Dock nav={nav} brand={brand} />

        <section className="flex min-w-0 flex-col gap-4">
          {message ? <SystemNotice message={message} /> : null}

          <LearningHero
            brand={brand}
            stats={stats}
            status={status}
            setStatus={setStatus}
            loading={loading}
            onRefresh={() => loadSuggestions()}
            onRunLearning={runLearningEngine}
          />

          <LearningMetrics stats={stats} loading={loading} />

          {loading ? (
            <LoadingState />
          ) : !activeSuggestion ? (
            <EmptyState onRunLearning={runLearningEngine} />
          ) : (
            <LearningCommandCenter
              suggestion={activeSuggestion}
              index={activeIndex}
              total={suggestions.length}
              detailOpen={detailOpen}
              setDetailOpen={setDetailOpen}
              queueOpen={queueOpen}
              setQueueOpen={setQueueOpen}
              suggestions={suggestions}
              setActiveIndex={setActiveIndex}
              actionLoading={actionLoading}
              onPrev={goPrev}
              onNext={goNext}
              onApprove={() => updateStatus(activeSuggestion.id, "approved")}
              onReject={() => updateStatus(activeSuggestion.id, "rejected")}
              onApply={() => applySuggestion(activeSuggestion.id)}
            />
          )}
        </section>

        <aside className="sticky top-4 hidden h-fit min-w-0 flex-col gap-4 xl:flex">
          <TopControls loading={loading} onRefresh={() => loadSuggestions()} />

          <LearningHealthCard stats={stats} loading={loading} />

          <LearningActions
            loading={loading}
            onRunLearning={runLearningEngine}
            onRefresh={() => loadSuggestions()}
          />

          <QuickLinks brandQuery={brandQuery} brandSlug={activeBrandSlug} />

          <SystemPrinciple />
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
    { code: "IN", label: "Inbox", href: `/sales-ai/inbox?${brandQuery}` },
    { code: "KB", label: "Knowledge", href: `/sales-ai/knowledge?${brandQuery}` },
    {
      code: "LR",
      label: "Learning",
      href: `/sales-ai/learning?${brandQuery}`,
      active: true,
    },
    { code: "MC", label: "Misión", href: `/cometa-os/design?${brandQuery}` },
  ];
}

function SystemNotice({ message }: { message: string }) {
  return (
    <div className="rounded-[26px] border border-cyan-100 bg-cyan-50 px-5 py-4 text-sm font-bold text-cyan-800">
      {message}
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
            Learning conectado
          </p>
        </div>
      </div>
    </aside>
  );
}

function LearningHero({
  brand,
  stats,
  status,
  setStatus,
  loading,
  onRefresh,
  onRunLearning,
}: {
  brand: BrandContext;
  stats: LearningStats;
  status: string;
  setStatus: (value: string) => void;
  loading: boolean;
  onRefresh: () => void;
  onRunLearning: () => void;
}) {
  return (
    <header className="relative overflow-hidden rounded-[38px] bg-slate-950 p-7 text-white shadow-[0_30px_100px_rgba(15,23,42,0.20)] md:p-8">
      <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-cyan-400/25 blur-[90px]" />
      <div className="absolute bottom-[-160px] left-[25%] h-72 w-72 rounded-full bg-emerald-400/15 blur-[95px]" />

      <div className="relative z-10 grid gap-8 2xl:grid-cols-[minmax(0,1fr)_390px] 2xl:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white">
              Sales AI
            </span>

            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
              Learning Hub
            </span>

            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
              {brand.name}
            </span>
          </div>

          <p className="mt-8 text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
            {brand.industry}
          </p>

          <h1 className="mt-3 max-w-5xl text-5xl font-black leading-[0.92] tracking-[-0.085em] md:text-6xl 2xl:text-[76px]">
            Learning
            <br />
            Command Center
          </h1>

          <p className="mt-6 max-w-4xl text-[17px] font-semibold leading-8 text-slate-300">
            La IA detecta dudas repetidas, objeciones, errores y oportunidades.
            Tú decides qué se convierte en conocimiento real del agente.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={onRunLearning}
              disabled={loading}
              className="flex h-14 items-center justify-center rounded-2xl bg-white px-6 text-sm font-black text-slate-950 transition hover:bg-cyan-100 disabled:opacity-50"
            >
              {loading ? "Analizando..." : "Analizar conversaciones"}
            </button>

            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-sm font-black text-white transition hover:bg-white/10 disabled:opacity-50"
            >
              Actualizar
            </button>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Learning Health
          </p>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-5xl font-black leading-[0.9] tracking-[-0.09em]">
                {loading ? "..." : stats.avgConfidence}
              </h2>

              <p className="mt-2 text-sm font-bold text-slate-300">
                Confianza promedio
              </p>
            </div>

            <ScoreRing value={stats.avgConfidence || 0} />
          </div>

          <div className="mt-6 grid gap-3">
            <label className="grid gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Filtro
              </span>

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white outline-none"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    className="text-slate-950"
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </header>
  );
}

function LearningMetrics({
  stats,
  loading,
}: {
  stats: LearningStats;
  loading: boolean;
}) {
  const items = [
    { label: "Total", value: stats.total, code: "TT" },
    { label: "Pendientes", value: stats.pending, code: "PN" },
    { label: "Integrados", value: stats.applied, code: "AP" },
    { label: "Críticos", value: stats.highImpact, code: "HI" },
    { label: "Confianza", value: `${stats.avgConfidence}%`, code: "CF" },
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

function LearningCommandCenter({
  suggestion,
  index,
  total,
  detailOpen,
  setDetailOpen,
  queueOpen,
  setQueueOpen,
  suggestions,
  setActiveIndex,
  actionLoading,
  onPrev,
  onNext,
  onApprove,
  onReject,
  onApply,
}: {
  suggestion: Suggestion;
  index: number;
  total: number;
  detailOpen: boolean;
  setDetailOpen: (value: boolean) => void;
  queueOpen: boolean;
  setQueueOpen: (value: boolean) => void;
  suggestions: Suggestion[];
  setActiveIndex: (index: number) => void;
  actionLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onApprove: () => void;
  onReject: () => void;
  onApply: () => void;
}) {
  const visual = getVisual(suggestion.suggestion_type);
  const priority = getPriorityScore(suggestion);
  const risk = suggestion.metadata?.risk_level || "low";

  const canApply =
    suggestion.status === "pending" || suggestion.status === "approved";
  const canApprove = suggestion.status === "pending";
  const canReject = suggestion.status === "pending";

  return (
    <section className="overflow-hidden rounded-[38px] border border-white bg-white shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
              Aprendizaje {index + 1} de {total}
            </p>

            <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
              Revisión inteligente
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setQueueOpen(!queueOpen)}
              className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              {queueOpen ? "Ocultar cola" : "Ver cola"}
            </button>

            <button
              onClick={onPrev}
              disabled={index === 0}
              className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Anterior
            </button>

            <button
              onClick={onNext}
              disabled={index >= total - 1}
              className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {queueOpen ? (
        <QueueStrip
          suggestions={suggestions}
          activeIndex={index}
          setActiveIndex={setActiveIndex}
        />
      ) : null}

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="p-6 md:p-8">
          <div className="mx-auto max-w-4xl">
            <div className="flex flex-col gap-5 md:flex-row md:items-start">
              <div
                className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] border text-4xl ${visual.bg} ${visual.border}`}
              >
                {visual.icon}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs font-black uppercase tracking-[0.22em] ${visual.color}`}
                  >
                    {visual.label}
                  </span>
                  <span className="text-xs font-black uppercase tracking-[0.22em] text-slate-300">
                    ·
                  </span>
                  <span className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">
                    {translateStatus(suggestion.status)}
                  </span>
                </div>

                <h2 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.06em] text-slate-950 md:text-5xl">
                  {getShortTitle(suggestion)}
                </h2>

                <p className="mt-4 max-w-2xl text-lg font-semibold leading-8 text-slate-500">
                  {visual.headline}
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <FlowCard
                icon="🔎"
                label="Detectó"
                value={
                  cleanDisplay(suggestion.reason) ||
                  "Una oportunidad de mejora en la conversación."
                }
              />

              <FlowCard
                icon="✨"
                label="Propone"
                value={cleanDisplay(suggestion.suggested_value)}
                accent
              />

              <FlowCard
                icon="🚀"
                label="Impacto"
                value={getImpactText(suggestion)}
              />
            </div>

            <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                    Qué pasará si lo integras
                  </p>
                  <p className="mt-2 text-sm font-bold leading-7 text-slate-700">
                    {getApplyExplanation(suggestion)}
                  </p>
                </div>

                <button
                  onClick={() => setDetailOpen(!detailOpen)}
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-100"
                >
                  {detailOpen ? "Ocultar detalle" : "Ver detalle"}
                </button>
              </div>

              {detailOpen ? <DetailGrid suggestion={suggestion} /> : null}
            </div>
          </div>
        </div>

        <aside className="border-t border-slate-100 bg-slate-50 p-6 xl:border-l xl:border-t-0">
          <div className="sticky top-5">
            <div className="rounded-[30px] bg-slate-950 p-6 text-white">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                Decisión rápida
              </p>

              <div className="mt-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-6xl font-black tracking-[-0.1em]">
                    {priority}
                  </p>
                  <p className="text-xs font-bold text-slate-400">
                    prioridad /100
                  </p>
                </div>

                <ScoreRing value={priority} />
              </div>

              <p className="mt-5 text-sm font-semibold leading-7 text-slate-300">
                {getRecommendationText(suggestion)}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <DecisionMini
                icon="✅"
                label="Confianza"
                value={`${suggestion.confidence_score}%`}
              />
              <DecisionMini
                icon="⚠️"
                label="Riesgo"
                value={translateRisk(risk)}
              />
              <DecisionMini
                icon="📍"
                label="Destino"
                value={translateDestination(
                  suggestion.metadata?.where_to_apply
                )}
              />
              <DecisionMini
                icon="📌"
                label="Estado"
                value={translateStatus(suggestion.status)}
              />
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {canApply ? (
                <button
                  onClick={onApply}
                  disabled={actionLoading}
                  className="rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-cyan-700 disabled:opacity-50"
                >
                  ⚡ Integrar aprendizaje
                </button>
              ) : null}

              {canApprove ? (
                <button
                  onClick={onApprove}
                  disabled={actionLoading}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  ✅ Aprobar
                </button>
              ) : null}

              {canReject ? (
                <button
                  onClick={onReject}
                  disabled={actionLoading}
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                >
                  ✕ Descartar
                </button>
              ) : null}

              {actionLoading ? (
                <div className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-slate-500">
                  Procesando...
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function QueueStrip({
  suggestions,
  activeIndex,
  setActiveIndex,
}: {
  suggestions: Suggestion[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
}) {
  return (
    <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {suggestions.map((suggestion, index) => {
          const visual = getVisual(suggestion.suggestion_type);
          const active = index === activeIndex;

          return (
            <button
              key={suggestion.id}
              onClick={() => setActiveIndex(index)}
              className={`min-w-[260px] rounded-2xl border p-3 text-left transition ${
                active
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                    active
                      ? "bg-white/10"
                      : `${visual.bg} ${visual.border} border`
                  }`}
                >
                  {visual.icon}
                </div>

                <div className="min-w-0">
                  <p
                    className={`text-[10px] font-black uppercase tracking-[0.16em] ${
                      active ? "text-slate-300" : visual.color
                    }`}
                  >
                    {visual.label}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm font-black leading-5">
                    {getShortTitle(suggestion)}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FlowCard({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: string;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-[28px] border p-5 ${
        accent ? "border-cyan-100 bg-cyan-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
          {label}
        </p>
      </div>

      <p className="mt-4 text-base font-bold leading-8 text-slate-700">
        {value || "Sin dato."}
      </p>
    </div>
  );
}

function DetailGrid({ suggestion }: { suggestion: Suggestion }) {
  return (
    <div className="mt-5 grid gap-3 border-t border-slate-200 pt-5 md:grid-cols-2">
      <DetailItem
        label="Dato actual"
        value={
          cleanDisplay(suggestion.current_value) ||
          "Sin dato previo registrado."
        }
      />
      <DetailItem
        label="Evidencia"
        value={
          cleanDisplay(suggestion.metadata?.evidence) ||
          "Sin evidencia específica registrada."
        }
      />
      <DetailItem
        label="Intención"
        value={translateIntent(suggestion.metadata?.detected_intent)}
      />
      <DetailItem
        label="Destino"
        value={translateDestination(suggestion.metadata?.where_to_apply)}
      />
      <DetailItem label="Detectado" value={formatDate(suggestion.created_at)} />
      <DetailItem
        label="Tipo"
        value={getVisual(suggestion.suggestion_type).label}
      />
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
        {value}
      </p>
    </div>
  );
}

function DecisionMini({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          {label}
        </p>
      </div>
      <p className="mt-2 truncate text-sm font-black text-slate-800">
        {value}
      </p>
    </div>
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
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex h-12 items-center gap-3 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800 disabled:opacity-50"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-300">
          <RefreshIcon />
        </span>
        Actualizar
      </button>
    </div>
  );
}

function LearningHealthCard({
  stats,
  loading,
}: {
  stats: LearningStats;
  loading: boolean;
}) {
  return (
    <section className="rounded-[38px] bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Learning Health
          </p>

          <h2 className="mt-4 whitespace-nowrap text-[46px] font-black leading-[0.92] tracking-[-0.075em]">
            {loading ? "..." : `${stats.avgConfidence}%`}
          </h2>

          <div className="mt-4 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <p className="text-sm font-bold text-slate-300">
              Confianza promedio
            </p>
          </div>
        </div>

        <ScoreRing value={stats.avgConfidence || 0} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <DarkMini label="Total" value={String(stats.total)} />
        <DarkMini label="Pendientes" value={String(stats.pending)} />
        <DarkMini label="Integrados" value={String(stats.applied)} />
        <DarkMini label="Críticos" value={String(stats.highImpact)} />
      </div>
    </section>
  );
}

function LearningActions({
  loading,
  onRunLearning,
  onRefresh,
}: {
  loading: boolean;
  onRunLearning: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-[34px] border border-white bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
        Acciones Learning
      </p>

      <div className="mt-5 grid gap-3">
        <button
          onClick={onRunLearning}
          disabled={loading}
          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-200 hover:bg-cyan-50 disabled:opacity-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-[10px] font-black text-white">
            AI
          </span>

          <span className="text-sm font-black text-slate-950">
            Analizar conversaciones
          </span>
        </button>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-200 hover:bg-cyan-50 disabled:opacity-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-[10px] font-black text-white">
            RF
          </span>

          <span className="text-sm font-black text-slate-950">
            Refrescar aprendizajes
          </span>
        </button>
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
    { label: "Mission Control", href: `/cometa-os/design?${brandQuery}` },
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

function SystemPrinciple() {
  return (
    <section className="rounded-[34px] border border-cyan-100 bg-cyan-50 p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
        Principio del aprendizaje
      </p>

      <p className="mt-3 text-sm font-black leading-6 text-slate-950">
        La IA propone, el humano decide.
      </p>

      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
        Ningún aprendizaje debe convertirse en regla comercial si no coincide
        con la operación real de la marca.
      </p>
    </section>
  );
}

function ScoreRing({ value }: { value: number }) {
  const safeValue = Math.min(100, Math.max(0, Number(value || 0)));

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

function LearningLoadingShell() {
  return (
    <main className="min-h-screen bg-[#f2f7fb] p-6">
      <div className="mx-auto max-w-6xl rounded-[38px] bg-slate-950 p-10 text-white">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
          Learning Hub
        </p>
        <h1 className="mt-4 text-5xl font-black tracking-[-0.08em]">
          Cargando aprendizajes...
        </h1>
      </div>
    </main>
  );
}

function LoadingState() {
  return (
    <section className="rounded-[38px] border border-white bg-white p-12 text-center shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-cyan-50 text-4xl">
        🧠
      </div>
      <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-slate-950">
        Analizando aprendizajes...
      </h2>
      <p className="mt-2 text-sm font-semibold text-slate-500">
        SALES AI está revisando señales comerciales y oportunidades de mejora.
      </p>
    </section>
  );
}

function EmptyState({ onRunLearning }: { onRunLearning: () => void }) {
  return (
    <section className="rounded-[38px] border border-white bg-white p-12 text-center shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-slate-50 text-4xl">
        ✨
      </div>
      <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-slate-950">
        No hay aprendizajes para revisar
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">
        Ejecuta un nuevo análisis para que SALES AI detecte oportunidades a
        partir de conversaciones recientes de esta marca.
      </p>
      <button
        onClick={onRunLearning}
        className="mt-6 rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white transition hover:bg-cyan-700"
      >
        Analizar conversaciones
      </button>
    </section>
  );
}

function getVisual(type: string) {
  return TYPE_VISUALS[type] || TYPE_VISUALS.general;
}

function isHighImpact(suggestion: Suggestion) {
  const risk = suggestion.metadata?.risk_level || "low";
  return risk === "high" || Number(suggestion.confidence_score || 0) >= 85;
}

function getPriorityScore(suggestion: Suggestion) {
  const confidence = Number(suggestion.confidence_score || 0);
  const risk = suggestion.metadata?.risk_level || "low";

  const riskScore = risk === "high" ? 25 : risk === "medium" ? 15 : 5;

  const typeScore =
    suggestion.suggestion_type === "business_rule" ||
    suggestion.suggestion_type === "escalation_rule" ||
    suggestion.suggestion_type === "forbidden_promise"
      ? 15
      : suggestion.suggestion_type === "faq" ||
        suggestion.suggestion_type === "objection"
      ? 10
      : 5;

  return Math.min(100, Math.round(confidence * 0.65 + riskScore + typeScore));
}

function getShortTitle(suggestion: Suggestion) {
  const title = cleanDisplay(suggestion.title);

  if (
    suggestion.suggestion_type === "escalation_rule" &&
    title.toLowerCase().includes("precios")
  ) {
    return "Precio sin calificación";
  }

  if (
    suggestion.suggestion_type === "business_rule" &&
    title.toLowerCase().includes("calificación")
  ) {
    return "Calificar antes de vender";
  }

  if (
    suggestion.suggestion_type === "faq" &&
    title.toLowerCase().includes("métodos de pago")
  ) {
    return "Falta información de pago";
  }

  return title || "Aprendizaje detectado";
}

function getImpactText(suggestion: Suggestion) {
  const type = suggestion.suggestion_type;

  if (type === "escalation_rule") {
    return "Protege al equipo cuando el prospecto necesita confirmación humana.";
  }

  if (type === "business_rule") {
    return "Evita respuestas sin datos clave y mejora la calidad de calificación.";
  }

  if (type === "faq") {
    return "Permite responder más rápido preguntas frecuentes sin depender del humano.";
  }

  if (type === "objection") {
    return "Ayuda a convertir dudas comunes en oportunidades de venta.";
  }

  if (type === "followup") {
    return "Aumenta la probabilidad de recuperar prospectos que se enfrían.";
  }

  return "Fortalece la memoria comercial del agente para futuras conversaciones.";
}

function getRecommendationText(suggestion: Suggestion) {
  if (suggestion.status === "applied") {
    return "Este aprendizaje ya fue integrado. SALES AI podrá usarlo en próximas conversaciones.";
  }

  if (suggestion.status === "rejected") {
    return "Este aprendizaje fue descartado y no se usará para entrenar al agente.";
  }

  if (suggestion.metadata?.risk_level === "high") {
    return "Revisar antes de integrar. Puede afectar reglas comerciales o condiciones de escalación.";
  }

  if (Number(suggestion.confidence_score || 0) >= 85) {
    return "Alta confianza. Conviene integrarlo si coincide con la operación real.";
  }

  return "Revisar y decidir. Puede mejorar respuestas futuras del agente.";
}

function getApplyExplanation(suggestion: Suggestion) {
  const type = suggestion.suggestion_type;

  if (type === "faq") {
    return "Se convertirá en una respuesta frecuente para futuras conversaciones.";
  }

  if (
    type === "business_rule" ||
    type === "escalation_rule" ||
    type === "forbidden_promise" ||
    type === "followup"
  ) {
    return "Se convertirá en una regla comercial dentro del Knowledge Brain.";
  }

  if (type === "catalog_item" || type === "offer") {
    return "Se creará un elemento comercial pendiente de validación.";
  }

  return "Se guardará como aprendizaje comercial para futuras decisiones.";
}

function translateStatus(value?: string | null) {
  if (!value) return "Sin estado";
  return STATUS_LABELS[value] || value;
}

function translateRisk(value?: string | null) {
  if (!value) return "Bajo";
  return RISK_LABELS[value] || value;
}

function translateIntent(value?: string | null) {
  if (!value) return "No detectada";
  return INTENT_LABELS[value] || value;
}

function translateDestination(value?: string | null) {
  if (!value) return "Knowledge Base";
  return DESTINATION_LABELS[value] || value;
}

function cleanDisplay(value: any) {
  if (value === null || value === undefined) return "";

  const text = String(value).trim();

  if (
    !text ||
    text.toLowerCase() === "null" ||
    text.toLowerCase() === "undefined"
  ) {
    return "";
  }

  return text;
}

function formatDate(value: string) {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
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