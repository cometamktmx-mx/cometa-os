"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import Sidebar from "../Sidebar";

type StrategyStatus = "empty" | "draft" | "approved" | "rejected" | "published";

type AtlasFormData = {
  packageName: string;
  ninetyDayGoal: string;
  adsBudget: string;
  monthlyContext: string;
};

type ClientStrategyDraft = {
  monthlyObjective: string;
  clientSummary: string;
  contentFocus: string;
  salesFocus: string;
  priorityOffers: string;
  mainActions: string;
  visibleHypothesis: string;
  nextSteps: string;
};

const initialFormData: AtlasFormData = {
  packageName: "Growth",
  ninetyDayGoal: "",
  adsBudget: "",
  monthlyContext: "",
};

const emptyClientDraft: ClientStrategyDraft = {
  monthlyObjective: "",
  clientSummary: "",
  contentFocus: "",
  salesFocus: "",
  priorityOffers: "",
  mainActions: "",
  visibleHypothesis: "",
  nextSteps: "",
};

function GenerateStrategyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const brandName = searchParams.get("brandName") || "";
const brandAnalysisId = searchParams.get("brandAnalysisId") || "";

  const [formData, setFormData] = useState<AtlasFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState<any>(null);
  const [strategyStatus, setStrategyStatus] = useState<StrategyStatus>("empty");
  const [clientDraft, setClientDraft] =
    useState<ClientStrategyDraft>(emptyClientDraft);
  const [internalNotes, setInternalNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [systemMessage, setSystemMessage] = useState("");
  const [publicationId, setPublicationId] = useState<string | null>(null);

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  }


  function handleClientDraftChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setClientDraft({
      ...clientDraft,
      [event.target.name]: event.target.value,
    });
  }

  async function runAtlas() {
    if (!brandName) {
      setErrorMessage("No se encontró brandName en la URL.");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setSystemMessage("");
    setStrategy(null);
    setStrategyStatus("empty");
    setPublicationId(null);

    try {
      const response = await fetch("/api/generate-strategy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandName,
          packageName: formData.packageName,
          ninetyDayGoal: formData.ninetyDayGoal,
          adsBudget: formData.adsBudget,
          monthlyContext: formData.monthlyContext,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setErrorMessage(data.error || "ATLAS no pudo generar la estrategia.");
        return;
      }

      setStrategy(data.strategy);
      setClientDraft(buildClientDraftFromStrategy(data.strategy, formData));
      setStrategyStatus("draft");
      setSystemMessage(
        "ATLAS generó una estrategia interna. Revísala, edita la versión visible y aprueba antes de publicarla."
      );
    } catch (error) {
      console.error("Error ejecutando ATLAS:", error);
      setErrorMessage("Error de conexión ejecutando ATLAS.");
    } finally {
      setLoading(false);
    }
  }

  async function approveStrategy() {
  if (!strategy) return;

  setLoading(true);
  setErrorMessage("");
  setSystemMessage("");

  try {
    const response = await fetch("/api/atlas/publish-strategy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "approve",
        publicationId,
        brandName,
        brandAnalysisId: brandAnalysisId || null,
        clientStrategy: clientDraft,
        internalStrategy: strategy,
        formData,
        internalNotes,
        approvedBy: "Cometa",
      }),
    });

    const data = await response.json();

    if (!data.success) {
      setErrorMessage(data.error || "No se pudo aprobar la estrategia.");
      return;
    }

    setPublicationId(data.publication?.id || null);
    setStrategyStatus("approved");
    setSystemMessage(
      "Estrategia aprobada y guardada en Supabase. Todavía no es visible para el cliente hasta que la publiques."
    );
  } catch (error) {
    console.error("Error aprobando estrategia:", error);
    setErrorMessage("Error de conexión aprobando la estrategia.");
  } finally {
    setLoading(false);
  }
}
async function publishClientVersion() {
  

  console.log("FUNCIÓN: publishClientVersion ejecutada", {
    strategyStatus,
    publicationId,
    brandName,
    brandAnalysisId,
    hasStrategy: Boolean(strategy),
  });

  if (!strategy) {
    setErrorMessage("No hay estrategia generada para publicar.");
    return;
  }

  if (strategyStatus !== "approved" && strategyStatus !== "published") {
    setErrorMessage("Primero debes aprobar la estrategia antes de publicarla.");
    return;
  }

  setLoading(true);
  setErrorMessage("");
  setSystemMessage("");

  try {
    const response = await fetch("/api/atlas/publish-strategy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "publish",
        publicationId,
        brandName,
        brandAnalysisId: brandAnalysisId || null,
        clientStrategy: clientDraft,
        internalStrategy: strategy,
        formData,
        internalNotes,
        approvedBy: "Cometa",
      }),
    });

    const rawText = await response.text();

    console.log("RESPUESTA RAW PUBLICAR:", rawText);

    let data: any = null;

    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`Respuesta no JSON del servidor: ${rawText}`);
    }

    if (!response.ok) {
      throw new Error(data?.error || `Error HTTP ${response.status}`);
    }

    if (!data.success) {
      setErrorMessage(data.error || "No se pudo publicar la estrategia.");
      return;
    }

    setPublicationId(data.publication?.id || null);
    setStrategyStatus("published");
    setSystemMessage(
      "Estrategia publicada en Supabase. Ya quedó marcada como visible para cliente."
    );
  } catch (error: any) {
    console.error("Error publicando estrategia:", error);
    setErrorMessage(error?.message || "Error de conexión publicando la estrategia.");
  } finally {
    setLoading(false);
  }
}

  function rejectStrategy() {
    if (!strategy) return;

    setStrategyStatus("rejected");
    setSystemMessage(
      "Estrategia rechazada. Puedes ajustar el contexto del mes y regenerar."
    );
  }

  

  return (
    <main className="min-h-screen bg-[#f6f7fb] py-8 pl-80 pr-6 text-slate-950 md:pr-10">
      <Sidebar />

      <section className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            href={`/workspace/${encodeURIComponent(brandName)}`}
            className="inline-flex text-sm font-black text-blue-600 transition hover:text-blue-700"
          >
            ← Volver al Workspace
          </Link>

          <div className="flex flex-wrap gap-2">
            <Badge tone="dark">ATLAS Strategy Control</Badge>
            <Badge tone={getStatusTone(strategyStatus)}>
              {getStatusLabel(strategyStatus)}
            </Badge>
          </div>
        </div>

        {systemMessage ? (
          <div className="rounded-[26px] border border-cyan-100 bg-cyan-50 px-5 py-4 text-sm font-bold text-cyan-800">
            {systemMessage}
          </div>
        ) : null}

        {!strategy ? (
          <>
            <AtlasHero brandName={brandName} />

            <section className="grid gap-8 xl:grid-cols-[430px_minmax(0,1fr)]">
              <AtlasConfigPanel
                formData={formData}
                loading={loading}
                errorMessage={errorMessage}
                onChange={handleChange}
                onRun={runAtlas}
              />

              <div className="space-y-6">
                {!loading ? <AtlasReadyPanel brandName={brandName} /> : null}
                {loading ? <AtlasLoadingPanel /> : null}
              </div>
            </section>
          </>
        ) : (
          <AtlasResult
  brandName={brandName}
  formData={formData}
  strategy={strategy}
  strategyStatus={strategyStatus}
  clientDraft={clientDraft}
  internalNotes={internalNotes}
  loading={loading}
  errorMessage={errorMessage}
  onClientDraftChange={handleClientDraftChange}
  onInternalNotesChange={(value) => setInternalNotes(value)}
  onRunAgain={runAtlas}
  onApprove={approveStrategy}
  onReject={rejectStrategy}
  onPublish={publishClientVersion}
  onBackWorkspace={() =>
    router.push(`/workspace/${encodeURIComponent(brandName)}`)
  }
  onContinueMercury={() =>
    router.push(`/mercury?brandName=${encodeURIComponent(brandName)}`)
  }
/>
        )}
      </section>
    </main>
  );
}

