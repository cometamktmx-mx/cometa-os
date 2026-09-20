"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { posStaffRoleLabel, POS_STAFF_ROLES, type PosStaffRole } from "@/lib/pos/staff-shared";
import { usePosContext } from "../../components/pos-shell";
import { PosBadge, PosButton, PosCard, PosInput, PosPage, PosPageHeader, PosModal } from "../../components/pos-ui";

type Staff = { id: string; name: string; role: PosStaffRole; roles?: PosStaffRole[]; locationId: string | null; active: boolean };
export default function PosStaffPage() {
  const { brand } = usePosContext();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [multiRole, setMultiRole] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<PosStaffRole[]>(["WAITER"]);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/pos/staff?brandSlug=" + encodeURIComponent(brand.slug), { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "No se pudo cargar el equipo.");
    setStaff(body.staff || []); setMultiRole(body.multiRole === true);
  }, [brand.slug]);
  useEffect(() => { const timer = window.setTimeout(() => { void load().catch(e => setError(e instanceof Error ? e.message : "No se pudo cargar el equipo.")); }, 0); return () => window.clearTimeout(timer); }, [load]);
  function edit(member: Staff | null) {
    setEditing(member); setName(member?.name || ""); setRoles(member?.roles ?? [member?.role || "WAITER"]); setPin(""); setError(null); setOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch("/api/pos/staff", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandSlug: brand.slug, ...(editing ? { staffId: editing.id } : {}), name, ...(multiRole ? { roles } : { role: roles[0] }), ...(pin ? { pin } : {}) }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo guardar el operador.");
      await load(); setOpen(false);
    } catch(e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); } finally { setBusy(false); }
  }
  async function toggle(member: Staff) {
    setBusy(true); setError(null);
    try { const response = await fetch("/api/pos/staff", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandSlug: brand.slug, staffId: member.id, active: !member.active }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo actualizar."); await load(); }
    catch(e) { setError(e instanceof Error ? e.message : "No se pudo actualizar."); } finally { setBusy(false); }
  }
  return <PosPage><PosPageHeader eyebrow="Personal" title="Operadores POS" description="Una persona, un PIN. Asigna las áreas donde puede trabajar." />
    {error ? <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-rose-300">{error}</p> : null}
    <PosButton onClick={() => edit(null)}>Nuevo operador</PosButton>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{staff.map(member => <PosCard key={member.id}>
      <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-bold">{member.name}</h2><PosBadge tone={member.active ? "success" : "neutral"}>{member.active ? "Activo" : "Inactivo"}</PosBadge></div>
      <div className="mt-3 flex flex-wrap gap-2">{(member.roles ?? [member.role]).map(role => <PosBadge key={role}>{posStaffRoleLabel(role)}</PosBadge>)}</div>
      <div className="mt-5 flex gap-2"><PosButton variant="secondary" disabled={busy} onClick={() => edit(member)}>Editar</PosButton><PosButton variant="secondary" disabled={busy} onClick={() => void toggle(member)}>{member.active ? "Desactivar" : "Activar"}</PosButton></div>
    </PosCard>)}</div>
    {!staff.length ? <p className="py-6 text-slate-400">No hay operadores registrados.</p> : null}
    <PosModal open={open} onClose={() => !busy && setOpen(false)} title={editing ? "Editar operador" : "Nuevo operador"}>
      <form onSubmit={save} className="space-y-5">
        <PosInput label="Nombre" value={name} onChange={e => setName(e.target.value)} required />
        {multiRole ? <fieldset><legend className="mb-3 font-semibold">Roles y áreas</legend><div className="grid gap-2 sm:grid-cols-2">{POS_STAFF_ROLES.map(role => <label key={role} className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 px-4"><input type="checkbox" checked={roles.includes(role)} onChange={e => setRoles(current => e.target.checked ? [...current, role] : current.filter(value => value !== role))} />{posStaffRoleLabel(role)}</label>)}</div><p className="mt-3 text-sm text-slate-400">Puedes asignar varias áreas. Administrador permite gestionar el personal.</p></fieldset> : <label className="block">Rol<select className="ml-3 rounded-lg bg-slate-900 p-3" value={roles[0]} onChange={e => setRoles([e.target.value as PosStaffRole])}>{POS_STAFF_ROLES.map(role => <option key={role} value={role}>{posStaffRoleLabel(role)}</option>)}</select></label>}
        <PosInput label={editing ? "Nuevo PIN (opcional)" : "PIN numérico"} type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0,8))} required={!editing} />
        {error ? <p role="alert" className="text-rose-300">{error}</p> : null}
        <PosButton type="submit" disabled={busy || !name.trim() || !roles.length || (pin.length > 0 && pin.length < 4)}>{busy ? "Guardando..." : "Guardar operador"}</PosButton>
      </form>
    </PosModal>
  </PosPage>;
}
