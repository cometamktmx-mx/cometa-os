import Link from "next/link";

export type ProductStatusTone =
  | "active"
  | "paused"
  | "inactive"
  | "available"
  | "preparation";

export type ProductCardAction = {
  label: string;
  href: string;
  internal?: boolean;
};

export function ProductCard({
  product,
  eyebrow,
  title,
  description,
  status,
  statusTone,
  primaryAction,
  secondaryAction,
  unavailableCopy,
  internalNote,
}: {
  product: "os" | "pos";
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  statusTone: ProductStatusTone;
  primaryAction?: ProductCardAction;
  secondaryAction?: ProductCardAction;
  unavailableCopy?: string;
  internalNote?: string;
}) {
  const isOs = product === "os";
  const statusClass = getStatusClass(statusTone);

  return (
    <article
      className={`group relative overflow-hidden rounded-[28px] border p-5 shadow-[0_22px_70px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-0.5 sm:p-6 ${
        isOs
          ? "border-cyan-300/20 bg-[linear-gradient(135deg,rgba(8,47,73,0.52),rgba(8,18,38,0.8)_62%,rgba(20,83,122,0.28))] hover:border-cyan-300/40"
          : "border-white/10 bg-[linear-gradient(145deg,rgba(30,41,59,0.65),rgba(9,15,29,0.86))] hover:border-blue-300/25"
      }`}
    >
      <div className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl transition duration-500 group-hover:scale-110 ${isOs ? "bg-cyan-300/15" : "bg-blue-400/10"}`} />
      <div className="relative flex h-full min-h-64 flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl border text-xs font-black ${isOs ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-blue-300/20 bg-blue-300/[0.08] text-blue-100"}`} aria-hidden="true">
              {isOs ? "OS" : "POS"}
            </span>
            <p className={`text-xs font-semibold tracking-[0.19em] ${isOs ? "text-cyan-200" : "text-blue-200"}`}>{eyebrow}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass}`}>{status}</span>
        </div>

        <h2 className="mt-6 max-w-md text-2xl font-semibold tracking-[-0.045em] text-white sm:text-[28px]">{title}</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">{description}</p>

        <div className="mt-auto pt-7">
          {unavailableCopy ? <p className="max-w-lg text-sm leading-6 text-slate-400">{unavailableCopy}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {primaryAction ? <ProductAction action={primaryAction} primary /> : null}
            {secondaryAction ? <ProductAction action={secondaryAction} /> : null}
          </div>
          {secondaryAction?.internal ? (
            <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Acceso interno</p>
          ) : null}
          {internalNote ? <p className="mt-2 text-xs leading-5 text-amber-100/75">{internalNote}</p> : null}
        </div>
      </div>
    </article>
  );
}

function ProductAction({ action, primary = false }: { action: ProductCardAction; primary?: boolean }) {
  return (
    <Link
      href={action.href}
      className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-[#071225] ${
        primary
          ? "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
          : "border border-white/12 bg-white/[0.04] text-slate-200 hover:border-cyan-300/30 hover:bg-cyan-300/[0.08] hover:text-cyan-100"
      }`}
    >
      {action.label}
    </Link>
  );
}

function getStatusClass(tone: ProductStatusTone) {
  if (tone === "active") return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
  if (tone === "paused") return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  if (tone === "inactive") return "border-slate-400/25 bg-slate-400/10 text-slate-300";
  if (tone === "available") return "border-blue-300/25 bg-blue-300/10 text-blue-100";
  return "border-white/12 bg-white/[0.05] text-slate-300";
}
