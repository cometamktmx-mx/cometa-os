import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

const CTA_LINK =
  "mailto:cometa.mktmx@gmail.com?subject=Quiero%20una%20demo%20de%20Cometa%20OS";

const ecosystemAgents = [
  {
    icon: "🤖",
    title: "SALES AI",
    subtitle: "Agente autónomo de ventas",
    text: "Responde, califica, da seguimiento y convierte conversaciones de WhatsApp en oportunidades reales.",
    status: "Activo",
  },
  {
    icon: "📊",
    title: "POS Intelligence",
    subtitle: "Inventario, ventas y rotación",
    text: "Detecta oportunidades desde ventas, productos, inventario, rotación y comportamiento de compra.",
    status: "Activo",
  },
  {
    icon: "🛎️",
    title: "Hospitality AI",
    subtitle: "Hoteles, revenue y experiencia",
    text: "Optimiza ocupación, servicio, experiencia del huésped y oportunidades comerciales.",
    status: "Activo",
  },
  {
    icon: "🍽️",
    title: "Restaurant AI",
    subtitle: "Tickets, recurrencia y lealtad",
    text: "Ayuda a aumentar ticket promedio, frecuencia de visita y campañas inteligentes.",
    status: "Activo",
  },
  {
    icon: "✦",
    title: "ORION",
    subtitle: "Diagnóstico de marca",
    text: "Analiza presencia digital, mercado, competencia y oportunidades comerciales.",
    status: "Activo",
  },
  {
    icon: "📍",
    title: "NOVA",
    subtitle: "Mapa comercial",
    text: "Define cliente ideal, oferta, objeciones, diferenciadores y proceso de venta.",
    status: "Activo",
  },
  {
    icon: "📈",
    title: "ATLAS",
    subtitle: "Estrategia de crecimiento",
    text: "Convierte datos en hipótesis, estrategia, prioridades y acciones comerciales.",
    status: "Activo",
  },
  {
    icon: "⚡",
    title: "MERCURY",
    subtitle: "Ejecución de contenido",
    text: "Planifica, produce y organiza contenido alineado a estrategia comercial.",
    status: "Activo",
  },
  {
    icon: "🧠",
    title: "COSMOS MEMORY",
    subtitle: "Memoria del negocio",
    text: "Centraliza datos, aprendizaje, historial y contexto para decisiones cada vez mejores.",
    status: "Activo",
  },
];

const salesAiCapabilities = [
  {
    icon: "💬",
    title: "Responde con criterio",
    text: "Puede contestar de forma autónoma cuando el negocio ya tiene reglas, contexto y respuestas seguras.",
  },
  {
    icon: "👤",
    title: "Califica leads",
    text: "Detecta intención, presupuesto, objeciones, urgencia y probabilidad real de compra.",
  },
  {
    icon: "🔁",
    title: "Da seguimiento",
    text: "Recuerda prospectos, sugiere próximos pasos y evita que las oportunidades se enfríen.",
  },
  {
    icon: "🎧",
    title: "Escala a humano",
    text: "Pasa la conversación al equipo cuando hay pagos, quejas, pedidos sensibles o dudas críticas.",
  },
];

const completeAgents = [
  {
    icon: "✦",
    title: "ORION",
    subtitle: "Diagnóstico de marca",
    text: "Analiza presencia digital, mercado, competencia y señales para entender dónde estás y hacia dónde ir.",
  },
  {
    icon: "📍",
    title: "NOVA",
    subtitle: "Mapa comercial",
    text: "Identifica cliente ideal, oferta, objeciones, diferenciadores y reglas de venta que generan resultados.",
  },
  {
    icon: "📈",
    title: "ATLAS",
    subtitle: "Estrategia de crecimiento",
    text: "Convierte datos en estrategia: metas, embudos, campañas y plan de acción por canal.",
  },
  {
    icon: "🤖",
    title: "SALES AI",
    subtitle: "Agente autónomo de ventas por WhatsApp",
    text: "Atiende, califica, responde, da seguimiento y convierte con IA autónoma supervisada.",
  },
  {
    icon: "📊",
    title: "POS Intelligence",
    subtitle: "Inventario, rotación y oportunidades",
    text: "Detecta oportunidades desde ventas, inventario, rotación, margen y comportamiento de compra.",
  },
  {
    icon: "🛎️",
    title: "Hospitality AI",
    subtitle: "Hoteles, revenue y experiencia",
    text: "Optimiza ocupación, pricing, upsells, atención y experiencia del huésped con IA.",
  },
  {
    icon: "🍽️",
    title: "Restaurant AI",
    subtitle: "Tickets, recurrencia y lealtad",
    text: "Aumenta ticket promedio, frecuencia de visita y lealtad con campañas inteligentes.",
  },
  {
    icon: "⚡",
    title: "MERCURY",
    subtitle: "Ejecución de contenido",
    text: "Planifica, produce y organiza contenido alineado a estrategia comercial.",
  },
  {
    icon: "🧠",
    title: "COSMOS MEMORY",
    subtitle: "Memoria del negocio",
    text: "Memoria central que unifica datos, conversaciones, resultados y aprendizajes.",
  },
];

