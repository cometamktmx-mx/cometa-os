"use client";

import { useState } from "react";

export default function MercuryCard() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function executeMercury() {
    const selectedBrand = localStorage.getItem(
      "cometa_selected_brand_analysis"
    );

    if (!selectedBrand) {
      alert("Primero selecciona una marca.");
      return;
    }

    const brand = JSON.parse(selectedBrand);

    setLoading(true);

    try {
      const response = await fetch(
        "/api/generate-content-plan",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            brandName: brand.brandName,
            brandAnalysisId: brand.brandAnalysisId,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setResult(data.contentPlan);
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.log(error);
      alert("Error ejecutando MERCURY.");
    }

    setLoading(false);
  }

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
      <h2 className="text-2xl font-semibold mb-3">
        MERCURY · Director de Contenido
      </h2>

      <p className="text-slate-500 leading-7 mb-6">
        MERCURY transforma la estrategia de ATLAS en un plan mensual de contenido
        listo para ejecución.
      </p>

      <button
        onClick={executeMercury}
        disabled={loading}
        className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-4 rounded-2xl"
      >
        {loading
          ? "MERCURY trabajando..."
          : "Ejecutar MERCURY"}
      </button>

      {result && (
        <div className="mt-8 bg-slate-50 rounded-3xl p-6">
          <pre className="text-sm overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}