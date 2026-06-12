"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StrategyCard from "./StrategyCard";

export default function AnalyzeBrandForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
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
  });

  const [result, setResult] = useState<any>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  }

  async function analyzeBrand() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/analyze-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
  setAnalysisId(
  data.brandAnalysisId || data.analysisId || data.savedAnalysis?.id || data.result?.id || null
);

  setResult({
    ...data.result,
    instagram_context: data.instagramContext,
    facebook_context: data.facebookContext,
    tiktok_context: data.tiktokContext,
    website_context: data.websiteContext,
  });
      } else {
        setResult("Error al analizar la marca.");
      }
    } catch (error) {
      console.error(error);
      setResult("Error de conexión con COMETA AI.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8 mb-8">
      <h2 className="text-2xl font-semibold mb-4">Analizar marca con IA</h2>

<p className="text-slate-500 mb-6 leading-7">
  Brand IA analiza percepción, señales sociales, narrativa, contenido,
  ventas, competencia y potencial de crecimiento desde la metodología
  Cometa Growth System.
</p>

      <div className="space-y-4">
        <Input name="brandName" placeholder="Nombre de la marca" value={formData.brandName} onChange={handleChange} />
        <Input name="industry" placeholder="Industria o giro" value={formData.industry} onChange={handleChange} />
        <Input name="city" placeholder="Ciudad o zona principal" value={formData.city} onChange={handleChange} />
        <Input name="instagram" placeholder="Instagram de la marca" value={formData.instagram} onChange={handleChange} />
        <Input name="facebook" placeholder="Facebook de la marca" value={formData.facebook} onChange={handleChange} />
        <Input name="tiktok" placeholder="TikTok de la marca" value={formData.tiktok} onChange={handleChange} />
        <Input name="website" placeholder="Sitio web o tienda en línea" value={formData.website} onChange={handleChange} />

        <Textarea name="competitors" placeholder="Competidores principales o marcas similares" value={formData.competitors} onChange={handleChange} />
        <Textarea name="objective" placeholder="Objetivo principal: vender más, crecer seguidores, posicionarse, generar citas, etc." value={formData.objective} onChange={handleChange} />
        <Textarea name="problem" placeholder="Problema principal que tiene la marca actualmente" value={formData.problem} onChange={handleChange} />
        <Input name="budget" placeholder="Presupuesto aproximado para pauta o marketing" value={formData.budget} onChange={handleChange} />

        <button
          onClick={analyzeBrand}
          disabled={loading || !formData.brandName || !formData.industry}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-4 rounded-2xl disabled:opacity-50 transition"
        >
          <div className="flex items-center gap-3">
            {loading && (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            <span>{loading ? "ORION está analizando la marca..." : "Ejecutar diagnóstico con ORION"}</span>
          </div>
        </button>
      </div>

      {loading && (
        <div className="mt-6 border border-blue-100 bg-blue-50 rounded-3xl p-6">
          <h3 className="text-xl font-semibold text-slate-900 mb-3">
            ORION está construyendo el diagnóstico de marca...
          </h3>
          <p className="text-slate-600 leading-8">
            Analizando redes sociales, sitio web, percepción digital, narrativa,
contenido, confianza, competencia, oportunidades comerciales y potencial de crecimiento.
          </p>
        </div>
      )}

      {result && typeof result === "string" && (
        <div className="mt-6 bg-red-50 border border-red-100 text-red-700 rounded-3xl p-6">
          {result}
        </div>
      )}

      {result && typeof result !== "string" && (
        <div className="mt-8 space-y-6">
          <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-sm">
            <p className="text-sm font-semibold text-blue-300 mb-3">BRAND SCORE</p>

            <div className="flex items-end gap-4">
              <h3 className="text-7xl font-black leading-none">
                {result.brand_score}
              </h3>
              <p className="text-2xl font-bold text-slate-300 mb-2">/100</p>
            </div>

            <p className="mt-4 inline-flex bg-white/10 border border-white/10 rounded-full px-4 py-2 text-sm font-semibold">
              {result.brand_level}
            </p>
          </div>

          <div className="bg-gradient-to-r from-green-600 to-emerald-500 text-white rounded-3xl p-8 shadow-sm">
            <p className="text-sm font-semibold text-green-100 mb-3">
              NIVEL DE OPORTUNIDAD
            </p>

            <div className="flex items-end gap-4">
              <h3 className="text-6xl font-black leading-none">
                {result.opportunity_level?.score}
              </h3>
              <p className="text-xl font-bold text-green-100 mb-2">/100</p>
            </div>

            <p className="mt-4 text-lg font-semibold">
              {result.opportunity_level?.level}
            </p>

            <p className="mt-3 text-green-50 leading-7">
              {result.opportunity_level?.reason}
            </p>
          </div>

          <ResultBlock title="RESUMEN EJECUTIVO" content={result.executive_summary} />

          <SectionTitle title="Lectura ejecutiva de Instagram" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <MetricCard label="Seguidores" value={result.social_signals?.instagram_followers} />
            <MetricCard label="Seguidos" value={result.social_signals?.instagram_following} />
            <MetricCard label="Publicaciones" value={result.social_signals?.instagram_posts} />
          </div>

          <SectionTitle title="Lectura ejecutiva de Facebook" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DarkMetricCard
              label="Presencia"
              value={result.facebook_analysis?.presence_level || "No detectada"}
            />

            <ScoreMetricCard
              label="Facebook Score"
              value={result.facebook_analysis?.facebook_score || 0}
            />
          </div>

          <SectionTitle title="Señales detectadas de Facebook" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <SmallMetricCard label="Seguidores" value={result.facebook_context?.profileSignals?.followers} />
            <SmallMetricCard label="Me gusta" value={result.facebook_context?.profileSignals?.likes} />
            <SmallMetricCard label="Categoría" value={result.facebook_context?.profileSignals?.category} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <SmallMetricCard label="Ubicación" value={result.facebook_context?.profileSignals?.location} />
            <SmallMetricCard label="Messenger" value={result.facebook_context?.contentSignals?.hasMessenger} />
            <SmallMetricCard label="WhatsApp" value={result.facebook_context?.contentSignals?.hasWhatsApp} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Actividad" content={result.facebook_analysis?.activity_level} />
            <InsightCard title="Conversión" content={result.facebook_analysis?.conversion_level} />
            <InsightCard title="Diagnóstico de Facebook" content={result.facebook_analysis?.diagnosis} />
            <InsightCard title="Tipo de contenido detectado" content={result.facebook_analysis?.content_type} />
            <InsightCard title="Nivel de confianza" content={result.facebook_analysis?.trust_level} />
            <InsightCard title="Oportunidad principal" content={result.facebook_analysis?.main_opportunity} />
            <InsightCard title="Problema principal" content={result.facebook_analysis?.main_problem} />
            <InsightCard title="Acción recomendada" content={result.facebook_analysis?.recommended_action} />
          </div>

          <SectionTitle title="Lectura ejecutiva de TikTok" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DarkMetricCard
              label="Presencia"
              value={result.tiktok_analysis?.presence_level || "No detectada"}
            />

            <ScoreMetricCard
              label="TikTok Score"
              value={result.tiktok_analysis?.tiktok_score || 0}
            />
          </div>

          <SectionTitle title="Señales detectadas de TikTok" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <SmallMetricCard label="Usuario" value={result.tiktok_context?.profileSignals?.username} />
            <SmallMetricCard label="Seguidores" value={result.tiktok_context?.profileSignals?.followers} />
            <SmallMetricCard label="Likes" value={result.tiktok_context?.profileSignals?.likes} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <SmallMetricCard label="Siguiendo" value={result.tiktok_context?.profileSignals?.following} />
            <SmallMetricCard label="Videos" value={result.tiktok_context?.contentSignals?.hasVideos} />
            <SmallMetricCard label="Potencial viral" value={result.tiktok_context?.contentSignals?.viralPotential} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Bio detectada" content={result.tiktok_context?.profileSignals?.bio} />
            <InsightCard title="Estilo de contenido" content={result.tiktok_analysis?.content_style} />
            <InsightCard title="Calidad de hooks" content={result.tiktok_analysis?.hook_quality} />
            <InsightCard title="Consistencia de publicación" content={result.tiktok_analysis?.posting_consistency} />
            <InsightCard title="Diagnóstico de TikTok" content={result.tiktok_analysis?.diagnosis} />
            <InsightCard title="Oportunidad principal" content={result.tiktok_analysis?.main_opportunity} />
            <InsightCard title="Problema principal" content={result.tiktok_analysis?.main_problem} />
            <InsightCard title="Acción recomendada" content={result.tiktok_analysis?.recommended_action} />
          </div>

          <SectionTitle title="Lectura ejecutiva del Sitio Web" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ScoreMetricCard
              label="Website Score"
              value={result.website_analysis?.website_score || 0}
            />

            <DarkMetricCard
              label="Presencia web"
              value={result.website_analysis?.presence_level || "No detectada"}
            />
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8">
            <p className="text-sm font-semibold text-blue-600 mb-5">
              BALANCE WEB
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <ScoreBar title="SEO" value={result.website_analysis?.seo_score || 0} />
              <ScoreBar title="Conversión" value={result.website_analysis?.conversion_score || 0} />
              <ScoreBar title="Confianza" value={result.website_analysis?.trust_score || 0} />
              <ScoreBar title="UX" value={result.website_analysis?.ux_score || 0} />
            </div>
          </div>

          <SectionTitle title="Señales detectadas del Sitio Web" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <SmallMetricCard
              label="Título SEO"
              value={result.website_context?.extractedData?.title}
            />

            <SmallMetricCard
              label="Meta Description"
              value={result.website_context?.extractedData?.metaDescription}
            />

            <SmallMetricCard
              label="H1 Principal"
              value={result.website_context?.extractedData?.h1}
            />
          </div>

          <SectionTitle title="Señales comerciales del Sitio Web" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <SmallMetricCard
  label="WhatsApp"
  value={result.website_context?.extractedData?.whatsapp}
/>

<SmallMetricCard
  label="Email"
  value={result.website_context?.extractedData?.email}
/>

<SmallMetricCard
  label="Teléfono"
  value={result.website_context?.extractedData?.phone}
/>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <SmallMetricCard
  label="Formulario"
  value={result.website_context?.extractedData?.form}
/>

<SmallMetricCard
  label="Carrito"
  value={result.website_context?.extractedData?.cart}
/>

<SmallMetricCard
  label="Checkout"
  value={result.website_context?.extractedData?.checkout}
/>
          </div>

          <InsightCard
  title="CTAs detectados"
  content={result.website_context?.extractedData?.ctas || "No detectado"}
/>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Nivel SEO" content={result.website_analysis?.seo_level} />
            <InsightCard title="Nivel de conversión" content={result.website_analysis?.conversion_level} />
            <InsightCard title="Nivel de confianza" content={result.website_analysis?.trust_level} />
            <InsightCard title="Diagnóstico web" content={result.website_analysis?.diagnosis} />
            <InsightCard title="Problema principal" content={result.website_analysis?.main_problem} />
            <InsightCard title="Oportunidad principal" content={result.website_analysis?.main_opportunity} />
            <InsightCard title="Acción recomendada" content={result.website_analysis?.recommended_action} />
          </div>

          <SectionTitle title="Lectura de engagement y madurez social" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Engagement estimado" content={result.social_signals?.estimated_engagement} />
            <InsightCard title="Lectura de engagement" content={result.social_signals?.engagement_reading} />
            <InsightCard title="Fuerza de comunidad" content={result.social_signals?.community_strength} />
            <InsightCard title="Nivel de autoridad" content={result.social_signals?.authority_level} />
            <InsightCard title="Consistencia de contenido" content={result.social_signals?.content_consistency} />
            <InsightCard title="Madurez de marca" content={result.social_signals?.brand_maturity} />
          </div>

          <SectionTitle title="Qué está dejando escapar la marca hoy" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Atención desaprovechada" content={result.current_losses?.lost_attention} />
            <InsightCard title="Confianza no capitalizada" content={result.current_losses?.lost_trust} />
            <InsightCard title="Ventas no capturadas" content={result.current_losses?.lost_sales_opportunity} />
            <InsightCard title="Posicionamiento no consolidado" content={result.current_losses?.lost_positioning} />
            <InsightCard title="Comunidad no desarrollada" content={result.current_losses?.lost_community} />
            <InsightCard title="Lectura estratégica principal" content={result.current_losses?.main_loss_summary} />
          </div>

          <SectionTitle title="Potencial de crecimiento" />

          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-3xl p-8 shadow-sm">
            <h3 className="text-2xl font-bold mb-3">
              Potencial detectado por COMETA AI
            </h3>
            <p className="text-blue-100 leading-8">
              {result.growth_potential?.potential_summary || "Sin información suficiente."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
            <PotentialCard label="Branding" value={result.growth_potential?.branding_potential} />
            <PotentialCard label="Comunidad" value={result.growth_potential?.community_potential} />
            <PotentialCard label="Ventas" value={result.growth_potential?.sales_potential} />
            <PotentialCard label="Viralidad" value={result.growth_potential?.viral_potential} />
            <PotentialCard label="Escalabilidad" value={result.growth_potential?.scalability_potential} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Mayor palanca de crecimiento" content={result.growth_potential?.biggest_growth_lever} />
            <InsightCard title="Escenario a 6 meses" content={result.growth_potential?.six_month_scenario} />
          </div>

          <SectionTitle title="Inteligencia competitiva" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Realidad del mercado" content={result.competitive_intelligence?.market_reality} />
            <InsightCard title="Brecha de atención" content={result.competitive_intelligence?.attention_gap} />
            <InsightCard title="Ventaja de autoridad" content={result.competitive_intelligence?.authority_advantage} />
            <InsightCard title="Ventaja de contenido" content={result.competitive_intelligence?.content_advantage} />
            <InsightCard title="Ventaja psicológica" content={result.competitive_intelligence?.psychological_advantage} />
            <InsightCard title="Amenaza competitiva" content={result.competitive_intelligence?.competitive_threat} />
            <InsightCard title="Mayor fortaleza competitiva" content={result.competitive_intelligence?.biggest_competitive_strength} />
            <InsightCard title="Mayor debilidad competitiva" content={result.competitive_intelligence?.biggest_competitive_weakness} />
          </div>

          <SectionTitle title="Oportunidad de mercado" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <InsightCard title="Espacio libre identificado" content={result.market_opportunity?.white_space} />
            <InsightCard title="Ruta de crecimiento más rápida" content={result.market_opportunity?.fastest_growth_path} />
            <InsightCard title="Categoría que puede dominar" content={result.market_opportunity?.category_ownership} />
          </div>

          <SectionTitle title="Percepción de marca" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Percepción actual" content={result.brand_perception?.current_perception} />
            <InsightCard title="Conexión emocional" content={result.brand_perception?.emotional_connection} />
            <InsightCard title="Arquetipo de marca" content={result.brand_perception?.brand_archetype} />
            <InsightCard title="Nivel aspiracional" content={result.brand_perception?.aspirational_level} />
          </div>

          <SectionTitle title="Diagnóstico profundo" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Problema real" content={result.deep_diagnosis?.real_problem} />
            <InsightCard title="Qué está frenando el crecimiento" content={result.deep_diagnosis?.what_is_killing_growth} />
            <InsightCard title="Qué se siente genérico" content={result.deep_diagnosis?.what_feels_generic} />
            <InsightCard title="Factor faltante" content={result.deep_diagnosis?.missing_factor} />
          </div>

          <SectionTitle title="Análisis de contenido" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Estilo de contenido" content={result.content_analysis?.content_style} />
            <InsightCard title="Probabilidad de viralidad" content={result.content_analysis?.viral_probability} />
            <InsightCard title="Problema principal de contenido" content={result.content_analysis?.main_content_problem} />
            <InsightCard title="Oportunidad de contenido" content={result.content_analysis?.content_opportunity} />
            <InsightCard title="Dirección recomendada" content={result.content_analysis?.recommended_content_direction} />
          </div>

          <SectionTitle title="Análisis de ventas" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Nivel de conversión" content={result.sales_analysis?.conversion_level} />
            <InsightCard title="Principal barrera de venta" content={result.sales_analysis?.main_sales_barrier} />
            <InsightCard title="Nivel de confianza" content={result.sales_analysis?.trust_level} />
            <InsightCard title="Psicología de compra" content={result.sales_analysis?.purchase_psychology} />
          </div>

          <SectionTitle title="Análisis competitivo" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Posición en el mercado" content={result.competitive_analysis?.market_position} />
            <InsightCard title="Riesgo competitivo" content={result.competitive_analysis?.competitive_risk} />
            <InsightCard title="Ventaja competitiva" content={result.competitive_analysis?.competitive_advantage} />
            <InsightCard title="Oportunidad vacía del mercado" content={result.competitive_analysis?.market_gap_opportunity} />
          </div>

          <SectionTitle title="Estrategia de crecimiento" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Ángulo de crecimiento" content={result.growth_strategy?.growth_angle} />
            <InsightCard title="Narrativa recomendada" content={result.growth_strategy?.narrative_recommendation} />
            <InsightCard title="Estrategia de comunidad" content={result.growth_strategy?.community_strategy} />
            <InsightCard title="Evolución de marca" content={result.growth_strategy?.brand_evolution} />
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8">
            <p className="text-sm font-semibold text-slate-900 mb-5">
              BALANCE ESTRATÉGICO
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <ScoreBar title="Branding" value={result.scores?.branding} />
              <ScoreBar title="Posicionamiento" value={result.scores?.positioning} />
              <ScoreBar title="Diferenciación" value={result.scores?.differentiation} />
              <ScoreBar title="Contenido" value={result.scores?.content_potential} />
              <ScoreBar title="Ventas" value={result.scores?.sales_potential} />
              <ScoreBar title="Presencia digital" value={result.scores?.digital_presence} />
              <ScoreBar title="Escalabilidad" value={result.scores?.scalability} />
              <ScoreBar title="Potencial viral" value={result.scores?.viral_potential} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StrategyCard title="Fortalezas" items={result.fortalezas} color="green" />
            <StrategyCard title="Debilidades" items={result.debilidades} color="red" />
            <StrategyCard title="Oportunidades" items={result.oportunidades} color="purple" />
            <StrategyCard title="Acciones prioritarias" items={result.acciones_prioritarias} color="blue" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InsightCard title="Wow insight" content={result.wow_insight} />
            <InsightCard title="Predicción si sigue igual" content={result.future_prediction} />
          </div>

          <div className="bg-blue-600 text-white rounded-3xl p-8 shadow-sm">
  <p className="text-sm font-semibold text-blue-100 mb-2">
    SIGUIENTE PASO RECOMENDADO
  </p>

  <p className="text-xl font-semibold leading-8 mb-6">
    {result.next_step}
  </p>

  <button
    onClick={() => {
      if (!analysisId) {
        alert("No se encontró el ID del análisis. Revisa que /api/analyze-brand esté regresando analysisId.");
        return;
      }

      router.push(`/nova/${analysisId}`);
    }}
    className="bg-white text-blue-700 hover:bg-blue-50 font-black px-6 py-4 rounded-2xl transition shadow-sm"
  >
    Continuar con NOVA →
  </button>
</div>
        </div>
      )}
    </section>
  );
}

function formatBooleanSignal(value?: boolean) {
  if (value === true) return "Detectado";
  if (value === false) return "No detectado";
  return "No detectado";
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
      <p className="text-5xl font-black leading-none break-words">
        {value || "No detectado"}
      </p>
    </div>
  );
}

function DarkMetricCard({ label, value }: { label: string; value?: string }) {
  return (
    <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-sm">
      <p className="text-sm font-semibold text-blue-300 mb-3">
        {label.toUpperCase()}
      </p>

      <p className="text-4xl font-black leading-tight">
        {value || "No detectado"}
      </p>
    </div>
  );
}

function ScoreMetricCard({ label, value }: { label: string; value?: number }) {
  const safeValue = value || 0;

  return (
    <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-sm">
      <p className="text-sm font-semibold text-blue-300 mb-3">
        {label.toUpperCase()}
      </p>

      <div className="flex items-end gap-3">
        <p className="text-5xl font-black leading-none">{safeValue}</p>
        <p className="text-xl font-bold text-slate-300 mb-1">/100</p>
      </div>
    </div>
  );
}

function SmallMetricCard({ label, value }: { label: string; value?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden">
      <p className="text-xs font-bold text-slate-400 mb-2 tracking-wide">
        {label.toUpperCase()}
      </p>

      <p className="text-2xl font-black text-slate-900 leading-tight break-words">
        {value || "No detectado"}
      </p>
    </div>
  );
}

function PotentialCard({ label, value }: { label: string; value?: number }) {
  const safeValue = value || 0;

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center shadow-sm">
      <p className="text-sm font-semibold text-slate-500 mb-3">
        {label.toUpperCase()}
      </p>
      <p className="text-5xl font-black text-blue-600">{safeValue}</p>
      <p className="text-slate-400 font-medium">/10</p>
    </div>
  );
}

function ResultBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-8">
      <p className="text-sm font-semibold text-blue-600 mb-2">{title}</p>
      <p className="text-slate-700 leading-8">
        {content || "Sin información suficiente."}
      </p>
    </div>
  );
}

function ScoreBar({ title, value }: { title: string; value: number }) {
  const safeValue = value || 0;

  return (
    <div>
      <div className="flex justify-between mb-2">
        <p className="font-semibold text-slate-700">{title}</p>
        <p className="font-bold text-slate-900">{safeValue}/100</p>
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