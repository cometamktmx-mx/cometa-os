import Link from "next/link";
import AnalyzeBrandForm from "../AnalyzeBrandForm";

type NavItem = {
  code: string;
  label: string;
  description: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
};

const navItems: NavItem[] = [
  {
    code: "MC",
    label: "Mission Control",
    description: "Sistema operativo",
    href: "/cometa-os/design?brandSlug=cometa-mkt",
  },
  {
    code: "OR",
    label: "ORION",
    description: "Brand Intelligence",
    href: "/new-analysis",
    active: true,
  },
  {
    code: "NV",
    label: "NOVA",
    description: "Business Map",
    href: "/nova",
  },
  {
    code: "SA",
    label: "Sales AI",
    description: "Ventas inteligentes",
    href: "/sales-ai/inbox?brandSlug=cometa-mkt",
  },
  {
    code: "KB",
    label: "Knowledge",
    description: "Base comercial",
    href: "/sales-ai/knowledge?brandSlug=cometa-mkt",
  },
  {
    code: "LR",
    label: "Learning",
    description: "Mejora continua",
    href: "/sales-ai/learning?brandSlug=cometa-mkt",
  },
  {
    code: "WS",
    label: "Workspace",
    description: "Marcas y operación",
    href: "/workspace",
  },
];

const intelligenceCards = [
  {
    code: "01",
    title: "Presencia digital",
    description:
      "ORION analiza redes sociales, sitio web, señales visuales, consistencia y percepción general de la marca.",
  },
  {
    code: "02",
    title: "Oportunidad comercial",
    description:
      "Detecta potencial de crecimiento, claridad de oferta, señales de venta y oportunidades de conversión.",
  },
  {
    code: "03",
    title: "Confianza y autoridad",
    description:
      "Evalúa elementos que ayudan o frenan la decisión de compra: prueba social, comunicación y posicionamiento.",
  },
  {
    code: "04",
    title: "Ruta estratégica",
    description:
      "Define si la marca está lista para avanzar a NOVA, Sales AI o una propuesta comercial más profunda.",
  },
];

const outputCards = [
  {
    label: "Brand Score",
    value: "0-100",
    description: "Nivel general de madurez digital y comercial.",
  },
  {
    label: "Opportunity Level",
    value: "Bajo / Medio / Alto",
    description: "Potencial detectado para crecimiento y captación.",
  },
  {
    label: "Strategic Fit",
    value: "ORION / NOVA / Sales AI",
    description: "Siguiente capa recomendada dentro de Cometa OS.",
  },
];

export default function NewAnalysisPage() {
  return (
    <main className="min-h-screen bg-[#eef6fa] text-slate-950">
      <section className="mx-auto grid min-h-screen w-full max-w-[1800px] grid-cols-1 gap-4 p-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <OrionDock />

        <section className="flex min-w-0 flex-col gap-4">
          <TopBar />

          <Hero />

          <IntelligenceCards />

          <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_430px]">
            <div className="min-w-0 rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
              <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-700">
                    ORION · Brand Intelligence
                  </p>

                  <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950 md:text-4xl">
                    Nuevo diagnóstico estratégico
                  </h2>

                  <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-500 md:text-base">
                    Ingresa la información base de la marca para que ORION
                    analice su presencia digital, oportunidad comercial,
                    confianza, posicionamiento y posibles rutas de crecimiento.
                  </p>
                </div>

                <span className="w-fit rounded-full border border-cyan-200 bg-cyan-50 px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-700">
                  Intelligence Mode
                </span>
              </div>

              <AnalyzeBrandForm />
            </div>

            <aside className="flex min-w-0 flex-col gap-4">
              <DiagnosticOutput />
              <StrategicPath />
              <CometaPrinciple />
            </aside>
          </section>

          <MethodologySection />
        </section>
      </section>
    </main>
  );
}

