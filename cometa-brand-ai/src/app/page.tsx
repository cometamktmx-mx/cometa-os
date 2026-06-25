import Link from "next/link";
import type { ReactNode } from "react";

const trustItems = [
  {
    icon: "system",
    title: "Sistema todo en uno",
    text: "Diagnostica, opera y escala.",
  },
  {
    icon: "network",
    title: "IA entrenada",
    text: "Con tu propio negocio.",
  },
  {
    icon: "spark",
    title: "Implementación rápida",
    text: "Resultados en semanas.",
  },
  {
    icon: "shield",
    title: "Seguridad empresarial",
    text: "Datos y procesos protegidos.",
  },
  {
    icon: "scale",
    title: "Escalable",
    text: "Para marcas en crecimiento.",
  },
];

const problemCards = [
  {
    icon: "scatter",
    title: "Marketing disperso",
    text: "Campañas sin conexión ni estrategia clara.",
  },
  {
    icon: "users",
    title: "Leads sin seguimiento",
    text: "Oportunidades que se pierden cada día.",
  },
  {
    icon: "chart",
    title: "Datos sin decisiones",
    text: "Información que no se convierte en acción.",
  },
  {
    icon: "target",
    title: "Campañas sin sistema",
    text: "Mucha actividad, pocos resultados reales.",
  },
];

const valueCards = [
  {
    icon: "radar",
    title: "Diagnostica",
    text: "Entiende tu marca, mercado y audiencia con precisión.",
  },
  {
    icon: "nodes",
    title: "Opera",
    text: "Activa agentes que ejecutan estrategias y tareas clave.",
  },
  {
    icon: "brain",
    title: "Aprende",
    text: "Mejora continuamente con datos, resultados y retroalimentación.",
  },
  {
    icon: "rocket",
    title: "Ejecuta",
    text: "Entrega resultados medibles en cada punto de contacto.",
  },
];

const agents = [
  {
    code: "ORION",
    title: "Diagnóstico de marca",
    text: "Analiza tu marca y detecta oportunidades de crecimiento.",
    icon: "compass",
    accent: "blue",
  },
  {
    code: "NOVA",
    title: "Mapa comercial",
    text: "Segmenta, prioriza y mapea tu mercado ideal.",
    icon: "users",
    accent: "emerald",
  },
  {
    code: "ATLAS",
    title: "Estrategia de crecimiento",
    text: "Diseña estrategias comerciales basadas en datos.",
    icon: "spark",
    accent: "violet",
  },
  {
    code: "SALES AI",
    title: "Ventas por WhatsApp",
    text: "Conversa, califica y convierte leads en ventas.",
    icon: "whatsapp",
    accent: "emerald",
  },
  {
    code: "KNOWLEDGE BRAIN",
    title: "Cerebro comercial",
    text: "Centraliza y organiza el conocimiento de tu negocio.",
    icon: "book",
    accent: "cyan",
  },
  {
    code: "LEARNING HUB",
    title: "Aprendizaje supervisado",
    text: "Entrena agentes y equipos con datos reales.",
    icon: "brain",
    accent: "blue",
  },
  {
    code: "COSMOS MEMORY",
    title: "Memoria del negocio",
    text: "Recuerda contexto, historial y aprendizaje.",
    icon: "database",
    accent: "blue",
  },
  {
    code: "MERCURY",
    title: "Ejecución de contenido",
    text: "Crea, adapta y publica contenido que genera resultado.",
    icon: "rocket",
    accent: "orange",
  },
  {
    code: "POS INTELLIGENCE",
    title: "Inventario, ventas y rotación",
    text: "Monitorea ventas, rotación e inventario en tiempo real.",
    icon: "chart",
    accent: "blue",
  },
  {
    code: "HOSPITALITY AI",
    title: "Hoteles",
    text: "Optimiza ocupación, experiencia del huésped y revenue.",
    icon: "hotel",
    accent: "purple",
  },
  {
    code: "RESTAURANT AI",
    title: "Restaurantes",
    text: "Incrementa tickets, recurrencia y lealtad del cliente.",
    icon: "restaurant",
    accent: "slate",
  },
  {
    code: "BRAND COMMANDER",
    title: "Coordinación diaria de agentes",
    text: "Orquesta y alinea a todos los agentes para lograr resultados.",
    icon: "shield",
    accent: "amber",
  },
];

