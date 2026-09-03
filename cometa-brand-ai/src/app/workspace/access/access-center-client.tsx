"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AccessPerson } from "@/lib/workspace/access";
import { formatLastSignIn } from "@/lib/workspace/access-formatters";

type Filter = "all" | "clients" | "team" | "active" | "revoked" | "missing";

export function AccessCenterClient({ people, brands }: { people: AccessPerson[]; brands: Array<{ slug: string; name: string }> }) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(() => people.filter((person) => {
    const team = person.profile?.role === "admin" || person.profile?.role === "team" || person.assignments.length > 0;
    if (filter === "clients") return !team;
    if (filter === "team") return team;
    if (filter === "active") return person.profile?.status === "active";
    if (filter === "revoked") return person.profile?.status === "inactive";
    if (filter === "missing") return person.profile === null;
    return true;
  }), [filter, people]);

  return <><TeamCreateForm brands={brands} />
    <div className="mt-6 flex flex-wrap gap-2">{([['all','Todos'],['clients','Clientes'],['team','Equipo Cometa'],['active','Activos'],['revoked','Revocados'],['missing','Sin perfil']] as const).map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-4 py-2 text-xs ${filter === value ? "bg-blue-600 text-white" : "border border-white/10 text-slate-400"}`}>{label}</button>)}</div>
    <div className="mt-5 overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.03]">
      <div className="hidden grid-cols-[1.2fr_1.4fr_.8fr_.7fr_1.2fr_1fr_auto] gap-4 border-b border-white/[.08] px-5 py-3 text-[10px] uppercase tracking-wider text-slate-500 lg:grid"><span>Nombre</span><span>Correo</span><span>Tipo</span><span>Estado</span><span>Marcas</span><span>Último inicio de sesión</span><span /></div>
      {visible.map((person) => { const team = person.profile?.role === "admin" || person.profile?.role === "team" || person.assignments.length > 0; const activeBrands = person.memberships.filter((item) => item.status === "active" && item.canonicalBrand); const brandSummary = activeBrands.length ? `${activeBrands[0].brandName}${activeBrands.length > 1 ? ` +${activeBrands.length - 1}` : ""}` : "Sin marcas activas"; return <div key={person.id} className="grid gap-3 border-b border-white/[.06] px-5 py-4 last:border-0 lg:grid-cols-[1.2fr_1.4fr_.8fr_.7fr_1.2fr_1fr_auto] lg:items-center">
        <p className="font-medium text-white">{person.profile?.fullName || "Nombre pendiente"}</p><p className="truncate text-sm text-slate-400">{person.email}</p><p className="text-sm text-slate-300">{team ? "Equipo Cometa" : "Cliente"}</p><Status person={person} /><p className="text-sm text-slate-400">{brandSummary}</p><p className="text-sm text-slate-400">{formatLastSignIn(person.lastSignInAt)}</p><Link href={`/workspace/access/${person.id}`} className="text-sm font-medium text-cyan-300">Ver detalle →</Link>
      </div>; })}
      {!visible.length && <p className="p-8 text-center text-sm text-slate-500">No hay personas para este filtro.</p>}
    </div>
  </>;
}

function TeamCreateForm({ brands }: { brands: Array<{ slug: string; name: string }> }) { const [open, setOpen] = useState(false); const [form, setForm] = useState({ fullName: "", email: "", password: "", slugs: [] as string[], role: "designer" }); const [message, setMessage] = useState(""); async function submit() { setMessage("Creando cuenta…"); const response = await fetch("/api/admin/access-v2", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create_team", fullName: form.fullName, email: form.email, password: form.password, brands: form.slugs.map((slug) => ({ slug, role: form.role, isPrimary: false })) }) }); const body = await response.json(); setMessage(response.ok ? "Miembro creado" : String(body.error || "No se pudo crear")); } return <section className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/[.04] p-5"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-wider text-cyan-300">Equipo Cometa</p><h2 className="mt-1 text-lg font-semibold text-white">Cuentas individuales para Studio</h2></div><button onClick={() => setOpen((v) => !v)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold">{open ? "Cerrar" : "+ Nuevo miembro"}</button></div>{open && <div className="mt-5 grid gap-3 md:grid-cols-2">{(["fullName", "email", "password"] as const).map((key) => <input key={key} value={form[key]} onChange={(e) => setForm((c) => ({ ...c, [key]: e.target.value }))} placeholder={key === "fullName" ? "Nombre" : key === "email" ? "Email" : "Contraseña"} type={key === "password" ? "password" : key === "email" ? "email" : "text"} className="rounded-xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm" />)}<select value={form.role} onChange={(e) => setForm((c) => ({ ...c, role: e.target.value }))} className="rounded-xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm"><option value="designer">Diseño</option><option value="reels">Reels / Video</option><option value="cm">Community</option><option value="copy">Copy</option><option value="producer">Producción</option></select><select multiple value={form.slugs} onChange={(e) => setForm((c) => ({ ...c, slugs: Array.from(e.target.selectedOptions, (option) => option.value) }))} className="min-h-24 rounded-xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm"><option value="" disabled>Selecciona una o varias marcas</option>{brands.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}</select><button onClick={submit} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold md:col-span-2">Crear miembro de equipo</button><p className="text-sm text-slate-400 md:col-span-2">{message}</p></div>}</section> }

function Status({ person }: { person: AccessPerson }) {
  if (!person.profile) return <span className="w-fit rounded-full bg-amber-400/10 px-2.5 py-1 text-xs text-amber-200">Sin perfil</span>;
  return <span className={`w-fit rounded-full px-2.5 py-1 text-xs ${person.profile.status === "active" ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200"}`}>{person.profile.status === "active" ? "Activo" : "Revocado"}</span>;
}
