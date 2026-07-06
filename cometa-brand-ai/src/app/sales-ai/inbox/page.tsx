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
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  waId?: string;
  phone?: string;
  messageId?: string;
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
  agentReply?: string;
  nextAction: string;
  agentMode?: string;
  nextFollowUpAt?: string | null;
  rawData?: any;
  createdAt: string | null;
};

type RuntimeSettings = {
  brand_name: string;
  agent_mode: string;
  whatsapp_status: string;
  whatsapp_phone_number?: string | null;
  auto_reply_enabled?: boolean;
  send_whatsapp_enabled?: boolean;
  followups_enabled?: boolean;
  human_escalation_enabled?: boolean;
  max_followups?: number;
  first_followup_delay_minutes?: number;
};

type NavItem = {
  code: string;
  label: string;
  description: string;
  href: string;
  active?: boolean;
  icon: IconName;
  group: "main" | "tools";
};

type FilterKey = "all" | "hot" | "qualified" | "human";

type SafetyState = {
  label: string;
  tone: "safe" | "warning" | "blocked" | "neutral";
  reasons: string[];
  mode: string;
  whatsappStatus: string;
};

const fallbackBrand: BrandContext = {
  id: null,
  slug: "cometa-mkt",
  name: "Cometa Mkt",
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
  automationMode: "Observación",
  health: 82,
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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestedBrandSlug = searchParams.get("brandSlug") || "";

  const [brand, setBrand] = useState<BrandContext>(fallbackBrand);
  const [metrics, setMetrics] = useState<InboxMetrics>(fallbackMetrics);
  const [runtimeSettings, setRuntimeSettings] =
    useState<RuntimeSettings | null>(null);

  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [messages, setMessages] = useState<SalesMessage[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");

  const [loading, setLoading] = useState(true);
  const [systemMessage, setSystemMessage] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [note, setNote] = useState("");

  const activeBrandSlug = brand.slug || requestedBrandSlug || "cometa-mkt";
  const brandQuery = `brandSlug=${encodeURIComponent(activeBrandSlug)}`;

  const nav = useMemo(
    () => buildNav(activeBrandSlug, pathname),
    [activeBrandSlug, pathname]
  );

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
      const nextMetrics = data.metrics || fallbackMetrics;

      setBrand(nextBrand);
      setMetrics(nextMetrics);
      setLeads(nextLeads);

      setMessages(
        normalizeInboxMessages(
          Array.isArray(data.conversations)
            ? data.conversations
            : Array.isArray(data.messages)
            ? data.messages
            : Array.isArray(data.salesMessages)
            ? data.salesMessages
            : Array.isArray(data.whatsappMessages)
            ? data.whatsappMessages
            : []
        )
      );

      setAgentRuns(Array.isArray(data.agentRuns) ? data.agentRuns : []);

      setSelectedLeadId((current) => {
        if (current && nextLeads.some((lead: SalesLead) => lead.id === current)) {
          return current;
        }

        return nextLeads[0]?.id || "";
      });

      const safeBrandName = nextBrand?.name || "Cometa Mkt";
      const settings = await fetchRuntimeSettings(safeBrandName);
      setRuntimeSettings(settings);
    } catch (error: any) {
      setSystemMessage(error?.message || "Error cargando Inbox.");
      setBrand(fallbackBrand);
      setMetrics(fallbackMetrics);
      setRuntimeSettings(null);
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
    if (filter === "hot") return leads.filter((lead) => isHotLead(lead));
    if (filter === "human") return leads.filter((lead) => lead.requiresHuman);
    if (filter === "qualified") return leads.filter((lead) => lead.isQualified);

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

    const selectedPhone = cleanPhone(selectedLead.phone);

    return messages
      .filter((message) => {
        if (message.leadId && message.leadId === selectedLead.id) return true;

        const messagePhone = cleanPhone(
          message.waId || message.phone || message.sender || ""
        );

        return Boolean(selectedPhone && messagePhone === selectedPhone);
      })
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

        return aTime - bTime;
      });
  }, [messages, selectedLead]);

  const selectedRun = useMemo(() => {
    if (!selectedLead) return null;

    return (
      agentRuns
        .filter((run) => run.leadId === selectedLead.id)
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

          return bTime - aTime;
        })[0] || null
    );
  }, [agentRuns, selectedLead]);

  const safety = useMemo(() => {
    return deriveSafetyState(selectedRun, runtimeSettings, metrics);
  }, [selectedRun, runtimeSettings, metrics]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f9fc] text-[#081535]">
      <div className="flex min-h-screen">
        <LeftRail nav={nav} brand={brand} />

        <div className="min-w-0 flex-1 px-4 py-4 lg:px-5 xl:px-6">
          <MobileSalesNav nav={nav} brand={brand} />

          <div className="mx-auto w-full max-w-[1740px] space-y-4">
            {systemMessage ? <LoadWarning message={systemMessage} /> : null}

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_620px]">
              <InboxHero
                brand={brand}
                loading={loading}
                onRefresh={loadInbox}
              />

              <InboxHealthPanel
                metrics={metrics}
                safety={safety}
                runtimeSettings={runtimeSettings}
                loading={loading}
              />
            </section>

            <InboxMetricsGrid metrics={metrics} loading={loading} />

            <section className="grid grid-cols-1 gap-4 2xl:grid-cols-[380px_minmax(620px,1fr)_420px]">
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
                agentRun={selectedRun}
                safety={safety}
                loading={loading}
                note={note}
                setNote={setNote}
              />

              <AgentAuditPanel
                brandQuery={brandQuery}
                brandSlug={activeBrandSlug}
                metrics={metrics}
                safety={safety}
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

