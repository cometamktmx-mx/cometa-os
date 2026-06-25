"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type BrandContext = {
  id: string | null;
  slug: string;
  name: string;
  industry: string;
  city: string | null;
  exists: boolean;
  sourceTable: string | null;
};

type InboxMetrics = {
  openLeads: number;
  hotLeads: number;
  qualified: number;
  readyReplies: number;
  humanRequired: number;
  pendingLearning: number;
  automationMode: string;
  health: number;
};

type SalesLead = {
  id: string;
  name: string;
  phone: string;
  status: string;
  temperature: string;
  intent: string;
  budget: string;
  city: string;
  isQualified: boolean;
  mainObjection: string;
  closeProbability: number;
  aiSummary: string;
  nextAction: string;
  recommendedReply: string;
  lastMessage: string;
  lastMessageAt: string | null;
  requiresHuman: boolean;
  tags: string[];
};

type SalesMessage = {
  id: string;
  leadId: string;
  direction: string;
  content: string;
  sender: string;
  createdAt: string | null;
};

type AgentRun = {
  id: string;
  leadId: string;
  action: string;
  actionStatus: string;
  leadStage: string;
  requiresHuman: boolean;
  confidenceScore: number;
  decisionReason: string;
  recommendedReply: string;
  nextAction: string;
  createdAt: string | null;
};