const workflowSteps = [
  {
    number: "1",
    icon: "🔍",
    title: "Diagnóstico",
    text: "ORION analiza negocio, mercado, marca y señales clave.",
  },
  {
    number: "2",
    icon: "📍",
    title: "Estrategia",
    text: "NOVA y ATLAS definen mapa comercial y estrategia.",
  },
  {
    number: "3",
    icon: "🤖",
    title: "Ejecución",
    text: "Agentes como SALES AI y MERCURY ejecutan.",
  },
  {
    number: "4",
    icon: "🗄️",
    title: "Operación",
    text: "POS Intelligence y verticales optimizan la operación.",
  },
  {
    number: "5",
    icon: "🧠",
    title: "Aprendizaje",
    text: "COSMOS MEMORY aprende de cada interacción y venta.",
  },
  {
    number: "6",
    icon: "🚀",
    title: "Mejora continua",
    text: "El sistema se adapta, mejora y escala contigo.",
  },
];

const industries = [
  {
    icon: "🛍️",
    title: "Retail",
    text: "Aumenta ventas, rotación y lealtad en tiendas físicas y e-commerce.",
  },
  {
    icon: "👕",
    title: "Moda",
    text: "Mejora conversión, recompra y experiencia omnicanal por temporada.",
  },
  {
    icon: "🛎️",
    title: "Hoteles",
    text: "Maximiza ocupación, revenue y experiencia del huésped con IA.",
  },
  {
    icon: "🍽️",
    title: "Restaurantes",
    text: "Aumenta ticket promedio, frecuencia de visita y lealtad de clientes.",
  },
  {
    icon: "➕",
    title: "Clínicas",
    text: "Mejora agenda, seguimiento de pacientes y comunicación automática.",
  },
  {
    icon: "🛒",
    title: "Supermercados",
    text: "Optimiza inventario, ofertas y comportamiento de compra.",
  },
];

const trustItems = [
  {
    icon: "⏱️",
    title: "Agentes siempre activos",
    text: "Tu negocio puede atender, aprender y detectar oportunidades todos los días.",
  },
  {
    icon: "🟢",
    title: "Ventas por WhatsApp",
    text: "El canal que más usan tus clientes, potenciado con IA y criterio comercial.",
  },
  {
    icon: "🗄️",
    title: "Datos + operación",
    text: "Marketing, ventas, inventario y decisiones conectadas en un solo sistema.",
  },
  {
    icon: "✦",
    title: "Cometa MKT contigo",
    text: "No vendemos una app suelta: implementamos, entrenamos y operamos el sistema.",
  },
];

