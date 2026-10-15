"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SellerNav({ brandSlug }: { brandSlug: string }) {
  const base = `/brand/${encodeURIComponent(brandSlug)}/comu`;
  const links = [["Resumen", base], ["Pedidos", `${base}/orders`], ["Mi tienda", `${base}/store`], ["Productos", `${base}/products`], ["Mayoreo", `${base}/wholesale`], ["Envíos", `${base}/shipping`], ["Configuración", `${base}/settings`]];
  const pathname = usePathname();
  return <nav aria-label="Navegación de vendedor" className="flex gap-1 overflow-x-auto pb-1 text-sm font-semibold text-slate-400">{links.map(([label, href]) => { const active = pathname === href || (href !== base && pathname.startsWith(`${href}/`)); return <Link key={href} href={href} className={`whitespace-nowrap rounded-xl px-3.5 py-2.5 transition ${active ? "border border-emerald-300/30 bg-emerald-300/10 text-emerald-100 shadow-[0_0_24px_rgba(110,255,187,.08)]" : "hover:bg-white/[.06] hover:text-white"}`}>{label}</Link>; })}</nav>;
}
