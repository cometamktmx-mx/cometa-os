"use client";

import { useEffect, useState } from "react";

export default function BusinessDiscoveryForm() {
  const [selectedBrandAnalysis, setSelectedBrandAnalysis] = useState<any>(null);

  const [formData, setFormData] = useState({
    offers: "",
    priorityOffer: "",
    averageTicket: "",
    operationalCapacity: "",
    realDifferentiator: "",
    forbiddenTopics: "",
    internalNotes: "",
  });

  const [businessMemory, setBusinessMemory] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  function loadSelectedBrandAnalysis() {
    const stored = localStorage.getItem("cometa_selected_brand_analysis");

    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      setSelectedBrandAnalysis(parsed);
    } catch {
      console.log("No se pudo cargar el análisis seleccionado.");
    }
  }

  useEffect(() => {
    loadSelectedBrandAnalysis();

    window.addEventListener(
      "cometa-brand-analysis-selected",
      loadSelectedBrandAnalysis
    );

    return () => {
      window.removeEventListener(
        "cometa-brand-analysis-selected",
        loadSelectedBrandAnalysis
      );
    };
  }, []);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  }

  async function generateBusinessMemory() {
    if (!selectedBrandAnalysis?.analysis) {
      alert("Primero selecciona un análisis de Brand AI desde el historial.");
      return;
    }

    setLoading(true);
    setBusinessMemory(null);

    try {
      const response = await fetch("/api/generate-business-map", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandAnalysisId: selectedBrandAnalysis.brandAnalysisId,
          brandName: selectedBrandAnalysis.brandName,
          industry: selectedBrandAnalysis.industry,
          city: selectedBrandAnalysis.city,
          brandAnalysis: selectedBrandAnalysis.analysis,
          discoveryData: formData,
        }),
      });

      const data = await response.json();

      console.log("BUSINESS MEMORY RESPONSE:", data);

      if (data.success) {
        setBusinessMemory(data.businessMemory);

        localStorage.setItem(
          "cometa_selected_business_memory",
          JSON.stringify({
            brandAnalysisId: selectedBrandAnalysis.brandAnalysisId,
            brandName: selectedBrandAnalysis.brandName,
            industry: selectedBrandAnalysis.industry,
            city: selectedBrandAnalysis.city,
            businessMemory: data.businessMemory,
          })
        );

        window.dispatchEvent(new Event("cometa-business-memory-selected"));
      } else {
        setBusinessMemory("Error generando Business Memory.");
      }
    } catch (error) {
      console.error(error);
      setBusinessMemory("Error de conexión con Business Memory AI.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8 mb-8">
      <h2 className="text-2xl font-semibold mb-4">Business Discovery AI</h2>

      <p className="text-slate-500 mb-6 leading-7">
        Completa la información clave que no siempre es visible en redes
        sociales. Con estos datos, Business Memory construirá la memoria
        comercial del negocio y detectará oportunidades comerciales, perfiles
        de cliente, objeciones y rutas de crecimiento.
      </p>

      {selectedBrandAnalysis ? (
        <div className="mb-6 bg-blue-50 border border-blue-100 rounded-3xl p-6">
          <p className="text-sm font-semibold text-blue-600 mb-2">
            ANÁLISIS SELECCIONADO
          </p>

          <h3 className="text-2xl font-black text-slate-900">
            {selectedBrandAnalysis.brandName}
          </h3>

          <p className="text-slate-600 mt-1">
            {selectedBrandAnalysis.industry} ·{" "}
            {selectedBrandAnalysis.city || "Ciudad no especificada"}
          </p>
        </div>
      ) : (
        <div className="mb-6 bg-yellow-50 border border-yellow-100 rounded-3xl p-6 text-yellow-800">
          Primero selecciona un análisis desde el historial usando el botón
          “Generar estrategia”.
        </div>
      )}

      <div className="space-y-4">
        <Textarea
          name="offers"
          placeholder="Productos y/o servicios que ofrece el negocio. Ejemplo: café, frappés, desayunos, panadería, comida, eventos, catering..."
          value={formData.offers}
          onChange={handleChange}
        />

        <Textarea
          name="priorityOffer"
          placeholder="Producto, servicio o categoría que quieres impulsar más. Ejemplo: desayunos, paquetes, cursos, citas, mayoreo, Shopify..."
          value={formData.priorityOffer}
          onChange={handleChange}
        />

        <Input
          name="averageTicket"
          placeholder="Ticket promedio aproximado. Ejemplo: $150, $800, $1,200..."
          value={formData.averageTicket}
          onChange={handleChange}
        />

        <Textarea
          name="operationalCapacity"
          placeholder="Capacidad operativa. Ejemplo: cuántos pedidos, citas, clientes, proyectos o ventas pueden atender al mes..."
          value={formData.operationalCapacity}
          onChange={handleChange}
        />

        <Textarea
          name="realDifferentiator"
          placeholder="Diferenciador real. ¿Por qué alguien debería comprar aquí y no con la competencia?"
          value={formData.realDifferentiator}
          onChange={handleChange}
        />

        <Textarea
          name="forbiddenTopics"
          placeholder="Restricciones. ¿Hay algo que NO se deba comunicar, prometer o mencionar?"
          value={formData.forbiddenTopics}
          onChange={handleChange}
        />

        <Textarea
          name="internalNotes"
          placeholder="Notas internas importantes para Cometa. Ejemplo: cliente difícil, producto nuevo, ciudad objetivo, urgencia comercial, contexto de ventas..."
          value={formData.internalNotes}
          onChange={handleChange}
        />

        <button
          onClick={generateBusinessMemory}
          disabled={loading || !selectedBrandAnalysis}
          className="bg-slate-900 hover:bg-blue-700 text-white font-bold px-6 py-4 rounded-2xl disabled:opacity-50 transition"
        >
          {loading
            ? "Generando Business Memory..."
            : "Generar Business Memory"}
        </button>
      </div>

      {businessMemory && typeof businessMemory === "string" && (
        <div className="mt-6 bg-red-50 border border-red-100 text-red-700 rounded-3xl p-6">
          {businessMemory}
        </div>
      )}

      {businessMemory && typeof businessMemory !== "string" && (
        <div className="mt-8 space-y-6">
          <ResultBlock
            title="LECTURA GENERAL DEL NEGOCIO"
            content={businessMemory.business_summary}
          />

          <ResultBlock
            title="BUYER PERSONA INFERIDO"
            content={businessMemory.buyer_persona?.primary_persona}
          />

          <ResultBlock
            title="OPORTUNIDAD PRINCIPAL"
            content={businessMemory.main_growth_opportunity}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ListCard
              title="Revenue Drivers"
              items={businessMemory.revenue_drivers}
            />

            <ListCard
              title="Ofertas clave"
              items={businessMemory.key_offers}
            />

            <ListCard
              title="Objeciones inferidas"
              items={businessMemory.customer_objections}
            />

            <ListCard
              title="Oportunidades comerciales"
              items={businessMemory.commercial_opportunities}
            />

            <ListCard
              title="Quick Wins"
              items={businessMemory.quick_wins}
            />

            <ListCard
              title="Riesgos o limitaciones"
              items={businessMemory.risks_or_limitations}
            />
          </div>
        </div>
      )}
    </section>
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
      rows={3}
      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

function ResultBlock({ title, content }: { title: string; content?: string }) {
  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8">
      <p className="text-sm font-semibold text-blue-600 mb-2">{title}</p>
      <p className="text-slate-700 leading-8">
        {content || "Sin información suficiente."}
      </p>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items?: string[] }) {
  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8">
      <p className="text-sm font-semibold text-blue-600 mb-4">
        {title.toUpperCase()}
      </p>

      {!items || items.length === 0 ? (
        <p className="text-slate-500">Sin información suficiente.</p>
      ) : (
        <ul className="space-y-3 text-slate-700 leading-7">
          {items.map((item, index) => (
            <li key={index}>• {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}