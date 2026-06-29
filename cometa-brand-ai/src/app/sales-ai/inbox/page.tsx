"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

type FilterKey = "all" | "hot" | "human" | "qualified";

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
  automationMode: "Supervisado",
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
  const [filter, setFilter] = useState<FilterKey>("all");

  const activeBrandSlug = brand.slug || requestedBrandSlug || "brand-os";
  const brandQuery = `brandSlug=${encodeURIComponent(activeBrandSlug)}`;

  const nav = useMemo(() => buildNav(activeBrandSlug), [activeBrandSlug]);

  const loadInbox = useCallback(async () => {
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
  }, [requestedBrandSlug, router]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const filteredLeads = useMemo(() => {
    if (filter === "hot") {
      return leads.filter((lead) => isHotLead(lead));
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

  return (
    <main className="min-h-screen bg-[#f7fafc] text-[#0b1836]">
      <div className="flex min-h-screen">
        <LeftRail nav={nav} brand={brand} />

        <div className="flex-1 px-5 py-6 lg:px-8 xl:px-10">
          <div className="mx-auto max-w-[1720px] space-y-6">
            {systemMessage ? <LoadWarning message={systemMessage} /> : null}

            <InboxHeader
              brand={brand}
              metrics={metrics}
              loading={loading}
              onRefresh={loadInbox}
            />

            <InboxMetricsGrid metrics={metrics} loading={loading} />

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[390px_minmax(0,1fr)_390px]">
              <LeadInboxList
                leads={filteredLeads}
                totalLeads={leads.length}
                selectedLeadId={selectedLead?.id || ""}
                filter={filter}
                setFilter={setFilter}
                loading={loading}
                onSelect={setSelectedLeadId}
              />

              <ConversationPanel
                brand={brand}
                lead={selectedLead}
                messages={selectedMessages}
                loading={loading}
              />

              <AgentAuditPanel
                brandQuery={brandQuery}
                brandSlug={activeBrandSlug}
                metrics={metrics}
                lead={selectedLead}
                agentRun={selectedRun}
                loading={loading}
                onRefresh={loadInbox}
              />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function InboxLoadingScreen() {
  return (
    <main className="min-h-screen bg-[#f7fafc] p-6">
      <div className="mx-auto max-w-5xl rounded-[32px] border border-[#dfe8f3] bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#0aa6c4]">
          SALES AI
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-[#0b1836]">
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
    { code: "OS", label: "Sales AI", href: "/sales-ai" },
    { code: "WS", label: "Workspace", href: "/workspace" },
    { code: "HM", label: "Brand OS", href: `/brand/${safeBrandSlug}` },
    {
      code: "IN",
      label: "Inbox",
      href: `/sales-ai/inbox?${brandQuery}`,
      active: true,
    },
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

function LeftRail({ nav, brand }: { nav: NavItem[]; brand: BrandContext }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[82px] shrink-0 flex-col items-center border-r border-[#e4edf5] bg-white py-6 shadow-[8px_0_28px_rgba(15,23,42,0.03)] lg:flex">
      <Link
        href="/sales-ai"
        className="mb-7 flex h-11 w-11 items-center justify-center rounded-2xl text-[#13bdd7]"
      >
        <Icon name="planet" className="h-9 w-9" />
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-4">
        {nav.map((item) => (
          <Link
            key={item.code}
            href={item.href}
            className={`group relative flex h-12 w-12 items-center justify-center rounded-2xl transition ${
              item.active
                ? "bg-[#ecfbff] text-[#0faccc] shadow-sm ring-1 ring-[#d8f3f8]"
                : "text-[#728199] hover:bg-[#f3f7fb] hover:text-[#0faccc]"
            }`}
            title={item.label}
          >
            <span className="text-[11px] font-black">{item.code}</span>
          </Link>
        ))}
      </nav>

      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#e9fbff] text-sm font-black text-[#0b1836] ring-1 ring-[#cdeff7]">
        {getInitials(brand.name)}
      </div>

      <div className="text-xl text-[#91a1b8]">»</div>
    </aside>
  );
}

function InboxHeader({
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
    <header className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_390px]">
      <div className="rounded-[30px] border border-[#dfe8f3] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#cfeef6] bg-[#effcff] px-4 py-2 text-xs font-extrabold text-[#0798b8] shadow-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-[#12bfe8]" />
          SALES AI · INBOX COMMAND CENTER
        </div>

        <div className="mt-5 flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#728199]">
              {brand.name}
            </p>

            <h1 className="mt-2 text-4xl font-black tracking-tight text-[#0b1836] md:text-5xl">
              Inbox de ventas
            </h1>

            <p className="mt-3 max-w-3xl text-base leading-relaxed text-[#52617a]">
              Conversaciones, intención comercial, respuestas generadas y
              decisiones de SALES AI en una sola bandeja.
            </p>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="w-fit rounded-2xl border border-[#dbe6f0] bg-white px-5 py-3 text-sm font-black text-[#0b1836] shadow-sm transition hover:border-[#b8d7e4] hover:bg-[#f8fcff] disabled:opacity-50"
          >
            {loading ? "Actualizando..." : "Actualizar Inbox"}
          </button>
        </div>
      </div>

      <div className="rounded-[30px] border border-[#dfe8f3] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#728199]">
              Inbox Health
            </p>

            <p className="mt-3 text-5xl font-black tracking-tight text-[#0b1836]">
              {loading ? "..." : `${metrics.health}%`}
            </p>

            <p className="mt-2 text-sm font-semibold text-[#60708a]">
              {metrics.automationMode || "Supervisado"}
            </p>
          </div>

          <ScoreRing value={metrics.health || 0} />
        </div>

        <div className="mt-5 space-y-3">
          <ProgressLine label="Salud del inbox" value={metrics.health || 0} />
          <ProgressLine
            label="Respuestas listas"
            value={
              metrics.openLeads ? Math.min(metrics.readyReplies * 12, 100) : 0
            }
          />
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
    {
      label: "Leads abiertos",
      value: metrics.openLeads,
      icon: "users" as IconName,
      tone: "blue" as const,
    },
    {
      label: "Calientes",
      value: metrics.hotLeads,
      icon: "flame" as IconName,
      tone: "orange" as const,
    },
    {
      label: "Calificados",
      value: metrics.qualified,
      icon: "user" as IconName,
      tone: "green" as const,
    },
    {
      label: "Respuestas",
      value: metrics.readyReplies,
      icon: "chat" as IconName,
      tone: "cyan" as const,
    },
    {
      label: "Requiere humano",
      value: metrics.humanRequired,
      icon: "alert" as IconName,
      tone: "purple" as const,
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <MetricCard
          key={item.label}
          label={item.label}
          value={loading ? "..." : item.value}
          icon={item.icon}
          tone={item.tone}
        />
      ))}
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: IconName;
  tone: "blue" | "orange" | "green" | "cyan" | "purple";
}) {
  const toneMap = {
    blue: "bg-[#eef7ff] text-[#1677ff]",
    orange: "bg-[#fff4e8] text-[#f97316]",
    green: "bg-[#ecfbf3] text-[#00a86b]",
    cyan: "bg-[#eafbff] text-[#0ea5c6]",
    purple: "bg-[#f5f0ff] text-[#7c3aed]",
  };

  return (
    <article className="rounded-[24px] border border-[#dfe8f3] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${toneMap[tone]}`}
        >
          <Icon name={icon} className="h-6 w-6" />
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#66758d]">
            {label}
          </p>
          <p className="mt-1 text-3xl font-black text-[#0b1836]">{value}</p>
        </div>
      </div>
    </article>
  );
}

function LeadInboxList({
  leads,
  totalLeads,
  selectedLeadId,
  filter,
  setFilter,
  loading,
  onSelect,
}: {
  leads: SalesLead[];
  totalLeads: number;
  selectedLeadId: string;
  filter: FilterKey;
  setFilter: (filter: FilterKey) => void;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "hot", label: "Calientes" },
    { key: "qualified", label: "Calificados" },
    { key: "human", label: "Humano" },
  ];

  return (
    <section className="rounded-[30px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#728199]">
            Sales Pipeline
          </p>
          <h2 className="mt-1 text-3xl font-black text-[#0b1836]">
            Prospectos
          </h2>
        </div>

        <span className="rounded-full bg-[#f3f7fb] px-3 py-1 text-xs font-black text-[#60708a]">
          {totalLeads} total
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {filters.map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`rounded-2xl px-3 py-2 text-xs font-black transition ${
              filter === item.key
                ? "bg-[#0b1836] text-white"
                : "bg-[#f3f7fb] text-[#60708a] hover:bg-[#eafbff] hover:text-[#0aa6c4]"
            }`}
          >
            {item.label}
          </button>
        ))}
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
            <LeadCard
              key={lead.id}
              lead={lead}
              selected={selectedLeadId === lead.id}
              onClick={() => onSelect(lead.id)}
            />
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

function LeadCard({
  lead,
  selected,
  onClick,
}: {
  lead: SalesLead;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[24px] border p-4 text-left transition ${
        selected
          ? "border-[#7ae7f5] bg-[#effcff] shadow-sm"
          : "border-[#e2eaf3] bg-white hover:border-[#bdeaf2] hover:bg-[#fbfeff]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={lead.name} />

          <div className="min-w-0">
            <h3 className="text-base font-black leading-tight text-[#0b1836]">
              {lead.name || "Lead sin nombre"}
            </h3>
            <p className="mt-1 truncate text-xs font-semibold text-[#78889e]">
              {lead.phone || lead.intent || "Sin contacto"}
            </p>
          </div>
        </div>

        <TemperatureBadge temperature={lead.temperature} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniInfo label="Cierre" value={`${lead.closeProbability}%`} />
        <MiniInfo label="Objeción" value={lead.mainObjection || "Ninguna"} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <MiniInfo label="Estado" value={lead.status || "Sin estado"} />
        <MiniInfo label="Budget" value={lead.budget || "N/D"} />
      </div>

      <p className="mt-3 line-clamp-2 text-xs font-medium leading-relaxed text-[#65758d]">
        {lead.nextAction || "SALES AI está evaluando el siguiente paso."}
      </p>

      {lead.requiresHuman ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">
          Requiere humano
        </div>
      ) : null}
    </button>
  );
}

function ConversationPanel({
  brand,
  lead,
  messages,
  loading,
}: {
  brand: BrandContext;
  lead: SalesLead | null;
  messages: SalesMessage[];
  loading: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-[#dfe8f3] bg-white shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#e8eef5] px-6 py-5">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#728199]">
              Conversación comercial
            </p>

            <h2 className="mt-2 max-w-[680px] break-words text-3xl font-black leading-tight text-[#0b1836]">
              {lead ? lead.name : brand.name}
            </h2>

            {lead ? (
              <p className="mt-2 text-sm font-semibold text-[#728199]">
                {lead.phone || "Sin teléfono registrado"}
              </p>
            ) : null}
          </div>

          {lead ? (
            <span
              className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${
                lead.requiresHuman
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {lead.requiresHuman ? "Requiere humano" : "Controlado"}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-h-[760px] bg-[#f8fbff] p-5">
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
    </section>
  );
}

function LeadSummary({ lead }: { lead: SalesLead }) {
  return (
    <div className="rounded-[28px] border border-[#dfe8f3] bg-white p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#728199]">
            AI Summary
          </p>

          <p className="mt-2 text-sm font-semibold leading-6 text-[#52617a]">
            {lead.aiSummary || "Sin resumen todavía."}
          </p>
        </div>

        <div className="rounded-[24px] bg-[#effcff] p-4 text-center">
          <p className="text-4xl font-black tracking-tight text-[#0b1836]">
            {lead.closeProbability}%
          </p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#0aa6c4]">
            prob. cierre
          </p>
        </div>
      </div>
    </div>
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
        className={`max-w-[82%] rounded-[24px] px-5 py-4 text-sm font-semibold leading-6 ${
          isOutbound
            ? "bg-[#0b1836] text-white"
            : "border border-[#dfe8f3] bg-white text-[#52617a]"
        }`}
      >
        <p>{message.content || "Mensaje sin contenido."}</p>

        <p
          className={`mt-2 text-[10px] font-black uppercase tracking-[0.14em] ${
            isOutbound ? "text-[#70e7ff]" : "text-[#8a98ad]"
          }`}
        >
          {isOutbound ? "SALES AI" : message.sender || "Cliente"}
        </p>
      </div>
    </div>
  );
}

function RecommendedReply({ reply }: { reply: string }) {
  return (
    <div className="mt-5 rounded-[28px] border border-[#bdeef7] bg-[#effcff] p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0b9fbd]">
        Respuesta generada por SALES AI
      </p>

      <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-[#26354d]">
        {reply}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(reply)}
          className="rounded-2xl bg-[#08a9c6] px-5 py-3 text-xs font-black text-white transition hover:bg-[#0598b5]"
        >
          Copiar respuesta
        </button>

        <button
          type="button"
          className="rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3 text-xs font-black text-[#324159] transition hover:bg-[#f8fbff]"
        >
          Marcar para revisión
        </button>
      </div>
    </div>
  );
}

function AgentAuditPanel({
  brandQuery,
  brandSlug,
  metrics,
  lead,
  agentRun,
  loading,
  onRefresh,
}: {
  brandQuery: string;
  brandSlug: string;
  metrics: InboxMetrics;
  lead: SalesLead | null;
  agentRun: AgentRun | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <aside className="space-y-6 xl:sticky xl:top-6 xl:h-fit">
      <AgentLeadCard lead={lead} agentRun={agentRun} />

      <AgentNextAction lead={lead} agentRun={agentRun} />

      <AgentSystemCard metrics={metrics} loading={loading} onRefresh={onRefresh} />

      <QuickLinks brandQuery={brandQuery} brandSlug={brandSlug} />
    </aside>
  );
}

function AgentLeadCard({
  lead,
  agentRun,
}: {
  lead: SalesLead | null;
  agentRun: AgentRun | null;
}) {
  return (
    <section className="rounded-[30px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0aa6c4]">
        Auditoría de SALES AI
      </p>

      {lead ? (
        <>
          <div className="mt-5 flex items-start gap-3">
            <Avatar name={lead.name} />

            <div className="min-w-0">
              <h3 className="break-words text-2xl font-black leading-tight text-[#0b1836]">
                {lead.name}
              </h3>
              <p className="mt-1 text-sm font-semibold text-[#728199]">
                {lead.phone || "Sin teléfono"}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <DecisionItem label="Intención" value={lead.intent} />
            <DecisionItem label="Objeción" value={lead.mainObjection} />
            <DecisionItem
              label="Calificación"
              value={lead.isQualified ? "Calificado" : "Por calificar"}
            />
            <DecisionItem
              label="Confianza IA"
              value={agentRun ? `${agentRun.confidenceScore}%` : "Sin dato"}
            />
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-2xl bg-[#f8fbff] p-4 text-sm font-bold leading-6 text-[#60708a]">
          Selecciona un prospecto para ver la auditoría del agente.
        </p>
      )}
    </section>
  );
}

function AgentNextAction({
  lead,
  agentRun,
}: {
  lead: SalesLead | null;
  agentRun: AgentRun | null;
}) {
  return (
    <section className="rounded-[30px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#728199]">
        Siguiente acción
      </p>

      <h3 className="mt-3 text-2xl font-black leading-tight text-[#0b1836]">
        {lead?.nextAction || "Sin prospecto seleccionado"}
      </h3>

      <div className="mt-4 rounded-2xl border border-[#bdeef7] bg-[#effcff] p-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0b9fbd]">
          Razón del agente
        </p>

        <p className="mt-2 text-sm font-semibold leading-6 text-[#26354d]">
          {agentRun?.decisionReason ||
            lead?.aiSummary ||
            "SALES AI todavía no tiene una razón registrada para este prospecto."}
        </p>
      </div>

      {lead?.recommendedReply ? (
        <div className="mt-4 rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#728199]">
            Respuesta sugerida
          </p>

          <p className="mt-2 line-clamp-5 text-sm font-semibold leading-6 text-[#26354d]">
            {lead.recommendedReply}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function AgentSystemCard({
  metrics,
  loading,
  onRefresh,
}: {
  metrics: InboxMetrics;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-[30px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#728199]">
            Estado del agente
          </p>

          <h3 className="mt-2 text-2xl font-black text-[#0b1836]">
            {metrics.automationMode || "Supervisado"}
          </h3>

          <p className="mt-2 text-sm font-semibold leading-6 text-[#60708a]">
            SALES AI mantiene seguimiento, respuesta sugerida y auditoría de cada
            conversación.
          </p>
        </div>

        <div className="rounded-full bg-[#ecfff7] px-3 py-1 text-xs font-black text-[#00a86b]">
          {loading ? "..." : "Activo"}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <DarkMini label="Leads" value={String(metrics.openLeads)} />
        <DarkMini label="Hot" value={String(metrics.hotLeads)} />
        <DarkMini label="Humano" value={String(metrics.humanRequired)} />
        <DarkMini label="Learning" value={String(metrics.pendingLearning)} />
      </div>

      <button
        onClick={onRefresh}
        disabled={loading}
        className="mt-5 w-full rounded-2xl bg-[#0b1836] px-5 py-3 text-sm font-black text-white transition hover:bg-[#16284f] disabled:opacity-50"
      >
        {loading ? "Actualizando..." : "Actualizar agente"}
      </button>
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
    { label: "Dashboard SALES AI", href: "/sales-ai" },
    { label: "Brand OS", href: `/brand/${brandSlug}` },
    { label: "Knowledge Brain", href: `/sales-ai/knowledge?${brandQuery}` },
    { label: "Learning Hub", href: `/sales-ai/learning?${brandQuery}` },
  ];

  return (
    <section className="rounded-[30px] border border-[#cfeef6] bg-[#effcff] p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0b9fbd]">
        Navegación de marca
      </p>

      <div className="mt-4 grid gap-2">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#324159] transition hover:bg-[#dff8ff]"
          >
            {link.label} →
          </Link>
        ))}
      </div>
    </section>
  );
}

function LoadWarning({ message }: { message: string }) {
  return (
    <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700">
      No se pudo cargar información real desde Supabase. Detalle: {message}
    </div>
  );
}

function LeadSkeleton() {
  return (
    <div className="rounded-[24px] border border-[#dfe8f3] bg-[#f8fbff] p-4">
      <div className="h-5 w-40 rounded-full bg-[#e3ebf4]" />
      <div className="mt-3 h-4 w-52 rounded-full bg-[#e3ebf4]" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="h-12 rounded-2xl bg-[#e3ebf4]" />
        <div className="h-12 rounded-2xl bg-[#e3ebf4]" />
      </div>
    </div>
  );
}

function EmptyBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[26px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] p-8 text-center">
      <h3 className="text-2xl font-black text-[#0b1836]">{title}</h3>

      <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#60708a]">
        {text}
      </p>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[#dfe8f3] bg-white px-3 py-2">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-[#8a98ad]">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-black text-[#0b1836]">
        {value || "N/D"}
      </p>
    </div>
  );
}

function DecisionItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8a98ad]">
        {label}
      </p>
      <p className="mt-2 text-sm font-black leading-6 text-[#0b1836]">
        {value || "Sin dato"}
      </p>
    </div>
  );
}

function TemperatureBadge({ temperature }: { temperature: string }) {
  const temp = String(temperature || "").toLowerCase();

  const isHot = temp.includes("caliente") || temp.includes("hot");
  const isWarm = temp.includes("tibio") || temp.includes("warm");

  const className = isHot
    ? "border-rose-200 bg-rose-50 text-rose-600"
    : isWarm
    ? "border-amber-200 bg-amber-50 text-amber-600"
    : "border-[#dfe8f3] bg-white text-[#60708a]";

  const label = isHot ? "Caliente" : isWarm ? "Tibio" : "Frío";

  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${className}`}
    >
      {label}
    </span>
  );
}

function Avatar({ name }: { name?: string | null }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#b7f4ef] text-xs font-black text-[#0b5262]">
      {getInitials(name || "AI")}
    </div>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  const safeValue = clampNumber(value, 0, 100);

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold text-[#60708a]">
        <span>{label}</span>
        <span>{safeValue}%</span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf3f8]">
        <div
          className="h-full rounded-full bg-[#22d3ee]"
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
        }deg, #edf3f8 0deg)`,
      }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white ring-8 ring-[#eafbff]">
        <div className="text-center">
          <p className="text-2xl font-black tracking-tight text-[#0b1836]">
            {safeValue}
          </p>
          <p className="text-[10px] font-black text-[#8a98ad]">/100</p>
        </div>
      </div>
    </div>
  );
}

function DarkMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] p-4">
      <p className="truncate text-[10px] font-bold text-[#8a98ad]">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-[#0b1836]">{value}</p>
    </div>
  );
}

function isHotLead(lead: SalesLead) {
  const temp = String(lead.temperature || "").toLowerCase();

  return (
    lead.closeProbability >= 75 ||
    temp.includes("caliente") ||
    temp.includes("hot")
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

type IconName =
  | "planet"
  | "users"
  | "chat"
  | "chart"
  | "pulse"
  | "flame"
  | "user"
  | "alert";

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  if (name === "planet") {
    return (
      <svg viewBox="0 0 48 48" fill="none" className={className}>
        <path
          d="M24 38c8.284 0 15-6.268 15-14S32.284 10 24 10 9 16.268 9 24s6.716 14 15 14Z"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d="M5 28c8.5 4.8 27 6.8 39-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M16 11a4 4 0 1 0-8 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M4 20c.8-4 3.4-6 8-6s7.2 2 8 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "chat") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v5A3.5 3.5 0 0 1 16.5 15H11l-5 4v-4.4A3.5 3.5 0 0 1 4 11.5v-5Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M8 8h8M8 11h5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "chart") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M4 19V5M4 19h16M7 15l4-4 3 3 5-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "pulse") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M3 12h4l2-6 4 12 2-6h6"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "flame") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M12 21c4 0 7-2.7 7-6.8 0-3-1.7-5.1-3.6-6.7-.3 2.4-1.4 3.6-2.5 4.2.3-3.2-1.2-6-4-8.7.1 3.6-2 5.4-3 7.2A8 8 0 0 0 5 14.2C5 18.3 8 21 12 21Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "user") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M4.5 20c1-4 3.5-6 7.5-6s6.5 2 7.5 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 9v4M12 17h.01M10.3 4.3 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}