export default function GenerateStrategyPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f6f7fb] py-10 pl-80 pr-10 text-slate-950">
          <Sidebar />
          <div className="rounded-[34px] border border-slate-200 bg-white p-10 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">
              ATLAS · Strategy Control
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.06em]">
              Cargando centro estratégico...
            </h1>
          </div>
        </main>
      }
    >
      <GenerateStrategyContent />
    </Suspense>
  );
}

function AtlasHero({ brandName }: { brandName: string }) {
  return (
    <section className="overflow-hidden rounded-[42px] bg-slate-950 text-white shadow-[0_30px_100px_rgba(15,23,42,0.18)]">
      <div className="relative p-8 md:p-10">
        <div className="absolute right-[-120px] top-[-140px] h-96 w-96 rounded-full bg-blue-600/25 blur-[90px]" />
        <div className="absolute bottom-[-120px] left-[24%] h-80 w-80 rounded-full bg-cyan-400/10 blur-[90px]" />
        <div className="absolute bottom-[-160px] right-[24%] h-80 w-80 rounded-full bg-purple-500/10 blur-[90px]" />

        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
              ATLAS · Growth Strategy AI
            </p>

            <h1 className="mt-5 max-w-5xl text-5xl font-black leading-none tracking-[-0.08em] md:text-7xl">
              Control interno de estrategia de crecimiento.
            </h1>

            <p className="mt-6 max-w-4xl text-sm font-semibold leading-8 text-slate-300 md:text-base">
              ATLAS convierte ORION, Business Map y COSMOS Memory en una
              estrategia de crecimiento. Cometa revisa, edita, aprueba y decide
              qué versión se publica al cliente.
            </p>
          </div>

          <div className="grid gap-3">
            <HeroMini label="Marca" value={brandName || "Marca no detectada"} />
            <HeroMini label="Control" value="Solo Cometa" />
            <HeroMini label="Cliente ve" value="Estrategia aprobada" />
          </div>
        </div>
      </div>
    </section>
  );
}

