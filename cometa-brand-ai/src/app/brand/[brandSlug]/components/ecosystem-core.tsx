type OsStatus = "active" | "paused" | "inactive" | "not_configured";
type PosState = "active" | "preparation" | "unavailable";
type SystemTone = "active" | "paused" | "inactive" | "available" | "preparation";

type ProductNode = {
  name: "Cometa OS" | "Cometa POS";
  descriptor: string;
  status: string;
  tone: SystemTone;
};

export function EcosystemCore({
  brandName,
  osStatus,
  posState,
}: {
  brandName: string;
  osStatus: OsStatus;
  posState: PosState;
}) {
  const osNode: ProductNode = {
    name: "Cometa OS",
    descriptor: "El cerebro estratégico",
    status: getOsLabel(osStatus),
    tone: getOsTone(osStatus),
  };
  const posNode: ProductNode = {
    name: "Cometa POS",
    descriptor: "El motor operativo",
    status: getPosLabel(posState),
    tone: getPosTone(posState),
  };

  return (
    <section
      aria-label="Ecosistema de productos Cometa"
      className="relative mt-7 overflow-hidden rounded-[32px] border border-cyan-200/15 bg-[linear-gradient(145deg,rgba(10,21,42,0.98),rgba(4,12,28,0.97)_54%,rgba(6,29,47,0.9))] px-4 py-6 shadow-[0_30px_100px_rgba(0,0,0,0.34)] sm:px-7 sm:py-7"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(34,211,238,0.13),transparent_24%),radial-gradient(circle_at_14%_86%,rgba(37,99,235,0.14),transparent_32%),radial-gradient(circle_at_88%_18%,rgba(20,184,166,0.09),transparent_26%)]" />
      <div className="pointer-events-none absolute inset-x-8 top-20 h-px bg-gradient-to-r from-transparent via-cyan-200/20 to-transparent" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.04)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Ecosistema Cometa</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white sm:text-2xl">Tu empresa funciona como un sistema.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            Cometa Core conecta estrategia, inteligencia y operación en una sola plataforma.
          </p>
        </header>

        <DesktopEcosystem brandName={brandName} osNode={osNode} posNode={posNode} />
        <MobileEcosystem brandName={brandName} osNode={osNode} posNode={posNode} />

        <p className="sr-only">
          {brandName} está conectado a Cometa Core. Cometa OS está {osNode.status.toLowerCase()} y Cometa POS está {posNode.status.toLowerCase()}.
        </p>
      </div>
    </section>
  );
}

function DesktopEcosystem({
  brandName,
  osNode,
  posNode,
}: {
  brandName: string;
  osNode: ProductNode;
  posNode: ProductNode;
}) {
  return (
    <div className="relative mx-auto mt-5 hidden min-h-[440px] max-w-5xl md:block lg:min-h-[475px]">
      <div className="absolute left-1/2 top-0 z-10 w-[min(43%,250px)] -translate-x-1/2">
        <BrandNode brandName={brandName} />
      </div>

      <span className="absolute left-1/2 top-[74px] h-[82px] w-px -translate-x-1/2 bg-gradient-to-b from-cyan-200/70 via-cyan-300/30 to-transparent" aria-hidden="true" />
      <span className="absolute left-1/2 top-[118px] h-2 w-2 -translate-x-1/2 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(103,232,249,0.9)] motion-reduce:animate-none animate-pulse" aria-hidden="true" />

      <CoreOrb />

      <Connection direction="left" tone={osNode.tone} />
      <Connection direction="right" tone={posNode.tone} />

      <div className="absolute bottom-3 left-[5%] z-10 w-[min(38%,255px)] lg:left-[8%]">
        <ProductNodeSurface node={osNode} align="left" />
      </div>
      <div className="absolute bottom-3 right-[5%] z-10 w-[min(38%,255px)] lg:right-[8%]">
        <ProductNodeSurface node={posNode} align="right" />
      </div>
    </div>
  );
}

