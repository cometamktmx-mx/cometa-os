import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

const POS_SIGNUP = "/signup?product=pos";
const LOGIN = "/login";
const COMETA_CONTACT =
  "mailto:cometa.mktmx@gmail.com?subject=Quiero%20conocer%20Cometa%20OS";

export const metadata: Metadata = {
  title: "Cometa OS — Punto de venta e inteligencia para hacer crecer tu negocio",
  description:
    "Cometa POS conecta ventas, inventario, caja y clientes. Cometa OS transforma esos datos en inteligencia, automatizaci\u00f3n y crecimiento.",
};

const posModules = [
  ["Punto de venta", "Cobra y registra cada operaci\u00f3n.", "terminal"],
  ["Caja", "Abre turnos y entiende tus cortes.", "wallet"],
  ["Productos y variantes", "Organiza tallas, colores y presentaciones.", "tag"],
  ["Variantes", "Selecciona la combinaci\u00f3n exacta al vender.", "layers"],
  ["Inventario", "Recibe mercanc\u00eda y controla existencias.", "inventory"],
  ["Clientes", "Conecta cada compra con una persona.", "users"],
  ["Fidelizaci\u00f3n", "Activa puntos, visitas y recompensas.", "heart"],
  ["Reportes", "Consulta ventas, productos y clientes.", "chart"],
  ["Inteligencia", "Detecta se\u00f1ales a partir de tu operaci\u00f3n.", "pulse"],
] as const;

const intelligenceSignals = [
  ["Ventas", "Ticket promedio +8%."],
  ["Inventario", "3 productos requieren reposici\u00f3n."],
  ["Clientes", "18 clientes regresaron este mes."],
  ["Sales AI", "5 leads necesitan seguimiento."],
  ["Brand", "El contenido de producto genera mayor respuesta."],
];

const advancedGroups = [
  {
    label: "Entender",
    products: [
      ["ORION", "Diagn\u00f3stico"],
      ["NOVA", "Mapa del negocio"],
      ["PULSAR", "Se\u00f1ales y oportunidades"],
      ["BRAND IA", "Auditor\u00eda y lectura de marca"],
      ["COSMOS", "Memoria del negocio"],
    ],
  },
  {
    label: "Decidir",
    products: [
      ["ATLAS", "Estrategia"],
      ["BUSINESS INTELLIGENCE", "Lectura del negocio"],
      ["GROWTH SIGNALS", "Prioridades"],
    ],
  },
  {
    label: "Ejecutar",
    products: [
      ["MERCURY", "Contenido"],
      ["SALES AI", "Ventas y seguimiento"],
      ["AUTOMATION", "Procesos comerciales"],
    ],
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050b16] text-white">
      <LandingHeader />
      <Hero />
      <TwoLayers />
      <PosSection />
      <PosPricing />
      <PosToOsTransition />
      <DataFlywheel />
      <IntelligenceSection />
      <CometaOsSection />
      <BrandAiSection />
      <SalesAiSection />
      <GrowthConnection />
      <OsPricing />
      <AgencyTechSection />
      <PathsSection />
      <HowItWorks />
      <IndustriesSection />
      <CommercialSection />
      <FinalCta />
      <LandingFooter />
    </main>
  );
}

