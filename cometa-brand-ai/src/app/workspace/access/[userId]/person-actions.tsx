"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ACCESS_ROLES, type AccessPerson, type AccessRole } from "@/lib/workspace/access-shared";

export function PersonActions({ person, brands }: { person: AccessPerson; brands: Array<{ slug: string; name: string }> }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [grantBrand, setGrantBrand] = useState(""); const [grantRole, setGrantRole] = useState<AccessRole>("viewer");
  const [roles, setRoles] = useState<Record<string, AccessRole>>(() => Object.fromEntries(person.memberships.map((item) => [item.brandSlug, item.accessRole])));
  const [typicalStart, setTypicalStart] = useState(person.workProfile?.typicalStart || "09:00");
  const [targetHours, setTargetHours] = useState(person.workProfile ? String(person.workProfile.targetMinutes / 60) : "8");
  const [workDays, setWorkDays] = useState<number[]>(person.workProfile?.workDays || [1, 2, 3, 4, 5]);
  const [timezone, setTimezone] = useState(person.workProfile?.timezone || "America/Mexico_City");
  const existingSlugs = useMemo(() => new Set(person.memberships.map((item) => item.brandSlug)), [person.memberships]);
  const grantable = brands.filter((brand) => !existingSlugs.has(brand.slug));

  async function act(action: string, slug?: string, accessRole?: string) {
    if (!confirm("Esta acción cambia acceso, pero conservará todo el historial. ¿Continuar?")) return;
    setBusy(true); setError("");
    const response = await fetch("/api/admin/access-v2", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, targetUserId: person.id, brandSlug: slug, accessRole }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { const code = String(body.error || ""); setError(code.includes("LAST_OWNER") ? "No puedes cambiar o revocar al último owner activo de esta empresa." : code || "No se pudo completar la operación."); return; }
    router.refresh();
  }

  async function saveWorkProfile() {
    setBusy(true); setError("");
    const targetMinutes = Math.round(Number(targetHours) * 60);
    const response = await fetch("/api/admin/access-v2", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_work_profile", targetUserId: person.id, typicalStart: typicalStart || null, targetMinutes, workDays, timezone }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setError(String(body.error || "No se pudo guardar la jornada operativa.")); return; }
    router.refresh();
  }

  return <div className="space-y-5">
    {error && <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
    {person.profile?.role === "team" && <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[.035] p-5"><p className="text-[10px] uppercase tracking-[.2em] text-cyan-300">Jornada operativa</p><p className="mt-2 text-xs text-slate-400">La hora habitual es una referencia. La duración diaria define el objetivo operativo.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs text-slate-400">Inicio habitual<input type="time" value={typicalStart} onChange={(event) => setTypicalStart(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#07111f] px-3 py-2 text-sm text-white"/></label><label className="text-xs text-slate-400">Duración diaria (horas)<input type="number" min="0.5" max="15" step="0.25" value={targetHours} onChange={(event) => setTargetHours(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#07111f] px-3 py-2 text-sm text-white"/></label></div><div className="mt-4"><p className="text-xs text-slate-400">Días habituales</p><div className="mt-2 flex flex-wrap gap-2">{["L","M","M","J","V","S","D"].map((label, index) => { const day = index + 1; const selected = workDays.includes(day); return <button type="button" key={day} onClick={() => setWorkDays((current) => selected ? current.filter((value) => value !== day) : [...current, day].sort())} className={`h-9 w-9 rounded-lg border text-xs ${selected ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-slate-500"}`}>{label}</button>; })}</div></div><label className="mt-4 block text-xs text-slate-400">Timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#07111f] px-3 py-2 text-sm text-white"/></label><button disabled={busy || !targetHours || !timezone} onClick={saveWorkProfile} className="mt-4 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-[#07111f] disabled:opacity-40">Guardar jornada operativa</button></section>}
    <div className="flex flex-wrap gap-2">{!person.profile && <button disabled={busy} onClick={() => act("create_profile")} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold">Crear perfil de cliente</button>}{person.profile?.status === "inactive" && <button disabled={busy} onClick={() => act("restore_account")} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold">Reactivar cuenta</button>}<button disabled={busy || !person.profile} onClick={() => act("revoke_all")} className="rounded-xl border border-rose-400/30 px-4 py-2 text-sm text-rose-200">Revocar todo acceso</button></div>

    <div className="space-y-3">{person.memberships.map((item) => <article key={item.brandSlug} className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{item.brandName}</h3>{!item.canonicalBrand && <p className="mt-1 text-xs text-amber-300">Marca no disponible · inconsistencia sin saneamiento automático</p>}</div><span className={`rounded-full px-2.5 py-1 text-xs ${item.status === "active" ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200"}`}>{item.status === "active" ? "Activo" : "Revocado"}</span></div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2"><div><p className="text-[10px] uppercase tracking-wider text-slate-500">Acceso de esta persona</p><dl className="mt-2 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-slate-500">Estado</dt><dd>{item.status === "active" ? "Activo" : "Revocado"}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Rol</dt><dd>{item.accessRole}</dd></div></dl></div><div><p className="text-[10px] uppercase tracking-wider text-slate-500">Productos de la marca</p><dl className="mt-2 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-slate-500">Cometa OS</dt><dd>{item.osStatus ? productLabel(item.osStatus) : "No disponible"}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Cometa POS</dt><dd>{item.pos ? productLabel(item.pos.state) : "No disponible"}</dd></div></dl></div></div>
      <div className="mt-5 flex flex-wrap gap-2">{item.status === "active" && item.canonicalBrand ? <><select value={roles[item.brandSlug] || item.accessRole} onChange={(event) => setRoles((current) => ({ ...current, [item.brandSlug]: event.target.value as AccessRole }))} className="rounded-lg bg-[#07111f] px-3 py-2 text-sm">{ACCESS_ROLES.map((role) => <option key={role}>{role}</option>)}</select><button disabled={busy || roles[item.brandSlug] === item.accessRole} onClick={() => act("change_role", item.brandSlug, roles[item.brandSlug])} className="rounded-lg border border-cyan-400/30 px-3 py-2 text-sm text-cyan-200">Cambiar rol</button><button disabled={busy} onClick={() => act("revoke_brand", item.brandSlug)} className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-200">Revocar acceso</button></> : item.status === "inactive" && item.canonicalBrand ? <button disabled={busy || person.profile?.status !== "active"} onClick={() => act("restore_brand", item.brandSlug, item.accessRole)} className="rounded-lg border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200">Restaurar acceso</button> : null}</div>
    </article>)}</div>

    <section className="rounded-2xl border border-white/10 p-5"><h3 className="font-semibold">+ Conceder acceso a otra marca</h3><p className="mt-1 text-xs text-slate-500">Esto solo crea una membership. No activa Cometa OS, POS ni Mercury.</p>{grantable.length ? <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]"><select value={grantBrand} onChange={(event) => setGrantBrand(event.target.value)} className="rounded-lg bg-[#07111f] px-3 py-2 text-sm"><option value="">Selecciona una marca</option>{grantable.map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}</select><select value={grantRole} onChange={(event) => setGrantRole(event.target.value as AccessRole)} className="rounded-lg bg-[#07111f] px-3 py-2 text-sm">{ACCESS_ROLES.map((role) => <option key={role}>{role}</option>)}</select><button disabled={busy || !grantBrand || person.profile?.status !== "active"} onClick={() => act("grant_brand", grantBrand, grantRole)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold">Conceder acceso</button></div> : <p className="mt-4 text-sm text-slate-500">No hay más marcas disponibles para conceder.</p>}</section>
    <p className="text-xs text-slate-500">Las asignaciones Mercury no conceden membresía y no se reactivan automáticamente.</p>
  </div>;
}

function productLabel(value: string) { return ({ active: "Activo", paused: "Pausado", inactive: "Inactivo", not_configured: "No configurado", preparation: "Preparación", unavailable: "Sin acceso" } as Record<string,string>)[value] || value; }
