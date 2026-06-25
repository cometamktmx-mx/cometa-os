"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function NovaClient({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<any>(null);
  const [businessMemory, setBusinessMemory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [discoveryData, setDiscoveryData] = useState({
    offers: "",
    priority_offer: "",
    average_ticket: "",
    operational_capacity: "",
    real_differentiator: "",
    forbidden_topics: "",
    internal_notes: "",
  });

  useEffect(() => {
    loadAnalysis();
  }, []);

  function handleDiscoveryChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setDiscoveryData({
      ...discoveryData,
      [e.target.name]: e.target.value,
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
      let parsedBrandAnalysis = null;

      try {
        parsedBrandAnalysis =
          typeof analysis.analysis === "string"
            ? JSON.parse(analysis.analysis)
            : analysis.analysis;
      } catch {
        parsedBrandAnalysis = analysis.analysis;
      }

      const finalDiscoveryData = {
        offers: discoveryData.offers || "",
        priority_offer: discoveryData.priority_offer || "",
        average_ticket: discoveryData.average_ticket || "",
        operational_capacity: discoveryData.operational_capacity || "",
        real_differentiator: discoveryData.real_differentiator || "",
        forbidden_topics: discoveryData.forbidden_topics
          ? discoveryData.forbidden_topics.split(",").map((item) => item.trim())
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
          data.error || "Business Memory no pudo generar la memoria del negocio."
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
      setErrorMessage("Error ejecutando Business Memory.");
    } finally {
      setMemoryLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-xl font-bold">Cargando análisis ORION...</p>
      </main>
    );
  }

  if (errorMessage && !analysis) {
    return (
      <main className="min-h-screen p-10 bg-slate-50">
        <div className="bg-red-50 border border-red-200 rounded-3xl p-8">
          <p className="text-red-700 font-bold">{errorMessage}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-10 bg-slate-50">
      <section className="bg-white rounded-3xl p-10 shadow-sm border border-slate-200">
        <p className="text-blue-600 font-bold mb-2">
          BUSINESS MEMORY · COMETA OS
        </p>

        <h1 className="text-4xl font-black mb-6">
          Memoria comercial del negocio
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <InfoCard title="Marca" value={analysis?.brand_name} />
          <InfoCard title="Industria" value={analysis?.industry} />
          <InfoCard title="Ciudad" value={analysis?.city} />
        </div>

        {!businessMemory && (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 mb-8 shadow-sm">
            <p className="text-blue-600 font-bold mb-2">BUSINESS DISCOVERY</p>

            <h2 className="text-2xl font-black text-slate-900 mb-4">
              Información interna del negocio
            </h2>

            <p className="text-slate-600 leading-7 mb-6">
              ORION ya analizó la marca. Business Memory necesita lo que solo el
              negocio sabe: oferta, ticket, capacidad, diferenciador y
              restricciones.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Textarea
                name="offers"
                placeholder="Oferta completa: productos o servicios principales"
                value={discoveryData.offers}
                onChange={handleDiscoveryChange}
              />

              <Input
                name="priority_offer"
                placeholder="Producto o servicio prioritario"
                value={discoveryData.priority_offer}
                onChange={handleDiscoveryChange}
              />

              <Input
                name="average_ticket"
                placeholder="Ticket promedio"
                value={discoveryData.average_ticket}
                onChange={handleDiscoveryChange}
              />

              <Input
                name="operational_capacity"
                placeholder="Capacidad operativa: pedidos, citas, producción, tiempos"
                value={discoveryData.operational_capacity}
                onChange={handleDiscoveryChange}
              />

              <Textarea
                name="real_differentiator"
                placeholder="Diferenciador real"
                value={discoveryData.real_differentiator}
                onChange={handleDiscoveryChange}
              />

              <Textarea
                name="forbidden_topics"
                placeholder="Restricciones o temas prohibidos separados por coma"
                value={discoveryData.forbidden_topics}
                onChange={handleDiscoveryChange}
              />

              <Textarea
                name="internal_notes"
                placeholder="Notas internas"
                value={discoveryData.internal_notes}
                onChange={handleDiscoveryChange}
              />
            </div>
          </div>
        )}

        {!businessMemory && (
          <div className="bg-slate-900 text-white rounded-3xl p-8">
            <p className="text-blue-300 font-bold mb-2">SIGUIENTE PASO</p>

            <h2 className="text-2xl font-black mb-4">
              Construir Business Memory
            </h2>

            <p className="text-slate-300 leading-7 mb-6">
              Business Memory convertirá ORION + Business Discovery en memoria
              comercial: buyer persona, tomadores de decisión, barreras,
              aceleradores, revenue drivers y oportunidades.
            </p>

            <button
              onClick={runBusinessMemory}
              disabled={memoryLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black px-6 py-4 rounded-2xl transition"
            >
              {memoryLoading
                ? "Construyendo Business Memory..."
                : "Construir Business Memory →"}
            </button>
          </div>
        )}

        {errorMessage && analysis && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-3xl p-6">
            <p className="text-red-700 font-bold">{errorMessage}</p>
          </div>
        )}
      </section>

      {businessMemory && (
        <section className="mt-8 space-y-6">
          <div className="bg-blue-600 text-white rounded-3xl p-8 shadow-sm">
            <p className="text-blue-100 font-bold mb-2">
              BUSINESS MEMORY GENERADO
            </p>

            <h2 className="text-3xl font-black mb-4">
              {businessMemory.business_summary || "Memoria comercial"}
            </h2>

            <p className="text-blue-50 leading-8">
              {businessMemory.commercial_diagnosis ||
                businessMemory.main_growth_opportunity ||
                "Business Memory generó la memoria comercial del negocio."}
            </p>
          </div>

          <GridSection
            title="Modelo comercial"
            items={[
              ["Modelo de negocio", businessMemory.business_model],
              ["Contexto de industria", businessMemory.industry_context],
              ["Mercado objetivo", businessMemory.target_market],
              ["Posicionamiento", businessMemory.brand_positioning],
            ]}
          />

          <GridSection
            title="Buyer Persona"
            items={[
              ["Persona principal", businessMemory.buyer_persona?.primary_persona],
              [
                "Persona secundaria",
                businessMemory.buyer_persona?.secondary_persona,
              ],
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
              [
                "Razón de inferencia",
                businessMemory.buyer_persona?.inference_reason,
              ],
            ]}
          />

          <GridSection
            title="Decisión de compra"
            items={[
              [
                "Tomadores de decisión",
                formatList(businessMemory.decision_makers),
              ],
              [
                "Influenciadores de compra",
                formatList(businessMemory.purchase_influencers),
              ],
              [
                "Proceso de compra",
                formatList(businessMemory.purchase_process),
              ],
              [
                "Criterios de compra",
                formatList(businessMemory.purchase_criteria),
              ],
            ]}
          />

          <GridSection
            title="Revenue Drivers"
            items={[
              ["Ofertas clave", formatList(businessMemory.key_offers)],
              [
                "Motores de ingreso",
                formatList(businessMemory.revenue_drivers),
              ],
              [
                "Oportunidades de alto margen",
                formatList(businessMemory.high_margin_opportunities),
              ],
              [
                "Productos a empujar",
                formatList(businessMemory.products_to_push),
              ],
              [
                "Recompra / ingreso recurrente",
                formatList(businessMemory.recurring_revenue_opportunities),
              ],
            ]}
          />

          <GridSection
            title="Psicología comercial"
            items={[
              [
                "Problema principal",
                businessMemory.customer_psychology?.main_problem,
              ],
              [
                "Problema oculto",
                businessMemory.customer_psychology?.hidden_problem,
              ],
              [
                "Deseo principal",
                businessMemory.customer_psychology?.main_desire,
              ],
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
            title="Barreras y aceleradores de venta"
            items={[
              ["Objeciones", formatList(businessMemory.customer_objections)],
              [
                "Barreras de venta",
                formatList(businessMemory.sales_barriers),
              ],
              [
                "Aceleradores de venta",
                formatList(businessMemory.sales_accelerators),
              ],
              [
                "Pruebas necesarias",
                formatList(businessMemory.proof_needed_to_sell),
              ],
            ]}
          />

          <GridSection
            title="Confianza y diferenciación"
            items={[
              [
                "Activos de confianza",
                formatList(businessMemory.trust_assets),
              ],
              ["Diferenciadores", formatList(businessMemory.differentiators)],
              ["Voz de marca", businessMemory.brand_voice],
              ["Canales de venta", formatList(businessMemory.sales_channels)],
            ]}
          />

          <GridSection
            title="Oportunidades y riesgos"
            items={[
              [
                "Oportunidades comerciales",
                formatList(businessMemory.commercial_opportunities),
              ],
              ["Quick wins", formatList(businessMemory.quick_wins)],
              [
                "Riesgos o limitaciones",
                formatList(businessMemory.risks_or_limitations),
              ],
              [
                "Consideraciones operativas",
                formatList(businessMemory.operational_considerations),
              ],
            ]}
          />

          <GridSection
            title="Journey comercial"
            items={[
              [
                "Generación de prospectos",
                businessMemory.commercial_journey?.lead_generation,
              ],
              [
                "Calificación",
                businessMemory.commercial_journey?.qualification,
              ],
              ["Propuesta", businessMemory.commercial_journey?.proposal],
              ["Cierre", businessMemory.commercial_journey?.closing],
              ["Retención", businessMemory.commercial_journey?.retention],
            ]}
          />

          <GridSection
            title="Información faltante"
            items={[
              [
                "Información que falta",
                formatList(businessMemory.ai_inferences?.missing_information),
              ],
              [
                "Detectado por ORION",
                formatList(
                  businessMemory.ai_inferences?.what_ai_detected_from_orion
                ),
              ],
              [
                "Declarado por cliente",
                formatList(
                  businessMemory.ai_inferences?.what_client_declared
                ),
              ],
              [
                "Inferido por IA",
                formatList(businessMemory.ai_inferences?.what_ai_inferred),
              ],
            ]}
          />

          <GridSection
            title="Contexto para ATLAS"
            items={[
              [
                "Señales relevantes para estrategia",
                formatList(
                  businessMemory.atlas_context?.relevant_signals_for_strategy
                ),
              ],
              [
                "ATLAS debe considerar",
                formatList(
                  businessMemory.atlas_context?.what_atlas_should_consider
                ),
              ],
              [
                "ATLAS no debe asumir",
                formatList(
                  businessMemory.atlas_context?.what_atlas_should_not_assume
                ),
              ],
              [
                "Notas estratégicas",
                formatList(businessMemory.strategic_notes_for_cometa),
              ],
            ]}
          />

          <div className="bg-slate-900 text-white rounded-3xl p-8">
            <p className="text-blue-300 font-bold mb-2">SIGUIENTE PASO</p>

            <h2 className="text-2xl font-black mb-4">Continuar con ATLAS</h2>

            <p className="text-slate-300 leading-7 mb-6">
              ATLAS usará esta memoria comercial para construir la estrategia de
              contenido, comunicación y crecimiento.
            </p>

            <button
  onClick={() =>
    router.push(
      `/generate-strategy?brandName=${encodeURIComponent(
        analysis?.brand_name || ""
      )}`
    )
  }
  className="bg-white text-slate-900 font-black px-6 py-4 rounded-2xl"
>
  Continuar con ATLAS →
</button>
          </div>
        </section>
      )}
    </main>
  );
}

function formatList(value: any) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function InfoCard({ title, value }: { title: string; value?: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6">
      <p className="text-xs font-bold text-slate-400 mb-2">
        {title.toUpperCase()}
      </p>
      <p className="text-2xl font-black text-slate-900">
        {value || "No detectado"}
      </p>
    </div>
  );
}

function GridSection({
  title,
  items,
}: {
  title: string;
  items: [string, any][];
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
      <h3 className="text-2xl font-black text-slate-900 mb-6">{title}</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="bg-slate-50 border border-slate-200 rounded-2xl p-5"
          >
            <p className="text-xs font-bold text-slate-400 mb-2">
              {label.toUpperCase()}
            </p>
            <p className="text-slate-800 leading-7">
              {value || "Sin información suficiente."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Input({ name, placeholder, value, onChange }: any) {
  return (
    <input
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

function Textarea({ name, placeholder, value, onChange }: any) {
  return (
    <textarea
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={4}
      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}