function LandingHeader() {
  const navigation = [
    ["Producto", "#producto"],
    ["Cometa POS", "#pos"],
    ["Inteligencia", "#inteligencia"],
    ["Cometa OS", "#cometa-os"],
    ["Industrias", "#industrias"],
    ["Planes", "#planes"],
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050b16]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 lg:px-8">
        <Link href="/" aria-label="Cometa OS, inicio" className="flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          <CometaLogo compact />
          <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-blue-200">Cometa OS</span>
        </Link>

        <nav aria-label="Navegaci\u00f3n principal" className="hidden items-center gap-7 lg:flex">
          {navigation.map(([label, href]) => (
            <a key={href} href={href} className="text-xs font-semibold text-slate-400 transition hover:text-white focus:outline-none focus-visible:text-blue-300">
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          <Link href={LOGIN} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            Iniciar sesión
          </Link>
          <Link href={POS_SIGNUP} className="rounded-xl bg-[#1D4ED8] px-5 py-2.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(29,78,216,0.22)] transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
            Probar POS gratis
          </Link>
        </div>

        <details className="relative sm:hidden">
          <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-white/10 text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" aria-label="Abrir navegaci\u00f3n">
            <Icon name="menu" />
          </summary>
          <div className="absolute right-0 top-12 w-[min(88vw,320px)] rounded-2xl border border-white/10 bg-[#0a1424] p-3 shadow-2xl">
            {navigation.map(([label, href]) => (
              <a key={href} href={href} className="block rounded-xl px-4 py-3 text-sm font-semibold text-slate-300 hover:bg-white/[0.05]">{label}</a>
            ))}
            <div className="mt-2 grid gap-2 border-t border-white/[0.07] pt-3">
              <Link href={LOGIN} className="rounded-xl px-4 py-3 text-center text-sm font-semibold text-slate-300">Iniciar sesión</Link>
              <Link href={POS_SIGNUP} className="rounded-xl bg-[#1D4ED8] px-4 py-3 text-center text-sm font-bold">Probar POS gratis</Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="producto" className="relative isolate overflow-hidden border-b border-white/[0.06]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
      <div className="pointer-events-none absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-blue-700/20 blur-[130px]" />
      <div className="pointer-events-none absolute right-[-12%] top-[8%] h-[600px] w-[600px] rounded-full bg-cyan-500/[0.08] blur-[150px]" />
      <div className="relative mx-auto grid min-h-[calc(100svh-72px)] max-w-[1500px] items-center gap-14 px-5 py-16 lg:grid-cols-[0.4fr_0.6fr] lg:px-8 lg:py-20">
        <div className="max-w-[590px]">
          <Pill>Cometa</Pill>
          <h1 className="mt-7 text-[clamp(3.25rem,6vw,6.4rem)] font-semibold leading-[0.88] tracking-[-0.075em]">
            Convierte tu negocio<br/>en un sistema operativo<br/><span className="bg-gradient-to-r from-[#1D4ED8] via-blue-400 to-cyan-300 bg-clip-text text-transparent">inteligente.</span>
          </h1>
          <p className="mt-8 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
            COMETA conecta operación, clientes, ventas, datos, inteligencia y crecimiento en un solo ecosistema.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <PrimaryLink href={POS_SIGNUP}>Probar Cometa POS gratis <Icon name="arrow" /></PrimaryLink>
            <SecondaryLink href="#cometa-os">Conocer Cometa OS <Icon name="arrow"/></SecondaryLink>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-[10px] font-semibold text-slate-400">
            <span className="flex items-center gap-2"><Icon name="calendar"/>15 días gratis</span>
            <span className="flex items-center gap-2"><Icon name="card"/>Sin tarjeta</span>
            <span className="flex items-center gap-2"><Icon name="store"/>Retail y Moda disponibles</span>
          </div>
        </div>
        <ProductPreview />
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <div aria-label="Vista demostrativa del ecosistema Cometa" data-product-stage className="relative mx-auto w-full max-w-[900px] py-10 lg:[perspective:1600px]">
      <div className="absolute inset-x-[15%] bottom-[-8%] h-32 rounded-full bg-blue-600/25 blur-[80px]" />
      <div className="pointer-events-none absolute inset-x-[5%] bottom-0 h-[45%] bg-[linear-gradient(rgba(59,130,246,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.14)_1px,transparent_1px)] bg-[size:38px_38px] [transform:perspective(500px)_rotateX(64deg)] [mask-image:linear-gradient(to_top,black,transparent)]"/>
      <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#091423]/95 shadow-[0_50px_140px_rgba(0,0,0,0.68)] ring-1 ring-white/[0.04] motion-safe:transition-transform motion-safe:duration-700 lg:[transform:rotateY(-2deg)] lg:hover:[transform:rotateY(0deg)]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-3"><CometaLogo compact /><span className="text-xs font-bold">Cometa POS</span></div>
          <span className="rounded-full bg-white/[0.05] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">Vista demo</span>
        </div>
        <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[0.55fr_1.45fr]">
          <aside className="hidden rounded-2xl border border-white/[0.06] bg-[#060d18] p-4 lg:block">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Cometa POS</p>
            {[["chart","Resumen"],["terminal","Ventas"],["wallet","Caja"],["tag","Productos"],["inventory","Inventario"],["users","Clientes"],["chart","Reportes"],["settings","Configuración"]].map(([icon,label], index) => <div key={label} className={`mt-1.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] ${index === 0 ? "bg-blue-500/10 text-blue-200" : "text-slate-500"}`}><Icon name={icon} />{label}</div>)}
          </aside>
          <div>
            <div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">Resumen del día</p><p className="mt-1 text-sm font-bold">Operación en tiempo real</p></div><span className="text-[8px] uppercase tracking-wider text-slate-600">Demo</span></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <DemoMetric label="Ventas hoy" value="$128,430" detail="+18.6% vs ayer" />
              <DemoMetric label="Transacciones" value="352" detail="+12.4% vs ayer" />
              <DemoMetric label="Ticket promedio" value="$364" detail="+9.1% vs ayer" />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_0.8fr]"><div className="rounded-xl border border-white/[0.07] bg-[#07101d] p-3"><p className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Ventas</p><MiniLineChart/><div className="mt-2 grid grid-cols-2 gap-2">{[["Camisa Linen Azul","42"],["Jeans Clásico","36"],["Vestido Aurora","29"],["Tenis Urban White","24"]].map(([name,value])=><div key={name} className="flex justify-between text-[8px] text-slate-500"><span>{name}</span><span>{value}</span></div>)}</div></div><div className="grid gap-3"><div className="rounded-xl border border-white/[0.07] bg-[#07101d] p-3"><p className="text-[8px] font-bold uppercase text-slate-600">Caja 1</p><p className="mt-2 text-lg font-bold">$8,620.00</p><p className="text-[8px] text-slate-500">Efectivo 62% · Tarjeta 38%</p><button type="button" className="mt-3 w-full rounded-md border border-white/10 py-1.5 text-[8px] text-slate-400">Cerrar caja</button></div><div className="rounded-xl border border-white/[0.07] bg-[#07101d] p-3"><p className="text-[8px] font-bold uppercase text-slate-600">Inventario</p><div className="mt-2 flex justify-between text-[8px]"><span className="text-amber-300">3 bajo</span><span className="text-rose-300">1 sin stock</span><span className="text-cyan-300">5 próx.</span></div></div></div>
            </div>
          </div>
        </div>
      </div>
      <FloatingPanel className="-left-8 top-[8%]" tone="cyan" label="Inteligencia · ORION" icon="pulse"><p className="text-sm font-semibold">3 productos requieren reposición</p><DemoBar label="Stock crítico" value="3/24" width="18%" warning/></FloatingPanel>
      <FloatingPanel className="-left-6 bottom-[2%]" tone="purple" label="Growth · PULSAR" icon="growth"><div className="flex items-end justify-between"><p className="text-2xl font-bold">4.7x</p><span className="text-xs text-emerald-300">+27%</span></div><p className="mt-2 text-[9px] text-slate-500">Ventas atribuidas · $46,780 · Demo</p></FloatingPanel>
      <FloatingPanel className="-right-5 top-[5%]" tone="green" label="Sales AI · Demo" icon="message"><div className="grid grid-cols-2 gap-2 text-[9px]"><span>Nuevos <b>12</b></span><span>Calificados <b>8</b></span><span>Conversación <b>3</b></span><span>Cita <b>1</b></span></div></FloatingPanel>
      <FloatingPanel className="-right-8 bottom-[4%]" tone="purple" label="Sales AI · Inbox" icon="chat"><p className="text-[9px] text-slate-300">“¿Tienen este vestido en talla M?”</p><p className="mt-2 rounded-lg bg-blue-600/20 p-2 text-[9px] text-blue-200">Sí, lo tenemos. ¿Quieres que te guarde uno?</p><span className="mt-2 inline-flex rounded-full bg-emerald-400/10 px-2 py-1 text-[8px] font-bold text-emerald-300">Lead caliente · Demo</span></FloatingPanel>
    </div>
  );
}

function TwoLayers() {
  return <section className="bg-[#050b16] py-24 sm:py-36"><div className="mx-auto max-w-[1280px] px-5 lg:px-8"><SectionIntro eyebrow="Una plataforma · Dos capas" title="Opera hoy. Crece mañana." copy="Cometa POS captura la operación. Cometa OS convierte esa información en inteligencia, estrategia y ejecución."/><div data-two-layers className="mt-14 grid gap-4 lg:grid-cols-[1fr_96px_1fr] lg:items-stretch"><LayerPanel title="Cometa POS" label="Operación" icon="terminal" items={["Ventas","Caja","Inventario","Clientes","Fidelización","Reportes"]}/><div className="flex flex-col items-center justify-center gap-2 py-4 text-blue-300"><span className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-600">Data connection</span><Icon name="arrow"/></div><LayerPanel title="Cometa OS" label="Growth + Intelligence" icon="spark" items={["Estrategia","Automatización","Agentes IA","Marketing","Ventas","Oportunidades"]} featured/></div></div></section>;
}

function PosSection() {
  return (
    <section id="pos" className="bg-[#050b16] py-24 text-white sm:py-36">
      <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
        <SectionIntro eyebrow="Cometa POS · Disponible" title="Todo lo que tu operación necesita. En un solo lugar." copy="Ventas, caja, inventario, productos y clientes conectados en un mismo sistema." />
        <div data-pos-bento className="mt-14 grid auto-rows-[minmax(150px,auto)] gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {posModules.map(([title, text, icon], index) => (
            <article key={title} className={`group relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.028] p-6 shadow-[0_18px_55px_rgba(0,0,0,0.22)] transition duration-300 motion-safe:hover:-translate-y-1 motion-safe:hover:border-blue-400/20 ${index === 0 ? "min-h-[330px] sm:col-span-2 sm:row-span-2 lg:col-span-2" : index === 4 || index === 5 || index === 8 ? "lg:col-span-2" : ""}`}>
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-blue-500/[0.06] opacity-0 transition group-hover:opacity-100" />
              <div className="relative">
                <span className="flex h-10 w-10 items-center justify-center rounded-[13px] border border-blue-400/15 bg-blue-500/10 text-blue-300"><Icon name={icon} /></span>
                <h3 className={`${index === 0 ? "mt-8 text-3xl" : "mt-5 text-base"} font-bold tracking-[-0.035em]`}>{title}</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{text}</p>
                {index === 0 ? <RegisterMiniature /> : null}
                {index === 2 || index === 3 ? <div className="mt-6 flex flex-wrap gap-2"><MiniChip>Azul</MiniChip><MiniChip>Negro</MiniChip><MiniChip>M / L / XL</MiniChip></div> : null}
                {index === 4 ? <div className="mt-6 space-y-2"><DemoBar light label="Playera Classic" value="82%" width="82%"/><DemoBar light label="Sudadera Navy" value="12%" width="12%" warning/></div> : null}
                {index === 5 ? <div className="mt-7 flex items-center"><Avatar label="AM"/><Avatar label="LR"/><Avatar label="JG"/><span className="ml-3 text-[10px] font-semibold text-slate-400">clientes recurrentes</span></div> : null}
                {index === 6 ? <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-600"><Icon name="heart"/> 480 puntos</div> : null}
                {index === 7 ? <MiniChart /> : null}
                {index === 8 ? <p className="mt-6 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs font-semibold text-blue-800">Stock bajo detectado en 3 productos.</p> : null}
              </div>
            </article>
          ))}
        </div>
        <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <PrimaryLink href={POS_SIGNUP}>Probar Cometa POS gratis <Icon name="arrow" /></PrimaryLink>
          <span className="text-xs font-semibold text-slate-500">15 días gratis · Activa tu negocio por tu cuenta</span>
        </div>
      </div>
    </section>
  );
}

