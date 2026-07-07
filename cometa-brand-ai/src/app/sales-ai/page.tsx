"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SalesAnalysis = {
  lead_status?: string;
  lead_temperature?: string;
  intent?: string;
  business_type?: string;
  budget_level?: string;
  city?: string | null;
  is_qualified?: boolean;
  qualification_reason?: string;
  main_objection?: string;
  lost_reason?: string | null;
  close_probability?: number;
  ai_summary?: string;
  next_action?: string;
  recommended_reply?: string;
  follow_up_message?: string;
  sales_diagnosis?: string;
  detected_errors?: string[];
  questions_to_ask?: string[];
  tags?: string[];
};

type SalesLead = {
  id: string;
  brand_name: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_username?: string | null;
  source?: string | null;
  lead_status?: string | null;
  lead_temperature?: string | null;
  intent?: string | null;
  business_type?: string | null;
  budget_level?: string | null;
  city?: string | null;
  is_qualified?: boolean | null;
  qualification_reason?: string | null;
  main_objection?: string | null;
  lost_reason?: string | null;
  close_probability?: number | null;
  recommended_reply?: string | null;
  next_action?: string | null;
  ai_summary?: string | null;
  agent_stage?: string | null;
  agent_mode?: string | null;
  requires_human?: boolean | null;
  last_agent_action?: string | null;
  last_agent_reason?: string | null;
  next_follow_up_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type PipelineKey = "new" | "qualifying" | "followup" | "hot" | "human";

type PipelineColumn = {
  key: PipelineKey;
  title: string;
  description: string;
  countTone: "cyan" | "blue" | "yellow" | "orange" | "purple";
  emptyIcon: "inbox" | "flame" | "user";
  leads: SalesLead[];
};

export default function SalesAIPage() {
  const [brandName, setBrandName] = useState("Cometa Mkt");

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [conversationText, setConversationText] = useState("");

  const [analysis, setAnalysis] = useState<SalesAnalysis | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [selectedLead, setSelectedLead] = useState<SalesLead | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(false);

  const [showLab, setShowLab] = useState(false);

  const [runningFollowups, setRunningFollowups] = useState(false);
  const [followupMsg, setFollowupMsg] = useState("");

  const [isInternalMode, setIsInternalMode] = useState(false);

  const activeBrandSlug = useMemo(() => {
    return toBrandSlug(brandName || "Cometa Mkt");
  }, [brandName]);

  const brandQuery = useMemo(() => {
    return `brandSlug=${encodeURIComponent(activeBrandSlug)}`;
  }, [activeBrandSlug]);

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true);

    try {
      const res = await fetch(
        `/api/sales-ai/leads?brandName=${encodeURIComponent(brandName)}`
      );

      const data = await res.json();

      if (data.ok) {
        const nextLeads: SalesLead[] = Array.isArray(data.leads)
          ? data.leads
          : [];

        setLeads(nextLeads);

        setSelectedLead((current) => {
          if (current) {
            const stillExists = nextLeads.find((lead) => lead.id === current.id);

            if (stillExists) return stillExists;
          }

          return nextLeads[0] || null;
        });
      }
    } catch (error) {
      console.error("Error cargando leads:", error);
    } finally {
      setLoadingLeads(false);
    }
  }, [brandName]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const adminParam = params.get("admin");

    if (adminParam === "1") {
      localStorage.setItem("cometa_sales_ai_admin", "true");
      setIsInternalMode(true);
      return;
    }

    if (adminParam === "0") {
      localStorage.removeItem("cometa_sales_ai_admin");
      setIsInternalMode(false);
      return;
    }

    setIsInternalMode(localStorage.getItem("cometa_sales_ai_admin") === "true");
  }, []);

  async function analyzeLead() {
    setLoading(true);
    setErrorMsg("");
    setAnalysis(null);
    setLeadId(null);
    setFollowupMsg("");

    try {
      const finalContactName = contactName || "Cliente WhatsApp";
      const finalContactPhone =
        contactPhone || `52445${Date.now().toString().slice(-7)}`;

      const res = await fetch("/api/sales-ai/simulate-whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandName,
          contactName: finalContactName,
          contactPhone: finalContactPhone,
          incomingMessage: conversationText,
          conversationText: `Cliente (${finalContactName}): ${conversationText}`,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(
          data?.error || "Error al simular conversación con SALES AI"
        );
      }

      const baseAnalysis = data.analysis || {};
      const decision = data.decision || {};

      setAnalysis({
        lead_status: baseAnalysis.lead_status,
        lead_temperature: baseAnalysis.lead_temperature,
        intent: baseAnalysis.intent,
        business_type: baseAnalysis.business_type,
        budget_level: baseAnalysis.budget_level,
        city: baseAnalysis.city,
        is_qualified: baseAnalysis.is_qualified,
        qualification_reason: baseAnalysis.qualification_reason,
        main_objection: baseAnalysis.main_objection,
        lost_reason: baseAnalysis.lost_reason,
        close_probability: baseAnalysis.close_probability,
        ai_summary: baseAnalysis.ai_summary,
        next_action: decision.next_action || baseAnalysis.next_action,
        recommended_reply:
          decision.agent_reply || baseAnalysis.recommended_reply,
        follow_up_message:
          decision.follow_up_message || baseAnalysis.follow_up_message,
        sales_diagnosis:
          decision.decision_reason || baseAnalysis.sales_diagnosis,
        detected_errors: baseAnalysis.detected_errors || [],
        questions_to_ask: baseAnalysis.questions_to_ask || [],
        tags: baseAnalysis.tags || [],
      });

      setLeadId(data.leadId);

      await loadLeads();
    } catch (error: any) {
      setErrorMsg(error.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function runFollowups() {
    setRunningFollowups(true);
    setFollowupMsg("");

    try {
      const res = await fetch("/api/sales-ai/followups/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          force: true,
          limit: 10,
          mode: "simulation",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Error ejecutando follow-ups simulados");
      }

      setFollowupMsg(
        `Follow-ups procesados: ${data.processed || 0}. Fallidos: ${
          data.failed || 0
        }.`
      );

      await loadLeads();
    } catch (error: any) {
      setFollowupMsg(error.message || "Error ejecutando follow-ups");
    } finally {
      setRunningFollowups(false);
    }
  }

  const stats = useMemo(() => {
    const total = leads.length;

    const hot = leads.filter((lead) => isHotLead(lead)).length;
    const human = leads.filter((lead) => needsHumanIntervention(lead)).length;
    const followups = leads.filter((lead) => isFollowUpLead(lead)).length;

    const avgProbability =
      total > 0
        ? Math.round(
            leads.reduce((sum, lead) => sum + (lead.close_probability || 0), 0) /
              total
          )
        : 0;

    return {
      total,
      hot,
      human,
      followups,
      avgProbability,
    };
  }, [leads]);

  const pipeline = useMemo<PipelineColumn[]>(() => {
    const buckets: Record<PipelineKey, SalesLead[]> = {
      new: [],
      qualifying: [],
      followup: [],
      hot: [],
      human: [],
    };

    for (const lead of leads) {
      const stage = getAgentStage(lead);
      buckets[stage].push(lead);
    }

    return [
      {
        key: "new",
        title: "Nuevos",
        description: "Entraron por WhatsApp y el agente los detectó.",
        countTone: "blue",
        emptyIcon: "inbox",
        leads: buckets.new,
      },
      {
        key: "qualifying",
        title: "Calificando",
        description: "SALES AI filtra intención, presupuesto y necesidad.",
        countTone: "cyan",
        emptyIcon: "user",
        leads: buckets.qualifying,
      },
      {
        key: "followup",
        title: "Seguimiento",
        description: "El agente debe volver a contactar si no responden.",
        countTone: "yellow",
        emptyIcon: "inbox",
        leads: buckets.followup,
      },
      {
        key: "hot",
        title: "Calientes",
        description: "Prospectos con mayor probabilidad de cierre.",
        countTone: "orange",
        emptyIcon: "flame",
        leads: buckets.hot,
      },
      {
        key: "human",
        title: "Requiere humano",
        description: "Casos que el agente no debe resolver solo.",
        countTone: "purple",
        emptyIcon: "user",
        leads: buckets.human,
      },
    ];
  }, [leads]);

  const recentAgentActivity = leads.slice(0, 4);

  return (
    <main className="min-h-screen bg-[#f7fafc] text-[#0b1836]">
      <div className="flex min-h-screen">
        <LeftRail
          brandName={brandName}
          isInternalMode={isInternalMode}
          leadCount={stats.total}
        />

        <div className="flex-1 px-5 py-6 lg:px-8 xl:px-10">
          <div className="mx-auto max-w-[1680px]">
            <header className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px] xl:items-start">
              <div className="pt-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#cfeef6] bg-[#effcff] px-4 py-2 text-xs font-extrabold text-[#0798b8] shadow-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#12bfe8]" />
                  COMETA OS · SALES AI AGENT
                </div>

                <h1 className="mt-6 text-5xl font-black tracking-tight text-[#0b1836] md:text-6xl">
                  SALES <span className="text-[#28cbe8]">AI</span>
                </h1>

                <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[#52617a]">
                  Agente 24/7 para atender, calificar, responder, dar
                  seguimiento y detectar oportunidades reales de venta en
                  WhatsApp.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/sales-ai/inbox?${brandQuery}`}
                    className="inline-flex items-center justify-center rounded-2xl bg-[#08a9c6] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(8,169,198,0.22)] transition hover:bg-[#0598b5]"
                  >
                    Abrir Inbox de ventas →
                  </Link>

                  <Link
                    href={`/sales-ai?${brandQuery}&admin=1`}
                    className="inline-flex items-center justify-center rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3 text-sm font-black text-[#324159] shadow-sm transition hover:bg-[#f8fbff]"
                  >
                    Modo interno
                  </Link>
                </div>
              </div>

              <BrandCard
                brandName={brandName}
                setBrandName={setBrandName}
                isInternalMode={isInternalMode}
              />
            </header>

            <section className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                icon="users"
                label="Leads atendidos"
                value={stats.total}
                helper="Conversaciones procesadas por SALES AI"
                tone="blue"
              />
              <KpiCard
                icon="pulse"
                label="Seguimientos"
                value={stats.followups}
                helper="Leads con próxima interacción"
                tone="green"
              />
              <KpiCard
                icon="flame"
                label="Prospectos calientes"
                value={stats.hot}
                helper="Alta probabilidad de avance"
                tone="orange"
              />
              <KpiCard
                icon="user"
                label="Requiere humano"
                value={stats.human}
                helper="Casos que el agente debe escalar"
                tone="purple"
              />
              <KpiCard
                icon="chart"
                label="Prob. promedio"
                value={`${stats.avgProbability}%`}
                helper="Cierre estimado por SALES AI"
                tone="cyan"
              />
            </section>

            <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_390px]">
              <div className="space-y-6">
                <div className="rounded-[28px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Icon
                          name="pipeline"
                          className="h-5 w-5 text-[#10aeca]"
                        />
                        <p className="text-xs font-black tracking-wide text-[#0b9fbd]">
                          PIPELINE AUTOMÁTICO
                        </p>
                      </div>

                      <p className="mt-2 text-sm leading-relaxed text-[#60708a]">
                        Estas etapas no se operan manualmente. SALES AI
                        clasifica los prospectos según intención, objeción,
                        etapa y probabilidad de cierre.
                      </p>
                    </div>

                    <button
                      onClick={loadLeads}
                      disabled={loadingLeads}
                      className="rounded-2xl border border-[#dbe6f0] bg-white px-5 py-3 text-sm font-black text-[#0b1836] shadow-sm transition hover:border-[#b8d7e4] hover:bg-[#f8fcff] disabled:opacity-50"
                    >
                      {loadingLeads ? "Actualizando..." : "Actualizar agente"}
                    </button>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
                    {pipeline.map((column) => (
                      <PipelineColumnCard
                        key={column.key}
                        column={column}
                        selectedLeadId={selectedLead?.id}
                        onSelectLead={setSelectedLead}
                      />
                    ))}
                  </div>
                </div>

                <div
                  className={`grid grid-cols-1 gap-6 ${
                    isInternalMode
                      ? "xl:grid-cols-[1fr_1fr_0.72fr]"
                      : "xl:grid-cols-2"
                  }`}
                >
                  <RecentActivityCard
                    leads={recentAgentActivity}
                    onSelectLead={setSelectedLead}
                  />

                  <AutomationCard
                    runningFollowups={runningFollowups}
                    followupMsg={followupMsg}
                    onRunFollowups={runFollowups}
                    isInternalMode={isInternalMode}
                  />

                  {isInternalMode && (
                    <LabPreviewCard
                      showLab={showLab}
                      setShowLab={setShowLab}
                    />
                  )}
                </div>

                {isInternalMode && (
                  <LabPanel
                    showLab={showLab}
                    contactName={contactName}
                    setContactName={setContactName}
                    contactPhone={contactPhone}
                    setContactPhone={setContactPhone}
                    conversationText={conversationText}
                    setConversationText={setConversationText}
                    errorMsg={errorMsg}
                    loading={loading}
                    brandName={brandName}
                    analysis={analysis}
                    leadId={leadId}
                    onAnalyzeLead={analyzeLead}
                  />
                )}
              </div>

              <LeadDetailPanel
                lead={selectedLead}
                isInternalMode={isInternalMode}
              />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function LeftRail({
  brandName,
  isInternalMode,
  leadCount,
}: {
  brandName: string;
  isInternalMode: boolean;
  leadCount: number;
}) {
  const pathname = usePathname();
  const brandSlug = toBrandSlug(brandName || "Cometa Mkt");
  const brandQuery = `brandSlug=${encodeURIComponent(brandSlug)}`;

  const navItems: {
    label: string;
    helper: string;
    href: string;
    match: string;
    exact?: boolean;
    icon: IconName;
    badge?: string;
  }[] = [
    {
      label: "Sales AI",
      helper: "Dashboard",
      href: `/sales-ai?${brandQuery}`,
      match: "/sales-ai",
      exact: true,
      icon: "home",
    },
    {
      label: "Inbox",
      helper: "Conversaciones",
      href: `/sales-ai/inbox?${brandQuery}`,
      match: "/sales-ai/inbox",
      icon: "chat",
      badge: String(leadCount || 0),
    },
    {
      label: "Conexión",
      helper: "WhatsApp",
      href: `/sales-ai/connect?${brandQuery}`,
      match: "/sales-ai/connect",
      icon: "pipeline",
    },
    {
      label: "Knowledge",
      helper: "Memoria comercial",
      href: `/sales-ai/knowledge?${brandQuery}`,
      match: "/sales-ai/knowledge",
      icon: "inbox",
    },
    {
      label: "Learning",
      helper: "Mejoras IA",
      href: `/sales-ai/learning?${brandQuery}`,
      match: "/sales-ai/learning",
      icon: "flask",
    },
    {
      label: "Configuración",
      helper: "Agente",
      href: `/sales-ai/agent-settings?brandName=${encodeURIComponent(
        brandName || "Cometa Mkt"
      )}`,
      match: "/sales-ai/agent-settings",
      icon: "settings",
    },
  ];

  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-[300px] shrink-0 overflow-hidden border-r border-[#12345d] bg-[#071b3a] text-white shadow-[12px_0_34px_rgba(7,27,58,0.16)] lg:flex lg:flex-col">
      <div className="relative flex min-h-[178px] items-center gap-5 border-b border-white/10 px-6">
        <div className="flex h-[74px] w-[74px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-white/10 shadow-[0_16px_34px_rgba(0,0,0,0.18)]">
          <Image
            src="/logo.png"
            alt="Cometa OS"
            width={64}
            height={64}
            priority
            className="h-[58px] w-[58px] object-contain"
          />
        </div>

        <div className="min-w-0">
          <p className="text-[34px] font-black uppercase leading-[0.9] tracking-tight">
            COMETA
            <br />
            OS
          </p>
          <p className="mt-3 text-sm font-black uppercase tracking-[0.42em] text-[#38dff7]">
            SALES AI
          </p>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#38dff7]/40 to-transparent" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-5 pb-3 pt-7">
          <p className="px-1 text-xs font-black uppercase tracking-[0.38em] text-white/46">
            Operación
          </p>
        </div>

        <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-5">
          {navItems.map((item) => {
            const active = item.exact
              ? pathname === item.match
              : pathname.startsWith(item.match);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex min-h-[82px] items-center gap-4 rounded-[24px] px-4 transition ${
                  active
                    ? "bg-gradient-to-r from-[#14bdd4] to-[#2f6df6] text-white shadow-[0_18px_40px_rgba(20,189,212,0.26)]"
                    : "bg-white/[0.055] text-white/82 hover:bg-white/[0.095] hover:text-white"
                }`}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] ${
                    active
                      ? "bg-white/16 text-white"
                      : "bg-white/8 text-[#7deeff] group-hover:bg-white/12"
                  }`}
                >
                  <Icon name={item.icon} className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-black leading-tight">
                      {item.label}
                    </p>

                    {item.badge ? (
                      <span
                        className={`ml-auto flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${
                          active
                            ? "bg-white/16 text-white"
                            : "bg-[#2563eb] text-white"
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </div>

                  <p
                    className={`mt-1 truncate text-xs font-black ${
                      active ? "text-white/72" : "text-white/46"
                    }`}
                  >
                    {item.helper}
                  </p>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-[24px] border border-white/10 bg-white/[0.065] p-4 shadow-[0_18px_36px_rgba(0,0,0,0.16)]">
          <div className="flex items-center gap-3">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white">
              <Image
                src="/logo.png"
                alt="Cometa OS"
                width={48}
                height={48}
                className="h-11 w-11 object-contain"
              />
              <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#22c55e]" />
            </div>

            <div className="min-w-0">
              <p className="truncate text-base font-black text-white">
                {brandName || "Cometa Mkt"}
              </p>
              <p className="truncate text-xs font-black text-white/50">
                Workspace activo
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#04142c] px-4 py-3">
            <span className="text-xs font-black text-white/52">Sistema</span>
            <span className="inline-flex items-center gap-2 text-xs font-black text-[#38f59b]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#38f59b]" />
              Online
            </span>
          </div>

          <Link
            href={
              isInternalMode
                ? `/sales-ai?${brandQuery}&admin=0`
                : `/sales-ai?${brandQuery}&admin=1`
            }
            className="mt-3 flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-xs font-black text-white/76 transition hover:bg-white/[0.1] hover:text-white"
          >
            {isInternalMode ? "Salir de modo interno" : "Modo interno"}
          </Link>
        </div>
      </div>
    </aside>
  );
}

function BrandCard({
  brandName,
  setBrandName,
  isInternalMode,
}: {
  brandName: string;
  setBrandName: (value: string) => void;
  isInternalMode: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div className="w-full">
          <p className="text-sm font-semibold text-[#76849a]">Marca activa</p>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className="mt-2 w-full bg-transparent text-2xl font-black text-[#0b1836] outline-none"
          />
        </div>

        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#e1eaf3] bg-white shadow-sm">
          <Image
            src="/logo.png"
            alt="Cometa OS"
            width={42}
            height={42}
            className="h-10 w-10 object-contain"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatusMini label="Estado" value="Activo 24/7" tone="green" />
        <StatusMini
          label="Modo"
          value={isInternalMode ? "Interno" : "Supervisado"}
          tone="dark"
        />
      </div>
    </div>
  );
}

function StatusMini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "dark";
}) {
  return (
    <div className="rounded-2xl border border-[#e1eaf3] bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-wide text-[#8a98ad]">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-black ${
          tone === "green" ? "text-[#00b978]" : "text-[#0b1836]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string | number;
  helper: string;
  tone: "blue" | "green" | "orange" | "purple" | "cyan";
}) {
  const toneMap = {
    blue: "bg-[#eef7ff] text-[#1677ff]",
    green: "bg-[#ecfbf3] text-[#00a86b]",
    orange: "bg-[#fff4e8] text-[#f97316]",
    purple: "bg-[#f5f0ff] text-[#7c3aed]",
    cyan: "bg-[#eafbff] text-[#0ea5c6]",
  };

  return (
    <div className="rounded-[22px] border border-[#dfe8f3] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${toneMap[tone]}`}
        >
          <Icon name={icon} className="h-6 w-6" />
        </div>

        <div>
          <p className="text-sm font-semibold text-[#66758d]">{label}</p>
          <p className="mt-1 text-3xl font-black text-[#0b1836]">{value}</p>
          <p className="mt-1 text-[11px] font-medium text-[#7c8ba2]">
            {helper}
          </p>
        </div>
      </div>
    </div>
  );
}

function PipelineColumnCard({
  column,
  selectedLeadId,
  onSelectLead,
}: {
  column: PipelineColumn;
  selectedLeadId?: string | null;
  onSelectLead: (lead: SalesLead) => void;
}) {
  const countToneMap = {
    cyan: "bg-[#dffbff] text-[#0099b8]",
    blue: "bg-[#e8f4ff] text-[#1677ff]",
    yellow: "bg-[#fff6d7] text-[#aa7b00]",
    orange: "bg-[#fff0df] text-[#f97316]",
    purple: "bg-[#f2ebff] text-[#7c3aed]",
  };

  return (
    <div className="rounded-[22px] border border-[#dfe8f3] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-[#0b1836]">{column.title}</h3>
          <p className="mt-2 text-xs leading-relaxed text-[#718199]">
            {column.description}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            countToneMap[column.countTone]
          }`}
        >
          {column.leads.length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {!column.leads.length && (
          <div className="flex min-h-[144px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#d7e2ee] bg-[#fbfdff] p-5 text-center">
            <Icon
              name={column.emptyIcon}
              className="h-6 w-6 text-[#6d7d95]"
            />
            <p className="mt-3 text-sm font-medium text-[#738198]">
              Sin leads en esta etapa.
            </p>
          </div>
        )}

        {column.leads.slice(0, 4).map((lead) => (
          <button
            key={lead.id}
            onClick={() => onSelectLead(lead)}
            className={`w-full rounded-2xl border p-3 text-left transition ${
              selectedLeadId === lead.id
                ? "border-[#7ae7f5] bg-[#effcff] shadow-sm"
                : "border-[#e2eaf3] bg-white hover:border-[#bdeaf2] hover:bg-[#fbfeff]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={lead.contact_name} />

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#0b1836]">
                    {lead.contact_name || "Lead sin nombre"}
                  </p>
                  <p className="truncate text-xs font-medium text-[#78889e]">
                    {lead.contact_phone || lead.source || "Sin contacto"}
                  </p>
                </div>
              </div>

              <span className="rounded-full bg-[#dff8fb] px-2.5 py-1 text-xs font-black text-[#078aa6]">
                {lead.close_probability ?? 0}%
              </span>
            </div>

            <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[#65758d]">
              {lead.next_action || "SALES AI está evaluando el siguiente paso."}
            </p>
          </button>
        ))}

        {column.leads.length > 4 && (
          <button className="w-full py-2 text-xs font-black text-[#0aa6c4]">
            Ver todos ({column.leads.length})
          </button>
        )}
      </div>
    </div>
  );
}