type NavItem = {
  code: string;
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
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

const fallbackMetrics: InboxMetrics = {
  openLeads: 0,
  hotLeads: 0,
  qualified: 0,
  readyReplies: 0,
  humanRequired: 0,
  pendingLearning: 0,
  automationMode: "Controlado",
  health: 70,
};

export default function SalesAIInboxPage() {
  return (
    <Suspense fallback={<InboxLoadingScreen />}>
      <SalesAIInboxInner />
    </Suspense>
  );
}

function SalesAIInboxInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedBrandSlug = searchParams.get("brandSlug") || "";

  const [brand, setBrand] = useState<BrandContext>(fallbackBrand);
  const [metrics, setMetrics] = useState<InboxMetrics>(fallbackMetrics);
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [messages, setMessages] = useState<SalesMessage[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [loading, setLoading] = useState(true);
  const [systemMessage, setSystemMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "hot" | "human" | "qualified">(
    "all"
  );

  const activeBrandSlug = brand.slug || requestedBrandSlug || "brand-os";
  const brandQuery = `brandSlug=${encodeURIComponent(activeBrandSlug)}`;

  const nav = useMemo(() => buildNav(activeBrandSlug), [activeBrandSlug]);

  const filteredLeads = useMemo(() => {
    if (filter === "hot") {
      return leads.filter(
        (lead) =>
          lead.closeProbability >= 75 ||
          String(lead.temperature || "").toLowerCase().includes("caliente") ||
          String(lead.temperature || "").toLowerCase().includes("hot")
      );
    }

    if (filter === "human") {
      return leads.filter((lead) => lead.requiresHuman);
    }

    if (filter === "qualified") {
      return leads.filter((lead) => lead.isQualified);
    }

    return leads;
  }, [leads, filter]);

  const selectedLead = useMemo(() => {
    return (
      filteredLeads.find((lead) => lead.id === selectedLeadId) ||
      filteredLeads[0] ||
      leads.find((lead) => lead.id === selectedLeadId) ||
      leads[0] ||
      null
    );
  }, [filteredLeads, leads, selectedLeadId]);

  const selectedMessages = useMemo(() => {
    if (!selectedLead) return [];

    return messages.filter((message) => message.leadId === selectedLead.id);
  }, [messages, selectedLead]);

  const selectedRun = useMemo(() => {
    if (!selectedLead) return null;

    return (
      agentRuns.find((run) => run.leadId === selectedLead.id) ||
      agentRuns[0] ||
      null
    );
  }, [agentRuns, selectedLead]);

  useEffect(() => {
    loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedBrandSlug]);

  async function loadInbox() {
    try {
      setLoading(true);
      setSystemMessage("");

      const query = requestedBrandSlug
        ? `?brandSlug=${encodeURIComponent(requestedBrandSlug)}`
        : "";

      const res = await fetch(`/api/sales-ai/inbox-dashboard${query}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json();

      if (res.status === 401) {
        router.replace(
          `/login?next=${encodeURIComponent(
            requestedBrandSlug
              ? `/sales-ai/inbox?brandSlug=${requestedBrandSlug}`
              : "/sales-ai/inbox"
          )}`
        );
        return;
      }

      if (res.status === 403) {
        router.replace("/workspace");
        return;
      }

      if (!res.ok || data.ok === false) {
        throw new Error(data?.error || "No se pudo cargar el Inbox.");
      }

      const nextBrand = data.brand || fallbackBrand;
      const nextLeads = Array.isArray(data.leads) ? data.leads : [];

      setBrand(nextBrand);
      setMetrics(data.metrics || fallbackMetrics);
      setLeads(nextLeads);
      setMessages(Array.isArray(data.conversations) ? data.conversations : []);
      setAgentRuns(Array.isArray(data.agentRuns) ? data.agentRuns : []);

      setSelectedLeadId((current) => {
        if (current && nextLeads.some((lead: SalesLead) => lead.id === current)) {
          return current;
        }

        return nextLeads[0]?.id || "";
      });
    } catch (error: any) {
      setSystemMessage(error?.message || "Error cargando Inbox.");
      setBrand(fallbackBrand);
      setMetrics(fallbackMetrics);
      setLeads([]);
      setMessages([]);
      setAgentRuns([]);
      setSelectedLeadId("");
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

          <InboxHero
            brand={brand}
            metrics={metrics}
            loading={loading}
            onRefresh={loadInbox}
          />

          <InboxMetricsGrid metrics={metrics} loading={loading} />

          <SalesFloor
            brand={brand}
            leads={filteredLeads}
            allLeadsCount={leads.length}
            selectedLead={selectedLead}
            selectedLeadId={selectedLead?.id || ""}
            selectedMessages={selectedMessages}
            selectedRun={selectedRun}
            filter={filter}
            setFilter={setFilter}
            onSelect={setSelectedLeadId}
            loading={loading}
          />
        </section>

        <aside className="sticky top-4 hidden h-fit min-w-0 flex-col gap-4 xl:flex">
          <TopControls loading={loading} onRefresh={loadInbox} />

          <AgentStatus metrics={metrics} loading={loading} />

          <DecisionPanel lead={selectedLead} agentRun={selectedRun} />

          <QuickLinks brandQuery={brandQuery} brandSlug={activeBrandSlug} />
        </aside>
      </section>
    </main>
  );
}

function InboxLoadingScreen() {
  return (
    <main className="min-h-screen bg-[#f2f7fb] p-6">
      <div className="mx-auto max-w-6xl rounded-[38px] bg-slate-950 p-10 text-white">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
          Sales AI
        </p>
        <h1 className="mt-4 text-5xl font-black tracking-[-0.08em]">
          Cargando Inbox...
        </h1>
      </div>
    </main>
  );
}

function buildNav(brandSlug: string): NavItem[] {
  const safeBrandSlug = encodeURIComponent(brandSlug || "brand-os");
  const brandQuery = `brandSlug=${safeBrandSlug}`;

  return [
    { code: "WS", label: "Workspace", href: "/workspace" },
    { code: "HM", label: "Brand OS", href: `/brand/${safeBrandSlug}` },
    { code: "IN", label: "Inbox", href: `/sales-ai/inbox?${brandQuery}`, active: true },
    { code: "KB", label: "Knowledge", href: `/sales-ai/knowledge?${brandQuery}` },
    { code: "LR", label: "Learning", href: `/sales-ai/learning?${brandQuery}` },
    { code: "MC", label: "Misión", href: `/cometa-os/design?${brandQuery}` },
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
            Inbox conectado
          </p>
        </div>
      </div>
    </aside>
  );
}

function InboxHero({
  brand,
  metrics,
  loading,
  onRefresh,
}: {
  brand: BrandContext;
  metrics: InboxMetrics;
  loading: boolean;
  onRefresh: () => void;
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
              Inbox Command Center
            </span>

            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
              {loading ? "Sincronizando" : metrics.automationMode}
            </span>
          </div>

          <p className="mt-8 text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
            {brand.name}
          </p>

          <h1 className="mt-3 max-w-5xl text-5xl font-black leading-[0.92] tracking-[-0.085em] md:text-6xl 2xl:text-[76px]">
            Sales
            <br />
            Command Center
          </h1>

          <p className="mt-6 max-w-4xl text-[17px] font-semibold leading-8 text-slate-300">
            Controla conversaciones, prospectos, intención de compra, respuestas
            recomendadas y decisiones del agente desde una sola vista comercial.
          </p>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Inbox Health
          </p>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-5xl font-black leading-[0.9] tracking-[-0.09em]">
                {loading ? "..." : metrics.openLeads}
              </h2>

              <p className="mt-2 text-sm font-bold text-slate-300">
                Leads abiertos
              </p>
            </div>

            <ScoreRing value={metrics.health || 0} />
          </div>

          <div className="mt-6 grid gap-3">
            <ProgressLine label="Salud del inbox" value={metrics.health || 0} />
            <ProgressLine
              label="Respuestas listas"
              value={metrics.openLeads ? Math.min(metrics.readyReplies * 10, 100) : 0}
            />
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="mt-6 h-12 w-full rounded-2xl bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-100 disabled:opacity-50"
          >
            {loading ? "Actualizando..." : "Actualizar Inbox"}
          </button>
        </div>
      </div>
    </header>
  );
}

function InboxMetricsGrid({
  metrics,
  loading,
}: {
  metrics: InboxMetrics;
  loading: boolean;
}) {
  const items = [
    { label: "Leads abiertos", value: metrics.openLeads, code: "LD" },
    { label: "Calientes", value: metrics.hotLeads, code: "HT" },
    { label: "Calificados", value: metrics.qualified, code: "QL" },
    { label: "Respuestas", value: metrics.readyReplies, code: "RP" },
    { label: "Humano", value: metrics.humanRequired, code: "HM" },
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

function SalesFloor({
  brand,
  leads,
  allLeadsCount,
  selectedLead,
  selectedLeadId,
  selectedMessages,
  selectedRun,
  filter,
  setFilter,
  onSelect,
  loading,
}: {
  brand: BrandContext;
  leads: SalesLead[];
  allLeadsCount: number;
  selectedLead: SalesLead | null;
  selectedLeadId: string;
  selectedMessages: SalesMessage[];
  selectedRun: AgentRun | null;
  filter: "all" | "hot" | "human" | "qualified";
  setFilter: (filter: "all" | "hot" | "human" | "qualified") => void;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <section className="grid gap-4 2xl:grid-cols-[390px_minmax(0,1fr)]">
      <LeadPipeline
        leads={leads}
        allLeadsCount={allLeadsCount}
        selectedLeadId={selectedLeadId}
        filter={filter}
        setFilter={setFilter}
        onSelect={onSelect}
        loading={loading}
      />

      <ConversationPanel
        brand={brand}
        lead={selectedLead}
        messages={selectedMessages}
        agentRun={selectedRun}
        loading={loading}
      />
    </section>
  );
}

function LeadPipeline({
  leads,
  allLeadsCount,
  selectedLeadId,
  filter,
  setFilter,
  onSelect,
  loading,
}: {
  leads: SalesLead[];
  allLeadsCount: number;
  selectedLeadId: string;
  filter: "all" | "hot" | "human" | "qualified";
  setFilter: (filter: "all" | "hot" | "human" | "qualified") => void;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  const filters = [
    { key: "all", label: "Todos" },
    { key: "hot", label: "Calientes" },
    { key: "qualified", label: "Calificados" },
    { key: "human", label: "Humano" },
  ] as const;

  return (
    <section className="rounded-[38px] border border-white bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="border-b border-slate-100 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
          Sales Pipeline
        </p>

        <div className="mt-2 flex items-end justify-between gap-4">
          <h2 className="text-3xl font-black tracking-[-0.055em] text-slate-950">
            Prospectos
          </h2>

          <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            {allLeadsCount} total
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {filters.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-2xl px-3 py-2 text-xs font-black transition ${
                filter === item.key
                  ? "bg-slate-950 text-white"
                  : "bg-slate-50 text-slate-500 hover:bg-cyan-50 hover:text-cyan-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid max-h-[760px] gap-3 overflow-y-auto pr-1">
        {loading ? (
          <>
            <LeadSkeleton />
            <LeadSkeleton />
            <LeadSkeleton />
          </>
        ) : leads.length ? (
          leads.map((lead) => (
            <button
              key={lead.id}
              onClick={() => onSelect(lead.id)}
              className={`rounded-[26px] border p-4 text-left transition ${
                selectedLeadId === lead.id
                  ? "border-cyan-200 bg-cyan-50 shadow-sm"
                  : "border-slate-200 bg-slate-50/70 hover:border-cyan-200 hover:bg-cyan-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black tracking-[-0.045em] text-slate-950">
                    {lead.name}
                  </h3>

                  <p className="mt-1 truncate text-xs font-bold text-slate-500">
                    {lead.intent}
                  </p>
                </div>

                <TemperatureBadge temperature={lead.temperature} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniInfo label="Cierre" value={`${lead.closeProbability}%`} />
                <MiniInfo label="Ciudad" value={lead.city} />
                <MiniInfo label="Budget" value={lead.budget} />
              </div>

              {lead.requiresHuman ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">
                  Requiere validación humana
                </div>
              ) : null}
            </button>
          ))
        ) : (
          <EmptyBox
            title="Sin leads en este filtro"
            text="Cuando entren prospectos o cambies de filtro, aparecerán aquí."
          />
        )}
      </div>
    </section>
  );
}

