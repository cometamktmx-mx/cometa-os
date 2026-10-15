"use client";
import { useCallback, useEffect, useState } from "react";
type Grant = { id: string; plan_code: string; status: string; starts_at: string; ends_at: string; reason: string | null };
type Model = { slug: string; access: { effective: { accessAllowed: boolean; accessSource: string; planCode: string | null }; grant: { active: boolean } }; grants: Grant[]; plans: { code: string; name: string }[]; events: { id: string; actor: string; action: string; reason: string; created_at: string; previous_grant: Grant | null; new_grant: Grant | null }[] };
const date = (value: string) => value === "infinity" ? "Sin vencimiento automático" : new Date(value).toLocaleString("es-MX");
export function PosCourtesy({ slug }: { slug: string }) {
  const [model, setModel] = useState<Model | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [stale, setStale] = useState(false);
  const [plan, setPlan] = useState(""), [reason, setReason] = useState(""), [end, setEnd] = useState(""), [unlimited, setUnlimited] = useState(true);
  const endpoint = `/api/admin/brands/${encodeURIComponent(slug)}/pos-courtesy`;
  const accept = useCallback((data: Model) => {
    if (data.slug !== slug) throw Error("Respuesta de otra marca.");
    setModel(data); const current = data.grants.find(g => g.status === "active");
    setPlan(current?.plan_code || data.access.effective.planCode || data.plans[0]?.code || ""); setReason(current?.reason || "");
    setUnlimited(!current || current.ends_at === "infinity");
    setEnd(current && current.ends_at !== "infinity" ? new Date(Date.parse(current.ends_at) - new Date(current.ends_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");setStale(false);
  }, [slug]);
  useEffect(() => { let live = true; fetch(endpoint, { cache: "no-store" }).then(async r => { const b = await r.json(); if (!r.ok) throw Error(b.error); if (live) accept(b); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [endpoint, accept]);
  async function submit(action?: "save" | "revoke") {
    if (busy) return; setBusy(true);setError("");
    try {
      const current = model?.grants.find(g => g.status === "active");
      const r = await fetch(endpoint, { method: action ? "PATCH" : "GET", cache: "no-store", headers: action ? { "Content-Type": "application/json" } : undefined, body: action ? JSON.stringify({ action, expectedId: current?.id ?? null, plan, endsAt: unlimited ? null : new Date(end).toISOString(), reason }) : undefined });
      const b = await r.json(); if (!r.ok) throw Error(b.error); accept(b);
    } catch (e) {setError(e instanceof Error ? e.message : "No se pudo confirmar el cambio.");if (action) setStale(true);} finally {setBusy(false);}
  }
  const current = model?.grants.find(g => g.status === "active");
  return <section className="mt-6 rounded-2xl border border-[#173e35]/20 bg-white p-5" aria-labelledby="pos-courtesy-title">
    <h3 id="pos-courtesy-title" className="text-xl font-semibold">POS · Acceso comercial y cortesías</h3>
    {!model ? <p>{error || "Consultando acceso…"}</p> : <>
      <p className="mt-3">Acceso efectivo: <strong>{model.access.effective.accessAllowed ? "Activo" : "Restringido"}</strong> · Origen: {({ subscription: "Suscripción", trial: "Prueba", commercial_grant: "Cortesía", none: "Sin acceso" } as Record<string, string>)[model.access.effective.accessSource] || "No verificado"} · Plan: {model.access.effective.planCode || "Sin plan"}</p>
      <p className="mt-2 font-semibold">{model.access.grant.active ? "Cortesía activa" : current ? "Cortesía vencida o no vigente" : "Sin cortesía activa"}{current ? ` · ${date(current.ends_at)}` : ""}</p>
      <p className="mt-2 text-sm">No crea cobros ni modifica la suscripción, COMU o Tienda online. Al retirar o vencer, se vuelve a evaluar el acceso habitual; los datos se conservan.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label>Plan POS<select className="mt-1 block w-full rounded border p-3" value={plan} onChange={e => setPlan(e.target.value)}>{model.plans.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
        <label>Motivo<textarea className="mt-1 block w-full rounded border p-3" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={unlimited} onChange={e => setUnlimited(e.target.checked)} />Sin vencimiento automático</label>
        {!unlimited && <label>Vence (hora local)<input className="mt-1 block w-full rounded border p-3" type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>}
      </div>
      <div className="mt-4 flex flex-wrap gap-3"><button className="rounded-xl bg-[#173e35] px-4 py-3 text-white disabled:opacity-40" disabled={busy || stale || reason.trim().length < 3 || !plan || (!unlimited && !end)} onClick={() => void submit("save")}>{current ? "Modificar cortesía" : "Otorgar cortesía"}</button><button className="rounded-xl border px-4 py-3 disabled:opacity-40" disabled={busy || stale || !current || reason.trim().length < 3} onClick={() => void submit("revoke")}>Retirar cortesía</button></div>
      <details className="mt-5"><summary>Historial de cambios</summary><ul className="mt-3 space-y-3">{model.events.map(e => <li key={e.id}><strong>{e.action === "grant" ? "Otorgada" : e.action === "replace" ? "Modificada" : "Retirada"}</strong> · {date(e.created_at)} · {e.actor}<p>{e.reason}</p><p>Anterior: {e.previous_grant ? `${e.previous_grant.plan_code} · ${date(e.previous_grant.ends_at)}` : "Ninguna"} → Nueva: {e.new_grant ? `${e.new_grant.plan_code} · ${date(e.new_grant.ends_at)}` : "Retirada"}</p></li>)}</ul></details>
    </>}
    <button className="mt-4 underline" disabled={busy} onClick={() => void submit()}>Recargar acceso</button>{error && model && <p role="alert" className="mt-3 text-red-800">{error}</p>}
  </section>;
}
