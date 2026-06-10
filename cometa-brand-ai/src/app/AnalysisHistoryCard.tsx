"use client";

import { useState } from "react";
import StrategyCard from "./StrategyCard";

export default function AnalysisHistoryCard({ item }: { item: any }) {
  const [open, setOpen] = useState(false);

  let parsed: any = null;

  try {
    parsed = JSON.parse(item.analysis);
  } catch {
    parsed = null;
  }

  function sendToStrategyAI() {
    const payload = {
      brandAnalysisId: item.id,
      brandName: item.brand_name,
      industry: item.industry,
      city: item.city,
      objective: item.objective,
      budget: item.budget,
      problem: item.problem,
      instagram: item.instagram,
      facebook: item.facebook,
      tiktok: item.tiktok,
      website: item.website,
      competitors: item.competitors,
      analysis: parsed,
    };

    localStorage.setItem("cometa_selected_brand_analysis", JSON.stringify(payload));

    const strategySection = document.getElementById("strategy-ai-section");

    if (strategySection) {
      strategySection.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }

    window.dispatchEvent(new Event("cometa-brand-analysis-selected"));
  }

  if (!parsed) {
    return (
      <div className="border border-yellow-200 bg-yellow-50 rounded-3xl p-6 text-yellow-800">
        Análisis anterior no compatible con la nueva versión.
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-3xl p-6 bg-slate-50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
      <div className="flex items-center justify-between gap-6 mb-6">
        <div>
          <h3 className="text-2xl font-bold capitalize">
            {item.brand_name}
          </h3>

          <p className="text-slate-500">
            {item.industry}
          </p>
        </div>

        <div className="text-right">
          <p className="text-4xl font-black text-slate-900">
            {parsed.brand_score || 0}
            <span className="text-lg text-slate-400">/100</span>
          </p>

          <p className="text-sm text-blue-600 font-semibold">
            {parsed.brand_level}
          </p>
        </div>
      </div>

      <p className="text-slate-700 leading-8 mb-6">
        {open
          ? parsed.executive_summary
          : `${parsed.executive_summary?.slice(0, 260)}...`}
      </p>

      {!open && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MiniMetric label="Branding" value={parsed.scores?.branding} />
          <MiniMetric label="Ventas" value={parsed.scores?.sales_potential} />
          <MiniMetric label="Contenido" value={parsed.scores?.content_potential} />
          <MiniMetric label="Digital" value={parsed.scores?.digital_presence} />
        </div>
      )}

      {open && (
        <div className="space-y-6 mb-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-8">
            <p className="text-sm font-semibold text-blue-600 mb-3">
              DIAGNÓSTICO PROFUNDO
            </p>

            <p className="text-slate-700 leading-8">
              {parsed.deep_diagnosis?.real_problem ||
                parsed.diagnosis ||
                parsed.executive_summary ||
                "Sin información suficiente."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StrategyCard title="Fortalezas" items={parsed.fortalezas} color="green" />
            <StrategyCard title="Debilidades" items={parsed.debilidades} color="red" />
            <StrategyCard title="Oportunidades" items={parsed.oportunidades} color="purple" />
            <StrategyCard title="Acciones prioritarias" items={parsed.acciones_prioritarias} color="green" />
          </div>

          <div className="bg-blue-600 text-white rounded-3xl p-8">
            <p className="text-sm font-semibold text-blue-100 mb-2">
              WOW INSIGHT
            </p>

            <p className="text-xl font-semibold leading-8">
              {parsed.wow_insight}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-8">
            <p className="text-sm font-semibold text-blue-600 mb-2">
              SIGUIENTE PASO
            </p>

            <p className="text-slate-700 leading-8">
              {parsed.next_step}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setOpen(!open)}
          className="bg-slate-900 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-2xl transition"
        >
          {open ? "Ocultar análisis" : "Ver análisis completo"}
        </button>

        <button
          onClick={sendToStrategyAI}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-2xl transition"
        >
          Generar estrategia
        </button>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  const safeValue = value || 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <p className="text-xs text-slate-500 mb-1">
        {label}
      </p>

      <p className="text-xl font-black text-slate-900">
        {safeValue}/100
      </p>
    </div>
  );
}