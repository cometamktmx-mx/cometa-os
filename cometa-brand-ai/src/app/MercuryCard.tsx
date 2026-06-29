"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";

type ContentPublicationStatus = "draft" | "approved" | "published";
type ContentPublishAction = "approve" | "publish";
type MercuryStatus = "idle" | "loading" | "success" | "error";

type MercuryFormData = {
  packageName: string;
  monthLabel: string;
  monthlyContext: string;
  campaignFocus: string;
};

const initialFormData: MercuryFormData = {
  packageName: "Growth",
  monthLabel: getCurrentMonthLabel(),
  monthlyContext: "",
  campaignFocus: "",
};

export default function MercuryCard() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<MercuryStatus>("idle");
  const [result, setResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [formData, setFormData] = useState<MercuryFormData>(initialFormData);
  const [publicationId, setPublicationId] = useState<string | null>(null);
const [contentStatus, setContentStatus] =
  useState<ContentPublicationStatus>("draft");
const [publicationLoading, setPublicationLoading] = useState(false);
const [internalNotes, setInternalNotes] = useState("");
const [systemMessage, setSystemMessage] = useState("");

  const calendarWeeks = useMemo(() => {
    return Array.isArray(result?.monthly_calendar) ? result.monthly_calendar : [];
  }, [result]);

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  }

  async function executeMercury() {
    const selectedBrand = localStorage.getItem("cometa_selected_brand_analysis");

    if (!selectedBrand) {
      setErrorMessage("Primero selecciona una marca.");
      setStatus("error");
      return;
    }

    let brand: any = null;

    try {
      brand = JSON.parse(selectedBrand);
    } catch {
      setErrorMessage("La marca seleccionada en localStorage no es válida.");
      setStatus("error");
      return;
    }

    const brandName =
      brand?.brandName ||
      brand?.brand_name ||
      brand?.name ||
      brand?.brand ||
      "";

    const brandAnalysisId =
      brand?.brandAnalysisId ||
      brand?.brand_analysis_id ||
      brand?.analysisId ||
      null;

    if (!brandName && !brandAnalysisId) {
      setErrorMessage("La marca seleccionada no tiene brandName ni brandAnalysisId.");
      setStatus("error");
      return;
    }

    setLoading(true);
setStatus("loading");
setErrorMessage("");
setSystemMessage("");
setResult(null);
setPublicationId(null);
setContentStatus("draft");

    try {
      const response = await fetch("/api/generate-content-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandName,
          brandAnalysisId,
          packageName: formData.packageName,
          monthLabel: formData.monthLabel,
          monthlyContext: formData.monthlyContext,
          campaignFocus: formData.campaignFocus,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setStatus("error");
        setErrorMessage(
          data?.debug
            ? `${data.error}\n\nDebug:\n${JSON.stringify(data.debug, null, 2)}`
            : data.error || "MERCURY no pudo generar el plan de contenido."
        );
        return;
      }

      setResult(data.contentPlan);
setStatus("success");
setContentStatus("draft");
setSystemMessage(
  "MERCURY generó un calendario en borrador. Revisa, aprueba y publica cuando esté listo."
);

    } catch (error) {
      console.log(error);
      setStatus("error");
      setErrorMessage("Error ejecutando MERCURY.");
    } finally {
      setLoading(false);
    }
  }

  async function publishContentPlan(action: ContentPublishAction) {
  if (!result) {
    setErrorMessage("Primero debes generar un calendario con MERCURY.");
    return;
  }

  if (action === "publish" && contentStatus !== "approved" && contentStatus !== "published") {
    setErrorMessage("Primero debes aprobar el calendario antes de publicarlo.");
    return;
  }

  const selectedBrand = localStorage.getItem("cometa_selected_brand_analysis");

  if (!selectedBrand) {
    setErrorMessage("Primero selecciona una marca.");
    return;
  }

  let brand: any = null;

  try {
    brand = JSON.parse(selectedBrand);
  } catch {
    setErrorMessage("La marca seleccionada en localStorage no es válida.");
    return;
  }

  const brandName =
    brand?.brandName ||
    brand?.brand_name ||
    brand?.name ||
    brand?.brand ||
    result?.brand_name ||
    "";

  const brandAnalysisId =
    brand?.brandAnalysisId ||
    brand?.brand_analysis_id ||
    brand?.analysisId ||
    result?._cometa_meta?.brand_analysis_id ||
    null;

  if (!brandName) {
    setErrorMessage("No se encontró brandName para publicar el calendario.");
    return;
  }

  setPublicationLoading(true);
  setErrorMessage("");
  setSystemMessage("");

  try {
    const response = await fetch("/api/mercury/publish-content-plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        publicationId,
        brandName,
        brandAnalysisId: brandAnalysisId || null,
        contentPlan: result,
        internalNotes,
        approvedBy: "Cometa",
      }),
    });

    const rawText = await response.text();

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
      setErrorMessage(data.error || "No se pudo guardar el calendario.");
      return;
    }

    setPublicationId(data.publication?.id || null);

    if (action === "approve") {
      setContentStatus("approved");
      setSystemMessage(
        "Calendario aprobado y guardado en Supabase. Todavía no es visible para el cliente hasta que lo publiques."
      );
    }

    if (action === "publish") {
      setContentStatus("published");
      setSystemMessage(
        "Calendario publicado en Supabase. Ya quedó marcado como visible para cliente."
      );
    }
  } catch (error: any) {
    console.error("Error publicando calendario MERCURY:", error);
    setErrorMessage(error?.message || "Error publicando calendario MERCURY.");
  } finally {
    setPublicationLoading(false);
  }
}

  return (
    <section className="space-y-7">
      <section className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <MercuryConfigPanel
          formData={formData}
          loading={loading}
          onChange={handleChange}
          onRun={executeMercury}
        />

        <MercuryReadyPanel status={status} errorMessage={errorMessage} />
      </section>

      {result ? (
  <section className="space-y-7">
    <MercuryPublicationPanel
      contentStatus={contentStatus}
      publicationLoading={publicationLoading}
      internalNotes={internalNotes}
      systemMessage={systemMessage}
      onInternalNotesChange={setInternalNotes}
      onApprove={() => publishContentPlan("approve")}
      onPublish={() => publishContentPlan("publish")}
    />

    <MercurySummary result={result} />

          <section className="grid gap-5 lg:grid-cols-3">
            <CommandCard
              label="Tema del mes"
              title={result?.content_strategy?.monthly_theme}
              text={result?.content_strategy?.strategic_focus}
            />
            <CommandCard
              label="Meta de conversión"
              title={result?.content_strategy?.main_conversion_goal}
              text={result?.content_strategy?.main_message_of_the_month}
            />
            <CommandCard
              label="Campaña mensual"
              title={result?.monthly_campaign_concept?.campaign_name}
              text={result?.monthly_campaign_concept?.campaign_idea}
            />
          </section>

          <PillarMixSection pillars={result?.pillar_mix} />

          <CalendarSection weeks={calendarWeeks} />

          <section className="grid gap-7 xl:grid-cols-2">
            <PipelineSection
              title="Reels Pipeline"
              description="Ideas listas para grabación, con hook, estructura y tomas necesarias."
              items={result?.reels_pipeline}
              type="reels"
            />

            <PipelineSection
              title="Post Pipeline"
              description="Ideas listas para diseño, copy y publicación."
              items={result?.post_pipeline}
              type="posts"
            />
          </section>

          <section className="grid gap-7 xl:grid-cols-2">
            <ProductionSection production={result?.production_plan} />
            <SalesAlignmentSection salesAlignment={result?.sales_alignment} />
          </section>

          <CopyBankSection copyBank={result?.copy_bank} />

          <QualityControlSection
            qualityControl={result?.quality_control}
            recommendation={result?.mercury_recommendation}
          />
        </section>
      ) : null}
    </section>
  );
}
function MercuryPublicationPanel({
  contentStatus,
  publicationLoading,
  internalNotes,
  systemMessage,
  onInternalNotesChange,
  onApprove,
  onPublish,
}: {
  contentStatus: ContentPublicationStatus;
  publicationLoading: boolean;
  internalNotes: string;
  systemMessage: string;
  onInternalNotesChange: (value: string) => void;
  onApprove: () => void;
  onPublish: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[34px] border border-purple-100 bg-purple-50 shadow-[0_18px_60px_rgba(15,23,42,0.04)]">
      <div className="grid gap-6 p-7 xl:grid-cols-[minmax(0,1fr)_380px] md:p-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-700">
            Mercury Approval Flow
          </p>

          <h3 className="mt-3 text-4xl font-black leading-none tracking-[-0.065em] text-slate-950">
            Revisión y publicación del calendario.
          </h3>

          <p className="mt-4 max-w-4xl text-sm font-semibold leading-8 text-slate-700">
            MERCURY ya generó el calendario. Ahora Cometa puede aprobarlo
            internamente o publicarlo para que el cliente vea únicamente la
            versión validada.
          </p>

          {systemMessage ? (
            <div className="mt-5 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm font-black text-cyan-800">
              {systemMessage}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onApprove}
              disabled={publicationLoading || contentStatus === "published"}
              className="rounded-2xl bg-emerald-400 px-7 py-4 text-sm font-black text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publicationLoading
                ? "Guardando..."
                : contentStatus === "published"
                  ? "Aprobado"
                  : contentStatus === "approved"
                    ? "Aprobado"
                    : "Aprobar calendario"}
            </button>

            <button
              type="button"
              onClick={onPublish}
              disabled={publicationLoading || contentStatus === "published"}
              className="rounded-2xl bg-slate-950 px-7 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publicationLoading
                ? "Publicando..."
                : contentStatus === "published"
                  ? "Publicado"
                  : "Publicar al cliente"}
            </button>
          </div>
        </div>

        <aside className="rounded-[28px] border border-white bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Estado
              </p>

              <p className="mt-1 text-2xl font-black tracking-[-0.05em] text-slate-950">
                {getContentStatusLabel(contentStatus)}
              </p>
            </div>

            <span
              className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${getContentStatusClass(
                contentStatus
              )}`}
            >
              {contentStatus}
            </span>
          </div>

          <label className="mt-5 grid gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Notas internas Cometa
            </span>

            <textarea
              value={internalNotes}
              onChange={(event) => onInternalNotesChange(event.target.value)}
              rows={7}
              placeholder="Ej. ajustes pendientes, piezas que requieren autorización, producción necesaria, cambios del cliente..."
              className="resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-300 focus:bg-white focus:ring-4 focus:ring-purple-100"
            />
          </label>
        </aside>
      </div>
    </section>
  );
}

function MercuryConfigPanel({
  formData,
  loading,
  onChange,
  onRun,
}: {
  formData: MercuryFormData;
  loading: boolean;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => void;
  onRun: () => void;
}) {
  return (
    <aside className="h-fit rounded-[34px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-600">
        Variables de ejecución
      </p>

      <h3 className="mt-3 text-4xl font-black leading-none tracking-[-0.065em] text-slate-950">
        Configurar MERCURY
      </h3>

      <p className="mt-3 text-sm font-semibold leading-7 text-slate-500">
        Estas variables no cambian la estrategia de ATLAS. Solo ayudan a MERCURY
        a convertirla en contenido ejecutable del mes.
      </p>

      <div className="mt-6 space-y-4">
        <label className="grid gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Paquete operativo
          </span>

          <select
            name="packageName"
            value={formData.packageName}
            onChange={onChange}
            className="h-14 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-purple-300 focus:bg-white focus:ring-4 focus:ring-purple-100"
          >
            <option value="Starter">Starter</option>
            <option value="Growth">Growth</option>
            <option value="Scale">Scale</option>
            <option value="Dominio">Dominio</option>
          </select>
        </label>

        <Input
          name="monthLabel"
          label="Mes de trabajo"
          placeholder="Ej. julio 2026"
          value={formData.monthLabel}
          onChange={onChange}
        />

        <Textarea
          name="monthlyContext"
          label="Contexto del mes"
          placeholder="Ej. lanzamiento, temporada alta, promo, cambio de inventario, nueva campaña..."
          value={formData.monthlyContext}
          onChange={onChange}
        />

        <Textarea
          name="campaignFocus"
          label="Enfoque de campaña"
          placeholder="Ej. empujar WhatsApp, destacar producto estrella, aumentar confianza, vender mayoreo..."
          value={formData.campaignFocus}
          onChange={onChange}
        />

        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="min-h-14 w-full rounded-2xl bg-purple-600 px-6 text-sm font-black text-white shadow-lg shadow-purple-950/10 transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "MERCURY trabajando..." : "Ejecutar MERCURY →"}
        </button>
      </div>
    </aside>
  );
}

function MercuryReadyPanel({
  status,
  errorMessage,
}: {
  status: MercuryStatus;
  errorMessage: string;
}) {
  return (
    <section className="rounded-[34px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-600">
            Execution Layer
          </p>

          <h3 className="mt-3 text-5xl font-black leading-none tracking-[-0.075em] text-slate-950">
            MERCURY no cambia la estrategia.
          </h3>

          <p className="mt-4 max-w-4xl text-sm font-semibold leading-8 text-slate-600">
            ATLAS decide qué debe crecer. MERCURY decide cómo comunicarlo y cómo
            organizarlo en contenido mensual ejecutable.
          </p>
        </div>

        <div className="grid gap-3">
          <MiniStat label="Lee" value="ORION + NOVA + ATLAS" />
          <MiniStat label="Genera" value="Contenido + calendario" />
          <MiniStat label="Estado" value={getStatusLabel(status)} />
        </div>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-3">
        <ReadyCard icon="🧠" title="ATLAS" text="Estrategia de crecimiento." />
        <ReadyCard icon="🎬" title="MERCURY" text="Contenido mensual." />
        <ReadyCard icon="🗓️" title="Calendar Engine" text="Calendario ejecutable." />
      </div>

      {status === "error" && errorMessage ? (
        <pre className="mt-6 whitespace-pre-wrap rounded-2xl border border-rose-100 bg-rose-50 p-5 text-sm font-bold leading-7 text-rose-700">
          {errorMessage}
        </pre>
      ) : null}

      {status === "loading" ? (
        <div className="mt-6 rounded-2xl border border-purple-100 bg-purple-50 p-5">
          <p className="text-sm font-black text-purple-700">
            MERCURY está leyendo ORION, NOVA y ATLAS para construir el calendario.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function MercurySummary({ result }: { result: any }) {
  return (
    <section className="overflow-hidden rounded-[38px] border border-purple-100 bg-purple-50 shadow-[0_18px_60px_rgba(15,23,42,0.04)]">
      <div className="grid gap-6 p-7 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-end md:p-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-700">
            MERCURY Output
          </p>

          <h3 className="mt-3 max-w-4xl text-5xl font-black leading-none tracking-[-0.075em] text-slate-950">
            {normalizeText(result?.content_strategy?.monthly_theme)}
          </h3>

          <p className="mt-4 max-w-4xl text-sm font-semibold leading-8 text-slate-700">
            {normalizeText(result?.content_strategy?.content_positioning)}
          </p>
        </div>

        <div className="grid gap-3">
          <MiniStat label="Mes" value={result?.month} />
          <MiniStat label="Marca" value={result?.brand_name} />
          <MiniStat
            label="Versión"
            value={result?.version || result?._cometa_meta?.version}
          />
        </div>
      </div>
    </section>
  );
}

function PillarMixSection({ pillars }: { pillars: any }) {
  const list = Array.isArray(pillars) ? pillars : [];

  return (
    <section className="rounded-[34px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <SectionHeader
        eyebrow="Content System"
        title="Pilares del mes"
        description="Distribución estratégica de contenido según ATLAS, NOVA y la ejecución posible."
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.length ? (
          list.map((pillar: any, index: number) => (
            <article
              key={`${pillar?.pillar || "pillar"}-${index}`}
              className="rounded-[28px] border border-purple-100 bg-purple-50 p-6"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-700">
                {pillar?.percentage || 0}% del mes
              </p>

              <h4 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-950">
                {normalizeText(pillar?.pillar)}
              </h4>

              <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
                {normalizeText(pillar?.business_reason || pillar?.strategic_role)}
              </p>

              <div className="mt-5 rounded-2xl bg-white/80 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Ángulos sugeridos
                </p>

                <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-7 text-slate-600">
                  {formatList(pillar?.example_angles)}
                </p>
              </div>
            </article>
          ))
        ) : (
          <EmptyState text="MERCURY no devolvió pillar_mix." />
        )}
      </div>
    </section>
  );
}

function CalendarSection({ weeks }: { weeks: any[] }) {
  return (
    <section className="rounded-[34px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <SectionHeader
        eyebrow="Calendar Engine"
        title="Calendario editorial mensual"
        description="Borrador limpio para revisión interna. Se muestran primero las publicaciones activas y se resumen los días sin feed."
      />

      <div className="mt-6 space-y-5">
        {weeks.length ? (
          weeks.map((week: any, index: number) => (
            <WeekCard key={`week-${index}`} week={week} />
          ))
        ) : (
          <EmptyState text="MERCURY no devolvió monthly_calendar." />
        )}
      </div>
    </section>
  );
}

function WeekCard({ week }: { week: any }) {
  const items = Array.isArray(week?.items) ? week.items : [];
  const activeItems = items.filter((item: any) => !isNoFeedItem(item));
  const inactiveItems = items.filter((item: any) => isNoFeedItem(item));

  return (
    <article className="rounded-[30px] border border-slate-200 bg-slate-50 p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600">
            Semana {week?.week || "-"}
          </p>

          <h4 className="mt-2 text-3xl font-black leading-tight tracking-[-0.06em] text-slate-950">
            {normalizeText(week?.week_goal)}
          </h4>

          <p className="mt-2 text-sm font-semibold leading-7 text-slate-600">
            {normalizeText(week?.week_message)}
          </p>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Ritmo de la semana
          </p>

          <p className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-950">
            {activeItems.length}
          </p>

          <p className="text-sm font-semibold text-slate-500">
            publicaciones de feed
          </p>

          {inactiveItems.length ? (
            <div className="mt-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                Sin feed
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {inactiveItems.map((item: any, index: number) => (
                  <span
                    key={`${item?.day || "inactive"}-${index}`}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500"
                  >
                    {normalizeText(item?.day)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {activeItems.length ? (
          activeItems.map((item: any, index: number) => (
            <ContentItemCard key={`${item?.day || "item"}-${index}`} item={item} />
          ))
        ) : (
          <EmptyState text="Esta semana no tiene publicaciones activas de feed." />
        )}
      </div>
    </article>
  );
}

function ContentItemCard({ item }: { item: any }) {
  return (
    <article className="rounded-[28px] border border-purple-100 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
          {normalizeText(item?.day)}
        </span>

        <span className="rounded-full bg-purple-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-purple-700">
          {normalizeText(item?.format)}
        </span>

        <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">
          {normalizeText(item?.platform)}
        </span>
      </div>

      <h5 className="mt-4 text-2xl font-black leading-tight tracking-[-0.055em] text-slate-950">
        {normalizeText(item?.concept)}
      </h5>

      <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
        {normalizeText(item?.hook)}
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <InfoBox label="Objetivo" value={item?.business_objective} compact />
        <InfoBox label="Pilar" value={item?.pillar} compact />
        <InfoBox label="CTA" value={item?.cta} compact />
        <InfoBox
          label="Conexión con SALES AI"
          value={item?.sales_ai_connection}
          compact
        />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          Brief creativo
        </p>

        <p className="mt-2 text-sm font-semibold leading-7 text-slate-700">
          {normalizeText(item?.creative_brief)}
        </p>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          Producción
        </p>

        <p className="mt-2 text-sm font-semibold leading-7 text-slate-700">
          {normalizeText(item?.production_notes)}
        </p>
      </div>
    </article>
  );
}

function PipelineSection({
  title,
  description,
  items,
  type,
}: {
  title: string;
  description: string;
  items: any;
  type: "reels" | "posts";
}) {
  const list = Array.isArray(items) ? items : [];

  return (
    <section className="rounded-[34px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <SectionHeader eyebrow="Pipeline" title={title} description={description} />

      <div className="mt-6 space-y-4">
        {list.length ? (
          list.map((item: any, index: number) => (
            <article
              key={`${item?.title || "pipeline"}-${index}`}
              className="rounded-[26px] border border-slate-200 bg-slate-50 p-5"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600">
                {type === "reels" ? "Reel" : item?.format || "Post"} {index + 1}
              </p>

              <h4 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                {normalizeText(item?.title)}
              </h4>

              <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
                {normalizeText(
                  type === "reels"
                    ? item?.script_structure
                    : item?.design_brief || item?.copy_angle
                )}
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <InfoBox label="Hook" value={item?.hook || item?.copy_angle} compact />
                <InfoBox label="CTA" value={item?.cta} compact />
                <InfoBox label="Objetivo" value={item?.objective} compact />
                <InfoBox
                  label={type === "reels" ? "Tomas necesarias" : "Pilar"}
                  value={
                    type === "reels"
                      ? formatList(item?.shots_needed)
                      : item?.pillar
                  }
                  compact
                />
              </div>
            </article>
          ))
        ) : (
          <EmptyState text={`MERCURY no devolvió ${title}.`} />
        )}
      </div>
    </section>
  );
}

function ProductionSection({ production }: { production: any }) {
  return (
    <section className="rounded-[34px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <SectionHeader
        eyebrow="Production"
        title="Plan de producción"
        description="Lista práctica para sesión, diseño y levantamiento de contenido."
      />

      <div className="mt-6 grid gap-3">
        <InfoBox
          label="Qué grabar primero"
          value={formatList(production?.recording_priority)}
        />
        <InfoBox label="Fotos necesarias" value={formatList(production?.photos_needed)} />
        <InfoBox label="Videos necesarios" value={formatList(production?.videos_needed)} />
        <InfoBox label="Tomas prioritarias" value={formatList(production?.priority_shots)} />
        <InfoBox
          label="Material del cliente"
          value={formatList(production?.client_material_needed)}
        />
      </div>
    </section>
  );
}

function SalesAlignmentSection({ salesAlignment }: { salesAlignment: any }) {
  return (
    <section className="rounded-[34px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <SectionHeader
        eyebrow="Sales AI Alignment"
        title="Alineación con ventas"
        description="Cómo el contenido debe alimentar mejores conversaciones en WhatsApp."
      />

      <div className="mt-6 grid gap-3">
        <InfoBox
          label="Qué debe provocar el contenido"
          value={formatList(salesAlignment?.what_content_should_make_people_ask)}
        />
        <InfoBox
          label="Preguntas esperadas"
          value={formatList(salesAlignment?.questions_sales_ai_should_expect)}
        />
        <InfoBox
          label="Objeciones a prevenir"
          value={formatList(salesAlignment?.objections_content_should_prehandle)}
        />
        <InfoBox
          label="Entradas a WhatsApp"
          value={formatList(salesAlignment?.recommended_whatsapp_entry_points)}
        />
      </div>
    </section>
  );
}

function CopyBankSection({ copyBank }: { copyBank: any }) {
  return (
    <section className="rounded-[34px] border border-white bg-white p-7 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <SectionHeader
        eyebrow="Copy Bank"
        title="Banco creativo"
        description="Hooks, CTAs y arranques de caption para acelerar ejecución."
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <InfoBox label="Hooks" value={formatList(copyBank?.hooks)} />
        <InfoBox label="CTAs" value={formatList(copyBank?.ctas)} />
        <InfoBox
          label="Caption starters"
          value={formatList(copyBank?.caption_starters)}
        />
        <InfoBox label="Story prompts" value={formatList(copyBank?.story_prompts)} />
      </div>
    </section>
  );
}

function QualityControlSection({
  qualityControl,
  recommendation,
}: {
  qualityControl: any;
  recommendation: any;
}) {
  return (
    <section className="rounded-[34px] border border-cyan-100 bg-cyan-50 p-7">
      <SectionHeader
        eyebrow="Cometa Review"
        title="Control de calidad"
        description="MERCURY deja notas para revisar antes de publicar."
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <InfoBox
          label="Revisar antes de publicar"
          value={formatList(qualityControl?.review_before_publishing)}
        />
        <InfoBox
          label="Riesgo genérico"
          value={qualityControl?.risk_of_generic_content}
        />
        <InfoBox label="Qué grabar primero" value={recommendation?.what_to_record_first} />
        <InfoBox label="Qué diseñar primero" value={recommendation?.what_to_design_first} />
        <InfoBox label="Riesgo principal" value={recommendation?.main_risk} />
        <InfoBox
          label="Aprendizaje siguiente ciclo"
          value={recommendation?.next_cycle_learning}
        />
      </div>
    </section>
  );
}

function CommandCard({
  label,
  title,
  text,
}: {
  label: string;
  title: any;
  text: any;
}) {
  return (
    <article className="rounded-[30px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-600">
        {label}
      </p>

      <h4 className="mt-3 text-2xl font-black tracking-[-0.05em] text-slate-950">
        {normalizeText(title)}
      </h4>

      <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
        {normalizeText(text)}
      </p>
    </article>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-600">
        {eyebrow}
      </p>

      <h3 className="mt-2 text-4xl font-black tracking-[-0.065em] text-slate-950">
        {title}
      </h3>

      <p className="mt-2 max-w-4xl text-sm font-semibold leading-7 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function InfoBox({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: any;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white ${compact ? "p-3" : "p-4"}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700">
        {normalizeText(value)}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl border border-purple-100 bg-white/80 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-purple-600">
        {label}
      </p>

      <p className="mt-1 text-lg font-black text-slate-950">
        {normalizeText(value)}
      </p>
    </div>
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
    <article className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-2xl">{icon}</p>

      <h4 className="mt-3 text-xl font-black tracking-[-0.04em] text-slate-950">
        {title}
      </h4>

      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        {text}
      </p>
    </article>
  );
}

function Input({
  name,
  label,
  placeholder,
  value,
  onChange,
}: {
  name: keyof MercuryFormData;
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
        className="h-14 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-300 focus:bg-white focus:ring-4 focus:ring-purple-100"
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
  name: keyof MercuryFormData;
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
        className="resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-purple-300 focus:bg-white focus:ring-4 focus:ring-purple-100"
      />
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm font-bold text-slate-500">
      {text}
    </div>
  );
}

function getContentStatusLabel(status: ContentPublicationStatus) {
  if (status === "approved") return "Aprobado";
  if (status === "published") return "Publicado";
  return "Borrador";
}

function getContentStatusClass(status: ContentPublicationStatus) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "published") return "bg-purple-100 text-purple-700";
  return "bg-amber-50 text-amber-700";
}

function getStatusLabel(status: MercuryStatus) {
  if (status === "loading") return "Generando";
  if (status === "success") return "Plan listo";
  if (status === "error") return "Error";
  return "Sin ejecutar";
}

function getCurrentMonthLabel() {
  const now = new Date();

  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(now);
}

function isNoFeedItem(item: any) {
  return (
    item?.publish_status === "Sin publicación de feed" ||
    item?.format === "Sin publicación" ||
    item?.platform === "No aplica"
  );
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

function formatList(value: any) {
  if (!Array.isArray(value)) return normalizeText(value);
  if (!value.length) return "Sin información suficiente.";

  return value
    .map((item, index) => {
      if (typeof item === "object") {
        return `${index + 1}. ${JSON.stringify(item)}`;
      }

      return `${index + 1}. ${item}`;
    })
    .join("\n");
}