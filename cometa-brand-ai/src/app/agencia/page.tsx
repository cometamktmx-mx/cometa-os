import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Cometa MKT | Marketing conectado con ventas y Cometa OS",
  description:
    "Agencia de marketing, contenido, campañas y sistemas comerciales conectados con Cometa OS para generar crecimiento medible.",
};

const WHATSAPP_CTA =
  "https://wa.me/5214424709983?text=Hola%20Cometa%2C%20quiero%20solicitar%20un%20diagn%C3%B3stico%20para%20mi%20marca.";

const trustedBrands = [
  {
    name: "Magenta",
    subtitle: "Fitwear",
    logo: null,
  },
  {
    name: "LR",
    subtitle: "Premium",
    logo: null,
  },
  {
    name: "Plaza Textil",
    subtitle: "Metropolitana",
    logo: null,
  },
  {
    name: "Nash",
    subtitle: "Mood",
    logo: null,
  },
  {
    name: "Smile",
    subtitle: "Center",
    logo: null,
  },
  {
    name: "Nahuitech",
    subtitle: "Industria",
    logo: null,
  },
];

const results = [
  {
    value: "2.4 M",
    label: "Visualizaciones",
    helper: "Alcance acumulado en un proyecto seleccionado.",
    icon: "eye",
  },
  {
    value: "238 mil",
    label: "Espectadores",
    helper: "Personas alcanzadas mediante contenido y activaciones.",
    icon: "users",
  },
  {
    value: "25 mil",
    label: "Interacciones",
    helper: "Acciones reales de la comunidad con la marca.",
    icon: "heart",
  },
  {
    value: "+10 mil",
    label: "Seguidores",
    helper: "Crecimiento acumulado en una estrategia de comunidad.",
    icon: "growth",
  },
];

const pillars = [
  {
    number: "01",
    title: "Estrategia antes que publicaciones",
    description:
      "Entendemos el negocio, el mercado, el cliente y la oportunidad antes de producir una sola pieza.",
    icon: "target",
  },
  {
    number: "02",
    title: "Marketing conectado con ventas",
    description:
      "Contenido, pauta, WhatsApp y seguimiento trabajan como un solo sistema comercial.",
    icon: "chart",
  },
  {
    number: "03",
    title: "Tecnología propia para crecer",
    description:
      "Cometa OS conecta información, ejecución y ventas para convertir datos en acciones.",
    icon: "spark",
  },
];

type AgencyCase = {
  eyebrow: string;
  title: string;
  challenge: string;
  action: string;
  impactTitle: string;
  impact: string;

  highlights: Array<{
    value: string;
    label: string;
  }>;

  tags: string[];
  accent: "cyan" | "blue" | "violet";
};

