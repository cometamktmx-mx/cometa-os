"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StrategyCard from "./StrategyCard";

type FormData = {
  brandName: string;
  industry: string;
  city: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  website: string;
  competitors: string;
  objective: string;
  budget: string;
  problem: string;
  includeWebsite: boolean;
  includeTikTok: boolean;
};

type EvidencePendingState = {
  message?: string;
  brandSlug?: string;
  evidence?: {
    jobResult?: {
      inserted?: number;
      skipped?: number;
    };
    missingRequiredSources?: string[];
    pendingSources?: string[];
    includedSources?: Record<string, boolean>;
    excludedSources?: Record<string, boolean>;
  };
};

type AutoRetryState = {
  active: boolean;
  attempt: number;
  maxAttempts: number;
  nextRetrySeconds: number;
};

const AUTO_RETRY_INTERVAL_MS = 12000;
const MAX_AUTO_RETRIES = 8;

const initialFormData: FormData = {
  brandName: "",
  industry: "",
  city: "",
  instagram: "",
  facebook: "",
  tiktok: "",
  website: "",
  competitors: "",
  objective: "",
  budget: "",
  problem: "",
  includeWebsite: true,
  includeTikTok: false,
};

export default function AnalyzeBrandForm() {
  const router = useRouter();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [result, setResult] = useState<any>(null);
  const [evidencePending, setEvidencePending] =
    useState<EvidencePendingState | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [autoRetryState, setAutoRetryState] = useState<AutoRetryState>({
    active: false,
    attempt: 0,
    maxAttempts: MAX_AUTO_RETRIES,
    nextRetrySeconds: Math.round(AUTO_RETRY_INTERVAL_MS / 1000),
  });

  function clearEvidenceRetryTimer() {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  function resetAutoRetryState() {
    clearEvidenceRetryTimer();

    setAutoRetryState({
      active: false,
      attempt: 0,
      maxAttempts: MAX_AUTO_RETRIES,
      nextRetrySeconds: Math.round(AUTO_RETRY_INTERVAL_MS / 1000),
    });
  }

  function scheduleEvidenceRetry(nextAttempt: number) {
    clearEvidenceRetryTimer();

    if (nextAttempt > MAX_AUTO_RETRIES) {
      setAutoRetryState({
        active: false,
        attempt: MAX_AUTO_RETRIES,
        maxAttempts: MAX_AUTO_RETRIES,
        nextRetrySeconds: Math.round(AUTO_RETRY_INTERVAL_MS / 1000),
      });

      return;
    }

    setAutoRetryState({
      active: true,
      attempt: nextAttempt,
      maxAttempts: MAX_AUTO_RETRIES,
      nextRetrySeconds: Math.round(AUTO_RETRY_INTERVAL_MS / 1000),
    });

    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      analyzeBrand({ autoRetryAttempt: nextAttempt });
    }, AUTO_RETRY_INTERVAL_MS);
  }

  useEffect(() => {
    return () => {
      clearEvidenceRetryTimer();
    };
  }, []);

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  }

  function handleToggle(name: "includeWebsite" | "includeTikTok") {
    setFormData((current) => ({
      ...current,
      [name]: !current[name],
    }));
  }

  async function analyzeBrand(options?: { autoRetryAttempt?: number }) {
    const autoRetryAttempt = options?.autoRetryAttempt || 0;
    const isAutoRetry = autoRetryAttempt > 0;

    if (!isAutoRetry) {
      resetAutoRetryState();
      setResult(null);
      setEvidencePending(null);
    }

    setLoading(true);

    try {
      const response = await fetch("/api/analyze-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data?.status === "evidence_pending") {
        setEvidencePending({
          message:
            data.message ||
            "ORION está recolectando evidencia pública. Mantén el worker activo y vuelve a generar el diagnóstico en unos segundos.",
          brandSlug: data.brandSlug,
          evidence: data.evidence,
        });

        setResult(null);

        if (autoRetryAttempt < MAX_AUTO_RETRIES) {
          scheduleEvidenceRetry(autoRetryAttempt + 1);
        } else {
          setAutoRetryState({
            active: false,
            attempt: autoRetryAttempt,
            maxAttempts: MAX_AUTO_RETRIES,
            nextRetrySeconds: Math.round(AUTO_RETRY_INTERVAL_MS / 1000),
          });
        }

        return;
      }

      resetAutoRetryState();

      if (data.success) {
        setEvidencePending(null);

        setAnalysisId(
          data.brandAnalysisId ||
            data.analysisId ||
            data.savedAnalysis?.id ||
            data.result?.id ||
            null
        );

        setResult({
          ...data.result,
          instagram_context:
            data.instagramContext || data.result?.instagram_context,
          facebook_context: data.facebookContext || data.result?.facebook_context,
          tiktok_context: data.result?.tiktok_context || data.tiktokContext,
          website_context: data.websiteContext || data.result?.website_context,
        });
      } else {
        setResult(data?.error || "Error al analizar la marca.");
      }
    } catch (error) {
      console.error(error);
      resetAutoRetryState();
      setResult("Error de conexión con ORION.");
    } finally {
      setLoading(false);
    }
  }

  const canAnalyze =
    Boolean(formData.brandName.trim()) && Boolean(formData.industry.trim());

  return (
    <section className="space-y-7">
      <div className="grid gap-4 md:grid-cols-2">
        <PremiumInput
          name="brandName"
          label="Nombre de la marca"
          placeholder="Ej. Magenta Fitwear"
          value={formData.brandName}
          onChange={handleChange}
          required
        />

        <PremiumInput
          name="industry"
          label="Industria o giro"
          placeholder="Ej. Moda deportiva, clínica dental, restaurante"
          value={formData.industry}
          onChange={handleChange}
          required
        />

        <PremiumInput
          name="city"
          label="Ciudad o zona principal"
          placeholder="Ej. Morelia, León, Querétaro"
          value={formData.city}
          onChange={handleChange}
        />

        <PremiumInput
          name="website"
          label="Sitio web o tienda en línea"
          placeholder="https://..."
          value={formData.website}
          onChange={handleChange}
        />

        <PremiumInput
          name="instagram"
          label="Instagram"
          placeholder="@marca"
          value={formData.instagram}
          onChange={handleChange}
        />

        <PremiumInput
          name="facebook"
          label="Facebook"
          placeholder="URL o nombre de página"
          value={formData.facebook}
          onChange={handleChange}
        />

        <PremiumInput
          name="tiktok"
          label="TikTok"
          placeholder="@marca"
          value={formData.tiktok}
          onChange={handleChange}
        />

        <PremiumInput
          name="budget"
          label="Presupuesto aproximado"
          placeholder="Ej. $5,000 - $20,000 mensuales"
          value={formData.budget}
          onChange={handleChange}
        />

        <PremiumTextarea
          name="competitors"
          label="Competidores o marcas similares"
          placeholder="Ej. marcas cercanas, líderes del sector o negocios similares"
          value={formData.competitors}
          onChange={handleChange}
        />

        <PremiumTextarea
          name="objective"
          label="Objetivo comercial"
          placeholder="Ej. vender más, generar citas, posicionarse, crecer mayoreo, mejorar atención"
          value={formData.objective}
          onChange={handleChange}
        />

        <div className="md:col-span-2">
          <PremiumTextarea
            name="problem"
            label="Problema principal"
            placeholder="Ej. recibe mensajes pero no cierra, poca confianza, redes descuidadas, no tiene estrategia"
            value={formData.problem}
            onChange={handleChange}
            rows={4}
          />
        </div>
      </div>

      <AnalysisOptions
        includeWebsite={formData.includeWebsite}
        includeTikTok={formData.includeTikTok}
        hasWebsite={Boolean(formData.website.trim())}
        hasTikTok={Boolean(formData.tiktok.trim())}
        onToggle={handleToggle}
      />

      <div className="flex flex-col gap-4 rounded-[30px] border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
            ORION Analysis
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
            ORION evaluará presencia digital, señales comerciales, confianza,
            posicionamiento, contenido, competencia y oportunidad de crecimiento
            con las fuentes incluidas en este diagnóstico.
          </p>
        </div>

        <button
          type="button"
          onClick={() => analyzeBrand()}
          disabled={loading || !canAnalyze}
          className="flex min-h-14 shrink-0 items-center justify-center gap-3 rounded-2xl bg-slate-950 px-7 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <span className="text-cyan-300">✦</span>
          )}

          <span>
            {loading
              ? "ORION está analizando..."
              : "Ejecutar diagnóstico con ORION"}
          </span>
        </button>
      </div>

      {loading ? <LoadingPanel /> : null}

      {evidencePending ? (
        <EvidencePendingPanel
          data={evidencePending}
          loading={loading}
          autoRetryState={autoRetryState}
          onRetry={() => analyzeBrand()}
        />
      ) : null}

      {result && typeof result === "string" ? (
        <ErrorPanel message={result} />
      ) : null}

      {result && typeof result !== "string" ? (
        <ResultDashboard
          result={result}
          analysisId={analysisId}
          onContinueNova={() => {
            if (!analysisId) {
              alert(
                "No se encontró el ID del análisis. Revisa que /api/analyze-brand esté regresando analysisId."
              );
              return;
            }

            router.push(`/nova/${analysisId}`);
          }}
        />
      ) : null}
    </section>
  );
}

