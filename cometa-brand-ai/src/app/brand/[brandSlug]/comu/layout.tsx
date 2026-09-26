import Link from "next/link";
import type { ReactNode } from "react";

export default async function BrandComuLayout({ children, params }: { children: ReactNode; params: Promise<{ brandSlug: string }> }) {
  const { brandSlug } = await params;
  const base = `/brand/${encodeURIComponent(brandSlug)}/comu`;
  const links = [["Resumen", base], ["Pedidos", `${base}/orders`], ["Mi tienda", `${base}/store`], ["Productos", `${base}/products`], ["Mayoreo", `${base}/wholesale`], ["Envíos", `${base}/shipping`], ["Configuración", `${base}/settings`]];
  return <div className="min-h-screen bg-[#07100d] text-white"><header className="border-b border-white/10 bg-[#0b1712]/95"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10"><div><Link href={base} className="text-xs font-black uppercase tracking-[.22em] text-emerald-300">COMETA · COMU</Link><p className="mt-2 text-2xl font-black tracking-[-.04em]">Centro de vendedor</p></div><nav aria-label="Navegación de vendedor" className="flex gap-2 overflow-x-auto pb-1 text-sm font-semibold text-slate-300">{links.map(([label, href], index) => <Link key={href} href={href} className={`whitespace-nowrap rounded-full px-4 py-2 ${index === 0 ? "bg-white/10 text-white" : "hover:bg-white/10 hover:text-white"}`}>{label}</Link>)}</nav></div></header><main className="mx-auto min-h-[calc(100vh-8rem)] max-w-7xl px-4 py-7 sm:px-8 lg:px-10">{children}</main></div>;
}
