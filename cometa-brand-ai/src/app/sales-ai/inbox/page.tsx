"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  brandName: string;
  brandSlug: string;
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

type FilterKey = "all" | "new" | "hot" | "qualified" | "human";

type SafetyState = {
  label: string;
  tone: "safe" | "warning" | "blocked" | "neutral";
  reasons: string[];
  mode: string;
  whatsappStatus: string;
};

type SendStatus = {
  type: "success" | "error" | "blocked";
  message: string;
};

type LoadInboxOptions = {
  silent?: boolean;
  source?: "initial" | "manual" | "poll" | "send";
};

const fallbackBrand: BrandContext = {
  id: null,
  slug: "",
  name: "Marca no seleccionada",
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
  health: 0,
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

  const loadInProgressRef = useRef(false);
  const latestInboxSignatureRef = useRef("");

  const urlBrandSlug = searchParams.get("brandSlug") || "";
  const urlBrandName = searchParams.get("brandName") || "";

  const requestedBrandSlug = useMemo(() => {
    return toBrandSlug(urlBrandSlug);
  }, [urlBrandSlug]);

  const requestedBrandName = useMemo(() => {
    return cleanText(urlBrandName);
  }, [urlBrandName]);

  const requestedBrandKey = useMemo(() => {
    return requestedBrandSlug || toBrandSlug(requestedBrandName);
  }, [requestedBrandName, requestedBrandSlug]);

  const hasBrandContext = Boolean(requestedBrandKey);

  const requestedBrandFallback = useMemo<BrandContext>(() => {
    if (!requestedBrandKey) return fallbackBrand;

    return {
      ...fallbackBrand,
      slug: requestedBrandKey,
      name:
        requestedBrandName ||
        formatBrandNameFromSlug(requestedBrandKey) ||
        "Marca no seleccionada",
    };
  }, [requestedBrandKey, requestedBrandName]);

  const [brand, setBrand] = useState<BrandContext>(requestedBrandFallback);
  const [metrics, setMetrics] = useState<InboxMetrics>(fallbackMetrics);
  const [runtimeSettings, setRuntimeSettings] =
    useState<RuntimeSettings | null>(null);

  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [messages, setMessages] = useState<SalesMessage[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");

  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("Inbox en vivo");
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  const [systemMessage, setSystemMessage] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [note, setNote] = useState("");

  const [sendingApprovedReply, setSendingApprovedReply] = useState(false);
  const [approvedSendStatus, setApprovedSendStatus] =
    useState<SendStatus | null>(null);
  const [editableReply, setEditableReply] = useState("");

  const activeBrandSlug = brand.slug || requestedBrandKey;
  const brandQuery = `brandSlug=${encodeURIComponent(activeBrandSlug)}`;

  useEffect(() => {
    if (!hasBrandContext) {
      router.replace("/workspace");
    }
  }, [hasBrandContext, router]);

  const loadInbox = useCallback(
    async (options: LoadInboxOptions = {}) => {
      if (loadInProgressRef.current) return;

      const isSilent = Boolean(options.silent);
      const source = options.source || (isSilent ? "poll" : "manual");

      try {
        loadInProgressRef.current = true;

        if (isSilent) {
          setBackgroundRefreshing(true);
        } else {
          setLoading(true);
        }

        setSystemMessage("");

        if (!hasBrandContext) {
          setBrand(fallbackBrand);
          setMetrics(fallbackMetrics);
          setRuntimeSettings(null);
          setLeads([]);
          setMessages([]);
          setAgentRuns([]);
          setSelectedLeadId("");
          setSystemMessage(
            "Falta brandSlug en la URL. Por seguridad no se cargó ninguna marca por default."
          );
          return;
        }

        const query = requestedBrandSlug
          ? `?brandSlug=${encodeURIComponent(requestedBrandSlug)}`
          : `?brandName=${encodeURIComponent(requestedBrandName)}`;

        const res = await fetch(`/api/sales-ai/inbox-dashboard${query}`, {
          method: "GET",
          cache: "no-store",
        });

        const data = await res.json().catch(() => null);

        if (res.status === 401) {
          router.replace(
            `/login?next=${encodeURIComponent(
              `/sales-ai/inbox?brandSlug=${requestedBrandKey}`
            )}`
          );
          return;
        }

        if (res.status === 403) {
          router.replace("/workspace");
          return;
        }

        if (!res.ok || data?.ok === false) {
          throw new Error(data?.error || "No se pudo cargar el Inbox.");
        }

        const normalizedReturnedBrand = normalizeBrand(
          data?.brand,
          requestedBrandFallback
        );

        const returnedBrandSlug = toBrandSlug(
          normalizedReturnedBrand.slug || normalizedReturnedBrand.name
        );

        if (
          requestedBrandKey &&
          returnedBrandSlug &&
          returnedBrandSlug !== requestedBrandKey
        ) {
          throw new Error(
            `Bloqueo de seguridad: el Inbox solicitó ${requestedBrandKey}, pero la API respondió ${returnedBrandSlug}.`
          );
        }

        const nextBrand: BrandContext = {
          ...normalizedReturnedBrand,
          slug: requestedBrandKey || returnedBrandSlug,
          name:
            normalizedReturnedBrand.name ||
            requestedBrandName ||
            formatBrandNameFromSlug(requestedBrandKey),
        };

        const rawLeads = Array.isArray(data?.leads) ? data.leads : [];

        const allLeads: SalesLead[] = rawLeads.map(
          (lead: any, index: number): SalesLead =>
            normalizeLead(lead, index, nextBrand)
        );

        const nextLeads: SalesLead[] = allLeads.filter((lead: SalesLead) => {
          return !lead.brandSlug || lead.brandSlug === nextBrand.slug;
        });

        const allowedLeadIds = new Set<string>(
          nextLeads.map((lead: SalesLead) => lead.id)
        );

        const rawMessages =
          data?.conversations ||
          data?.messages ||
          data?.salesMessages ||
          data?.sales_messages ||
          [];

        const nextMessages = Array.isArray(rawMessages)
          ? rawMessages
              .map((message: any, index: number) =>
                normalizeMessage(message, index)
              )
              .filter((message: SalesMessage) => {
                return allowedLeadIds.has(message.leadId);
              })
          : [];

        const rawRuns =
          data?.agentRuns ||
          data?.runs ||
          data?.salesAgentRuns ||
          data?.sales_agent_runs ||
          [];

        const nextRuns = Array.isArray(rawRuns)
          ? rawRuns
              .map((run: any, index: number) => normalizeAgentRun(run, index))
              .filter((run: AgentRun) => {
                return allowedLeadIds.has(run.leadId);
              })
          : [];

        const nextSignature = buildInboxSignature(
          nextLeads,
          nextMessages,
          nextRuns
        );

        if (latestInboxSignatureRef.current) {
          if (nextSignature !== latestInboxSignatureRef.current) {
            setLiveMessage(
              source === "poll"
                ? "Nuevo movimiento detectado"
                : "Inbox actualizado"
            );
          } else if (source === "poll") {
            setLiveMessage("Inbox en vivo");
          }
        }

        latestInboxSignatureRef.current = nextSignature;

        setBrand(nextBrand);
        setMetrics(normalizeMetrics(data?.metrics, nextLeads));
        setLeads(nextLeads);
        setMessages(nextMessages);
        setAgentRuns(nextRuns);
        setLastUpdatedAt(new Date().toISOString());

        setSelectedLeadId((current: string) => {
          if (
            current &&
            nextLeads.some((lead: SalesLead) => lead.id === current)
          ) {
            return current;
          }

          return nextLeads[0]?.id || "";
        });

        const settings = await fetchRuntimeSettings(nextBrand.name);
        setRuntimeSettings(settings);
      } catch (error: any) {
        setSystemMessage(error?.message || "Error cargando Inbox.");

        if (!isSilent) {
          setBrand(requestedBrandFallback);
          setMetrics(fallbackMetrics);
          setRuntimeSettings(null);
          setLeads([]);
          setMessages([]);
          setAgentRuns([]);
          setSelectedLeadId("");
        }
      } finally {
        if (isSilent) {
          setBackgroundRefreshing(false);
        } else {
          setLoading(false);
        }

        loadInProgressRef.current = false;
      }
    },
    [
      hasBrandContext,
      requestedBrandFallback,
      requestedBrandKey,
      requestedBrandName,
      requestedBrandSlug,
      router,
    ]
  );

  useEffect(() => {
    loadInbox({ source: "initial" });
  }, [loadInbox]);

  useEffect(() => {
    if (!hasBrandContext || !autoRefreshEnabled) return;

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      if (sendingApprovedReply) return;

      loadInbox({
        silent: true,
        source: "poll",
      });
    }, 4000);

    return () => window.clearInterval(interval);
  }, [
    autoRefreshEnabled,
    hasBrandContext,
    loadInbox,
    sendingApprovedReply,
  ]);

  const filteredLeads = useMemo(() => {
    let next = [...leads];

    if (filter === "new") {
      next = next.filter((lead) => {
        const status = lead.status.toLowerCase();
        return status.includes("new") || status.includes("open");
      });
    }

    if (filter === "hot") {
      next = next.filter((lead) => isHotLead(lead));
    }

    if (filter === "qualified") {
      next = next.filter((lead) => lead.isQualified);
    }

    if (filter === "human") {
      next = next.filter((lead) => lead.requiresHuman);
    }

    const cleanSearch = searchTerm.trim().toLowerCase();

    if (cleanSearch) {
      next = next.filter((lead) => {
        return [
          lead.name,
          lead.phone,
          lead.intent,
          lead.lastMessage,
          lead.aiSummary,
          lead.nextAction,
        ]
          .join(" ")
          .toLowerCase()
          .includes(cleanSearch);
      });
    }

    return next;
  }, [leads, filter, searchTerm]);

  const selectedLead = useMemo(() => {
    return (
      leads.find((lead) => lead.id === selectedLeadId) ||
      filteredLeads[0] ||
      leads[0] ||
      null
    );
  }, [filteredLeads, leads, selectedLeadId]);

  const selectedMessages = useMemo(() => {
    if (!selectedLead) return [];

    return messages
      .filter((message) => message.leadId === selectedLead.id)
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

  const rawSuggestedReply = useMemo(() => {
    return getAgentReply(selectedRun, selectedLead);
  }, [selectedRun, selectedLead]);

  const aiThinking = useMemo(() => {
    return deriveAiThinkingState({
      lead: selectedLead,
      agentRun: selectedRun,
      suggestedReply: rawSuggestedReply,
      loading,
    });
  }, [loading, rawSuggestedReply, selectedLead, selectedRun]);

  const selectedSuggestedReply = aiThinking ? "" : rawSuggestedReply;

  useEffect(() => {
    setEditableReply(selectedSuggestedReply);
    setApprovedSendStatus(null);
  }, [selectedLead?.id, selectedSuggestedReply]);

  const safety = useMemo(() => {
    return deriveSafetyState(selectedRun, runtimeSettings, metrics);
  }, [selectedRun, runtimeSettings, metrics]);

  const displayMessages = useMemo(() => {
    return buildDisplayMessages(selectedLead, selectedMessages);
  }, [selectedLead, selectedMessages]);

  const sendApprovedReply = useCallback(async () => {
    setApprovedSendStatus(null);

    if (!selectedLead) {
      setApprovedSendStatus({
        type: "error",
        message: "Selecciona una conversación antes de enviar.",
      });
      return;
    }

    const reply = editableReply.trim();

    if (!reply) {
      setApprovedSendStatus({
        type: "error",
        message: "No hay respuesta para enviar.",
      });
      return;
    }

    try {
      setSendingApprovedReply(true);

      const res = await fetch("/api/sales-ai/send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId: selectedLead.id,
          brandName: brand.name,
          brandSlug: brand.slug,
          toPhone: selectedLead.phone,
          messageText: reply,
          approved: true,
          approvedBy: "Cometa",
          sendReason: "Respuesta aprobada manualmente desde SALES AI Inbox",
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || data?.ok === false) {
        const reasons = Array.isArray(data?.reasons)
          ? ` ${data.reasons.join(" · ")}`
          : "";

        setApprovedSendStatus({
          type: data?.blocked ? "blocked" : "error",
          message:
            data?.error ||
            `No se pudo enviar la respuesta aprobada.${reasons}`,
        });

        return;
      }

      setApprovedSendStatus({
        type: "success",
        message: "Respuesta enviada correctamente por WhatsApp.",
      });

      await loadInbox({ source: "send" });
    } catch (error: any) {
      setApprovedSendStatus({
        type: "error",
        message: error?.message || "Error enviando respuesta aprobada.",
      });
    } finally {
      setSendingApprovedReply(false);
    }
  }, [brand.name, brand.slug, editableReply, loadInbox, selectedLead]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#eaf5fb] text-[#07142f]">
      <AppSidebar
        brand={brand}
        metrics={metrics}
        activeBrandSlug={activeBrandSlug}
      />

      <div className="min-h-screen lg:pl-[320px]">
        <TopBar
          brand={brand}
          metrics={metrics}
          safety={safety}
          runtimeSettings={runtimeSettings}
          loading={loading}
          backgroundRefreshing={backgroundRefreshing}
          lastUpdatedAt={lastUpdatedAt}
          liveMessage={liveMessage}
          autoRefreshEnabled={autoRefreshEnabled}
          onToggleAutoRefresh={() => setAutoRefreshEnabled((value) => !value)}
          onRefresh={() => loadInbox({ source: "manual" })}
        />

        <div className="mx-auto w-full max-w-[1720px] px-4 pb-10 pt-5 sm:px-5 xl:px-8">
          {systemMessage ? <LoadWarning message={systemMessage} /> : null}

          <MetricRibbon metrics={metrics} loading={loading} />

          <section className="mt-8 space-y-8">
            <InboxColumn
              leads={filteredLeads}
              totalLeads={leads.length}
              metrics={metrics}
              selectedLeadId={selectedLead?.id || ""}
              filter={filter}
              setFilter={setFilter}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              loading={loading}
              onSelect={setSelectedLeadId}
            />

            <ChatColumn
              brand={brand}
              lead={selectedLead}
              messages={displayMessages}
              agentRun={selectedRun}
              safety={safety}
              note={note}
              setNote={setNote}
              suggestedReply={selectedSuggestedReply}
              editableReply={editableReply}
              setEditableReply={setEditableReply}
              onSendApprovedReply={sendApprovedReply}
              sendingApprovedReply={sendingApprovedReply}
              sendStatus={approvedSendStatus}
              aiThinking={aiThinking}
              backgroundRefreshing={backgroundRefreshing}
            />

            <IntelligenceColumn
              lead={selectedLead}
              agentRun={selectedRun}
              safety={safety}
              runtimeSettings={runtimeSettings}
              aiThinking={aiThinking}
            />
          </section>

          <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
            <PipelinePanel leads={leads} />
            <ProjectionPanel leads={leads} />
          </section>

          <QuickCommandBar brandQuery={brandQuery} brandSlug={activeBrandSlug} />

          <section className="mt-5 rounded-[34px] border border-[#dceaf4] bg-white px-8 py-8 shadow-[0_18px_50px_rgba(8,21,53,0.06)]">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#e9fbff] text-[#08abc4]">
                  <Icon name="spark" className="h-8 w-8" />
                </div>

                <div>
                  <h2 className="text-3xl font-black tracking-tight text-[#07142f]">
                    SALES AI trabajando para {brand.name}
                  </h2>
                  <p className="mt-1 text-base font-black text-[#6a7890]">
                    {metrics.openLeads} conversaciones analizadas ·{" "}
                    {metrics.hotLeads} oportunidades detectadas ·{" "}
                    {metrics.humanRequired} escalaciones pendientes
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="rounded-3xl bg-gradient-to-r from-[#11b9cc] to-[#2f6df6] px-8 py-5 text-base font-black text-white shadow-[0_18px_34px_rgba(47,109,246,0.24)] transition hover:scale-[1.01]"
              >
                Ver insights del día →
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

async function fetchRuntimeSettings(brandName: string) {
  try {
    const res = await fetch(
      `/api/sales-ai/agent-settings?brandName=${encodeURIComponent(
        brandName
      )}`,
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
    <main className="min-h-screen bg-[#eaf5fb] p-6">
      <div className="mx-auto max-w-4xl rounded-[34px] border border-[#dceaf4] bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-[#08a9c6]">
          SALES AI
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-[#07142f]">
          Cargando Inbox...
        </h1>
      </div>
    </main>
  );
}

function AppSidebar({
  brand,
  metrics,
  activeBrandSlug,
}: {
  brand: BrandContext;
  metrics: InboxMetrics;
  activeBrandSlug: string;
}) {
  const brandQuery = `brandSlug=${encodeURIComponent(activeBrandSlug)}`;

  const nav = [
    {
      label: "Inbox",
      sublabel: "Conversaciones",
      href: `/sales-ai/inbox?${brandQuery}`,
      icon: "chat" as IconName,
      badge: metrics.openLeads,
      active: true,
    },
    {
      label: "Dashboard",
      sublabel: "Métricas",
      href: `/sales-ai?${brandQuery}`,
      icon: "grid" as IconName,
      active: false,
    },
    {
      label: "Conexión",
      sublabel: "WhatsApp",
      href: `/sales-ai/connect?${brandQuery}`,
      icon: "link" as IconName,
      active: false,
    },
    {
      label: "Knowledge",
      sublabel: "Memoria",
      href: `/sales-ai/knowledge?${brandQuery}`,
      icon: "brain" as IconName,
      active: false,
    },
    {
      label: "Learning",
      sublabel: "Mejoras",
      href: `/sales-ai/learning?${brandQuery}`,
      icon: "spark" as IconName,
      active: false,
    },
    {
      label: "Ajustes",
      sublabel: "Agente",
      href: `/sales-ai/agent-settings?${brandQuery}`,
      icon: "gear" as IconName,
      active: false,
    },
  ];

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[320px] overflow-hidden bg-[#071c3b] text-white shadow-[18px_0_42px_rgba(7,28,59,0.22)] lg:flex lg:flex-col">
      <div className="shrink-0 border-b border-white/10 px-6 py-7">
        <Link
          href={`/sales-ai?${brandQuery}`}
          className="flex items-center gap-5"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/10 bg-white/8 p-3 shadow-inner">
            <img
              src="/logo.png"
              alt="Cometa OS"
              className="h-full w-full object-contain"
            />
          </div>

          <div>
            <p className="text-[34px] font-black leading-[0.88] tracking-tight text-white">
              COMETA
              <br />
              OS
            </p>
            <p className="mt-4 text-base font-black uppercase tracking-[0.36em] text-[#28d9f2]">
              Sales AI
            </p>
          </div>
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 [scrollbar-width:thin]">
        <p className="mb-4 px-2 text-xs font-black uppercase tracking-[0.38em] text-white/42">
          Operación
        </p>

        <nav className="space-y-3">
          {nav.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`group flex items-center gap-4 rounded-[26px] px-4 py-4 transition ${
                item.active
                  ? "bg-gradient-to-r from-[#15c3d9] to-[#2e68f6] shadow-[0_20px_44px_rgba(21,195,217,0.24)]"
                  : "bg-white/7 hover:bg-white/11"
              }`}
            >
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                  item.active ? "bg-white/16" : "bg-white/8"
                }`}
              >
                <Icon name={item.icon} className="h-6 w-6 text-[#65e8ff]" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-black leading-tight">
                  {item.label}
                </p>
                <p className="mt-1 truncate text-xs font-black text-white/55">
                  {item.sublabel}
                </p>
              </div>

              {typeof item.badge === "number" ? (
                <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-[#2e68f6] px-2 text-xs font-black text-white">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#07142f] p-5">
        <div className="rounded-[28px] border border-white/10 bg-white/7 p-4">
          <div className="flex items-center gap-4">
            <Avatar name={brand.name} size="lg" />

            <div className="min-w-0">
              <p className="truncate text-lg font-black">{brand.name}</p>
              <p className="text-xs font-black text-white/55">
                Workspace activo
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#030d22] px-4 py-3">
            <span className="text-sm font-black text-white/70">Sistema</span>
            <span className="inline-flex items-center gap-2 text-sm font-black text-[#35f08e]">
              <span className="h-3 w-3 rounded-full bg-[#35f08e]" />
              Online
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({
  brand,
  metrics,
  safety,
  runtimeSettings,
  loading,
  backgroundRefreshing,
  lastUpdatedAt,
  liveMessage,
  autoRefreshEnabled,
  onToggleAutoRefresh,
  onRefresh,
}: {
  brand: BrandContext;
  metrics: InboxMetrics;
  safety: SafetyState;
  runtimeSettings: RuntimeSettings | null;
  loading: boolean;
  backgroundRefreshing: boolean;
  lastUpdatedAt: string | null;
  liveMessage: string;
  autoRefreshEnabled: boolean;
  onToggleAutoRefresh: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#d7e5f0] bg-white/92 px-4 py-4 backdrop-blur-xl sm:px-5 xl:px-8">
      <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-[#07142f]">
              SALES AI Inbox
            </h1>

            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2 text-xs font-black uppercase tracking-[0.25em] text-emerald-700">
              Activo
            </span>

            <button
              type="button"
              onClick={onToggleAutoRefresh}
              className={`rounded-full border px-5 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${
                autoRefreshEnabled
                  ? "border-[#b8edf5] bg-[#eafbff] text-[#08a9c6]"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {backgroundRefreshing
                ? "Sincronizando..."
                : autoRefreshEnabled
                ? "Live ON"
                : "Live OFF"}
            </button>
          </div>

          <p className="mt-1 truncate text-sm font-black text-[#697790]">
            {brand.name} · {metrics.openLeads} conversaciones abiertas ·{" "}
            {labelAgentMode(
              runtimeSettings?.agent_mode || metrics.automationMode
            )}{" "}
            · {liveMessage}
            {lastUpdatedAt ? ` · ${formatShortTime(lastUpdatedAt)}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <TopBadge
            label="WhatsApp"
            value={labelWhatsappStatus(runtimeSettings?.whatsapp_status)}
            tone={
              String(runtimeSettings?.whatsapp_status || "").toLowerCase() ===
              "connected"
                ? "green"
                : "amber"
            }
          />

          <TopBadge
            label="Candado"
            value={safety.tone === "safe" ? "Controlado" : "Protegido"}
            tone={safety.tone === "safe" ? "green" : "red"}
          />

          <button
            onClick={onRefresh}
            disabled={loading || backgroundRefreshing}
            className="inline-flex items-center gap-3 rounded-[22px] bg-[#07142f] px-7 py-4 text-sm font-black text-white shadow-[0_14px_30px_rgba(7,20,47,0.2)] transition hover:scale-[1.01] disabled:opacity-60"
          >
            <Icon name="refresh" className="h-5 w-5" />
            {loading
              ? "Actualizando..."
              : backgroundRefreshing
              ? "Sincronizando..."
              : "Actualizar"}
          </button>
        </div>
      </div>
    </header>
  );
}

function TopBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "amber" | "red" | "green";
}) {
  const classes = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };

  return (
    <div
      className={`rounded-[22px] border px-6 py-3 shadow-sm ${classes[tone]}`}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.28em]">
        {label}
      </p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

function MetricRibbon({
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
      delta: "18%",
    },
    {
      label: "Respuestas listas",
      value: metrics.readyReplies,
      icon: "chat" as IconName,
      tone: "cyan" as const,
      delta: "23%",
    },
    {
      label: "Calientes",
      value: metrics.hotLeads,
      icon: "flame" as IconName,
      tone: "orange" as const,
      delta: "31%",
    },
    {
      label: "Seguimiento",
      value: `${metrics.health}%`,
      icon: "bot" as IconName,
      tone: "green" as const,
      delta: "8%",
    },
    {
      label: "Cierre estimado",
      value: "$29,750",
      icon: "target" as IconName,
      tone: "purple" as const,
      delta: "27%",
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <MetricTile
          key={item.label}
          label={item.label}
          value={loading ? "..." : item.value}
          icon={item.icon}
          tone={item.tone}
          delta={item.delta}
        />
      ))}
    </section>
  );
}

function MetricTile({
  label,
  value,
  icon,
  tone,
  delta,
}: {
  label: string;
  value: string | number;
  icon: IconName;
  tone: "blue" | "cyan" | "orange" | "green" | "purple";
  delta: string;
}) {
  const toneMap = {
    blue: {
      box: "bg-[#eef7ff] text-[#2869f6]",
      line: "text-[#2869f6]",
    },
    cyan: {
      box: "bg-[#eafbff] text-[#0aa6c4]",
      line: "text-[#0aa6c4]",
    },
    orange: {
      box: "bg-[#fff3e9] text-[#fb6a13]",
      line: "text-[#fb6a13]",
    },
    green: {
      box: "bg-[#eafbf1] text-[#12b873]",
      line: "text-[#12b873]",
    },
    purple: {
      box: "bg-[#f4ecff] text-[#873cff]",
      line: "text-[#873cff]",
    },
  };

  return (
    <article className="rounded-[28px] border border-[#dceaf4] bg-white p-6 shadow-[0_18px_40px_rgba(8,21,53,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl ${toneMap[tone].box}`}
        >
          <Icon name={icon} className="h-7 w-7" />
        </div>

        <MiniSpark className={toneMap[tone].line} />
      </div>

      <p className="mt-6 truncate text-sm font-black text-[#6b7890]">
        {label}
      </p>

      <p className="mt-2 text-4xl font-black tracking-tight text-[#07142f]">
        {value}
      </p>

      <p className="mt-2 text-sm font-black text-emerald-600">
        ↑ {delta} vs ayer
      </p>
    </article>
  );
}

function InboxColumn({
  leads,
  totalLeads,
  metrics,
  selectedLeadId,
  filter,
  setFilter,
  searchTerm,
  setSearchTerm,
  loading,
  onSelect,
}: {
  leads: SalesLead[];
  totalLeads: number;
  metrics: InboxMetrics;
  selectedLeadId: string;
  filter: FilterKey;
  setFilter: (filter: FilterKey) => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: totalLeads },
    { key: "new", label: "Nuevos", count: metrics.openLeads },
    { key: "hot", label: "Calientes", count: metrics.hotLeads },
    { key: "qualified", label: "Calificados", count: metrics.qualified },
    { key: "human", label: "Humano", count: metrics.humanRequired },
  ];

  return (
    <section className="overflow-hidden rounded-[34px] border border-[#dceaf4] bg-white shadow-[0_18px_50px_rgba(8,21,53,0.06)]">
      <div className="p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.38em] text-[#08a9c6]">
              Inbox inteligente
            </p>
            <h2 className="mt-3 text-5xl font-black tracking-tight text-[#07142f]">
              Conversaciones
            </h2>
          </div>

          <button
            type="button"
            className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#eef7ff] text-[#2869f6]"
          >
            <Icon name="sliders" className="h-7 w-7" />
          </button>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-3 md:grid-cols-5">
          {filters.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-[22px] px-5 py-5 text-sm font-black transition ${
                filter === item.key
                  ? "bg-gradient-to-r from-[#14b9cf] to-[#2e68f6] text-white shadow-[0_14px_30px_rgba(46,104,246,0.22)]"
                  : "bg-[#edf3f8] text-[#63728b] hover:bg-[#e3eef7]"
              }`}
            >
              {item.label} {item.count ? item.count : ""}
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-[22px] border border-[#dceaf4] bg-white px-6 py-5 shadow-sm">
          <Icon name="search" className="h-6 w-6 text-[#8aa0b8]" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar conversación..."
            className="min-w-0 flex-1 bg-transparent text-base font-black text-[#07142f] outline-none placeholder:text-[#9aadbf]"
          />
        </div>
      </div>

      <div className="border-t border-[#e5eef6] p-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <LeadSkeleton />
            <LeadSkeleton />
            <LeadSkeleton />
            <LeadSkeleton />
          </div>
        ) : leads.length ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {leads.map((lead) => (
              <LeadListCard
                key={lead.id}
                lead={lead}
                selected={selectedLeadId === lead.id}
                onClick={() => onSelect(lead.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyBox
            title="Sin conversaciones"
            text="Cuando entre un mensaje por WhatsApp, aparecerá aquí."
          />
        )}
      </div>
    </section>
  );
}

function LeadListCard({
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
      className={`w-full rounded-[26px] border p-5 text-left transition ${
        selected
          ? "border-[#80b8ff] bg-[#eef7ff] shadow-[0_14px_30px_rgba(46,104,246,0.12)]"
          : "border-[#e2edf6] bg-white hover:border-[#bfefff] hover:bg-[#fbfeff]"
      }`}
    >
      <div className="flex items-start gap-4">
        <Avatar name={lead.name} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-xl font-black leading-tight text-[#07142f]">
                  {lead.name || "Lead sin nombre"}
                </h3>
                <span className="h-3 w-3 shrink-0 rounded-full bg-emerald-500" />
              </div>

              <p className="mt-1 truncate text-sm font-black text-[#65758e]">
                {formatPhone(lead.phone) || "Sin teléfono"}
              </p>
            </div>

            <span className="shrink-0 text-xs font-black text-[#728199]">
              {formatShortTime(lead.lastMessageAt)}
            </span>
          </div>

          <p className="mt-4 line-clamp-2 text-sm font-black leading-6 text-[#62718a]">
            {getLeadPreview(lead)}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <TemperatureBadge temperature={lead.temperature} />
            <span className="text-sm font-black text-[#07142f]">
              {lead.closeProbability}% cierre
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function ChatColumn({
  brand,
  lead,
  messages,
  agentRun,
  safety,
  note,
  setNote,
  suggestedReply,
  editableReply,
  setEditableReply,
  onSendApprovedReply,
  sendingApprovedReply,
  sendStatus,
  aiThinking,
  backgroundRefreshing,
}: {
  brand: BrandContext;
  lead: SalesLead | null;
  messages: SalesMessage[];
  agentRun: AgentRun | null;
  safety: SafetyState;
  note: string;
  setNote: (value: string) => void;
  suggestedReply: string;
  editableReply: string;
  setEditableReply: (value: string) => void;
  onSendApprovedReply: () => void;
  sendingApprovedReply: boolean;
  sendStatus: SendStatus | null;
  aiThinking: boolean;
  backgroundRefreshing: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[34px] border border-[#dceaf4] bg-white shadow-[0_18px_50px_rgba(8,21,53,0.06)]">
      <div className="border-b border-[#e5eef6] px-8 py-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-6">
            <Avatar name={lead?.name || brand.name} size="xl" />

            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="truncate text-5xl font-black tracking-tight text-[#07142f]">
                  {lead?.name || brand.name}
                </h2>
                <span className="h-4 w-4 shrink-0 rounded-full bg-emerald-500" />
              </div>

              <p className="mt-2 truncate text-lg font-black text-[#697790]">
                {formatPhone(lead?.phone || "") || "Sin teléfono"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {backgroundRefreshing ? (
              <span className="rounded-full border border-[#b8edf5] bg-[#eafbff] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[#08a9c6]">
                Actualizando
              </span>
            ) : null}
            <IconButton icon="star" />
            <IconButton icon="tag" />
            <IconButton icon="dots" />
          </div>
        </div>
      </div>

      <div className="min-h-[460px] bg-[radial-gradient(#cbe9f8_1px,transparent_1px)] bg-[length:22px_22px] px-8 py-8">
        {lead ? (
          <div className="space-y-6">
            <div className="mx-auto w-fit rounded-full border border-[#dceaf4] bg-white px-6 py-2 text-sm font-black text-[#728199] shadow-sm">
              Hoy
            </div>

            {messages.length ? (
              messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))
            ) : (
              <EmptyBox
                title="Sin mensajes"
                text="Este lead existe, pero aún no se cargó historial de conversación."
              />
            )}

            {aiThinking ? <AiThinkingBubble /> : null}
          </div>
        ) : (
          <EmptyBox
            title="Selecciona una conversación"
            text="Aquí verás los mensajes, respuesta sugerida y siguiente acción."
          />
        )}
      </div>

      <div className="border-t border-[#e5eef6] bg-white p-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <RecommendedReplyCard
            suggestedReply={suggestedReply}
            editableReply={editableReply}
            setEditableReply={setEditableReply}
            lead={lead}
            onSendApprovedReply={onSendApprovedReply}
            sendingApprovedReply={sendingApprovedReply}
            sendStatus={sendStatus}
            aiThinking={aiThinking}
          />

          <NextActionCard
            lead={lead}
            agentRun={agentRun}
            safety={safety}
            aiThinking={aiThinking}
          />
        </div>

        <div className="mt-6 flex items-center gap-4 rounded-[26px] border border-[#dceaf4] bg-white p-4 shadow-sm">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f1f7fb] text-[#728199]">
            <Icon name="spark" className="h-6 w-6" />
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Escribe una nota interna o borrador..."
            className="min-w-0 flex-1 bg-transparent text-base font-black text-[#07142f] outline-none placeholder:text-[#9aadbf]"
          />

          <button
            type="button"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#07142f] text-white shadow-[0_12px_25px_rgba(7,20,47,0.22)]"
          >
            <Icon name="send" className="h-6 w-6" />
          </button>
        </div>
      </div>
    </section>
  );
}

function RecommendedReplyCard({
  suggestedReply,
  editableReply,
  setEditableReply,
  lead,
  onSendApprovedReply,
  sendingApprovedReply,
  sendStatus,
  aiThinking,
}: {
  suggestedReply: string;
  editableReply: string;
  setEditableReply: (value: string) => void;
  lead: SalesLead | null;
  onSendApprovedReply: () => void;
  sendingApprovedReply: boolean;
  sendStatus: SendStatus | null;
  aiThinking: boolean;
}) {
  const cleanEditableReply = editableReply.trim();
  const cleanSuggestedReply = suggestedReply.trim();
  const canSend = Boolean(lead?.id && cleanEditableReply && !aiThinking);
  const wasEdited = cleanEditableReply !== cleanSuggestedReply;

  const statusClass =
    sendStatus?.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : sendStatus?.type === "blocked"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className="rounded-[26px] border border-[#c7ebf7] bg-[#eafbff] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.34em] text-[#276df6]">
            {aiThinking ? "SALES AI analizando" : "Respuesta recomendada"}
          </p>

          <p className="mt-2 text-xs font-black text-[#5d7088]">
            {aiThinking
              ? "La IA está leyendo el nuevo mensaje y preparando una respuesta."
              : "Edita el texto antes de enviarlo por WhatsApp real."}
          </p>
        </div>

        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#276df6]">
          IA
        </span>
      </div>

      {aiThinking ? (
        <div className="mt-4 rounded-[22px] border border-[#cfe2f6] bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 animate-pulse rounded-full bg-[#15bfd2]" />
            <p className="text-sm font-black text-[#5d7088]">
              Generando respuesta recomendada...
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-[22px] border border-[#cfe2f6] bg-white p-4">
        <textarea
          value={editableReply}
          onChange={(e) => setEditableReply(e.target.value)}
          disabled={!lead || sendingApprovedReply || aiThinking}
          rows={7}
          placeholder={
            aiThinking
              ? "SALES AI está generando una respuesta..."
              : "SALES AI todavía no tiene una respuesta sugerida para esta conversación."
          }
          className="min-h-[190px] w-full resize-none bg-transparent text-base font-black leading-8 text-[#07142f] outline-none placeholder:text-[#8da0b8] disabled:cursor-not-allowed disabled:opacity-70"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef4fa] pt-3">
          <span className="text-xs font-black text-[#7b8ca3]">
            {cleanEditableReply.length} caracteres
          </span>

          {aiThinking ? (
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-[#08a9c6]">
              IA pensando
            </span>
          ) : wasEdited ? (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
              Editada manualmente
            </span>
          ) : (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#276df6]">
              Sugerencia IA original
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <ToneChip label="Profesional" />
        <ToneChip label="Amigable" />
        <ToneChip label="Directo" />
      </div>

      {sendStatus ? (
        <div
          className={`mt-4 rounded-[18px] border px-4 py-3 text-sm font-black leading-6 ${statusClass}`}
        >
          {sendStatus.message}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() =>
            cleanEditableReply && navigator.clipboard?.writeText(editableReply)
          }
          disabled={!cleanEditableReply || sendingApprovedReply || aiThinking}
          className="rounded-[22px] border border-[#c7dff2] bg-white px-5 py-4 text-sm font-black text-[#276df6] shadow-sm transition hover:bg-[#f5fbff] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Copiar
        </button>

        <button
          type="button"
          onClick={() => setEditableReply(suggestedReply)}
          disabled={!cleanSuggestedReply || sendingApprovedReply || aiThinking}
          className="rounded-[22px] border border-[#c7dff2] bg-white px-5 py-4 text-sm font-black text-[#07142f] shadow-sm transition hover:bg-[#f5fbff] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Restaurar IA
        </button>

        <button
          type="button"
          onClick={onSendApprovedReply}
          disabled={!canSend || sendingApprovedReply}
          className="rounded-[22px] bg-gradient-to-r from-[#15bfd2] to-[#2578ee] px-5 py-4 text-sm font-black text-white shadow-[0_16px_30px_rgba(37,120,238,0.22)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sendingApprovedReply ? "Enviando..." : "Enviar"}
        </button>
      </div>

      <p className="mt-3 text-xs font-black leading-5 text-[#5d7088]">
        Este botón envía el mensaje real por WhatsApp solo después de aprobación
        manual. Si el agente está en automático, los candados de seguridad se
        validan desde backend.
      </p>
    </div>
  );
}

function NextActionCard({
  lead,
  agentRun,
  safety,
  aiThinking,
}: {
  lead: SalesLead | null;
  agentRun: AgentRun | null;
  safety: SafetyState;
  aiThinking: boolean;
}) {
  return (
    <div className="rounded-[26px] border border-[#dceaf4] bg-white p-5">
      <p className="text-xs font-black uppercase tracking-[0.34em] text-[#8a98ad]">
        Acción siguiente
      </p>

      <h3 className="mt-4 text-2xl font-black leading-tight text-[#07142f]">
        {aiThinking
          ? "SALES AI está preparando la siguiente acción"
          : lead?.nextAction ||
            agentRun?.nextAction ||
            "Esperar respuesta del cliente para obtener más información."}
      </h3>

      <p className="mt-4 text-sm font-black leading-7 text-[#66758d]">
        {aiThinking
          ? "El sistema detectó un mensaje nuevo y está generando la recomendación comercial."
          : agentRun?.decisionReason ||
            lead?.aiSummary ||
            "Se busca avanzar la conversación y calificar al lead con preguntas claras."}
      </p>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-[20px] border border-[#dceaf4] bg-[#f7fbff] px-4 py-4">
        <span className="text-sm font-black text-[#07142f]">Seguridad</span>
        <SafetyBadge safety={safety} />
      </div>

      <button
        type="button"
        className="mt-4 w-full rounded-[20px] border border-[#dceaf4] bg-white px-5 py-4 text-sm font-black text-[#276df6] transition hover:bg-[#f5fbff]"
      >
        Aplicar acción
      </button>
    </div>
  );
}

function IntelligenceColumn({
  lead,
  agentRun,
  safety,
  runtimeSettings,
  aiThinking,
}: {
  lead: SalesLead | null;
  agentRun: AgentRun | null;
  safety: SafetyState;
  runtimeSettings: RuntimeSettings | null;
  aiThinking: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[34px] border border-[#dceaf4] bg-white shadow-[0_18px_50px_rgba(8,21,53,0.06)]">
      <div className="border-b border-[#e5eef6] p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.38em] text-[#08a9c6]">
              Inteligencia IA
            </p>
            <h2 className="mt-3 text-5xl font-black tracking-tight text-[#07142f]">
              Conversación
            </h2>
          </div>

          <span className="rounded-full bg-[#eef7ff] px-5 py-3 text-sm font-black text-[#276df6]">
            {aiThinking ? "Pensando" : "IA"}
          </span>
        </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <IntelCard
            icon="target"
            label="Intención"
            value={lead?.intent || "Sin dato"}
            tone="green"
          />
          <IntelCard
            icon="alert"
            label="Objeción"
            value={lead?.mainObjection || "ninguna"}
            tone="red"
          />
          <IntelCard
            icon="flame"
            label="Temperatura"
            value={labelTemperature(lead?.temperature)}
            tone="orange"
          />
          <IntelCard
            icon="shield"
            label="Confianza IA"
            value={`${agentRun?.confidenceScore || 80}%`}
            tone="cyan"
          />
          <IntelCard
            icon="target"
            label="Cierre"
            value={`${lead?.closeProbability || 0}%`}
            tone="purple"
          />
          <IntelCard
            icon="bot"
            label="Automatización"
            value={labelAgentMode(runtimeSettings?.agent_mode)}
            tone="blue"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-[28px] border border-[#dceaf4] bg-[#f7fbff] p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-[#8a98ad]">
                  Candado de WhatsApp
                </p>
                <h3 className="mt-2 text-2xl font-black text-[#07142f]">
                  {safety.label}
                </h3>
              </div>

              <SafetyBadge safety={safety} />
            </div>

            <div className="mt-5 grid gap-3">
              {safety.reasons.length ? (
                safety.reasons.map((reason) => (
                  <p
                    key={reason}
                    className="rounded-2xl bg-white px-5 py-4 text-sm font-black leading-6 text-[#65758d]"
                  >
                    {reason}
                  </p>
                ))
              ) : (
                <p className="rounded-2xl bg-white px-5 py-4 text-sm font-black leading-6 text-[#65758d]">
                  Sin bloqueo detectado.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[#dceaf4] bg-white p-6">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#8a98ad]">
              Razón del agente
            </p>

            <p className="mt-4 text-lg font-black leading-8 text-[#07142f]">
              {aiThinking
                ? "SALES AI está leyendo el nuevo mensaje y generando una decisión comercial."
                : agentRun?.decisionReason ||
                  lead?.aiSummary ||
                  "SALES AI está esperando más información para mejorar su decisión."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PipelinePanel({ leads }: { leads: SalesLead[] }) {
  const total = Math.max(leads.length, 1);
  const newCount = leads.filter((lead) => {
    const status = lead.status.toLowerCase();
    return status.includes("new") || status.includes("open");
  }).length;
  const qualified = leads.filter((lead) => lead.isQualified).length;
  const hot = leads.filter((lead) => isHotLead(lead)).length;
  const follow = leads.filter((lead) =>
    lead.nextAction.toLowerCase().includes("seguimiento")
  ).length;
  const close = leads.filter((lead) => lead.closeProbability >= 80).length;

  const rows = [
    { label: "Nuevos", value: newCount, tone: "blue" as const },
    {
      label: "Califica",
      value: Math.max(qualified + hot, 1),
      tone: "orange" as const,
    },
    { label: "Oportun.", value: hot, tone: "cyan" as const },
    { label: "Follow", value: follow, tone: "purple" as const },
    { label: "Cierre", value: close, tone: "green" as const },
  ];

  return (
    <section className="rounded-[34px] border border-[#dceaf4] bg-white p-8 shadow-[0_18px_50px_rgba(8,21,53,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black tracking-tight text-[#07142f]">
            Pipeline de ventas
          </h2>
          <p className="mt-2 text-sm font-black text-[#66758d]">
            Distribución comercial generada desde conversaciones.
          </p>
        </div>

        <button className="rounded-full bg-[#eef7ff] px-5 py-3 text-sm font-black text-[#276df6]">
          Ver tablero
        </button>
      </div>

      <div className="mt-7 grid gap-4">
        {rows.map((row) => (
          <PipelineRow
            key={row.label}
            label={row.label}
            value={row.value}
            total={total}
            tone={row.tone}
          />
        ))}
      </div>
    </section>
  );
}

function PipelineRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "blue" | "orange" | "cyan" | "purple" | "green";
}) {
  const toneMap = {
    blue: "bg-[#2e68f6]",
    orange: "bg-[#fb6a13]",
    cyan: "bg-[#08a9c6]",
    purple: "bg-[#873cff]",
    green: "bg-[#12b873]",
  };

  const width = `${Math.max(6, Math.min(100, (value / total) * 100))}%`;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-black text-[#66758d]">{label}</p>
        <p className="text-sm font-black text-[#07142f]">{value}</p>
      </div>

      <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#edf3f8]">
        <div
          className={`h-full rounded-full ${toneMap[tone]}`}
          style={{ width }}
        />
      </div>
    </div>
  );
}

function ProjectionPanel({ leads }: { leads: SalesLead[] }) {
  const projection = Math.max(0, leads.length * 3300);

  return (
    <section className="rounded-[34px] border border-[#dceaf4] bg-white p-8 shadow-[0_18px_50px_rgba(8,21,53,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black tracking-tight text-[#07142f]">
            Proyección de cierre
          </h2>
          <p className="mt-8 text-6xl font-black tracking-tight text-[#07142f]">
            {formatCurrency(projection)}
          </p>
          <p className="mt-2 text-base font-black text-emerald-600">
            Estimado según conversaciones activas
          </p>
        </div>

        <span className="rounded-full bg-[#f1f6fb] px-6 py-4 text-sm font-black text-[#697790]">
          Meta:
          <br />
          $150,000
        </span>
      </div>

      <div className="mt-10">
        <BigChart />
      </div>
    </section>
  );
}

function QuickCommandBar({
  brandQuery,
  brandSlug,
}: {
  brandQuery: string;
  brandSlug: string;
}) {
  const commands = [
    {
      label: "Resumir conversación",
      text: "Obtén resumen con IA",
      icon: "spark" as IconName,
      href: `/sales-ai/inbox?${brandQuery}`,
    },
    {
      label: "Detectar objeciones",
      text: "Analiza posibles bloqueos",
      icon: "target" as IconName,
      href: `/sales-ai/learning?${brandQuery}`,
    },
    {
      label: "Generar propuesta",
      text: "Crea propuesta personalizada",
      icon: "file" as IconName,
      href: `/sales-ai/knowledge?${brandQuery}`,
    },
    {
      label: "Agendar seguimiento",
      text: "Programa próximo contacto",
      icon: "calendar" as IconName,
      href: `/brand/${brandSlug}`,
    },
  ];

  return (
    <section className="mt-5 overflow-hidden rounded-[34px] bg-gradient-to-r from-[#07142f] via-[#075674] to-[#17bfd2] p-7 text-white shadow-[0_22px_50px_rgba(8,169,198,0.22)]">
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.36em] text-[#41e5ff]">
            Comandos rápidos con IA
          </p>

          <h2 className="mt-4 max-w-[340px] text-2xl font-black leading-tight xl:text-3xl">
            Ejecuta acciones comerciales sin salir del inbox.
          </h2>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {commands.map((command) => (
            <Link
              key={command.label}
              href={command.href}
              className="group min-w-0 rounded-[24px] border border-white/14 bg-white/12 p-5 transition hover:bg-white/18"
            >
              <div className="flex h-full min-h-[150px] flex-col justify-between gap-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#2f6df6] shadow-[0_14px_28px_rgba(47,109,246,0.28)]">
                  <Icon name={command.icon} className="h-6 w-6" />
                </div>

                <div className="min-w-0">
                  <p className="text-xl font-black leading-tight text-white">
                    {command.label}
                  </p>

                  <p className="mt-2 text-sm font-black leading-5 text-white/60">
                    {command.text}
                  </p>
                </div>
              </div>
            </Link>
          ))}
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
      {!isOutbound ? (
        <Avatar name={message.sender || "Cliente"} size="sm" />
      ) : null}

      <div
        className={`max-w-[78%] rounded-[24px] px-5 py-4 shadow-sm ${
          isOutbound
            ? "bg-[#dff9e8] text-[#07142f]"
            : "border border-[#dceaf4] bg-white text-[#07142f]"
        }`}
      >
        <p
          className={`mb-2 text-[11px] font-black uppercase tracking-[0.22em] ${
            isOutbound ? "text-emerald-700" : "text-[#8a98ad]"
          }`}
        >
          {isOutbound ? "SALES AI" : message.sender || "Cliente"}
          {message.createdAt ? ` · ${formatDateTime(message.createdAt)}` : ""}
        </p>

        <p className="whitespace-pre-wrap break-words text-sm font-black leading-7">
          {message.content || "Mensaje sin contenido."}
        </p>
      </div>

      {isOutbound ? (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2e68f6] text-white">
          <Icon name="bot" className="h-5 w-5" />
        </div>
      ) : null}
    </div>
  );
}

function AiThinkingBubble() {
  return (
    <div className="flex items-start gap-3 justify-end">
      <div className="max-w-[78%] rounded-[24px] bg-[#dff9e8] px-5 py-4 text-[#07142f] shadow-sm">
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">
          SALES AI
        </p>

        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-600" />
          <p className="text-sm font-black leading-7">
            Analizando conversación y preparando respuesta...
          </p>
        </div>
      </div>

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2e68f6] text-white">
        <Icon name="bot" className="h-5 w-5" />
      </div>
    </div>
  );
}

function IntelCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone: "green" | "red" | "orange" | "cyan" | "purple" | "blue";
}) {
  const toneMap = {
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-500",
    orange: "bg-orange-50 text-orange-500",
    cyan: "bg-cyan-50 text-cyan-600",
    purple: "bg-purple-50 text-purple-600",
    blue: "bg-blue-50 text-blue-600",
  };

  return (
    <article className="rounded-[26px] border border-[#dceaf4] bg-white p-5">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-2xl ${toneMap[tone]}`}
      >
        <Icon name={icon} className="h-7 w-7" />
      </div>

      <p className="mt-5 text-sm font-black text-[#8a98ad]">{label}</p>
      <p className="mt-2 break-words text-2xl font-black text-[#07142f]">
        {value || "Sin dato"}
      </p>
    </article>
  );
}

function IconButton({ icon }: { icon: IconName }) {
  return (
    <button
      type="button"
      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#dceaf4] bg-white text-[#697790] shadow-sm transition hover:bg-[#f5fbff]"
    >
      <Icon name={icon} className="h-6 w-6" />
    </button>
  );
}

function TemperatureBadge({ temperature }: { temperature: string }) {
  const temp = String(temperature || "").toLowerCase();

  const isHot = temp.includes("caliente") || temp.includes("hot");
  const isWarm = temp.includes("tibio") || temp.includes("warm");

  const className = isHot
    ? "border-red-200 bg-red-50 text-red-600"
    : isWarm
    ? "border-amber-200 bg-amber-50 text-amber-600"
    : "border-blue-200 bg-blue-50 text-blue-600";

  const label = isHot ? "Caliente" : isWarm ? "Tibio" : "Frío";

  return (
    <span
      className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.16em] ${className}`}
    >
      {label}
    </span>
  );
}

function SafetyBadge({ safety }: { safety: SafetyState }) {
  const toneMap = {
    safe: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    blocked: "border-red-200 bg-red-50 text-red-700",
    neutral: "border-[#dceaf4] bg-white text-[#66758d]",
  };

  return (
    <span
      className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${toneMap[safety.tone]}`}
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
}: {
  name?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizeMap = {
    sm: "h-11 w-11 text-xs",
    md: "h-16 w-16 text-lg",
    lg: "h-20 w-20 text-xl",
    xl: "h-24 w-24 text-2xl",
  };

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full border border-[#78e1d8] bg-[#b8f3ee] font-black text-[#0b5262] ${sizeMap[size]}`}
    >
      {getInitials(name || "AI")}
      <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500" />
    </div>
  );
}

function ToneChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[#dceaf4] bg-white px-4 py-2 text-xs font-black text-[#276df6] shadow-sm">
      {label}
    </span>
  );
}

function LeadSkeleton() {
  return (
    <div className="rounded-[26px] border border-[#dceaf4] bg-[#f6fbff] p-5">
      <div className="h-6 w-40 rounded-full bg-[#dfeaf3]" />
      <div className="mt-4 h-4 w-56 rounded-full bg-[#dfeaf3]" />
      <div className="mt-5 h-20 rounded-3xl bg-[#dfeaf3]" />
    </div>
  );
}

function EmptyBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[26px] border border-dashed border-[#d7e4ef] bg-[#fbfdff] p-8 text-center">
      <h3 className="text-2xl font-black text-[#07142f]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm font-black leading-6 text-[#66758d]">
        {text}
      </p>
    </div>
  );
}

function LoadWarning({ message }: { message: string }) {
  return (
    <div className="mb-5 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-black text-amber-700">
      No se pudo cargar información real desde Supabase. Detalle: {message}
    </div>
  );
}

function MiniSpark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 90 40" className={`h-10 w-24 ${className}`} fill="none">
      <path
        d="M4 32C16 26 22 28 34 20C44 14 50 19 60 11C70 5 76 9 86 2"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BigChart() {
  return (
    <svg viewBox="0 0 520 240" className="h-[240px] w-full" fill="none">
      <path
        d="M30 195C78 172 103 150 145 130C187 110 198 111 236 88C274 65 300 78 337 54C374 30 416 48 490 20V220H30V195Z"
        fill="#bff3f8"
      />
      <path
        d="M30 195C78 172 103 150 145 130C187 110 198 111 236 88C274 65 300 78 337 54C374 30 416 48 490 20"
        stroke="#1c9ee8"
        strokeWidth="10"
        strokeLinecap="round"
      />
    </svg>
  );
}

function normalizeBrand(
  value: any,
  fallback: BrandContext = fallbackBrand
): BrandContext {
  const rawName =
    cleanText(value?.name) ||
    cleanText(value?.brandName) ||
    cleanText(value?.brand_name) ||
    cleanText(fallback.name);

  const rawSlug =
    cleanText(value?.slug) ||
    cleanText(value?.brandSlug) ||
    cleanText(value?.brand_slug) ||
    cleanText(fallback.slug) ||
    toBrandSlug(rawName);

  const slug = toBrandSlug(rawSlug || rawName);

  return {
    id: value?.id || fallback.id,
    slug,
    name: rawName || formatBrandNameFromSlug(slug),
    industry:
      cleanText(value?.industry) ||
      cleanText(value?.category) ||
      fallback.industry,
    city: value?.city || fallback.city,
    exists: Boolean(value?.exists ?? fallback.exists),
    sourceTable:
      value?.sourceTable || value?.source_table || fallback.sourceTable,
  };
}

function normalizeLead(
  lead: any,
  index: number,
  expectedBrand: BrandContext
): SalesLead {
  const id = String(
    lead?.id ||
      lead?.lead_id ||
      lead?.uuid ||
      lead?.phone ||
      lead?.contact_phone ||
      `lead-${index}`
  );

  const leadBrandName =
    cleanText(lead?.brandName) ||
    cleanText(lead?.brand_name) ||
    cleanText(lead?.brand) ||
    expectedBrand.name;

  const leadBrandSlug =
    toBrandSlug(
      cleanText(lead?.brandSlug) ||
        cleanText(lead?.brand_slug) ||
        leadBrandName ||
        expectedBrand.slug
    ) || expectedBrand.slug;

  const name =
    cleanText(lead?.name) ||
    cleanText(lead?.contact_name) ||
    cleanText(lead?.customer_name) ||
    cleanText(lead?.lead_name) ||
    cleanText(lead?.sender_name) ||
    `Lead ${index + 1}`;

  const phone =
    cleanText(lead?.phone) ||
    cleanText(lead?.contact_phone) ||
    cleanText(lead?.whatsapp) ||
    cleanText(lead?.whatsapp_number) ||
    cleanText(lead?.from_number) ||
    "";

  const closeProbability = clampNumber(
    Number(
      lead?.closeProbability ??
        lead?.close_probability ??
        lead?.probability ??
        lead?.close_score ??
        0
    ),
    0,
    100
  );

  const isQualified = Boolean(
    lead?.isQualified ??
      lead?.is_qualified ??
      lead?.qualified ??
      closeProbability >= 65
  );

  const tags = Array.isArray(lead?.tags)
    ? lead.tags.map((tag: any) => String(tag))
    : [];

  return {
    id,
    brandName: leadBrandName,
    brandSlug: leadBrandSlug,
    name,
    phone,
    status:
      cleanText(lead?.status) ||
      cleanText(lead?.lead_status) ||
      cleanText(lead?.stage) ||
      "new",
    temperature:
      cleanText(lead?.temperature) ||
      cleanText(lead?.lead_temperature) ||
      inferTemperatureFromProbability(closeProbability),
    intent:
      cleanText(lead?.intent) ||
      cleanText(lead?.detected_intent) ||
      cleanText(lead?.purchase_intent) ||
      "curiosidad",
    budget:
      cleanText(lead?.budget) ||
      cleanText(lead?.budget_level) ||
      cleanText(lead?.budget_text) ||
      "No detectado",
    city: cleanText(lead?.city) || cleanText(lead?.location) || "No detectada",
    isQualified,
    mainObjection:
      cleanText(lead?.mainObjection) ||
      cleanText(lead?.main_objection) ||
      cleanText(lead?.objection) ||
      "ninguna",
    closeProbability,
    aiSummary:
      cleanText(lead?.aiSummary) ||
      cleanText(lead?.ai_summary) ||
      cleanText(lead?.summary) ||
      "",
    nextAction:
      cleanText(lead?.nextAction) ||
      cleanText(lead?.next_action) ||
      cleanText(lead?.recommended_next_action) ||
      "Esperar respuesta del cliente para obtener más información.",
    recommendedReply:
      cleanText(lead?.recommendedReply) ||
      cleanText(lead?.recommended_reply) ||
      cleanText(lead?.reply_suggestion) ||
      "",
    lastMessage:
      cleanText(lead?.lastMessage) ||
      cleanText(lead?.last_message) ||
      cleanText(lead?.last_message_text) ||
      cleanText(lead?.incoming_message) ||
      cleanText(lead?.message) ||
      "",
    lastMessageAt:
      lead?.lastMessageAt ||
      lead?.last_message_at ||
      lead?.updated_at ||
      lead?.created_at ||
      null,
    requiresHuman: Boolean(
      lead?.requiresHuman ??
        lead?.requires_human ??
        lead?.requires_human_confirmation ??
        false
    ),
    tags,
  };
}

function normalizeMessage(message: any, index: number): SalesMessage {
  return {
    id: String(
      message?.id ||
        message?.message_id ||
        message?.whatsapp_message_id ||
        `message-${index}`
    ),
    leadId: String(
      message?.leadId ||
        message?.lead_id ||
        message?.sales_lead_id ||
        message?.lead ||
        ""
    ),
    direction:
      cleanText(message?.direction) ||
      cleanText(message?.message_direction) ||
      cleanText(message?.type) ||
      "inbound",
    content:
      cleanText(message?.content) ||
      cleanText(message?.content_text) ||
      cleanText(message?.message) ||
      cleanText(message?.body) ||
      cleanText(message?.text) ||
      cleanText(message?.incoming_message) ||
      "",
    sender:
      cleanText(message?.sender) ||
      cleanText(message?.sender_name) ||
      cleanText(message?.from) ||
      cleanText(message?.from_number) ||
      "Cliente",
    createdAt:
      message?.createdAt ||
      message?.created_at ||
      message?.timestamp_at ||
      message?.timestamp ||
      null,
  };
}

function normalizeAgentRun(run: any, index: number): AgentRun {
  const decision =
    run?.decision ||
    run?.rawData?.decision ||
    run?.raw_data?.decision ||
    run?.rawData?.agent_decision ||
    run?.raw_data?.agent_decision ||
    {};

  return {
    id: String(run?.id || run?.run_id || `run-${index}`),
    leadId: String(run?.leadId || run?.lead_id || run?.sales_lead_id || ""),
    action: cleanText(run?.action) || cleanText(decision?.action) || "",
    actionStatus:
      cleanText(run?.actionStatus) ||
      cleanText(run?.action_status) ||
      cleanText(decision?.action_status) ||
      "observation_logged",
    leadStage:
      cleanText(run?.leadStage) ||
      cleanText(run?.lead_stage) ||
      cleanText(decision?.lead_stage) ||
      "",
    requiresHuman: Boolean(
      run?.requiresHuman ??
        run?.requires_human ??
        decision?.requires_human ??
        false
    ),
    confidenceScore: clampNumber(
      Number(
        run?.confidenceScore ??
          run?.confidence_score ??
          decision?.confidence_score ??
          80
      ),
      0,
      100
    ),
    decisionReason:
      cleanText(run?.decisionReason) ||
      cleanText(run?.decision_reason) ||
      cleanText(decision?.decision_reason) ||
      "",
    recommendedReply:
      cleanText(run?.recommendedReply) ||
      cleanText(run?.recommended_reply) ||
      cleanText(decision?.recommended_reply) ||
      "",
    agentReply:
      cleanText(run?.agentReply) ||
      cleanText(run?.agent_reply) ||
      cleanText(decision?.agent_reply) ||
      "",
    nextAction:
      cleanText(run?.nextAction) ||
      cleanText(run?.next_action) ||
      cleanText(decision?.next_action) ||
      "",
    agentMode:
      cleanText(run?.agentMode) ||
      cleanText(run?.agent_mode) ||
      cleanText(decision?.agent_mode) ||
      "",
    nextFollowUpAt:
      run?.nextFollowUpAt ||
      run?.next_follow_up_at ||
      run?.next_followup_at ||
      null,
    rawData: run?.rawData || run?.raw_data || run,
    createdAt: run?.createdAt || run?.created_at || null,
  };
}

function normalizeMetrics(raw: any, leads: SalesLead[]): InboxMetrics {
  const openLeads = Number(raw?.openLeads ?? raw?.open_leads ?? leads.length);
  const hotLeads = Number(
    raw?.hotLeads ??
      raw?.hot_leads ??
      leads.filter((lead) => isHotLead(lead)).length
  );
  const qualified = Number(
    raw?.qualified ??
      raw?.qualifiedLeads ??
      raw?.qualified_leads ??
      leads.filter((lead) => lead.isQualified).length
  );
  const readyReplies = Number(
    raw?.readyReplies ??
      raw?.ready_replies ??
      leads.filter((lead) => Boolean(lead.recommendedReply)).length
  );
  const humanRequired = Number(
    raw?.humanRequired ??
      raw?.human_required ??
      leads.filter((lead) => lead.requiresHuman).length
  );
  const pendingLearning = Number(
    raw?.pendingLearning ?? raw?.pending_learning ?? 0
  );

  return {
    openLeads,
    hotLeads,
    qualified,
    readyReplies,
    humanRequired,
    pendingLearning,
    automationMode:
      cleanText(raw?.automationMode) ||
      cleanText(raw?.automation_mode) ||
      "Observación",
    health: clampNumber(Number(raw?.health ?? 0), 0, 100),
  };
}

function buildDisplayMessages(
  lead: SalesLead | null,
  messages: SalesMessage[]
): SalesMessage[] {
  if (!lead) return [];

  if (messages.length) return messages;

  const now = new Date().toISOString();

  const inbound =
    lead.lastMessage ||
    lead.aiSummary ||
    "Hola, me gustaría recibir más información.";

  return [
    {
      id: "fallback-inbound",
      leadId: lead.id,
      direction: "inbound",
      content: inbound,
      sender: lead.name || "Cliente",
      createdAt: lead.lastMessageAt || now,
    },
  ];
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

  const normalizedMode = String(mode || "observation").toLowerCase();
  const whatsappStatus =
    runtimeSettings?.whatsapp_status || "connection_requested";

  const normalizedWhatsappStatus = String(whatsappStatus).toLowerCase();

  const reasons: string[] = [];

  if (normalizedMode !== "supervised" && normalizedMode !== "automatic") {
    reasons.push("Modo de agente en observación");
  }

  if (normalizedWhatsappStatus !== "connected") {
    reasons.push(`WhatsApp: ${labelWhatsappStatus(whatsappStatus)}`);
  }

  if (runtimeSettings?.send_whatsapp_enabled !== true) {
    reasons.push("Envío real por WhatsApp desactivado");
  }

  if (
    normalizedMode === "automatic" &&
    runtimeSettings?.auto_reply_enabled !== true
  ) {
    reasons.push("Auto reply desactivado");
  }

  const actionStatus = String(agentRun?.actionStatus || "").toLowerCase();

  if (actionStatus.includes("sent_whatsapp")) {
    return {
      label: "WhatsApp enviado",
      tone: "safe",
      reasons: ["El último mensaje fue ejecutado correctamente."],
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

  if (normalizedMode === "supervised") {
    return {
      label: "Modo supervisado listo",
      tone: "safe",
      reasons: [
        "El agente puede enviar WhatsApp real solo cuando una persona aprueba la respuesta.",
      ],
      mode,
      whatsappStatus,
    };
  }

  if (normalizedMode === "automatic") {
    return {
      label: "Automatización lista",
      tone: "safe",
      reasons: [
        "El sistema está configurado para respuestas automáticas con candados activos.",
      ],
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

function deriveAiThinkingState({
  lead,
  agentRun,
  suggestedReply,
  loading,
}: {
  lead: SalesLead | null;
  agentRun: AgentRun | null;
  suggestedReply: string;
  loading: boolean;
}) {
  if (loading || !lead) return false;

  const hasRecentInbound = Boolean(lead.lastMessage || lead.lastMessageAt);
  if (!hasRecentInbound) return false;

  const leadTime = lead.lastMessageAt ? new Date(lead.lastMessageAt).getTime() : 0;
  const runTime = agentRun?.createdAt ? new Date(agentRun.createdAt).getTime() : 0;

  if (!agentRun) return true;

  if (leadTime && runTime && runTime + 1200 < leadTime) {
    return true;
  }

  const actionStatus = String(agentRun.actionStatus || "").toLowerCase();

  if (
    !String(suggestedReply || "").trim() &&
    !actionStatus.includes("human") &&
    !actionStatus.includes("paused")
  ) {
    return true;
  }

  return false;
}

function getAgentReply(agentRun: AgentRun | null, lead: SalesLead | null) {
  return (
    agentRun?.agentReply ||
    agentRun?.recommendedReply ||
    lead?.recommendedReply ||
    ""
  );
}

function getLeadPreview(lead: SalesLead) {
  return (
    lead.lastMessage ||
    lead.aiSummary ||
    lead.nextAction ||
    "Conversación detectada por WhatsApp."
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

function labelTemperature(value?: string | null) {
  const temp = String(value || "").toLowerCase();

  if (temp.includes("caliente") || temp.includes("hot")) return "Caliente";
  if (temp.includes("tibio") || temp.includes("warm")) return "Tibio";
  if (temp.includes("frío") || temp.includes("frio") || temp.includes("cold")) {
    return "Frío";
  }

  return value || "Frío";
}

function inferTemperatureFromProbability(value: number) {
  if (value >= 75) return "Caliente";
  if (value >= 45) return "Tibio";
  return "Frío";
}

function labelAgentMode(value?: string | null) {
  const mode = String(value || "observation").toLowerCase();

  if (mode === "automatic") return "Automático";
  if (mode === "paused") return "Pausado";
  if (mode === "supervised") return "Supervisado";

  return "Observación";
}

function labelWhatsappStatus(value?: string | null) {
  const status = String(value || "connection_requested").toLowerCase();

  if (status === "connected") return "Conectado";
  if (status === "connection_requested") return "Conexión solicitada";
  if (status === "pending_verification") return "Pendiente";
  if (status === "disconnected") return "Desconectado";

  return "Conexión solicitada";
}

function formatDateTime(value?: string | null) {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatShortTime(value?: string | null) {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
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
    return `${clean.slice(0, 2)} ${clean.slice(2, 3)} ${clean.slice(
      3,
      6
    )} ${clean.slice(6, 9)} ${clean.slice(9)}`;
  }

  return value || "";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function getInitials(name: string) {
  const words = String(name || "Cometa OS").split(" ").filter(Boolean);
  const first = words[0]?.[0] || "C";
  const second = words[1]?.[0] || "O";

  return `${first}${second}`.toUpperCase();
}

function cleanText(value: any) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function clampNumber(value: number, min: number, max: number) {
  const num = Number(value || 0);

  if (Number.isNaN(num)) return min;

  return Math.max(min, Math.min(max, num));
}

function toBrandSlug(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatBrandNameFromSlug(slug: string) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();

      if (lower === "mkt") return "Mkt";
      if (lower === "ai") return "AI";
      if (lower === "os") return "OS";
      if (lower === "lr") return "LR";

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .trim();
}

function buildInboxSignature(
  leads: SalesLead[],
  messages: SalesMessage[],
  runs: AgentRun[]
) {
  const leadPart = leads
    .map((lead) => `${lead.id}:${lead.lastMessageAt || ""}:${lead.recommendedReply || ""}`)
    .join("|");

  const messagePart = messages
    .slice(-12)
    .map((message) => `${message.id}:${message.createdAt || ""}:${message.direction}`)
    .join("|");

  const runPart = runs
    .slice(-12)
    .map((run) => `${run.id}:${run.createdAt || ""}:${run.agentReply || run.recommendedReply || ""}`)
    .join("|");

  return `${leadPart}::${messagePart}::${runPart}`;
}

type IconName =
  | "chat"
  | "grid"
  | "link"
  | "brain"
  | "spark"
  | "gear"
  | "refresh"
  | "users"
  | "flame"
  | "bot"
  | "target"
  | "sliders"
  | "search"
  | "star"
  | "tag"
  | "dots"
  | "send"
  | "alert"
  | "shield"
  | "file"
  | "calendar";

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
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

  if (name === "grid") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M5 5h5v5H5V5ZM14 5h5v5h-5V5ZM5 14h5v5H5v-5ZM14 14h5v5h-5v-5Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (name === "link") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M9.5 14.5 14.5 9.5M10.5 7.5l1-1a4 4 0 0 1 5.7 5.7l-1 1M13.5 16.5l-1 1a4 4 0 0 1-5.7-5.7l1-1"
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

  if (name === "spark") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M12 2 14.4 9.6 22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z"
          fill="currentColor"
        />
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

  if (name === "users") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M16 11a4 4 0 1 0-8 0"
          stroke="currentColor"
          strokeWidth="2"
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

  if (name === "target") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M12 12h.01"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "sliders") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M4 7h10M18 7h2M4 17h2M10 17h10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M16 5v4M8 15v4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="m21 21-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
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
        <path
          d="M20 13 13 20 4 11V4h7l9 9Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M8 8h.01"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "dots") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M5 12h.01M12 12h.01M19 12h.01"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "send") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
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

  if (name === "file") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M7 3h7l5 5v13H7V3Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M14 3v6h5M10 13h6M10 17h6"
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
        d="M7 3v4M17 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}