import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/app/Sidebar";
import EvidencePanel from "@/components/EvidencePanel";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getScore(memory: any) {
  return memory?.orion_memory?.result?.brand_score || 0;
}

function getOpportunity(memory: any) {
  return memory?.orion_memory?.result?.opportunity_level?.score || 0;
}

function getLevel(memory: any) {
  return memory?.orion_memory?.result?.brand_level || "Sin nivel";
}

function getNextAction(memory: any) {
  if (!memory?.orion_memory) {
    return {
      label: "Ejecutar ORION",
      description: "Primero necesitas diagnosticar la marca.",
      status: "ready",
    };
  }

  if (!memory?.business_memory) {
    return {
      label: "Construir Business Memory",
      description: "ORION está listo. Ahora falta mapear el negocio.",
      status: "ready",
    };
  }

  if (!memory?.growth_memory) {
    return {
      label: "Generar ATLAS",
      description: "Ya existe diagnóstico y memoria comercial. Falta estrategia.",
      status: "ready",
    };
  }

  return {
    label: "Continuar con MERCURY",
    description: "La estrategia está lista. Puedes crear el plan de contenido.",
    status: "ready",
  };
}

function AgentStatusCard({
  name,
  title,
  description,
  active,
  locked,
}: {
  name: string;
  title: string;
  description: string;
  active: boolean;
  locked?: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-slate-400 mb-2">
            {name}
          </p>

          <h3 className="text-xl font-black text-slate-950">{title}</h3>
        </div>

        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black ${
            active
              ? "bg-emerald-100 text-emerald-700"
              : locked
              ? "bg-slate-100 text-slate-400"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {active ? "✓" : locked ? "🔒" : "○"}
        </div>
      </div>

      <p className="text-slate-600 leading-7">{description}</p>
    </div>
  );
}

function Timeline({ events }: { events: any[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-8 text-slate-500">
        Aún no hay eventos registrados en COSMOS.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
      <h2 className="text-2xl font-black mb-6">Activity Timeline</h2>

      <div className="space-y-5">
        {events
          .slice()
          .reverse()
          .map((event, index) => (
            <div key={index} className="flex gap-4">
              <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black">
                {event.agent?.slice(0, 1) || "•"}
              </div>

              <div className="flex-1 border-b border-slate-100 pb-5">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-black text-slate-900">
                    {event.agent || "COSMOS"}
                  </p>

                  <p className="text-xs text-slate-400">
                    {event.timestamp
                      ? new Date(event.timestamp).toLocaleString("es-MX")
                      : ""}
                  </p>
                </div>

                <p className="text-sm text-blue-600 font-bold mt-1">
                  {event.action}
                </p>

                {event.summary && (
                  <p className="text-slate-600 leading-7 mt-2">
                    {event.summary}
                  </p>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

export default async function BrandWorkspace({
  params,
}: {
  params: Promise<{ brandName: string }>;
}) {
  const { brandName } = await params;
  const decodedBrandName = decodeURIComponent(brandName);

  const { data: memory } = await supabase
    .from("cosmos_memory")
    .select("*")
    .ilike("brand_name", decodedBrandName)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

    const { data: evidences } = await supabase
  .from("brand_evidence")
  .select("*")
  .ilike("brand_name", memory?.brand_name || decodedBrandName)
  .order("created_at", { ascending: false });

  const nextAction = getNextAction(memory);

  const hasOrion = Boolean(memory?.orion_memory);
  const hasBusiness = Boolean(memory?.business_memory);
  const hasAtlas = Boolean(memory?.growth_memory);
  const hasMercury = Boolean(memory?.mercury_content_plan);

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950 pl-80 pr-10 py-10">
      <Sidebar />

      <div className="mb-8">
        <Link href="/" className="text-sm font-bold text-blue-600">
          ← Volver al dashboard
        </Link>
      </div>

      <section className="relative overflow-hidden bg-slate-950 text-white rounded-[2rem] p-10 mb-8 shadow-xl">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-600 rounded-full blur-3xl opacity-30" />
        <div className="absolute right-24 bottom-0 w-60 h-60 bg-purple-600 rounded-full blur-3xl opacity-20" />

        <div className="relative z-10">
          <p className="text-blue-300 font-black tracking-[0.22em] text-xs mb-4">
            COMETA OS · BRAND WORKSPACE
          </p>

          <div className="flex items-end justify-between gap-8">
            <div>
              <h1 className="text-6xl font-black capitalize mb-4">
                {memory?.brand_name || decodedBrandName}
              </h1>

              <p className="text-slate-300 text-lg">
                {memory?.industry || "Industria no especificada"} ·{" "}
                {memory?.city || "Ciudad no especificada"}
              </p>
            </div>

            <div className="bg-white/10 border border-white/10 rounded-3xl p-6 min-w-72">
  <p className="text-sm text-slate-300 mb-2">Siguiente acción</p>

  <p className="text-2xl font-black">{nextAction.label}</p>

  <p className="text-slate-300 leading-6 mt-2">
    {nextAction.description}
  </p>

  {!hasOrion && (
    <Link
      href="/new-analysis"
      className="mt-5 inline-flex bg-white text-slate-950 hover:bg-blue-50 font-black px-5 py-3 rounded-2xl transition"
    >
      Ejecutar ORION →
    </Link>
  )}

  {hasOrion && !hasBusiness && (
    <Link
      href={`/nova/${memory?.brand_analysis_id}`}
      className="mt-5 inline-flex bg-white text-slate-950 hover:bg-blue-50 font-black px-5 py-3 rounded-2xl transition"
    >
      Construir Business Memory →
    </Link>
  )}

  {hasOrion && hasBusiness && !hasAtlas && (
    <Link
      href={`/generate-strategy?brandName=${encodeURIComponent(
        memory?.brand_name || decodedBrandName
      )}`}
      className="mt-5 inline-flex bg-white text-slate-950 hover:bg-blue-50 font-black px-5 py-3 rounded-2xl transition"
    >
      Ejecutar ATLAS →
    </Link>
  )}

  {hasAtlas && !hasMercury && (
    <button className="mt-5 bg-white/20 text-white font-black px-5 py-3 rounded-2xl">
      MERCURY pendiente
    </button>
  )}
</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <Metric title="Brand Score" value={`${getScore(memory)}/100`} />
        <Metric title="Opportunity" value={`${getOpportunity(memory)}/100`} />
        <Metric title="Brand Level" value={getLevel(memory)} />
        <Metric
          title="Memorias activas"
          value={
            [hasOrion, hasBusiness, hasAtlas, hasMercury].filter(Boolean)
              .length
          }
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <AgentStatusCard
          name="ORION"
          title="Diagnóstico digital"
          description="Percepción, presencia digital, sitio web, confianza y oportunidad."
          active={hasOrion}
        />

        <AgentStatusCard
          name="BUSINESS MEMORY"
          title="Mapa comercial"
          description="Oferta, buyer persona, objeciones, revenue drivers y diferenciadores."
          active={hasBusiness}
          locked={!hasOrion}
        />

        <AgentStatusCard
          name="ATLAS"
          title="Estrategia de crecimiento"
          description="Dirección estratégica, hipótesis, ruta de 90 días y calendario inicial."
          active={hasAtlas}
          locked={!hasBusiness}
        />

        <AgentStatusCard
          name="MERCURY"
          title="Motor de contenido"
          description="Plan mensual listo para producción, diseño y ejecución."
          active={hasMercury}
          locked={!hasAtlas}
        />
      </section>

      <EvidencePanel evidences={evidences || []} />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Timeline events={memory?.activity_timeline || []} />
        </div>

        <div className="space-y-5">
          <MemoryCard
            title="ORION Memory"
            active={hasOrion}
            description="Diagnóstico externo de marca."
          />
          <MemoryCard
            title="Business Memory"
            active={hasBusiness}
            description="Conocimiento interno comercial."
          />
          <MemoryCard
            title="Growth Memory"
            active={hasAtlas}
            description="Estrategia generada por ATLAS."
          />
          <MemoryCard
            title="Revenue Memory"
            active={Boolean(memory?.revenue_memory)}
            description="Ventas, POS y oportunidades de ingreso."
          />
        </div>
      </section>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: any }) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
      <p className="text-xs font-black tracking-[0.18em] text-slate-400 mb-3">
        {title.toUpperCase()}
      </p>

      <p className="text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function MemoryCard({
  title,
  active,
  description,
}: {
  title: string;
  active: boolean;
  description: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="font-black text-slate-900">{title}</p>

        <span
          className={`text-xs font-black px-3 py-1 rounded-full ${
            active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          {active ? "ACTIVA" : "PENDIENTE"}
        </span>
      </div>

      <p className="text-slate-500 leading-6">{description}</p>
    </div>
  );
}