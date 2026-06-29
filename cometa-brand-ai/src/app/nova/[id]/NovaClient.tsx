"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DiscoveryData = {
  offers: string;
  priority_offer: string;
  average_ticket: string;
  operational_capacity: string;
  real_differentiator: string;
  forbidden_topics: string;
  internal_notes: string;
};

const initialDiscoveryData: DiscoveryData = {
  offers: "",
  priority_offer: "",
  average_ticket: "",
  operational_capacity: "",
  real_differentiator: "",
  forbidden_topics: "",
  internal_notes: "",
};

export default function NovaClient({ analysisId }: { analysisId: string }) {
  const router = useRouter();

  const [analysis, setAnalysis] = useState<any>(null);
  const [businessMemory, setBusinessMemory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [discoveryData, setDiscoveryData] =
    useState<DiscoveryData>(initialDiscoveryData);

  useEffect(() => {
    loadAnalysis();
  }, []);

  const parsedOrion = parseJsonSafely(analysis?.analysis);

  function handleDiscoveryChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setDiscoveryData({
      ...discoveryData,
      [event.target.name]: event.target.value,
    });
  }

  async function loadAnalysis() {
    try {
      const response = await fetch("/api/nova/get-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });

      const data = await response.json();

      if (!data.success) {
        setErrorMessage(data.error || "No se encontró el análisis de ORION.");
        return;
      }

      setAnalysis(data.analysis);
    } catch (error) {
      console.log(error);
      setErrorMessage("Error cargando análisis.");
    } finally {
      setLoading(false);
    }
  }

  async function runBusinessMemory() {
    if (!analysis) return;

    setMemoryLoading(true);
    setErrorMessage("");

    try {
      const parsedBrandAnalysis = parseJsonSafely(analysis.analysis);

      const finalDiscoveryData = {
        offers: discoveryData.offers || "",
        priority_offer: discoveryData.priority_offer || "",
        average_ticket: discoveryData.average_ticket || "",
        operational_capacity: discoveryData.operational_capacity || "",
        real_differentiator: discoveryData.real_differentiator || "",
        forbidden_topics: discoveryData.forbidden_topics
          ? discoveryData.forbidden_topics
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
        internal_notes: discoveryData.internal_notes || "",
      };

      const response = await fetch("/api/generate-business-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandAnalysisId: analysisId,
          brandName: analysis.brand_name,
          industry: analysis.industry,
          city: analysis.city,
          brandAnalysis: parsedBrandAnalysis,
          discoveryData: finalDiscoveryData,
        }),
      });

      const data = await response.json();

      console.log("BUSINESS MEMORY RESPONSE:", data);

      if (!data.success) {
        setErrorMessage(
          data.error || "NOVA no pudo generar el Business Map del negocio."
        );
        return;
      }

      setBusinessMemory(data.businessMemory);

      localStorage.setItem(
        "cometa_selected_business_memory",
        JSON.stringify({
          brandAnalysisId: analysisId,
          brandName: analysis.brand_name,
          industry: analysis.industry,
          city: analysis.city,
          businessMemory: data.businessMemory,
        })
      );

      window.dispatchEvent(new Event("cometa-business-memory-selected"));
    } catch (error) {
      console.log(error);
      setErrorMessage("Error ejecutando NOVA.");
    } finally {
      setMemoryLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-[34px] border border-cyan-100 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
            NOVA
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-950">
            Cargando memoria de ORION...
          </h1>

          <p className="mt-3 text-sm font-semibold leading-7 text-slate-500">
            Recuperando diagnóstico, fuentes validadas y contexto de marca.
          </p>
        </div>
      </main>
    );
  }

  if (errorMessage && !analysis) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 md:p-10">
        <div className="rounded-[34px] border border-rose-100 bg-rose-50 p-8">
          <p className="text-sm font-black text-rose-700">{errorMessage}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-10">
      <section className="mx-auto max-w-7xl space-y-8">
        {!businessMemory ? (
          <>
            <NovaHero analysis={analysis} parsedOrion={parsedOrion} />
            <OrionContextPanel parsedOrion={parsedOrion} />

            <BusinessDiscoveryPanel
              discoveryData={discoveryData}
              onChange={handleDiscoveryChange}
            />

            <NovaActionPanel
              loading={memoryLoading}
              onRun={runBusinessMemory}
            />

            {errorMessage ? <ErrorPanel message={errorMessage} /> : null}
          </>
        ) : (
          <BusinessMemoryResult
            analysis={analysis}
            businessMemory={businessMemory}
            onContinueAtlas={() =>
              router.push(
                `/generate-strategy?brandName=${encodeURIComponent(
                  analysis?.brand_name || ""
                )}`
              )
            }
          />
        )}
      </section>
    </main>
  );
}

