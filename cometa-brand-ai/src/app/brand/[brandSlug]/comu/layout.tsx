import Link from "next/link";
import type { ReactNode } from "react";
import SellerNav from "./seller-nav";

export default async function BrandComuLayout({ children, params }: { children: ReactNode; params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params;
  const base = `/brand/${encodeURIComponent(brandSlug)}/comu`;
  return <div className="min-h-screen bg-[#050907] text-white"><header className="border-b border-white/[.08] bg-[#07100d]/90 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-8 lg:px-10"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><Link href={base} className="text-xs font-black uppercase tracking-[.22em] text-emerald-300">COMETA · COMU</Link><p className="mt-2 text-2xl font-black tracking-[-.04em] text-white">Centro de vendedor</p></div><div className="flex flex-wrap items-center gap-2"><Link href="/workspace" className="rounded-xl border border-white/10 px-3.5 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[.06] hover:text-white">Volver a Workspace</Link><Link href={`/brand/${encodeURIComponent(brandSlug)}/pos`} className="rounded-xl bg-emerald-300 px-3.5 py-2.5 text-sm font-black text-[#06100b] shadow-[0_0_24px_rgba(110,255,187,.16)] transition hover:bg-emerald-200">Ir a COMETA POS</Link></div></div><SellerNav brandSlug={brandSlug} /></div></header><main className="mx-auto min-h-[calc(100vh-9rem)] max-w-7xl px-4 py-8 sm:px-8 lg:px-10">{children}</main></div>;
}
