import Link from "next/link";

export function BrandCommandHeader({
  brandName,
  userEmail,
}: {
  brandName: string;
  userEmail: string | null;
}) {
  const initial = getInitial(userEmail);

  return (
    <header className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08] text-sm font-black text-cyan-100 shadow-[0_0_38px_rgba(34,211,238,0.12)]">
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.28),transparent_27%)]" />
          <span className="relative">C</span>
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.02em] text-white">{brandName}</p>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.17em] text-cyan-200">Cometa Command Center</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="flex min-h-10 max-w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-400">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-cyan-100" aria-hidden="true">
            {initial}
          </span>
          <span className="truncate">{userEmail || "Sesión Cometa"}</span>
        </span>
        <Link
          href="/workspace"
          className="inline-flex min-h-10 items-center rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.08] hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300"
        >
          Cambiar empresa
        </Link>
      </div>
    </header>
  );
}

function getInitial(email: string | null) {
  const firstCharacter = email?.trim().charAt(0).toUpperCase();
  return firstCharacter || "C";
}
