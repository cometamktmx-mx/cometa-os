"use client";
import { useEffect, useRef, useState } from "react";

type Application = { id: string; user_id: string; contact_name: string; business_name: string; email: string; phone: string; city: string; business_type: string; status: string; created_at: string; reviewed_at: string | null; reviewed_by: string | null; review_note: string | null; seller_id: string | null };
export default function ApplicationsReview() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function load() {
    try {
      const response = await fetch("/api/comu/admin/applications", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar las solicitudes.");
      setApplications(data.applications);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudieron cargar las solicitudes."); }
  }
  useEffect(() => { void Promise.resolve().then(load); }, []);
  async function review(applicationId: string, decision: string, form: HTMLFormElement) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    const fields = new FormData(form);
    try {
      const response = await fetch("/api/comu/admin/applications", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, decision, note: fields.get("note"), brandId: fields.get("brandId") || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo registrar la decisión.");
      setMessage(decision === "APPROVED" ? "Aprobación registrada. El seller puede preparar su tienda; no se activó comercialmente ni se envió correo." : "Solicitud rechazada. No se concedió acceso.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Actualiza y reintenta."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="mt-8 rounded-3xl border border-black/10 bg-white p-6"><h2 className="text-2xl font-bold">Solicitudes de vendedores</h2>
    <p className="mt-2 text-sm">Aprobar habilita preparación. Activar comercialmente requiere una revisión separada.</p>
    {message && <p role="status" className="my-4">{message}</p>}
    <button type="button" disabled={busy} onClick={() => void load()} className="my-4 underline">Actualizar</button>
    {!applications.length && <p>No hay solicitudes disponibles.</p>}
    {applications.map(a => <details key={a.id} className="border-t py-4"><summary>{a.business_name} · {a.status}</summary>
      <dl className="my-4 text-sm"><dt>Solicitante</dt><dd>{a.contact_name} · {a.user_id}</dd><dt>Contacto</dt><dd>{a.email} · {a.phone}</dd><dt>Negocio</dt><dd>{a.city} · {a.business_type}</dd><dt>Fecha</dt><dd>{a.created_at}</dd></dl>
      {["PENDING", "REVIEW"].includes(a.status) ? <form onSubmit={event => event.preventDefault()}>
        <label className="block">Marca existente (UUID opcional; debe pertenecer al solicitante)<input name="brandId" className="ml-2 border p-2" /></label>
        <label className="mt-3 block">Nota / motivo de rechazo<textarea name="note" maxLength={2000} className="block w-full border p-2" /></label>
        <button disabled={busy} type="button" className="mr-4 mt-3 rounded border px-4 py-2" onClick={event => { if (event.currentTarget.form) void review(a.id, "APPROVED", event.currentTarget.form); }}>Aprobar</button>
        <button disabled={busy} type="button" className="rounded border px-4 py-2" onClick={event => { if (event.currentTarget.form) void review(a.id, "REJECTED", event.currentTarget.form); }}>Rechazar</button>
      </form> : <p>Revisada por {a.reviewed_by || "Registro previo a C1"} · {a.reviewed_at || "Sin fecha histórica registrada"} · {a.review_note} {a.seller_id && <>· Seller {a.seller_id}</>}</p>}
    </details>)}
  </section>;
}
