"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { WorkspaceShell } from "../../components/workspace-shell";

function suggestSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/&/g, " y ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function NewAdminBrandPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [enableOs, setEnableOs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(suggestSlug(value));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/brands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, slug, status, enableOs }),
      });
      const body = await response.json() as { error?: string; destination?: string; brand?: { slug?: string } };
      if (!response.ok) throw new Error(body.error || "No se pudo crear la marca.");
      const destination = body.destination || (body.brand?.slug ? `/workspace/brands/${body.brand.slug}` : "");
      if (!destination) throw new Error("La marca se creó, pero no se recibió un destino válido.");
      router.push(destination);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la marca.");
      setBusy(false);
    }
  }

  return <WorkspaceShell><div className="mx-auto max-w-3xl"><Link href="/workspace/brands" className="text-sm text-cyan-300 hover:text-cyan-200">← Volver a marcas</Link><div className="mt-6"><p className="text-xs uppercase tracking-[.22em] text-cyan-300">ADMINISTRACIÓN</p><h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Nueva marca</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Crea la identidad canónica de la marca y asigna el acceso administrativo inicial. Cometa POS no se inicializa desde este flujo.</p></div><form onSubmit={submit} className="mt-8 space-y-6 rounded-2xl border border-white/[.08] bg-[#0c1a2c] p-5 sm:p-7"><div><label htmlFor="brand-name" className="text-sm font-medium text-slate-200">Nombre de marca</label><input id="brand-name" required maxLength={120} value={name} onChange={(event) => updateName(event.target.value)} placeholder="Ej. Panadería Central" className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50" /></div><div><label htmlFor="brand-slug" className="text-sm font-medium text-slate-200">Slug</label><input id="brand-slug" required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value.toLowerCase()); }} placeholder="panaderia-central" className="mt-2 w-full rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 font-mono text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50" /><p className="mt-2 text-xs text-slate-500">Identificador permanente para las rutas de la marca. Usa minúsculas, números y guiones.</p></div><div className="grid gap-4 sm:grid-cols-2"><label className="rounded-xl border border-white/10 bg-white/[.03] p-4"><span className="text-sm font-medium text-slate-200">Estado inicial</span><select value={status} onChange={(event) => setStatus(event.target.value === "inactive" ? "inactive" : "active")} className="mt-3 w-full rounded-lg border border-white/10 bg-[#081525] px-3 py-2 text-sm text-white outline-none"><option value="active">Activa</option><option value="inactive">Inactiva</option></select></label><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[.03] p-4"><input type="checkbox" checked={enableOs} onChange={(event) => setEnableOs(event.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" /><span><span className="block text-sm font-medium text-slate-200">Habilitar Cometa OS</span><span className="mt-1 block text-xs leading-5 text-slate-500">Crea acceso OS activo. No habilita ni configura POS.</span></span></label></div>{error && <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}<div className="flex flex-col-reverse gap-3 border-t border-white/[.08] pt-6 sm:flex-row sm:justify-end"><Link href="/workspace/brands" className="rounded-xl border border-white/10 px-4 py-2.5 text-center text-sm text-slate-300 hover:text-white">Cancelar</Link><button disabled={busy} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60">{busy ? "Creando marca…" : "Crear marca"}</button></div></form></div></WorkspaceShell>;
}