function AnalysisOptions({
  includeWebsite,
  includeTikTok,
  hasWebsite,
  hasTikTok,
  onToggle,
}: {
  includeWebsite: boolean;
  includeTikTok: boolean;
  hasWebsite: boolean;
  hasTikTok: boolean;
  onToggle: (name: "includeWebsite" | "includeTikTok") => void;
}) {
  return (
    <section className="rounded-[34px] border border-cyan-100 bg-cyan-50 p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
            Fuentes del diagnóstico
          </p>

          <h3 className="mt-2 text-2xl font-black tracking-[-0.055em] text-slate-950">
            Decide qué fuentes debe considerar ORION.
          </h3>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-slate-600">
            Si una fuente no aplica para la marca, ORION no la penaliza. TikTok
            queda con bajo peso hasta que exista conexión oficial por API o
            cuenta integrada.
          </p>
        </div>

        <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:min-w-[520px]">
          <ToggleCard
            title="Analizar sitio web"
            description={
              hasWebsite
                ? "ORION evaluará sitio, SEO, UX, confianza y conversión."
                : "No hay sitio capturado. ORION no lo tomará como limitante."
            }
            enabled={includeWebsite}
            onClick={() => onToggle("includeWebsite")}
          />

          <ToggleCard
            title="Analizar TikTok"
            description={
              hasTikTok
                ? "ORION lo usará como referencia secundaria con bajo peso."
                : "No hay TikTok capturado. ORION no lo tomará como limitante."
            }
            enabled={includeTikTok}
            onClick={() => onToggle("includeTikTok")}
          />
        </div>
      </div>
    </section>
  );
}

