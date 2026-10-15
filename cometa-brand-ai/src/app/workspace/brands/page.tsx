"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceShell } from "../components/workspace-shell";

type Brand = { id: string; slug: string; name: string; status: string; os: { status: string }; pos: { state: string; lifecycleStatus: string | null } };
const statusLabel = (value: string) => ({ active: "Activo", paused: "Pausado", inactive: "Inactivo", not_configured: "No configurado", preparation: "Configuración pendiente", unavailable: "Sin POS" } as Record<string, string>)[value] || value;

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/brands", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || body?.message || "No se pudieron cargar las marcas");
      if (active) setBrands(body.brands || []);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las marcas");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => brands.filter((brand) => {
    const matches = `${brand.name} ${brand.slug}`.toLowerCase().includes(query.toLowerCase());
    const filtered = filter === "os" ? brand.os.status === "active" : filter === "pos" ? brand.pos.state === "active" : filter === "no-os" ? brand.os.status !== "active" : filter === "no-pos" ? brand.pos.state !== "active" : true;
    return matches && filtered;
  }), [brands, query, filter]);

  return <WorkspaceShell><div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm text-cyan-300">ADMINISTRACIÓN</p><h1 className="mt-2 text-3xl font-semibold text-white">Marcas</h1><p className="mt-2 text-sm text-slate-400">Administra todas las empresas dentro del ecosistema Cometa.</p></div><Link href="/workspace/brands/new" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">+ Nueva marca</Link></div><div className="mb-5 flex flex-col gap-3 lg:flex-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o slug..." className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50" /><div className="flex flex-wrap gap-2">{[["all", "Todas"], ["os", "OS activo"], ["pos", "POS activo"], ["no-os", "Sin OS"], ["no-pos", "Sin POS"]].map(([value, text]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-xl border px-3 py-2 text-xs ${filter === value ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:text-white"}`}>{text}</button>)}</div></div>{error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-5 text-sm text-red-200">{error}</div> : loading ? <div className="h-48 animate-pulse rounded-2xl border border-white/[.08] bg-white/[.03]" /> : <div className="overflow-hidden rounded-2xl border border-white/[.08] bg-[#0c1a2c]"><div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-4 border-b border-white/[.07] px-5 py-3 text-[10px] uppercase tracking-[.18em] text-slate-600 md:grid"><span>Marca</span><span>Estado</span><span>Cometa OS</span><span>Cometa POS</span><span /></div>{visible.length ? visible.map((brand) => <Link key={brand.slug} href={`/workspace/brands/${brand.slug}`} className="grid gap-3 border-b border-white/[.06] px-5 py-4 transition last:border-0 hover:bg-white/[.04] md:grid-cols-[1.5fr_1fr_1fr_1fr_auto] md:items-center"><div><p className="font-medium text-white">{brand.name}</p><p className="mt-1 text-xs text-slate-500">{brand.slug}</p></div><p className="text-xs text-slate-300">● {statusLabel(brand.status)}</p><p className="text-xs text-cyan-200">● {statusLabel(brand.os.status)}</p><p className="text-xs text-violet-200">● {statusLabel(brand.pos.state)}</p><span className="text-sm text-cyan-300">Abrir →</span></Link>) : <div className="p-12 text-center text-sm text-slate-400">No hay marcas que coincidan con tu búsqueda.</div>}</div>}</WorkspaceShell>;
}