function AtlasConfigPanel({
  formData,
  loading,
  errorMessage,
  onChange,
  onRun,
}: {
  formData: AtlasFormData;
  loading: boolean;
  errorMessage: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => void;
  onRun: () => void;
}) {
  return (
    <aside className="h-fit rounded-[38px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">
        Variables estratégicas
      </p>

      <h2 className="mt-3 text-4xl font-black leading-none tracking-[-0.065em] text-slate-950">
        Configurar ATLAS
      </h2>

      <p className="mt-3 text-sm font-semibold leading-7 text-slate-500">
        Define el marco estratégico para que ATLAS genere una dirección de
        crecimiento conectada a objetivo, presupuesto, contexto real y memoria del
        negocio.
      </p>

      <div className="mt-7 space-y-4">
        <div>
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Paquete
          </label>

          <select
            name="packageName"
            value={formData.packageName}
            onChange={onChange}
            className="mt-2 h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
          >
            <option value="Starter">Starter</option>
            <option value="Growth">Growth</option>
            <option value="Scale">Scale</option>
            <option value="Dominio">Dominio</option>
          </select>
        </div>

        <Input
          name="ninetyDayGoal"
          label="Meta a 90 días"
          placeholder="Ej. aumentar ventas, generar prospectos, posicionar categoría..."
          value={formData.ninetyDayGoal}
          onChange={onChange}
        />

        <Input
          name="adsBudget"
          label="Presupuesto de pauta"
          placeholder="Ej. 4500"
          value={formData.adsBudget}
          onChange={onChange}
        />

        <Textarea
          name="monthlyContext"
          label="Contexto del mes"
          placeholder="Ej. temporada alta, lanzamiento, promoción, problema operativo, enfoque comercial..."
          value={formData.monthlyContext}
          onChange={onChange}
        />

        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="min-h-14 w-full rounded-2xl bg-blue-600 px-6 text-sm font-black text-white shadow-lg shadow-blue-950/10 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "ATLAS está generando estrategia..."
            : "Generar estrategia de crecimiento →"}
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 p-5">
          <p className="text-sm font-black text-rose-700">{errorMessage}</p>
        </div>
      ) : null}
    </aside>
  );
}

function AtlasReadyPanel({ brandName }: { brandName: string }) {
  return (
    <section className="rounded-[38px] border border-white bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="flex items-start gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-slate-950 text-3xl text-white">
          🧠
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">
            Strategy Control Ready
          </p>

          <h2 className="mt-2 text-4xl font-black tracking-[-0.065em] text-slate-950">
            ATLAS generará una estrategia interna.
          </h2>

          <p className="mt-3 max-w-4xl text-sm font-semibold leading-8 text-slate-600">
            La estrategia de {brandName || "esta marca"} se debe revisar antes de
            mostrarse al cliente. Las hipótesis, riesgos, razonamiento interno y
            prioridades estratégicas pertenecen a Cometa.
          </p>
        </div>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-3">
        <ReadyCard icon="🛰️" title="ORION" text="Diagnóstico y señales externas." />
        <ReadyCard icon="🧬" title="Business Map" text="Memoria comercial del negocio." />
        <ReadyCard icon="🧠" title="ATLAS" text="Estrategia de crecimiento aprobable." />
      </div>
    </section>
  );
}

function AtlasLoadingPanel() {
  return (
    <section className="overflow-hidden rounded-[38px] border border-blue-100 bg-blue-50 p-8 shadow-[0_18px_60px_rgba(37,99,235,0.10)]">
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-slate-950 text-cyan-300">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-700">
            Strategy Processing
          </p>

          <h2 className="mt-2 text-4xl font-black tracking-[-0.065em] text-slate-950">
            ATLAS está construyendo la estrategia.
          </h2>

          <p className="mt-3 max-w-4xl text-sm font-semibold leading-8 text-slate-600">
            Leyendo COSMOS, cruzando diagnóstico, memoria comercial, objetivo,
            presupuesto, restricciones y contexto para crear una ruta estratégica
            editable por Cometa.
          </p>
        </div>
      </div>
    </section>
  );
}