function NovaHero({
  analysis,
  parsedOrion,
}: {
  analysis: any;
  parsedOrion: any;
}) {
  const brandScore = safeNumber(parsedOrion?.brand_score);
  const opportunityScore = safeNumber(parsedOrion?.opportunity_level?.score);
  const opportunityLevel = normalizeText(parsedOrion?.opportunity_level?.level);
  const websiteIncluded = parsedOrion?.analysis_scope?.website_included;
  const tiktokIncluded = parsedOrion?.analysis_scope?.tiktok_included;

  return (
    <section className="overflow-hidden rounded-[42px] bg-slate-950 text-white shadow-[0_30px_100px_rgba(15,23,42,0.18)]">
      <div className="relative p-7 md:p-10">
        <div className="absolute right-[-120px] top-[-140px] h-96 w-96 rounded-full bg-blue-500/20 blur-[90px]" />
        <div className="absolute bottom-[-140px] left-[30%] h-80 w-80 rounded-full bg-cyan-400/10 blur-[90px]" />

        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] xl:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-300">
              NOVA · Business Intelligence AI
            </p>

            <h1 className="mt-5 max-w-4xl text-5xl font-black leading-none tracking-[-0.08em] md:text-7xl">
              Construcción de memoria comercial inteligente.
            </h1>

            <p className="mt-6 max-w-3xl text-sm font-semibold leading-8 text-slate-300 md:text-base">
              ORION ya leyó la presencia digital de la marca. Ahora NOVA
              necesita la información interna que solo el negocio conoce para
              crear un Business Map con buyer persona, objeciones, revenue
              drivers, barreras, aceleradores y oportunidades comerciales.
            </p>
          </div>

          <div className="grid gap-3">
            <HeroInfo label="Marca" value={analysis?.brand_name} />
            <HeroInfo label="Industria" value={analysis?.industry} />
            <HeroInfo label="Ciudad" value={analysis?.city} />

            <div className="grid gap-3 sm:grid-cols-2">
              <HeroMetric label="Brand Score" value={`${brandScore}/100`} />
              <HeroMetric
                label="Oportunidad"
                value={
                  opportunityScore
                    ? `${opportunityScore}/100`
                    : opportunityLevel || "Detectada"
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <HeroMetric
                label="Website"
                value={websiteIncluded === false ? "Excluido" : "Incluido"}
              />
              <HeroMetric
                label="TikTok"
                value={tiktokIncluded === false ? "Excluido" : "Bajo peso"}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OrionContextPanel({ parsedOrion }: { parsedOrion: any }) {
  return (
    <section className="rounded-[34px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] md:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
            Contexto heredado de ORION
          </p>

          <h2 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-950">
            NOVA parte del diagnóstico, no de cero.
          </h2>

          <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-600">
            Este módulo toma las señales detectadas por ORION y las combina con
            Business Discovery para construir una memoria comercial que pueda
            ser utilizada por ATLAS, SALES AI y el resto de Cometa OS.
          </p>
        </div>

        <div className="grid min-w-0 gap-3 md:grid-cols-3 lg:min-w-[560px]">
          <MiniStatus
            label="Nivel de marca"
            value={parsedOrion?.brand_level || "Por clasificar"}
          />
          <MiniStatus
            label="Instagram"
            value={
              parsedOrion?.social_signals?.instagram_followers ||
              "No detectado"
            }
          />
          <MiniStatus
            label="Opportunity"
            value={
              parsedOrion?.opportunity_level?.level ||
              parsedOrion?.opportunity_level?.score ||
              "Detectada"
            }
          />
        </div>
      </div>
    </section>
  );
}

function BusinessDiscoveryPanel({
  discoveryData,
  onChange,
}: {
  discoveryData: DiscoveryData;
  onChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
}) {
  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] md:p-8">
      <div className="mb-8">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">
          Business Discovery
        </p>

        <h2 className="mt-2 text-4xl font-black tracking-[-0.065em] text-slate-950">
          Información interna del negocio
        </h2>

        <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-600">
          Completa lo que ORION no puede saber desde afuera: qué vende realmente
          el negocio, qué oferta quiere empujar, cuánto puede atender, qué lo
          hace diferente y qué temas se deben evitar.
        </p>
      </div>

      <div className="grid gap-5">
        <DiscoveryGroup
          eyebrow="01 · Oferta comercial"
          title="Qué vende y qué conviene empujar"
          description="NOVA necesita entender la oferta real para detectar productos prioritarios, revenue drivers y oportunidades de margen."
        >
          <Textarea
            name="offers"
            label="Oferta completa"
            placeholder="Ej. Pijamas de dama, conjuntos satinados, batas, ropa cómoda, mayoreo y menudeo..."
            value={discoveryData.offers}
            onChange={onChange}
          />

          <Input
            name="priority_offer"
            label="Producto o servicio prioritario"
            placeholder="Ej. Pijamas premium de temporada / mayoreo"
            value={discoveryData.priority_offer}
            onChange={onChange}
          />

          <Input
            name="average_ticket"
            label="Ticket promedio"
            placeholder="Ej. $350 menudeo / $2,500 mayoreo"
            value={discoveryData.average_ticket}
            onChange={onChange}
          />
        </DiscoveryGroup>

        <DiscoveryGroup
          eyebrow="02 · Operación"
          title="Capacidad, límites y realidad de entrega"
          description="Esto evita que NOVA recomiende estrategias que el negocio no puede sostener operativamente."
        >
          <Input
            name="operational_capacity"
            label="Capacidad operativa"
            placeholder="Ej. 30 pedidos al día, producción semanal, entregas locales, mayoreo bajo pedido..."
            value={discoveryData.operational_capacity}
            onChange={onChange}
          />

          <Textarea
            name="real_differentiator"
            label="Diferenciador real"
            placeholder="Ej. Diseño propio, calidad de telas, precios de fábrica, entrega rápida, atención personalizada..."
            value={discoveryData.real_differentiator}
            onChange={onChange}
          />
        </DiscoveryGroup>

        <DiscoveryGroup
          eyebrow="03 · Reglas internas"
          title="Qué debe cuidar la estrategia"
          description="NOVA también debe conocer restricciones, temas prohibidos y notas internas para construir una memoria útil y segura."
        >
          <Textarea
            name="forbidden_topics"
            label="Restricciones o temas prohibidos"
            placeholder="Ej. No mencionar precios bajos, no prometer envíos nacionales, no hablar de descuentos permanentes..."
            value={discoveryData.forbidden_topics}
            onChange={onChange}
          />

          <Textarea
            name="internal_notes"
            label="Notas internas"
            placeholder="Ej. El dueño quiere crecer mayoreo, mejorar WhatsApp, posicionarse fuera de Moroleón..."
            value={discoveryData.internal_notes}
            onChange={onChange}
          />
        </DiscoveryGroup>
      </div>
    </section>
  );
}

