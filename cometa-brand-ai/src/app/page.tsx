import { supabase } from "@/lib/supabase";
import AnalyzeBrandForm from "./AnalyzeBrandForm";
import BusinessDiscoveryForm from "./BusinessDiscoveryForm";
import StrategyForm from "./StrategyForm";
import Sidebar from "./Sidebar";
import AnalysisHistoryCard from "./AnalysisHistoryCard";
import AccordionSection from "./AccordionSection";
import MercuryCard from "./MercuryCard";

export default async function Home() {
  const { data: clients, error } = await supabase.from("clients").select("*");

  const { data: analysisHistory } = await supabase
    .from("brand_analysis")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950 pl-80 pr-10 py-10">
      <Sidebar />

      <div className="flex items-center gap-6 mb-10">
        <img
          src="/logo.png"
          alt="Cometa Logo"
          className="w-24 h-24 object-contain"
        />

        <div>
          <h1 className="text-5xl font-bold tracking-tight">COMETA OS</h1>

          <p className="text-slate-600 mt-2">
            Tu sistema operativo de crecimiento: agentes especializados que
            analizan, organizan y convierten información en estrategias
            comerciales accionables.
          </p>
        </div>
      </div>

      <AccordionSection
        title="ORION · Director de Inteligencia de Marca (Brand AI)"
        description="Detecta cómo se percibe la marca en redes, sitio web y mercado digital. Identifica oportunidades, riesgos, posicionamiento y potencial de crecimiento."
        defaultOpen={true}
      >
        <AnalyzeBrandForm />
      </AccordionSection>

      <AccordionSection
        title="NOVA · Arquitecta del Negocio (Business Intelligence AI)"
        description="Organiza el conocimiento estratégico del negocio y descubre buyer persona, objeciones, temporadas, oportunidades comerciales y estructura de crecimiento."
      >
        <BusinessDiscoveryForm />
      </AccordionSection>

      <AccordionSection
        title="ATLAS · Director Estratégico (Strategy AI)"
        description="Transforma el diagnóstico y el contexto del negocio en una ruta clara para crecer en posicionamiento, comunidad, contenido, ventas y pauta."
      >
        <StrategyForm />
      </AccordionSection>
    
    <AccordionSection
  title="MERCURY · Director de Contenido"
  description="Convierte la estrategia de ATLAS en un plan mensual de contenido listo para ejecutar."
>
  <MercuryCard />
</AccordionSection>

      {error && (
        <div className="bg-red-500/20 border border-red-500 p-4 rounded-xl mb-6">
          Error: {error.message}
        </div>
      )}

      <AccordionSection
        title="Base de Marcas"
        description="Consulta las marcas cargadas en la base de datos de Cometa OS."
      >
        {!clients || clients.length === 0 ? (
          <p className="text-slate-600">Todavía no hay marcas registradas.</p>
        ) : (
          <div className="space-y-4">
            {clients.map((client) => (
              <div
                key={client.id}
                className="border border-slate-200 rounded-2xl p-5 bg-slate-50"
              >
                <h3 className="text-xl font-bold">{client.name}</h3>

                <p className="text-slate-500">{client.industry}</p>
              </div>
            ))}
          </div>
        )}
      </AccordionSection>

      <AccordionSection
        title="Historial de Inteligencia"
        description="Revisa análisis anteriores y selecciona una marca para continuar el flujo con NOVA o ATLAS."
      >
        {!analysisHistory || analysisHistory.length === 0 ? (
          <p className="text-slate-600">No hay análisis guardados.</p>
        ) : (
          <div className="space-y-6">
            {analysisHistory.map((item) => (
              <AnalysisHistoryCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </AccordionSection>
    </main>
  );
}