function OrionDock() {
  return (
    <aside className="hidden rounded-[34px] border border-white bg-slate-950 p-3 text-white shadow-[0_24px_80px_rgba(15,23,42,0.14)] xl:flex xl:flex-col">
      <div className="flex items-center gap-3 rounded-[26px] border border-white/10 bg-white/5 px-3 py-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-cyan-400/10 shadow-xl shadow-cyan-400/20">
          <div className="absolute h-7 w-7 rounded-full bg-cyan-400 blur-[7px]" />
          <div className="relative h-7 w-7 rounded-full bg-gradient-to-br from-cyan-300 via-emerald-400 to-slate-950" />
        </div>

        <div className="min-w-0">
          <p className="text-lg font-black leading-none tracking-[-0.06em]">
            COMETA
          </p>
          <p className="text-lg font-black leading-none tracking-[-0.06em] text-cyan-300">
            OS
          </p>
        </div>
      </div>

      <nav className="mt-7 flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const content = (
            <>
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[11px] font-black ${
                  item.active
                    ? "bg-cyan-300 text-slate-950 shadow-[0_0_22px_rgba(34,211,238,0.45)]"
                    : "bg-white/5 text-slate-300"
                }`}
              >
                {item.code}
              </span>

              <span className="min-w-0">
                <span className="block truncate text-sm font-black">
                  {item.label}
                </span>
                <span
                  className={`block truncate text-xs font-semibold ${
                    item.active ? "text-cyan-200" : "text-slate-500"
                  }`}
                >
                  {item.description}
                </span>
              </span>
            </>
          );

          const className = `flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
            item.active
              ? "border border-cyan-300/40 bg-cyan-300/10 text-white"
              : item.disabled
              ? "cursor-not-allowed text-slate-500"
              : "text-slate-300 hover:bg-white/5 hover:text-white"
          }`;

          if (item.disabled) {
            return (
              <button key={item.code} disabled className={className}>
                {content}
              </button>
            );
          }

          return (
            <Link key={item.code} href={item.href} className={className}>
              {content}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-[28px] border border-cyan-300/15 bg-cyan-300/10 p-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-slate-950 text-3xl shadow-lg shadow-cyan-400/10">
          ✦
        </div>

        <p className="mt-4 text-lg font-black tracking-[-0.04em]">
          ORION Intelligence
        </p>

        <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">
          Diagnóstico digital y comercial para detectar oportunidades de
          crecimiento con IA.
        </p>
      </div>
    </aside>
  );
}

function TopBar() {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <Link
          href="/workspace"
          className="text-sm font-black text-cyan-700 transition hover:text-slate-950"
        >
          ← Volver al Workspace
        </Link>

        <p className="mt-1 text-xs font-bold text-slate-400">
          Cometa OS / ORION Brand Intelligence
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/workspace"
          className="flex h-11 items-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Workspace
        </Link>

        <Link
          href="/cometa-os/design?brandSlug=cometa-mkt"
          className="flex h-11 items-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:bg-cyan-700"
        >
          Mission Control
        </Link>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <header className="relative overflow-hidden rounded-[38px] bg-slate-950 p-7 text-white shadow-[0_30px_100px_rgba(15,23,42,0.20)] md:p-8">
      <div className="absolute right-[-120px] top-[-120px] h-80 w-80 rounded-full bg-cyan-400/25 blur-[90px]" />
      <div className="absolute bottom-[-160px] left-[25%] h-72 w-72 rounded-full bg-emerald-400/15 blur-[95px]" />

      <div className="relative z-10 grid gap-8 2xl:grid-cols-[minmax(0,1fr)_420px] 2xl:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white">
              ORION
            </span>

            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
              Brand Intelligence
            </span>

            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
              Cometa OS
            </span>
          </div>

          <h1 className="mt-8 max-w-5xl text-5xl font-black leading-[0.92] tracking-[-0.085em] md:text-6xl 2xl:text-[76px]">
            ORION
            <br />
            Brand Intelligence
          </h1>

          <p className="mt-6 max-w-4xl text-[17px] font-semibold leading-8 text-slate-300">
            Diagnóstico inteligente para evaluar presencia digital, claridad
            comercial, confianza, oportunidad de crecimiento y rutas de acción
            para una marca.
          </p>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
            Output del diagnóstico
          </p>

          <div className="mt-5 grid gap-3">
            <HeroOutput label="Brand Score" value="0-100" />
            <HeroOutput label="Opportunity Level" value="Bajo / Medio / Alto" />
            <HeroOutput label="Next Strategic Step" value="NOVA / Sales AI" />
          </div>
        </div>
      </div>
    </header>
  );
}

function HeroOutput({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function IntelligenceCards() {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {intelligenceCards.map((item) => (
        <article
          key={item.code}
          className="min-w-0 rounded-[28px] border border-white bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-xs font-black text-cyan-700">
            {item.code}
          </div>

          <h3 className="mt-5 text-2xl font-black tracking-[-0.055em] text-slate-950">
            {item.title}
          </h3>

          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
            {item.description}
          </p>
        </article>
      ))}
    </section>
  );
}

function DiagnosticOutput() {
  return (
    <section className="rounded-[38px] bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">
        Resultado del análisis
      </p>

      <div className="mt-6 flex items-center justify-between gap-5">
        <div>
          <p className="text-[52px] font-black leading-none tracking-[-0.09em]">
            AI
          </p>

          <p className="mt-2 text-sm font-bold text-slate-400">
            Diagnóstico estratégico
          </p>
        </div>

        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[conic-gradient(#22d3ee_260deg,rgba(255,255,255,0.12)_0deg)]">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 ring-8 ring-cyan-400/10">
            <p className="text-2xl font-black">OS</p>
          </div>
        </div>
      </div>

      <div className="mt-7 grid gap-3">
        {outputCards.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              {item.label}
            </p>
            <p className="mt-1 text-sm font-black text-white">{item.value}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StrategicPath() {
  return (
    <section className="rounded-[34px] border border-white bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
          Ruta estratégica
        </p>

        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">
          Sistema
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        <PathItem
          number="01"
          title="ORION"
          description="Diagnóstico digital y comercial."
        />
        <PathItem
          number="02"
          title="NOVA"
          description="Mapa de negocio, buyer persona y oportunidades."
        />
        <PathItem
          number="03"
          title="Sales AI"
          description="Automatización comercial y seguimiento."
        />
      </div>
    </section>
  );
}

function PathItem({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-black text-white">
        {number}
      </div>

      <div>
        <p className="text-sm font-black text-slate-950">{title}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

function CometaPrinciple() {
  return (
    <section className="rounded-[34px] border border-cyan-100 bg-cyan-50 p-5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
        Principio Cometa
      </p>

      <p className="mt-3 text-sm font-black leading-6 text-slate-950">
        El diagnóstico no es el final. Es el punto de partida.
      </p>

      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
        ORION detecta señales. NOVA estructura la estrategia. Sales AI convierte
        oportunidades en conversaciones comerciales.
      </p>
    </section>
  );
}

function MethodologySection() {
  return (
    <section className="rounded-[38px] border border-white bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Metodología ORION
          </p>

          <h2 className="mt-1 text-3xl font-black tracking-[-0.055em] text-slate-950">
            Inteligencia para tomar mejores decisiones
          </h2>
        </div>

        <span className="w-fit rounded-full border border-cyan-200 bg-cyan-50 px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-700">
          Cometa Growth System
        </span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <MethodCard
          title="Diagnóstico"
          description="Evalúa señales visibles de marca, presencia digital, claridad de comunicación y oportunidades."
        />
        <MethodCard
          title="Priorización"
          description="Ordena hallazgos por impacto comercial, urgencia y potencial de crecimiento."
        />
        <MethodCard
          title="Activación"
          description="Define si la marca debe avanzar a estrategia, automatización comercial o seguimiento."
        />
      </div>
    </section>
  );
}

function MethodCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-[30px] border border-slate-200 bg-slate-50/70 p-6">
      <h3 className="text-2xl font-black tracking-[-0.055em] text-slate-950">
        {title}
      </h3>

      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
        {description}
      </p>
    </article>
  );
}