function ConversationPanel({
  brand,
  lead,
  messages,
  agentRun,
  loading,
}: {
  brand: BrandContext;
  lead: SalesLead | null;
  messages: SalesMessage[];
  agentRun: AgentRun | null;
  loading: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[38px] border border-white bg-white shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Conversación y decisión comercial
          </p>

          <h2 className="mt-1 truncate text-3xl font-black tracking-[-0.055em] text-slate-950">
            {lead ? lead.name : brand.name}
          </h2>
        </div>

        {lead ? (
          <span
            className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.16em] ${
              lead.requiresHuman
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {lead.requiresHuman ? "Requiere humano" : "Controlado"}
          </span>
        ) : null}
      </div>

      <div className="grid min-h-[680px] gap-4 bg-slate-50 p-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {loading ? (
            <EmptyBox title="Cargando conversación..." text="Sincronizando datos." />
          ) : lead ? (
            <>
              <LeadSummary lead={lead} />

              <div className="mt-5 grid gap-3">
                {messages.length ? (
                  messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))
                ) : lead.lastMessage ? (
                  <MessageBubble
                    message={{
                      id: "last-message",
                      leadId: lead.id,
                      direction: "inbound",
                      content: lead.lastMessage,
                      sender: lead.name,
                      createdAt: lead.lastMessageAt,
                    }}
                  />
                ) : (
                  <EmptyBox
                    title="Sin mensajes cargados"
                    text="El lead existe, pero todavía no hay historial en sales_messages."
                  />
                )}
              </div>

              {lead.recommendedReply ? (
                <RecommendedReply reply={lead.recommendedReply} />
              ) : null}
            </>
          ) : (
            <EmptyBox
              title="Selecciona un prospecto"
              text="Aquí aparecerá la conversación y la recomendación de SALES AI."
            />
          )}
        </div>

        <LeadDecisionStack lead={lead} agentRun={agentRun} />
      </div>
    </section>
  );
}

