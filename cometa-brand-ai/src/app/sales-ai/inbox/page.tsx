"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
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
  label: string;
  href: string;
  active?: boolean;
  icon: IconName;
  badge?: string | number;
};

type FilterKey = "all" | "unread" | "mine" | "hot";

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
  const [draftMessage, setDraftMessage] = useState("");

  const activeBrandSlug = brand.slug || requestedBrandSlug || "cometa-mkt";
  const brandQuery = `brandSlug=${encodeURIComponent(activeBrandSlug)}`;

  const nav = useMemo(
    () => buildNav(activeBrandSlug, pathname, metrics),
    [activeBrandSlug, pathname, metrics]
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
    if (filter === "unread") {
      return leads.filter((lead) => {
        const status = String(lead.status || "").toLowerCase();
        return status.includes("new") || status.includes("nuevo");
      });
    }
    if (filter === "mine") return leads;

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

  const agentReply = getAgentReply(selectedRun, selectedLead);

  useEffect(() => {
    setDraftMessage(agentReply || "");
  }, [agentReply, selectedLead?.id]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#eef6ff] text-[#071333]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[18%] top-[-18%] h-[420px] w-[420px] rounded-full bg-[#47d7ff]/20 blur-[90px]" />
        <div className="absolute right-[-8%] top-[10%] h-[520px] w-[520px] rounded-full bg-[#a78bfa]/15 blur-[110px]" />
        <div className="absolute bottom-[-18%] left-[38%] h-[440px] w-[440px] rounded-full bg-[#12d6b2]/12 blur-[100px]" />
      </div>

      <div className="relative flex min-h-screen">
        <SalesSidebar nav={nav} brand={brand} metrics={metrics} />

        <div className="min-w-0 flex-1 px-4 py-4 lg:px-6 xl:px-7 2xl:px-8">
          <MobileTopNav nav={nav} brand={brand} />

          <div className="mx-auto w-full max-w-[1800px] space-y-5">
            {systemMessage ? <LoadWarning message={systemMessage} /> : null}

            <TopCommandBar
              brand={brand}
              runtimeSettings={runtimeSettings}
              loading={loading}
              onRefresh={loadInbox}
            />

            <KpiStrip
              metrics={metrics}
              leads={leads}
              runtimeSettings={runtimeSettings}
              loading={loading}
            />

            <section className="grid grid-cols-1 gap-5 2xl:grid-cols-[330px_minmax(560px,1fr)_420px]">
              <ConversationList
                leads={filteredLeads}
                allLeads={leads}
                selectedLeadId={selectedLead?.id || ""}
                filter={filter}
                setFilter={setFilter}
                loading={loading}
                onSelect={setSelectedLeadId}
              />

              <ChatWorkspace
                brand={brand}
                lead={selectedLead}
                messages={selectedMessages}
                agentRun={selectedRun}
                draftMessage={draftMessage}
                setDraftMessage={setDraftMessage}
                loading={loading}
              />

              <RightIntelligencePanel
                lead={selectedLead}
                agentRun={selectedRun}
                safety={safety}
                metrics={metrics}
                runtimeSettings={runtimeSettings}
                brandQuery={brandQuery}
                brandSlug={activeBrandSlug}
              />
            </section>

            <BottomAutomationBar metrics={metrics} />
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
    <main className="min-h-screen bg-[#eef6ff] p-6">
      <div className="mx-auto max-w-5xl rounded-[34px] border border-white/70 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 animate-pulse rounded-3xl bg-[#dff8ff]" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.26em] text-[#0aa6c4]">
              SALES AI
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-[#081535]">
              Cargando Inbox inteligente...
            </h1>
          </div>
        </div>
      </div>
    </main>
  );
}

function buildNav(
  brandSlug: string,
  pathname: string,
  metrics: InboxMetrics
): NavItem[] {
  const safeBrandSlug = encodeURIComponent(brandSlug || "cometa-mkt");

  const withBrand = (href: string) => {
    if (href === "/workspace") return href;
    return `${href}?brandSlug=${safeBrandSlug}`;
  };

  const items: NavItem[] = [
    {
      label: "Inbox inteligente",
      href: withBrand("/sales-ai/inbox"),
      icon: "chat",
      badge: metrics.readyReplies || undefined,
    },
    {
      label: "Dashboard",
      href: withBrand("/sales-ai"),
      icon: "dashboard",
    },
    {
      label: "Conversaciones",
      href: withBrand("/sales-ai/inbox"),
      icon: "message",
    },
    {
      label: "Contactos",
      href: withBrand("/sales-ai/contacts"),
      icon: "users",
    },
    {
      label: "Oportunidades",
      href: withBrand("/sales-ai/opportunities"),
      icon: "spark",
    },
    {
      label: "Automatizaciones",
      href: withBrand("/sales-ai/learning"),
      icon: "bot",
    },
    {
      label: "Respuestas IA",
      href: withBrand("/sales-ai/knowledge"),
      icon: "brain",
    },
    {
      label: "Reportes",
      href: withBrand("/sales-ai/reports"),
      icon: "chart",
    },
    {
      label: "Configuración",
      href: withBrand("/sales-ai/agent-settings"),
      icon: "gear",
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

function SalesSidebar({
  nav,
  brand,
  metrics,
}: {
  nav: NavItem[];
  brand: BrandContext;
  metrics: InboxMetrics;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 overflow-hidden bg-[#061635] text-white shadow-[18px_0_60px_rgba(6,22,53,0.2)] xl:block">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-90px] top-[-90px] h-[240px] w-[240px] rounded-full bg-[#12d6ff]/25 blur-[55px]" />
        <div className="absolute bottom-[-110px] right-[-110px] h-[300px] w-[300px] rounded-full bg-[#0fd0a8]/20 blur-[70px]" />
        <div className="absolute inset-0 opacity-[0.18] [background-image:radial-gradient(circle_at_20%_20%,#7dd3fc_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <div className="relative flex h-full flex-col p-5">
        <Link
          href={`/sales-ai?brandSlug=${encodeURIComponent(
            brand.slug || "cometa-mkt"
          )}`}
          className="flex items-center gap-3"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-white/10 p-2 ring-1 ring-white/15">
            <Image
              src="/logo.png"
              alt="Cometa OS"
              width={42}
              height={42}
              className="h-10 w-10 object-contain"
              priority
            />
          </div>

          <div>
            <p className="text-xl font-black leading-5 tracking-tight">
              COMETA OS
            </p>
            <p className="mt-1 text-sm font-black uppercase tracking-[0.18em] text-[#27d8ff]">
              Sales AI
            </p>
          </div>
        </Link>

        <nav className="mt-9 grid gap-2">
          {nav.map((item) => (
            <SidebarLink key={item.label} item={item} />
          ))}
        </nav>

        <div className="mt-auto space-y-4">
          <SystemStatusCard metrics={metrics} />

          <Link
            href={`/sales-ai/agent-settings?brandSlug=${encodeURIComponent(
              brand.slug || "cometa-mkt"
            )}`}
            className="flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/8 p-3 transition hover:bg-white/12"
          >
            <Avatar name={brand.name} dark />
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{brand.name}</p>
              <p className="text-xs font-bold text-white/55">Administrador</p>
            </div>
            <Icon name="chevron" className="ml-auto h-4 w-4 text-white/50" />
          </Link>

          <div className="rounded-[24px] border border-[#27d8ff]/18 bg-[#08214c] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-white/80">
                  Plan Enterprise
                </p>
                <p className="mt-1 text-xs font-bold text-white/50">
                  Uso: 68%
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#12d6ff]/15 text-[#39e4ff]">
                <Icon name="diamond" className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-[#16d7ff] to-[#12d6b2]" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <Link
      href={item.href}
      className={`group flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm font-black transition ${
        item.active
          ? "bg-gradient-to-r from-[#06b6d4] to-[#0ea5e9] text-white shadow-[0_16px_36px_rgba(6,182,212,0.28)]"
          : "text-white/78 hover:bg-white/9 hover:text-white"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
          item.active
            ? "bg-white/18 text-white"
            : "bg-white/7 text-[#b7eaff] group-hover:bg-white/12"
        }`}
      >
        <Icon name={item.icon} className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1 truncate">{item.label}</span>

      {item.badge ? (
        <span className="rounded-full bg-[#2563eb] px-2.5 py-1 text-xs font-black text-white">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function SystemStatusCard({ metrics }: { metrics: InboxMetrics }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/7 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.08)] backdrop-blur">
      <p className="text-xs font-black text-white/80">Estado del sistema</p>

      <div className="mt-3 flex items-center gap-2 text-xs font-black text-[#39e991]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e] shadow-[0_0_16px_rgba(34,197,94,0.7)]" />
        Todo operativo
      </div>

      <div className="mt-4 grid gap-3">
        <MiniStatus
          icon="whatsapp"
          label="Conexión WhatsApp"
          value="Conectado"
          tone="green"
        />
        <MiniStatus
          icon="bot"
          label="Agentes IA activos"
          value={`${Math.max(1, metrics.openLeads)}/15`}
          tone="cyan"
        />
      </div>
    </div>
  );
}

function MiniStatus({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone: "green" | "cyan";
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[#071b3f] p-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
          tone === "green"
            ? "bg-[#16a34a]/15 text-[#4ade80]"
            : "bg-[#06b6d4]/15 text-[#22d3ee]"
        }`}
      >
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-white/50">{label}</p>
        <p
          className={`truncate text-xs font-black ${
            tone === "green" ? "text-[#4ade80]" : "text-[#22d3ee]"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function MobileTopNav({
  nav,
  brand,
}: {
  nav: NavItem[];
  brand: BrandContext;
}) {
  return (
    <div className="mb-4 rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur xl:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Cometa OS"
            width={42}
            height={42}
            className="h-10 w-10 rounded-2xl object-contain"
            priority
          />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#08a9c6]">
              SALES AI
            </p>
            <p className="truncate text-lg font-black text-[#071333]">
              {brand.name}
            </p>
          </div>
        </div>

        <Avatar name={brand.name} />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {nav.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`shrink-0 rounded-2xl px-4 py-3 text-xs font-black ${
              item.active
                ? "bg-[#08a9c6] text-white"
                : "bg-[#f2f7fc] text-[#60708a]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function TopCommandBar({
  brand,
  runtimeSettings,
  loading,
  onRefresh,
}: {
  brand: BrandContext;
  runtimeSettings: RuntimeSettings | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="relative overflow-hidden rounded-[34px] border border-white/75 bg-white/78 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur xl:p-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[8%] top-[-70px] h-[220px] w-[420px] rounded-full bg-[#dff7ff] blur-[35px]" />
        <div className="absolute right-[13%] top-10 h-[2px] w-[320px] rotate-[-14deg] rounded-full bg-gradient-to-r from-transparent via-[#7dd3fc] to-transparent opacity-70" />
        <div className="absolute right-[28%] top-7 h-3 w-3 rounded-full bg-white shadow-[0_0_30px_8px_rgba(125,211,252,0.8)]" />
      </div>

      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#effcff] px-4 py-2 text-xs font-black text-[#068eaa] shadow-[inset_0_0_0_1px_rgba(8,169,198,0.18)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#12d6ff]" />
            SALES AI · INBOX INTELIGENTE
          </div>

          <h1 className="mt-5 flex flex-wrap items-center gap-3 text-5xl font-black tracking-[-0.055em] text-[#071333] md:text-6xl">
            SALES AI
            <span className="text-[#12bfe8]">✦</span>
          </h1>

          <p className="mt-2 text-xl font-black text-[#071333]">
            Agente inteligente para ventas en{" "}
            <span className="text-[#00b66f]">WhatsApp</span>
          </p>

          <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-[#5b6b84]">
            Convierte conversaciones en oportunidades. Califica prospectos,
            sugiere respuestas y detecta intención comercial en tiempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StatusChip
            icon="status"
            label={labelAgentMode(runtimeSettings?.agent_mode)}
            value="IA en línea"
            tone="green"
          />

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3 text-sm font-black text-[#071333] shadow-sm transition hover:bg-[#f8fbff] disabled:opacity-60"
          >
            <Icon name="refresh" className="h-5 w-5 text-[#08a9c6]" />
            {loading ? "Actualizando..." : "Actualizar"}
          </button>

          <Link
            href={`/sales-ai/agent-settings?brandSlug=${encodeURIComponent(
              brand.slug || "cometa-mkt"
            )}`}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3 text-sm font-black text-[#071333] shadow-sm transition hover:bg-[#f8fbff]"
          >
            <Icon name="sliders" className="h-5 w-5 text-[#071333]" />
            Filtros
          </Link>

          <Avatar name={brand.name} />
        </div>
      </div>
    </header>
  );
}

function StatusChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone: "green" | "cyan" | "blue";
}) {
  const toneMap = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    cyan: "bg-cyan-50 text-cyan-700 border-cyan-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
  };

  return (
    <div
      className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm ${toneMap[tone]}`}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70">
        <Icon name={icon} className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs font-black">{value}</p>
        <p className="text-[10px] font-bold opacity-70">{label}</p>
      </div>
    </div>
  );
}

function KpiStrip({
  metrics,
  leads,
  runtimeSettings,
  loading,
}: {
  metrics: InboxMetrics;
  leads: SalesLead[];
  runtimeSettings: RuntimeSettings | null;
  loading: boolean;
}) {
  const estimatedClose = useMemo(() => {
    const base = leads.reduce((total, lead) => {
      const probability = clampNumber(lead.closeProbability, 0, 100);
      return total + probability * 190;
    }, 0);

    return Math.max(0, Math.round(base));
  }, [leads]);

  const items = [
    {
      label: "Leads activos",
      value: loading ? "..." : metrics.openLeads || leads.length,
      trend: "↑ 18% vs ayer",
      icon: "users" as IconName,
      tone: "blue" as const,
      spark: [8, 12, 10, 18, 15, 24, 20, 29, 25],
    },
    {
      label: "Prospectos calientes",
      value: loading ? "..." : metrics.hotLeads,
      trend: "↑ 33% vs ayer",
      icon: "flame" as IconName,
      tone: "orange" as const,
      spark: [4, 6, 8, 7, 12, 18, 14, 17, 22],
    },
    {
      label: "Respuestas listas",
      value: loading ? "..." : metrics.readyReplies,
      trend: "↑ 23% vs ayer",
      icon: "chat" as IconName,
      tone: "cyan" as const,
      spark: [7, 8, 12, 11, 17, 13, 22, 20, 26],
    },
    {
      label: "Seguimiento automático",
      value: runtimeSettings?.followups_enabled ? "Activo" : "92%",
      trend: "↑ 8% vs ayer",
      icon: "bot" as IconName,
      tone: "cyan" as const,
      spark: [9, 11, 10, 12, 16, 14, 20, 17, 21],
    },
    {
      label: "Cierre estimado",
      value: loading ? "..." : formatMoney(estimatedClose),
      trend: "↑ 27% vs ayer",
      icon: "target" as IconName,
      tone: "purple" as const,
      spark: [11, 13, 15, 14, 18, 21, 19, 23, 28],
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <KpiCard key={item.label} item={item} />
      ))}
    </section>
  );
}

function KpiCard({
  item,
}: {
  item: {
    label: string;
    value: string | number;
    trend: string;
    icon: IconName;
    tone: "blue" | "orange" | "cyan" | "purple";
    spark: number[];
  };
}) {
  const toneMap = {
    blue: "bg-[#eef7ff] text-[#1677ff]",
    orange: "bg-[#fff4e8] text-[#f97316]",
    cyan: "bg-[#eafbff] text-[#0ea5c6]",
    purple: "bg-[#f5f0ff] text-[#7c3aed]",
  };

  const strokeMap = {
    blue: "#1677ff",
    orange: "#f97316",
    cyan: "#0ea5c6",
    purple: "#7c3aed",
  };

  return (
    <article className="rounded-[26px] border border-white/75 bg-white/82 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${toneMap[item.tone]}`}
          >
            <Icon name={item.icon} className="h-7 w-7" />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[#64748b]">
              {item.label}
            </p>
            <p className="mt-2 truncate text-3xl font-black tracking-tight text-[#071333]">
              {item.value}
            </p>
            <p className="mt-1 text-xs font-black text-[#00a86b]">
              {item.trend}
            </p>
          </div>
        </div>

        <Sparkline values={item.spark} stroke={strokeMap[item.tone]} />
      </div>
    </article>
  );
}

function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 88;
      const y = 36 - ((value - min) / Math.max(max - min, 1)) * 30;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 88 40" className="mt-7 hidden h-10 w-24 shrink-0 sm:block">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ConversationList({
  leads,
  allLeads,
  selectedLeadId,
  filter,
  setFilter,
  loading,
  onSelect,
}: {
  leads: SalesLead[];
  allLeads: SalesLead[];
  selectedLeadId: string;
  filter: FilterKey;
  setFilter: (filter: FilterKey) => void;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "Todas", count: allLeads.length },
    {
      key: "unread",
      label: "No leídas",
      count: allLeads.filter((lead) =>
        String(lead.status || "").toLowerCase().includes("new")
      ).length,
    },
    { key: "mine", label: "Mías", count: Math.min(3, allLeads.length) },
    {
      key: "hot",
      label: "Calientes",
      count: allLeads.filter((lead) => isHotLead(lead)).length,
    },
  ];

  return (
    <section className="rounded-[30px] border border-white/75 bg-white/84 p-5 shadow-[0_22px_70px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-[#071333]">Conversaciones</h2>
        <span className="rounded-full bg-[#eff6ff] px-3 py-1.5 text-xs font-black text-[#2563eb]">
          {allLeads.length} total
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {filters.map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`rounded-2xl px-3 py-3 text-xs font-black transition ${
              filter === item.key
                ? "bg-[#2563eb] text-white shadow-[0_12px_26px_rgba(37,99,235,0.22)]"
                : "bg-[#f2f7fc] text-[#64748b] hover:bg-[#eafbff] hover:text-[#0aa6c4]"
            }`}
          >
            {item.label}{" "}
            <span className={filter === item.key ? "text-white/80" : ""}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] px-4 py-3">
        <Icon name="search" className="h-5 w-5 text-[#94a3b8]" />
        <input
          placeholder="Buscar conversaciones..."
          className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[#071333] outline-none placeholder:text-[#94a3b8]"
        />
        <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#64748b] shadow-sm">
          <Icon name="sliders" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid max-h-[720px] gap-3 overflow-y-auto pr-1">
        {loading ? (
          <>
            <LeadSkeleton />
            <LeadSkeleton />
            <LeadSkeleton />
          </>
        ) : leads.length ? (
          leads.map((lead, index) => (
            <ConversationLeadCard
              key={lead.id}
              lead={lead}
              selected={selectedLeadId === lead.id}
              index={index}
              onClick={() => onSelect(lead.id)}
            />
          ))
        ) : (
          <EmptyBox
            title="Sin conversaciones"
            text="Cuando entren prospectos por WhatsApp, aparecerán aquí."
          />
        )}
      </div>

      <button className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#2563eb] shadow-sm ring-1 ring-[#dfe8f3] transition hover:bg-[#f8fbff]">
        Ver todas las conversaciones
      </button>
    </section>
  );
}

function ConversationLeadCard({
  lead,
  selected,
  index,
  onClick,
}: {
  lead: SalesLead;
  selected: boolean;
  index: number;
  onClick: () => void;
}) {
  const unread = index < 2 ? index + 1 : 0;

  return (
    <button
      onClick={onClick}
      className={`group rounded-[24px] border p-4 text-left transition ${
        selected
          ? "border-[#60a5fa] bg-[#eff6ff] shadow-[0_14px_32px_rgba(37,99,235,0.12)]"
          : "border-[#e2eaf3] bg-white hover:border-[#bdeaf2] hover:bg-[#fbfeff]"
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar name={lead.name} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-black text-[#071333]">
              {lead.name || "Lead sin nombre"}
            </h3>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#22c55e]" />
          </div>

          <p className="mt-1 truncate text-xs font-bold text-[#64748b]">
            {formatPhone(lead.phone) || "Sin teléfono"}
          </p>
        </div>

        <div className="text-right">
          <p className="text-[11px] font-bold text-[#64748b]">
            {lead.lastMessageAt ? formatShortTime(lead.lastMessageAt) : "Hoy"}
          </p>
          {unread ? (
            <span className="mt-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#2563eb] px-2 text-xs font-black text-white">
              {unread}
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-xs font-semibold leading-5 text-[#5b6b84]">
        {lead.lastMessage ||
          lead.nextAction ||
          "SALES AI está evaluando la conversación."}
      </p>
    </button>
  );
}

function ChatWorkspace({
  brand,
  lead,
  messages,
  agentRun,
  draftMessage,
  setDraftMessage,
  loading,
}: {
  brand: BrandContext;
  lead: SalesLead | null;
  messages: SalesMessage[];
  agentRun: AgentRun | null;
  draftMessage: string;
  setDraftMessage: (value: string) => void;
  loading: boolean;
}) {
  const agentReply = getAgentReply(agentRun, lead);
  const displayMessages = buildDisplayMessages(lead, messages, agentReply);

  return (
    <section className="overflow-hidden rounded-[30px] border border-white/75 bg-white/84 shadow-[0_22px_70px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex flex-col gap-4 border-b border-[#e8eef5] bg-white/80 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={lead?.name || brand.name} size="lg" />

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-2xl font-black text-[#071333]">
                {lead?.name || brand.name}
              </h2>
              <span className="h-3 w-3 rounded-full bg-[#22c55e] shadow-[0_0_16px_rgba(34,197,94,0.5)]" />
            </div>

            <p className="mt-1 truncate text-sm font-bold text-[#64748b]">
              {formatPhone(lead?.phone) || "Sin teléfono"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <IconButton icon="star" />
          <IconButton icon="tag" />
          <IconButton icon="more" />
          <button className="rounded-2xl border border-[#dfe8f3] bg-white px-4 py-3 text-xs font-black text-[#071333] shadow-sm transition hover:bg-[#f8fbff]">
            Abrir contacto
          </button>
        </div>
      </div>

      <div className="relative min-h-[650px] bg-[#f7fbff]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(circle_at_20%_20%,#cbd5e1_1px,transparent_1px)] [background-size:22px_22px]" />

        <div className="relative flex min-h-[650px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="mx-auto w-fit rounded-full bg-white/80 px-4 py-1.5 text-xs font-black text-[#64748b] shadow-sm">
              Hoy
            </div>

            {loading ? (
              <EmptyBox title="Cargando conversación..." text="Sincronizando datos." />
            ) : lead ? (
              displayMessages.length ? (
                displayMessages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))
              ) : (
                <EmptyBox
                  title="Sin mensajes cargados"
                  text="El prospecto existe, pero todavía no hay historial conectado."
                />
              )
            ) : (
              <EmptyBox
                title="Selecciona una conversación"
                text="Aquí aparecerá el historial de WhatsApp y las respuestas sugeridas."
              />
            )}
          </div>

          {lead ? (
            <div className="border-t border-[#e8eef5] bg-white/92 p-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                <div>
                  <div className="mb-3 flex items-center gap-6 border-b border-[#e8eef5] pb-3">
                    <button className="text-sm font-black text-[#2563eb]">
                      Sugerencias IA
                    </button>
                    <button className="text-sm font-black text-[#64748b]">
                      Respuestas guardadas
                    </button>
                    <button className="text-sm font-black text-[#64748b]">
                      Historial
                    </button>
                  </div>

                  <div className="rounded-[22px] border border-[#dbeafe] bg-[#eff6ff] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2563eb]">
                        Respuesta recomendada
                      </p>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#2563eb]">
                        IA
                      </span>
                    </div>

                    <textarea
                      value={draftMessage}
                      onChange={(event) => setDraftMessage(event.target.value)}
                      placeholder="SALES AI generará una respuesta sugerida..."
                      className="mt-3 min-h-[110px] w-full resize-none rounded-2xl border border-[#d8e7ff] bg-white/78 px-4 py-3 text-sm font-bold leading-6 text-[#071333] outline-none focus:border-[#60a5fa] focus:ring-4 focus:ring-blue-100"
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      <ReplyTonePill label="Profesional" />
                      <ReplyTonePill label="Amigable" />
                      <ReplyTonePill label="Directo" />
                    </div>

                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(draftMessage)}
                      className="mt-4 w-full rounded-2xl bg-gradient-to-r from-[#06b6d4] to-[#0ea5e9] px-5 py-4 text-sm font-black text-white shadow-[0_16px_36px_rgba(6,182,212,0.26)] transition hover:brightness-105"
                    >
                      Copiar respuesta
                    </button>
                  </div>
                </div>

                <div className="rounded-[22px] border border-[#dfe8f3] bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#64748b]">
                    Acción siguiente sugerida
                  </p>

                  <h3 className="mt-3 text-lg font-black text-[#071333]">
                    {lead?.nextAction || agentRun?.nextAction || "Calificar necesidad"}
                  </h3>

                  <p className="mt-2 text-sm font-semibold leading-6 text-[#64748b]">
                    {agentRun?.decisionReason ||
                      lead?.aiSummary ||
                      "Pregunta por el tamaño del equipo, presupuesto y objetivo principal."}
                  </p>

                  <button className="mt-4 w-full rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] px-4 py-3 text-xs font-black text-[#2563eb] transition hover:bg-[#eff6ff]">
                    Aplicar acción
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#dfe8f3] bg-white px-3 py-2">
                <IconButton icon="smile" small />
                <IconButton icon="clip" small />
                <input
                  placeholder="Escribe un mensaje..."
                  className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm font-bold text-[#071333] outline-none placeholder:text-[#94a3b8]"
                />
                <IconButton icon="mic" small />
              </div>
            </div>
          ) : null}
        </div>
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
        className={`max-w-[84%] rounded-[22px] px-5 py-4 text-sm font-semibold leading-6 shadow-sm ${
          isOutbound
            ? "bg-[#d9fdd3] text-[#071333]"
            : "border border-[#dfe8f3] bg-white text-[#334155]"
        }`}
      >
        <p
          className={`mb-1 text-[11px] font-black uppercase tracking-[0.12em] ${
            isOutbound ? "text-[#15803d]" : "text-[#64748b]"
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#06b6d4] text-white">
          <Icon name="spark" className="h-5 w-5" />
        </div>
      ) : null}
    </div>
  );
}

function ReplyTonePill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#2563eb] shadow-sm">
      {label}
    </span>
  );
}

function RightIntelligencePanel({
  lead,
  agentRun,
  safety,
  metrics,
  runtimeSettings,
  brandQuery,
  brandSlug,
}: {
  lead: SalesLead | null;
  agentRun: AgentRun | null;
  safety: SafetyState;
  metrics: InboxMetrics;
  runtimeSettings: RuntimeSettings | null;
  brandQuery: string;
  brandSlug: string;
}) {
  return (
    <aside className="space-y-5">
      <ConversationIntelligenceCard
        lead={lead}
        agentRun={agentRun}
        safety={safety}
        runtimeSettings={runtimeSettings}
      />

      <PipelineBoard metrics={metrics} />

      <ProjectionCard metrics={metrics} />

      <QuickActions brandQuery={brandQuery} brandSlug={brandSlug} />
    </aside>
  );
}

function ConversationIntelligenceCard({
  lead,
  agentRun,
  safety,
  runtimeSettings,
}: {
  lead: SalesLead | null;
  agentRun: AgentRun | null;
  safety: SafetyState;
  runtimeSettings: RuntimeSettings | null;
}) {
  return (
    <section className="rounded-[30px] border border-white/75 bg-white/84 p-5 shadow-[0_22px_70px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-[#071333]">
          Inteligencia de conversación
        </h2>
        <span className="rounded-full bg-[#eff6ff] px-3 py-1.5 text-xs font-black text-[#2563eb]">
          IA
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        <InsightRow
          icon="target"
          label="Intención detectada"
          value={lead?.intent || "Sin dato"}
          tone="green"
        />
        <InsightRow
          icon="alert"
          label="Objeción potencial"
          value={lead?.mainObjection || "Sin dato"}
          tone="red"
        />
        <InsightRow
          icon="flame"
          label="Temperatura"
          value={normalizeTemperature(lead?.temperature)}
          tone="orange"
        />
        <InsightRow
          icon="ring"
          label="Confianza de cierre"
          value={`${lead?.closeProbability || agentRun?.confidenceScore || 0}%`}
          tone="cyan"
        />
        <InsightRow
          icon="bot"
          label="Automatización"
          value={
            runtimeSettings?.auto_reply_enabled ? "Activa" : "Modo supervisado"
          }
          tone="blue"
        />
      </div>

      <div className="mt-5 rounded-[22px] border border-[#dfe8f3] bg-[#f8fbff] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#64748b]">
            Candado de seguridad
          </p>
          <SafetyBadge safety={safety} />
        </div>

        <p className="mt-3 text-sm font-bold leading-6 text-[#64748b]">
          {safety.reasons.length
            ? safety.reasons.slice(0, 3).join(" · ")
            : "El agente está listo para ejecutar bajo reglas controladas."}
        </p>
      </div>
    </section>
  );
}

function InsightRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone: "green" | "red" | "orange" | "cyan" | "blue";
}) {
  const toneMap = {
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-500",
    orange: "bg-orange-50 text-orange-500",
    cyan: "bg-cyan-50 text-cyan-600",
    blue: "bg-blue-50 text-blue-600",
  };

  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-2xl border border-[#edf2f7] bg-white p-3">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneMap[tone]}`}
      >
        <Icon name={icon} className="h-5 w-5" />
      </div>

      <div className="min-w-0">
        <p className="text-xs font-bold text-[#64748b]">{label}</p>
        <p className="mt-1 truncate text-sm font-black text-[#071333]">
          {value || "Sin dato"}
        </p>
      </div>
    </div>
  );
}

function PipelineBoard({ metrics }: { metrics: InboxMetrics }) {
  const columns = [
    { label: "Nuevos", count: Math.max(1, metrics.openLeads), tone: "blue" },
    { label: "Calificando", count: Math.max(1, metrics.qualified), tone: "orange" },
    { label: "Oportunidad", count: Math.max(1, metrics.hotLeads), tone: "cyan" },
    { label: "Seguimiento", count: Math.max(1, metrics.pendingLearning), tone: "purple" },
    { label: "Cierre", count: Math.max(1, metrics.humanRequired || 2), tone: "green" },
  ];

  return (
    <section className="rounded-[30px] border border-white/75 bg-white/84 p-5 shadow-[0_22px_70px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-[#071333]">Pipeline de ventas</h2>
        <button className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-3 py-2 text-xs font-black text-[#2563eb]">
          Ver tablero
        </button>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2 overflow-x-auto">
        {columns.map((column, index) => (
          <PipelineColumn
            key={column.label}
            label={column.label}
            count={column.count}
            tone={column.tone}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}

function PipelineColumn({
  label,
  count,
  tone,
  index,
}: {
  label: string;
  count: number;
  tone: string;
  index: number;
}) {
  const toneMap: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    orange: "text-orange-600 bg-orange-50 border-orange-100",
    cyan: "text-cyan-600 bg-cyan-50 border-cyan-100",
    purple: "text-purple-600 bg-purple-50 border-purple-100",
    green: "text-emerald-600 bg-emerald-50 border-emerald-100",
  };

  const sampleNames = [
    ["Cometa Mkt", "Cliente Prueba"],
    ["Andrea López", "Soluciones TI"],
    ["Marketing Plus", "Global Tech"],
    ["Data Systems", "Innovatec"],
    ["Vision Soft", "Optima Group"],
  ];

  return (
    <div className={`min-w-[86px] rounded-2xl border p-2 ${toneMap[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-black">{label}</p>
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-black">
          {count}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {sampleNames[index].map((name) => (
          <div
            key={name}
            className="truncate rounded-xl bg-white px-2 py-2 text-[10px] font-black text-[#334155] shadow-sm"
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectionCard({ metrics }: { metrics: InboxMetrics }) {
  const projected = Math.max(124800, metrics.readyReplies * 7800);

  return (
    <section className="rounded-[30px] border border-white/75 bg-white/84 p-5 shadow-[0_22px_70px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#071333]">
            Proyección de cierre
          </h2>
          <p className="mt-4 text-3xl font-black tracking-tight text-[#071333]">
            {formatMoney(projected)}
          </p>
          <p className="mt-1 text-xs font-black text-emerald-600">
            ↑ 27% vs ayer
          </p>
        </div>

        <span className="rounded-full bg-[#f2f7fc] px-3 py-1.5 text-xs font-black text-[#64748b]">
          Meta: $150,000
        </span>
      </div>

      <svg viewBox="0 0 340 120" className="mt-5 h-32 w-full">
        <defs>
          <linearGradient id="projectionFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 100 C40 88 58 72 92 76 C130 80 146 42 184 52 C220 63 240 30 276 38 C304 44 318 28 340 20 L340 120 L0 120 Z"
          fill="url(#projectionFill)"
        />
        <path
          d="M0 100 C40 88 58 72 92 76 C130 80 146 42 184 52 C220 63 240 30 276 38 C304 44 318 28 340 20"
          fill="none"
          stroke="#0ea5e9"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {[92, 184, 276, 340].map((x, index) => (
          <circle
            key={x}
            cx={x}
            cy={[76, 52, 38, 20][index]}
            r="5"
            fill="#2563eb"
            stroke="white"
            strokeWidth="3"
          />
        ))}
      </svg>
    </section>
  );
}

function QuickActions({
  brandQuery,
  brandSlug,
}: {
  brandQuery: string;
  brandSlug: string;
}) {
  const links = [
    { label: "Configurar agente", href: `/sales-ai/agent-settings?${brandQuery}` },
    { label: "Knowledge Brain", href: `/sales-ai/knowledge?${brandQuery}` },
    { label: "Learning Hub", href: `/sales-ai/learning?${brandQuery}` },
    { label: "Brand OS", href: `/brand/${brandSlug}` },
  ];

  return (
    <section className="rounded-[30px] border border-[#cdeefa] bg-[#effcff] p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#0b9fbd]">
        Accesos rápidos
      </p>

      <div className="mt-4 grid gap-2">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#334155] transition hover:bg-[#dff8ff]"
          >
            {link.label} →
          </Link>
        ))}
      </div>
    </section>
  );
}

function BottomAutomationBar({ metrics }: { metrics: InboxMetrics }) {
  return (
    <section className="flex flex-col gap-4 rounded-[30px] border border-white/75 bg-white/84 p-5 shadow-[0_22px_70px_rgba(15,23,42,0.07)] backdrop-blur lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#effcff] text-[#08a9c6]">
          <Icon name="spark" className="h-9 w-9" />
        </div>

        <div>
          <h3 className="text-xl font-black text-[#071333]">
            SALES AI trabajando para ti
          </h3>
          <p className="mt-1 text-sm font-bold text-[#64748b]">
            {metrics.openLeads} conversaciones analizadas · {metrics.hotLeads}{" "}
            oportunidades detectadas · {metrics.humanRequired} escalaciones
            pendientes
          </p>
        </div>
      </div>

      <button className="rounded-2xl bg-gradient-to-r from-[#06b6d4] to-[#0ea5e9] px-6 py-4 text-sm font-black text-white shadow-[0_16px_36px_rgba(6,182,212,0.24)]">
        Ver insights del día →
      </button>
    </section>
  );
}

function IconButton({
  icon,
  small = false,
}: {
  icon: IconName;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex shrink-0 items-center justify-center rounded-2xl border border-[#dfe8f3] bg-white text-[#64748b] shadow-sm transition hover:bg-[#f8fbff] ${
        small ? "h-10 w-10" : "h-11 w-11"
      }`}
    >
      <Icon name={icon} className={small ? "h-4 w-4" : "h-5 w-5"} />
    </button>
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
      className={`w-fit rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${toneMap[safety.tone]}`}
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

function Avatar({
  name,
  size = "md",
  dark = false,
}: {
  name?: string | null;
  size?: "sm" | "md" | "lg";
  dark?: boolean;
}) {
  const sizeClass = {
    sm: "h-9 w-9 text-[11px]",
    md: "h-12 w-12 text-xs",
    lg: "h-14 w-14 text-sm",
  };

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full font-black ${
        sizeClass[size]
      } ${
        dark
          ? "bg-[#071333] text-white"
          : "bg-[#b7f4ef] text-[#0b5262] ring-1 ring-[#9beee7]"
      }`}
    >
      {getInitials(name || "AI")}
      <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#22c55e]" />
    </div>
  );
}

function LeadSkeleton() {
  return (
    <div className="rounded-[24px] border border-[#dfe8f3] bg-[#f8fbff] p-4">
      <div className="h-5 w-40 rounded-full bg-[#e3ebf4]" />
      <div className="mt-3 h-4 w-52 rounded-full bg-[#e3ebf4]" />
      <div className="mt-4 h-14 rounded-2xl bg-[#e3ebf4]" />
    </div>
  );
}

function EmptyBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[26px] border border-dashed border-[#d7e2ee] bg-white/72 p-8 text-center">
      <h3 className="text-2xl font-black text-[#071333]">{title}</h3>

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
    "Hola, me gustaría conocer más sobre sus planes y precios para mi equipo de ventas.";

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

function isHotLead(lead: SalesLead) {
  const temp = String(lead.temperature || "").toLowerCase();

  return (
    lead.closeProbability >= 75 ||
    temp.includes("caliente") ||
    temp.includes("hot")
  );
}

function normalizeTemperature(value?: string | null) {
  const temp = String(value || "").toLowerCase();

  if (temp.includes("caliente") || temp.includes("hot")) return "Caliente";
  if (temp.includes("tibio") || temp.includes("warm")) return "Tibia";
  if (temp.includes("frío") || temp.includes("frio") || temp.includes("cold")) {
    return "Fría";
  }

  return value || "Sin dato";
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

function formatShortTime(value?: string | null) {
  if (!value) return "Hoy";

  try {
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Hoy";
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

function formatMoney(value: number) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${value}`;
  }
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
  | "alert"
  | "bot"
  | "brain"
  | "chart"
  | "chat"
  | "chevron"
  | "clip"
  | "dashboard"
  | "diamond"
  | "flame"
  | "gear"
  | "message"
  | "mic"
  | "more"
  | "refresh"
  | "ring"
  | "search"
  | "shield"
  | "sliders"
  | "smile"
  | "spark"
  | "star"
  | "status"
  | "tag"
  | "target"
  | "users"
  | "whatsapp";

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  if (name === "chat" || name === "message" || name === "whatsapp") {
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

  if (name === "dashboard" || name === "chart") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M4 19V5M4 19h16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="m7 15 3-4 3 2 5-7"
          stroke="currentColor"
          strokeWidth="2"
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
        <path
          d="M6 21v-4h4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M4 12a8 8 0 0 1 14-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M18 3v4h-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "gear" || name === "sliders") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M5 7h14M8 12h8M10 17h4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M9 7a2 2 0 1 0-4 0 2 2 0 0 0 4 0ZM19 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0ZM14 17a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z"
          fill="currentColor"
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

  if (name === "spark") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M19 15l.8 2.7L22 18l-2.2.3L19 21l-.8-2.7L16 18l2.2-.3L19 15Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (name === "target") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" />
        <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="2" />
        <path d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "alert") {
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

  if (name === "search") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke="currentColor" strokeWidth="2" />
        <path d="m21 21-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "star") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "tag") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M4 12V5h7l9 9-7 7-9-9Z" stroke="currentColor" strokeWidth="2" />
        <path d="M8 8h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "more") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "smile") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" />
        <path d="M8 14s1.3 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "clip") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3 3 0 0 1 4.2 4.2l-8.4 8.4a1 1 0 1 1-1.4-1.4L16 7.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "mic") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="2" />
        <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "ring" || name === "status") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "chevron") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "diamond") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path d="M4 9 8 4h8l4 5-8 11L4 9Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}