function AtlasResult({
  brandName,
  formData,
  strategy,
  strategyStatus,
  clientDraft,
  internalNotes,
  loading,
  errorMessage,
  onClientDraftChange,
  onInternalNotesChange,
  onRunAgain,
  onApprove,
  onReject,
  onPublish,
  onBackWorkspace,
  onContinueMercury,
}: {
  brandName: string;
  formData: AtlasFormData;
  strategy: any;
  strategyStatus: StrategyStatus;
  clientDraft: ClientStrategyDraft;
  internalNotes: string;
  loading: boolean;
  errorMessage: string;
  onClientDraftChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  onInternalNotesChange: (value: string) => void;
  onRunAgain: () => void;
  onApprove: () => void;
  onReject: () => void;
   onPublish: () => void;
  onBackWorkspace: () => void;
  onContinueMercury: () => void;
}) {
  const executive = strategy.executive_summary || {};
  const diagnosis = strategy.strategic_diagnosis || {};
  const growth = strategy.growth_model || {};
  const content = strategy.content_architecture || {};
  const ceo = strategy.ceo_recommendation || {};
    const canContinueToMercury =
    strategyStatus === "approved" || strategyStatus === "published";

  return (
    <section className="space-y-8">
      <section className="overflow-hidden rounded-[42px] bg-slate-950 text-white shadow-[0_30px_100px_rgba(15,23,42,0.18)]">
        <div className="relative p-8 md:p-10">
          <div className="absolute right-[-120px] top-[-140px] h-96 w-96 rounded-full bg-blue-600/25 blur-[90px]" />
          <div className="absolute bottom-[-120px] left-[20%] h-80 w-80 rounded-full bg-cyan-400/10 blur-[90px]" />

          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
                ATLAS · Strategy Draft
              </p>

              <h1 className="mt-5 max-w-5xl text-5xl font-black leading-none tracking-[-0.08em] md:text-7xl">
                Estrategia lista para revisión.
              </h1>

              <p className="mt-6 max-w-4xl text-sm font-semibold leading-8 text-slate-300 md:text-base">
                {executive.current_situation ||
                  diagnosis.strategic_focus ||
                  "ATLAS generó la estrategia correctamente. Ahora Cometa debe aprobar, editar o rechazar antes de publicarla."}
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
  type="button"
  onClick={onApprove}
  disabled={strategyStatus === "published" || loading}
  className="rounded-2xl bg-emerald-400 px-7 py-4 text-sm font-black text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
>
  {loading
    ? "Guardando..."
    : strategyStatus === "published"
      ? "Aprobada"
      : "Aprobar estrategia"}
</button>

                <button
  type="button"
  onClick={onPublish}
  disabled={loading || strategyStatus === "published"}
  className="rounded-2xl bg-white px-7 py-4 text-sm font-black text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
>
  {loading
    ? "Publicando..."
    : strategyStatus === "published"
      ? "Publicado"
      : "Publicar al cliente"}
</button>

{canContinueToMercury ? (
  <button
    type="button"
    onClick={onContinueMercury}
    className="rounded-2xl bg-purple-500 px-7 py-4 text-sm font-black text-white transition hover:bg-purple-400"
  >
    Continuar con MERCURY →
  </button>
) : null}
                <button
                  type="button"
                  onClick={onReject}
                  disabled={strategyStatus === "published"}
                  className="rounded-2xl border border-white/10 bg-white/5 px-7 py-4 text-sm font-black text-white transition hover:bg-white/10 disabled:opacity-50"
                >
                  Rechazar
                </button>

                <button
                  type="button"
                  onClick={onRunAgain}
                  disabled={loading}
                  className="rounded-2xl border border-white/10 bg-white/5 px-7 py-4 text-sm font-black text-white transition hover:bg-white/10 disabled:opacity-50"
                >
                  {loading ? "Regenerando..." : "Regenerar"}
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              <HeroMini label="Marca" value={brandName} />
              <HeroMini label="Estado" value={getStatusLabel(strategyStatus)} />
              <HeroMini label="Paquete" value={formData.packageName} />
              <div className="grid gap-3 sm:grid-cols-2">
                <HeroMini
                  label="Pauta"
                  value={formData.adsBudget ? `$${formData.adsBudget}` : "No definida"}
                />
                <HeroMini
                  label="Nivel"
                  value={strategy.strategy_level || "Strategy"}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-[26px] border border-rose-100 bg-rose-50 px-5 py-4 text-sm font-black text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <StrategyControlPanel
        strategyStatus={strategyStatus}
        clientDraft={clientDraft}
        internalNotes={internalNotes}
        onClientDraftChange={onClientDraftChange}
        onInternalNotesChange={onInternalNotesChange}
      />

      <section className="grid gap-5 lg:grid-cols-4">
        <CommandCard
          icon="🎯"
          title="Objetivo interno"
          content={executive.main_objective}
        />
        <CommandCard
          icon="⚡"
          title="Mayor oportunidad"
          content={executive.biggest_opportunity}
        />
        <CommandCard
          icon="🚧"
          title="Riesgo crítico"
          content={executive.biggest_risk}
        />
        <CommandCard
          icon="👑"
          title="Prioridad"
          content={executive.execution_priority}
        />
      </section>

      <AtlasSection
        icon="🧭"
        title="Diagnóstico estratégico interno"
        description="Esta parte es para Cometa. No debe publicarse completa al cliente."
        items={[
          ["Problema real", diagnosis.real_problem],
          ["Cuello de botella", diagnosis.real_bottleneck],
          ["Hipótesis de crecimiento", diagnosis.growth_hypothesis],
          ["Enfoque estratégico", diagnosis.strategic_focus],
        ]}
      />

      <AtlasSection
        icon="📈"
        title="Growth Model interno"
        description="Modelo de crecimiento comercial para tomar decisiones internas."
        items={[
          ["Palanca principal", growth.primary_growth_lever],
          ["Palanca secundaria", growth.secondary_growth_lever],
          ["Revenue driver prioritario", growth.revenue_driver_to_prioritize],
          ["Estrategia de ticket", growth.ticket_strategy],
          ["Estrategia de frecuencia", growth.frequency_strategy],
          ["Estrategia de retención", growth.retention_strategy],
          ["Cross-sell / Upsell", growth.cross_sell_or_upsell_strategy],
          ["Estrategia de confianza", growth.trust_strategy],
          ["Estrategia de conversión", growth.conversion_strategy],
          ["Dependencia operativa", growth.operational_dependency],
          ["Hipótesis principal", growth.main_growth_hypothesis],
        ]}
      />

      <ContentArchitectureSection content={content} />

      <RoadmapSection strategy={strategy} />

      <AtlasSection
        icon="👑"
        title="Recomendación ejecutiva Cometa"
        description="Decisiones que Cometa debe revisar antes de publicar cualquier versión al cliente."
        items={[
          ["Qué haría primero", ceo.what_i_would_do_first],
          ["Qué no haría", ceo.what_not_to_do],
          ["Dónde enfocaría presupuesto", ceo.where_to_focus_budget],
          ["Decisión final", ceo.final_decision],
        ]}
      />

      <section className="overflow-hidden rounded-[38px] bg-slate-950 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
        <div className="relative p-8">
          <div className="absolute right-[-100px] top-[-120px] h-72 w-72 rounded-full bg-cyan-400/10 blur-[80px]" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
                Strategy Control
              </p>

              <h2 className="mt-3 text-4xl font-black tracking-[-0.065em]">
                ATLAS dejó una estrategia revisable.
              </h2>

              <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-300">
                La estrategia no debe mostrarse al cliente hasta que Cometa
                apruebe y publique la versión visible.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
  {canContinueToMercury ? (
    <button
      type="button"
      onClick={onContinueMercury}
      className="min-h-14 shrink-0 rounded-2xl bg-purple-500 px-7 text-sm font-black text-white transition hover:bg-purple-400"
    >
      Continuar con MERCURY →
    </button>
  ) : null}

  <button
    type="button"
    onClick={onBackWorkspace}
    className="min-h-14 shrink-0 rounded-2xl bg-white px-7 text-sm font-black text-slate-950 transition hover:bg-cyan-100"
  >
    Volver al Workspace →
  </button>
</div>
          </div>
        </div>
      </section>
    </section>
  );
}