function LeadSummary({ lead }: { lead: SalesLead }) {
  return (
    <div className="rounded-[30px] border border-slate-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
            AI Summary
          </p>

          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {lead.aiSummary || "Sin resumen todavía."}
          </p>
        </div>

        <div className="rounded-[24px] bg-cyan-50 p-4 text-center">
          <p className="text-4xl font-black tracking-[-0.08em] text-slate-950">
            {lead.closeProbability}%
          </p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">
            prob. cierre
          </p>
        </div>
      </div>
    </div>
  );
}

function RecommendedReply({ reply }: { reply: string }) {
  return (
    <div className="mt-5 rounded-[30px] bg-slate-950 p-5 text-white">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">
        Respuesta recomendada
      </p>

      <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-200">
        {reply}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button className="rounded-2xl bg-white px-5 py-3 text-xs font-black text-slate-950 transition hover:bg-cyan-100">
          Copiar respuesta
        </button>

        <button className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-black text-white transition hover:bg-white/10">
          Marcar para revisión
        </button>
      </div>
    </div>
  );
}

function LeadDecisionStack({
  lead,
  agentRun,
}: {
  lead: SalesLead | null;
  agentRun: AgentRun | null;
}) {
  return (
    <aside className="grid h-fit gap-4">
      <div className="rounded-[30px] border border-slate-200 bg-white p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
          Next Best Action
        </p>

        <h3 className="mt-3 text-2xl font-black tracking-[-0.055em] text-slate-950">
          {lead?.nextAction || "Selecciona un prospecto"}
        </h3>

        <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
          {lead
            ? "Esta es la siguiente acción recomendada por SALES AI para avanzar el cierre."
            : "El agente mostrará aquí su recomendación comercial."}
        </p>
      </div>

      <DecisionItem label="Objeción principal" value={lead?.mainObjection || ""} />
      <DecisionItem
        label="Calificación"
        value={lead ? (lead.isQualified ? "Calificado" : "Por calificar") : ""}
      />
      <DecisionItem
        label="Razón del agente"
        value={agentRun?.decisionReason || "Sin ejecución registrada."}
      />
      <DecisionItem
        label="Confianza IA"
        value={agentRun ? `${agentRun.confidenceScore}%` : "Sin dato"}
      />
    </aside>
  );
}