async function fetchRuntimeSettings(brandName: string) {
  try {
    const res = await fetch(
      `/api/sales-ai/agent-settings?brandName=${encodeURIComponent(brandName)}`,
      {
        method: "GET",
        cache: "no-store",
      }
    );

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) return null;

    return data.settings as RuntimeSettings;
  } catch {
    return null;
  }
}

function InboxLoadingScreen() {
  return (
    <main className="min-h-screen bg-[#f6f9fc] p-6">
      <div className="mx-auto max-w-5xl rounded-[30px] border border-[#dfe8f3] bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#0aa6c4]">
          SALES AI
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-[#081535]">
          Cargando Inbox...
        </h1>
      </div>
    </main>
  );
}

function buildNav(brandSlug: string, pathname: string): NavItem[] {
  const safeBrandSlug = encodeURIComponent(brandSlug || "cometa-mkt");

  const withBrand = (href: string) => {
    if (href === "/workspace") return href;
    return `${href}?brandSlug=${safeBrandSlug}`;
  };

  const items: NavItem[] = [
    {
      code: "AI",
      label: "Dashboard",
      description: "Resumen comercial",
      href: withBrand("/sales-ai"),
      icon: "planet",
      group: "main",
    },
    {
      code: "IN",
      label: "Inbox",
      description: "Conversaciones WhatsApp",
      href: withBrand("/sales-ai/inbox"),
      icon: "chat",
      group: "main",
    },
    {
      code: "WA",
      label: "WhatsApp",
      description: "Conexión y estado",
      href: withBrand("/sales-ai/connect"),
      icon: "whatsapp",
      group: "main",
    },
    {
      code: "KB",
      label: "Knowledge",
      description: "Base de conocimiento",
      href: withBrand("/sales-ai/knowledge"),
      icon: "brain",
      group: "tools",
    },
    {
      code: "LR",
      label: "Learning",
      description: "Aprendizaje del agente",
      href: withBrand("/sales-ai/learning"),
      icon: "brain",
      group: "tools",
    },
    {
      code: "SET",
      label: "Ajustes",
      description: "Reglas y permisos",
      href: withBrand("/sales-ai/agent-settings"),
      icon: "gear",
      group: "tools",
    },
    {
      code: "WS",
      label: "Workspace",
      description: "Volver al panel",
      href: "/workspace",
      icon: "shield",
      group: "tools",
    },
  ];

  return items.map((item) => ({
    ...item,
    active: isNavActive(pathname, item.href),
  }));
}

function isNavActive(pathname: string, href: string) {
  const cleanHref = href.split("?")[0];

  if (cleanHref === "/sales-ai") {
    return pathname === "/sales-ai";
  }

  return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
}

function LeftRail({ nav, brand }: { nav: NavItem[]; brand: BrandContext }) {
  const mainNav = nav.filter((item) => item.group === "main");
  const toolsNav = nav.filter((item) => item.group === "tools");
  const homeHref = nav.find((item) => item.code === "AI")?.href || "/sales-ai";

  return (
    <aside className="sticky top-0 hidden h-screen w-[132px] shrink-0 border-r border-[#dce9f3] bg-white/95 px-4 py-5 shadow-[12px_0_38px_rgba(15,23,42,0.045)] backdrop-blur xl:flex xl:flex-col">
      <Link
        href={homeHref}
        className="group flex flex-col items-center rounded-[30px] border border-[#d8f3f8] bg-[#effcff] px-3 py-4 text-center transition hover:scale-[1.02] hover:shadow-[0_16px_34px_rgba(8,169,198,0.16)]"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-[26px] bg-white text-[#08a9c6] shadow-sm ring-1 ring-[#d6f5fb]">
          <Icon name="planet" className="h-11 w-11" />
        </div>

        <p className="mt-3 text-[13px] font-black leading-4 tracking-tight text-[#081535]">
          COMETA
          <br />
          OS
        </p>

        <span className="mt-2 rounded-full bg-[#12bfe8]/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#0798b8]">
          Sales AI
        </span>
      </Link>

      <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        <div>
          <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#9aa8ba]">
            Operación
          </p>

          <div className="grid gap-2">
            {mainNav.map((item) => (
              <SidebarNavItem key={item.href} item={item} />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#9aa8ba]">
            Sistema
          </p>

          <div className="grid gap-2">
            {toolsNav.map((item) => (
              <SidebarNavItem key={item.href} item={item} compact />
            ))}
          </div>
        </div>
      </nav>

      <div className="mt-5 rounded-[28px] border border-[#dfe8f3] bg-[#f8fbff] p-3 text-center shadow-sm">
        <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#081535] text-sm font-black text-white shadow-[0_14px_30px_rgba(8,21,53,0.18)]">
          {getInitials(brand.name)}
          <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white bg-[#12b981]" />
        </div>

        <p className="mt-3 truncate text-xs font-black text-[#081535]">
          {brand.name || "Cometa Mkt"}
        </p>

        <p className="mt-1 truncate text-[10px] font-bold text-[#728199]">
          WhatsApp activo
        </p>
      </div>
    </aside>
  );
}

function SidebarNavItem({
  item,
  compact = false,
}: {
  item: NavItem;
  compact?: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={`${item.label} · ${item.description}`}
      className={`group relative flex items-center gap-3 rounded-[22px] border px-3 py-3 text-left transition ${
        item.active
          ? "border-[#08a9c6] bg-[#08a9c6] text-white shadow-[0_14px_30px_rgba(8,169,198,0.28)]"
          : "border-[#dfe8f3] bg-white text-[#62718a] hover:border-[#bdeaf2] hover:bg-[#f8fdff] hover:text-[#08a9c6]"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
          item.active
            ? "bg-white/18 text-white"
            : "bg-[#effcff] text-[#08a9c6] group-hover:bg-[#dff8ff]"
        }`}
      >
        <Icon name={item.icon} className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-black leading-4">
          {item.label}
        </span>

        {!compact ? (
          <span
            className={`mt-0.5 block truncate text-[9px] font-bold leading-3 ${
              item.active ? "text-white/75" : "text-[#8a98ad]"
            }`}
          >
            {item.description}
          </span>
        ) : null}
      </span>

      {item.active ? (
        <span className="absolute -right-1 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-white" />
      ) : null}
    </Link>
  );
}

function MobileSalesNav({
  nav,
  brand,
}: {
  nav: NavItem[];
  brand: BrandContext;
}) {
  return (
    <div className="mb-4 rounded-[26px] border border-[#dfe8f3] bg-white p-3 shadow-sm xl:hidden">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#08a9c6]">
            SALES AI
          </p>
          <p className="truncate text-lg font-black text-[#081535]">
            {brand.name}
          </p>
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#081535] text-xs font-black text-white">
          {getInitials(brand.name)}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-2xl border px-4 py-3 text-xs font-black ${
              item.active
                ? "border-[#08a9c6] bg-[#08a9c6] text-white"
                : "border-[#dfe8f3] bg-[#f8fbff] text-[#60708a]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function InboxHero({
  brand,
  loading,
  onRefresh,
}: {
  brand: BrandContext;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="rounded-[30px] border border-[#dfe8f3] bg-white p-7 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#cfeef6] bg-[#effcff] px-4 py-2 text-xs font-black tracking-wide text-[#0798b8] shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-[#12bfe8]" />
            SALES AI · INBOX COMMAND CENTER
          </div>

          <p className="mt-7 text-sm font-black uppercase tracking-[0.28em] text-[#728199]">
            {brand.name}
          </p>

          <h1 className="mt-3 text-5xl font-black tracking-tight text-[#081535] xl:text-[56px] xl:leading-[1.02]">
            Inbox de ventas
          </h1>

          <p className="mt-4 max-w-3xl text-lg font-semibold leading-8 text-[#52617a]">
            Conversaciones, intención comercial, respuestas generadas, auditoría
            del agente y candados de seguridad en una sola bandeja.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center gap-3 rounded-2xl bg-[#08a9c6] px-6 py-4 text-sm font-black text-white shadow-[0_14px_30px_rgba(8,169,198,0.24)] transition hover:bg-[#0598b5] disabled:opacity-50"
          >
            <Icon name="refresh" className="h-5 w-5" />
            {loading ? "Actualizando..." : "Actualizar Inbox"}
          </button>

          <Link
            href={`/sales-ai/agent-settings?brandSlug=${encodeURIComponent(
              brand.slug || "cometa-mkt"
            )}`}
            className="inline-flex items-center justify-center gap-3 rounded-2xl border border-[#dbe6f0] bg-white px-6 py-4 text-sm font-black text-[#0b1836] shadow-sm transition hover:border-[#b8d7e4] hover:bg-[#f8fcff]"
          >
            <Icon name="gear" className="h-5 w-5" />
            Configurar agente
          </Link>
        </div>
      </div>
    </header>
  );
}

function InboxHealthPanel({
  metrics,
  safety,
  runtimeSettings,
  loading,
}: {
  metrics: InboxMetrics;
  safety: SafetyState;
  runtimeSettings: RuntimeSettings | null;
  loading: boolean;
}) {
  return (
    <section className="rounded-[30px] border border-[#dfe8f3] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_150px_1fr]">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.28em] text-[#728199]">
            Inbox Health
          </p>

          <p className="mt-5 text-6xl font-black tracking-tight text-[#081535]">
            {loading ? "..." : `${metrics.health}%`}
          </p>

          <p className="mt-2 text-base font-bold text-[#60708a]">
            {metrics.automationMode || "Controlado"}
          </p>
        </div>

        <div className="flex items-center justify-center md:border-r md:border-[#e6eef6] md:pr-6">
          <ScoreRing value={metrics.health || 0} />
        </div>

        <div className="space-y-4">
          <HealthLine
            icon="shield"
            label="Modo"
            value={labelAgentMode(runtimeSettings?.agent_mode)}
          />
          <HealthLine
            icon="chat"
            label="WhatsApp"
            value={labelWhatsappStatus(runtimeSettings?.whatsapp_status)}
          />
          <HealthLine
            icon="clock"
            label="Auto reply"
            value={
              runtimeSettings?.auto_reply_enabled ? "Activado" : "Desactivado"
            }
          />
          <HealthLine
            icon="whatsapp"
            label="Send WhatsApp"
            value={
              runtimeSettings?.send_whatsapp_enabled ? "Activado" : "Desactivado"
            }
          />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black text-[#081535]">
            Candado de WhatsApp
          </p>
          <SafetyBadge safety={safety} />
        </div>

        <p className="mt-2 line-clamp-2 text-xs font-bold leading-5 text-[#60708a]">
          {safety.reasons.length
            ? safety.reasons.slice(0, 3).join(" · ")
            : "Sin bloqueo detectado en la última decisión."}
        </p>
      </div>
    </section>
  );
}

function HealthLine({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#effcff] text-[#08a9c6]">
        <Icon name={icon} className="h-5 w-5" />
      </div>

      <div>
        <p className="text-xs font-black text-[#60708a]">{label}</p>
        <p className="text-sm font-black text-[#081535]">{value}</p>
      </div>
    </div>
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
      label: "Respuestas listas",
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
    {
      label: "Aprendizaje",
      value: metrics.pendingLearning,
      icon: "brain" as IconName,
      tone: "blue" as const,
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
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
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${toneMap[tone]}`}
        >
          <Icon name={icon} className="h-7 w-7" />
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#66758d]">{label}</p>
          <p className="mt-1 text-3xl font-black text-[#081535]">{value}</p>
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
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.28em] text-[#728199]">
            Inbox comercial
          </p>
          <h2 className="mt-2 text-3xl font-black text-[#081535]">
            Conversaciones
          </h2>
        </div>

        <span className="rounded-full bg-[#f3f7fb] px-4 py-2 text-sm font-black text-[#60708a]">
          {totalLeads} total
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {filters.map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`rounded-2xl px-3 py-3 text-xs font-black transition ${
              filter === item.key
                ? "bg-[#08a9c6] text-white shadow-[0_10px_22px_rgba(8,169,198,0.22)]"
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
      className={`rounded-[22px] border p-4 text-left transition ${
        selected
          ? "border-[#0aa6c4] bg-[#effcff] shadow-sm"
          : "border-[#e2eaf3] bg-white hover:border-[#bdeaf2] hover:bg-[#fbfeff]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={lead.name} />

          <div className="min-w-0">
            <h3 className="truncate text-base font-black leading-tight text-[#081535]">
              {lead.name || "Lead sin nombre"}
            </h3>
            <p className="mt-1 truncate text-xs font-bold text-[#78889e]">
              {formatPhone(lead.phone) || lead.intent || "Sin contacto"}
            </p>
          </div>
        </div>

        <TemperatureBadge temperature={lead.temperature} />
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-3">
        <div>
          <p className="text-xs font-bold text-[#60708a]">
            <span className="inline-flex h-2 w-2 rounded-full bg-[#00a86b]" />{" "}
            {lead.status || "new"}
          </p>
          <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-[#65758d]">
            {lead.lastMessage ||
              lead.nextAction ||
              "SALES AI está evaluando el siguiente paso."}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs font-bold text-[#60708a]">Cierre</p>
          <p className="text-2xl font-black text-[#081535]">
            {lead.closeProbability}%
          </p>
        </div>
      </div>
    </button>
  );
}

function ConversationPanel({
  brand,
  lead,
  messages,
  agentRun,
  safety,
  loading,
  note,
  setNote,
}: {
  brand: BrandContext;
  lead: SalesLead | null;
  messages: SalesMessage[];
  agentRun: AgentRun | null;
  safety: SafetyState;
  loading: boolean;
  note: string;
  setNote: (value: string) => void;
}) {
  const agentReply = getAgentReply(agentRun, lead);
  const displayMessages = buildDisplayMessages(lead, messages, agentReply);

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#dfe8f3] bg-white shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#e8eef5] px-6 py-5">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-[#728199]">
              Conversación comercial
            </p>

            <h2 className="mt-3 max-w-[680px] break-words text-3xl font-black leading-tight text-[#081535] 2xl:text-4xl">
              {lead ? lead.name : brand.name}
            </h2>

            {lead ? (
              <p className="mt-2 text-sm font-bold text-[#728199]">
                {formatPhone(lead.phone) || "Sin teléfono registrado"}
              </p>
            ) : null}
          </div>

          {lead ? (
            <div className="flex flex-wrap gap-2">
              <StatusPill value={agentRun?.actionStatus || "sin_run"} />
              <SafetyBadge safety={safety} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-[720px] bg-[#f8fbff] p-5">
        {loading ? (
          <EmptyBox title="Cargando conversación..." text="Sincronizando datos." />
        ) : lead ? (
          <>
            <div className="grid gap-4">
              {displayMessages.length ? (
                displayMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))
              ) : (
                <EmptyBox
                  title="Sin mensajes cargados"
                  text="El lead existe, pero todavía no hay historial conectado a este prospecto."
                />
              )}
            </div>

            {agentReply ? <RecommendedReply reply={agentReply} /> : null}

            <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_150px]">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Escribe una nota interna..."
                className="rounded-2xl border border-[#dfe8f3] bg-white px-5 py-4 text-sm font-bold text-[#081535] outline-none transition focus:border-[#20c6df] focus:ring-4 focus:ring-[#dff8ff]"
              />

              <button
                type="button"
                className="rounded-2xl bg-[#08a9c6] px-5 py-4 text-sm font-black text-white shadow-[0_12px_28px_rgba(8,169,198,0.22)] transition hover:bg-[#0598b5]"
              >
                Guardar nota
              </button>
            </div>
          </>
        ) : (
          <EmptyBox
            title="Selecciona un prospecto"
            text="Aquí aparecerá la conversación, respuesta sugerida y decisión de SALES AI."
          />
        )}
      </div>
    </section>
  );
}

function MessageBubble({ message }: { message: SalesMessage }) {
  const isOutbound =
    message.direction === "outbound" ||
    message.direction === "ai" ||
    message.sender?.toLowerCase().includes("sales");

  return (
    <div className={`flex items-start gap-3 ${isOutbound ? "justify-end" : ""}`}>
      {!isOutbound ? <Avatar name={message.sender || "Cliente"} /> : null}

      <div
        className={`max-w-[82%] rounded-[22px] px-5 py-4 text-sm font-semibold leading-6 ${
          isOutbound
            ? "bg-[#dff7ff] text-[#081535]"
            : "border border-[#dfe8f3] bg-white text-[#52617a]"
        }`}
      >
        <p
          className={`mb-1 text-[11px] font-black uppercase tracking-[0.14em] ${
            isOutbound ? "text-[#0798b8]" : "text-[#728199]"
          }`}
        >
          {isOutbound ? "SALES AI" : message.sender || "Cliente"}
          {message.createdAt ? ` · ${formatDateTime(message.createdAt)}` : ""}
        </p>

        <p className="whitespace-pre-wrap">
          {message.content || "Mensaje sin contenido."}
        </p>
      </div>

      {isOutbound ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1677ff] text-white">
          <Icon name="bot" className="h-5 w-5" />
        </div>
      ) : null}
    </div>
  );
}

function RecommendedReply({ reply }: { reply: string }) {
  return (
    <div className="mt-5 rounded-[26px] border border-[#bdeef7] bg-[#effcff] p-5">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-[#0b9fbd]">
        Respuesta generada por SALES AI
      </p>

      <p className="mt-4 whitespace-pre-wrap text-sm font-bold leading-7 text-[#26354d]">
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

        <button
          type="button"
          className="rounded-2xl border border-[#dfe8f3] bg-white px-4 py-3 text-xs font-black text-[#324159] transition hover:bg-[#f8fbff]"
        >
          👍
        </button>
      </div>
    </div>
  );
}

function AgentAuditPanel({
  brandQuery,
  brandSlug,
  metrics,
  safety,
  lead,
  agentRun,
  loading,
  onRefresh,
}: {
  brandQuery: string;
  brandSlug: string;
  metrics: InboxMetrics;
  safety: SafetyState;
  lead: SalesLead | null;
  agentRun: AgentRun | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <aside className="space-y-4 xl:sticky xl:top-4 xl:h-fit">
      <AgentLeadCard lead={lead} agentRun={agentRun} safety={safety} />

      <AgentNextAction lead={lead} agentRun={agentRun} />

      <RuntimeSafetyCard safety={safety} agentRun={agentRun} />

      <QuickLinks brandQuery={brandQuery} brandSlug={brandSlug} />

      <button
        onClick={onRefresh}
        disabled={loading}
        className="w-full rounded-2xl bg-[#081535] px-5 py-4 text-sm font-black text-white transition hover:bg-[#16284f] disabled:opacity-50"
      >
        {loading ? "Actualizando..." : "Actualizar agente"}
      </button>
    </aside>
  );
}

function AgentLeadCard({
  lead,
  agentRun,
  safety,
}: {
  lead: SalesLead | null;
  agentRun: AgentRun | null;
  safety: SafetyState;
}) {
  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-black uppercase tracking-[0.28em] text-[#0aa6c4]">
          Auditoría de SALES AI
        </p>
        <SafetyBadge safety={safety} />
      </div>

      {lead ? (
        <>
          <div className="mt-6 flex items-start gap-4">
            <Avatar name={lead.name} />

            <div className="min-w-0">
              <h3 className="break-words text-2xl font-black leading-tight text-[#081535]">
                {lead.name}
              </h3>
              <p className="mt-1 text-sm font-bold text-[#728199]">
                {formatPhone(lead.phone) || "Sin teléfono"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <DecisionItem label="Intención" value={lead.intent} />
            <DecisionItem label="Objeción" value={lead.mainObjection} />
            <DecisionItem
              label="Calificación"
              value={lead.isQualified ? "Calificado" : "Por calificar"}
            />
            <DecisionItem
              label="Confianza IA"
              value={agentRun ? `${agentRun.confidenceScore || 0}%` : "Sin dato"}
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
  const reply = getAgentReply(agentRun, lead);

  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <p className="text-sm font-black uppercase tracking-[0.28em] text-[#728199]">
        Siguiente acción
      </p>

      <h3 className="mt-3 text-2xl font-black leading-tight text-[#081535]">
        {lead?.nextAction || agentRun?.nextAction || "Sin prospecto seleccionado"}
      </h3>

      <div className="mt-5 rounded-2xl border border-[#bdeef7] bg-[#effcff] p-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#0b9fbd]">
          Razón del agente
        </p>

        <p className="mt-3 text-sm font-bold leading-7 text-[#26354d]">
          {agentRun?.decisionReason ||
            lead?.aiSummary ||
            "SALES AI todavía no tiene una razón registrada para este prospecto."}
        </p>
      </div>

      {reply ? (
        <div className="mt-4 rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#728199]">
            Respuesta sugerida
          </p>

          <p className="mt-3 line-clamp-6 text-sm font-bold leading-7 text-[#26354d]">
            {reply}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function RuntimeSafetyCard({
  safety,
  agentRun,
}: {
  safety: SafetyState;
  agentRun: AgentRun | null;
}) {
  return (
    <section className="rounded-[28px] border border-[#dfe8f3] bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.28em] text-[#728199]">
            Seguridad de ejecución
          </p>

          <h3 className="mt-3 text-2xl font-black leading-tight text-[#081535]">
            {safety.label}
          </h3>
        </div>

        <SafetyBadge safety={safety} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <DarkMini label="Modo" value={labelAgentMode(safety.mode)} />
        <DarkMini
          label="WhatsApp"
          value={labelWhatsappStatus(safety.whatsappStatus)}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] p-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#728199]">
          Razones del candado
        </p>

        <div className="mt-3 grid gap-2">
          {safety.reasons.length ? (
            safety.reasons.map((reason) => (
              <div
                key={reason}
                className="rounded-xl bg-white px-4 py-3 text-sm font-black text-[#324159]"
              >
                {reason}
              </div>
            ))
          ) : (
            <p className="text-sm font-semibold leading-6 text-[#60708a]">
              No hay razones de bloqueo registradas en la última ejecución.
            </p>
          )}
        </div>
      </div>

      {agentRun ? (
        <div className="mt-4 rounded-2xl border border-[#dfe8f3] bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#728199]">
            Último action_status
          </p>
          <p className="mt-2 text-sm font-black text-[#081535]">
            {formatActionStatus(agentRun.actionStatus)}
          </p>
        </div>
      ) : null}
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
    { label: "Dashboard SALES AI", href: `/sales-ai?${brandQuery}` },
    { label: "Conexión WhatsApp", href: `/sales-ai/connect?${brandQuery}` },
    { label: "Configurar agente", href: `/sales-ai/agent-settings?${brandQuery}` },
    { label: "Knowledge Brain", href: `/sales-ai/knowledge?${brandQuery}` },
    { label: "Learning Hub", href: `/sales-ai/learning?${brandQuery}` },
    { label: "Brand OS", href: `/brand/${brandSlug}` },
  ];

  return (
    <section className="rounded-[28px] border border-[#cfeef6] bg-[#effcff] p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#0b9fbd]">
        Navegación
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

function DecisionItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a98ad]">
        {label}
      </p>
      <p className="mt-2 text-sm font-black leading-6 text-[#081535]">
        {value || "Sin dato"}
      </p>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const tone = getActionStatusTone(value);

  const toneMap = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-cyan-200 bg-cyan-50 text-cyan-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
    neutral: "border-[#dfe8f3] bg-white text-[#60708a]",
  };

  return (
    <span
      className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${toneMap[tone]}`}
    >
      {formatActionStatus(value)}
    </span>
  );
}

function SafetyBadge({ safety }: { safety: SafetyState }) {
  const toneMap = {
    safe: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    blocked: "border-red-200 bg-red-50 text-red-700",
    neutral: "border-[#dfe8f3] bg-white text-[#60708a]",
  };

  return (
    <span
      className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${toneMap[safety.tone]}`}
    >
      {safety.tone === "blocked"
        ? "Bloqueado"
        : safety.tone === "safe"
        ? "Controlado"
        : safety.tone === "warning"
        ? "Revisión"
        : "Sin dato"}
    </span>
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
    : "border-blue-200 bg-blue-50 text-blue-600";

  const label = isHot ? "Caliente" : isWarm ? "Tibio" : "Frío";

  return (
    <span
      className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${className}`}
    >
      {label}
    </span>
  );
}

function Avatar({ name }: { name?: string | null }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#b7f4ef] text-xs font-black text-[#0b5262]">
      {getInitials(name || "AI")}
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const safeValue = clampNumber(value, 0, 100);

  return (
    <div
      className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(#22d3ee ${
          safeValue * 3.6
        }deg, #edf3f8 0deg)`,
      }}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white ring-8 ring-[#eafbff]">
        <div className="text-center">
          <p className="text-3xl font-black tracking-tight text-[#081535]">
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
      <p className="truncate text-xs font-bold text-[#8a98ad]">{label}</p>
      <p className="mt-2 truncate text-xl font-black text-[#081535]">{value}</p>
    </div>
  );
}

function LeadSkeleton() {
  return (
    <div className="rounded-[22px] border border-[#dfe8f3] bg-[#f8fbff] p-4">
      <div className="h-5 w-40 rounded-full bg-[#e3ebf4]" />
      <div className="mt-3 h-4 w-52 rounded-full bg-[#e3ebf4]" />
      <div className="mt-4 h-14 rounded-2xl bg-[#e3ebf4]" />
    </div>
  );
}

function EmptyBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[26px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] p-8 text-center">
      <h3 className="text-2xl font-black text-[#081535]">{title}</h3>

      <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[#60708a]">
        {text}
      </p>
    </div>
  );
}

function LoadWarning({ message }: { message: string }) {
  return (
    <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700">
      No se pudo cargar información real desde Supabase. Detalle: {message}
    </div>
  );
}

function buildDisplayMessages(
  lead: SalesLead | null,
  messages: SalesMessage[],
  agentReply: string
): SalesMessage[] {
  if (!lead) return [];

  if (messages.length) return messages;

  const now = new Date().toISOString();

  const inbound =
    lead.lastMessage ||
    "Hola, me gustaría más información sobre sus servicios y precios.";

  const display: SalesMessage[] = [
    {
      id: "fallback-inbound",
      leadId: lead.id,
      direction: "inbound",
      content: inbound,
      sender: lead.name || "Cliente",
      createdAt: lead.lastMessageAt || now,
      waId: lead.phone,
      phone: lead.phone,
    },
  ];

  if (agentReply) {
    display.push({
      id: "fallback-outbound",
      leadId: lead.id,
      direction: "outbound",
      content: agentReply,
      sender: "SALES AI",
      createdAt: now,
      waId: lead.phone,
      phone: lead.phone,
    });
  }

  return display;
}

function normalizeInboxMessages(rows: any[]): SalesMessage[] {
  return rows
    .map((row, index) => {
      const direction =
        row?.direction || row?.message_direction || row?.type || "inbound";

      const content =
        row?.content ||
        row?.content_text ||
        row?.message ||
        row?.body ||
        row?.text ||
        row?.incoming_message ||
        row?.raw_message?.text?.body ||
        "";

      const waId =
        row?.waId ||
        row?.wa_id ||
        row?.from_number ||
        row?.from ||
        row?.to_number ||
        row?.to ||
        row?.phone ||
        "";

      const sender =
        row?.sender ||
        row?.sender_name ||
        row?.profile_name ||
        (String(direction).toLowerCase() === "outbound"
          ? "SALES AI"
          : "Cliente");

      return {
        id: String(
          row?.id ||
            row?.message_id ||
            row?.whatsapp_message_id ||
            row?.external_message_id ||
            `message-${index}`
        ),
        leadId: String(row?.leadId || row?.lead_id || row?.sales_lead_id || ""),
        direction: String(direction || "inbound"),
        content: String(content || ""),
        sender: String(sender || "Cliente"),
        createdAt:
          row?.createdAt ||
          row?.created_at ||
          row?.timestamp_at ||
          row?.inserted_at ||
          null,
        waId: String(waId || ""),
        phone: String(waId || ""),
        messageId: String(row?.message_id || row?.whatsapp_message_id || ""),
      };
    })
    .filter((message) => message.content || message.messageId || message.id);
}

function deriveSafetyState(
  agentRun: AgentRun | null,
  runtimeSettings: RuntimeSettings | null,
  metrics: InboxMetrics
): SafetyState {
  const mode =
    runtimeSettings?.agent_mode ||
    agentRun?.agentMode ||
    String(metrics.automationMode || "observation").toLowerCase();

  const whatsappStatus = runtimeSettings?.whatsapp_status || "sin_dato";

  const reasons: string[] = [];

  if (mode !== "automatic") {
    reasons.push(`agent_mode=${mode}`);
  }

  if (whatsappStatus !== "connected") {
    reasons.push(`whatsapp_status=${whatsappStatus}`);
  }

  if (runtimeSettings?.auto_reply_enabled !== true) {
    reasons.push("auto_reply_enabled=false");
  }

  if (runtimeSettings?.send_whatsapp_enabled !== true) {
    reasons.push("send_whatsapp_enabled=false");
  }

  const actionStatus = String(agentRun?.actionStatus || "").toLowerCase();

  if (actionStatus.includes("sent_whatsapp")) {
    return {
      label: "WhatsApp enviado",
      tone: "safe",
      reasons: ["El último mensaje fue ejecutado."],
      mode,
      whatsappStatus,
    };
  }

  if (actionStatus.includes("ready_to_execute")) {
    return {
      label: "Listo para ejecutar",
      tone: "warning",
      reasons,
      mode,
      whatsappStatus,
    };
  }

  if (reasons.length) {
    return {
      label: "Protegido por candados",
      tone: "blocked",
      reasons,
      mode,
      whatsappStatus,
    };
  }

  return {
    label: "Controlado",
    tone: "safe",
    reasons: ["Configuración lista para ejecución controlada."],
    mode,
    whatsappStatus,
  };
}

function getAgentReply(agentRun: AgentRun | null, lead: SalesLead | null) {
  return (
    agentRun?.agentReply ||
    agentRun?.recommendedReply ||
    lead?.recommendedReply ||
    ""
  );
}

function getActionStatusTone(
  value: string
): "green" | "blue" | "amber" | "red" | "neutral" {
  const status = String(value || "").toLowerCase();

  if (status.includes("sent")) return "green";
  if (status.includes("ready")) return "blue";
  if (status.includes("observation") || status.includes("logged")) {
    return "amber";
  }
  if (status.includes("failed") || status.includes("blocked")) return "red";

  return "neutral";
}

function isHotLead(lead: SalesLead) {
  const temp = String(lead.temperature || "").toLowerCase();

  return (
    lead.closeProbability >= 75 ||
    temp.includes("caliente") ||
    temp.includes("hot")
  );
}

function formatActionStatus(value: string) {
  const normalized = String(value || "Sin status").replaceAll("_", " ");

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sin fecha";

  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Fecha inválida";
  }
}

function formatPhone(value?: string | null) {
  const clean = String(value || "").replace(/\D/g, "");

  if (clean.length === 10) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }

  if (clean.length === 12 && clean.startsWith("52")) {
    return `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(
      5,
      8
    )} ${clean.slice(8)}`;
  }

  if (clean.length === 13 && clean.startsWith("521")) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(
      6,
      9
    )} ${clean.slice(9)}`;
  }

  return value || "";
}

function labelAgentMode(value?: string | null) {
  const mode = String(value || "observation").toLowerCase();

  if (mode === "automatic") return "Automático";
  if (mode === "supervised") return "Supervisado";
  if (mode === "paused") return "Pausado";

  return "Observación";
}

function labelWhatsappStatus(value?: string | null) {
  const status = String(value || "sin_dato").toLowerCase();

  if (status === "connected") return "Conectado";
  if (status === "connection_requested") return "Conexión solicitada";
  if (status === "pending_verification") return "Pendiente";

  return "Sin dato";
}

function getInitials(name: string) {
  const words = String(name || "Cometa OS").split(" ").filter(Boolean);
  const first = words[0]?.[0] || "C";
  const second = words[1]?.[0] || "O";

  return `${first}${second}`.toUpperCase();
}

function cleanPhone(value: any) {
  return String(value || "").replace(/\D/g, "");
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
  | "flame"
  | "user"
  | "alert"
  | "brain"
  | "refresh"
  | "gear"
  | "clock"
  | "shield"
  | "whatsapp"
  | "bot";

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  if (name === "planet") {
    return (
      <svg viewBox="0 0 64 64" fill="none" className={className}>
        <path
          d="M49.2 34.4c-2.5 9.2-12 14.6-21.2 12.1-9.2-2.5-14.6-12-12.1-21.2 2.5-9.2 12-14.6 21.2-12.1"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M39 14l12-6-5 12 12-1-10 8 9 6-13 1 2 12-9-9-10 8 4-13-12-4 13-4-3-12 10 7Z"
          fill="currentColor"
          opacity=".9"
        />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M16 11a4 4 0 1 0-8 0" stroke="currentColor" strokeWidth="2" />
        <path
          d="M4 20c.8-4 3.4-6 8-6s7.2 2 8 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "chat" || name === "whatsapp") {
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

  if (name === "brain" || name === "bot") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <rect
          x="5"
          y="8"
          width="14"
          height="10"
          rx="4"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M12 8V4M8.5 12h.01M15.5 12h.01M9 16h6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "refresh") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M20 12a8 8 0 0 1-14 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M6 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M4 12a8 8 0 0 1 14-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M18 3v4h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "gear") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M19 13v-2l-2-.5a6 6 0 0 0-.7-1.6l1-1.7-1.5-1.5-1.7 1a6 6 0 0 0-1.6-.7L12 3h-2l-.5 2a6 6 0 0 0-1.6.7l-1.7-1-1.5 1.5 1 1.7a6 6 0 0 0-.7 1.6L3 11v2l2 .5a6 6 0 0 0 .7 1.6l-1 1.7 1.5 1.5 1.7-1a6 6 0 0 0 1.6.7l.5 2h2l.5-2a6 6 0 0 0 1.6-.7l1.7 1 1.5-1.5-1-1.7a6 6 0 0 0 .7-1.6L19 13Z"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (name === "clock") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M12 7v5l3 2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (name === "shield") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M12 3 5 6v5c0 4.5 2.7 8.5 7 10 4.3-1.5 7-5.5 7-10V6l-7-3Z"
          stroke="currentColor"
          strokeWidth="2"
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