function ToggleCard({
  title,
  description,
  enabled,
  onClick,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[26px] border p-5 text-left transition ${
        enabled
          ? "border-cyan-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-slate-950">{title}</p>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            {description}
          </p>
        </div>

        <span
          className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition ${
            enabled ? "bg-cyan-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`h-5 w-5 rounded-full bg-white shadow transition ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </span>
      </div>

      <p
        className={`mt-4 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
          enabled
            ? "bg-cyan-100 text-cyan-700"
            : "bg-slate-200 text-slate-500"
        }`}
      >
        {enabled ? "Incluido" : "Excluido"}
      </p>
    </button>
  );
}

function LoadingPanel() {
  return (
    <div className="rounded-[34px] border border-cyan-100 bg-cyan-50 p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-slate-950 text-cyan-300 shadow-lg shadow-cyan-950/10">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
            Construyendo diagnóstico
          </p>

          <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
            ORION está leyendo la marca.
          </h3>

          <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-slate-600">
            Analizando redes sociales, percepción digital, narrativa, contenido,
            confianza, competencia, oportunidades comerciales y potencial de
            crecimiento.
          </p>
        </div>
      </div>
    </div>
  );
}

function EvidencePendingPanel({
  data,
  loading,
  autoRetryState,
  onRetry,
}: {
  data: EvidencePendingState;
  loading: boolean;
  autoRetryState: AutoRetryState;
  onRetry: () => void;
}) {
  const missing = data.evidence?.missingRequiredSources || [];
  const pending = data.evidence?.pendingSources || [];

  const sourcesToShow = pending.length ? pending : missing;

  return (
    <div className="overflow-hidden rounded-[34px] border border-amber-200 bg-amber-50 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="border-b border-amber-200/70 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-700">
          ORION Intelligence
        </p>

        <h3 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-950">
          ORION está analizando señales públicas.
        </h3>

        <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-700">
          Estamos revisando la presencia digital de la marca, validando fuentes
          disponibles y preparando un diagnóstico con información más confiable.
        </p>

        {autoRetryState.active ? (
          <div className="mt-5 rounded-[24px] border border-amber-200 bg-white p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
              Validación en proceso
            </p>

            <p className="mt-2 text-sm font-black leading-7 text-slate-800">
              ORION generará el diagnóstico automáticamente cuando termine de
              validar las fuentes necesarias.
            </p>

            <p className="mt-1 text-xs font-bold text-slate-500">
              Este proceso puede tardar unos segundos dependiendo de la
              disponibilidad pública de cada plataforma.
            </p>
          </div>
        ) : autoRetryState.attempt >= autoRetryState.maxAttempts ? (
          <div className="mt-5 rounded-[24px] border border-rose-100 bg-white p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-600">
              Validación pausada
            </p>

            <p className="mt-2 text-sm font-semibold leading-7 text-slate-700">
              Algunas fuentes todavía no pudieron validarse automáticamente.
              Puedes reintentar el diagnóstico o continuar más tarde.
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 p-6 md:grid-cols-2">
        <div className="rounded-[28px] bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Fuentes en validación
          </p>

          <p className="mt-3 text-sm font-black leading-7 text-slate-800">
            {sourcesToShow.length
              ? sourcesToShow.map(sourceLabel).join(", ")
              : "Sin fuentes pendientes."}
          </p>
        </div>

        <div className="rounded-[28px] bg-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Estado del diagnóstico
          </p>

          <p className="mt-3 text-sm font-black leading-7 text-slate-800">
            Preparando análisis estratégico
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-amber-200/70 bg-white/60 p-6 md:flex-row md:items-center md:justify-between">
        <p className="text-xs font-bold leading-6 text-slate-600">
          ORION está trabajando en segundo plano. No cierres esta pantalla
          mientras se completa la validación.
        </p>

        <button
          type="button"
          onClick={onRetry}
          disabled={loading}
          className="rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Validando..." : "Actualizar estado →"}
        </button>
      </div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-[30px] border border-rose-100 bg-rose-50 p-6 text-sm font-black text-rose-700">
      {message}
    </div>
  );
}

function ResultDashboard({
  result,
  analysisId,
  onContinueNova,
}: {
  result: any;
  analysisId: string | null;
  onContinueNova: () => void;
}) {
  return (
    <div className="mt-8 space-y-5">
      <ExecutiveResult result={result} onContinueNova={onContinueNova} />

      <InsightSection
        eyebrow="Resumen ejecutivo"
        title="Lectura estratégica de la marca"
        cards={[
          {
            title: "Resumen ejecutivo",
            content: result.executive_summary,
            featured: true,
          },
          {
            title: "Siguiente paso recomendado",
            content: result.next_step,
          },
          {
            title: "Wow insight",
            content: result.wow_insight,
          },
          {
            title: "Predicción si sigue igual",
            content: result.future_prediction,
          },
        ]}
      />

      <InstagramSection result={result} />
      <FacebookSection result={result} />
      <TikTokSection result={result} />
      <WebsiteSection result={result} />
      <EngagementSection result={result} />
      <LossesSection result={result} />
      <GrowthPotentialSection result={result} />
      <CompetitiveSection result={result} />
      <MarketOpportunitySection result={result} />
      <BrandPerceptionSection result={result} />
      <DeepDiagnosisSection result={result} />
      <ContentSalesStrategySection result={result} />
      <StrategicBalanceSection result={result} />

      <div className="rounded-[34px] bg-slate-950 p-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
          Activación estratégica
        </p>

        <h3 className="mt-3 text-3xl font-black tracking-[-0.06em]">
          Continuar con NOVA
        </h3>

        <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
          NOVA convierte este diagnóstico en un Business Map con oferta, buyer
          persona, proceso comercial, objeciones, oportunidades y estrategia de
          ventas.
        </p>

        <button
          type="button"
          onClick={onContinueNova}
          className="mt-6 rounded-2xl bg-white px-6 py-4 text-sm font-black text-slate-950 shadow-lg shadow-white/10 transition hover:bg-cyan-100"
        >
          Continuar con NOVA →
        </button>

        {!analysisId ? (
          <p className="mt-3 text-xs font-semibold text-amber-300">
            No se detectó analysisId todavía. ORION debe regresar el ID guardado
            para continuar.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ExecutiveResult({
  result,
  onContinueNova,
}: {
  result: any;
  onContinueNova: () => void;
}) {
  const brandScore = safeNumber(result.brand_score);
  const opportunityScore = safeNumber(result.opportunity_level?.score);
  const opportunityLevel = normalizeText(result.opportunity_level?.level);
  const opportunityReason = normalizeText(result.opportunity_level?.reason);
  const brandLevel = normalizeText(result.brand_level);

  const websiteValue =
    result.analysis_scope?.website_included === false
      ? "Excluido"
      : `${safeNumber(result.website_analysis?.website_score)}/100`;

  return (
    <section className="overflow-hidden rounded-[38px] bg-slate-950 text-white shadow-[0_30px_100px_rgba(15,23,42,0.22)]">
      <div className="grid gap-0 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="relative border-b border-white/10 p-7 2xl:border-b-0 2xl:border-r">
          <div className="absolute right-[-90px] top-[-100px] h-72 w-72 rounded-full bg-cyan-400/20 blur-[80px]" />

          <p className="relative text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Brand Score
          </p>

          <div className="relative mt-6 flex items-center gap-6">
            <ScoreRing value={brandScore} />

            <div>
              <p className="text-6xl font-black tracking-[-0.09em]">
                {brandScore}
              </p>
              <p className="text-sm font-bold text-slate-400">/100</p>
            </div>
          </div>

          <p className="relative mt-5 inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black text-white">
            {brandLevel || "Nivel no detectado"}
          </p>
        </div>

        <div className="p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">
            Nivel de oportunidad
          </p>

          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-5xl font-black leading-none tracking-[-0.08em] text-emerald-300 md:text-6xl">
                {opportunityLevel || "Por clasificar"}
              </h3>

              <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
                {opportunityReason || "Sin información suficiente."}
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 text-right">
              <p className="text-5xl font-black tracking-[-0.08em]">
                {opportunityScore}
              </p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Opportunity /100
              </p>
            </div>
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-3">
            <DarkMini
              label="Instagram"
              value={metricValue(result.social_signals?.instagram_followers)}
            />
            <DarkMini label="Website" value={websiteValue} />
            <DarkMini
              label="Facebook"
              value={`${safeNumber(result.facebook_analysis?.facebook_score)}/100`}
            />
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onContinueNova}
              className="rounded-2xl bg-emerald-400 px-6 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-300"
            >
              Pasar a NOVA →
            </button>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-black text-emerald-300">
  Diagnóstico guardado ✓
</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InstagramSection({ result }: { result: any }) {
  return (
    <>
      <SectionHeading
        eyebrow="Social Intelligence"
        title="Lectura ejecutiva de Instagram"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Seguidores"
          value={result.social_signals?.instagram_followers}
        />
        <MetricCard
          label="Seguidos"
          value={result.social_signals?.instagram_following}
        />
        <MetricCard
          label="Publicaciones"
          value={result.social_signals?.instagram_posts}
        />
      </div>
    </>
  );
}

function FacebookSection({ result }: { result: any }) {
  return (
    <>
      <SectionHeading
        eyebrow="Facebook Intelligence"
        title="Lectura ejecutiva de Facebook"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <DarkPanel
          label="Presencia"
          value={result.facebook_analysis?.presence_level || "No detectada"}
        />
        <DarkPanel
          label="Facebook Score"
          value={`${safeNumber(result.facebook_analysis?.facebook_score)}/100`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SmallMetricCard
          label="Seguidores"
          value={
            result.facebook_analysis?.facebook_followers ||
            result.facebook_analysis?.followers ||
            result.facebook_context?.profileSignals?.followers
          }
        />
        <SmallMetricCard
          label="Me gusta"
          value={
            result.facebook_analysis?.facebook_likes ||
            result.facebook_analysis?.likes ||
            result.facebook_context?.profileSignals?.likes
          }
        />
        <SmallMetricCard
          label="Personas hablando"
          value={
            result.facebook_analysis?.talking_about ||
            result.facebook_context?.profileSignals?.talking_about
          }
        />
        <SmallMetricCard
          label="Categoría"
          value={
            result.facebook_analysis?.category ||
            result.facebook_context?.profileSignals?.category
          }
        />
        <SmallMetricCard
          label="Messenger"
          value={
            result.facebook_analysis?.has_messenger ||
            result.facebook_analysis?.messenger ||
            result.facebook_context?.contentSignals?.hasMessenger
          }
        />
        <SmallMetricCard
          label="WhatsApp"
          value={
            result.facebook_analysis?.has_whatsapp ||
            result.facebook_analysis?.whatsapp ||
            result.facebook_context?.contentSignals?.hasWhatsapp
          }
        />
      </div>

      <InsightSection
        eyebrow="Facebook Signals"
        title="Señales y oportunidades detectadas"
        cards={[
          { title: "Actividad", content: result.facebook_analysis?.activity_level },
          { title: "Conversión", content: result.facebook_analysis?.conversion_level },
          { title: "Diagnóstico", content: result.facebook_analysis?.diagnosis },
          { title: "Tipo de contenido", content: result.facebook_analysis?.content_type },
          { title: "Nivel de confianza", content: result.facebook_analysis?.trust_level },
          { title: "Oportunidad principal", content: result.facebook_analysis?.main_opportunity },
          { title: "Problema principal", content: result.facebook_analysis?.main_problem },
          { title: "Acción recomendada", content: result.facebook_analysis?.recommended_action },
        ]}
      />
    </>
  );
}

function TikTokSection({ result }: { result: any }) {
  const isExcluded =
    result.analysis_scope?.tiktok_included === false ||
    result.tiktok_analysis?.presence_level === "Excluido del diagnóstico";

  return (
    <>
      <SectionHeading
        eyebrow="TikTok Intelligence"
        title="Lectura ejecutiva de TikTok"
      />

      {isExcluded ? (
        <div className="rounded-[34px] border border-slate-200 bg-slate-50 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
            Fuente excluida
          </p>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
            {normalizeText(result.tiktok_analysis?.diagnosis)}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <DarkPanel
              label="Presencia"
              value={result.tiktok_analysis?.presence_level || "No detectada"}
            />
            <DarkPanel
              label="TikTok Score"
              value={`${safeNumber(result.tiktok_analysis?.tiktok_score)}/100`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <SmallMetricCard
              label="Usuario"
              value={result.tiktok_context?.profileSignals?.username}
            />
            <SmallMetricCard
              label="Seguidores"
              value={result.tiktok_context?.profileSignals?.followers}
            />
            <SmallMetricCard
              label="Likes"
              value={result.tiktok_context?.profileSignals?.likes}
            />
            <SmallMetricCard
              label="Siguiendo"
              value={result.tiktok_context?.profileSignals?.following}
            />
            <SmallMetricCard
              label="Videos"
              value={result.tiktok_context?.contentSignals?.hasVideos}
            />
            <SmallMetricCard
              label="Potencial viral"
              value={result.tiktok_context?.contentSignals?.viralPotential}
            />
          </div>
        </>
      )}

      <InsightSection
        eyebrow="TikTok Signals"
        title="Contenido, hooks y oportunidad"
        cards={[
          { title: "Bio detectada", content: result.tiktok_context?.profileSignals?.bio },
          { title: "Estilo de contenido", content: result.tiktok_analysis?.content_style },
          { title: "Calidad de hooks", content: result.tiktok_analysis?.hook_quality },
          { title: "Consistencia", content: result.tiktok_analysis?.posting_consistency },
          { title: "Diagnóstico", content: result.tiktok_analysis?.diagnosis },
          { title: "Oportunidad principal", content: result.tiktok_analysis?.main_opportunity },
          { title: "Problema principal", content: result.tiktok_analysis?.main_problem },
          { title: "Acción recomendada", content: result.tiktok_analysis?.recommended_action },
        ]}
      />
    </>
  );
}

function WebsiteSection({ result }: { result: any }) {
  const isExcluded =
    result.analysis_scope?.website_included === false ||
    result.website_analysis?.presence_level === "Excluido del diagnóstico";

  return (
    <>
      <SectionHeading
        eyebrow="Website Intelligence"
        title="Lectura ejecutiva del sitio web"
      />

      {isExcluded ? (
        <div className="rounded-[34px] border border-slate-200 bg-slate-50 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
            Fuente excluida
          </p>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
            {normalizeText(result.website_analysis?.diagnosis)}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <DarkPanel
              label="Website Score"
              value={`${safeNumber(result.website_analysis?.website_score)}/100`}
            />
            <DarkPanel
              label="Presencia web"
              value={result.website_analysis?.presence_level || "No detectada"}
            />
          </div>

          <div className="rounded-[34px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
              Balance web
            </p>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <ScoreBar title="SEO" value={result.website_analysis?.seo_score || 0} />
              <ScoreBar title="Conversión" value={result.website_analysis?.conversion_score || 0} />
              <ScoreBar title="Confianza" value={result.website_analysis?.trust_score || 0} />
              <ScoreBar title="UX" value={result.website_analysis?.ux_score || 0} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <SmallMetricCard label="Título SEO" value={result.website_context?.extractedData?.title} />
            <SmallMetricCard label="Meta Description" value={result.website_context?.extractedData?.metaDescription} />
            <SmallMetricCard label="H1 Principal" value={result.website_context?.extractedData?.h1} />
            <SmallMetricCard label="WhatsApp" value={result.website_context?.extractedData?.whatsapp} />
            <SmallMetricCard label="Email" value={result.website_context?.extractedData?.email} />
            <SmallMetricCard label="Teléfono" value={result.website_context?.extractedData?.phone} />
            <SmallMetricCard label="Formulario" value={result.website_context?.extractedData?.form} />
            <SmallMetricCard label="Carrito" value={result.website_context?.extractedData?.cart} />
            <SmallMetricCard label="Checkout" value={result.website_context?.extractedData?.checkout} />
          </div>
        </>
      )}

      <InsightSection
        eyebrow="Website Signals"
        title="Señales comerciales del sitio web"
        cards={[
          { title: "CTAs detectados", content: result.website_context?.extractedData?.ctas },
          { title: "Nivel SEO", content: result.website_analysis?.seo_level },
          { title: "Nivel de conversión", content: result.website_analysis?.conversion_level },
          { title: "Nivel de confianza", content: result.website_analysis?.trust_level },
          { title: "Diagnóstico web", content: result.website_analysis?.diagnosis },
          { title: "Problema principal", content: result.website_analysis?.main_problem },
          { title: "Oportunidad principal", content: result.website_analysis?.main_opportunity },
          { title: "Acción recomendada", content: result.website_analysis?.recommended_action },
        ]}
      />
    </>
  );
}

function EngagementSection({ result }: { result: any }) {
  return (
    <InsightSection
      eyebrow="Social Maturity"
      title="Engagement y madurez social"
      cards={[
        { title: "Engagement estimado", content: result.social_signals?.estimated_engagement },
        { title: "Lectura de engagement", content: result.social_signals?.engagement_reading },
        { title: "Fuerza de comunidad", content: result.social_signals?.community_strength },
        { title: "Nivel de autoridad", content: result.social_signals?.authority_level },
        { title: "Consistencia de contenido", content: result.social_signals?.content_consistency },
        { title: "Madurez de marca", content: result.social_signals?.brand_maturity },
      ]}
    />
  );
}

function LossesSection({ result }: { result: any }) {
  return (
    <InsightSection
      eyebrow="Current Losses"
      title="Qué está dejando escapar la marca hoy"
      cards={[
        { title: "Atención desaprovechada", content: result.current_losses?.lost_attention },
        { title: "Confianza no capitalizada", content: result.current_losses?.lost_trust },
        { title: "Ventas no capturadas", content: result.current_losses?.lost_sales_opportunity },
        { title: "Posicionamiento no consolidado", content: result.current_losses?.lost_positioning },
        { title: "Comunidad no desarrollada", content: result.current_losses?.lost_community },
        { title: "Lectura estratégica principal", content: result.current_losses?.main_loss_summary },
      ]}
    />
  );
}

function GrowthPotentialSection({ result }: { result: any }) {
  return (
    <>
      <SectionHeading eyebrow="Growth Potential" title="Potencial de crecimiento" />

      <div className="rounded-[34px] bg-slate-950 p-7 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">
          Potencial detectado
        </p>
        <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
          {normalizeText(result.growth_potential?.potential_summary)}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <PotentialCard label="Branding" value={result.growth_potential?.branding_potential} />
        <PotentialCard label="Comunidad" value={result.growth_potential?.community_potential} />
        <PotentialCard label="Ventas" value={result.growth_potential?.sales_potential} />
        <PotentialCard label="Viralidad" value={result.growth_potential?.viral_potential} />
        <PotentialCard label="Escalabilidad" value={result.growth_potential?.scalability_potential} />
      </div>

      <InsightSection
        eyebrow="Growth Reading"
        title="Palancas de crecimiento"
        cards={[
          { title: "Mayor palanca de crecimiento", content: result.growth_potential?.biggest_growth_lever },
          { title: "Escenario a 6 meses", content: result.growth_potential?.six_month_scenario },
        ]}
      />
    </>
  );
}

function CompetitiveSection({ result }: { result: any }) {
  return (
    <InsightSection
      eyebrow="Competitive Intelligence"
      title="Inteligencia competitiva"
      cards={[
        { title: "Realidad del mercado", content: result.competitive_intelligence?.market_reality },
        { title: "Brecha de atención", content: result.competitive_intelligence?.attention_gap },
        { title: "Ventaja de autoridad", content: result.competitive_intelligence?.authority_advantage },
        { title: "Ventaja de contenido", content: result.competitive_intelligence?.content_advantage },
        { title: "Ventaja psicológica", content: result.competitive_intelligence?.psychological_advantage },
        { title: "Amenaza competitiva", content: result.competitive_intelligence?.competitive_threat },
        { title: "Mayor fortaleza competitiva", content: result.competitive_intelligence?.biggest_competitive_strength },
        { title: "Mayor debilidad competitiva", content: result.competitive_intelligence?.biggest_competitive_weakness },
      ]}
    />
  );
}

function MarketOpportunitySection({ result }: { result: any }) {
  return (
    <InsightSection
      eyebrow="Market Opportunity"
      title="Oportunidad de mercado"
      columns="three"
      cards={[
        { title: "Espacio libre identificado", content: result.market_opportunity?.white_space },
        { title: "Ruta de crecimiento más rápida", content: result.market_opportunity?.fastest_growth_path },
        { title: "Categoría que puede dominar", content: result.market_opportunity?.category_ownership },
      ]}
    />
  );
}

function BrandPerceptionSection({ result }: { result: any }) {
  return (
    <InsightSection
      eyebrow="Brand Perception"
      title="Percepción de marca"
      cards={[
        { title: "Percepción actual", content: result.brand_perception?.current_perception },
        { title: "Conexión emocional", content: result.brand_perception?.emotional_connection },
        { title: "Arquetipo de marca", content: result.brand_perception?.brand_archetype },
        { title: "Nivel aspiracional", content: result.brand_perception?.aspirational_level },
      ]}
    />
  );
}

function DeepDiagnosisSection({ result }: { result: any }) {
  return (
    <InsightSection
      eyebrow="Deep Diagnosis"
      title="Diagnóstico profundo"
      cards={[
        { title: "Problema real", content: result.deep_diagnosis?.real_problem },
        { title: "Qué está frenando el crecimiento", content: result.deep_diagnosis?.what_is_killing_growth },
        { title: "Qué se siente genérico", content: result.deep_diagnosis?.what_feels_generic },
        { title: "Factor faltante", content: result.deep_diagnosis?.missing_factor },
      ]}
    />
  );
}

function ContentSalesStrategySection({ result }: { result: any }) {
  return (
    <>
      <InsightSection
        eyebrow="Content Analysis"
        title="Análisis de contenido"
        cards={[
          { title: "Estilo de contenido", content: result.content_analysis?.content_style },
          { title: "Probabilidad de viralidad", content: result.content_analysis?.viral_probability },
          { title: "Problema principal de contenido", content: result.content_analysis?.main_content_problem },
          { title: "Oportunidad de contenido", content: result.content_analysis?.content_opportunity },
          { title: "Dirección recomendada", content: result.content_analysis?.recommended_content_direction },
        ]}
      />

      <InsightSection
        eyebrow="Sales Analysis"
        title="Análisis de ventas"
        cards={[
          { title: "Nivel de conversión", content: result.sales_analysis?.conversion_level },
          { title: "Principal barrera de venta", content: result.sales_analysis?.main_sales_barrier },
          { title: "Nivel de confianza", content: result.sales_analysis?.trust_level },
          { title: "Psicología de compra", content: result.sales_analysis?.purchase_psychology },
        ]}
      />

      <InsightSection
        eyebrow="Competitive Analysis"
        title="Análisis competitivo"
        cards={[
          { title: "Posición en el mercado", content: result.competitive_analysis?.market_position },
          { title: "Riesgo competitivo", content: result.competitive_analysis?.competitive_risk },
          { title: "Ventaja competitiva", content: result.competitive_analysis?.competitive_advantage },
          { title: "Oportunidad vacía del mercado", content: result.competitive_analysis?.market_gap_opportunity },
        ]}
      />

      <InsightSection
        eyebrow="Growth Strategy"
        title="Estrategia de crecimiento"
        cards={[
          { title: "Ángulo de crecimiento", content: result.growth_strategy?.growth_angle },
          { title: "Narrativa recomendada", content: result.growth_strategy?.narrative_recommendation },
          { title: "Estrategia de comunidad", content: result.growth_strategy?.community_strategy },
          { title: "Evolución de marca", content: result.growth_strategy?.brand_evolution },
        ]}
      />
    </>
  );
}

function StrategicBalanceSection({ result }: { result: any }) {
  return (
    <>
      <section className="rounded-[34px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
          Balance estratégico
        </p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <ScoreBar title="Branding" value={result.scores?.branding} />
          <ScoreBar title="Posicionamiento" value={result.scores?.positioning} />
          <ScoreBar title="Diferenciación" value={result.scores?.differentiation} />
          <ScoreBar title="Contenido" value={result.scores?.content_potential} />
          <ScoreBar title="Ventas" value={result.scores?.sales_potential} />
          <ScoreBar title="Presencia digital" value={result.scores?.digital_presence} />
          <ScoreBar title="Escalabilidad" value={result.scores?.scalability} />
          <ScoreBar title="Potencial viral" value={result.scores?.viral_potential} />
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <StrategyCard title="Fortalezas" items={result.fortalezas} color="green" />
        <StrategyCard title="Debilidades" items={result.debilidades} color="red" />
        <StrategyCard title="Oportunidades" items={result.oportunidades} color="purple" />
        <StrategyCard title="Acciones prioritarias" items={result.acciones_prioritarias} color="blue" />
      </div>
    </>
  );
}

function InsightSection({
  eyebrow,
  title,
  cards,
  columns = "two",
}: {
  eyebrow: string;
  title: string;
  cards: { title: string; content: any; featured?: boolean }[];
  columns?: "two" | "three";
}) {
  const gridClass =
    columns === "three"
      ? "grid gap-4 lg:grid-cols-3"
      : "grid gap-4 md:grid-cols-2";

  return (
    <section className="space-y-4">
      <SectionHeading eyebrow={eyebrow} title={title} />

      <div className={gridClass}>
        {cards.map((card) => (
          <InsightCard
            key={card.title}
            title={card.title}
            content={card.content}
            featured={card.featured}
          />
        ))}
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="pt-4">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
        {eyebrow}
      </p>

      <h3 className="mt-2 text-3xl font-black tracking-[-0.055em] text-slate-950">
        {title}
      </h3>
    </div>
  );
}

function PremiumInput({
  name,
  label,
  placeholder,
  value,
  onChange,
  required = false,
}: {
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
        {required ? <span className="text-cyan-600"> *</span> : null}
      </span>

      <input
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
      />
    </label>
  );
}

function PremiumTextarea({
  name,
  label,
  placeholder,
  value,
  onChange,
  rows = 3,
}: {
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
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
        rows={rows}
        className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
      />
    </label>
  );
}

function MetricCard({ label, value }: { label: string; value?: any }) {
  return (
    <div className="overflow-hidden rounded-[30px] bg-slate-950 p-6 text-white shadow-[0_18px_60px_rgba(15,23,42,0.12)]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
        {label}
      </p>

      <p className="mt-4 break-words text-4xl font-black leading-none tracking-[-0.07em]">
        {metricValue(value)}
      </p>
    </div>
  );
}

function DarkPanel({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-[30px] bg-slate-950 p-6 text-white shadow-[0_18px_60px_rgba(15,23,42,0.12)]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
        {label}
      </p>

      <p className="mt-4 text-3xl font-black leading-tight tracking-[-0.06em]">
        {metricValue(value)}
      </p>
    </div>
  );
}

function SmallMetricCard({ label, value }: { label: string; value?: any }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>

      <p className="mt-3 break-words text-xl font-black leading-tight text-slate-950">
        {metricValue(value)}
      </p>
    </div>
  );
}

function InsightCard({
  title,
  content,
  featured = false,
}: {
  title: string;
  content?: any;
  featured?: boolean;
}) {
  return (
    <article
      className={`rounded-[30px] border p-6 ${
        featured
          ? "border-cyan-100 bg-cyan-50"
          : "border-white bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
      }`}
    >
      <p
        className={`text-[10px] font-black uppercase tracking-[0.2em] ${
          featured ? "text-cyan-700" : "text-slate-400"
        }`}
      >
        {title}
      </p>

      <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-slate-700">
        {normalizeText(content)}
      </p>
    </article>
  );
}

function PotentialCard({ label, value }: { label: string; value?: any }) {
  const safeValue = safeNumber(value);

  return (
    <div className="rounded-[28px] border border-white bg-white p-5 text-center shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>

      <p className="mt-3 text-5xl font-black tracking-[-0.08em] text-cyan-700">
        {safeValue}
      </p>

      <p className="mt-1 text-xs font-black text-slate-400">/10</p>
    </div>
  );
}

function ScoreBar({ title, value }: { title: string; value: any }) {
  const safeValue = safeNumber(value);

  return (
    <div>
      <div className="mb-2 flex justify-between gap-3">
        <p className="text-sm font-black text-slate-700">{title}</p>
        <p className="text-sm font-black text-slate-950">{safeValue}/100</p>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-cyan-500 shadow-[0_0_18px_rgba(34,211,238,0.55)]"
          style={{ width: `${clamp(safeValue, 0, 100)}%` }}
        />
      </div>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const safeValue = clamp(value, 0, 100);

  return (
    <div
      className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(#22d3ee ${
          safeValue * 3.6
        }deg, rgba(255,255,255,0.12) 0deg)`,
      }}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-950 ring-8 ring-cyan-400/10">
        <p className="text-2xl font-black">{safeValue}</p>
      </div>
    </div>
  );
}

function DarkMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-black text-white">{value}</p>
    </div>
  );
}

function sourceLabel(source: string) {
  const value = String(source || "").toLowerCase();

  const labels: Record<string, string> = {
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
    website: "Sitio web",
  };

  return labels[value] || source;
}

function metricValue(value: any) {
  const text = normalizeText(value);
  return text || "No detectado";
}

function normalizeText(value: any) {
  if (value === null || value === undefined) {
    return "Sin información suficiente.";
  }

  if (Array.isArray(value)) {
    if (!value.length) return "Sin información suficiente.";
    return value.join("\n");
  }

  if (typeof value === "boolean") {
    return value ? "Detectado" : "No detectado";
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

function safeNumber(value: any) {
  const num = Number(value);

  if (Number.isNaN(num)) return 0;

  return Math.round(num);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}