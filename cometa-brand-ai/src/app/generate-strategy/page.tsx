"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import Sidebar from "../Sidebar";

function GenerateStrategyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const brandName = searchParams.get("brandName") || "";

  const [formData, setFormData] = useState({
    packageName: "Growth",
    ninetyDayGoal: "",
    adsBudget: "",
    monthlyContext: "",
  });

  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState("");

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  }

  async function runAtlas() {
    if (!brandName) {
      setErrorMessage("No se encontró brandName en la URL.");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setStrategy(null);

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
    } catch (error) {
      console.error("Error ejecutando ATLAS:", error);
      setErrorMessage("Error de conexión ejecutando ATLAS.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950 pl-80 pr-10 py-10">
      <Sidebar />

      <div className="mb-8">
        <Link
          href={`/workspace/${encodeURIComponent(brandName)}`}
          className="text-sm font-bold text-blue-600"
        >
          ← Volver al Workspace
        </Link>
      </div>

      <section className="relative overflow-hidden bg-slate-950 text-white rounded-[2rem] p-10 mb-8 shadow-xl">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-600 rounded-full blur-3xl opacity-30" />
        <div className="absolute right-24 bottom-0 w-60 h-60 bg-purple-600 rounded-full blur-3xl opacity-20" />

        <div className="relative z-10">
          <p className="text-blue-300 font-black tracking-[0.22em] text-xs mb-4">
            ATLAS · STRATEGY AI
          </p>

          <h1 className="text-6xl font-black capitalize mb-4">
            Generar estrategia
          </h1>

          <p className="text-slate-300 text-lg">
            {brandName || "Marca no detectada"}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm h-fit">
          <p className="text-blue-600 font-black tracking-[0.18em] text-xs mb-3">
            VARIABLES OPERATIVAS
          </p>

          <h2 className="text-3xl font-black mb-6">Configurar ATLAS</h2>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-slate-400 tracking-[0.14em]">
                PAQUETE
              </label>

              <select
                name="packageName"
                value={formData.packageName}
                onChange={handleChange}
                className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Starter">Starter</option>
                <option value="Growth">Growth</option>
                <option value="Scale">Scale</option>
                <option value="Dominio">Dominio</option>
              </select>
            </div>

            <Input
              name="ninetyDayGoal"
              label="META A 90 DÍAS"
              placeholder="Ej. aumentar ventas, generar prospectos, posicionar categoría..."
              value={formData.ninetyDayGoal}
              onChange={handleChange}
            />

            <Input
              name="adsBudget"
              label="PRESUPUESTO DE PAUTA"
              placeholder="Ej. 4500"
              value={formData.adsBudget}
              onChange={handleChange}
            />

            <Textarea
              name="monthlyContext"
              label="CONTEXTO DEL MES"
              placeholder="Ej. temporada alta, lanzamiento, promoción, problema operativo..."
              value={formData.monthlyContext}
              onChange={handleChange}
            />

            <button
              onClick={runAtlas}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black px-6 py-4 rounded-2xl transition"
            >
              {loading
                ? "ATLAS está generando estrategia..."
                : "Ejecutar ATLAS →"}
            </button>
          </div>

          {errorMessage && (
            <div className="mt-5 bg-red-50 border border-red-100 text-red-700 rounded-2xl p-5 font-bold">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!strategy && !loading && (
            <div className="bg-white border border-slate-200 rounded-[2rem] p-10 shadow-sm">
              <p className="text-blue-600 font-black tracking-[0.18em] text-xs mb-3">
                COSMOS READY
              </p>

              <h2 className="text-4xl font-black mb-4">
                ATLAS usará ORION + Business Memory
              </h2>

              <p className="text-slate-600 leading-8 text-lg">
                Esta estrategia se generará usando la memoria existente de la
                marca: diagnóstico digital, buyer persona, objeciones, revenue
                drivers, diferenciadores y oportunidad principal.
              </p>
            </div>
          )}

          {loading && (
            <div className="bg-blue-50 border border-blue-100 rounded-[2rem] p-10 shadow-sm">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6" />

              <h2 className="text-3xl font-black mb-4">
                ATLAS está pensando la estrategia...
              </h2>

              <p className="text-slate-600 leading-8">
                Leyendo COSMOS, cruzando ORION con Business Memory y
                construyendo la ruta estratégica de crecimiento.
              </p>
            </div>
          )}

          {strategy && (
            <>
              <div className="bg-slate-950 text-white rounded-[2rem] p-10 shadow-xl">
                <p className="text-blue-300 font-black tracking-[0.18em] text-xs mb-3">
                  STRATEGY GENERATED
                </p>

                <h2 className="text-4xl font-black mb-4">
                  {strategy.strategy_level || "Estrategia generada"}
                </h2>

                <p className="text-slate-300 leading-8">
                  {strategy.executive_summary?.current_situation ||
                    "ATLAS generó la estrategia correctamente."}
                </p>

                <button
                  onClick={() =>
                    router.push(`/workspace/${encodeURIComponent(brandName)}`)
                  }
                  className="mt-6 bg-white text-slate-950 hover:bg-blue-50 font-black px-6 py-4 rounded-2xl transition"
                >
                  Volver al Workspace →
                </button>
              </div>

              <GridSection
                title="Resumen ejecutivo"
                items={[
                  [
                    "Objetivo principal",
                    strategy.executive_summary?.main_objective,
                  ],
                  [
                    "Mayor oportunidad",
                    strategy.executive_summary?.biggest_opportunity,
                  ],
                  ["Mayor riesgo", strategy.executive_summary?.biggest_risk],
                  [
                    "Prioridad de ejecución",
                    strategy.executive_summary?.execution_priority,
                  ],
                ]}
              />

              <GridSection
                title="Diagnóstico estratégico"
                items={[
                  [
                    "Problema real",
                    strategy.strategic_diagnosis?.real_problem,
                  ],
                  [
                    "Cuello de botella",
                    strategy.strategic_diagnosis?.real_bottleneck,
                  ],
                  [
                    "Hipótesis de crecimiento",
                    strategy.strategic_diagnosis?.growth_hypothesis,
                  ],
                  [
                    "Enfoque estratégico",
                    strategy.strategic_diagnosis?.strategic_focus,
                  ],
                ]}
              />

              <GridSection
                title="Growth Model"
                items={[
                  [
                    "Palanca principal de crecimiento",
                    strategy.growth_model?.primary_growth_lever,
                  ],
                  [
                    "Palanca secundaria",
                    strategy.growth_model?.secondary_growth_lever,
                  ],
                  [
                    "Revenue driver prioritario",
                    strategy.growth_model?.revenue_driver_to_prioritize,
                  ],
                  [
                    "Estrategia de ticket",
                    strategy.growth_model?.ticket_strategy,
                  ],
                  [
                    "Estrategia de frecuencia",
                    strategy.growth_model?.frequency_strategy,
                  ],
                  [
                    "Estrategia de retención",
                    strategy.growth_model?.retention_strategy,
                  ],
                  [
                    "Cross-sell / Upsell",
                    strategy.growth_model?.cross_sell_or_upsell_strategy,
                  ],
                  [
                    "Estrategia de confianza",
                    strategy.growth_model?.trust_strategy,
                  ],
                  [
                    "Estrategia de conversión",
                    strategy.growth_model?.conversion_strategy,
                  ],
                  [
                    "Dependencia operativa",
                    strategy.growth_model?.operational_dependency,
                  ],
                  [
                    "Hipótesis principal de crecimiento",
                    strategy.growth_model?.main_growth_hypothesis,
                  ],
                ]}
              />

              <GridSection
                title="Arquitectura de contenido"
                items={[
                  [
                    "Dirección principal",
                    strategy.content_architecture?.main_content_direction,
                  ],
                  [
                    "Principio de contenido",
                    strategy.content_architecture?.content_principle,
                  ],
                  [
                    "Pilares",
                    formatPillars(strategy.content_architecture?.pillars),
                  ],
                ]}
              />

              <GridSection
                title="Recomendación CEO"
                items={[
                  [
                    "Qué haría primero",
                    strategy.ceo_recommendation?.what_i_would_do_first,
                  ],
                  ["Qué no haría", strategy.ceo_recommendation?.what_not_to_do],
                  [
                    "Dónde enfocaría presupuesto",
                    strategy.ceo_recommendation?.where_to_focus_budget,
                  ],
                  [
                    "Decisión final",
                    strategy.ceo_recommendation?.final_decision,
                  ],
                ]}
              />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default function GenerateStrategyPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f6f7fb] text-slate-950 pl-80 pr-10 py-10">
          <Sidebar />
          <div className="bg-white border border-slate-200 rounded-[2rem] p-10 shadow-sm">
            <p className="text-blue-600 font-black tracking-[0.18em] text-xs mb-3">
              ATLAS · STRATEGY AI
            </p>
            <h1 className="text-4xl font-black">Cargando estrategia...</h1>
          </div>
        </main>
      }
    >
      <GenerateStrategyContent />
    </Suspense>
  );
}

function Input({ name, label, placeholder, value, onChange }: any) {
  return (
    <div>
      <label className="text-xs font-black text-slate-400 tracking-[0.14em]">
        {label}
      </label>

      <input
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function Textarea({ name, label, placeholder, value, onChange }: any) {
  return (
    <div>
      <label className="text-xs font-black text-slate-400 tracking-[0.14em]">
        {label}
      </label>

      <textarea
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        rows={4}
        className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
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
    <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
      <h3 className="text-2xl font-black mb-6">{title}</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="bg-slate-50 border border-slate-200 rounded-2xl p-5"
          >
            <p className="text-xs font-black text-slate-400 tracking-[0.14em] mb-2">
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

function formatPillars(pillars: any) {
  if (!Array.isArray(pillars)) return "";

  return pillars
    .map((pillar) => `${pillar.pillar || "Pilar"} (${pillar.percentage || 0}%)`)
    .join(", ");
}