function StrategyControlPanel({
  strategyStatus,
  clientDraft,
  internalNotes,
  onClientDraftChange,
  onInternalNotesChange,
}: {
  strategyStatus: StrategyStatus;
  clientDraft: ClientStrategyDraft;
  internalNotes: string;
  onClientDraftChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  onInternalNotesChange: (value: string) => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <article className="rounded-[38px] border border-emerald-100 bg-emerald-50 p-7 shadow-[0_18px_60px_rgba(15,23,42,0.04)]">
        <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-700">
              Versión visible para cliente
            </p>

            <h2 className="mt-2 text-4xl font-black tracking-[-0.065em] text-slate-950">
              Estrategia de crecimiento aprobable
            </h2>

            <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-600">
              Edita esta versión antes de publicarla. Esto es lo que podrá ver el
              cliente en su dashboard.
            </p>
          </div>

          <Badge tone={getStatusTone(strategyStatus)}>
            {getStatusLabel(strategyStatus)}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <DraftInput
            name="monthlyObjective"
            label="Objetivo estratégico"
            value={clientDraft.monthlyObjective}
            onChange={onClientDraftChange}
          />

          <DraftInput
            name="priorityOffers"
            label="Oportunidad prioritaria"
            value={clientDraft.priorityOffers}
            onChange={onClientDraftChange}
          />

          <DraftTextarea
            name="clientSummary"
            label="Resumen para cliente"
            value={clientDraft.clientSummary}
            onChange={onClientDraftChange}
          />

          <DraftTextarea
            name="visibleHypothesis"
            label="Hipótesis visible"
            value={clientDraft.visibleHypothesis}
            onChange={onClientDraftChange}
          />

          <DraftTextarea
            name="contentFocus"
            label="Dirección de comunicación"
            value={clientDraft.contentFocus}
            onChange={onClientDraftChange}
          />

          <DraftTextarea
            name="salesFocus"
            label="Enfoque comercial / ventas"
            value={clientDraft.salesFocus}
            onChange={onClientDraftChange}
          />

          <DraftTextarea
            name="mainActions"
            label="Acciones estratégicas"
            value={clientDraft.mainActions}
            onChange={onClientDraftChange}
          />

          <DraftTextarea
            name="nextSteps"
            label="Siguientes pasos"
            value={clientDraft.nextSteps}
            onChange={onClientDraftChange}
          />
        </div>
      </article>

      <aside className="space-y-5">
        <article className="rounded-[34px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
            Notas internas Cometa
          </p>

          <h3 className="mt-2 text-2xl font-black tracking-[-0.055em] text-slate-950">
            No visible para cliente
          </h3>

          <textarea
            value={internalNotes}
            onChange={(event) => onInternalNotesChange(event.target.value)}
            rows={8}
            placeholder="Ej. hipótesis sensible, duda operativa, riesgo del cliente, decisión de Camilo, pendiente de validar..."
            className="mt-5 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
        </article>

        <article className="rounded-[34px] border border-cyan-100 bg-cyan-50 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
            Regla de publicación
          </p>

          <p className="mt-3 text-sm font-black leading-6 text-slate-950">
            ATLAS genera estrategia. Cometa valida. El cliente visualiza.
          </p>

          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Las hipótesis internas y razonamientos estratégicos no se publican
            automáticamente.
          </p>
        </article>
      </aside>
    </section>
  );
}