function MobileEcosystem({
  brandName,
  osNode,
  posNode,
}: {
  brandName: string;
  osNode: ProductNode;
  posNode: ProductNode;
}) {
  return (
    <div className="mx-auto mt-7 flex max-w-sm flex-col items-center md:hidden">
      <BrandNode brandName={brandName} />
      <FlowConnection tone="active" />
      <CoreOrb compact />
      <FlowConnection tone={osNode.tone} />
      <ProductNodeSurface node={osNode} />
      <FlowConnection tone={posNode.tone} />
      <ProductNodeSurface node={posNode} />
    </div>
  );
}

function BrandNode({ brandName }: { brandName: string }) {
  return (
    <div className="rounded-full border border-white/12 bg-slate-950/75 px-5 py-3 text-center shadow-[0_12px_35px_rgba(0,0,0,0.25)] backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Tu empresa</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{brandName}</p>
    </div>
  );
}

function CoreOrb({ compact = false }: { compact?: boolean }) {
  const size = compact ? "h-40 w-40" : "h-48 w-48 lg:h-52 lg:w-52";

  return (
    <div className={`${compact ? "relative left-auto top-auto translate-x-0" : "absolute left-1/2 top-[122px] -translate-x-1/2"} z-20 ${size}`}>
      <div className="absolute -inset-7 rounded-full bg-cyan-300/10 blur-3xl motion-reduce:animate-none animate-[pulse_7s_ease-in-out_infinite]" />
      <div className="absolute -inset-3 rounded-full border border-cyan-200/20 motion-reduce:animate-none animate-[spin_24s_linear_infinite]" />
      <div className="absolute inset-0 rounded-full border border-dashed border-blue-200/20 motion-reduce:animate-none animate-[spin_34s_linear_infinite_reverse]" />
      <div className="absolute inset-[13%] rounded-full border border-cyan-100/15" />
      <div className="absolute inset-[20%] overflow-hidden rounded-full border border-cyan-100/35 bg-[radial-gradient(circle_at_34%_27%,rgba(207,250,254,0.98),rgba(34,211,238,0.8)_21%,rgba(37,99,235,0.75)_56%,rgba(8,20,48,0.97)_100%)] shadow-[inset_0_1px_20px_rgba(255,255,255,0.36),0_0_55px_rgba(34,211,238,0.34)]">
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_64%_70%,transparent_0%,rgba(5,12,31,0.5)_75%)]" />
        <span className="absolute left-[23%] top-[18%] h-8 w-12 rotate-[-24deg] rounded-full bg-white/45 blur-md" />
        <span className="absolute inset-[12%] rounded-full border border-white/15" />
        <div className="relative flex h-full flex-col items-center justify-center text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-50">Cometa Core</p>
          <p className="mt-1 text-[10px] font-medium text-cyan-100/80">Núcleo empresarial</p>
        </div>
      </div>
      <span className="absolute left-[7%] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-cyan-100 shadow-[0_0_12px_rgba(207,250,254,0.9)]" />
      <span className="absolute right-[5%] top-[34%] h-2 w-2 rounded-full bg-blue-200/80 shadow-[0_0_14px_rgba(147,197,253,0.82)]" />
    </div>
  );
}

function Connection({
  direction,
  tone,
}: {
  direction: "left" | "right";
  tone: SystemTone;
}) {
  const isLeft = direction === "left";
  const className = getConnectionClass(tone);

  return (
    <div
      className={`absolute top-[318px] z-0 h-px w-[29%] origin-center ${isLeft ? "left-[20%] -rotate-[24deg]" : "right-[20%] rotate-[24deg]"} ${className}`}
      aria-hidden="true"
    >
      {tone === "active" ? (
        <span className={`absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-cyan-100 shadow-[0_0_16px_rgba(103,232,249,0.9)] motion-reduce:animate-none animate-[pulse_3.8s_ease-in-out_infinite] ${isLeft ? "left-[38%]" : "right-[38%]"}`} />
      ) : null}
    </div>
  );
}

function FlowConnection({ tone }: { tone: SystemTone }) {
  return (
    <span className={`h-9 w-px ${getFlowConnectionClass(tone)}`} aria-hidden="true" />
  );
}

