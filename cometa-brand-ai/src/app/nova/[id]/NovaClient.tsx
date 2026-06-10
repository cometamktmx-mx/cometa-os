"use client";

import { useEffect, useState } from "react";

export default function NovaClient({ analysisId }: { analysisId: string }) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [businessMap, setBusinessMap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [novaLoading, setNovaLoading] = useState(false);
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

  async function runNova() {
    if (!analysis) return;

    setNovaLoading(true);
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

      if (!data.success) {
        setErrorMessage(data.error || "NOVA no pudo generar el Business Map.");
        return;
      }

      setBusinessMap(data.businessMap);
    } catch (error) {
      console.log(error);
      setErrorMessage("Error ejecutando NOVA.");
    } finally {
      setNovaLoading(false);
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
          NOVA · Business Intelligence AI
        </p>

        <h1 className="text-4xl font-black mb-6">
          Mapa comercial del negocio
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <InfoCard title="Marca" value={analysis?.brand_name} />
          <InfoCard title="Industria" value={analysis?.industry} />
          <InfoCard title="Ciudad" value={analysis?.city} />
        </div>

        {!businessMap && (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 mb-8 shadow-sm">
            <p className="text-blue-600 font-bold mb-2">BUSINESS DISCOVERY</p>

            <h2 className="text-2xl font-black text-slate-900 mb-4">
              Información interna del negocio
            </h2>

            <p className="text-slate-600 leading-7 mb-6">
              ORION ya analizó la marca. NOVA necesita lo que solo el negocio
              sabe: oferta, ticket, capacidad, diferenciador y restricciones.
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

        {!businessMap && (
          <div className="bg-slate-900 text-white rounded-3xl p-8">
            <p className="text-blue-300 font-bold mb-2">SIGUIENTE PASO</p>

            <h2 className="text-2xl font-black mb-4">
              Ejecutar NOVA para construir el mapa comercial
            </h2>

            <p className="text-slate-300 leading-7 mb-6">
              NOVA convertirá ORION + Business Discovery en una radiografía
              comercial: buyer persona, tomadores de decisión, barreras,
              aceleradores, revenue drivers y oportunidades.
            </p>

            <button
              onClick={runNova}
              disabled={novaLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black px-6 py-4 rounded-2xl transition"
            >
              {novaLoading
                ? "NOVA está construyendo el Business Map..."
                : "Ejecutar NOVA →"}
            </button>
          </div>
        )}

        {errorMessage && analysis && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-3xl p-6">
            <p className="text-red-700 font-bold">{errorMessage}</p>
          </div>
        )}
      </section>

      {businessMap && (
        <section className="mt-8 space-y-6">
          <div className="bg-blue-600 text-white rounded-3xl p-8 shadow-sm">
            <p className="text-blue-100 font-bold mb-2">
              BUSINESS MAP GENERADO
            </p>

            <h2 className="text-3xl font-black mb-4">
              {businessMap.business_summary || "Radiografía comercial"}
            </h2>

            <p className="text-blue-50 leading-8">
              {businessMap.commercial_diagnosis ||
                businessMap.main_growth_opportunity ||
                "NOVA generó el mapa comercial del negocio."}
            </p>
          </div>

          <GridSection
            title="Modelo comercial"
            items={[
              ["Modelo de negocio", businessMap.business_model],
              ["Contexto de industria", businessMap.industry_context],
              ["Mercado objetivo", businessMap.target_market],
              ["Posicionamiento", businessMap.brand_positioning],
            ]}
          />

          <GridSection
            title="Buyer Persona"
            items={[
              ["Persona principal", businessMap.buyer_persona?.primary_persona],
              ["Persona secundaria", businessMap.buyer_persona?.secondary_persona],
              ["Necesidades", formatList(businessMap.buyer_persona?.needs)],
              ["Deseos", formatList(businessMap.buyer_persona?.desires)],
              ["Miedos", formatList(businessMap.buyer_persona?.fears)],
              [
                "Disparadores de compra",
                formatList(businessMap.buyer_persona?.purchase_triggers),
              ],
              [
                "Nivel de confianza",
                `${businessMap.buyer_persona?.confidence_level || 0}/100`,
              ],
              [
                "Razón de inferencia",
                businessMap.buyer_persona?.inference_reason,
              ],
            ]}
          />

          <GridSection
            title="Decisión de compra"
            items={[
              ["Tomadores de decisión", formatList(businessMap.decision_makers)],
              [
                "Influenciadores de compra",
                formatList(businessMap.purchase_influencers),
              ],
              ["Proceso de compra", formatList(businessMap.purchase_process)],
              ["Criterios de compra", formatList(businessMap.purchase_criteria)],
            ]}
          />

          <GridSection
            title="Revenue Drivers"
            items={[
              ["Ofertas clave", formatList(businessMap.key_offers)],
              ["Motores de ingreso", formatList(businessMap.revenue_drivers)],
              [
                "Oportunidades de alto margen",
                formatList(businessMap.high_margin_opportunities),
              ],
              ["Productos a empujar", formatList(businessMap.products_to_push)],
              [
                "Recompra / ingreso recurrente",
                formatList(businessMap.recurring_revenue_opportunities),
              ],
            ]}
          />

          <GridSection
            title="Psicología comercial"
            items={[
              [
                "Problema principal",
                businessMap.customer_psychology?.main_problem,
              ],
              [
                "Problema oculto",
                businessMap.customer_psychology?.hidden_problem,
              ],
              ["Deseo principal", businessMap.customer_psychology?.main_desire],
              ["Miedo principal", businessMap.customer_psychology?.main_fear],
              [
                "Disparador emocional",
                businessMap.customer_psychology?.emotional_trigger,
              ],
              [
                "Disparador racional",
                businessMap.customer_psychology?.rational_trigger,
              ],
              [
                "Disparador de estatus",
                businessMap.customer_psychology?.status_trigger,
              ],
            ]}
          />

          <GridSection
            title="Barreras y aceleradores de venta"
            items={[
              ["Objeciones", formatList(businessMap.customer_objections)],
              ["Barreras de venta", formatList(businessMap.sales_barriers)],
              [
                "Aceleradores de venta",
                formatList(businessMap.sales_accelerators),
              ],
              ["Pruebas necesarias", formatList(businessMap.proof_needed_to_sell)],
            ]}
          />

          <GridSection
            title="Confianza y diferenciación"
            items={[
              ["Activos de confianza", formatList(businessMap.trust_assets)],
              ["Diferenciadores", formatList(businessMap.differentiators)],
              ["Voz de marca", businessMap.brand_voice],
              ["Canales de venta", formatList(businessMap.sales_channels)],
            ]}
          />

          <GridSection
            title="Oportunidades y riesgos"
            items={[
              [
                "Oportunidades comerciales",
                formatList(businessMap.commercial_opportunities),
              ],
              ["Quick wins", formatList(businessMap.quick_wins)],
              [
                "Riesgos o limitaciones",
                formatList(businessMap.risks_or_limitations),
              ],
              [
                "Consideraciones operativas",
                formatList(businessMap.operational_considerations),
              ],
            ]}
          />

          <GridSection
            title="Journey comercial"
            items={[
              [
                "Generación de prospectos",
                businessMap.commercial_journey?.lead_generation,
              ],
              ["Calificación", businessMap.commercial_journey?.qualification],
              ["Propuesta", businessMap.commercial_journey?.proposal],
              ["Cierre", businessMap.commercial_journey?.closing],
              ["Retención", businessMap.commercial_journey?.retention],
            ]}
          />

          <GridSection
            title="Información faltante"
            items={[
              [
                "Información que falta",
                formatList(businessMap.ai_inferences?.missing_information),
              ],
              [
                "Detectado por ORION",
                formatList(businessMap.ai_inferences?.what_ai_detected_from_orion),
              ],
              [
                "Declarado por cliente",
                formatList(businessMap.ai_inferences?.what_client_declared),
              ],
              [
                "Inferido por NOVA",
                formatList(businessMap.ai_inferences?.what_ai_inferred),
              ],
            ]}
          />

          <GridSection
            title="Contexto para ATLAS"
            items={[
              [
                "Señales relevantes para estrategia",
                formatList(
                  businessMap.atlas_context?.relevant_signals_for_strategy
                ),
              ],
              [
                "ATLAS debe considerar",
                formatList(businessMap.atlas_context?.what_atlas_should_consider),
              ],
              [
                "ATLAS no debe asumir",
                formatList(
                  businessMap.atlas_context?.what_atlas_should_not_assume
                ),
              ],
              [
                "Notas estratégicas",
                formatList(businessMap.strategic_notes_for_cometa),
              ],
            ]}
          />

          <div className="bg-slate-900 text-white rounded-3xl p-8">
            <p className="text-blue-300 font-bold mb-2">SIGUIENTE PASO</p>

            <h2 className="text-2xl font-black mb-4">
              Continuar con ATLAS
            </h2>

            <p className="text-slate-300 leading-7 mb-6">
              ATLAS usará esta radiografía comercial para construir la
              estrategia de contenido, comunicación y crecimiento.
            </p>

            <button
              onClick={() => alert("Siguiente fase: conectar ATLAS")}
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

function GridSection({ title, items }: { title: string; items: [string, any][] }) {
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