function ContentArchitectureSection({ content }: { content: any }) {
  const pillars = Array.isArray(content?.pillars) ? content.pillars : [];

  return (
    <section className="rounded-[38px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)] md:p-8">
      <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <IconBox icon="🎬" />

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">
              Strategic Direction
            </p>

            <h3 className="mt-2 text-4xl font-black tracking-[-0.065em] text-slate-950">
              Dirección de comunicación
            </h3>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-slate-500">
              ATLAS no crea el calendario final, pero sí puede dejar señales
              estratégicas para que la ejecución mensual respete la estrategia.
            </p>
          </div>
        </div>

        <Badge>ATLAS Layer</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <InsightCard
          title="Dirección principal"
          content={content?.main_content_direction}
          featured
        />
        <InsightCard
          title="Principio de comunicación"
          content={content?.content_principle}
          featured
        />
        <InsightCard title="Pilares sugeridos" content={formatPillars(pillars)} featured />
      </div>

      {pillars.length ? (
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {pillars.map((pillar: any, index: number) => (
            <article
              key={`${pillar?.pillar || "pillar"}-${index}`}
              className="rounded-[28px] border border-blue-100 bg-blue-50 p-5"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
                Pilar {index + 1}
              </p>

              <h4 className="mt-3 text-2xl font-black tracking-[-0.05em] text-slate-950">
                {pillar?.pillar || "Pilar estratégico"}
              </h4>

              <p className="mt-2 text-sm font-black text-blue-700">
                {pillar?.percentage || 0}% del enfoque
              </p>

              <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
                {normalizeText(pillar?.role || pillar?.description)}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RoadmapSection({ strategy }: { strategy: any }) {
  const roadmap =
    strategy.roadmap_90_days ||
    strategy.execution_roadmap ||
    strategy.ninety_day_roadmap ||
    null;

  const phases = Array.isArray(roadmap)
    ? roadmap
    : [
        {
          title: "Fase 1",
          period: "Días 1–30",
          focus:
            strategy.ceo_recommendation?.what_i_would_do_first ||
            "Alinear confianza, proceso comercial y mensajes base.",
        },
        {
          title: "Fase 2",
          period: "Días 31–60",
          focus:
            strategy.content_architecture?.main_content_direction ||
            "Activar comunicación, confianza y validadores comerciales.",
        },
        {
          title: "Fase 3",
          period: "Días 61–90",
          focus:
            strategy.growth_model?.conversion_strategy ||
            "Optimizar conversión, seguimiento y escalamiento controlado.",
        },
      ];

  return (
    <section className="rounded-[38px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)] md:p-8">
      <div className="mb-7 flex items-start gap-4">
        <IconBox icon="🗓️" />

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">
            90-Day Strategy
          </p>

          <h3 className="mt-2 text-4xl font-black tracking-[-0.065em] text-slate-950">
            Roadmap estratégico
          </h3>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-slate-500">
            Ruta de crecimiento para convertir la estrategia en decisiones
            progresivas.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {phases.map((phase: any, index: number) => (
          <article
            key={`${phase?.title || "phase"}-${index}`}
            className="rounded-[30px] border border-slate-200 bg-slate-50 p-6"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
              {phase?.period || `Fase ${index + 1}`}
            </p>

            <h4 className="mt-3 text-2xl font-black tracking-[-0.055em] text-slate-950">
              {phase?.title || `Fase ${index + 1}`}
            </h4>

            <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
              {normalizeText(
                phase?.focus || phase?.objective || phase?.description
              )}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AtlasSection({
  icon,
  title,
  description,
  items,
}: {
  icon: string;
  title: string;
  description: string;
  items: [string, any][];
}) {
  return (
    <section className="rounded-[38px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)] md:p-8">
      <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <IconBox icon={icon} />

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">
              Internal Intelligence
            </p>

            <h3 className="mt-2 text-4xl font-black tracking-[-0.065em] text-slate-950">
              {title}
            </h3>

            <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-slate-500">
              {description}
            </p>
          </div>
        </div>

        <Badge>Internal Layer</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map(([label, value]) => (
          <InsightCard key={label} title={label} content={value} />
        ))}
      </div>
    </section>
  );
}

function CommandCard({
  icon,
  title,
  content,
}: {
  icon: string;
  title: string;
  content: any;
}) {
  return (
    <article className="rounded-[34px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-2xl text-white">
        {icon}
      </div>

      <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
        {title}
      </p>

      <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
        {truncateText(normalizeText(content), 240)}
      </p>
    </article>
  );
}

function InsightCard({
  title,
  content,
  featured = false,
}: {
  title: string;
  content: any;
  featured?: boolean;
}) {
  return (
    <article
      className={`group rounded-[28px] border p-5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_60px_rgba(15,23,42,0.06)] ${
        featured
          ? "border-blue-100 bg-blue-50"
          : "border-slate-200 bg-slate-50 hover:border-blue-200 hover:bg-white"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          {title}
        </p>

        <span className="h-2 w-2 rounded-full bg-blue-500 opacity-50 transition group-hover:opacity-100" />
      </div>

      <p className="whitespace-pre-line text-sm font-semibold leading-7 text-slate-700">
        {normalizeText(content)}
      </p>
    </article>
  );
}

function ReadyCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-2xl">{icon}</p>

      <h3 className="mt-3 text-xl font-black tracking-[-0.04em] text-slate-950">
        {title}
      </h3>

      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        {text}
      </p>
    </article>
  );
}

function IconBox({ icon }: { icon: string }) {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-slate-950 text-3xl text-white shadow-[0_18px_60px_rgba(15,23,42,0.12)]">
      {icon}
    </div>
  );
}

function Badge({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "blue" | "dark" | "emerald" | "amber" | "rose" | "slate";
}) {
  const className =
    tone === "dark"
      ? "bg-slate-950 text-white"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-700"
        : tone === "amber"
          ? "bg-amber-50 text-amber-700"
          : tone === "rose"
            ? "bg-rose-50 text-rose-700"
            : tone === "slate"
              ? "bg-slate-100 text-slate-600"
              : "bg-blue-50 text-blue-700";

  return (
    <div
      className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${className}`}
    >
      {children}
    </div>
  );
}

function HeroMini({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-xl font-black leading-tight text-white">
        {normalizeText(value)}
      </p>
    </div>
  );
}

function Input({
  name,
  label,
  placeholder,
  value,
  onChange,
}: {
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>

      <input
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function Textarea({
  name,
  label,
  placeholder,
  value,
  onChange,
}: {
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>

      <textarea
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        rows={4}
        className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function DraftInput({
  name,
  label,
  value,
  onChange,
}: {
  name: keyof ClientStrategyDraft;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
        {label}
      </span>

      <input
        name={name}
        value={value}
        onChange={onChange}
        className="h-14 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
      />
    </label>
  );
}

function DraftTextarea({
  name,
  label,
  value,
  onChange,
}: {
  name: keyof ClientStrategyDraft;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
        {label}
      </span>

      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={5}
        className="w-full resize-y rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-sm font-semibold leading-6 text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
      />
    </label>
  );
}

function buildClientDraftFromStrategy(
  strategy: any,
  formData: AtlasFormData
): ClientStrategyDraft {
  const clientVisible = strategy?.client_visible_strategy || {};
  const executive = strategy?.executive_summary || {};
  const diagnosis = strategy?.strategic_diagnosis || {};
  const growth = strategy?.growth_model || {};
  const content = strategy?.content_architecture || {};
  const ceo = strategy?.ceo_recommendation || {};

  return {
    monthlyObjective:
      clientVisible.monthly_objective ||
      executive.main_objective ||
      formData.ninetyDayGoal ||
      "Fortalecer el crecimiento comercial de la marca con una estrategia más clara y medible.",
    clientSummary:
      clientVisible.client_summary ||
      executive.current_situation ||
      diagnosis.strategic_focus ||
      "La estrategia se enfocará en mejorar claridad comercial, confianza, comunicación y conversión.",
    contentFocus:
      clientVisible.content_focus ||
      content.main_content_direction ||
      content.content_principle ||
      "Comunicación enfocada en confianza, diferenciadores, oferta prioritaria y objeciones frecuentes.",
    salesFocus:
      clientVisible.sales_focus ||
      growth.conversion_strategy ||
      growth.trust_strategy ||
      "Mejorar seguimiento, respuesta a objeciones y claridad de la oferta.",
    priorityOffers:
      clientVisible.priority_offers ||
      growth.revenue_driver_to_prioritize ||
      executive.biggest_opportunity ||
      "Oportunidad principal por definir.",
    mainActions:
      clientVisible.main_actions ||
      ceo.what_i_would_do_first ||
      executive.execution_priority ||
      "Alinear comunicación, contenido y ventas alrededor del objetivo estratégico.",
    visibleHypothesis:
      clientVisible.visible_hypothesis ||
      growth.main_growth_hypothesis ||
      diagnosis.growth_hypothesis ||
      "Si mejoramos claridad comercial, confianza y seguimiento, aumentará la calidad de oportunidades.",
    nextSteps:
      clientVisible.next_steps ||
      ceo.final_decision ||
      "Cometa ejecutará la estrategia aprobada, revisará resultados y ajustará el enfoque según señales del mes.",
  };
}

function getStatusLabel(status: StrategyStatus) {
  if (status === "draft") return "Borrador interno";
  if (status === "approved") return "Aprobada";
  if (status === "rejected") return "Rechazada";
  if (status === "published") return "Publicada";
  return "Sin estrategia";
}

function getStatusTone(status: StrategyStatus) {
  if (status === "approved") return "emerald";
  if (status === "published") return "blue";
  if (status === "rejected") return "rose";
  if (status === "draft") return "amber";
  return "slate";
}

function formatPillars(pillars: any) {
  if (!Array.isArray(pillars)) return "";

  return pillars
    .map((pillar) => {
      const name = pillar?.pillar || "Pilar";
      const percentage = pillar?.percentage ? ` (${pillar.percentage}%)` : "";
      return `${name}${percentage}`;
    })
    .join("\n");
}

function normalizeText(value: any) {
  if (value === null || value === undefined) {
    return "Sin información suficiente.";
  }

  if (Array.isArray(value)) {
    if (!value.length) return "Sin información suficiente.";
    return value.join("\n");
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  const text = String(value).trim();

  if (
    !text ||
    text.toLowerCase() === "undefined" ||
    text.toLowerCase() === "null"
  ) {
    return "Sin información suficiente.";
  }

  return text;
}

function truncateText(value: string, maxLength: number) {
  if (!value) return "Sin información suficiente.";

  if (value.length <= maxLength) return value;

  return `${value.slice(0, maxLength).trim()}...`;
}

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}