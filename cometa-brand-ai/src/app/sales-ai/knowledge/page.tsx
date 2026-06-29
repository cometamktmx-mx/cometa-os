"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type SectionKey = "brain" | "catalog" | "rules" | "faqs" | "notes" | "gaps";
type ModalType = "catalog" | "rule" | "faq" | "note" | null;
type AccessType = "view" | "edit" | "soon";

type NavItem = {
  code: string;
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
  access?: AccessType;
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

type KnowledgeBase = {
  brandName: string;
  knowledgeSources: any[];
  catalogItems: any[];
  businessRules: any[];
  faqs: any[];
  suggestions: any[];
};

type KnowledgeGap = {
  key: string;
  title: string;
  description: string;
  ruleType: string;
  ruleName: string;
  ruleContent: string;
  conditionText: string;
  priority: number;
  requiresHumanConfirmation: boolean;
};

type Counts = {
  catalog: number;
  rules: number;
  faqs: number;
  notes: number;
  suggestions: number;
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

const ruleTypes = [
  { value: "general", label: "General" },
  { value: "pricing", label: "Precios" },
  { value: "payment", label: "Pagos" },
  { value: "shipping", label: "Envíos" },
  { value: "stock", label: "Stock / disponibilidad" },
  { value: "schedule", label: "Horarios" },
  { value: "promotion", label: "Promociones" },
  { value: "objection", label: "Objeciones" },
  { value: "tone", label: "Tono de atención" },
  { value: "escalation", label: "Escalación humana" },
  { value: "forbidden", label: "Lo que NO puede decir" },
  { value: "followup", label: "Seguimiento" },
];

export default function SalesAIKnowledgeBrainPage() {
  return (
    <Suspense fallback={<KnowledgeLoadingScreen />}>
      <SalesAIKnowledgeBrainInner />
    </Suspense>
  );
}

function SalesAIKnowledgeBrainInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedBrandSlug = searchParams.get("brandSlug") || "";

  const [brand, setBrand] = useState<BrandContext>(fallbackBrand);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(
    null
  );
  const [activeSection, setActiveSection] = useState<SectionKey>("brain");
  const [modalType, setModalType] = useState<ModalType>(null);
  const [prefillRule, setPrefillRule] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [systemMessage, setSystemMessage] = useState("");

  const activeBrandSlug = brand.slug || requestedBrandSlug || "brand-os";
  const brandQuery = `brandSlug=${encodeURIComponent(activeBrandSlug)}`;
  const nav = useMemo(() => buildNav(activeBrandSlug), [activeBrandSlug]);

  const counts: Counts = useMemo(() => {
    return {
      catalog: knowledgeBase?.catalogItems?.length || 0,
      rules: knowledgeBase?.businessRules?.length || 0,
      faqs: knowledgeBase?.faqs?.length || 0,
      notes: knowledgeBase?.knowledgeSources?.length || 0,
      suggestions: knowledgeBase?.suggestions?.length || 0,
    };
  }, [knowledgeBase]);

  const gaps = useMemo<KnowledgeGap[]>(
    () => detectKnowledgeGaps(knowledgeBase),
    [knowledgeBase]
  );

  const readiness = useMemo(() => {
    let score = 0;

    if (counts.catalog > 0) score += 22;
    if (counts.rules > 0) score += 24;
    if (counts.faqs > 0) score += 16;
    if (counts.notes > 0) score += 12;

    if (hasRuleType(knowledgeBase, "pricing")) score += 7;
    if (hasRuleType(knowledgeBase, "payment")) score += 6;
    if (hasRuleType(knowledgeBase, "shipping")) score += 5;
    if (hasRuleType(knowledgeBase, "stock")) score += 4;
    if (hasRuleType(knowledgeBase, "escalation")) score += 4;

    return Math.min(score, 100);
  }, [counts, knowledgeBase]);

  useEffect(() => {
    loadKnowledge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedBrandSlug]);

  async function loadKnowledge() {
    try {
      setLoading(true);
      setSystemMessage("");

      const query = requestedBrandSlug
        ? `?brandSlug=${encodeURIComponent(requestedBrandSlug)}`
        : "";

      const res = await fetch(`/api/sales-ai/knowledge${query}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json();

      if (res.status === 401) {
        router.replace(
          `/login?next=${encodeURIComponent(
            requestedBrandSlug
              ? `/sales-ai/knowledge?brandSlug=${requestedBrandSlug}`
              : "/sales-ai/knowledge"
          )}`
        );
        return;
      }

      if (res.status === 403) {
        router.replace("/workspace");
        return;
      }

      if (!res.ok || data.ok === false) {
        throw new Error(
          data?.error || "No se pudo cargar la información para agentes IA."
        );
      }

      setBrand(data.brand || fallbackBrand);
      setKnowledgeBase(normalizeKnowledgeBase(data, data.brand?.name));
    } catch (error: any) {
      setSystemMessage(
        error?.message || "Error cargando información para agentes IA."
      );
      setBrand(fallbackBrand);
      setKnowledgeBase(null);
    } finally {
      setLoading(false);
    }
  }

  function openGapAsRule(gap: KnowledgeGap) {
    setPrefillRule({
      ruleType: gap.ruleType,
      ruleName: gap.ruleName,
      ruleContent: gap.ruleContent,
      conditionText: gap.conditionText,
      priority: gap.priority,
      requiresHumanConfirmation: gap.requiresHumanConfirmation,
    });

    setModalType("rule");
  }

  return (
    <main className="min-h-screen bg-[#f2f7fb] text-slate-950">
      <section className="mx-auto grid min-h-screen w-full max-w-[1800px] grid-cols-1 gap-4 p-4 xl:grid-cols-[238px_minmax(0,1fr)_390px]">
        <Dock nav={nav} brand={brand} />

        <section className="flex min-w-0 flex-col gap-4">
          {systemMessage ? <LoadWarning message={systemMessage} /> : null}

          <Hero
            brand={brand}
            readiness={readiness}
            counts={counts}
            loading={loading}
            gapsCount={gaps.length}
            onRefresh={loadKnowledge}
            onAdd={() => setModalType("catalog")}
          />

          <KnowledgeMetrics
            readiness={readiness}
            counts={counts}
            gapsCount={gaps.length}
            loading={loading}
          />

          <EditableBoundary />

          <KnowledgeCore
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            readiness={readiness}
            counts={counts}
            gaps={gaps}
          />

          <KnowledgeDetails
            activeSection={activeSection}
            knowledgeBase={knowledgeBase}
            gaps={gaps}
            loading={loading}
            onAdd={() => setModalType(getModalFromSection(activeSection))}
            onCreateRule={openGapAsRule}
          />
        </section>

        <aside className="sticky top-4 hidden h-fit min-w-0 flex-col gap-4 xl:flex">
          <TopControls onRefresh={loadKnowledge} loading={loading} />

          <ReadinessPanel readiness={readiness} gapsCount={gaps.length} />

          <BrainActions
            onCatalog={() => setModalType("catalog")}
            onRule={() => setModalType("rule")}
            onFaq={() => setModalType("faq")}
            onNote={() => setModalType("note")}
            onGaps={() => setActiveSection("gaps")}
          />

          <QuickLinks brandQuery={brandQuery} brandSlug={activeBrandSlug} />

          <SystemPrinciple gapsCount={gaps.length} />
        </aside>
      </section>

      {modalType ? (
        <KnowledgeModal
          brand={brand}
          modalType={modalType}
          prefillRule={prefillRule}
          onClose={() => {
            setModalType(null);
            setPrefillRule(null);
          }}
          onSaved={async () => {
            setModalType(null);
            setPrefillRule(null);
            await loadKnowledge();
          }}
        />
      ) : null}
    </main>
  );
}

function KnowledgeLoadingScreen() {
  return (
    <main className="min-h-screen bg-[#f2f7fb] p-6">
      <div className="mx-auto max-w-6xl rounded-[38px] bg-slate-950 p-10 text-white">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
          Información para Agentes IA
        </p>
        <h1 className="mt-4 text-5xl font-black tracking-[-0.08em]">
          Cargando base comercial...
        </h1>
      </div>
    </main>
  );
}

function buildNav(brandSlug: string): NavItem[] {
  const safeBrandSlug = encodeURIComponent(brandSlug || "brand-os");
  const brandQuery = `brandSlug=${safeBrandSlug}`;

  return [
    {
      code: "IN",
      label: "Resumen",
      href: `/brand/${safeBrandSlug}`,
      access: "view",
    },
    {
      code: "CD",
      label: "Cuenta Digital",
      href: `/brand/${safeBrandSlug}#cuenta-digital`,
      access: "view",
    },
    {
      code: "TR",
      label: "Trabajo Realizado",
      href: `/brand/${safeBrandSlug}#trabajo-realizado`,
      access: "view",
    },
    {
      code: "MC",
      label: "Estrategia",
      href: `/brand/${safeBrandSlug}#estrategia-mes`,
      access: "view",
    },
    {
      code: "SA",
      label: "Ventas / Leads",
      href: `/sales-ai/inbox?${brandQuery}`,
      access: "edit",
    },
    {
      code: "AI",
      label: "Agentes IA",
      href: `/sales-ai/knowledge?${brandQuery}`,
      active: true,
      access: "edit",
    },
    {
      code: "CX",
      label: "Conexiones",
      href: `/brand/${safeBrandSlug}#conexiones`,
      access: "edit",
    },
    {
      code: "RP",
      label: "Reportes",
      href: `/brand/${safeBrandSlug}#reportes`,
      access: "view",
    },
    {
      code: "IV",
      label: "Inventario",
      href: `/brand/${safeBrandSlug}#inventario`,
      disabled: true,
      access: "soon",
    },
    {
      code: "OP",
      label: "Oportunidades",
      href: `/brand/${safeBrandSlug}#oportunidades`,
      disabled: true,
      access: "soon",
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
          <p className="text-xs font-bold text-emerald-700">Acceso</p>
          <p className="truncate text-xs font-black text-emerald-950">
            Información editable
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

function Hero({
  brand,
  readiness,
  counts,
  loading,
  gapsCount,
  onRefresh,
  onAdd,
}: {
  brand: BrandContext;
  readiness: number;
  counts: Counts;
  loading: boolean;
  gapsCount: number;
  onRefresh: () => void;
  onAdd: () => void;
}) {
  return (
    <header className="relative overflow-hidden rounded-[38px] bg-slate-950 p-7 text-white shadow-[0_30px_100px_rgba(15,23,42,0.20)] md:p-8">
      <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-cyan-400/25 blur-[90px]" />
      <div className="absolute bottom-[-160px] left-[25%] h-72 w-72 rounded-full bg-emerald-400/15 blur-[95px]" />

      <div className="relative z-10 grid gap-8 2xl:grid-cols-[minmax(0,1fr)_390px] 2xl:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white">
              Agentes IA
            </span>

            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
              Información editable
            </span>

            <span
              className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${
                gapsCount
                  ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                  : "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
              }`}
            >
              {gapsCount ? `${gapsCount} huecos` : "Base activa"}
            </span>
          </div>

          <p className="mt-8 text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
            {brand.name}
          </p>

          <h1 className="mt-3 max-w-5xl text-5xl font-black leading-[0.92] tracking-[-0.085em] md:text-6xl 2xl:text-[76px]">
            Información
            <br />
            para Agentes IA
          </h1>

          <p className="mt-6 max-w-4xl text-[17px] font-semibold leading-8 text-slate-300">
            Aquí el cliente actualiza la información real del negocio: productos,
            reglas, preguntas frecuentes, restricciones y contexto comercial. Los
            agentes usan estos datos para responder sin inventar.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onAdd}
              className="flex h-14 items-center justify-center rounded-2xl bg-white px-6 text-sm font-black text-slate-950 transition hover:bg-cyan-100"
            >
              + Agregar información
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-sm font-black text-white transition hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? "Sincronizando..." : "Actualizar"}
            </button>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Preparación IA
          </p>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-5xl font-black leading-[0.9] tracking-[-0.09em]">
                {loading ? "..." : `${readiness}%`}
              </h2>

              <p className="mt-2 text-sm font-bold text-slate-300">
                Información aprobada
              </p>
            </div>

            <ScoreRing value={readiness} />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <DarkMini label="Catálogo" value={String(counts.catalog)} />
            <DarkMini label="Reglas" value={String(counts.rules)} />
            <DarkMini label="FAQs" value={String(counts.faqs)} />
            <DarkMini label="Contexto" value={String(counts.notes)} />
          </div>
        </div>
      </div>
    </header>
  );
}

function KnowledgeMetrics({
  readiness,
  counts,
  gapsCount,
  loading,
}: {
  readiness: number;
  counts: Counts;
  gapsCount: number;
  loading: boolean;
}) {
  const items = [
    { label: "Preparación", value: `${readiness}%`, code: "RD" },
    { label: "Catálogo", value: counts.catalog, code: "CT" },
    { label: "Reglas", value: counts.rules, code: "RL" },
    { label: "FAQs", value: counts.faqs, code: "FQ" },
    { label: "Huecos", value: gapsCount, code: "GP" },
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

function EditableBoundary() {
  return (
    <section className="grid gap-4 2xl:grid-cols-2">
      <article className="rounded-[34px] border border-emerald-100 bg-emerald-50 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">
          Editable por cliente
        </p>

        <h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-slate-950">
          Información real del negocio
        </h2>

        <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
          Productos, servicios, precios autorizados, promociones, horarios,
          reglas de venta, preguntas frecuentes, restricciones, objeciones y tono
          de atención.
        </p>
      </article>

      <article className="rounded-[34px] border border-slate-200 bg-white p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
          No editable por cliente
        </p>

        <h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-slate-950">
          Lógica interna de Cometa OS
        </h2>

        <p className="mt-4 text-sm font-semibold leading-7 text-slate-500">
          Prompts, scoring, estrategia, hipótesis internas, criterio de agentes,
          automatizaciones sensibles y decisiones estratégicas aprobadas por
          Cometa.
        </p>
      </article>
    </section>
  );
}

function TopControls({
  onRefresh,
  loading,
}: {
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex justify-end gap-3">
      <button
        type="button"
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

function KnowledgeCore({
  activeSection,
  setActiveSection,
  readiness,
  counts,
  gaps,
}: {
  activeSection: SectionKey;
  setActiveSection: (section: SectionKey) => void;
  readiness: number;
  counts: Counts;
  gaps: KnowledgeGap[];
}) {
  const sections: {
    key: SectionKey;
    code: string;
    title: string;
    description: string;
    value: string | number;
    warning?: boolean;
  }[] = [
    {
      key: "brain",
      code: "AI",
      title: "Resumen IA",
      description: "Vista general de la información que usan los agentes.",
      value: `${readiness}%`,
    },
    {
      key: "catalog",
      code: "CAT",
      title: "Catálogo",
      description: "Productos, servicios, lotes u ofertas que puede vender.",
      value: counts.catalog,
    },
    {
      key: "rules",
      code: "REG",
      title: "Reglas",
      description: "Límites, condiciones y decisiones comerciales.",
      value: counts.rules,
    },
    {
      key: "faqs",
      code: "FAQ",
      title: "FAQs",
      description: "Preguntas frecuentes con respuestas autorizadas.",
      value: counts.faqs,
    },
    {
      key: "notes",
      code: "CTX",
      title: "Contexto",
      description: "Información general que el agente debe entender.",
      value: counts.notes,
    },
    {
      key: "gaps",
      code: "GAP",
      title: "Huecos",
      description: "Información faltante que puede causar errores.",
      value: gaps.length,
      warning: gaps.length > 0,
    },
  ];

  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Base de información IA
          </p>

          <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
            Información que usan los agentes
          </h2>
        </div>

        <span
          className={`w-fit rounded-full border px-5 py-2 text-xs font-black uppercase tracking-[0.16em] ${
            gaps.length
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {gaps.length ? `${gaps.length} huecos` : "Base saludable"}
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {sections.map((item) => {
          const isActive = activeSection === item.key;

          return (
            <button
              type="button"
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              className={`group rounded-[30px] border p-5 text-left transition hover:-translate-y-1 ${
                isActive
                  ? "border-cyan-200 bg-cyan-50"
                  : item.warning
                  ? "border-amber-200 bg-amber-50"
                  : "border-slate-200 bg-slate-50/70 hover:border-cyan-200 hover:bg-cyan-50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-xs font-black text-cyan-700 shadow-sm">
                  {item.code}
                </div>

                <p className="text-3xl font-black tracking-[-0.07em] text-slate-950">
                  {item.value}
                </p>
              </div>

              <h3 className="mt-5 text-2xl font-black tracking-[-0.055em] text-slate-950">
                {item.title}
              </h3>

              <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                {item.description}
              </p>

              <p className="mt-5 text-sm font-black text-cyan-700">
                Revisar →
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function KnowledgeDetails({
  activeSection,
  knowledgeBase,
  gaps,
  loading,
  onAdd,
  onCreateRule,
}: {
  activeSection: SectionKey;
  knowledgeBase: KnowledgeBase | null;
  gaps: KnowledgeGap[];
  loading: boolean;
  onAdd: () => void;
  onCreateRule: (gap: KnowledgeGap) => void;
}) {
  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            {getSectionEyebrow(activeSection)}
          </p>
          <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
            {getSectionTitle(activeSection)}
          </h2>
        </div>

        <button
          type="button"
          onClick={onAdd}
          className="min-h-12 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-cyan-700"
        >
          + Agregar
        </button>
      </div>

      <div className="pt-5">
        {loading ? (
          <EmptyState title="Cargando información..." />
        ) : activeSection === "brain" ? (
          <BrainSummary knowledgeBase={knowledgeBase} gaps={gaps} />
        ) : activeSection === "catalog" ? (
          <CatalogList items={knowledgeBase?.catalogItems || []} />
        ) : activeSection === "rules" ? (
          <RulesList rules={knowledgeBase?.businessRules || []} />
        ) : activeSection === "faqs" ? (
          <FaqList faqs={knowledgeBase?.faqs || []} />
        ) : activeSection === "notes" ? (
          <NotesList notes={knowledgeBase?.knowledgeSources || []} />
        ) : (
          <GapsList gaps={gaps} onCreateRule={onCreateRule} />
        )}
      </div>
    </section>
  );
}

function BrainSummary({
  knowledgeBase,
  gaps,
}: {
  knowledgeBase: KnowledgeBase | null;
  gaps: KnowledgeGap[];
}) {
  const catalog = knowledgeBase?.catalogItems || [];
  const rules = knowledgeBase?.businessRules || [];
  const faqs = knowledgeBase?.faqs || [];
  const notes = knowledgeBase?.knowledgeSources || [];

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <CompactBrainCard
        code="CAT"
        title="Catálogo"
        value={catalog.length}
        items={catalog.slice(0, 3).map((item: any) => item.name)}
      />

      <CompactBrainCard
        code="REG"
        title="Reglas"
        value={rules.length}
        items={rules
          .slice(0, 3)
          .map((item: any) => item.rule_name || item.ruleName)}
      />

      <CompactBrainCard
        code="FAQ"
        title="FAQs"
        value={faqs.length}
        items={faqs.slice(0, 3).map((item: any) => item.question)}
      />

      <CompactBrainCard
        code="CTX"
        title="Contexto"
        value={notes.length}
        items={notes.slice(0, 3).map((item: any) => item.title)}
      />

      <div
        className={`rounded-[30px] border p-5 lg:col-span-4 ${
          gaps.length
            ? "border-amber-100 bg-amber-50"
            : "border-emerald-100 bg-emerald-50"
        }`}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p
              className={`text-[10px] font-black uppercase tracking-[0.22em] ${
                gaps.length ? "text-amber-700" : "text-emerald-700"
              }`}
            >
              Estado de la información IA
            </p>

            <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
              {gaps.length
                ? `Hay ${gaps.length} huecos por resolver`
                : "Los agentes tienen una base saludable"}
            </h3>
          </div>

          <p className="max-w-xl text-sm font-semibold leading-6 text-slate-600">
            {gaps.length
              ? "Resolver estos huecos reduce respuestas inseguras, errores comerciales y escalaciones innecesarias."
              : "Los agentes pueden responder con mayor seguridad usando información aprobada por el negocio."}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompactBrainCard({
  code,
  title,
  value,
  items,
}: {
  code: string;
  title: string;
  value: number;
  items: string[];
}) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-xs font-black text-cyan-700">
          {code}
        </div>

        <div className="text-right">
          <p className="text-3xl font-black leading-none tracking-[-0.07em] text-slate-950">
            {value}
          </p>
          <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
            items
          </p>
        </div>
      </div>

      <h3 className="mt-4 text-xl font-black tracking-[-0.05em] text-slate-950">
        {title}
      </h3>

      <div className="mt-4 grid gap-2">
        {items.length ? (
          items.map((item, index) => (
            <div
              key={`${item}-${index}`}
              className="truncate rounded-2xl bg-slate-50 px-3 py-2.5 text-xs font-black text-slate-700"
            >
              {item}
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs font-black text-slate-400">
            Sin datos.
          </div>
        )}
      </div>
    </article>
  );
}

function CatalogList({ items }: { items: any[] }) {
  if (!items.length) {
    return <EmptyState title="Todavía no hay catálogo cargado." />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => (
        <article
          key={item.id || item.name}
          className="rounded-[30px] border border-slate-200 bg-white p-5"
        >
          <span className="rounded-full bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">
            {item.item_type || item.itemType || "Producto"}
          </span>

          <h3 className="mt-3 text-2xl font-black tracking-[-0.05em] text-slate-950">
            {item.name}
          </h3>

          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            {item.description || "Sin descripción cargada."}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <InfoMini
              label="Precio"
              value={item.price_text || item.priceText || "No definido"}
            />
            <InfoMini
              label="Pedido mínimo"
              value={
                item.minimum_order_text ||
                item.minimumOrderText ||
                "No definido"
              }
            />
            <InfoMini
              label="Disponibilidad"
              value={item.availability_status || "Por confirmar"}
            />
            <InfoMini
              label="Humano"
              value={item.requires_human_confirmation ? "Sí" : "No"}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function RulesList({ rules }: { rules: any[] }) {
  if (!rules.length) {
    return <EmptyState title="Todavía no hay reglas comerciales." />;
  }

  return (
    <div className="grid gap-4">
      {rules.map((rule) => (
        <article
          key={rule.id || rule.rule_name || rule.ruleName}
          className="rounded-[30px] border border-slate-200 bg-white p-5"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700">
                {rule.rule_type || rule.ruleType || "general"}
              </span>

              <h3 className="mt-3 text-xl font-black tracking-[-0.04em] text-slate-950">
                {rule.rule_name || rule.ruleName}
              </h3>

              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                {rule.rule_content || rule.ruleContent}
              </p>
            </div>

            <div className="grid min-w-[240px] grid-cols-2 gap-3">
              <InfoMini label="Prioridad" value={String(rule.priority || 80)} />
              <InfoMini
                label="Humano"
                value={rule.requires_human_confirmation ? "Sí" : "No"}
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function FaqList({ faqs }: { faqs: any[] }) {
  if (!faqs.length) {
    return <EmptyState title="Todavía no hay FAQs cargadas." />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {faqs.map((faq) => (
        <article
          key={faq.id || faq.question}
          className="rounded-[30px] border border-slate-200 bg-white p-5"
        >
          <span className="rounded-full bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
            FAQ
          </span>

          <h3 className="mt-3 text-xl font-black tracking-[-0.04em] text-slate-950">
            {faq.question}
          </h3>

          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
            {faq.answer}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <InfoMini label="Intención" value={faq.intent || "General"} />
            <InfoMini
              label="Humano"
              value={faq.requires_human_confirmation ? "Sí" : "No"}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function NotesList({ notes }: { notes: any[] }) {
  if (!notes.length) {
    return <EmptyState title="Todavía no hay contexto cargado." />;
  }

  return (
    <div className="grid gap-4">
      {notes.map((note) => (
        <article
          key={note.id || note.title}
          className="rounded-[30px] border border-slate-200 bg-white p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
              {note.source_type || note.sourceType || "Contexto"}
            </span>

            <span className="text-xs font-black text-slate-400">
              Confianza {note.confidence_score || note.confidenceScore || 100}%
            </span>
          </div>

          <h3 className="mt-3 text-xl font-black tracking-[-0.04em] text-slate-950">
            {note.title}
          </h3>

          <p className="mt-4 whitespace-pre-line rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-7 text-slate-600">
            {note.content_text || note.contentText}
          </p>
        </article>
      ))}
    </div>
  );
}

function GapsList({
  gaps,
  onCreateRule,
}: {
  gaps: KnowledgeGap[];
  onCreateRule: (gap: KnowledgeGap) => void;
}) {
  if (!gaps.length) {
    return (
      <div className="rounded-[32px] border border-emerald-100 bg-emerald-50 p-8 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">
          Base saludable
        </p>
        <h3 className="mt-3 text-3xl font-black tracking-[-0.06em] text-emerald-950">
          No hay huecos críticos detectados
        </h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-7 text-emerald-800">
          Los agentes tienen una base comercial más sólida para responder sin
          inventar información crítica.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {gaps.map((gap) => (
        <article
          key={gap.key}
          className="rounded-[30px] border border-amber-100 bg-amber-50 p-5"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
                Información faltante
              </p>

              <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-amber-950">
                {gap.title}
              </h3>

              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-amber-900">
                {gap.description}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onCreateRule(gap)}
              className="h-12 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-cyan-700"
            >
              Crear regla
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-[30px] border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
      <h3 className="text-2xl font-black tracking-[-0.05em] text-slate-950">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-500">
        Agrega información real del negocio para que los agentes IA puedan
        responder con seguridad. Si no existe una respuesta autorizada, la IA
        deberá preguntar, usar reglas aprobadas o escalar a revisión humana.
      </p>
    </div>
  );
}

function ReadinessPanel({
  readiness,
  gapsCount,
}: {
  readiness: number;
  gapsCount: number;
}) {
  return (
    <section className="rounded-[38px] bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Preparación IA
          </p>

          <h2 className="mt-4 whitespace-nowrap text-[46px] font-black leading-[0.92] tracking-[-0.075em]">
            {readiness}%
          </h2>

          <div className="mt-4 flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                gapsCount ? "bg-amber-400" : "bg-emerald-400"
              }`}
            />
            <p className="text-sm font-bold text-slate-300">
              {gapsCount ? "Requiere datos" : "Base saludable"}
            </p>
          </div>
        </div>

        <ScoreRing value={readiness} />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
          <span>Información aprobada</span>
          <span>{readiness}%</span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.8)]"
            style={{ width: `${readiness}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <DarkMini label="Huecos" value={String(gapsCount)} />
        <DarkMini label="Estado" value={gapsCount ? "Revisión" : "Sólido"} />
        <DarkMini label="Uso" value="Agentes IA" />
        <DarkMini label="Control" value="Cometa" />
      </div>
    </section>
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

function BrainActions({
  onCatalog,
  onRule,
  onFaq,
  onNote,
  onGaps,
}: {
  onCatalog: () => void;
  onRule: () => void;
  onFaq: () => void;
  onNote: () => void;
  onGaps: () => void;
}) {
  const buttons = [
    { code: "CAT", label: "Subir catálogo", action: onCatalog },
    { code: "REG", label: "Crear regla", action: onRule },
    { code: "FAQ", label: "Crear FAQ", action: onFaq },
    { code: "CTX", label: "Agregar contexto", action: onNote },
    { code: "GAP", label: "Ver huecos", action: onGaps },
  ];

  return (
    <section className="rounded-[34px] border border-white bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
        Información editable
      </p>

      <div className="mt-5 grid gap-3">
        {buttons.map((button) => (
          <button
            type="button"
            key={button.code}
            onClick={button.action}
            className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-200 hover:bg-cyan-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-[10px] font-black text-white">
              {button.code}
            </span>

            <span className="text-sm font-black text-slate-950">
              {button.label}
            </span>
          </button>
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
    { label: "Dashboard", href: `/brand/${brandSlug}` },
    { label: "Ventas / Leads", href: `/sales-ai/inbox?${brandQuery}` },
    { label: "Conexiones", href: `/brand/${brandSlug}#conexiones` },
    { label: "Reportes", href: `/brand/${brandSlug}#reportes` },
  ];

  return (
    <section className="rounded-[34px] border border-cyan-100 bg-cyan-50 p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
        Navegación
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

function SystemPrinciple({ gapsCount }: { gapsCount: number }) {
  return (
    <section
      className={`rounded-[34px] border p-5 shadow-sm ${
        gapsCount
          ? "border-amber-100 bg-amber-50"
          : "border-cyan-100 bg-cyan-50"
      }`}
    >
      <p
        className={`text-[10px] font-black uppercase tracking-[0.22em] ${
          gapsCount ? "text-amber-700" : "text-cyan-700"
        }`}
      >
        Principio del sistema
      </p>

      <p className="mt-3 text-sm font-black leading-6 text-slate-950">
        Si la IA no sabe, no inventa.
      </p>

      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
        Primero usa información aprobada. Si falta un dato, pregunta o escala a
        revisión humana.
      </p>
    </section>
  );
}

function KnowledgeModal({
  brand,
  modalType,
  prefillRule,
  onClose,
  onSaved,
}: {
  brand: BrandContext;
  modalType: ModalType;
  prefillRule?: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [catalogForm, setCatalogForm] = useState({
    itemType: "product",
    name: "",
    description: "",
    category: "",
    priceText: "",
    minimumOrderText: "",
    availabilityStatus: "requires_confirmation",
    stockNotes: "",
    idealFor: "",
    salesAngle: "",
    whenToOffer: "",
    requiresHumanConfirmation: false,
  });

  const [ruleForm, setRuleForm] = useState(
    prefillRule || {
      ruleType: "general",
      ruleName: "",
      ruleContent: "",
      conditionText: "",
      priority: 80,
      requiresHumanConfirmation: false,
    }
  );

  const [faqForm, setFaqForm] = useState({
    question: "",
    answer: "",
    intent: "",
    keywords: "",
    requiresHumanConfirmation: false,
  });

  const [noteForm, setNoteForm] = useState({
    sourceType: "manual_note",
    title: "",
    contentText: "",
    confidenceScore: 100,
  });

  async function save() {
    try {
      setSaving(true);
      setErrorMessage("");

      const payload: any = {
        brandSlug: brand.slug,
        brandName: brand.name,
        replaceExisting: false,
      };

      if (modalType === "catalog") {
        if (!catalogForm.name.trim()) {
          throw new Error("El nombre del producto, servicio o lote es obligatorio.");
        }

        payload.catalogItems = [catalogForm];
      }

      if (modalType === "rule") {
        if (!ruleForm.ruleName.trim() || !ruleForm.ruleContent.trim()) {
          throw new Error("La regla necesita nombre y contenido.");
        }

        payload.businessRules = [ruleForm];
      }

      if (modalType === "faq") {
        if (!faqForm.question.trim() || !faqForm.answer.trim()) {
          throw new Error("La FAQ necesita pregunta y respuesta.");
        }

        payload.faqs = [
          {
            ...faqForm,
            keywords: faqForm.keywords
              .split(",")
              .map((word) => word.trim())
              .filter(Boolean),
          },
        ];
      }

      if (modalType === "note") {
        if (!noteForm.title.trim() || !noteForm.contentText.trim()) {
          throw new Error("La nota necesita título y contenido.");
        }

        payload.knowledgeSources = [noteForm];
      }

      const res = await fetch("/api/sales-ai/knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || data.ok === false) {
        throw new Error(data?.error || "No se pudo guardar la información.");
      }

      onSaved();
    } catch (error: any) {
      setErrorMessage(error?.message || "Error guardando información.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-5 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[38px] bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
              Información para Agentes IA
            </p>
            <h3 className="mt-1 text-3xl font-black tracking-[-0.06em] text-slate-950">
              {getModalTitle(modalType)}
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Esta información será usada por los agentes IA de {brand.name}. No
              modifica la estrategia ni la lógica interna del sistema.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>

        {modalType === "catalog" ? (
          <CatalogForm form={catalogForm} setForm={setCatalogForm} />
        ) : modalType === "rule" ? (
          <RuleForm form={ruleForm} setForm={setRuleForm} />
        ) : modalType === "faq" ? (
          <FaqForm form={faqForm} setForm={setFaqForm} />
        ) : (
          <NoteForm form={noteForm} setForm={setNoteForm} />
        )}

        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-12 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-cyan-700 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar información"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CatalogForm({ form, setForm }: { form: any; setForm: any }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Input
        label="Nombre del producto, servicio o lote"
        value={form.name}
        onChange={(value) => setForm({ ...form, name: value })}
      />
      <Input
        label="Categoría"
        value={form.category}
        onChange={(value) => setForm({ ...form, category: value })}
      />
      <Input
        label="Precio autorizado"
        value={form.priceText}
        onChange={(value) => setForm({ ...form, priceText: value })}
      />
      <Input
        label="Pedido mínimo"
        value={form.minimumOrderText}
        onChange={(value) => setForm({ ...form, minimumOrderText: value })}
      />
      <TextArea
        label="Descripción"
        value={form.description}
        onChange={(value) => setForm({ ...form, description: value })}
      />
      <TextArea
        label="Ideal para"
        value={form.idealFor}
        onChange={(value) => setForm({ ...form, idealFor: value })}
      />
      <TextArea
        label="Ángulo de venta"
        value={form.salesAngle}
        onChange={(value) => setForm({ ...form, salesAngle: value })}
      />
      <TextArea
        label="Cuándo ofrecerlo"
        value={form.whenToOffer}
        onChange={(value) => setForm({ ...form, whenToOffer: value })}
      />
      <TextArea
        label="Notas de stock o disponibilidad"
        value={form.stockNotes}
        onChange={(value) => setForm({ ...form, stockNotes: value })}
      />
      <Toggle
        label="Requiere confirmación humana"
        checked={form.requiresHumanConfirmation}
        onChange={(value) =>
          setForm({ ...form, requiresHumanConfirmation: value })
        }
      />
    </div>
  );
}

function RuleForm({ form, setForm }: { form: any; setForm: any }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Input
        label="Nombre de la regla"
        value={form.ruleName}
        onChange={(value) => setForm({ ...form, ruleName: value })}
      />
      <Select
        label="Tipo de regla"
        value={form.ruleType}
        onChange={(value) => setForm({ ...form, ruleType: value })}
        options={ruleTypes}
      />
      <TextArea
        label="Contenido de la regla"
        value={form.ruleContent}
        onChange={(value) => setForm({ ...form, ruleContent: value })}
      />
      <TextArea
        label="Cuándo aplica"
        value={form.conditionText}
        onChange={(value) => setForm({ ...form, conditionText: value })}
      />
      <Input
        label="Prioridad 1-100"
        value={String(form.priority)}
        onChange={(value) =>
          setForm({ ...form, priority: Number(value || 80) })
        }
      />
      <Toggle
        label="Requiere confirmación humana"
        checked={form.requiresHumanConfirmation}
        onChange={(value) =>
          setForm({ ...form, requiresHumanConfirmation: value })
        }
      />
    </div>
  );
}

function FaqForm({ form, setForm }: { form: any; setForm: any }) {
  return (
    <div className="grid gap-4">
      <Input
        label="Pregunta"
        value={form.question}
        onChange={(value) => setForm({ ...form, question: value })}
      />
      <TextArea
        label="Respuesta autorizada"
        value={form.answer}
        onChange={(value) => setForm({ ...form, answer: value })}
        rows={5}
      />
      <Input
        label="Intención"
        value={form.intent}
        onChange={(value) => setForm({ ...form, intent: value })}
      />
      <Input
        label="Palabras clave separadas por coma"
        value={form.keywords}
        onChange={(value) => setForm({ ...form, keywords: value })}
      />
      <Toggle
        label="Requiere confirmación humana"
        checked={form.requiresHumanConfirmation}
        onChange={(value) =>
          setForm({ ...form, requiresHumanConfirmation: value })
        }
      />
    </div>
  );
}

function NoteForm({ form, setForm }: { form: any; setForm: any }) {
  return (
    <div className="grid gap-4">
      <Input
        label="Título"
        value={form.title}
        onChange={(value) => setForm({ ...form, title: value })}
      />
      <TextArea
        label="Contenido comercial"
        value={form.contentText}
        onChange={(value) => setForm({ ...form, contentText: value })}
        rows={8}
      />
      <Input
        label="Confianza 1-100"
        value={String(form.confidenceScore)}
        onChange={(value) =>
          setForm({ ...form, confidenceScore: Number(value || 100) })
        }
      />
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-800 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex h-12 items-center justify-between rounded-2xl border px-4 text-sm font-black transition ${
        checked
          ? "border-cyan-200 bg-cyan-50 text-cyan-700"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      <span>{label}</span>
      <span>{checked ? "Sí" : "No"}</span>
    </button>
  );
}

function normalizeKnowledgeBase(data: any, brandName?: string): KnowledgeBase {
  const kb = data?.knowledgeBase || data?.knowledge_base || data || {};

  return {
    brandName:
      kb.brandName || kb.brand_name || data?.brandName || brandName || "",
    knowledgeSources: kb.knowledgeSources || kb.knowledge_sources || [],
    catalogItems: kb.catalogItems || kb.catalog_items || [],
    businessRules: kb.businessRules || kb.business_rules || [],
    faqs: kb.faqs || [],
    suggestions: kb.suggestions || [],
  };
}

function detectKnowledgeGaps(
  knowledgeBase: KnowledgeBase | null
): KnowledgeGap[] {
  const gaps: KnowledgeGap[] = [];

  if (!knowledgeBase) return gaps;

  if (!hasRuleType(knowledgeBase, "pricing")) {
    gaps.push({
      key: "pricing",
      title: "Falta regla de precios",
      description:
        "Define cuándo la IA puede hablar de precios, rangos o cuándo debe pedir validación.",
      ruleType: "pricing",
      ruleName: "Regla de precios autorizados",
      ruleContent:
        "La IA no debe inventar precios. Si no hay precio autorizado, debe pedir más datos o escalar a revisión humana.",
      conditionText:
        "Aplica cuando el cliente pregunta precio, costo, cuánto cuesta o cotización.",
      priority: 100,
      requiresHumanConfirmation: false,
    });
  }

  if (!hasRuleType(knowledgeBase, "payment")) {
    gaps.push({
      key: "payment",
      title: "Falta regla de pagos",
      description:
        "Define si la IA puede hablar de métodos de pago o si debe escalar cuando el cliente quiere pagar.",
      ruleType: "payment",
      ruleName: "Pagos requieren validación",
      ruleContent:
        "Si el cliente quiere pagar, apartar o cerrar pedido, la IA debe escalar a humano para confirmar datos.",
      conditionText:
        "Aplica cuando el cliente pide pagar, transferencia, apartado o datos bancarios.",
      priority: 100,
      requiresHumanConfirmation: true,
    });
  }

  if (!hasRuleType(knowledgeBase, "shipping")) {
    gaps.push({
      key: "shipping",
      title: "Falta regla de envíos",
      description:
        "Define ciudades, tiempos, costos, horario de corte y cuándo prometer envío.",
      ruleType: "shipping",
      ruleName: "Envíos requieren ciudad",
      ruleContent:
        "Para hablar de envío, la IA debe pedir ciudad. No debe prometer costo ni tiempo exacto sin confirmación.",
      conditionText:
        "Aplica cuando el cliente pregunta por envío, paquetería, entrega o costo de envío.",
      priority: 95,
      requiresHumanConfirmation: true,
    });
  }

  if (!hasRuleType(knowledgeBase, "stock")) {
    gaps.push({
      key: "stock",
      title: "Falta regla de disponibilidad",
      description:
        "Define si la IA puede confirmar stock o si debe escalar antes de cerrar pedido.",
      ruleType: "stock",
      ruleName: "Stock requiere confirmación",
      ruleContent:
        "La IA no debe confirmar stock exacto sin validación humana o sin conexión de inventario.",
      conditionText:
        "Aplica cuando el cliente pregunta disponibilidad, apartados o existencia.",
      priority: 95,
      requiresHumanConfirmation: true,
    });
  }

  return gaps;
}

function hasRuleType(knowledgeBase: KnowledgeBase | null, type: string) {
  return Boolean(
    knowledgeBase?.businessRules?.some(
      (rule: any) => (rule.rule_type || rule.ruleType) === type
    )
  );
}

function getModalFromSection(section: SectionKey): ModalType {
  if (section === "catalog") return "catalog";
  if (section === "rules") return "rule";
  if (section === "faqs") return "faq";
  if (section === "notes") return "note";
  if (section === "gaps") return "rule";
  return "catalog";
}

function getSectionEyebrow(section: SectionKey) {
  if (section === "catalog") return "Productos, servicios y ofertas";
  if (section === "rules") return "Reglas comerciales";
  if (section === "faqs") return "Respuestas autorizadas";
  if (section === "notes") return "Contexto del negocio";
  if (section === "gaps") return "Información faltante";
  return "Vista general";
}

function getSectionTitle(section: SectionKey) {
  if (section === "catalog") return "Catálogo autorizado para la IA";
  if (section === "rules") return "Reglas comerciales que debe respetar";
  if (section === "faqs") return "Respuestas frecuentes autorizadas";
  if (section === "notes") return "Contexto que debe entender";
  if (section === "gaps") return "Información faltante para operar seguro";
  return "Resumen de información para IA";
}

function getModalTitle(type: ModalType) {
  if (type === "catalog") return "Agregar producto, servicio o lote";
  if (type === "rule") return "Agregar regla comercial";
  if (type === "faq") return "Agregar pregunta frecuente";
  return "Agregar contexto comercial";
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