function ProductNodeSurface({
  node,
  align,
}: {
  node: ProductNode;
  align?: "left" | "right";
}) {
  const visual = getNodeVisual(node.tone);

  return (
    <article className={`group relative overflow-hidden rounded-[26px] border px-4 py-4 shadow-[0_16px_45px_rgba(0,0,0,0.2)] transition duration-300 hover:-translate-y-1 ${visual.surface} ${align === "right" ? "text-right" : "text-left"}`}>
      <div className={`pointer-events-none absolute -right-8 -top-9 h-24 w-24 rounded-full blur-2xl transition duration-500 group-hover:scale-125 ${visual.haze}`} />
      <div className={`relative flex items-start gap-3 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-[10px] font-black tracking-[0.08em] ${visual.icon}`} aria-hidden="true">
          {node.name === "Cometa OS" ? "OS" : "POS"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-400">{node.name}</p>
          <p className="mt-1 text-sm font-semibold text-white">{node.descriptor}</p>
          <p className={`mt-3 inline-flex items-center gap-2 text-xs font-medium ${visual.status}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${visual.dot}`} aria-hidden="true" />
            {node.status}
          </p>
        </div>
      </div>
    </article>
  );
}

function getNodeVisual(tone: SystemTone) {
  if (tone === "active") {
    return {
      surface: "border-cyan-200/25 bg-cyan-300/[0.07] hover:border-cyan-200/45",
      haze: "bg-cyan-300/20",
      icon: "border-cyan-200/30 bg-cyan-200/10 text-cyan-100",
      status: "text-cyan-100",
      dot: "bg-cyan-200 shadow-[0_0_9px_rgba(103,232,249,0.9)]",
    };
  }
  if (tone === "paused") {
    return {
      surface: "border-amber-200/20 bg-amber-200/[0.045] hover:border-amber-200/35",
      haze: "bg-amber-200/10",
      icon: "border-amber-200/25 bg-amber-200/[0.08] text-amber-100",
      status: "text-amber-100",
      dot: "bg-amber-200",
    };
  }
  if (tone === "preparation" || tone === "available") {
    return {
      surface: "border-blue-200/16 bg-blue-200/[0.035] hover:border-blue-200/30",
      haze: "bg-blue-300/10",
      icon: "border-blue-200/20 bg-blue-200/[0.06] text-blue-100",
      status: "text-blue-100",
      dot: "bg-blue-200/75",
    };
  }
  return {
    surface: "border-slate-300/15 bg-white/[0.025] hover:border-slate-200/28",
    haze: "bg-slate-200/5",
    icon: "border-slate-200/15 bg-white/[0.035] text-slate-200",
    status: "text-slate-300",
    dot: "bg-slate-400",
  };
}

function getConnectionClass(tone: SystemTone) {
  if (tone === "active") return "bg-gradient-to-r from-cyan-300/10 via-cyan-200/70 to-cyan-100/10 shadow-[0_0_16px_rgba(34,211,238,0.28)]";
  if (tone === "paused") return "bg-gradient-to-r from-transparent via-amber-200/35 to-transparent";
  if (tone === "preparation" || tone === "available") return "bg-gradient-to-r from-transparent via-blue-200/25 to-transparent";
  return "bg-gradient-to-r from-transparent via-slate-300/18 to-transparent";
}

function getFlowConnectionClass(tone: SystemTone) {
  if (tone === "active") return "bg-gradient-to-b from-cyan-100/70 via-cyan-300/45 to-transparent shadow-[0_0_12px_rgba(34,211,238,0.2)]";
  if (tone === "paused") return "bg-gradient-to-b from-amber-100/40 to-transparent";
  if (tone === "preparation" || tone === "available") return "bg-gradient-to-b from-blue-100/30 to-transparent";
  return "bg-gradient-to-b from-slate-200/25 to-transparent";
}

function getOsLabel(status: OsStatus) {
  if (status === "active") return "Activo";
  if (status === "paused") return "Pausado";
  if (status === "inactive") return "No activo";
  return "Disponible";
}

function getOsTone(status: OsStatus): SystemTone {
  if (status === "active") return "active";
  if (status === "paused") return "paused";
  if (status === "inactive") return "inactive";
  return "available";
}

function getPosLabel(state: PosState) {
  if (state === "active") return "Activo";
  if (state === "preparation") return "En preparación";
  return "No disponible";
}

function getPosTone(state: PosState): SystemTone {
  if (state === "active") return "active";
  if (state === "preparation") return "preparation";
  return "inactive";
}