const proofCards = [
  {
    title: "Implementamos",
    text: "Configuramos el sistema con tu negocio, tus reglas, tus ofertas y tus procesos.",
  },
  {
    title: "Entrenamos",
    text: "Convertimos conocimiento comercial real en contexto útil para los agentes.",
  },
  {
    title: "Supervisamos",
    text: "Cometa MKT acompaña la operación para que la IA no trabaje a ciegas.",
  },
  {
    title: "Mejoramos",
    text: "Usamos datos, conversaciones y resultados para optimizar continuamente.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#eef6fa] text-slate-950">
      <Navbar />
      <Hero />
      <TrustStrip />
      <HumanOperatingLayer />
      <SalesAiAgentSection />
      <CompleteEcosystem />
      <WorkflowSection />
      <IndustriesSection />
      <CometaProof />
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
          <CometaLogo />
          <div className="hidden items-center gap-3 text-sm font-black uppercase tracking-[0.16em] text-white sm:flex">
            <span>Cometa</span>
            <span className="text-slate-500">|</span>
            <span>MKT</span>
            <span className="text-slate-500">|</span>
            <span className="text-cyan-300">Cometa OS</span>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 text-xs font-black text-slate-300 lg:flex">
          <a href="#ecosistema" className="transition hover:text-cyan-300">
            Ecosistema
          </a>
          <a href="#sales-ai" className="transition hover:text-cyan-300">
            Agentes de IA
          </a>
          <a href="#soluciones" className="transition hover:text-cyan-300">
            Soluciones
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
            href={CTA_LINK}
            className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:bg-cyan-200"
          >
            Solicitar demo →
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#06101f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(34,211,238,0.2),transparent_32%),radial-gradient(circle_at_10%_8%,rgba(59,130,246,0.2),transparent_34%),linear-gradient(135deg,#06101f_0%,#071426_55%,#073142_100%)]" />
      <div className="absolute bottom-[-220px] right-[-100px] h-[520px] w-[1200px] rotate-[-8deg] rounded-[100%] border border-cyan-300/20 bg-cyan-400/5" />

      <div className="relative mx-auto grid min-h-[760px] w-full max-w-[1500px] items-center gap-10 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_760px] lg:px-8">
        <div className="max-w-3xl">
          <div className="mb-7 flex flex-wrap gap-3">
            <Badge>Cometa MKT presenta</Badge>
            <Badge>Agencia + sistema operativo</Badge>
          </div>

          <h1 className="text-[42px] font-black leading-[0.96] tracking-[-0.07em] md:text-[64px] xl:text-[82px]">
            Convierte tu negocio en un sistema operativo{" "}
            <span className="text-cyan-300">inteligente.</span>
          </h1>

          <p className="mt-7 max-w-2xl text-base font-semibold leading-8 text-cyan-50 md:text-lg">
            Cometa OS es la tecnología que Cometa MKT implementa, entrena y
            opera contigo para conectar marketing, ventas, datos y operaciones
            en un solo sistema de crecimiento.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href={CTA_LINK}
              className="flex h-14 items-center justify-center rounded-2xl bg-cyan-300 px-7 text-sm font-black text-slate-950 shadow-xl shadow-cyan-400/20 transition hover:-translate-y-0.5 hover:bg-cyan-200"
            >
              Solicitar demo <span className="ml-3">→</span>
            </a>

            <a
              href="#ecosistema"
              className="flex h-14 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-7 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              Ver ecosistema <span className="ml-3">▷</span>
            </a>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              "Tecnología propia creada por Cometa MKT.",
              "Agentes de IA conectados a tu negocio.",
              "Acompañamiento humano, no solo software.",
              "Marketing, ventas y operación trabajando juntos.",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-300">
                  ✓
                </span>
                <p className="text-sm font-semibold text-slate-300">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <EcosystemPreview />
      </div>
    </section>
  );
}