function NovaActionPanel({
  loading,
  onRun,
}: {
  loading: boolean;
  onRun: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[38px] bg-slate-950 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
      <div className="relative p-7 md:p-8">
        <div className="absolute right-[-90px] top-[-100px] h-72 w-72 rounded-full bg-blue-500/20 blur-[80px]" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
              Siguiente paso
            </p>

            <h2 className="mt-3 text-4xl font-black tracking-[-0.065em]">
              Generar Business Map con NOVA
            </h2>

            <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-300">
              NOVA combinará ORION + Business Discovery para construir memoria
              comercial: buyer persona, tomadores de decisión, barreras,
              aceleradores, revenue drivers, oportunidades y contexto para
              ATLAS.
            </p>
          </div>

          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="min-h-14 shrink-0 rounded-2xl bg-blue-600 px-7 text-sm font-black text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "NOVA está construyendo memoria..."
              : "Generar Business Map con NOVA →"}
          </button>
        </div>
      </div>
    </section>
  );
}

function BusinessMemoryResult({
  analysis,
  businessMemory,
  onContinueAtlas,
}: {
  analysis: any;
  businessMemory: any;
  onContinueAtlas: () => void;
}) {
  return (
    <section className="space-y-7">
      <section className="overflow-hidden rounded-[42px] bg-slate-950 text-white shadow-[0_30px_100px_rgba(15,23,42,0.18)]">
        <div className="relative p-7 md:p-10">
          <div className="absolute right-[-120px] top-[-140px] h-96 w-96 rounded-full bg-blue-500/20 blur-[90px]" />
          <div className="absolute bottom-[-120px] left-[25%] h-80 w-80 rounded-full bg-cyan-400/10 blur-[90px]" />

          <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_420px] xl:items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-300">
                NOVA · Business Map generado
              </p>

              <h1 className="mt-4 max-w-4xl text-5xl font-black leading-none tracking-[-0.08em] md:text-6xl">
                Memoria comercial lista para estrategia.
              </h1>

              <p className="mt-5 max-w-4xl text-sm font-semibold leading-8 text-slate-300 md:text-base">
                {businessMemory.commercial_diagnosis ||
                  businessMemory.main_growth_opportunity ||
                  businessMemory.business_summary ||
                  "NOVA generó la memoria comercial del negocio."}
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onContinueAtlas}
                  className="rounded-2xl bg-white px-7 py-4 text-sm font-black text-slate-950 transition hover:bg-cyan-100"
                >
                  Continuar con ATLAS →
                </button>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-black text-emerald-300">
                  Business Map guardado ✓
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <HeroInfo label="Marca" value={analysis?.brand_name} />
              <HeroInfo label="Industria" value={analysis?.industry} />
              <HeroInfo label="Ciudad" value={analysis?.city} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <InsightHighlight
          icon="🧭"
          title="Oportunidad principal"
          content={businessMemory.main_growth_opportunity}
        />
        <InsightHighlight
          icon="👤"
          title="Buyer principal"
          content={businessMemory.buyer_persona?.primary_persona}
        />
        <InsightHighlight
          icon="💰"
          title="Motor de ingreso"
          content={formatList(businessMemory.revenue_drivers)}
        />
      </section>

      <GridSection
        icon="🏪"
        title="Modelo comercial"
        description="Cómo opera el negocio, a quién vende y cómo se posiciona comercialmente."
        items={[
          ["Modelo de negocio", businessMemory.business_model],
          ["Contexto de industria", businessMemory.industry_context],
          ["Mercado objetivo", businessMemory.target_market],
          ["Posicionamiento", businessMemory.brand_positioning],
        ]}
      />

      <GridSection
        icon="👤"
        title="Buyer Persona"
        description="Perfil de cliente, motivaciones, miedos y disparadores de compra."
        items={[
          ["Persona principal", businessMemory.buyer_persona?.primary_persona],
          ["Persona secundaria", businessMemory.buyer_persona?.secondary_persona],
          ["Necesidades", formatList(businessMemory.buyer_persona?.needs)],
          ["Deseos", formatList(businessMemory.buyer_persona?.desires)],
          ["Miedos", formatList(businessMemory.buyer_persona?.fears)],
          [
            "Disparadores de compra",
            formatList(businessMemory.buyer_persona?.purchase_triggers),
          ],
          [
            "Nivel de confianza",
            `${businessMemory.buyer_persona?.confidence_level || 0}/100`,
          ],
          ["Razón de inferencia", businessMemory.buyer_persona?.inference_reason],
        ]}
      />

      <GridSection
        icon="🛒"
        title="Decisión de compra"
        description="Quién decide, qué influye y cómo ocurre el proceso de compra."
        items={[
          ["Tomadores de decisión", formatList(businessMemory.decision_makers)],
          [
            "Influenciadores de compra",
            formatList(businessMemory.purchase_influencers),
          ],
          ["Proceso de compra", formatList(businessMemory.purchase_process)],
          ["Criterios de compra", formatList(businessMemory.purchase_criteria)],
        ]}
      />

      <GridSection
        icon="💰"
        title="Revenue Drivers"
        description="Qué productos, ofertas o comportamientos pueden mover más ingreso."
        items={[
          ["Ofertas clave", formatList(businessMemory.key_offers)],
          ["Motores de ingreso", formatList(businessMemory.revenue_drivers)],
          [
            "Oportunidades de alto margen",
            formatList(businessMemory.high_margin_opportunities),
          ],
          ["Productos a empujar", formatList(businessMemory.products_to_push)],
          [
            "Recompra / ingreso recurrente",
            formatList(businessMemory.recurring_revenue_opportunities),
          ],
        ]}
      />

      <GridSection
        icon="🧠"
        title="Psicología comercial"
        description="Deseos, miedos y razones emocionales que influyen en la compra."
        items={[
          ["Problema principal", businessMemory.customer_psychology?.main_problem],
          ["Problema oculto", businessMemory.customer_psychology?.hidden_problem],
          ["Deseo principal", businessMemory.customer_psychology?.main_desire],
          ["Miedo principal", businessMemory.customer_psychology?.main_fear],
          [
            "Disparador emocional",
            businessMemory.customer_psychology?.emotional_trigger,
          ],
          [
            "Disparador racional",
            businessMemory.customer_psychology?.rational_trigger,
          ],
          [
            "Disparador de estatus",
            businessMemory.customer_psychology?.status_trigger,
          ],
        ]}
      />

      <GridSection
        icon="🚧"
        title="Barreras y aceleradores"
        description="Qué frena la venta y qué puede acelerar la decisión del cliente."
        items={[
          ["Objeciones", formatList(businessMemory.customer_objections)],
          ["Barreras de venta", formatList(businessMemory.sales_barriers)],
          ["Aceleradores de venta", formatList(businessMemory.sales_accelerators)],
          ["Pruebas necesarias", formatList(businessMemory.proof_needed_to_sell)],
        ]}
      />

      <GridSection
        icon="💎"
        title="Confianza y diferenciación"
        description="Activos que construyen credibilidad, deseo y ventaja comercial."
        items={[
          ["Activos de confianza", formatList(businessMemory.trust_assets)],
          ["Diferenciadores", formatList(businessMemory.differentiators)],
          ["Voz de marca", businessMemory.brand_voice],
          ["Canales de venta", formatList(businessMemory.sales_channels)],
        ]}
      />

      <GridSection
        icon="⚡"
        title="Oportunidades y riesgos"
        description="Acciones rápidas, riesgos operativos y oportunidades comerciales."
        items={[
          [
            "Oportunidades comerciales",
            formatList(businessMemory.commercial_opportunities),
          ],
          ["Quick wins", formatList(businessMemory.quick_wins)],
          ["Riesgos o limitaciones", formatList(businessMemory.risks_or_limitations)],
          [
            "Consideraciones operativas",
            formatList(businessMemory.operational_considerations),
          ],
        ]}
      />

      <GridSection
        icon="🧩"
        title="Journey comercial"
        description="Ruta del cliente desde el primer contacto hasta recompra o retención."
        items={[
          [
            "Generación de prospectos",
            businessMemory.commercial_journey?.lead_generation,
          ],
          ["Calificación", businessMemory.commercial_journey?.qualification],
          ["Propuesta", businessMemory.commercial_journey?.proposal],
          ["Cierre", businessMemory.commercial_journey?.closing],
          ["Retención", businessMemory.commercial_journey?.retention],
        ]}
      />

      <GridSection
        icon="🔎"
        title="Información faltante"
        description="Datos que conviene validar para hacer más precisa la estrategia."
        items={[
          [
            "Información que falta",
            formatList(businessMemory.ai_inferences?.missing_information),
          ],
          [
            "Detectado por ORION",
            formatList(businessMemory.ai_inferences?.what_ai_detected_from_orion),
          ],
          [
            "Declarado por cliente",
            formatList(businessMemory.ai_inferences?.what_client_declared),
          ],
          [
            "Inferido por IA",
            formatList(businessMemory.ai_inferences?.what_ai_inferred),
          ],
        ]}
      />

      <GridSection
        icon="🛰️"
        title="Contexto para ATLAS"
        description="Lo que el siguiente agente debe considerar para construir estrategia."
        items={[
          [
            "Señales relevantes",
            formatList(businessMemory.atlas_context?.relevant_signals_for_strategy),
          ],
          [
            "ATLAS debe considerar",
            formatList(businessMemory.atlas_context?.what_atlas_should_consider),
          ],
          [
            "ATLAS no debe asumir",
            formatList(businessMemory.atlas_context?.what_atlas_should_not_assume),
          ],
          [
            "Notas estratégicas",
            formatList(businessMemory.strategic_notes_for_cometa),
          ],
        ]}
      />

      <div className="overflow-hidden rounded-[38px] bg-slate-950 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
        <div className="relative p-8">
          <div className="absolute right-[-100px] top-[-120px] h-72 w-72 rounded-full bg-cyan-400/10 blur-[80px]" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
                Siguiente agente
              </p>

              <h2 className="mt-3 text-4xl font-black tracking-[-0.065em]">
                Continuar con ATLAS
              </h2>

              <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-300">
                ATLAS usará esta memoria comercial para construir estrategia de
                contenido, comunicación, posicionamiento y crecimiento.
              </p>
            </div>

            <button
              type="button"
              onClick={onContinueAtlas}
              className="min-h-14 shrink-0 rounded-2xl bg-white px-7 text-sm font-black text-slate-950 transition hover:bg-cyan-100"
            >
              Continuar con ATLAS →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function DiscoveryGroup({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-slate-50 p-5 md:p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
        {eyebrow}
      </p>

      <h3 className="mt-2 text-2xl font-black tracking-[-0.055em] text-slate-950">
        {title}
      </h3>

      <p className="mt-2 max-w-4xl text-sm font-semibold leading-7 text-slate-600">
        {description}
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function InsightHighlight({
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
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
          {icon}
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
            {title}
          </p>

          <p className="mt-3 text-sm font-semibold leading-7 text-slate-700">
            {truncateText(normalizeText(content), 260)}
          </p>
        </div>
      </div>
    </article>
  );
}

function GridSection({
  icon,
  title,
  description,
  items,
}: {
  icon?: string;
  title: string;
  description?: string;
  items: [string, any][];
}) {
  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] md:p-8">
      <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] bg-slate-950 text-3xl shadow-[0_18px_60px_rgba(15,23,42,0.12)]">
            {icon || "✦"}
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">
              Business Map
            </p>

            <h3 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-950 md:text-4xl">
              {title}
            </h3>

            {description ? (
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-full bg-blue-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
          NOVA Insight
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map(([label, value]) => (
          <InfoInsightCard key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}

function InfoInsightCard({ label, value }: { label: string; value: any }) {
  return (
    <article className="group rounded-[28px] border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          {label}
        </p>

        <span className="h-2 w-2 rounded-full bg-blue-500 opacity-50 transition group-hover:opacity-100" />
      </div>

      <p className="whitespace-pre-line text-sm font-semibold leading-7 text-slate-700">
        {normalizeText(value)}
      </p>
    </article>
  );
}

function HeroInfo({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black leading-tight text-white">
        {normalizeText(value)}
      </p>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value?: any }) {
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

function MiniStatus({ label, value }: { label: string; value?: any }) {
  return (
    <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-xl font-black leading-tight text-slate-950">
        {normalizeText(value)}
      </p>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-[30px] border border-rose-100 bg-rose-50 p-6">
      <p className="text-sm font-black text-rose-700">{message}</p>
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
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
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
        className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
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
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
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
        className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function parseJsonSafely(value: any) {
  if (!value) return null;

  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatList(value: any) {
  if (!value) return "";

  if (Array.isArray(value)) {
    if (!value.length) return "";
    return value.join("\n");
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
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

function safeNumber(value: any) {
  const num = Number(value);

  if (Number.isNaN(num)) return 0;

  return Math.round(num);
}