const cases: AgencyCase[] = [
  {
    eyebrow: "Magenta Fitwear",

    title:
      "Contenido, comunidad, pauta y ventas conectadas por WhatsApp",

    challenge:
      "Magenta necesitaba fortalecer su presencia digital, mantener una comunicación constante y transformar la atención generada por contenido y campañas en conversaciones comerciales.",

    action:
      "Cometa diseñó una operación continua de contenido, campañas con destino a WhatsApp, análisis de productos y optimización comercial para sostener la captación de prospectos.",

    impactTitle: "Impacto comercial",

    impact:
      "Una marca con mayor presencia digital, campañas activas y un canal constante de conversaciones orientadas a venta.",

    highlights: [
      {
        value: "WhatsApp",
        label: "Canal comercial",
      },
      {
        value: "Paid Media",
        label: "Captación activa",
      },
    ],

    tags: [
      "Contenido",
      "Paid Media",
      "Estrategia",
      "WhatsApp",
    ],

    accent: "cyan",
  },

  {
    eyebrow: "Plaza Textil Metropolitana",

    title:
      "Una comunidad digital convertida en movimiento real",

    challenge:
      "La plaza necesitaba fortalecer su relación con comerciantes, visitantes y comunidad, además de convertir su comunicación digital en participación y asistencia real.",

    action:
      "Cometa conectó contenido, cobertura, campañas, activaciones, eventos y herramientas digitales dentro de una estrategia continua de comunidad.",

    impactTitle: "Resultados comprobables",

    impact:
      "La estrategia impulsó crecimiento digital y activaciones presenciales que superaron los 120 asistentes.",

    highlights: [
      {
        value: "2.4 M",
        label: "Visualizaciones",
      },
      {
        value: "238 mil",
        label: "Espectadores",
      },
      {
        value: "25 mil",
        label: "Interacciones",
      },
      {
        value: "+10 mil",
        label: "Seguidores",
      },
    ],

    tags: [
      "Comunidad",
      "Contenido",
      "Activaciones",
      "Digitalización",
    ],

    accent: "blue",
  },

  {
    eyebrow: "Nahuitech",

    title:
      "Posicionamiento y generación de demanda para industria mexicana",

    challenge:
      "Nahuitech necesitaba comunicar de forma clara el valor de sus máquinas, diferenciarse de alternativas extranjeras y conectar con emprendedores y empresas con intención de compra.",

    action:
      "Cometa transformó información técnica en contenido comercial, posicionamiento B2B, comunicación especializada y mensajes orientados a resolver necesidades reales de producción.",

    impactTitle: "Impacto estratégico",

    impact:
      "Una oferta más clara, una presencia digital especializada y una comunicación preparada para atraer oportunidades comerciales de mayor calidad.",

    highlights: [
      {
        value: "B2B",
        label: "Posicionamiento",
      },
      {
        value: "Oferta clara",
        label: "Comunicación",
      },
      {
        value: "Demanda",
        label: "Prospección",
      },
    ],

    tags: [
      "Posicionamiento",
      "B2B",
      "Contenido",
      "Estrategia",
    ],

    accent: "violet",
  },
];

const agents = [
  {
    name: "ORION",
    action: "Diagnostica",
  },
  {
    name: "NOVA",
    action: "Entiende",
  },
  {
    name: "ATLAS",
    action: "Dirige",
  },
  {
    name: "MERCURY",
    action: "Ejecuta",
  },
  {
    name: "SALES AI",
    action: "Convierte",
  },
];

