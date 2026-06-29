import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/app/Sidebar";
import EvidencePanel from "@/components/EvidencePanel";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function slugifyLocal(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getScore(memory: any) {
  return memory?.orion_memory?.result?.brand_score || 0;
}

function getOpportunity(memory: any) {
  return memory?.orion_memory?.result?.opportunity_level?.score || 0;
}

function getLevel(memory: any) {
  return memory?.orion_memory?.result?.brand_level || "Sin nivel";
}

function getMercuryMemory(memory: any) {
  return (
    memory?.mercury_memory ||
    memory?.mercury_content_plan ||
    memory?.content_calendar_memory ||
    null
  );
}

function getSalesMemory(memory: any) {
  return memory?.sales_memory || memory?.sales_ai_memory || null;
}

function getPulseMemory(memory: any) {
  return memory?.orion_pulse_memory || memory?.social_intelligence_memory || null;
}

function getNextAction({
  memory,
  decodedBrandName,
  brandSlug,
}: {
  memory: any;
  decodedBrandName: string;
  brandSlug: string;
}) {
  if (!memory?.orion_memory) {
    return {
      label: "Ejecutar ORION",
      description: "Primero necesitas diagnosticar la marca con evidencia.",
      href: "/new-analysis",
      status: "ready",
    };
  }

  if (!memory?.business_memory) {
    return {
      label: "Construir NOVA",
      description: "ORION está listo. Ahora falta construir la memoria comercial.",
      href: `/nova/${memory?.brand_analysis_id}`,
      status: "ready",
    };
  }

  if (!memory?.growth_memory) {
    return {
      label: "Ejecutar ATLAS",
      description:
        "Ya existe diagnóstico y memoria comercial. Falta generar estrategia.",
      href: `/generate-strategy?brandName=${encodeURIComponent(
        memory?.brand_name || decodedBrandName
      )}`,
      status: "ready",
    };
  }

  if (!getMercuryMemory(memory)) {
    return {
      label: "Continuar con MERCURY",
      description:
        "ATLAS ya definió estrategia. MERCURY debe convertirla en ciclo de contenido de 30 días.",
      href: `/mercury/${encodeURIComponent(brandSlug)}`,
      status: "ready",
    };
  }

  return {
    label: "Abrir MERCURY",
    description:
      "La estrategia de contenido ya existe. Puedes revisar, ajustar o renovar el ciclo.",
    href: `/mercury/${encodeURIComponent(brandSlug)}`,
    status: "active",
  };
}

function getPriorityLabel(priority: string) {
  const value = String(priority || "").toLowerCase();

  if (value === "high") return "Alta";
  if (value === "critical") return "Crítica";
  if (value === "medium") return "Media";
  if (value === "low") return "Baja";

  return priority || "Media";
}

function getPriorityClass(priority: string) {
  const value = String(priority || "").toLowerCase();

  if (value === "critical") {
    return "bg-rose-100 text-rose-700 border-rose-200";
  }

  if (value === "high") {
    return "bg-orange-100 text-orange-700 border-orange-200";
  }

  if (value === "medium") {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }

  return "bg-slate-100 text-slate-500 border-slate-200";
}

function getStatusLabel(status: string) {
  const value = String(status || "").toLowerCase();

  if (value === "pending") return "Pendiente";
  if (value === "accepted") return "Aceptada";
  if (value === "applied") return "Aplicada";
  if (value === "ignored") return "Ignorada";
  if (value === "resolved") return "Resuelta";

  return status || "Pendiente";
}

function formatDate(value: string) {
  if (!value) return "";

  try {
    return new Date(value).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function AgentStatusCard({
  name,
  title,
  description,
  active,
  locked,
  href,
  cta,
  icon,
}: {
  name: string;
  title: string;
  description: string;
  active: boolean;
  locked?: boolean;
  href?: string;
  cta?: string;
  icon: string;
}) {
  const content = (
    <div className="group h-full rounded-[32px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl ${
              active
                ? "bg-slate-950 text-white"
                : locked
                ? "bg-slate-100 text-slate-400"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            {icon}
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              {name}
            </p>

            <h3 className="text-xl font-black tracking-[-0.04em] text-slate-950">
              {title}
            </h3>
          </div>
        </div>

        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-xs font-black ${
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

      <p className="text-sm font-semibold leading-7 text-slate-600">
        {description}
      </p>

      {cta && !locked ? (
        <p className="mt-5 text-sm font-black text-blue-600 transition group-hover:text-blue-700">
          {cta} →
        </p>
      ) : null}
    </div>
  );

  if (!href || locked) {
    return content;
  }

  return (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  );
}

function Timeline({ events }: { events: any[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-[34px] border border-white bg-white p-8 text-sm font-semibold text-slate-500 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        Aún no hay eventos registrados en COSMOS.
      </div>
    );
  }

  return (
    <div className="rounded-[34px] border border-white bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">
            COSMOS Memory
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.06em]">
            Activity Timeline
          </h2>
        </div>

        <span className="rounded-full bg-slate-100 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          {events.length} eventos
        </span>
      </div>

      <div className="space-y-5">
        {events
          .slice()
          .reverse()
          .slice(0, 8)
          .map((event, index) => (
            <div key={index} className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 font-black text-white">
                {event.agent?.slice(0, 1) || "•"}
              </div>

              <div className="flex-1 border-b border-slate-100 pb-5">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-black text-slate-900">
                    {event.agent || "COSMOS"}
                  </p>

                  <p className="text-xs font-semibold text-slate-400">
                    {event.timestamp
                      ? new Date(event.timestamp).toLocaleString("es-MX")
                      : ""}
                  </p>
                </div>

                <p className="mt-1 text-sm font-bold text-blue-600">
                  {event.action}
                </p>

                {event.summary ? (
                  <p className="mt-2 text-sm font-semibold leading-7 text-slate-600">
                    {event.summary}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function AgentSignalsPanel({
  signals,
  brandSlug,
}: {
  signals: any[];
  brandSlug: string;
}) {
  return (
    <section className="rounded-[38px] border border-white bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
            AI Signals · Agent Intelligence
          </p>

          <h2 className="mt-2 text-4xl font-black tracking-[-0.07em] text-slate-950">
            Centro de señales IA
          </h2>

          <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-600">
            Aquí los agentes registran señales, cambios, recomendaciones y
            acciones que otros agentes deben tomar. Esta es la capa viva de
            Cometa OS.
          </p>
        </div>

        <Link
          href={`/mercury/${encodeURIComponent(brandSlug)}`}
          className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-cyan-700"
        >
          Abrir MERCURY →
        </Link>
      </div>

      {!signals || signals.length === 0 ? (
        <div className="rounded-[30px] border border-slate-200 bg-slate-50 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Sin señales activas
          </p>

          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
            Todavía no hay notificaciones de agentes para esta marca. Cuando
            ATLAS, MERCURY, SALES AI u ORION Pulse detecten algo importante,
            aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {signals.slice(0, 6).map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </section>
  );
}

function SignalCard({ signal }: { signal: any }) {
  return (
    <article className="rounded-[30px] border border-slate-200 bg-slate-50 p-6 transition hover:border-cyan-200 hover:bg-white hover:shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            {signal.agent_name || "Agente IA"} →{" "}
            {signal.target_agent || "Sistema"}
          </p>

          <h3 className="mt-2 text-xl font-black leading-tight tracking-[-0.04em] text-slate-950">
            {signal.title || "Señal detectada"}
          </h3>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getPriorityClass(
            signal.priority
          )}`}
        >
          {getPriorityLabel(signal.priority)}
        </span>
      </div>

      <p className="text-sm font-semibold leading-7 text-slate-600">
        {signal.summary || "Sin resumen disponible."}
      </p>

      {signal.recommended_action ? (
        <div className="mt-5 rounded-2xl border border-white bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700">
            Acción sugerida
          </p>

          <p className="mt-2 text-sm font-black leading-6 text-slate-800">
            {signal.recommended_action}
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-4">
        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
          {getStatusLabel(signal.status)}
        </span>

        <span className="text-xs font-bold text-slate-400">
          {formatDate(signal.created_at)}
        </span>
      </div>
    </article>
  );
}

export default async function BrandWorkspace({
  params,
}: {
  params: Promise<{ brandName: string }>;
}) {
  const { brandName } = await params;
  const decodedBrandName = decodeURIComponent(brandName);
  const requestedBrandSlug = slugifyLocal(decodedBrandName);

  const { data: memoryBySlug } = await supabase
    .from("cosmos_memory")
    .select("*")
    .eq("brand_slug", requestedBrandSlug)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let memory = memoryBySlug;

  if (!memory) {
    const { data: memoryByName } = await supabase
      .from("cosmos_memory")
      .select("*")
      .ilike("brand_name", decodedBrandName)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    memory = memoryByName;
  }

  const brandSlug = memory?.brand_slug || requestedBrandSlug;
  const displayBrandName = memory?.brand_name || decodedBrandName;

  const { data: evidences } = await supabase
    .from("brand_evidence")
    .select("*")
    .ilike("brand_name", displayBrandName)
    .order("created_at", { ascending: false });

  const { data: signalsBySlug } = await supabaseAdmin
    .from("agent_notifications")
    .select("*")
    .eq("brand_slug", brandSlug)
    .order("created_at", { ascending: false })
    .limit(9);

  let agentSignals = signalsBySlug || [];

  if (!agentSignals.length) {
    const { data: signalsByName } = await supabaseAdmin
      .from("agent_notifications")
      .select("*")
      .ilike("brand_name", displayBrandName)
      .order("created_at", { ascending: false })
      .limit(9);

    agentSignals = signalsByName || [];
  }

  const nextAction = getNextAction({
    memory,
    decodedBrandName,
    brandSlug,
  });

  const hasOrion = Boolean(memory?.orion_memory);
  const hasBusiness = Boolean(memory?.business_memory);
  const hasAtlas = Boolean(memory?.growth_memory);
  const hasMercury = Boolean(getMercuryMemory(memory));
  const hasSales = Boolean(getSalesMemory(memory));
  const hasPulse = Boolean(getPulseMemory(memory));

  const activeMemories = [
    hasOrion,
    hasBusiness,
    hasAtlas,
    hasMercury,
    hasSales,
    hasPulse,
  ].filter(Boolean).length;

  return (
    <main className="min-h-screen bg-[#f6f7fb] py-10 pl-80 pr-10 text-slate-950">
      <Sidebar />

      <section className="mx-auto max-w-7xl space-y-8">
        <div>
          <Link href="/" className="text-sm font-black text-blue-600">
            ← Volver al dashboard
          </Link>
        </div>

        <section className="overflow-hidden rounded-[42px] bg-slate-950 text-white shadow-[0_30px_100px_rgba(15,23,42,0.18)]">
          <div className="relative p-8 md:p-10">
            <div className="absolute right-[-120px] top-[-140px] h-96 w-96 rounded-full bg-blue-600/25 blur-[90px]" />
            <div className="absolute bottom-[-140px] left-[24%] h-80 w-80 rounded-full bg-cyan-400/10 blur-[90px]" />
            <div className="absolute bottom-[-160px] right-[20%] h-80 w-80 rounded-full bg-purple-500/10 blur-[90px]" />

            <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-end">
              <div>
                <div className="mb-6 flex flex-wrap gap-3">
                  <BadgeDark>Brand OS</BadgeDark>
                  <BadgeDark tone="cyan">Command Center</BadgeDark>
                  <BadgeDark tone={agentSignals.length ? "amber" : "slate"}>
                    {agentSignals.length
                      ? `${agentSignals.length} señales IA`
                      : "Sin señales pendientes"}
                  </BadgeDark>
                </div>

                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
                  {memory?.industry || "Industria no especificada"}
                </p>

                <h1 className="mt-5 max-w-5xl text-5xl font-black capitalize leading-none tracking-[-0.08em] md:text-7xl">
                  {displayBrandName} Command Center
                </h1>

                <p className="mt-6 max-w-4xl text-sm font-semibold leading-8 text-slate-300 md:text-base">
                  Cometa OS centraliza diagnóstico, memoria comercial,
                  estrategia, señales de agentes, ejecución de contenido y ventas
                  para que la marca opere con inteligencia conectada.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href={nextAction.href}
                    className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-white px-7 text-sm font-black text-slate-950 transition hover:bg-cyan-100"
                  >
                    {nextAction.label} →
                  </Link>

                  <Link
                    href={`/mercury/${encodeURIComponent(brandSlug)}`}
                    className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-7 text-sm font-black text-white transition hover:bg-white/10"
                  >
                    Abrir MERCURY
                  </Link>
                </div>
              </div>

              <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
                  Siguiente acción
                </p>

                <h2 className="mt-4 text-3xl font-black tracking-[-0.06em]">
                  {nextAction.label}
                </h2>

                <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                  {nextAction.description}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <HeroMini label="Ciudad" value={memory?.city || "No detectada"} />
                  <HeroMini label="Nivel" value={getLevel(memory)} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
          <Metric title="Brand Score" value={`${getScore(memory)}/100`} />
          <Metric title="Opportunity" value={`${getOpportunity(memory)}/100`} />
          <Metric title="Brand Level" value={getLevel(memory)} />
          <Metric title="Memorias activas" value={`${activeMemories}/6`} />
        </section>

        <section className="rounded-[38px] border border-white bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
          <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">
                Agent Ecosystem
              </p>

              <h2 className="mt-2 text-4xl font-black tracking-[-0.07em]">
                Agentes conectados de la marca
              </h2>

              <p className="mt-3 max-w-4xl text-sm font-semibold leading-7 text-slate-600">
                Cada agente cumple una función dentro del sistema. El objetivo no
                es generar reportes aislados, sino una memoria viva que conecte
                diagnóstico, estrategia, ejecución y ventas.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            <AgentStatusCard
              name="ORION"
              title="Diagnóstico digital"
              description="Percepción, presencia digital, evidencia pública, confianza y oportunidad."
              active={hasOrion}
              href="/new-analysis"
              cta={hasOrion ? "Revisar diagnóstico" : "Ejecutar ORION"}
              icon="🛰️"
            />

            <AgentStatusCard
              name="NOVA"
              title="Business Memory"
              description="Oferta, buyer persona, objeciones, revenue drivers y diferenciadores."
              active={hasBusiness}
              locked={!hasOrion}
              href={`/nova/${memory?.brand_analysis_id}`}
              cta={hasBusiness ? "Revisar memoria" : "Construir NOVA"}
              icon="🧬"
            />

            <AgentStatusCard
              name="ATLAS"
              title="Estrategia de crecimiento"
              description="Dirección estratégica, hipótesis, growth model y recomendación ejecutiva."
              active={hasAtlas}
              locked={!hasBusiness}
              href={`/generate-strategy?brandName=${encodeURIComponent(
                displayBrandName
              )}`}
              cta={hasAtlas ? "Regenerar estrategia" : "Ejecutar ATLAS"}
              icon="🧭"
            />

            <AgentStatusCard
              name="MERCURY"
              title="Execution Engine"
              description="Ciclo de contenido de 30 días, semanas, formatos, CTAs e hipótesis."
              active={hasMercury}
              locked={!hasAtlas}
              href={`/mercury/${encodeURIComponent(brandSlug)}`}
              cta={hasMercury ? "Abrir ciclo activo" : "Crear ciclo mensual"}
              icon="⚡"
            />

            <AgentStatusCard
              name="SALES AI"
              title="Conversión y WhatsApp"
              description="Objeciones, leads, respuestas, seguimiento, reglas de venta y cierre."
              active={hasSales}
              locked={!hasBusiness}
              href={`/sales-ai?brandName=${encodeURIComponent(displayBrandName)}`}
              cta={hasSales ? "Abrir ventas" : "Preparar ventas"}
              icon="💬"
            />

            <AgentStatusCard
              name="ORION PULSE"
              title="Social Intelligence"
              description="Monitoreo de redes, competencia, señales de rendimiento e hipótesis."
              active={hasPulse}
              locked={!hasAtlas}
              href={`/workspace/${encodeURIComponent(displayBrandName)}`}
              cta={hasPulse ? "Revisar señales" : "Activar monitoreo"}
              icon="📡"
            />
          </div>
        </section>

        <AgentSignalsPanel signals={agentSignals} brandSlug={brandSlug} />

        <EvidencePanel evidences={evidences || []} />

        <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
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
              title="Mercury Memory"
              active={hasMercury}
              description="Ciclo de contenido y ejecución mensual."
            />
            <MemoryCard
              title="Sales Memory"
              active={hasSales}
              description="Ventas, leads, objeciones y respuestas."
            />
            <MemoryCard
              title="Pulse Memory"
              active={hasPulse}
              description="Señales de redes, competencia e hipótesis."
            />
          </div>
        </section>
      </section>
    </main>
  );
}

function BadgeDark({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "cyan" | "amber";
}) {
  const className =
    tone === "cyan"
      ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
      : tone === "amber"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
      : "border-white/10 bg-white/10 text-white";

  return (
    <span
      className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${className}`}
    >
      {children}
    </span>
  );
}

function HeroMini({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-[30px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {title}
      </p>

      <p className="text-3xl font-black tracking-[-0.06em] text-slate-950">
        {value}
      </p>
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
    <div className="rounded-[30px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="font-black text-slate-900">{title}</p>

        <span
          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
            active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          {active ? "Activa" : "Pendiente"}
        </span>
      </div>

      <p className="text-sm font-semibold leading-6 text-slate-500">
        {description}
      </p>
    </div>
  );
}