function LeadDetailPanel({
  lead,
  isInternalMode,
}: {
  lead: SalesLead | null;
  isInternalMode: boolean;
}) {
  if (!lead) {
    return (
      <aside className="rounded-[28px] border border-dashed border-[#d6e2ee] bg-white p-8 text-center text-[#7a8aa2] shadow-sm xl:sticky xl:top-6">
        Selecciona un lead para ver la auditoría del agente.
      </aside>
    );
  }

  const stage = getAgentStage(lead);

  return (
    <aside className="rounded-[28px] border border-[#dfe8f3] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] xl:sticky xl:top-6 xl:h-fit">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={lead.contact_name} size="lg" />

          <div className="min-w-0">
            <h3 className="text-2xl font-black leading-tight text-[#0b1836]">
              {lead.contact_name || "Lead sin nombre"}
            </h3>
            <p className="mt-1 text-sm font-semibold text-[#718199]">
              {lead.contact_phone || lead.source || "Sin contacto"}
            </p>
          </div>
        </div>

        <button className="rounded-full p-2 text-[#8ea0b8] hover:bg-[#f3f7fb]">
          ×
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-[#cceff6] bg-[#effcff] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-[#6f829b]">
              Etapa asignada por SALES AI
            </p>
            <p className="mt-1 text-sm font-black text-[#0587a2]">
              {translateStage(stage)}
            </p>
          </div>

          <Icon name="calendar" className="h-5 w-5 text-[#0aa6c4]" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <LeadMetric label="Intención" value={lead.intent || "N/A"} />
        <LeadMetric label="Objeción" value={lead.main_objection || "N/A"} />
        <LeadMetric label="Cierre" value={`${lead.close_probability ?? 0}%`} />
        <LeadMetric label="Estado" value={lead.lead_status || "N/A"} />
      </div>

      <div className="mt-4 space-y-3">
        <InfoCard title="Decisión del agente">
          {lead.next_action || "Sin acción determinada."}
        </InfoCard>

        <InfoCard title="Respuesta que usará SALES AI" highlighted>
          {lead.recommended_reply || "Sin respuesta recomendada."}
        </InfoCard>

        <InfoCard title="Resumen comercial">
          {lead.ai_summary ||
            lead.qualification_reason ||
            "Sin resumen disponible."}
        </InfoCard>

        <InfoCard title="Estado de autonomía">
          {isInternalMode
            ? "Vista interna activa. SALES AI opera en modo simulación: responde, programa follow-ups y ejecuta seguimiento sin mandar WhatsApp real."
            : "SALES AI registra cada decisión comercial, respuesta y seguimiento para que el equipo pueda supervisar la atención sin operar manualmente cada conversación."}
        </InfoCard>

        <Link
          href={`/sales-ai/inbox?brandSlug=${encodeURIComponent(
            toBrandSlug(lead.brand_name || "Cometa Mkt")
          )}`}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#dfe8f3] bg-white px-4 py-3 text-sm font-black text-[#324159] transition hover:bg-[#f8fbff]"
        >
          <Icon name="chat" className="h-4 w-4" />
          Ver conversación completa
        </Link>
      </div>
    </aside>
  );
}

function RecentActivityCard({
  leads,
  onSelectLead,
}: {
  leads: SalesLead[];
  onSelectLead: (lead: SalesLead) => void;
}) {
  return (
    <div className="rounded-[26px] border border-[#dfe8f3] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black text-[#0aa6c4]">
            ACTIVIDAD DEL AGENTE
          </p>
          <h3 className="mt-1 text-2xl font-black text-[#0b1836]">
            Últimas decisiones
          </h3>
        </div>

        <span className="rounded-full border border-[#c8f5e3] bg-[#ecfff7] px-3 py-1 text-xs font-black text-[#00a86b]">
          Monitoreando
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {!leads.length && (
          <div className="rounded-2xl border border-dashed border-[#d7e2ee] bg-[#fbfdff] p-6 text-center text-sm text-[#718199]">
            Aún no hay actividad del agente.
          </div>
        )}

        {leads.map((lead) => (
          <button
            key={lead.id}
            onClick={() => onSelectLead(lead)}
            className="w-full rounded-2xl border border-[#e1eaf3] bg-white p-4 text-left transition hover:border-[#bdeaf2] hover:bg-[#fbfeff]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-[#0b1836]">
                  {lead.contact_name || "Lead sin nombre"}
                </p>
                <p className="mt-1 text-xs font-medium text-[#7b8ca3]">
                  {formatDate(lead.created_at)}
                </p>
              </div>

              <TemperatureBadge value={lead.lead_temperature || "unknown"} />
            </div>

            <p className="mt-3 text-sm leading-relaxed text-[#52617a]">
              {lead.next_action || "SALES AI está evaluando el lead."}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function AutomationCard({
  runningFollowups,
  followupMsg,
  onRunFollowups,
  isInternalMode,
}: {
  runningFollowups: boolean;
  followupMsg: string;
  onRunFollowups: () => void;
  isInternalMode: boolean;
}) {
  return (
    <div className="rounded-[26px] border border-[#dfe8f3] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black text-[#718199]">
            MODO DE AUTOMATIZACIÓN
          </p>
          <h3 className="mt-1 text-2xl font-black text-[#0b1836]">
            {isInternalMode ? "Simulación segura" : "Motor de ventas activo"}
          </h3>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-black ${
            isInternalMode
              ? "border-[#ffe7a6] bg-[#fff7dc] text-[#9a7200]"
              : "border-[#c8f5e3] bg-[#ecfff7] text-[#00a86b]"
          }`}
        >
          {isInternalMode ? "WhatsApp real OFF" : "Supervisado"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[#60708a]">
        {isInternalMode
          ? "El agente simula conversaciones completas: recibe el mensaje, responde, programa seguimiento y ejecuta follow-ups sin mandar WhatsApp real."
          : "SALES AI atiende conversaciones, clasifica prospectos, prepara respuestas, programa seguimientos y deja trazabilidad comercial para el equipo."}
      </p>

      <div className="mt-4 space-y-3">
        <AutomationStep
          number={1}
          title="Recibir mensaje"
          description={
            isInternalMode
              ? "Webhook o laboratorio simula el texto del prospecto."
              : "El prospecto entra desde WhatsApp o canales conectados."
          }
          active
        />
        <AutomationStep
          number={2}
          title="Analizar intención"
          description="SALES AI detecta necesidad, objeción y etapa."
          active
        />
        <AutomationStep
          number={3}
          title="Decidir acción"
          description="Agent Runner responde, espera, sigue o escala."
          active
        />
        <AutomationStep
          number={4}
          title="Ejecutar seguimiento"
          description="El motor procesa follow-ups pendientes."
          active
        />
        <AutomationStep
          number={5}
          title="Activar WhatsApp real"
          description="Se conecta desde configuración cuando la cuenta esté lista."
        />
      </div>

      {isInternalMode ? (
        <>
          <button
            onClick={onRunFollowups}
            disabled={runningFollowups}
            className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#08a9c6] px-5 py-4 text-sm font-black text-white shadow-[0_12px_28px_rgba(8,169,198,0.22)] transition hover:bg-[#0598b5] disabled:opacity-50"
          >
            <span>▶</span>
            {runningFollowups
              ? "Ejecutando follow-ups..."
              : "Ejecutar follow-ups simulados"}
          </button>

          {followupMsg && (
            <div className="mt-3 rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] p-3 text-sm font-semibold text-[#52617a]">
              {followupMsg}
            </div>
          )}
        </>
      ) : (
        <div className="mt-5 rounded-2xl border border-[#dfe8f3] bg-[#f8fbff] p-4">
          <p className="text-sm font-black text-[#0b1836]">
            SALES AI está trabajando en modo supervisado.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#718199]">
            Las herramientas internas de prueba están ocultas para mantener una
            experiencia limpia para el cliente.
          </p>
        </div>
      )}
    </div>
  );
}

function LabPreviewCard({
  showLab,
  setShowLab,
}: {
  showLab: boolean;
  setShowLab: (value: boolean) => void;
}) {
  return (
    <div className="rounded-[26px] border border-[#dfe8f3] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex h-full flex-col justify-between gap-5">
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eafbff] text-[#0aa6c4]">
            <Icon name="flask" className="h-6 w-6" />
          </div>

          <p className="mt-6 text-xs font-black uppercase tracking-wide text-[#718199]">
            Herramienta interna
          </p>
          <h3 className="mt-2 text-2xl font-black text-[#0b1836]">
            Laboratorio de prueba
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-[#60708a]">
            Simula WhatsApp completo: lead, mensaje, respuesta, agent run y
            follow-up.
          </p>
        </div>

        <button
          onClick={() => setShowLab(!showLab)}
          className="rounded-2xl border border-[#dfe8f3] bg-white px-5 py-3 text-sm font-black text-[#324159] transition hover:bg-[#f8fbff]"
        >
          {showLab ? "Cerrar laboratorio" : "Abrir laboratorio"} ↗
        </button>
      </div>
    </div>
  );
}

function LabPanel({
  showLab,
  contactName,
  setContactName,
  contactPhone,
  setContactPhone,
  conversationText,
  setConversationText,
  errorMsg,
  loading,
  brandName,
  analysis,
  leadId,
  onAnalyzeLead,
}: {
  showLab: boolean;
  contactName: string;
  setContactName: (value: string) => void;
  contactPhone: string;
  setContactPhone: (value: string) => void;
  conversationText: string;
  setConversationText: (value: string) => void;
  errorMsg: string;
  loading: boolean;
  brandName: string;
  analysis: SalesAnalysis | null;
  leadId: string | null;
  onAnalyzeLead: () => void;
}) {
  if (!showLab) return null;

  return (
    <div className="rounded-[28px] border border-[#dfe8f3] bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-wide text-[#718199]">
          Herramienta interna
        </p>
        <h3 className="mt-1 text-2xl font-black text-[#0b1836]">
          Laboratorio de prueba
        </h3>
        <p className="mt-2 text-sm text-[#60708a]">
          Marca activa: <strong>{brandName}</strong>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-bold text-[#52617a]">
              Nombre del contacto
            </label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#dfe8f3] bg-white px-4 py-3 text-sm font-semibold text-[#0b1836] outline-none transition focus:border-[#20c6df] focus:ring-4 focus:ring-[#dff8ff]"
              placeholder="Ej. Cliente WhatsApp"
            />
          </div>

          <div>
            <label className="text-sm font-bold text-[#52617a]">
              WhatsApp del contacto
            </label>
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#dfe8f3] bg-white px-4 py-3 text-sm font-semibold text-[#0b1836] outline-none transition focus:border-[#20c6df] focus:ring-4 focus:ring-[#dff8ff]"
              placeholder="Ej. 524451234567"
            />
          </div>

          <div>
            <label className="text-sm font-bold text-[#52617a]">
              Mensaje del prospecto
            </label>
            <textarea
              value={conversationText}
              onChange={(e) => setConversationText(e.target.value)}
              className="mt-2 min-h-[220px] w-full rounded-2xl border border-[#dfe8f3] bg-white px-4 py-3 text-sm font-semibold leading-relaxed text-[#0b1836] outline-none transition focus:border-[#20c6df] focus:ring-4 focus:ring-[#dff8ff]"
              placeholder="Hola, me interesa saber precios de Cometa OS y cómo me puede ayudar con WhatsApp, pero lo revisaría con mi socio."
            />
          </div>

          {errorMsg && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {errorMsg}
            </div>
          )}

          <button
            onClick={onAnalyzeLead}
            disabled={loading || !brandName || !conversationText}
            className="w-full rounded-2xl bg-[#08a9c6] px-5 py-4 text-sm font-black text-white shadow-[0_12px_28px_rgba(8,169,198,0.22)] transition hover:bg-[#0598b5] disabled:bg-[#b9c7d6]"
          >
            {loading
              ? "Simulando conversación..."
              : "Simular WhatsApp con SALES AI"}
          </button>
        </div>

        <div className="rounded-3xl border border-[#dfe8f3] bg-[#fbfdff] p-5">
          {!analysis && (
            <div className="flex min-h-[340px] items-center justify-center text-center text-sm font-semibold text-[#7a8aa2]">
              Ejecuta una simulación para ver el diagnóstico del agente.
            </div>
          )}

          {analysis && (
            <div className="space-y-4">
              {leadId && (
                <p className="text-xs font-semibold text-[#7a8aa2]">
                  Lead guardado: {leadId}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <LeadMetric
                  label="Temperatura"
                  value={translateTemperature(
                    analysis.lead_temperature || "unknown"
                  )}
                />
                <LeadMetric
                  label="Cierre"
                  value={`${analysis.close_probability ?? 0}%`}
                />
                <LeadMetric label="Intención" value={analysis.intent || "N/A"} />
                <LeadMetric
                  label="Objeción"
                  value={analysis.main_objection || "N/A"}
                />
              </div>

              <InfoCard title="Decisión del agente">
                {analysis.next_action}
              </InfoCard>

              <InfoCard title="Respuesta generada" highlighted>
                {analysis.recommended_reply}
              </InfoCard>

              <InfoCard title="Follow-up programado">
                {analysis.follow_up_message ||
                  "No se generó seguimiento para esta conversación."}
              </InfoCard>

              <InfoCard title="Razón comercial">
                {analysis.sales_diagnosis}
              </InfoCard>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AutomationStep({
  number,
  title,
  description,
  active,
}: {
  number: number;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-3">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${
          active ? "bg-[#38d5c8] text-white" : "bg-[#d5deea] text-[#63748b]"
        }`}
      >
        {number}
      </div>

      <div>
        <p className="text-sm font-black text-[#0b1836]">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#718199]">
          {description}
        </p>
      </div>
    </div>
  );
}

function Avatar({
  name,
  size = "md",
}: {
  name?: string | null;
  size?: "md" | "lg";
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#b7f4ef] font-black text-[#0b5262] ${
        size === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-xs"
      }`}
    >
      {getInitials(name)}
    </div>
  );
}

function LeadMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#dfe8f3] bg-white p-4">
      <p className="text-[10px] font-black uppercase tracking-wide text-[#8a98ad]">
        {label}
      </p>
      <p className="mt-2 text-sm font-black text-[#0b1836]">{value}</p>
    </div>
  );
}

function InfoCard({
  title,
  children,
  highlighted,
}: {
  title: string;
  children?: ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlighted
          ? "border-[#bdeef7] bg-[#effcff]"
          : "border-[#dfe8f3] bg-white"
      }`}
    >
      <p
        className={`mb-2 text-xs font-black uppercase tracking-wide ${
          highlighted ? "text-[#0b9fbd]" : "text-[#52617a]"
        }`}
      >
        {title}
      </p>
      <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-[#26354d]">
        {children || "Sin información detectada."}
      </p>
    </div>
  );
}

function TemperatureBadge({ value }: { value: string }) {
  const normalized = String(value || "unknown").toLowerCase();

  const labelMap: Record<string, string> = {
    hot: "Caliente",
    caliente: "Caliente",
    warm: "Tibio",
    tibio: "Tibio",
    cold: "Frío",
    frio: "Frío",
    frío: "Frío",
    unknown: "Desconocido",
  };

  const classMap: Record<string, string> = {
    hot: "bg-[#ecfff7] text-[#00a86b] border-[#bff2dd]",
    caliente: "bg-[#ecfff7] text-[#00a86b] border-[#bff2dd]",
    warm: "bg-[#fff7dc] text-[#987000] border-[#ffe6a0]",
    tibio: "bg-[#fff7dc] text-[#987000] border-[#ffe6a0]",
    cold: "bg-[#eef7ff] text-[#1677ff] border-[#cfe6ff]",
    frio: "bg-[#eef7ff] text-[#1677ff] border-[#cfe6ff]",
    frío: "bg-[#eef7ff] text-[#1677ff] border-[#cfe6ff]",
    unknown: "bg-[#f3f6fa] text-[#66758d] border-[#dfe8f3]",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
        classMap[normalized] || classMap.unknown
      }`}
    >
      {labelMap[normalized] || value}
    </span>
  );
}

function getAgentStage(lead: SalesLead): PipelineKey {
  const agentStage = String(lead.agent_stage || "").toLowerCase();

  if (agentStage === "human_required") return "human";
  if (agentStage === "hot") return "hot";

  if (
    agentStage === "followup_scheduled" ||
    agentStage === "waiting_response" ||
    agentStage === "followup_sent"
  ) {
    return "followup";
  }

  if (agentStage === "qualifying") return "qualifying";
  if (agentStage === "new") return "new";

  if (needsHumanIntervention(lead)) return "human";
  if (isHotLead(lead)) return "hot";
  if (isFollowUpLead(lead)) return "followup";

  const intent = String(lead.intent || "").toLowerCase();
  const status = String(lead.lead_status || "").toLowerCase();

  if (
    intent === "catalogo" ||
    intent === "catálogo" ||
    intent === "precio" ||
    intent === "mayoreo" ||
    status === "contacted" ||
    status === "qualified"
  ) {
    return "qualifying";
  }

  return "new";
}

function needsHumanIntervention(lead: SalesLead) {
  const objection = String(lead.main_objection || "").toLowerCase();
  const status = String(lead.lead_status || "").toLowerCase();
  const agentStage = String(lead.agent_stage || "").toLowerCase();

  return (
    lead.requires_human === true ||
    agentStage === "human_required" ||
    status === "escalated" ||
    objection === "envio" ||
    objection === "envío" ||
    objection === "confianza" ||
    objection === "pedido_minimo" ||
    objection === "pedido mínimo" ||
    objection === "otra"
  );
}

function isHotLead(lead: SalesLead) {
  const temperature = String(lead.lead_temperature || "").toLowerCase();

  return (
    temperature === "hot" ||
    temperature === "caliente" ||
    (lead.close_probability || 0) >= 60
  );
}

function isFollowUpLead(lead: SalesLead) {
  const status = String(lead.lead_status || "").toLowerCase();
  const objection = String(lead.main_objection || "").toLowerCase();
  const agentStage = String(lead.agent_stage || "").toLowerCase();
  const nextAction = String(lead.next_action || "").toLowerCase();

  return (
    status === "follow_up" ||
    agentStage === "followup_scheduled" ||
    agentStage === "waiting_response" ||
    agentStage === "followup_sent" ||
    objection === "no_responde" ||
    objection === "falta_de_urgencia" ||
    objection === "comparando" ||
    nextAction.includes("seguimiento") ||
    nextAction.includes("esperar respuesta")
  );
}

function translateStage(stage: PipelineKey) {
  const labels: Record<PipelineKey, string> = {
    new: "Nuevo lead",
    qualifying: "Calificación automática",
    followup: "Seguimiento programable",
    hot: "Prospecto caliente",
    human: "Requiere intervención humana",
  };

  return labels[stage];
}

function translateTemperature(value: string) {
  const normalized = String(value || "unknown").toLowerCase();

  const labels: Record<string, string> = {
    hot: "Caliente",
    caliente: "Caliente",
    warm: "Tibio",
    tibio: "Tibio",
    cold: "Frío",
    frio: "Frío",
    frío: "Frío",
    unknown: "Desconocido",
  };

  return labels[normalized] || value;
}

function getInitials(name?: string | null) {
  if (!name) return "AI";

  const parts = name.trim().split(" ").filter(Boolean);

  if (parts.length === 0) return "AI";

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function toBrandSlug(value: string) {
  return String(value || "cometa-mkt")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(date?: string) {
  if (!date) return "N/A";

  try {
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return "N/A";
  }
}

type IconName =
  | "planet"
  | "home"
  | "users"
  | "chat"
  | "chart"
  | "settings"
  | "flask"
  | "pulse"
  | "flame"
  | "user"
  | "pipeline"
  | "calendar"
  | "inbox";

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
        <path
          d="M12 10c2.4 2.2 5 5 6.4 9.8"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.5Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
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
        <path
          d="M18 10c1.7.2 3 1.6 3 3.4M6 10c-1.7.2-3 1.6-3 3.4"
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

  if (name === "settings") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M19 12a7.5 7.5 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14 3h-4l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2L10 21h4l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.2-.8.2-1.2Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "flask") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 15h8" stroke="currentColor" strokeWidth="2" />
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

  if (name === "pipeline") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <path
          d="M5 7h14M5 12h10M5 17h7"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <path
          d="M4 5.5h2v3H4v-3ZM4 10.5h2v3H4v-3ZM4 15.5h2v3H4v-3Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (name === "calendar") {
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

  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M5 7h14v12H5V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M8 7V5h8v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}