export default function AgenciaPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f9fc] text-[#071329]">
      <Header />

      <Hero />

      <TrustedBrands />

      <Results />

      <Difference />

      <Cases />

      <CometaOSBridge />

      <AboutUs />

      <FinalCTA />

      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0d1928]/95 text-white shadow-[0_14px_40px_rgba(2,8,23,0.18)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-[86px] max-w-[1500px] items-center justify-between gap-6 px-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/agencia"
            aria-label="Cometa MKT"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-white shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
          >
            <span className="text-[10px] font-black italic tracking-[-0.08em] text-[#0e4c85]">
              COMETA
            </span>
          </Link>

          <div className="flex min-w-0 items-center gap-3 text-sm font-black uppercase tracking-[0.22em] sm:text-lg lg:text-xl">
            <span className="truncate text-white">Cometa</span>
            <span className="text-slate-500">|</span>
            <span className="text-white">MKT</span>
            <span className="hidden text-slate-500 sm:inline">|</span>

            <Link
              href="/"
              className="hidden text-[#5be7ff] transition hover:text-white sm:inline"
            >
              Cometa OS
            </Link>
          </div>
        </div>

        <nav className="hidden items-center gap-7 text-xs font-black uppercase tracking-[0.13em] text-slate-300 xl:flex">
          <a href="#diferencia" className="transition hover:text-[#5be7ff]">
            Diferencia
          </a>

          <a href="#casos" className="transition hover:text-[#5be7ff]">
            Casos
          </a>

          <a href="#nosotros" className="transition hover:text-[#5be7ff]">
            Nosotros
          </a>

          <Link href="/" className="transition hover:text-[#5be7ff]">
            Cometa OS
          </Link>
        </nav>

        <a
          href={WHATSAPP_CTA}
          target="_blank"
          rel="noreferrer"
          className="hidden min-h-12 shrink-0 items-center justify-center rounded-2xl bg-[#15c8ef] px-5 text-xs font-black uppercase tracking-[0.12em] text-[#071329] shadow-[0_14px_35px_rgba(21,200,239,0.24)] transition hover:-translate-y-0.5 hover:bg-white lg:inline-flex"
        >
          Solicitar diagnóstico
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#071321] text-white">
      <div className="absolute inset-0">
        <div className="absolute left-[-160px] top-[-180px] h-[480px] w-[480px] rounded-full bg-[#0577ff]/20 blur-[130px]" />
        <div className="absolute right-[-100px] top-[40px] h-[500px] w-[500px] rounded-full bg-[#9d38ff]/15 blur-[150px]" />
        <div className="absolute bottom-[-260px] left-[30%] h-[520px] w-[520px] rounded-full bg-[#08cce9]/14 blur-[150px]" />
      </div>

      <div className="absolute bottom-[-180px] left-1/2 h-[360px] w-[1200px] -translate-x-1/2 rounded-[50%] border border-[#23caf4]/20 bg-[#0c6ac7]/10 shadow-[0_-40px_130px_rgba(16,168,255,0.18)]" />

      <div className="relative mx-auto grid max-w-[1500px] gap-10 px-5 pb-16 pt-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(500px,1.05fr)] lg:items-center lg:px-8 lg:pb-20 lg:pt-16">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#20c5e8]/25 bg-[#16c8e8]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#5be7ff]">
            <span className="h-2 w-2 rounded-full bg-[#26d9ff]" />
            Agencia + sistema
          </div>

          <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[0.98] tracking-[-0.07em] sm:text-[56px] xl:text-[68px]">
            No solo hacemos marketing.
            <span className="mt-2 block bg-gradient-to-r from-[#12c7ef] via-[#28baff] to-[#8088ff] bg-clip-text text-transparent">
              Construimos marcas que venden.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-base font-semibold leading-8 text-slate-300 lg:text-lg">
            Estrategia, contenido, campañas y ventas conectadas con Cometa OS
            para transformar atención en oportunidades comerciales reales.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={WHATSAPP_CTA}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-[#16c7ef] px-7 text-sm font-black text-[#071329] shadow-[0_18px_46px_rgba(22,199,239,0.25)] transition hover:-translate-y-0.5 hover:bg-white"
            >
              Solicitar diagnóstico
              <span className="ml-3 text-lg">→</span>
            </a>

            <a
              href="#casos"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-7 text-sm font-black text-white transition hover:border-[#31d8ff]/40 hover:bg-[#31d8ff]/10"
            >
              Ver casos de éxito
              <span className="ml-3">↗</span>
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <div className="flex -space-x-3">
              {["CM", "MG", "LR", "NM"].map((item) => (
                <div
                  key={item}
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#071321] bg-gradient-to-br from-[#1c85ff] to-[#12c7ef] text-[9px] font-black text-white"
                >
                  {item}
                </div>
              ))}
            </div>

            <p className="max-w-md text-xs font-bold leading-5 text-slate-400">
              Una agencia que conecta creatividad, estrategia, ventas y
              tecnología propia.
            </p>
          </div>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto min-h-[500px] w-full max-w-[690px]">
      <div className="absolute left-[4%] top-[6%] h-[36%] w-[53%] rotate-[-2deg] overflow-hidden rounded-[30px] border border-white/10 bg-[#101e30] shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <div
          className="h-full w-full bg-cover bg-center"
          style={{
            backgroundImage:
              'linear-gradient(135deg, rgba(4,14,29,.12), rgba(5,16,31,.65)), url("/agencia/hero-team.jpg")',
          }}
        />

        <div className="absolute bottom-4 left-4 rounded-xl border border-white/10 bg-[#071321]/85 px-4 py-3 backdrop-blur">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#51ddff]">
            Estrategia
          </p>
          <p className="mt-1 text-sm font-black text-white">
            Pensada para vender
          </p>
        </div>
      </div>

      <div className="absolute right-[2%] top-[2%] h-[48%] w-[43%] rotate-[3deg] overflow-hidden rounded-[30px] border border-[#7763ff]/25 bg-[#132038] shadow-[0_30px_90px_rgba(0,0,0,0.42)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(118,83,255,.35),transparent_42%),linear-gradient(145deg,#0e1c31,#08111e)]" />

        <div className="relative flex h-full flex-col p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#56dfff]">
              Cometa OS
            </p>
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-[9px] font-black uppercase text-emerald-300">
              Activo
            </span>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <DashboardMini label="Leads" value="287" />
            <DashboardMini label="WhatsApp" value="432" />
            <DashboardMini label="Campañas" value="12" />
            <DashboardMini label="Señales IA" value="24" />
          </div>

          <div className="mt-auto rounded-[20px] border border-[#28c8f7]/20 bg-[#0b1728]/80 p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
              Sistema conectado
            </p>
            <div className="mt-4 flex h-20 items-end gap-2">
              {[34, 52, 43, 68, 58, 82, 96].map((height, index) => (
                <div
                  key={index}
                  className="flex-1 rounded-t-md bg-gradient-to-t from-[#1779ff] to-[#23dbf7]"
                  style={{
                    height: `${height}%`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[5%] left-[15%] h-[43%] w-[44%] rotate-[2deg] overflow-hidden rounded-[34px] border border-white/10 bg-[#111e31] shadow-[0_32px_90px_rgba(0,0,0,0.42)]">
        <div
          className="h-full w-full bg-cover bg-center"
          style={{
            backgroundImage:
              'linear-gradient(180deg, rgba(3,11,24,.05), rgba(3,11,24,.82)), url("/agencia/hero-production.jpg")',
          }}
        />

        <div className="absolute bottom-0 left-0 right-0 p-5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#58e2ff]">
            Producción y contenido
          </p>
          <p className="mt-2 text-lg font-black tracking-[-0.03em] text-white">
            Creatividad con dirección comercial
          </p>
        </div>
      </div>

      <div className="absolute bottom-[12%] right-[4%] w-[42%] rounded-[28px] border border-[#37dfff]/30 bg-[#071321]/92 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#16c8ef]/15 text-xl text-[#53e2ff]">
            ✦
          </span>

          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#4adfff]">
              Una sola operación
            </p>
            <p className="mt-1 text-lg font-black text-white">
              Marketing + ventas + Cometa OS
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs font-semibold leading-6 text-slate-300">
          La agencia ejecuta. El sistema conecta, analiza y fortalece cada
          decisión.
        </p>
      </div>

      <div className="absolute left-[2%] top-[43%] rounded-[20px] border border-white/10 bg-[#0a1728]/90 px-5 py-4 shadow-xl backdrop-blur">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
          Estrategia conectada
        </p>
        <p className="mt-1 text-2xl font-black text-[#4fddff]">24/7</p>
      </div>
    </div>
  );
}

function TrustedBrands() {
  return (
    <section className="relative z-10 bg-white">
      <div className="mx-auto max-w-[1500px] px-5 py-12 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <SectionEyebrow>Confianza construida</SectionEyebrow>

            <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-[#071329] lg:text-4xl">
              Marcas que han confiado en Cometa
            </h2>
          </div>

          <p className="max-w-xl text-sm font-semibold leading-7 text-slate-500">
            Empresas de moda, servicios, salud, industria y comercio que han
            trabajado junto a nuestro equipo.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {trustedBrands.map((brand) => (
            <BrandLogo key={brand.name} brand={brand} />
          ))}
        </div>

        <p className="mt-5 text-center text-xs font-semibold text-slate-400">
          Los logotipos reales se integrarán dentro de estos espacios conservando
          su identidad visual.
        </p>
      </div>
    </section>
  );
}

function BrandLogo({
  brand,
}: {
  brand: {
    name: string;
    subtitle: string;
    logo: string | null;
  };
}) {
  return (
    <div className="group flex min-h-[112px] items-center justify-center rounded-[24px] border border-slate-200 bg-[#f8fafc] px-4 text-center transition hover:-translate-y-1 hover:border-[#8deaff] hover:bg-white hover:shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
      {brand.logo ? (
        <img
          src={brand.logo}
          alt={brand.name}
          className="max-h-14 max-w-full object-contain grayscale transition group-hover:grayscale-0"
        />
      ) : (
        <div>
          <p className="text-lg font-black uppercase tracking-[0.16em] text-[#071329]">
            {brand.name}
          </p>
          <p className="mt-1 text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">
            {brand.subtitle}
          </p>
        </div>
      )}
    </div>
  );
}

function Results() {
  return (
    <section className="bg-[#eef4f8]">
      <div className="mx-auto max-w-[1500px] px-5 py-20 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-end">
          <div>
            <SectionEyebrow>Resultados reales</SectionEyebrow>

            <h2 className="mt-3 text-4xl font-black tracking-[-0.07em] text-[#071329] lg:text-5xl">
              El trabajo debe sentirse.
              <span className="block text-[#09a8ce]">Y también medirse.</span>
            </h2>

            <p className="mt-5 text-sm font-semibold leading-7 text-slate-600">
              No presentamos métricas vacías. Medimos la respuesta del mercado,
              el crecimiento de la comunidad y el movimiento comercial que una
              estrategia es capaz de generar.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {results.map((result) => (
              <MetricCard key={result.label} {...result} />
            ))}
          </div>
        </div>

        <p className="mt-7 text-right text-xs font-semibold text-slate-400">
          Cifras correspondientes a resultados acumulados de proyectos
          seleccionados.
        </p>
      </div>
    </section>
  );
}

function MetricCard({
  value,
  label,
  helper,
  icon,
}: {
  value: string;
  label: string;
  helper: string;
  icon: string;
}) {
  return (
    <article className="rounded-[28px] border border-white bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8faff] text-[#08a9ce]">
        <LineIcon name={icon} />
      </div>

      <p className="mt-6 text-4xl font-black tracking-[-0.06em] text-[#071329]">
        {value}
      </p>

      <p className="mt-2 text-base font-black text-[#071329]">{label}</p>

      <p className="mt-3 text-xs font-semibold leading-6 text-slate-500">
        {helper}
      </p>
    </article>
  );
}

function Difference() {
  return (
    <section
      id="diferencia"
      className="relative overflow-hidden bg-[#081421] py-24 text-white"
    >
      <div className="absolute left-[-170px] top-[80px] h-[420px] w-[420px] rounded-full bg-[#006dff]/15 blur-[130px]" />
      <div className="absolute right-[-120px] bottom-[-80px] h-[440px] w-[440px] rounded-full bg-[#7e39ff]/12 blur-[140px]" />

      <div className="relative mx-auto max-w-[1500px] px-5 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <SectionEyebrow dark>Por qué Cometa es diferente</SectionEyebrow>

            <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.07em] lg:text-6xl">
              No trabajamos para generar tráfico.
              <span className="mt-2 block bg-gradient-to-r from-[#24d5fa] to-[#6b8eff] bg-clip-text text-transparent">
                Trabajamos para generar crecimiento.
              </span>
            </h2>
          </div>

          <p className="max-w-3xl text-base font-semibold leading-8 text-slate-300 lg:ml-auto">
            Cometa une la sensibilidad de una agencia creativa con la dirección
            de una consultoría y la capacidad tecnológica de un sistema propio.
            El resultado es una operación de marketing mucho más conectada con
            el negocio.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {pillars.map((pillar) => (
            <PillarCard key={pillar.number} {...pillar} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PillarCard({
  number,
  title,
  description,
  icon,
}: {
  number: string;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <article className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] p-7 transition hover:-translate-y-1 hover:border-[#2edfff]/35 hover:bg-white/[0.07]">
      <div className="absolute right-[-35px] top-[-35px] h-32 w-32 rounded-full bg-[#24c9ff]/10 blur-2xl transition group-hover:bg-[#24c9ff]/20" />

      <div className="relative flex items-start justify-between gap-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-[#42ddff]/20 bg-[#1ed7ff]/10 text-[#54e4ff]">
          <LineIcon name={icon} />
        </div>

        <span className="text-4xl font-black tracking-[-0.08em] text-white/10">
          {number}
        </span>
      </div>

      <h3 className="relative mt-7 text-2xl font-black tracking-[-0.04em] text-white">
        {title}
      </h3>

      <p className="relative mt-4 text-sm font-semibold leading-7 text-slate-400">
        {description}
      </p>
    </article>
  );
}

function Cases() {
  return (
    <section id="casos" className="bg-white py-20">
      <div className="mx-auto max-w-[1500px] px-5 lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <SectionEyebrow>Casos de éxito</SectionEyebrow>

            <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.07em] text-[#071329] lg:text-6xl">
              Estrategias construidas alrededor de negocios reales.
            </h2>
          </div>

          <p className="max-w-xl text-sm font-semibold leading-7 text-slate-500">
            Cada marca tiene una oportunidad distinta. Por eso no vendemos
            fórmulas repetidas: diseñamos sistemas de crecimiento alrededor del
            contexto de cada empresa.
          </p>
        </div>

        <div className="mt-10 grid items-stretch gap-5 xl:grid-cols-3">
          {cases.map((item) => (
            <CaseCard key={item.eyebrow} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CaseCard({
  eyebrow,
  title,
  challenge,
  action,
  impactTitle,
  impact,
  highlights,
  tags,
  accent,
}: AgencyCase) {
  const accentClasses = {
    cyan: {
      border: "border-cyan-400/20",
      glow: "bg-cyan-400/15",
      label: "text-cyan-300",
      panel: "border-cyan-400/15 bg-cyan-400/[0.06]",
      highlight: "text-cyan-300",
    },

    blue: {
      border: "border-blue-400/20",
      glow: "bg-blue-500/15",
      label: "text-blue-300",
      panel: "border-blue-400/15 bg-blue-400/[0.06]",
      highlight: "text-blue-300",
    },

    violet: {
      border: "border-violet-400/20",
      glow: "bg-violet-500/15",
      label: "text-violet-300",
      panel: "border-violet-400/15 bg-violet-400/[0.06]",
      highlight: "text-violet-300",
    },
  }[accent];

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-[34px] border bg-[#081421] p-7 text-white shadow-[0_24px_70px_rgba(15,23,42,0.16)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_90px_rgba(15,23,42,0.22)] ${accentClasses.border}`}
    >
      <div
        className={`pointer-events-none absolute right-[-80px] top-[-80px] h-60 w-60 rounded-full blur-[90px] ${accentClasses.glow}`}
      />

      <div className="pointer-events-none absolute bottom-[-120px] left-[-90px] h-64 w-64 rounded-full bg-[#137cff]/10 blur-[100px]" />

      <div className="relative flex items-start justify-between gap-4">
        <span
          className={`rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] ${accentClasses.label}`}
        >
          {eyebrow}
        </span>

        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-[8px] font-black uppercase tracking-[0.16em] text-slate-300">
          Caso real
        </span>
      </div>

      <h3 className="relative mt-7 text-3xl font-black leading-[1.08] tracking-[-0.05em] text-white">
        {title}
      </h3>

      <div className="relative mt-7 grid gap-5">
        <div>
          <p
            className={`text-[9px] font-black uppercase tracking-[0.18em] ${accentClasses.label}`}
          >
            El reto
          </p>

          <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
            {challenge}
          </p>
        </div>

        <div>
          <p
            className={`text-[9px] font-black uppercase tracking-[0.18em] ${accentClasses.label}`}
          >
            Qué hizo Cometa
          </p>

          <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
            {action}
          </p>
        </div>
      </div>

      <div
        className={`relative mt-7 rounded-[24px] border p-5 ${accentClasses.panel}`}
      >
        <p
          className={`text-[9px] font-black uppercase tracking-[0.18em] ${accentClasses.label}`}
        >
          {impactTitle}
        </p>

        <p className="mt-3 text-sm font-bold leading-7 text-white">
          {impact}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {highlights.map((highlight) => (
            <div
              key={`${highlight.value}-${highlight.label}`}
              className="rounded-[18px] border border-white/10 bg-[#071321]/55 p-4"
            >
              <p
                className={`break-words text-xl font-black tracking-[-0.04em] ${accentClasses.highlight}`}
              >
                {highlight.value}
              </p>

              <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                {highlight.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative mt-auto flex flex-wrap gap-2 pt-7">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.13em] text-slate-300"
          >
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}

function CometaOSBridge() {
  return (
    <section className="relative overflow-hidden bg-[#071321] py-24 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_45%,rgba(32,127,255,.18),transparent_32%),radial-gradient(circle_at_22%_60%,rgba(19,216,245,.12),transparent_28%)]" />

      <div className="relative mx-auto grid max-w-[1500px] gap-12 px-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8">
        <div>
          <div className="inline-flex items-center rounded-full border border-[#40dfff]/20 bg-[#27d6f5]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#5ce7ff]">
            El diferenciador tecnológico
          </div>

          <h2 className="mt-6 text-4xl font-black leading-[1.04] tracking-[-0.07em] lg:text-6xl">
            La agencia ejecuta.
            <span className="block text-[#3fdcff]">
              Cometa OS conecta todo.
            </span>
          </h2>

          <p className="mt-6 max-w-2xl text-base font-semibold leading-8 text-slate-300">
            Cometa OS es la capa tecnológica que conecta diagnóstico,
            conocimiento del negocio, estrategia, contenido, WhatsApp y ventas.
            Así el marketing deja de operar aislado.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-[#18cdf2] px-7 text-sm font-black text-[#071329] transition hover:-translate-y-0.5 hover:bg-white"
            >
              Conocer Cometa OS
              <span className="ml-3">→</span>
            </Link>

            <a
              href={WHATSAPP_CTA}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-7 text-sm font-black text-white transition hover:border-[#4ee6ff]/40 hover:bg-white/10"
            >
              Hablar con Cometa
            </a>
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-1/2 top-1/2 h-[330px] w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#41ddff]/20 bg-[#087cff]/10 shadow-[0_0_100px_rgba(19,173,255,0.17)]" />
          <div className="absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#5f85ff]/30 bg-[#081a30] shadow-[0_0_80px_rgba(41,209,255,0.25)]" />

          <div className="relative mx-auto flex min-h-[520px] max-w-[640px] items-center justify-center">
            <div className="relative z-10 flex h-40 w-40 flex-col items-center justify-center rounded-full border border-[#52e3ff]/40 bg-[#071321] shadow-[0_0_70px_rgba(36,211,255,0.27)]">
              <span className="text-sm font-black uppercase tracking-[0.18em] text-white">
                Cometa
              </span>
              <span className="mt-1 text-xl font-black uppercase tracking-[0.18em] text-[#56e5ff]">
                OS
              </span>
            </div>

            {agents.map((agent, index) => {
              const positions = [
                "left-[1%] top-[9%]",
                "right-[0%] top-[13%]",
                "right-[1%] bottom-[13%]",
                "left-[4%] bottom-[7%]",
                "left-1/2 top-[0%] -translate-x-1/2",
              ];

              return (
                <div
                  key={agent.name}
                  className={`absolute ${positions[index]} min-w-[150px] rounded-[22px] border border-white/10 bg-white/[0.06] p-4 text-center backdrop-blur`}
                >
                  <p className="text-[9px] font-black uppercase tracking-[0.17em] text-[#58e3ff]">
                    {agent.name}
                  </p>

                  <p className="mt-2 text-sm font-black text-white">
                    {agent.action}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function AboutUs() {
  return (
    <section id="nosotros" className="bg-[#f3f7fa] py-24">
      <div className="mx-auto grid max-w-[1500px] gap-10 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-stretch lg:px-8">
        <div className="flex flex-col justify-center">
          <SectionEyebrow>Quiénes somos</SectionEyebrow>

          <h2 className="mt-4 text-4xl font-black tracking-[-0.07em] text-[#071329] lg:text-6xl">
            Personas reales obsesionadas con hacer crecer negocios.
          </h2>

          <p className="mt-6 text-base font-semibold leading-8 text-slate-600">
            Somos estrategas, diseñadores, creadores, especialistas en pauta,
            producción y tecnología trabajando como parte del equipo de cada
            cliente.
          </p>

          <p className="mt-4 text-base font-semibold leading-8 text-slate-600">
            No buscamos convertirnos en un proveedor más. Queremos entender el
            negocio, detectar oportunidades y construir una operación capaz de
            crecer.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <AboutMini title="Estrategia" helper="Decisiones con intención" />
            <AboutMini title="Creatividad" helper="Contenido que conecta" />
            <AboutMini title="Tecnología" helper="Sistemas que escalan" />
            <AboutMini title="Resultados" helper="Crecimiento medible" />
          </div>
        </div>

        <div className="relative min-h-[620px] overflow-hidden rounded-[38px] border border-white bg-[#101e30] shadow-[0_24px_75px_rgba(15,23,42,0.12)]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                'linear-gradient(180deg, rgba(5,13,25,.02), rgba(5,13,25,.65)), url("/agencia/team-cometa.jpg")',
            }}
          />

          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#071321] via-[#071321]/88 to-transparent p-8 pt-28 text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5be6ff]">
              El equipo detrás del sistema
            </p>

            <h3 className="mt-3 max-w-2xl text-3xl font-black tracking-[-0.05em]">
              Creatividad humana respaldada por inteligencia, procesos y
              tecnología.
            </h3>
          </div>
        </div>
      </div>
    </section>
  );
}

function AboutMini({
  title,
  helper,
}: {
  title: string;
  helper: string;
}) {
  return (
    <div className="rounded-[22px] border border-white bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
      <p className="text-sm font-black text-[#071329]">{title}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{helper}</p>
    </div>
  );
}

function FinalCTA() {
  return (
    <section id="contacto" className="bg-white px-5 py-16 lg:px-8">
      <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[42px] bg-[#071321] px-6 py-14 text-white shadow-[0_30px_90px_rgba(6,20,40,0.2)] lg:px-12 lg:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_48%,rgba(18,180,255,.28),transparent_29%),radial-gradient(circle_at_15%_20%,rgba(102,65,255,.18),transparent_28%)]" />
        <div className="absolute bottom-[-250px] right-[-80px] h-[500px] w-[800px] rounded-[50%] border border-[#44ddff]/20 bg-[#087cff]/10 shadow-[0_-45px_120px_rgba(22,180,255,0.16)]" />

        <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#59e3ff]">
              El próximo movimiento de tu marca
            </p>

            <h2 className="mt-4 max-w-4xl text-4xl font-black leading-tight tracking-[-0.07em] lg:text-6xl">
              Tu marca puede crecer más.
              <span className="block text-[#37d8fa]">
                Diseñemos cómo hacerlo.
              </span>
            </h2>

            <p className="mt-5 max-w-2xl text-sm font-semibold leading-7 text-slate-300">
              Analizamos tu negocio, encontramos oportunidades y diseñamos un
              sistema de marketing y ventas conectado con Cometa OS.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href={WHATSAPP_CTA}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-16 items-center justify-center rounded-2xl bg-[#20cff4] px-8 text-sm font-black text-[#071329] shadow-[0_18px_50px_rgba(32,207,244,0.25)] transition hover:-translate-y-0.5 hover:bg-white"
            >
              Solicitar diagnóstico
              <span className="ml-3 text-lg">→</span>
            </a>

            <Link
              href="/"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-7 text-sm font-black text-white transition hover:bg-white/10"
            >
              Explorar Cometa OS
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#0d1928] text-white">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-7 px-5 py-10 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[9px] font-black italic text-[#0e4c85]">
            COMETA
          </div>

          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em]">
              Cometa MKT
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              Agencia, marketing, ventas y Cometa OS.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
          <a href="#diferencia" className="transition hover:text-white">
            Diferencia
          </a>

          <a href="#casos" className="transition hover:text-white">
            Casos
          </a>

          <a href="#nosotros" className="transition hover:text-white">
            Nosotros
          </a>

          <Link href="/" className="transition hover:text-[#51e1ff]">
            Cometa OS
          </Link>
        </div>

        <p className="text-xs font-semibold text-slate-500">
          © {new Date().getFullYear()} Cometa MKT. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}

function SectionEyebrow({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <p
      className={`text-[10px] font-black uppercase tracking-[0.22em] ${
        dark ? "text-[#57e3ff]" : "text-[#049fc4]"
      }`}
    >
      {children}
    </p>
  );
}

function DashboardMini({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[16px] border border-white/10 bg-white/[0.05] p-3">
      <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function LineIcon({ name }: { name: string }) {
  const common = {
    width: 25,
    height: 25,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "eye") {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8" />
        <path d="M18 14a5 5 0 0 1 3 4.6V20" />
      </svg>
    );
  }

  if (name === "heart") {
    return (
      <svg {...common}>
        <path d="M20.8 4.6a5.3 5.3 0 0 0-7.5 0L12 5.9l-1.3-1.3a5.3 5.3 0 0 0-7.5 7.5L12 21l8.8-8.9a5.3 5.3 0 0 0 0-7.5Z" />
      </svg>
    );
  }

  if (name === "growth" || name === "chart") {
    return (
      <svg {...common}>
        <path d="M3 20h18" />
        <path d="m5 16 4-4 3 3 6-7" />
        <path d="M15 8h3v3" />
      </svg>
    );
  }

  if (name === "target") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <path d="m14.5 9.5 5-5" />
        <path d="M17 4.5h2.5V7" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />
    </svg>
  );
}