const workflow = [
  {
    number: "1",
    icon: "compass",
    title: "ORION analiza la marca",
    text: "Diagnostica situación actual, mercado, audiencia y oportunidades.",
  },
  {
    number: "2",
    icon: "map",
    title: "NOVA construye el mapa comercial",
    text: "Segmenta, prioriza y define mercado ideal y propuesta de valor.",
  },
  {
    number: "3",
    icon: "brain",
    title: "Knowledge entrena el sistema",
    text: "Centraliza conocimiento y entrena agentes con datos reales.",
  },
  {
    number: "4",
    icon: "whatsapp",
    title: "SALES AI opera y califica",
    text: "Conversa, responde, califica y convierte oportunidades.",
  },
  {
    number: "5",
    icon: "book",
    title: "Learning mejora el sistema",
    text: "Aprende de resultados y optimiza procesos continuamente.",
  },
];

const industries = [
  {
    icon: "bag",
    title: "Retail",
    text: "Aumenta ventas y lealtad omnicanal.",
  },
  {
    icon: "hanger",
    title: "Moda",
    text: "Conecta tendencias, audiencias y ventas.",
  },
  {
    icon: "hotel",
    title: "Hoteles",
    text: "Optimiza ocupación y experiencia.",
  },
  {
    icon: "restaurant",
    title: "Restaurantes",
    text: "Incrementa tickets y frecuencia.",
  },
  {
    icon: "clinic",
    title: "Clínicas",
    text: "Mejora conversión y experiencia.",
  },
  {
    icon: "cart",
    title: "Supermercados",
    text: "Más rotación, margen y fidelidad.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#eef6fa] text-slate-950">
      <Navbar />

      <Hero />

      <TrustStrip />

      <ProblemSolution />

      <WhatIsCometaOS />

      <AgentsEcosystem />

      <HowItWorks />

      <Industries />

      <FinalCTA />

      <Footer />
    </main>
  );
}

function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#06101f]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-20 w-full max-w-[1500px] items-center justify-between px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <LogoMark />
          <span className="text-xl font-black uppercase tracking-[-0.03em] text-white">
            COMETA OS
          </span>
        </Link>

        <nav className="hidden items-center gap-10 text-sm font-black text-slate-300 lg:flex">
          <a href="#sistema" className="transition hover:text-cyan-300">
            Sistema
          </a>
          <a href="#agentes" className="transition hover:text-cyan-300">
            Agentes
          </a>
          <a href="#funciona" className="transition hover:text-cyan-300">
            Cómo funciona
          </a>
          <a href="#industrias" className="transition hover:text-cyan-300">
            Industrias
          </a>
          <a href="#demo" className="transition hover:text-cyan-300">
            Demo
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden rounded-2xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10 sm:block"
          >
            Iniciar sesión
          </Link>

          <a
            href="mailto:cometa.mktmx@gmail.com?subject=Quiero%20una%20demo%20de%20Cometa%20OS"
            className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:bg-cyan-200"
          >
            Solicitar demo
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#06101f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(34,211,238,0.22),transparent_32%),radial-gradient(circle_at_10%_10%,rgba(59,130,246,0.18),transparent_35%)]" />
      <div className="absolute bottom-[-160px] right-[-80px] h-[420px] w-[1100px] rotate-[-8deg] rounded-[100%] border border-cyan-300/25 bg-cyan-400/5 blur-[1px]" />
      <div className="absolute bottom-[-190px] right-[-120px] h-[460px] w-[1200px] rotate-[-8deg] rounded-[100%] border border-cyan-300/10" />

      <div className="relative mx-auto grid min-h-[760px] w-full max-w-[1500px] items-center gap-10 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_780px] lg:px-8">
        <div className="max-w-2xl">
          <div className="mb-7 flex flex-wrap gap-3">
            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">
              Agencia + Sistema
            </span>
            <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">
              Inteligencia comercial
            </span>
          </div>

          <h1 className="text-[44px] font-black leading-[0.98] tracking-[-0.07em] md:text-[66px] xl:text-[78px]">
            Tu sistema operativo comercial con{" "}
            <span className="text-cyan-300">agentes de inteligencia.</span>
          </h1>

          <p className="mt-7 max-w-xl text-base font-semibold leading-8 text-slate-300 md:text-lg">
            Cometa OS conecta diagnóstico de marca, estrategia, conocimiento,
            ventas por WhatsApp, aprendizaje y ejecución en un solo sistema
            inteligente.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="mailto:cometa.mktmx@gmail.com?subject=Quiero%20una%20demo%20de%20Cometa%20OS"
              className="flex h-14 items-center justify-center rounded-2xl bg-cyan-300 px-7 text-sm font-black text-slate-950 shadow-xl shadow-cyan-400/20 transition hover:-translate-y-0.5 hover:bg-cyan-200"
            >
              Solicitar demo <span className="ml-3">→</span>
            </a>

            <a
              href="#sistema"
              className="flex h-14 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-7 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              Conocer el sistema <span className="ml-3">▷</span>
            </a>
          </div>

          <div className="mt-8 flex items-center gap-3 text-xs font-semibold text-slate-400">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-300/30 text-cyan-300">
              ✓
            </span>
            Operación segura. Datos protegidos. Resultados medibles.
          </div>
        </div>

        <DashboardPreview />
      </div>
    </section>
  );
}