function MessageBubble({ message }: { message: SalesMessage }) {
  const isOutbound =
    message.direction === "outbound" ||
    message.direction === "ai" ||
    message.sender?.toLowerCase().includes("sales");

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-[26px] px-5 py-4 text-sm font-semibold leading-6 ${
          isOutbound
            ? "bg-slate-950 text-white"
            : "border border-slate-200 bg-white text-slate-700"
        }`}
      >
        <p>{message.content || "Mensaje sin contenido."}</p>

        <p
          className={`mt-2 text-[10px] font-black uppercase tracking-[0.14em] ${
            isOutbound ? "text-cyan-300" : "text-slate-400"
          }`}
        >
          {isOutbound ? "SALES AI" : message.sender || "Cliente"}
        </p>
      </div>
    </div>
  );
}

function AgentStatus({
  metrics,
  loading,
}: {
  metrics: InboxMetrics;
  loading: boolean;
}) {
  return (
    <section className="rounded-[38px] bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Inbox Health
          </p>

          <h2 className="mt-4 whitespace-nowrap text-[46px] font-black leading-[0.92] tracking-[-0.075em]">
            {loading ? "..." : `${metrics.health}%`}
          </h2>

          <div className="mt-4 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <p className="text-sm font-bold text-slate-300">
              {metrics.automationMode}
            </p>
          </div>
        </div>

        <ScoreRing value={metrics.health || 0} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <DarkMini label="Leads" value={String(metrics.openLeads)} />
        <DarkMini label="Hot" value={String(metrics.hotLeads)} />
        <DarkMini label="Humano" value={String(metrics.humanRequired)} />
        <DarkMini label="Learning" value={String(metrics.pendingLearning)} />
      </div>
    </section>
  );
}

function DecisionPanel({
  lead,
  agentRun,
}: {
  lead: SalesLead | null;
  agentRun: AgentRun | null;
}) {
  return (
    <section className="rounded-[34px] border border-white bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
        Agent Intelligence
      </p>

      {lead ? (
        <div className="mt-5 grid gap-3">
          <DecisionItem label="Siguiente acción" value={lead.nextAction} />
          <DecisionItem label="Objeción" value={lead.mainObjection} />
          <DecisionItem
            label="Calificación"
            value={lead.isQualified ? "Calificado" : "Por calificar"}
          />
          <DecisionItem
            label="Decisión IA"
            value={agentRun?.decisionReason || "Sin ejecución registrada."}
          />
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-500">
          Selecciona un prospecto para ver la decisión del agente.
        </p>
      )}
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
    { label: "Knowledge Brain", href: `/sales-ai/knowledge?${brandQuery}` },
    { label: "Learning Hub", href: `/sales-ai/learning?${brandQuery}` },
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

function TemperatureBadge({ temperature }: { temperature: string }) {
  const temp = String(temperature || "").toLowerCase();

  const className =
    temp.includes("caliente") || temp.includes("hot")
      ? "border-rose-200 bg-rose-50 text-rose-600"
      : temp.includes("tibio") || temp.includes("warm")
      ? "border-amber-200 bg-amber-50 text-amber-600"
      : "border-slate-200 bg-white text-slate-500";

  return (
    <span
      className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${className}`}
    >
      {temperature || "Frío"}
    </span>
  );
}

function MiniInfo({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-2">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-black text-slate-800">
        {value || "N/D"}
      </p>
    </div>
  );
}

function DecisionItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-black leading-6 text-slate-800">
        {value || "Sin dato"}
      </p>
    </div>
  );
}

function LeadSkeleton() {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
      <div className="h-5 w-40 rounded-full bg-slate-200" />
      <div className="mt-3 h-4 w-52 rounded-full bg-slate-200" />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="h-12 rounded-2xl bg-slate-200" />
        <div className="h-12 rounded-2xl bg-slate-200" />
        <div className="h-12 rounded-2xl bg-slate-200" />
      </div>
    </div>
  );
}

function EmptyBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[30px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <h3 className="text-2xl font-black tracking-[-0.05em] text-slate-950">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">
        {text}
      </p>
    </div>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  const safeValue = clampNumber(value, 0, 100);

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