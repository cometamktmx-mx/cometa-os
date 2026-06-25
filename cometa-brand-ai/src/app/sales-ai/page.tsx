"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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
};

type PipelineKey =
  | "new"
  | "qualifying"
  | "followup"
  | "hot"
  | "human";

type PipelineColumn = {
  key: PipelineKey;
  title: string;
  description: string;
  accent: string;
  leads: SalesLead[];
};

export default function SalesAIPage() {
  const [brandName, setBrandName] = useState("Mar Cosmetic");
  const [contactName, setContactName] = useState("");
  const [conversationText, setConversationText] = useState("");
  const [analysis, setAnalysis] = useState<SalesAnalysis | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [selectedLead, setSelectedLead] = useState<SalesLead | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [showLab, setShowLab] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true);

    try {
      const res = await fetch(
        `/api/sales-ai/leads?brandName=${encodeURIComponent(brandName)}`
      );

      const data = await res.json();

      if (data.ok) {
        const nextLeads = data.leads || [];
        setLeads(nextLeads);

        setSelectedLead((current) => {
          if (current) {
            const stillExists = nextLeads.find(
              (lead: SalesLead) => lead.id === current.id
            );

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

  async function analyzeLead() {
    setLoading(true);
    setErrorMsg("");
    setAnalysis(null);
    setLeadId(null);

    try {
      const res = await fetch("/api/sales-ai/analyze-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandName,
          contactName,
          conversationText,
          source: "whatsapp",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Error al analizar conversación");
      }

      setAnalysis(data.analysis);
      setLeadId(data.leadId);

      await loadLeads();
    } catch (error: any) {
      setErrorMsg(error.message || "Error desconocido");
    } finally {
      setLoading(false);
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
        accent: "border-cyan-300/30 bg-cyan-300/[0.04]",
        leads: buckets.new,
      },
      {
        key: "qualifying",
        title: "Calificando",
        description: "SALES AI está filtrando intención y presupuesto.",
        accent: "border-blue-300/30 bg-blue-300/[0.04]",
        leads: buckets.qualifying,
      },
      {
        key: "followup",
        title: "Seguimiento",
        description: "El agente debe volver a contactar si no responden.",
        accent: "border-yellow-300/30 bg-yellow-300/[0.04]",
        leads: buckets.followup,
      },
      {
        key: "hot",
        title: "Calientes",
        description: "Prospectos con mayor probabilidad de cierre.",
        accent: "border-emerald-300/30 bg-emerald-300/[0.04]",
        leads: buckets.hot,
      },
      {
        key: "human",
        title: "Requiere humano",
        description: "Casos que el agente no debe resolver solo.",
        accent: "border-fuchsia-300/30 bg-fuchsia-300/[0.04]",
        leads: buckets.human,
      },
    ];
  }, [leads]);

  const recentAgentActivity = leads.slice(0, 5);

  return (
    <main className="min-h-screen bg-[#050816] text-white overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-160px] left-[12%] h-[360px] w-[360px] rounded-full bg-cyan-400/20 blur-[120px]" />
        <div className="absolute top-[260px] right-[5%] h-[420px] w-[420px] rounded-full bg-fuchsia-500/10 blur-[150px]" />
        <div className="absolute bottom-[-180px] left-[40%] h-[380px] w-[380px] rounded-full bg-blue-500/10 blur-[140px]" />
      </div>

      <div className="relative max-w-[1600px] mx-auto px-6 py-8 space-y-8">
        <header className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs text-cyan-100">
              <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
              COMETA OS · SALES AI AGENT
            </div>

            <h1 className="mt-5 text-5xl md:text-6xl font-black tracking-tight">
              SALES <span className="text-cyan-300">AI</span>
            </h1>

            <p className="mt-4 max-w-3xl text-slate-300 text-lg md:text-xl leading-relaxed">
              Agente 24/7 para atender, calificar, responder, dar seguimiento y
              detectar oportunidades reales de venta en WhatsApp.
            </p>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
            <p className="text-xs text-slate-400">Marca activa</p>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="mt-1 w-full bg-transparent text-2xl font-black outline-none"
            />

            <div className="mt-5 grid grid-cols-2 gap-3">
              <AgentStatusPill label="Estado" value="Activo 24/7" good />
              <AgentStatusPill label="Modo" value="Observación" />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <KpiCard
            label="Leads atendidos"
            value={stats.total}
            helper="Detectados por webhook + laboratorio"
            glow="cyan"
          />
          <KpiCard
            label="Seguimientos"
            value={stats.followups}
            helper="Leads que requieren nueva interacción"
            glow="yellow"
          />
          <KpiCard
            label="Prospectos calientes"
            value={stats.hot}
            helper="Alta probabilidad de avance"
            glow="green"
          />
          <KpiCard
            label="Requiere humano"
            value={stats.human}
            helper="Casos que el agente debe escalar"
            glow="purple"
          />
          <KpiCard
            label="Prob. promedio"
            value={`${stats.avgProbability}%`}
            helper="Cierre estimado por SALES AI"
            glow="blue"
          />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-6">
          <div className="space-y-6">
            <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl shadow-2xl">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <p className="text-xs text-cyan-300 font-bold tracking-wide">
                    AGENT COMMAND CENTER
                  </p>
                  <h2 className="text-3xl md:text-4xl font-black mt-1">
                    Pipeline automático
                  </h2>
                  <p className="text-sm text-slate-400 mt-2 max-w-2xl">
                    Estas etapas no se operan manualmente. SALES AI clasifica y
                    mueve los prospectos según intención, objeción y probabilidad
                    de cierre.
                  </p>
                </div>

                <button
                  onClick={loadLeads}
                  disabled={loadingLeads}
                  className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"
                >
                  {loadingLeads ? "Actualizando..." : "Actualizar agente"}
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-5 gap-4">
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

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
              <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-cyan-300 font-bold">
                      ACTIVIDAD DEL AGENTE
                    </p>
                    <h3 className="text-2xl font-black mt-1">
                      Últimas decisiones
                    </h3>
                  </div>

                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
                    Monitoreando
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  {!recentAgentActivity.length && (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-[#080d1f] p-8 text-center text-slate-500">
                      Aún no hay actividad del agente.
                    </div>
                  )}

                  {recentAgentActivity.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className="w-full text-left rounded-3xl border border-white/10 bg-[#080d1f] p-4 hover:border-cyan-300/30 transition"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-bold">
                            {lead.contact_name || "Lead sin nombre"}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {formatDate(lead.created_at)}
                          </p>
                        </div>

                        <TemperatureBadge
                          value={lead.lead_temperature || "unknown"}
                        />
                      </div>

                      <p className="mt-3 text-sm text-slate-300">
                        {lead.next_action || "SALES AI está evaluando el lead."}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-400">
                      Modo de automatización
                    </p>
                    <h3 className="text-2xl font-black mt-1">
                      Observación segura
                    </h3>
                  </div>

                  <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs text-yellow-200">
                    Auto-reply OFF
                  </span>
                </div>

                <p className="mt-4 text-sm text-slate-300 leading-relaxed">
                  Por ahora el agente analiza y registra decisiones sin enviar
                  respuestas reales. El siguiente paso será activar el motor
                  autónomo para responder, agendar seguimientos y escalar casos
                  según reglas del playbook.
                </p>

                <div className="mt-5 space-y-3">
                  <AutomationStep
                    title="1. Recibir mensaje"
                    description="Webhook de WhatsApp recibe el texto del prospecto."
                    active
                  />
                  <AutomationStep
                    title="2. Analizar intención"
                    description="SALES AI detecta necesidad, objeción y etapa."
                    active
                  />
                  <AutomationStep
                    title="3. Decidir acción"
                    description="Agent Runner definirá responder, esperar, seguir o escalar."
                  />
                  <AutomationStep
                    title="4. Ejecutar 24/7"
                    description="WhatsApp API enviará respuestas y seguimientos."
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden">
              <button
                onClick={() => setShowLab((value) => !value)}
                className="w-full p-5 flex items-center justify-between text-left"
              >
                <div>
                  <p className="text-xs text-slate-400">Herramienta interna</p>
                  <h3 className="text-2xl font-black mt-1">
                    Laboratorio de prueba
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Úsalo solo para probar conversaciones y ajustar el playbook.
                  </p>
                </div>

                <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm">
                  {showLab ? "Ocultar" : "Abrir"}
                </span>
              </button>

              {showLab && (
                <div className="border-t border-white/10 p-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-slate-300">
                        Nombre del contacto
                      </label>
                      <input
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="w-full mt-2 bg-[#080d1f] border border-white/10 rounded-2xl px-4 py-3 outline-none focus:border-cyan-400/70"
                        placeholder="Ej. Cliente WhatsApp"
                      />
                    </div>

                    <div>
                      <label className="text-sm text-slate-300">
                        Conversación
                      </label>
                      <textarea
                        value={conversationText}
                        onChange={(e) => setConversationText(e.target.value)}
                        className="w-full mt-2 min-h-[260px] bg-[#080d1f] border border-white/10 rounded-2xl px-4 py-3 outline-none focus:border-cyan-400/70 text-sm"
                        placeholder={`Cliente: Hola, información
Vendedor: Hola, manejamos lotes al mayoreo...
Cliente: cuánto cuesta
Vendedor: Tenemos lotes desde 1500
Cliente: lo checo`}
                      />
                    </div>

                    {errorMsg && (
                      <div className="bg-red-500/10 border border-red-500/30 text-red-200 rounded-2xl p-3 text-sm">
                        {errorMsg}
                      </div>
                    )}

                    <button
                      onClick={analyzeLead}
                      disabled={loading || !brandName || !conversationText}
                      className="w-full rounded-2xl bg-cyan-300 px-5 py-4 font-black text-slate-950 transition hover:bg-cyan-200 disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {loading ? "Analizando lead..." : "Simular con SALES AI"}
                    </button>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-[#080d1f] p-5">
                    {!analysis && (
                      <div className="h-full min-h-[260px] flex items-center justify-center text-center text-slate-500">
                        Ejecuta una simulación para ver el diagnóstico del
                        agente.
                      </div>
                    )}

                    {analysis && (
                      <div className="space-y-4">
                        {leadId && (
                          <p className="text-xs text-slate-500">
                            Lead guardado: {leadId}
                          </p>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <LeadPill
                            label="Temperatura"
                            value={translateTemperature(
                              analysis.lead_temperature || "unknown"
                            )}
                          />
                          <LeadPill
                            label="Cierre"
                            value={`${analysis.close_probability ?? 0}%`}
                          />
                          <LeadPill
                            label="Intención"
                            value={analysis.intent || "N/A"}
                          />
                          <LeadPill
                            label="Objeción"
                            value={analysis.main_objection || "N/A"}
                          />
                        </div>

                        <InfoBlock title="Decisión del agente">
                          {analysis.next_action}
                        </InfoBlock>

                        <InfoBlock title="Respuesta sugerida">
                          {analysis.recommended_reply}
                        </InfoBlock>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <LeadDetailPanel lead={selectedLead} />
        </section>
      </div>
    </main>
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
  return (
    <div className={`rounded-[28px] border p-4 ${column.accent}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">{column.title}</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {column.description}
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold">
          {column.leads.length}
        </span>
      </div>

      <div className="mt-4 space-y-3 max-h-[560px] overflow-y-auto pr-1">
        {!column.leads.length && (
          <div className="rounded-3xl border border-dashed border-white/10 bg-[#080d1f]/70 p-5 text-center text-xs text-slate-500">
            Sin leads en esta etapa.
          </div>
        )}

        {column.leads.map((lead) => (
          <button
            key={lead.id}
            onClick={() => onSelectLead(lead)}
            className={`w-full text-left rounded-3xl border p-4 transition ${
              selectedLeadId === lead.id
                ? "border-cyan-300/50 bg-cyan-300/[0.08]"
                : "border-white/10 bg-[#080d1f] hover:border-white/20"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-2xl bg-gradient-to-br from-cyan-300/20 to-fuchsia-400/20 border border-white/10 flex items-center justify-center text-xs font-black">
                  {getInitials(lead.contact_name)}
                </span>

                <div>
                  <p className="font-bold text-sm">
                    {lead.contact_name || "Lead sin nombre"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {lead.contact_phone || lead.source || "Sin contacto"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <LeadMini label="Intento" value={lead.intent || "N/A"} />
              <LeadMini
                label="Cierre"
                value={`${lead.close_probability ?? 0}%`}
              />
            </div>

            <p className="mt-3 text-xs text-slate-400 leading-relaxed">
              {lead.next_action || "SALES AI está evaluando el siguiente paso."}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function LeadDetailPanel({ lead }: { lead: SalesLead | null }) {
  if (!lead) {
    return (
      <aside className="rounded-[34px] border border-dashed border-white/10 bg-white/[0.04] p-8 text-center text-slate-500 h-fit">
        Selecciona un lead para ver la auditoría del agente.
      </aside>
    );
  }

  const stage = getAgentStage(lead);

  return (
    <aside className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl h-fit xl:sticky xl:top-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-cyan-300 font-bold">
            AUDITORÍA DEL AGENTE
          </p>
          <h3 className="text-3xl font-black mt-2">
            {lead.contact_name || "Lead sin nombre"}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {lead.contact_phone || lead.source || "Sin contacto"}
          </p>
        </div>

        <TemperatureBadge value={lead.lead_temperature || "unknown"} />
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-[#080d1f] p-4">
        <p className="text-xs text-slate-500">Etapa asignada por SALES AI</p>
        <p className="mt-1 text-xl font-black">{translateStage(stage)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <LeadPill label="Intención" value={lead.intent || "N/A"} />
        <LeadPill label="Objeción" value={lead.main_objection || "N/A"} />
        <LeadPill label="Cierre" value={`${lead.close_probability ?? 0}%`} />
        <LeadPill label="Estado" value={lead.lead_status || "N/A"} />
      </div>

      <div className="mt-5 space-y-4">
        <InfoBlock title="Decisión del agente">
          {lead.next_action || "Sin acción determinada."}
        </InfoBlock>

        <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.06] p-5">
          <p className="text-sm text-cyan-300 font-bold mb-2">
            Respuesta que usaría SALES AI
          </p>
          <p className="text-slate-100 whitespace-pre-wrap">
            {lead.recommended_reply || "Sin respuesta recomendada."}
          </p>
        </div>

        <InfoBlock title="Resumen comercial">
          {lead.ai_summary ||
            lead.qualification_reason ||
            "Sin resumen disponible."}
        </InfoBlock>

        <div className="rounded-3xl border border-white/10 bg-[#080d1f] p-5">
          <p className="text-sm text-slate-300 font-bold mb-2">
            Estado de autonomía
          </p>
          <p className="text-slate-300 text-sm leading-relaxed">
            Este panel es de auditoría. Cuando activemos Agent Runner, SALES AI
            tomará esta decisión automáticamente: responder, esperar, programar
            seguimiento o escalar a humano.
          </p>
        </div>
      </div>
    </aside>
  );
}

function AgentStatusPill({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#080d1f] p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-sm font-black ${good ? "text-emerald-300" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function AutomationStep({
  title,
  description,
  active,
}: {
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={`mt-1 h-3 w-3 rounded-full ${
          active ? "bg-emerald-300 shadow-lg shadow-emerald-400/30" : "bg-slate-700"
        }`}
      />
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  helper,
  glow,
}: {
  label: string;
  value: string | number;
  helper: string;
  glow: "cyan" | "yellow" | "green" | "purple" | "blue";
}) {
  const glowMap = {
    cyan: "from-cyan-300/20",
    yellow: "from-yellow-300/20",
    green: "from-emerald-300/20",
    purple: "from-fuchsia-400/20",
    blue: "from-blue-400/20",
  };

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <div
        className={`absolute right-[-40px] top-[-40px] h-28 w-28 rounded-full bg-gradient-to-br ${glowMap[glow]} to-transparent blur-2xl`}
      />
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-4xl font-black">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function InfoBlock({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#080d1f] p-5">
      <p className="text-sm text-slate-300 font-bold mb-2">{title}</p>
      <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">
        {children || "Sin información detectada."}
      </p>
    </div>
  );
}

function LeadPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-100">{value}</p>
    </div>
  );
}

function LeadMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[9px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xs font-bold text-slate-100">{value}</p>
    </div>
  );
}

function TemperatureBadge({ value }: { value: string }) {
  const labelMap: Record<string, string> = {
    hot: "Caliente",
    warm: "Tibio",
    cold: "Frío",
    unknown: "Desconocido",
  };

  const classMap: Record<string, string> = {
    hot: "bg-emerald-400/15 text-emerald-200 border-emerald-300/30",
    warm: "bg-yellow-400/15 text-yellow-200 border-yellow-300/30",
    cold: "bg-blue-400/15 text-blue-200 border-blue-300/30",
    unknown: "bg-slate-500/15 text-slate-300 border-slate-400/20",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
        classMap[value] || classMap.unknown
      }`}
    >
      {labelMap[value] || value}
    </span>
  );
}

function getAgentStage(lead: SalesLead): PipelineKey {
  if (needsHumanIntervention(lead)) return "human";
  if (isHotLead(lead)) return "hot";
  if (isFollowUpLead(lead)) return "followup";

  if (
    lead.intent === "catalogo" ||
    lead.intent === "precio" ||
    lead.intent === "mayoreo" ||
    lead.lead_status === "contacted" ||
    lead.lead_status === "qualified"
  ) {
    return "qualifying";
  }

  return "new";
}

function needsHumanIntervention(lead: SalesLead) {
  const objection = lead.main_objection || "";

  return (
    lead.lead_status === "escalated" ||
    objection === "envio" ||
    objection === "confianza" ||
    objection === "pedido_minimo" ||
    objection === "otra" ||
    (lead.close_probability || 0) >= 75
  );
}

function isHotLead(lead: SalesLead) {
  return lead.lead_temperature === "hot" || (lead.close_probability || 0) >= 60;
}

function isFollowUpLead(lead: SalesLead) {
  const status = lead.lead_status || "";
  const objection = lead.main_objection || "";

  return (
    status === "follow_up" ||
    objection === "no_responde" ||
    objection === "falta_de_urgencia" ||
    objection === "comparando" ||
    Boolean(lead.next_action?.toLowerCase().includes("seguimiento"))
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
  const labels: Record<string, string> = {
    hot: "Caliente",
    warm: "Tibio",
    cold: "Frío",
    unknown: "Desconocido",
  };

  return labels[value] || value;
}

function getInitials(name?: string | null) {
  if (!name) return "AI";

  const parts = name.trim().split(" ");

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatDate(date?: string) {
  if (!date) return "N/A";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}