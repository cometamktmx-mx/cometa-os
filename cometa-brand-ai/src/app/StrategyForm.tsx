"use client";

import { useEffect, useState } from "react";

export default function StrategyForm() {
  const [formData, setFormData] = useState({
    brandAnalysisId: "",
    brandName: "",
    packageName: "Growth",
    ninetyDayGoal: "",
    adsBudget: "",
    monthlyContext: "",
  });

  const [selectedBrandAnalysis, setSelectedBrandAnalysis] = useState<any>(null);
  const [cosmosMemory, setCosmosMemory] = useState<any>(null);
  const [strategy, setStrategy] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function loadCosmosMemory(brand: any) {
    try {
      const response = await fetch("/api/cosmos/get-memory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
  brandName: brand.brandName,
        }),
      });

      const data = await response.json();
      console.log("COSMOS MEMORY RESPONSE:", data);

      if (data.success) {
        setCosmosMemory(data.memory);
      }
    } catch {
      console.log("No se pudo cargar COSMOS.");
    }
  }

  function loadSelectedBrandAnalysis() {
    const stored = localStorage.getItem("cometa_selected_brand_analysis");

    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);

      setSelectedBrandAnalysis(parsed);

      setFormData((prev) => ({
        ...prev,
        brandAnalysisId: parsed.brandAnalysisId || "",
        brandName: parsed.brandName || "",
      }));

      loadCosmosMemory(parsed);
    } catch {
      console.log("No se pudo cargar la marca seleccionada.");
    }
  }

  useEffect(() => {
    loadSelectedBrandAnalysis();

    window.addEventListener(
      "cometa-brand-analysis-selected",
      loadSelectedBrandAnalysis
    );

    window.addEventListener(
      "cometa-business-map-selected",
      loadSelectedBrandAnalysis
    );

    return () => {
      window.removeEventListener(
        "cometa-brand-analysis-selected",
        loadSelectedBrandAnalysis
      );

      window.removeEventListener(
        "cometa-business-map-selected",
        loadSelectedBrandAnalysis
      );
    };
  }, []);

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

  async function generateStrategy() {
    if (!selectedBrandAnalysis) {
      alert("Primero selecciona una marca desde el Historial de Inteligencia.");
      return;
    }

    setLoading(true);
    setStrategy(null);

    try {
      const response = await fetch("/api/generate-strategy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brandAnalysisId: formData.brandAnalysisId,
          brandName: formData.brandName,
          packageName: formData.packageName,
          ninetyDayGoal: formData.ninetyDayGoal,
          adsBudget: Number(formData.adsBudget || 0),
          monthlyContext: formData.monthlyContext,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setStrategy(data.strategy);

        localStorage.setItem(
          "cometa_selected_strategy",
          JSON.stringify({
            brandAnalysisId: formData.brandAnalysisId,
            brandName: formData.brandName,
            strategy: data.strategy,
          })
        );

        window.dispatchEvent(new Event("cometa-strategy-selected"));
      } else {
        setStrategy(data.error || "Error generando estrategia.");
      }
    } catch (error) {
      console.error(error);
      setStrategy("Error de conexión con ATLAS.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      id="strategy-ai-section"
      className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8 mb-8"
    >
      <h2 className="text-2xl font-semibold mb-4">
        ATLAS · Director Estratégico
      </h2>

      <p className="text-slate-500 mb-6 leading-7">
        ATLAS lee la memoria de COSMOS, interpreta la información de ORION y
        NOVA, y convierte ese conocimiento en una estrategia clara de
        crecimiento, contenido, ventas y pauta.
      </p>

      {selectedBrandAnalysis ? (
        <>
          <div className="mb-6 bg-blue-50 border border-blue-100 rounded-3xl p-6">
            <p className="text-sm font-semibold text-blue-600 mb-2">
              MARCA SELECCIONADA
            </p>

            <h3 className="text-2xl font-black text-slate-900">
              {selectedBrandAnalysis.brandName}
            </h3>

            <p className="text-slate-600 mt-1">
              {selectedBrandAnalysis.industry} ·{" "}
              {selectedBrandAnalysis.city || "Ciudad no especificada"}
            </p>
          </div>

          {cosmosMemory?.orion_analysis && cosmosMemory?.nova_business_map ? (
            <div className="mb-6 bg-emerald-50 border border-emerald-100 rounded-3xl p-6">
              <p className="text-sm font-semibold text-emerald-700 mb-2">
                COSMOS CONECTADO
              </p>

              <p className="text-emerald-800 leading-7">
                ATLAS encontró memoria de ORION y NOVA. La estrategia se
                construirá usando diagnóstico digital, mapa de negocio, buyer
                persona, objeciones, revenue drivers y oportunidades
                comerciales.
              </p>
            </div>
          ) : (
            <div className="mb-6 bg-orange-50 border border-orange-100 rounded-3xl p-6 text-orange-800">
              COSMOS todavía no tiene toda la memoria necesaria. Ejecuta ORION y
              NOVA antes de generar una estrategia completa.
            </div>
          )}
        </>
      ) : (
        <div className="mb-6 bg-yellow-50 border border-yellow-100 rounded-3xl p-6 text-yellow-800">
          Primero selecciona una marca desde el Historial de Inteligencia.
        </div>
      )}

      <div className="space-y-4">
        <Select
          name="packageName"
          value={formData.packageName}
          onChange={handleChange}
          options={["Starter", "Growth", "Scale", "Dominio"]}
        />

        <Textarea
          name="ninetyDayGoal"
          placeholder="Meta a 90 días. Ejemplo: vender más desayunos, llenar agenda, aumentar reservas, conseguir clientes mayoristas..."
          value={formData.ninetyDayGoal}
          onChange={handleChange}
        />

        <Input
          name="adsBudget"
          placeholder="Presupuesto mensual de pauta"
          value={formData.adsBudget}
          onChange={handleChange}
        />

        <Textarea
          name="monthlyContext"
          placeholder="Contexto especial del mes. Ejemplo: campaña, evento, lanzamiento, temporada, influencer, UGC, promoción o cambio importante. Si no hay nada especial, déjalo vacío."
          value={formData.monthlyContext}
          onChange={handleChange}
        />

        <button
          onClick={generateStrategy}
          disabled={loading || !selectedBrandAnalysis || !formData.packageName}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-4 rounded-2xl disabled:opacity-50 transition"
        >
          <div className="flex items-center gap-3">
            {loading && (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}

            <span>
              {loading
                ? "ATLAS está diseñando la estrategia..."
                : "Ejecutar estrategia con ATLAS"}
            </span>
          </div>
        </button>
      </div>

      {strategy && typeof strategy === "string" && (
        <div className="mt-6 bg-red-50 border border-red-100 text-red-700 rounded-3xl p-6">
          {strategy}
        </div>
      )}

      {strategy && typeof strategy !== "string" && (
        <div className="mt-8 space-y-6">
          <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-sm">
            <p className="text-sm font-semibold text-blue-300 mb-3">
              STRATEGY SCORE
            </p>

            <div className="flex items-end gap-4">
              <h3 className="text-7xl font-black leading-none">
                {strategy.strategy_score}
              </h3>
              <p className="text-2xl font-bold text-slate-300 mb-2">/100</p>
            </div>

            <p className="mt-4 inline-flex bg-white/10 border border-white/10 rounded-full px-4 py-2 text-sm font-semibold">
              {strategy.strategy_level}
            </p>
          </div>

          <ResultBlock
            title="RESUMEN EJECUTIVO"
            content={strategy.executive_summary?.current_situation}
          />

          <SectionTitle title="Lectura estratégica" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard
              title="Objetivo principal"
              content={strategy.executive_summary?.main_objective}
            />

            <InsightCard
              title="Mayor oportunidad"
              content={strategy.executive_summary?.biggest_opportunity}
            />

            <InsightCard
              title="Mayor riesgo"
              content={strategy.executive_summary?.biggest_risk}
            />

            <InsightCard
              title="Prioridad de ejecución"
              content={strategy.executive_summary?.execution_priority}
            />
          </div>

          <SectionTitle title="Diagnóstico estratégico" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard
              title="Cuello de botella real"
              content={strategy.strategic_diagnosis?.real_bottleneck}
            />

            <InsightCard
              title="Suposición incorrecta a evitar"
              content={strategy.strategic_diagnosis?.wrong_assumption_to_avoid}
            />

            <InsightCard
              title="Hipótesis de crecimiento"
              content={strategy.strategic_diagnosis?.growth_hypothesis}
            />

            <InsightCard
              title="Enfoque estratégico"
              content={strategy.strategic_diagnosis?.strategic_focus}
            />
          </div>

          <SectionTitle title="Presupuesto y pauta" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <MetricCard
              label="Pauta mensual"
              value={`$${strategy.budget_strategy?.ads_budget || 0}`}
            />

            <MetricCard
              label="Pauta diaria"
              value={`$${strategy.budget_strategy?.daily_ads_budget || 0}`}
            />

            <MetricCard
              label="Paquete"
              value={strategy.budget_strategy?.management_package}
            />
          </div>

          <ResultBlock
            title="LECTURA DE PRESUPUESTO"
            content={strategy.budget_strategy?.ads_budget_reading}
          />

          <SectionTitle title="Distribución de pauta" />

          <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <ScoreBar
                title="Reconocimiento"
                value={strategy.budget_strategy?.recommended_distribution?.awareness}
              />

              <ScoreBar
                title="Interacción"
                value={strategy.budget_strategy?.recommended_distribution?.engagement}
              />

              <ScoreBar
                title="Conversión"
                value={strategy.budget_strategy?.recommended_distribution?.conversion}
              />

              <ScoreBar
                title="Remarketing"
                value={strategy.budget_strategy?.recommended_distribution?.remarketing}
              />
            </div>
          </div>

          <ResultBlock
            title="NOTAS DE EJECUCIÓN DE PAUTA"
            content={strategy.budget_strategy?.ads_execution_notes}
          />

          <SectionTitle title="Límites operativos del paquete" />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <MetricCard
              label="Días publicación"
              value={String(strategy.package_execution_limits?.posting_days_per_week || 0)}
            />

            <MetricCard
              label="Reels semana"
              value={String(strategy.package_execution_limits?.reels_per_week || 0)}
            />

            <MetricCard
              label="Posts semana"
              value={String(strategy.package_execution_limits?.posts_per_week || 0)}
            />

            <MetricCard
              label="Visitas mes"
              value={String(strategy.package_execution_limits?.monthly_visits || 0)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard
              title="Qué permite el paquete"
              content={strategy.package_execution_limits?.what_is_allowed}
            />

            <InsightCard
              title="Qué no permite"
              content={strategy.package_execution_limits?.what_is_not_allowed}
            />

            <InsightCard
              title="Nivel de producción"
              content={strategy.package_execution_limits?.production_level}
            />

            <InsightCard
              title="Advertencia operativa"
              content={strategy.package_execution_limits?.operational_warning}
            />
          </div>

          <SectionTitle title="Arquitectura de contenido" />

          <ResultBlock
            title="DIRECCIÓN PRINCIPAL"
            content={strategy.content_architecture?.main_content_direction}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {strategy.content_architecture?.pillars?.map(
              (pillar: any, index: number) => (
                <InsightCard
                  key={index}
                  title={`${pillar.pillar} (${pillar.percentage}%)`}
                  content={`${pillar.role} — Ejemplo: ${pillar.example_angle}`}
                />
              )
            )}
          </div>

          <SectionTitle title="Calendario maestro mensual" />

          <div className="space-y-6">
            {strategy.monthly_content_calendar?.map((week: any, index: number) => (
              <div
                key={index}
                className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8"
              >
                <p className="text-lg font-bold text-slate-900 mb-5">
                  Semana {week.week}
                </p>

                <div className="space-y-4">
                  {week.items?.map((item: any, itemIndex: number) => (
                    <div
                      key={itemIndex}
                      className="border border-slate-100 rounded-2xl p-5 bg-slate-50"
                    >
                      <p className="font-bold text-slate-900 mb-2">
                        {item.day} · {item.format} · {item.platform}
                      </p>

                      <p className="text-blue-600 font-semibold mb-2">
                        {item.concept}
                      </p>

                      <p className="text-slate-700 leading-7 mb-2">
                        {item.creative_brief}
                      </p>

                      <p className="text-sm text-slate-500">
                        Objetivo: {item.objective} · Pilar: {item.pillar} · CTA:{" "}
                        {item.cta}
                      </p>

                      <p className="text-sm text-slate-500 mt-2">
                        Producción: {item.production_needs}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <SectionTitle title="Plan de producción" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard
              title="Visita 1"
              content={strategy.production_plan?.visit_1_objective}
            />

            <InsightCard
              title="Visita 2"
              content={strategy.production_plan?.visit_2_objective}
            />

            <InsightCard
              title="Fotos necesarias"
              content={strategy.production_plan?.photos_needed}
            />

            <InsightCard
              title="Videos necesarios"
              content={strategy.production_plan?.videos_needed}
            />

            <InsightCard
              title="Modelos necesarios"
              content={strategy.production_plan?.models_needed}
            />

            <InsightCard
              title="UGC necesario"
              content={strategy.production_plan?.ugc_needed}
            />
          </div>

          <SectionTitle title="Calendario operativo" />

          <div className="space-y-4">
            {strategy.operational_calendar?.map((task: any, index: number) => (
              <div
                key={index}
                className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6"
              >
                <p className="font-bold text-slate-900 mb-1">
                  {task.suggested_day} · {task.task}
                </p>

                <p className="text-blue-600 font-semibold mb-2">
                  {task.responsible_area} · Prioridad {task.priority}
                </p>

                <p className="text-slate-700 leading-7">{task.notes}</p>
              </div>
            ))}
          </div>

          <SectionTitle title="KPIs" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Alcance" content={strategy.kpis?.reach_goal} />
            <InsightCard title="Engagement" content={strategy.kpis?.engagement_goal} />
            <InsightCard title="Seguidores" content={strategy.kpis?.followers_goal} />
            <InsightCard title="Leads" content={strategy.kpis?.leads_goal} />
            <InsightCard title="Ventas" content={strategy.kpis?.sales_goal} />
            <InsightCard title="KPIs Ads" content={strategy.kpis?.ads_kpis} />
            <InsightCard
              title="Métrica principal de éxito"
              content={strategy.kpis?.main_success_metric}
            />
          </div>

          <SectionTitle title="Control de riesgos" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ListCard
              title="Riesgos estratégicos"
              items={strategy.risk_control?.strategic_risks}
            />

            <ListCard
              title="Riesgos operativos"
              items={strategy.risk_control?.operational_risks}
            />

            <ListCard
              title="Riesgos financieros"
              items={strategy.risk_control?.financial_risks}
            />
          </div>

          <ResultBlock
            title="CÓMO EVITAR FALLAS"
            content={strategy.risk_control?.how_to_prevent_failure}
          />

          <SectionTitle title="Recomendación CEO" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard
              title="Qué haría primero"
              content={strategy.ceo_recommendation?.what_i_would_do_first}
            />

            <InsightCard
              title="Qué no haría"
              content={strategy.ceo_recommendation?.what_not_to_do}
            />

            <InsightCard
              title="Dónde enfocar presupuesto"
              content={strategy.ceo_recommendation?.where_to_focus_budget}
            />

            <InsightCard
              title="Decisión final"
              content={strategy.ceo_recommendation?.final_decision}
            />
          </div>

          <ListCard title="Siguientes pasos" items={strategy.next_steps} />
        </div>
      )}
    </section>
  );
}

function Input({ name, placeholder, value, onChange, disabled = false }: any) {
  return (
    <input
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed"
    />
  );
}

function Textarea({ name, placeholder, value, onChange, rows = 3 }: any) {
  return (
    <textarea
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={rows}
      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

function Select({ name, value, onChange, options }: any) {
  return (
    <select
      name={name}
      value={value}
      onChange={onChange}
      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {options.map((option: any) =>
        typeof option === "string" ? (
          <option key={option} value={option}>
            {option}
          </option>
        ) : (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        )
      )}
    </select>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="pt-4">
      <h3 className="text-xl font-bold text-slate-900">{title}</h3>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value?: string }) {
  return (
    <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-sm overflow-hidden">
      <p className="text-sm font-semibold text-blue-300 mb-3">
        {label.toUpperCase()}
      </p>
      <p className="text-4xl font-black leading-tight break-words">
        {value || "No detectado"}
      </p>
    </div>
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

function InsightCard({ title, content }: { title: string; content?: string }) {
  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8">
      <p className="text-sm font-semibold text-blue-600 mb-3">
        {title.toUpperCase()}
      </p>
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

      <ul className="space-y-3 text-slate-700 leading-7">
        {(items || []).map((item, index) => (
          <li key={index}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

function ScoreBar({ title, value }: { title: string; value: number }) {
  const safeValue = value || 0;

  return (
    <div>
      <div className="flex justify-between mb-2">
        <p className="font-semibold text-slate-700">{title}</p>
        <p className="font-bold text-slate-900">{safeValue}%</p>
      </div>

      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}