function DashboardPreview() {
  const dashboardAgents = [
    ["ORION", "Diagnóstico de marca", "compass"],
    ["KNOWLEDGE BRAIN", "Cerebro comercial", "brain"],
    ["NOVA", "Mapa comercial", "users"],
    ["LEARNING HUB", "Aprendizaje supervisado", "book"],
    ["ATLAS", "Estrategia de crecimiento", "spark"],
    ["COSMOS MEMORY", "Memoria del negocio", "database"],
    ["SALES AI", "Ventas por WhatsApp", "whatsapp"],
    ["MERCURY", "Ejecución de contenido", "rocket"],
  ];

  return (
    <div className="relative hidden lg:block">
      <div className="absolute -left-8 top-10 h-[520px] w-[520px] rounded-full bg-cyan-400/10 blur-[120px]" />

      <section className="relative rounded-[30px] border border-cyan-300/20 bg-[#08172b]/90 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur">
        <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-4">
          <aside className="rounded-[24px] border border-white/10 bg-white/5 p-3">
            <LogoMark small />
            <div className="mt-8 grid gap-3">
              {["grid", "users", "chart", "book", "database", "settings"].map(
                (icon) => (
                  <div
                    key={icon}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-slate-400"
                  >
                    <Icon name={icon} className="h-5 w-5" />
                  </div>
                )
              )}
            </div>
          </aside>

          <div className="rounded-[24px] border border-white/10 bg-[#0b1c33] p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-white">
                  COMETA OS
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  Intelligence Command Center
                </p>
              </div>

              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Índice de listeza
                </p>
                <div className="mt-2 flex h-20 w-20 items-center justify-center rounded-full bg-cyan-300/10 text-3xl font-black text-cyan-300 ring-8 ring-cyan-300/10">
                  89
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {dashboardAgents.map(([name, text, icon]) => (
                <div
                  key={name}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-300">
                    <Icon name={icon} className="h-6 w-6" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">
                      {name}
                    </p>
                    <p className="truncate text-xs font-semibold text-slate-400">
                      {text}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-[10px] font-black uppercase text-emerald-300">
                        Activo
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <DashboardMetric title="Ingresos generados" value="$2.4M" up="+32%" />
              <DashboardMetric title="Leads calificados" value="18,732" up="+28%" />
              <DashboardMetric title="Tasa de cierre" value="24.6%" up="+15%" />
              <DashboardMetric title="ROAS promedio" value="4.6x" up="+36%" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function DashboardMetric({
  title,
  value,
  up,
}: {
  title: string;
  value: string;
  up: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] font-bold text-slate-400">{title}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-xl font-black text-white">{value}</p>
        <p className="text-xs font-black text-emerald-300">{up}</p>
      </div>
    </div>
  );
}

function TrustStrip() {
  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-[1500px] px-5 py-8 lg:px-8">
        <h2 className="text-center text-2xl font-black tracking-[-0.05em] text-slate-950 md:text-3xl">
          Operación inteligente para marcas que quieren vender con datos.
        </h2>

        <div className="mt-7 grid gap-4 md:grid-cols-5">
          {trustItems.map((item) => (
            <div key={item.title} className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <Icon name={item.icon} className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-950">
                  {item.title}
                </p>
                <p className="text-xs font-semibold text-slate-500">
                  {item.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProblemSolution() {
  return (
    <section className="mx-auto grid w-full max-w-[1500px] gap-8 px-5 py-14 lg:grid-cols-[minmax(0,1fr)_680px] lg:px-8">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
          El problema real
        </p>

        <h2 className="mt-4 max-w-2xl text-4xl font-black leading-[0.98] tracking-[-0.07em] md:text-5xl">
          El problema no es tu producto. Es la falta de sistema.
        </h2>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {problemCards.map((item) => (
            <article
              key={item.title}
              className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)]"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                <Icon name={item.icon} className="h-6 w-6" />
              </div>

              <h3 className="text-xl font-black tracking-[-0.045em]">
                {item.title}
              </h3>

              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                {item.text}
              </p>
            </article>
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[30px] bg-slate-950 p-8 text-white shadow-[0_28px_90px_rgba(15,23,42,0.18)] md:p-10">
        <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-cyan-400/25 blur-[90px]" />
        <div className="absolute bottom-[-100px] right-[-60px] h-64 w-64 rounded-full border border-cyan-300/30" />
        <div className="absolute bottom-20 right-16 h-2 w-28 rotate-[-35deg] rounded-full bg-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.9)]" />

        <div className="relative z-10">
          <h2 className="max-w-xl text-4xl font-black leading-[1.02] tracking-[-0.06em]">
            Cometa OS convierte todo eso en un{" "}
            <span className="text-cyan-300">sistema operativo comercial.</span>
          </h2>

          <div className="mt-8 grid gap-4">
            {[
              "Unifica datos, equipos y canales.",
              "Activa agentes de IA que analizan, ejecutan y aprenden.",
              "Convierte información en ingresos.",
              "Escala tu operación con inteligencia.",
            ].map((text) => (
              <div key={text} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-300">
                  ✓
                </span>
                <p className="text-sm font-semibold text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WhatIsCometaOS() {
  return (
    <section
      id="sistema"
      className="mx-auto w-full max-w-[1500px] px-5 py-10 lg:px-8"
    >
      <div className="rounded-[34px] border border-white bg-white p-7 shadow-[0_24px_90px_rgba(15,23,42,0.06)] md:p-10">
        <div className="text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
            ¿Qué es Cometa OS?
          </p>

          <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-950 md:text-4xl">
            Una capa inteligente que conecta marketing, ventas, datos y
            operaciones.
          </h2>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {valueCards.map((card) => (
            <article
              key={card.title}
              className="rounded-[26px] border border-slate-200 bg-slate-50 p-6"
            >
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
                <Icon name={card.icon} className="h-7 w-7" />
              </div>

              <h3 className="text-xl font-black tracking-[-0.045em]">
                {card.title}
              </h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                {card.text}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function AgentsEcosystem() {
  return (
    <section
      id="agentes"
      className="mx-auto w-full max-w-[1500px] px-5 py-14 lg:px-8"
    >
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
          Ecosistema de agentes
        </p>

        <h2 className="mt-3 text-4xl font-black leading-[0.98] tracking-[-0.07em] md:text-5xl">
          Agentes de inteligencia comercial.
        </h2>

        <p className="mx-auto mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
          Agentes especializados que trabajan alrededor de tu negocio para
          diagnosticar, coordinar, ejecutar, vender y aprender.
        </p>
      </div>

      <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {agents.map((agent) => (
          <AgentCard key={agent.code} agent={agent} />
        ))}
      </div>
    </section>
  );
}

function AgentCard({ agent }: { agent: any }) {
  return (
    <article className="group relative min-h-[230px] overflow-hidden rounded-[24px] border border-white bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:bg-slate-950 hover:text-white">
      <div className="absolute -right-14 -top-14 h-32 w-32 rounded-full bg-cyan-300/0 blur-[50px] transition group-hover:bg-cyan-300/20" />

      <div
        className={`relative z-10 mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${accentClass(
          agent.accent
        )}`}
      >
        <Icon name={agent.icon} className="h-6 w-6" />
      </div>

      <p className="relative z-10 text-[11px] font-black uppercase leading-4 tracking-[-0.01em] text-cyan-700 group-hover:text-cyan-300">
        {agent.code}
      </p>

      <h3 className="relative z-10 mt-2 text-lg font-black leading-6 tracking-[-0.045em]">
        {agent.title}
      </h3>

      <p className="relative z-10 mt-3 text-xs font-semibold leading-5 text-slate-600 group-hover:text-slate-300">
        {agent.text}
      </p>

      <div
        className={`absolute bottom-5 left-5 h-1 w-9 rounded-full ${accentBar(
          agent.accent
        )}`}
      />
    </article>
  );
}

function HowItWorks() {
  return (
    <section
      id="funciona"
      className="mx-auto w-full max-w-[1500px] px-5 py-10 lg:px-8"
    >
      <div className="relative overflow-hidden rounded-[34px] bg-slate-950 p-7 text-white shadow-[0_30px_100px_rgba(15,23,42,0.2)] md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.18),transparent_40%)]" />

        <div className="relative z-10 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Cómo funciona Cometa OS
          </p>

          <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] md:text-4xl">
            Un ciclo continuo de inteligencia, acción y mejora.
          </h2>
        </div>

        <div className="relative z-10 mt-10 grid gap-4 lg:grid-cols-5">
          {workflow.map((step) => (
            <article
              key={step.number}
              className="relative rounded-[28px] border border-white/10 bg-white/5 p-6"
            >
              <div className="absolute -top-5 left-6 flex h-11 w-11 items-center justify-center rounded-full bg-cyan-300 text-sm font-black text-slate-950 ring-8 ring-slate-950">
                {step.number}
              </div>

              <div className="mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-300">
                <Icon name={step.icon} className="h-7 w-7" />
              </div>

              <h3 className="mt-5 text-xl font-black leading-6 tracking-[-0.045em]">
                {step.title}
              </h3>

              <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
                {step.text}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Industries() {
  return (
    <section
      id="industrias"
      className="mx-auto w-full max-w-[1500px] px-5 py-12 lg:px-8"
    >
      <h2 className="text-center text-3xl font-black tracking-[-0.06em] md:text-4xl">
        Hecho para industrias que quieren liderar su categoría.
      </h2>

      <div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {industries.map((industry) => (
          <article
            key={industry.title}
            className="rounded-[24px] border border-white bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.05)]"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
              <Icon name={industry.icon} className="h-6 w-6" />
            </div>

            <h3 className="text-lg font-black tracking-[-0.045em]">
              {industry.title}
            </h3>

            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
              {industry.text}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section id="demo" className="mx-auto w-full max-w-[1500px] px-5 pb-16 pt-8 lg:px-8">
      <div className="relative overflow-hidden rounded-[34px] bg-slate-950 p-8 text-white shadow-[0_34px_110px_rgba(15,23,42,0.24)] md:p-10">
        <div className="absolute right-[-120px] top-[-100px] h-[360px] w-[360px] rounded-full bg-cyan-400/25 blur-[100px]" />
        <div className="absolute bottom-[-200px] right-[-120px] h-[420px] w-[900px] rotate-[-8deg] rounded-[100%] border border-cyan-300/20" />

        <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
              Convierte tu negocio en sistema
            </p>

            <h2 className="mt-4 text-4xl font-black leading-[0.98] tracking-[-0.07em] md:text-5xl">
              Deja de operar a ciegas.{" "}
              <span className="text-cyan-300">
                Empieza a vender con inteligencia comercial.
              </span>
            </h2>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <SmallBenefit title="Resultados medibles" text="Desde las primeras semanas." />
              <SmallBenefit title="Soporte experto" text="En cada etapa." />
              <SmallBenefit title="Implementación guiada" text="Y sin fricción." />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <a
              href="mailto:cometa.mktmx@gmail.com?subject=Quiero%20una%20demo%20de%20Cometa%20OS"
              className="flex h-14 items-center justify-center rounded-2xl bg-cyan-300 px-7 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
            >
              Solicitar demo →
            </a>

            <Link
              href="/login"
              className="flex h-14 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-7 text-sm font-black text-white transition hover:bg-white/10"
            >
              Entrar al sistema →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function SmallBenefit({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm font-black">{title}</p>
      <p className="mt-1 text-xs font-semibold text-slate-400">{text}</p>
    </div>
  );
}

function Footer() {
  const columns = [
    {
      title: "Sistema",
      links: ["Plataforma", "Seguridad", "Integraciones", "Precios"],
    },
    {
      title: "Agentes",
      links: ["Ecosistema", "Cómo funcionan", "Entrenamiento", "Casos de uso"],
    },
    {
      title: "Recursos",
      links: ["Blog", "Guías", "Webinars", "Centro de ayuda"],
    },
    {
      title: "Empresa",
      links: ["Nosotros", "Contacto", "Demo", "Políticas"],
    },
  ];

  return (
    <footer className="bg-[#06101f] text-white">
      <div className="mx-auto grid w-full max-w-[1500px] gap-10 px-5 py-12 lg:grid-cols-[320px_minmax(0,1fr)_360px] lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <LogoMark />
            <p className="text-xl font-black uppercase tracking-[-0.03em]">
              COMETA OS
            </p>
          </div>

          <p className="mt-4 text-sm font-semibold leading-6 text-slate-400">
            El sistema operativo comercial con agentes de inteligencia.
          </p>

          <div className="mt-6 flex gap-3">
            {["in", "ig", "yt"].map((item) => (
              <span
                key={item}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-black text-slate-300"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-8 sm:grid-cols-4">
          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-sm font-black text-white">{column.title}</p>
              <div className="mt-4 grid gap-3">
                {column.links.map((link) => (
                  <a
                    href="#"
                    key={link}
                    className="text-sm font-semibold text-slate-400 transition hover:text-cyan-300"
                  >
                    {link}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <p className="text-sm font-black">
            Recibe insights y novedades sobre inteligencia comercial.
          </p>

          <div className="mt-4 flex overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <input
              placeholder="Tu correo electrónico"
              className="min-w-0 flex-1 bg-transparent px-4 py-4 text-sm font-semibold text-white outline-none placeholder:text-slate-500"
            />
            <button className="bg-cyan-300 px-5 text-sm font-black text-slate-950">
              →
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 py-5">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 px-5 text-xs font-semibold text-slate-500 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>© 2026 Cometa OS. Todos los derechos reservados.</p>
          <p>Privacidad · Términos · Seguridad</p>
        </div>
      </div>
    </footer>
  );
}

function LogoMark({ small }: { small?: boolean }) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-slate-950 shadow-xl shadow-cyan-400/20 ${
        small ? "h-11 w-11" : "h-12 w-12"
      }`}
    >
      <div className="absolute h-7 w-7 rounded-full bg-cyan-300 blur-[8px]" />
      <div className="relative h-8 w-8 rounded-full bg-gradient-to-br from-cyan-300 via-emerald-400 to-slate-950" />
      <div className="absolute right-2 top-2 h-3 w-3 rounded-full bg-slate-950" />
    </div>
  );
}

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: string;
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "whatsapp") {
    return (
      <svg {...common}>
        <path d="M4.5 19.5 5.7 16A8 8 0 1 1 8 18.2l-3.5 1.3Z" />
        <path d="M9 9.5c.5 2 2 3.5 4 4l1.2-1.2 2 1c-.2 1.5-1 2.2-2.2 2.2-3.4 0-6.5-3.1-6.5-6.5 0-1.2.7-2 2.2-2.2l1 2L9 9.5Z" />
      </svg>
    );
  }

  if (name === "brain") {
    return (
      <svg {...common}>
        <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 5 2.2V4.8A3 3 0 0 0 9 4Z" />
        <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a3 3 0 0 1-5 2.2V4.8A3 3 0 0 1 15 4Z" />
        <path d="M9 9h2" />
        <path d="M13 9h2" />
        <path d="M8 14h3" />
        <path d="M13 14h3" />
      </svg>
    );
  }

  if (name === "compass" || name === "spark") {
    return (
      <svg {...common}>
        <path d="M12 2v20" />
        <path d="M2 12h20" />
        <path d="m4.9 4.9 14.2 14.2" />
        <path d="m19.1 4.9-14.2 14.2" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
        <circle cx="12" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (name === "chart") {
    return (
      <svg {...common}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 16v-5" />
        <path d="M12 16V8" />
        <path d="M16 16v-9" />
      </svg>
    );
  }

  if (name === "book") {
    return (
      <svg {...common}>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z" />
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20" />
        <path d="M8 7h8" />
        <path d="M8 11h8" />
      </svg>
    );
  }

  if (name === "database") {
    return (
      <svg {...common}>
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
        <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    );
  }

  if (name === "rocket") {
    return (
      <svg {...common}>
        <path d="M13 3c4 1 7 4 8 8l-6 6c-2 0-4-2-4-4L5 19l2-6c-2 0-4-2-4-4l6-6Z" />
        <circle cx="15" cy="9" r="2" />
        <path d="M5 19c-1 1-2 1-3 1 0-1 0-2 1-3" />
      </svg>
    );
  }

  if (name === "shield") {
    return (
      <svg {...common}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-5" />
      </svg>
    );
  }

  if (name === "hotel") {
    return (
      <svg {...common}>
        <path d="M3 21V7a2 2 0 0 1 2-2h6v16" />
        <path d="M11 11h8a2 2 0 0 1 2 2v8" />
        <path d="M7 9h.01" />
        <path d="M7 13h.01" />
        <path d="M3 21h18" />
      </svg>
    );
  }

  if (name === "restaurant") {
    return (
      <svg {...common}>
        <path d="M4 3v8" />
        <path d="M8 3v8" />
        <path d="M4 7h4" />
        <path d="M6 11v10" />
        <path d="M17 3c2 2 3 5 3 8 0 2-1 4-3 4v6" />
      </svg>
    );
  }

  if (name === "map") {
    return (
      <svg {...common}>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
        <path d="M9 3v15" />
        <path d="M15 6v15" />
      </svg>
    );
  }

  if (name === "target" || name === "radar") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3" />
        <path d="M12 19v3" />
        <path d="M2 12h3" />
        <path d="M19 12h3" />
      </svg>
    );
  }

  if (name === "nodes" || name === "network" || name === "system") {
    return (
      <svg {...common}>
        <circle cx="6" cy="7" r="3" />
        <circle cx="18" cy="7" r="3" />
        <circle cx="12" cy="17" r="3" />
        <path d="M8.5 8.5 10.5 15" />
        <path d="M15.5 8.5 13.5 15" />
        <path d="M9 7h6" />
      </svg>
    );
  }

  if (name === "scatter") {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="7" r="2" />
        <circle cx="9" cy="18" r="2" />
        <circle cx="17" cy="16" r="2" />
        <path d="M8 7.5 16 15" />
        <path d="M16 8 10 17" />
      </svg>
    );
  }

  if (name === "bag") {
    return (
      <svg {...common}>
        <path d="M6 8h12l-1 13H7L6 8Z" />
        <path d="M9 8a3 3 0 0 1 6 0" />
      </svg>
    );
  }

  if (name === "hanger") {
    return (
      <svg {...common}>
        <path d="M12 6a2 2 0 1 0-2-2" />
        <path d="M12 6v3L4 17a2 2 0 0 0 1.4 3h13.2A2 2 0 0 0 20 17l-8-8" />
      </svg>
    );
  }

  if (name === "clinic") {
    return (
      <svg {...common}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
        <rect x="4" y="4" width="16" height="16" rx="4" />
      </svg>
    );
  }

  if (name === "cart") {
    return (
      <svg {...common}>
        <circle cx="9" cy="20" r="1" />
        <circle cx="17" cy="20" r="1" />
        <path d="M3 4h2l2.5 11h10L21 7H7" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

function accentClass(accent: string) {
  const map: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    cyan: "bg-cyan-50 text-cyan-600",
    orange: "bg-orange-50 text-orange-600",
    purple: "bg-purple-50 text-purple-600",
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-50 text-amber-600",
  };

  return map[accent] || "bg-cyan-50 text-cyan-600";
}

function accentBar(accent: string) {
  const map: Record<string, string> = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    violet: "bg-violet-500",
    cyan: "bg-cyan-500",
    orange: "bg-orange-500",
    purple: "bg-purple-500",
    slate: "bg-slate-500",
    amber: "bg-amber-500",
  };

  return map[accent] || "bg-cyan-500";
}