function EcosystemPreview() {
  return (
    <section className="relative hidden lg:block">
      <div className="absolute -left-10 top-10 h-[420px] w-[420px] rounded-full bg-cyan-400/10 blur-[110px]" />

      <div className="relative rounded-[34px] border border-cyan-300/20 bg-[#08172b]/90 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur">
        <div className="rounded-[28px] border border-white/10 bg-[#0b1c33] p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">
              Ecosistema Cometa OS
            </p>

            <span className="rounded-full bg-emerald-400/10 px-3 py-2 text-[10px] font-black uppercase text-emerald-300">
              ● Sistema activo
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {ecosystemAgents.slice(0, 8).map((agent) => (
              <div
                key={agent.title}
                className="min-h-[145px] rounded-2xl border border-white/10 bg-white/5 p-4 text-center"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/10 text-2xl">
                  {agent.icon}
                </div>
                <p className="mt-3 text-sm font-black text-white">
                  {agent.title}
                </p>
                <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-400">
                  {agent.subtitle}
                </p>
                <p className="mt-2 text-[10px] font-black text-emerald-300">
                  ● {agent.status}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-center">
            <PreviewMetric label="Datos unificados" value="Activos" />
            <PreviewMetric label="Conversaciones" value="2.4M" />
            <PreviewMetric label="Oportunidades" value="380K" />
            <PreviewMetric label="Uptime" value="98%" />
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-white/10 p-4 last:border-r-0">
      <p className="text-lg font-black text-cyan-300">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">
        {label}
      </p>
    </div>
  );
}

function TrustStrip() {
  return (
    <section className="border-b border-cyan-900/10 bg-[#071426] text-white">
      <div className="mx-auto grid w-full max-w-[1500px] gap-4 px-5 py-7 md:grid-cols-4 lg:px-8">
        {trustItems.map((item) => (
          <div
            key={item.title}
            className="rounded-[24px] border border-cyan-300/15 bg-white/5 p-5"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10 text-2xl">
                {item.icon}
              </div>

              <div>
                <p className="text-sm font-black text-white">{item.title}</p>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">
                  {item.text}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HumanOperatingLayer() {
  return (
    <section className="mx-auto w-full max-w-[1500px] px-5 py-14 lg:px-8">
      <div className="grid gap-6 rounded-[34px] border border-white bg-white p-7 shadow-[0_24px_90px_rgba(15,23,42,0.06)] md:p-10 lg:grid-cols-[minmax(0,1fr)_560px] lg:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
            Cometa MKT + Cometa OS
          </p>

          <h2 className="mt-4 text-4xl font-black leading-[0.98] tracking-[-0.07em] md:text-5xl">
            No te damos una plataforma y te dejamos solo.
          </h2>

          <p className="mt-6 max-w-3xl text-base font-semibold leading-8 text-slate-600">
            Cometa OS funciona junto con Cometa MKT. Nosotros ayudamos a
            diagnosticar, configurar, entrenar, supervisar y mejorar el sistema
            para que la tecnología tenga contexto real del negocio.
          </p>
        </div>

        <div className="rounded-[28px] bg-slate-950 p-6 text-white">
          <p className="text-sm font-black text-cyan-300">
            La diferencia está en la operación:
          </p>

          <div className="mt-5 grid gap-3">
            {[
              "La estrategia la diseña Cometa MKT.",
              "Los agentes ejecutan con datos y reglas del negocio.",
              "El cliente ve, entiende y controla su operación.",
              "El sistema aprende con cada conversación y resultado.",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-300">
                  ✓
                </span>
                <p className="text-sm font-semibold text-slate-300">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SalesAiAgentSection() {
  return (
    <section
      id="sales-ai"
      className="border-y border-cyan-900/10 bg-[#06101f] px-5 py-14 text-white lg:px-8"
    >
      <div className="mx-auto grid w-full max-w-[1500px] gap-8 rounded-[32px] border border-cyan-300/15 bg-white/5 p-7 md:p-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.7fr)]">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Agentes de IA para crecer, vender y operar
          </p>

          <h2 className="mt-4 text-4xl font-black leading-[0.98] tracking-[-0.07em] md:text-5xl">
            No es un bot. Es un{" "}
            <span className="text-cyan-300">agente de IA comercial.</span>
          </h2>

          <p className="mt-6 max-w-xl text-base font-semibold leading-8 text-slate-300">
            SALES AI no responde como plantilla. Entiende intención, etapa,
            objeciones, reglas comerciales y contexto del negocio para ayudar a
            vender mejor por WhatsApp.
          </p>

          <a
            href={CTA_LINK}
            className="mt-8 inline-flex h-14 items-center justify-center rounded-2xl border border-cyan-300/40 bg-cyan-300/10 px-6 text-sm font-black text-cyan-200 transition hover:bg-cyan-300 hover:text-slate-950"
          >
            Conocer SALES AI →
          </a>
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {salesAiCapabilities.map((item) => (
            <DarkFeatureCard key={item.title} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DarkFeatureCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <article className="min-w-0 rounded-[26px] border border-white/10 bg-white/5 p-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-300/10 text-2xl">
        {icon}
      </div>

      <h3 className="mt-6 break-words text-[22px] font-black leading-[1.08] tracking-[-0.045em] text-white">
        {title}
      </h3>

      <p className="mt-4 break-words text-xs font-semibold leading-6 text-slate-400">
        {text}
      </p>
    </article>
  );
}

function CompleteEcosystem() {
  return (
    <section
      id="ecosistema"
      className="mx-auto grid w-full max-w-[1500px] gap-10 px-5 py-16 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8"
    >
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
          Ecosistema completo
        </p>

        <h2 className="mt-4 text-4xl font-black leading-[0.98] tracking-[-0.07em] md:text-5xl">
          Un sistema. Nueve agentes. Un mismo objetivo:{" "}
          <span className="text-cyan-600">hacer crecer tu negocio.</span>
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {completeAgents.map((agent) => (
          <AgentCard key={agent.title} {...agent} />
        ))}
      </div>
    </section>
  );
}

function AgentCard({
  icon,
  title,
  subtitle,
  text,
}: {
  icon: string;
  title: string;
  subtitle: string;
  text: string;
}) {
  return (
    <article className="rounded-[26px] border border-white bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-2xl">
          {icon}
        </div>

        <div>
          <h3 className="text-xl font-black tracking-[-0.045em]">{title}</h3>
          <p className="mt-1 text-sm font-black text-slate-500">{subtitle}</p>
        </div>
      </div>

      <p className="mt-5 text-sm font-semibold leading-6 text-slate-600">
        {text}
      </p>
    </article>
  );
}

function WorkflowSection() {
  return (
    <section className="mx-auto w-full max-w-[1500px] px-5 py-8 lg:px-8">
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
          Cómo funciona Cometa OS
        </p>

        <h2 className="mt-4 text-4xl font-black tracking-[-0.06em]">
          Un ciclo inteligente que impulsa resultados.
        </h2>
      </div>

      <div className="mt-9 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {workflowSteps.map((step) => (
          <article
            key={step.number}
            className="rounded-[26px] border border-slate-200 bg-white p-6 text-center shadow-[0_14px_50px_rgba(15,23,42,0.04)]"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-2xl">
              {step.icon}
            </div>

            <p className="mt-5 text-xs font-black uppercase tracking-[0.12em] text-cyan-700">
              {step.number}. {step.title}
            </p>

            <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">
              {step.text}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function IndustriesSection() {
  return (
    <section
      id="industrias"
      className="mx-auto w-full max-w-[1500px] px-5 py-14 lg:px-8"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
        Hecho para tu industria
      </p>

      <h2 className="mt-4 text-4xl font-black tracking-[-0.06em]">
        Soluciones inteligentes para cada industria.
      </h2>

      <div className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {industries.map((industry) => (
          <article
            key={industry.title}
            className="rounded-[24px] border border-white bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.05)]"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-2xl">
              {industry.icon}
            </div>

            <h3 className="text-lg font-black tracking-[-0.045em]">
              {industry.title}
            </h3>

            <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">
              {industry.text}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CometaProof() {
  return (
    <section className="mx-auto w-full max-w-[1500px] px-5 py-10 lg:px-8">
      <div className="rounded-[34px] bg-[#06101f] p-8 text-white shadow-[0_30px_100px_rgba(15,23,42,0.22)] md:p-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
              Creado y operado por Cometa MKT
            </p>

            <h2 className="mt-4 text-4xl font-black leading-[0.98] tracking-[-0.07em] md:text-5xl">
              Tecnología con estrategia humana detrás.
            </h2>
          </div>

          <p className="text-base font-semibold leading-8 text-slate-300">
            Cometa OS no nace para reemplazar a la agencia. Nace para hacer que
            Cometa MKT pueda operar mejor, medir mejor y vender mejor junto con
            cada negocio. La IA ejecuta, pero la estrategia, el criterio y la
            mejora continua se trabajan contigo.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {proofCards.map((card) => (
            <ProofCard key={card.title} {...card} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProofCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm font-black text-white">{title}</p>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">
        {text}
      </p>
    </div>
  );
}

function FinalCTA() {
  return (
    <section
      id="demo"
      className="mx-auto w-full max-w-[1500px] px-5 pb-10 pt-4 lg:px-8"
    >
      <div className="rounded-[28px] bg-[#06101f] p-7 text-white md:p-9">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <h2 className="text-3xl font-black leading-tight tracking-[-0.06em]">
              ¿Listo para operar con inteligencia y crecer con más control?
            </h2>

            <p className="mt-4 text-sm font-semibold leading-6 text-slate-400">
              Agenda una demo y descubre cómo Cometa MKT + Cometa OS pueden
              transformar tu negocio en un sistema inteligente que vende, opera
              y aprende.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <a
              href={CTA_LINK}
              className="flex h-14 items-center justify-center rounded-2xl bg-cyan-300 px-7 text-sm font-black text-slate-950 transition hover:bg-cyan-200"
            >
              Solicitar demo →
            </a>

            <a
              href="#ecosistema"
              className="flex h-14 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-7 text-sm font-black text-white transition hover:bg-white/10"
            >
              Ver ecosistema ▷
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#06101f] text-white">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 border-t border-white/10 px-5 py-6 text-xs font-semibold text-slate-500 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <CometaLogo small />
          <p>
            <span className="text-white">Cometa</span>{" "}
            <span className="text-slate-500">MKT</span>{" "}
            <span className="text-cyan-300">| Cometa OS</span>
          </p>
        </div>

        <p>© 2026 Cometa MKT · Cometa OS. Todos los derechos reservados.</p>

        <p>Privacidad · Términos · Seguridad</p>
      </div>
    </footer>
  );
}

function CometaLogo({ small }: { small?: boolean }) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-xl shadow-cyan-400/10 ${
        small ? "h-9 w-9" : "h-12 w-12"
      }`}
    >
      <Image
        src="/logo.png"
        alt="Cometa MKT"
        width={small ? 36 : 48}
        height={small ? 36 : 48}
        className="h-full w-full object-contain p-1"
        priority
      />
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">
      {children}
    </span>
  );
}