function PosPricing() {
  const plans = [
    { name: "Start", price: "$399", detail: "1 sucursal · 1 caja · hasta 2 usuarios", features: ["POS", "Inventario", "Clientes", "Reportes"], popular: false },
    { name: "Pro", price: "$499", detail: "1 sucursal · hasta 2 cajas · hasta 5 usuarios", features: ["Todo Start", "Fidelizaci\u00f3n", "Reportes completos", "Intelligence", "Roles y permisos"], popular: true },
    { name: "Multi", price: "$899", detail: "Hasta 4 sucursales · m\u00faltiples cajas · hasta 10 usuarios", features: ["Todo Pro", "Operaci\u00f3n multi-sucursal", "Reportes consolidados", "Intelligence consolidada"], popular: false },
  ];
  return <section id="planes" className="bg-[#050b16] pb-28 text-white sm:pb-40"><div className="mx-auto max-w-[1280px] px-5 lg:px-8"><div className="border-t border-white/[0.07] pt-24"><SectionIntro eyebrow="Planes POS" title="Simples. Transparentes. Sin sorpresas." copy="15 días gratis en todos los planes. No necesitas tarjeta para comenzar."/></div><div data-pos-pricing className="mt-12 grid gap-4 lg:grid-cols-3">{plans.map((plan)=><article key={plan.name} className={`relative rounded-[26px] border bg-white/[0.03] p-7 shadow-[0_18px_60px_rgba(0,0,0,0.24)] ${plan.popular ? "border-blue-500 ring-4 ring-blue-500/10" : "border-white/[0.09]"}`}>{plan.popular?<span className="absolute right-5 top-5 rounded-full bg-blue-600 px-3 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-white">Más popular</span>:null}<p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">Plan {plan.name}</p><div className="mt-7 flex items-end gap-2"><span className="text-5xl font-semibold tracking-[-0.06em]">{plan.price}</span><span className="pb-1 text-xs text-slate-500">MXN / mes</span></div><p className="mt-4 min-h-10 text-xs leading-5 text-slate-400">{plan.detail}</p><ul className="mt-7 space-y-3 border-t border-white/[0.07] pt-6">{plan.features.map(feature=><li key={feature} className="flex gap-3 text-sm text-slate-300"><span className="text-blue-300"><Icon name="check"/></span>{feature}</li>)}</ul><Link href={POS_SIGNUP} className={`mt-8 flex min-h-12 items-center justify-center rounded-[14px] text-sm font-bold transition motion-safe:hover:-translate-y-0.5 ${plan.popular ? "bg-blue-600 text-white hover:bg-blue-500" : "border border-white/10 bg-white/[0.04] text-white hover:border-blue-400/30"}`}>Probar {plan.name} gratis</Link><p className="mt-4 text-center text-[10px] font-semibold text-slate-500">15 días gratis</p></article>)}</div><p className="mt-5 text-xs text-slate-500">El alta inicial abre el trial de Cometa POS; la selección de plan se confirma posteriormente.</p></div></section>;
}

function PosToOsTransition() {
  const stages = [["POS","Operación diaria","terminal"],["Data","Datos en tiempo real","database"],["Intelligence","Decisiones inteligentes","pulse"],["Growth","Crecimiento sostenible","growth"]] as const;
  return <section className="relative overflow-hidden border-y border-white/[0.07] bg-[#07111f] py-20 text-center sm:py-28"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(29,78,216,0.16),transparent_42%)]"/><div className="relative mx-auto max-w-[1180px] px-5"><Pill>El POS es sólo el comienzo</Pill><div data-pos-os-bridge className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">{stages.map(([label,detail,icon],index)=><div key={label} className="relative"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-blue-400/25 bg-blue-500/10 text-blue-300 shadow-[0_0_45px_rgba(29,78,216,0.18)]"><Icon name={icon}/></span><p className="mt-5 text-sm font-bold uppercase tracking-[0.12em]">{label}</p><p className="mt-2 text-xs text-slate-500">{detail}</p>{index<stages.length-1?<span className="absolute -right-5 top-7 hidden text-blue-500/50 lg:block"><Icon name="arrow"/></span>:null}</div>)}</div></div></section>;
}

function DataFlywheel() {
  const steps = [["Venta","terminal"], ["Inventario","inventory"], ["Cliente","users"], ["Conversaciones","message"], ["Comportamiento","chart"], ["Se\u00f1ales","pulse"], ["Estrategia","spark"], ["Acci\u00f3n","automation"], ["Growth","growth"]] as const;
  return (
    <section className="relative overflow-hidden border-y border-white/[0.06] bg-[#07111f] py-24 sm:py-36">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-700/[0.07] blur-[100px]" />
      <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
        <SectionIntro eyebrow="Más que una caja registradora" title="Cada venta hace más inteligente a tu negocio." copy="Cometa POS no sólo registra lo que vendes. Cada operación construye información que después puedes usar para entender mejor tu negocio." />
        <ol data-data-flywheel className="relative mt-16 grid gap-8 sm:grid-cols-3 lg:grid-cols-9 lg:gap-2">
          <div aria-hidden="true" className="absolute left-[7%] right-[7%] top-6 hidden h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent lg:block" />
          {steps.map(([step, icon], index) => (
            <li key={step} className="relative text-center">
              <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/25 bg-[#0b192b] text-blue-300 shadow-[0_0_30px_rgba(29,78,216,0.16)]"><Icon name={icon}/></span>
              <span className="mt-5 block text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">0{index + 1}</span>
              <p className="mt-2 text-sm font-semibold text-white">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function IntelligenceSection() {
  return (
    <section id="inteligencia" className="relative overflow-hidden bg-[#050b16] py-24 sm:py-40">
      <div className="pointer-events-none absolute right-[-15%] top-[12%] h-[600px] w-[600px] rounded-full bg-blue-600/10 blur-[140px]" />
      <div className="relative mx-auto grid max-w-[1280px] gap-14 px-5 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:px-8">
        <div><SectionIntro eyebrow="Cometa Intelligence" title="Tu negocio empieza a hablar." copy="Convierte la operación diaria en lecturas claras. Entiende qué se mueve, qué necesita atención y dónde conviene profundizar." /><div className="mt-8 inline-flex items-center gap-2 text-xs font-semibold text-slate-500"><span className="h-2 w-2 rounded-full bg-blue-400"/>Señales construidas con tu operación</div></div>
        <div data-intelligence-board className="grid gap-4 sm:grid-cols-2">
          {intelligenceSignals.map(([title, text], index) => (
            <article key={title} className={`group rounded-[24px] border p-6 transition duration-300 motion-safe:hover:-translate-y-1 ${index === 0 ? "border-blue-400/20 bg-blue-500/[0.08] sm:col-span-2" : "border-white/[0.07] bg-white/[0.025]"}`}>
              <div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-blue-500/10 text-blue-300"><Icon name={index === 1 ? "inventory" : index === 2 ? "users" : index === 3 ? "message" : index === 4 ? "brand" : "chart"} /></span><span className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-slate-500">Señal demostrativa</span></div>
              <h3 className={`${index === 0 ? "mt-7 text-2xl" : "mt-5"} font-bold`}>{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
              {index === 0 ? <MiniChart dark /> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CometaOsSection() {
  return (
    <section id="cometa-os" className="bg-[#050b16] py-24 text-white sm:py-40">
      <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
        <SectionIntro eyebrow="Cometa OS" title="El sistema operativo para hacer crecer tu negocio." copy="COMETA OS convierte tus datos en inteligencia y ejecución." />
        <div data-ecosystem-map className="relative mt-16 grid gap-5 lg:grid-cols-[1fr_250px_1fr] lg:items-center">
          <div aria-hidden="true" className="absolute left-[20%] right-[20%] top-1/2 hidden border-t border-dashed border-blue-400/30 lg:block" />
          {advancedGroups.map((group) => (
            <article key={group.label} className={`relative z-10 rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-6 shadow-[0_18px_55px_rgba(0,0,0,0.22)] ${group.label === "Decidir" ? "lg:col-start-3" : group.label === "Ejecutar" ? "lg:col-span-3 lg:mx-auto lg:w-[46%]" : ""}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">{group.label}</p>
              <div className="mt-5 space-y-3">
                {group.products.map(([name, description]) => (
                  <div key={name} className="flex items-center gap-3 rounded-xl bg-white/[0.035] px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-blue-300"><Icon name={group.label === "Entender" ? "pulse" : group.label === "Decidir" ? "spark" : "arrow"}/></span>
                    <div><p className="text-sm font-bold">{name}</p><p className="mt-0.5 text-xs text-slate-500">{description}</p></div>
                  </div>
                ))}
              </div>
            </article>
          ))}
          <div className="relative z-20 row-start-1 flex min-h-56 flex-col items-center justify-center rounded-full border border-blue-400/25 bg-blue-500/[0.08] text-white shadow-[0_0_90px_rgba(29,78,216,0.2)] lg:col-start-2">
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">Cometa OS</p>
            <p className="mt-4 max-w-[150px] text-center text-sm font-semibold leading-6">Un sistema.<br/>Todas las piezas.<br/>Un solo objetivo:<br/><span className="text-blue-300">hacerte crecer.</span></p>
          </div>
        </div>
      </div>
    </section>
  );
}

function BrandAiSection() {
  return <section className="bg-[#050b16] pb-24 text-white sm:pb-40"><div className="mx-auto max-w-[1280px] px-5 lg:px-8"><div data-brand-ai className="grid overflow-hidden rounded-[30px] border border-white/[0.08] bg-white/[0.025] shadow-[0_24px_80px_rgba(0,0,0,0.26)] lg:grid-cols-[0.85fr_1.15fr]"><div className="p-7 sm:p-12"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">Brand IA</p><h2 className="mt-5 text-4xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-5xl">Entiende tu marca antes de decidir qué hacer después.</h2><p className="mt-6 text-sm leading-7 text-slate-400">Lectura de presencia digital, posicionamiento, comunicación y oportunidades conectada con ORION, NOVA y ATLAS.</p><div className="mt-7 flex flex-wrap gap-2">{["Posicionamiento","Comunicación","Contenido","Oportunidades","Presencia digital"].map(item=><MiniChip key={item}>{item}</MiniChip>)}</div></div><div className="relative bg-[#07111f] p-7 text-white sm:p-10"><div className="grid gap-3 sm:grid-cols-2"><InsightTile icon="brand" label="Presencia digital" value="Lectura de canales"/><InsightTile icon="target" label="Posicionamiento" value="Diferenciadores"/><InsightTile icon="message" label="Comunicación" value="Mensajes y respuesta"/><InsightTile icon="growth" label="Oportunidades" value="Prioridades de growth"/></div><div className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-500/[0.08] p-5"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-300">Flujo conectado</p><p className="mt-3 text-sm font-semibold">ORION → NOVA → ATLAS</p></div></div></div></div></section>;
}

function SalesAiSection() {
  return <section className="bg-[#050b16] py-24 sm:py-40"><div className="mx-auto max-w-[1360px] px-5 lg:px-8"><div className="grid gap-8 lg:grid-cols-[0.42fr_0.58fr] lg:items-end"><div><SectionIntro eyebrow="Sales AI" title="Conversaciones que venden. Relaciones que duran." copy="Califica leads, responde y da seguimiento sin perder el toque humano."/><div className="mt-7"><SecondaryLink href={COMETA_CONTACT}>Ver Sales AI en acción <Icon name="arrow"/></SecondaryLink></div></div><p className="text-xs leading-6 text-slate-500 lg:text-right">WhatsApp, atención, calificación y seguimiento disponibles según configuración.</p></div><div data-sales-ai className="mt-12 grid overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#091423] shadow-[0_35px_100px_rgba(0,0,0,0.38)] lg:grid-cols-[1fr_0.72fr_0.78fr]"><div className="p-5 sm:p-7"><div className="flex items-center justify-between border-b border-white/[0.07] pb-4"><div className="flex items-center gap-2 text-sm font-bold"><Icon name="message"/> Chat comercial</div><span className="rounded-full bg-blue-500/10 px-2 py-1 text-[8px] font-bold uppercase text-blue-300">Demo</span></div><div className="mt-6 space-y-4"><ChatBubble label="Cliente" text="Hola, ¿tienen disponible este vestido en talla M?"/><ChatBubble label="Sales AI" text="Sí, lo tenemos disponible. ¿Quieres que te guarde uno?" outgoing/><ChatBubble label="Cliente" text="Sí, por favor."/><ChatBubble label="Sales AI" text="Listo. ¿Te comparto el link de pago?" outgoing/></div></div><aside className="border-t border-white/[0.07] bg-[#060d18] p-5 lg:border-l lg:border-t-0 sm:p-7"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">Pipeline · Demo</p>{[["Nuevos leads","24"],["En conversación","12"],["Calificados","8"],["Propuesta","5"],["Cerrados","3"]].map(([label,value])=><LeadRow key={label} label={label} value={value}/>) }<div className="mt-6 rounded-xl bg-emerald-400/10 p-3"><p className="text-[9px] text-emerald-300">Conversión</p><p className="mt-1 text-2xl font-bold text-emerald-200">12.5%</p></div></aside><aside className="border-t border-white/[0.07] p-5 lg:border-l lg:border-t-0 sm:p-7"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">Insights · Demo</p><InsightStat label="Mejor horario para responder" value="10:00 AM – 12:00 PM" icon="calendar"/><InsightStat label="Tiempo promedio de respuesta" value="28 segundos" icon="clock"/><InsightStat label="Probabilidad de cierre" value="78%" icon="target"/></aside></div></div></section>;
}

function AgencyTechSection() {
  const flow = [["Operación","Cometa POS","terminal"],["Inteligencia","Cometa OS","pulse"],["Estrategia","Cometa MKT","spark"],["Ejecución","Activación","automation"],["Crecimiento","Growth","growth"]] as const;
  return <section className="relative overflow-hidden bg-[#050b16] py-24 text-white sm:py-40"><div className="pointer-events-none absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-700/[0.09] blur-[150px]"/><div className="relative mx-auto max-w-[1320px] px-5 lg:px-8"><div className="mx-auto max-w-5xl text-center"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">Cometa MKT · Growth Partner</p><h2 className="mt-5 text-4xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-6xl">Tecnología que entiende tu negocio.<br/><span className="text-blue-400">Un equipo que sabe qué hacer con ella.</span></h2><p className="mx-auto mt-6 max-w-3xl text-base leading-7 text-slate-400">Cometa MKT conecta estrategia, creatividad, contenido, ventas y growth con la inteligencia de Cometa OS.</p></div><div data-agency-tech className="mt-16 grid gap-5 lg:grid-cols-[1fr_230px_1fr] lg:items-center"><MktTechPanel/><div className="relative flex min-h-60 flex-col items-center justify-center rounded-full border border-blue-400/25 bg-blue-500/[0.08] text-white shadow-[0_0_90px_rgba(29,78,216,0.2)]"><div className="absolute -top-3 rounded-full border border-white/[0.08] bg-[#0a1424] px-3 py-1 text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500">Tech + Strategy</div><CometaLogo/><div className="mt-5 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em]"><span className="text-cyan-300">Tech</span><span className="text-slate-600">+</span><span className="text-violet-300">Strategy</span><span className="text-slate-600">→</span><span className="text-emerald-300">Growth</span></div></div><MktPartnerPanel/></div><div data-cometa-value-flow className="relative mt-16 grid gap-8 sm:grid-cols-5 sm:gap-2"><div aria-hidden="true" className="absolute left-[8%] right-[8%] top-6 hidden h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent sm:block"/>{flow.map(([label,detail,icon],index)=><div key={label} className="relative text-center"><span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/20 bg-[#0b192b] text-blue-300 shadow-[0_0_30px_rgba(29,78,216,0.14)]"><Icon name={icon}/></span><p className="mt-4 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-300">{label}</p><p className="mt-1 text-[9px] text-slate-600">{detail}</p>{index<flow.length-1?<span className="absolute -right-2 top-5 hidden text-blue-500/50 sm:block"><Icon name="arrow"/></span>:null}</div>)}</div><p className="mx-auto mt-14 max-w-3xl text-center text-lg font-medium leading-8 text-slate-300">Software cuando quieres operar. <span className="text-blue-300">Inteligencia cuando quieres entender.</span> Cometa cuando quieres crecer.</p></div></section>;
}

function OsPricing() {
  return <section className="bg-[#f3f6fb] pb-24 pt-12 text-slate-950 sm:pb-40 sm:pt-16 lg:pt-24"><div className="mx-auto max-w-[1180px] px-5 lg:px-8"><div data-os-pricing className="relative overflow-hidden rounded-[30px] bg-slate-950 p-7 text-white shadow-[0_32px_100px_rgba(15,23,42,0.2)] sm:p-12"><div className="absolute right-[-10%] top-[-50%] h-96 w-96 rounded-full bg-blue-600/20 blur-[100px]"/><div className="relative grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300">Cometa OS</p><h2 className="mt-5 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">Desde $9,000 <span className="text-base font-medium tracking-normal text-slate-500">MXN / mes</span></h2><p className="mt-6 max-w-xl text-base leading-7 text-slate-400">Tecnología + inteligencia + estrategia + gestión de Cometa. No es una licencia SaaS aislada: es una solución construida alrededor de tu negocio.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><PrimaryLink href={COMETA_CONTACT}>Solicitar auditoría</PrimaryLink><SecondaryLink href={COMETA_CONTACT}>Solicitar demo</SecondaryLink></div></div><div className="grid grid-cols-2 gap-2">{["Estrategia","Brand IA","Agentes","Sales AI","Automatización","Growth","Contenido","Acompañamiento"].map(item=><div key={item} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-xs text-slate-300"><span className="text-blue-300"><Icon name="check"/></span>{item}</div>)}</div></div></div></div></section>;
}

function GrowthConnection() {
  const outcomes = [["Estrategia","spark"],["Ventas","users"],["Growth","chart"]] as const;
  return (
    <section className="relative overflow-hidden bg-[#050b16] py-24 sm:py-36">
      <div className="mx-auto max-w-[1180px] px-5 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <SectionIntro eyebrow="Cometa MKT · Advanced" title="Tu operación no termina en la caja." copy="Con Cometa OS, la información de tu negocio puede conectarse con estrategia, ventas, contenido y canales comerciales como WhatsApp y Meta." />
          <div data-growth-map className="relative rounded-[30px] border border-white/[0.08] bg-white/[0.025] p-6 sm:p-9">
            <div className="grid items-center gap-5 sm:grid-cols-[1fr_auto_1fr]">
              <SystemNode label="Cometa POS" detail="Operación" icon="terminal" />
              <span className="mx-auto rotate-90 text-blue-400 sm:rotate-0"><Icon name="arrow"/></span>
              <SystemNode label="Cometa OS" detail="Inteligencia" icon="pulse" featured />
            </div>
            <div className="mx-auto my-5 h-8 w-px bg-gradient-to-b from-blue-400 to-transparent" />
            <div className="grid grid-cols-3 gap-2">
              {outcomes.map(([label,icon]) => <div key={label} className="rounded-xl border border-white/[0.07] bg-[#091423] px-2 py-4 text-center"><span className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300"><Icon name={icon}/></span><p className="mt-2 text-[10px] font-semibold text-slate-300">{label}</p></div>)}
            </div>
            <div className="mt-5 flex items-center justify-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs text-slate-400"><Icon name="chat"/><span>WhatsApp / Meta</span><span className="text-slate-700">·</span><span>Canales comerciales</span></div>
            <p className="mt-4 text-center text-[10px] leading-5 text-slate-600">Integraciones y acompañamiento disponibles según configuración.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PathsSection() {
  return (
    <section className="bg-[#050b16] py-20 sm:py-24">
      <div className="mx-auto max-w-[1180px] px-5 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-2">
          <PathCard label="Cometa POS" status="Self-service · Disponible" title="Empieza por tu cuenta." text="Activa tu negocio, carga productos y comienza a operar sin contratar acompañamiento avanzado." action={<PrimaryLink href={POS_SIGNUP}>Probar POS gratis</PrimaryLink>} />
          <PathCard label="Cometa OS" status="Advanced · Con Cometa" title="Construye la siguiente capa." text="Cuando necesitas estrategia, automatización y crecimiento, Cometa trabaja contigo para conectar el sistema completo." action={<SecondaryLink href={COMETA_CONTACT}>Solicitar demo</SecondaryLink>} />
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = ["Crea tu cuenta", "Configura tu negocio", "Empieza a vender", "Convierte operaciones en informaci\u00f3n", "Activa Cometa OS cuando quieras crecer"];
  return (
    <section className="border-y border-white/[0.06] bg-[#07111f] py-20">
      <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
        <SectionIntro eyebrow="Cómo funciona" title="De cero a operando, sin complicaciones." />
        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step, index) => <li key={step} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"><span className="text-xs font-bold text-blue-300">{index + 1}</span><p className="mt-4 text-sm font-semibold leading-6">{step}</p></li>)}
        </ol>
      </div>
    </section>
  );
}

function IndustriesSection() {
  const industries = [
    ["Moda / Ropa", "Disponible", true, "Tallas, colores, variantes e inventario."],
    ["Tienda / Retail", "Disponible", true, "Productos, caja, clientes y fidelizaci\u00f3n."],
    ["Restaurante / Caf\u00e9", "Pr\u00f3ximamente", false, "Experiencia especializada en preparaci\u00f3n."],
    ["Servicios / Belleza", "Pr\u00f3ximamente", false, "Experiencia especializada en citas y servicio."],
  ];
  return (
    <section id="industrias" className="bg-[#050b16] py-24 text-white sm:py-36">
      <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
        <SectionIntro eyebrow="Industrias" title="Industrias disponibles" copy="Comenzamos con Retail y Moda. Las siguientes experiencias llegarán cuando estén listas para operar de verdad." />
        <div className="mt-11 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {industries.map(([name, status, available, text]) => (
            <article key={String(name)} className={`rounded-[22px] border p-6 transition motion-safe:hover:-translate-y-1 ${available ? "border-blue-400/15 bg-white/[0.035]" : "border-white/[0.06] bg-white/[0.018] text-slate-500"}`}>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${available ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{status}</span>
              <h3 className="mt-5 text-lg font-bold">{name}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CommercialSection() {
  return (
    <section className="bg-[#050b16] pb-20 text-white sm:pb-28">
      <div className="mx-auto max-w-[1280px] px-5 lg:px-8">
        <div className="grid gap-8 rounded-[28px] bg-slate-950 p-7 text-white sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div><Pill>Cometa OS · Advanced</Pill><h2 className="mt-5 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">¿Quieres saber qué debería hacer tu negocio después?</h2><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">Cometa puede analizar tu operación, presencia digital y oportunidades para construir una estrategia conectada con Cometa OS.</p></div>
          <SecondaryLink href={COMETA_CONTACT}>Solicitar auditoría</SecondaryLink>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-[#050b16] px-5 py-20 sm:py-32">
      <div className="relative mx-auto max-w-[1180px] overflow-hidden rounded-[32px] border border-blue-400/20 bg-[#091423] px-6 py-16 text-center shadow-[0_40px_120px_rgba(29,78,216,0.14)] sm:px-12 sm:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(29,78,216,0.38),transparent_55%),linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:auto,56px_56px,56px_56px]" />
        <div className="relative grid gap-10 text-left lg:grid-cols-[1.15fr_0.85fr] lg:items-end"><div><CometaLogo /><h2 className="mt-7 text-4xl font-semibold leading-[0.98] tracking-[-0.06em] sm:text-7xl">Un sistema.<br/>Infinitas posibilidades.<br/>Un solo objetivo:<br/><span className="text-blue-400">hacerte crecer.</span></h2><p className="mt-7 text-[10px] uppercase tracking-[0.16em] text-slate-600">Un sistema creado por Cometa MKT</p></div><div><div className="grid gap-3"><PrimaryLink href={POS_SIGNUP}>Probar Cometa POS gratis <Icon name="arrow"/></PrimaryLink><p className="text-center text-[10px] text-slate-500">15 días gratis · Sin tarjeta</p><SecondaryLink href={COMETA_CONTACT}>Solicitar demo de Cometa OS</SecondaryLink><p className="text-center text-[10px] text-slate-500">Descubre la capa avanzada</p></div></div></div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="bg-[#050b16]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-5 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div><div className="flex items-center gap-3"><CometaLogo compact /><span className="text-sm font-bold uppercase tracking-[0.16em]">Cometa OS</span></div><p className="mt-3 text-xs text-slate-600">Operación, inteligencia y crecimiento en un mismo ecosistema.</p></div>
        <nav aria-label="Navegaci\u00f3n del pie" className="flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-slate-400"><a href="#cometa-os" className="hover:text-white">Cometa OS</a><a href="#pos" className="hover:text-white">Cometa POS</a><Link href={LOGIN} className="hover:text-white">Iniciar sesión</Link><Link href={POS_SIGNUP} className="text-blue-300 hover:text-blue-200">Probar POS gratis</Link><a href={COMETA_CONTACT} className="hover:text-white">Contacto</a></nav>
      </div>
    </footer>
  );
}

function SectionIntro({ eyebrow, title, copy, dark = true }: { eyebrow: string; title: string; copy?: string; dark?: boolean }) {
  return <div className="max-w-3xl"><p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${dark ? "text-blue-300" : "text-blue-700"}`}>{eyebrow}</p><h2 className={`mt-4 text-4xl font-bold leading-[1.02] tracking-[-0.055em] sm:text-5xl ${dark ? "text-white" : "text-slate-950"}`}>{title}</h2>{copy ? <p className={`mt-5 max-w-2xl text-base leading-7 ${dark ? "text-slate-400" : "text-slate-600"}`}>{copy}</p> : null}</div>;
}

function PathCard({ label, status, title, text, action }: { label: string; status: string; title: string; text: string; action: ReactNode }) {
  return <article className="rounded-[26px] border border-white/[0.08] bg-white/[0.03] p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">{label}</p><span className="rounded-full bg-white/[0.05] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{status}</span></div><h3 className="mt-7 text-3xl font-bold tracking-[-0.04em]">{title}</h3><p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">{text}</p><div className="mt-7">{action}</div></article>;
}

function DemoMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-[#07101d] p-4"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold tracking-[-0.04em]">{value}</p><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div>;
}

function DemoBar({ label, value, width, warning = false, light = false }: { label: string; value: string; width: string; warning?: boolean; light?: boolean }) {
  return <div><div className={`flex justify-between text-[10px] ${light ? "text-slate-500" : "text-slate-400"}`}><span>{label}</span><span>{value}</span></div><div className={`mt-1.5 h-1 overflow-hidden rounded-full ${light ? "bg-slate-100" : "bg-white/[0.06]"}`}><div className={`h-full rounded-full ${warning ? "bg-amber-300" : "bg-blue-500"}`} style={{ width }} /></div></div>;
}

function RegisterMiniature() {
  return <div className="mt-8 grid grid-cols-[1fr_104px] gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3"><div className="grid grid-cols-2 gap-2">{["Classic Tee","Navy Hoodie","Indigo Jean","Basic Top"].map((item, index) => <div key={item} className="rounded-xl border border-slate-100 bg-white p-2"><div className={`h-8 rounded-lg ${index % 2 ? "bg-blue-100" : "bg-slate-100"}`}/><p className="mt-2 truncate text-[9px] font-semibold text-slate-500">{item}</p></div>)}</div><div className="rounded-xl bg-slate-950 p-3 text-white"><p className="text-[8px] uppercase tracking-wider text-slate-500">Total</p><p className="mt-2 text-lg font-bold">$1,240</p><div className="mt-8 rounded-lg bg-blue-600 py-2 text-center text-[9px] font-bold">Cobrar</div></div></div>;
}

function MiniChip({ children }: { children: ReactNode }) {
  return <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[9px] font-semibold text-slate-500">{children}</span>;
}

function Avatar({ label }: { label: string }) {
  return <span className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[8px] font-bold text-white">{label}</span>;
}

function MiniChart({ dark = false }: { dark?: boolean }) {
  return <div className={`mt-7 flex h-16 items-end gap-1.5 rounded-xl p-3 ${dark ? "bg-black/15" : "bg-slate-50"}`}>{[28,44,35,62,52,78,68,88].map((height,index) => <span key={index} className={`${dark ? "bg-blue-400/70" : "bg-blue-500/70"} flex-1 rounded-t-sm`} style={{height:`${height}%`}}/>)}</div>;
}

function MiniLineChart() {
  return <svg aria-hidden="true" viewBox="0 0 260 70" className="mt-3 h-16 w-full overflow-visible"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3b82f6" stopOpacity=".32"/><stop offset="1" stopColor="#3b82f6" stopOpacity="0"/></linearGradient></defs><path d="M0 58 C24 54 34 38 58 44 S92 56 112 35 S148 42 170 23 S206 34 226 14 S250 19 260 8 V70 H0Z" fill="url(#chart-fill)"/><path d="M0 58 C24 54 34 38 58 44 S92 56 112 35 S148 42 170 23 S206 34 226 14 S250 19 260 8" fill="none" stroke="#3b82f6" strokeWidth="2"/></svg>;
}

function FloatingPanel({ className, tone, label, icon, children }: { className: string; tone: "cyan" | "purple" | "green"; label: string; icon: string; children: ReactNode }) {
  const colors = tone === "cyan" ? "border-cyan-400/20 text-cyan-300" : tone === "green" ? "border-emerald-400/20 text-emerald-300" : "border-violet-400/20 text-violet-300";
  return <div className={`absolute z-20 hidden w-52 rounded-2xl border bg-[#0b1728]/95 p-4 shadow-[0_22px_65px_rgba(0,0,0,0.42)] backdrop-blur-xl motion-safe:transition-transform motion-safe:hover:-translate-y-1 xl:block ${colors} ${className}`}><div className="flex items-center gap-2"><Icon name={icon}/><span className="text-[8px] font-bold uppercase tracking-[0.14em]">{label}</span></div><div className="mt-3 text-white">{children}</div></div>;
}

function InsightStat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><span className="text-blue-300"><Icon name={icon}/></span><p className="mt-3 text-[9px] leading-4 text-slate-500">{label}</p><p className="mt-1 text-xs font-bold text-slate-200">{value}</p></div>;
}

function LayerPanel({ title, label, icon, items, featured = false }: { title: string; label: string; icon: string; items: string[]; featured?: boolean }) {
  return <article className={`rounded-[28px] border p-7 sm:p-9 ${featured ? "border-blue-400/20 bg-blue-500/[0.07]" : "border-white/[0.08] bg-white/[0.025]"}`}><div className="flex items-center justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-blue-500/10 text-blue-300"><Icon name={icon}/></span><span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span></div><h3 className="mt-7 text-3xl font-semibold tracking-[-0.045em]">{title}</h3><div className="mt-7 grid grid-cols-2 gap-2">{items.map(item=><div key={item} className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5 text-xs text-slate-400">{item}</div>)}</div></article>;
}

function InsightTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300"><Icon name={icon}/></span><p className="mt-4 text-xs font-bold">{label}</p><p className="mt-1 text-[10px] text-slate-500">{value}</p></div>;
}

function ChatBubble({ label, text, outgoing = false }: { label: string; text: string; outgoing?: boolean }) {
  return <div className={`max-w-[88%] rounded-2xl p-4 ${outgoing ? "ml-auto bg-blue-600 text-white" : "bg-white/[0.055] text-slate-200"}`}><p className={`text-[8px] font-bold uppercase tracking-[0.14em] ${outgoing ? "text-blue-200" : "text-slate-500"}`}>{label}</p><p className="mt-2 text-xs leading-5">{text}</p></div>;
}

function LeadRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="mt-5 flex items-center justify-between border-b border-white/[0.06] pb-3 text-xs"><span className="text-slate-500">{label}</span><span className={accent ? "font-bold text-emerald-300" : "font-semibold text-slate-200"}>{value}</span></div>;
}

function CapabilityPanel({ label, icon, items }: { label: string; icon: string; items: string[] }) {
  return <article className="rounded-[26px] border border-slate-200 bg-white p-7 shadow-[0_18px_55px_rgba(15,23,42,0.055)]"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Icon name={icon}/></span><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p></div><div className="mt-6 flex flex-wrap gap-2">{items.map(item=><span key={item} className="rounded-full bg-slate-100 px-3 py-2 text-[10px] font-semibold text-slate-600">{item}</span>)}</div></article>;
}

function DarkCapabilityPanel({ label, icon, items }: { label: string; icon: string; items: string[] }) {
  return <article className="rounded-[26px] border border-white/[0.08] bg-white/[0.028] p-7 shadow-[0_18px_55px_rgba(0,0,0,0.22)]"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300"><Icon name={icon}/></span><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p></div><div className="mt-6 flex flex-wrap gap-2">{items.map(item=><span key={item} className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[10px] font-semibold text-slate-400">{item}</span>)}</div></article>;
}

function MktTechPanel() {
  const modules = [["Cometa POS","terminal"],["Intelligence","pulse"],["Sales AI","message"],["Data","database"],["Automation","automation"]] as const;
  return <article className="rounded-[28px] border border-cyan-400/15 bg-white/[0.028] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.25)] sm:p-8"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Tech</p><p className="mt-2 text-xs text-slate-500">El sistema registra, conecta y detecta.</p></div><span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-cyan-400/10 text-cyan-300"><Icon name="automation"/></span></div><div className="mt-7 grid grid-cols-2 gap-2">{modules.map(([name,icon],index)=><div key={name} className={`${index===0 ? "col-span-2" : ""} rounded-xl border border-white/[0.06] bg-[#091423] p-3`}><span className="text-cyan-300"><Icon name={icon}/></span><p className="mt-2 text-[10px] font-semibold text-slate-300">{name}</p>{index===0?<div className="mt-3 flex h-7 items-end gap-1">{[35,58,44,72,63,88,76].map((height,i)=><span key={i} className="flex-1 rounded-t-sm bg-cyan-400/40" style={{height:`${height}%`}}/>)}</div>:null}</div>)}</div></article>;
}

function MktPartnerPanel() {
  const capabilities = [["Estrategia","spark"],["Branding","brand"],["Contenido","calendar"],["Meta Ads","target"],["Ventas","users"],["Campañas","growth"],["Optimización","chart"]] as const;
  return <article className="rounded-[28px] border border-violet-400/15 bg-white/[0.028] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.25)] sm:p-8"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">Growth Partner</p><p className="mt-2 text-xs text-slate-500">El equipo interpreta, decide y ejecuta.</p></div><span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-violet-400/10 text-violet-300"><Icon name="users"/></span></div><div className="mt-7 flex flex-wrap gap-2">{capabilities.map(([name,icon])=><span key={name} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#091423] px-3 py-2.5 text-[10px] font-semibold text-slate-300"><span className="text-violet-300"><Icon name={icon}/></span>{name}</span>)}</div><div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.05] p-3 text-[10px] text-slate-400"><Icon name="chat"/><span>Meta Ads · WhatsApp</span></div><p className="mt-3 text-[9px] leading-5 text-slate-600">Canales e integraciones según estrategia y configuración.</p></article>;
}

function SystemNode({ label, detail, icon, featured = false }: { label: string; detail: string; icon: string; featured?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${featured ? "border-blue-400/25 bg-blue-500/[0.09]" : "border-white/[0.07] bg-[#091423]"}`}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300"><Icon name={icon}/></span><p className="mt-4 text-sm font-bold">{label}</p><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div>;
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full border border-blue-400/20 bg-blue-400/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200">{children}</span>;
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-[#1D4ED8] px-6 text-sm font-bold text-white shadow-[0_14px_35px_rgba(29,78,216,0.2)] transition motion-safe:hover:-translate-y-0.5 hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">{children}</Link>;
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} className="inline-flex min-h-12 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.035] px-6 text-sm font-semibold text-white transition motion-safe:hover:-translate-y-0.5 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">{children}</a>;
}

function CometaLogo({ compact = false }: { compact?: boolean }) {
  return <Image src="/logo.png" alt="Cometa" width={compact ? 92 : 128} height={compact ? 38 : 52} priority={compact} className={`${compact ? "h-7 w-auto" : "mx-auto h-10 w-auto"} object-contain`} />;
}

function Icon({ name }: { name: string }) {
  if (name === "arrow") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M5 12h14M14 7l5 5-5 5" /></svg>;
  if (name === "menu") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
  if (name === "users") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><circle cx="9" cy="8" r="3" /><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M16 5.5a3 3 0 0 1 0 5.5M17 14c2.4.4 4 2.1 4 4.5" /></svg>;
  if (name === "box") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z" /><path d="m4 7 8 4 8-4M12 11v10" /></svg>;
  if (name === "cart") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M3 4h2l2 11h11l2-7H6" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></svg>;
  if (name === "pulse") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M3 12h4l2-6 4 12 2-6h6" /></svg>;
  if (name === "terminal") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 8h10M7 12h4M15 12h2M7 16h10"/></svg>;
  if (name === "wallet") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M4 7a3 3 0 0 1 3-3h11v16H6a2 2 0 0 1-2-2V7Z"/><path d="M14 11h7v5h-7a2.5 2.5 0 0 1 0-5Z"/></svg>;
  if (name === "inventory") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M4 8h16v12H4zM7 4h10l2 4H5l2-4Z"/><path d="M9 12h6"/></svg>;
  if (name === "tag") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M20 13 13 20l-9-9V4h7l9 9Z"/><circle cx="8" cy="8" r="1"/></svg>;
  if (name === "heart") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/></svg>;
  if (name === "chart") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>;
  if (name === "spark") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></svg>;
  if (name === "chat") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M20 15a4 4 0 0 1-4 4H9l-5 3v-7a4 4 0 0 1-1-2.7V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v7Z"/><path d="M8 10h8M8 14h5"/></svg>;
  if (name === "message") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M21 12a8 8 0 0 1-9 8 10 10 0 0 1-4-.8L3 21l1.7-4A8 8 0 1 1 21 12Z"/><path d="M8 10h8M8 14h5"/></svg>;
  if (name === "growth") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m4 17 5-5 4 3 7-8"/><path d="M15 7h5v5"/></svg>;
  if (name === "automation") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a2 2 0 0 0 .4 2.2l.1.1-2.6 2.6-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8V21h-3.6v-.2A2 2 0 0 0 9 19a2 2 0 0 0-2.2.4l-.1.1-2.6-2.6.1-.1A2 2 0 0 0 4.6 15a2 2 0 0 0-1.8-1.2H3v-3.6h.2A2 2 0 0 0 5 9a2 2 0 0 0-.4-2.2l-.1-.1 2.6-2.6.1.1A2 2 0 0 0 9 4.6a2 2 0 0 0 1.2-1.8V3h3.6v.2A2 2 0 0 0 15 5a2 2 0 0 0 2.2-.4l.1-.1 2.6 2.6-.1.1A2 2 0 0 0 19.4 9a2 2 0 0 0 1.8 1.2h.2v3.6h-.2A2 2 0 0 0 19.4 15Z"/></svg>;
  if (name === "brand") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M12 3 4 7v5c0 4.5 3.2 7.5 8 9 4.8-1.5 8-4.5 8-9V7l-8-4Z"/><path d="m9 12 2 2 4-5"/></svg>;
  if (name === "target") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M15 9l5-5M16 4h4v4"/></svg>;
  if (name === "database") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></svg>;
  if (name === "layers") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
  if (name === "calendar") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>;
  if (name === "card") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>;
  if (name === "store") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M4 10v10h16V10M3 10l2-6h14l2 6"/><path d="M8 20v-6h8v6M3 10c0 2 3 3 4.5 1 1.5 2 4.5 1 4.5-1 0 2 3 3 4.5 1 1.5 2 4.5 1 4.5-1"/></svg>;
  if (name === "settings") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/></svg>;
  if (name === "clock") return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>;
}
