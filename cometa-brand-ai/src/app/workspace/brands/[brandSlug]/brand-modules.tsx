"use client";
import { useState } from "react";
import Link from "next/link";
import type { BrandModules } from "@/lib/workspace/brand-modules";
import { PosCourtesy } from "./pos-courtesy";

const labels: Record<string, string> = {
  active: "Activo", inactive: "Inactivo", paused: "Pausado", not_configured: "No configurado",
  unknown: "No se pudo verificar", unavailable: "No disponible", preparation: "Configuración pendiente",
  ACTIVE: "Activo", PREPARING: "En preparación", SUSPENDED: "Suspendido", INACTIVE: "Inactivo",
  DRAFT: "Borrador", PUBLISHED: "Publicado", VERIFIED: "Verificado", UNVERIFIED: "Sin verificar",
  PENDING: "Pendiente", REJECTED: "Rechazado", APPROVED: "Aprobado",
};
const label = (status: string | null) => status ? labels[status] ?? "Estado no reconocido" : "No configurado";

export function BrandModulesPanel({ initial }: { initial: BrandModules }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const endpoint = `/api/admin/brands/${encodeURIComponent(initial.brand.slug)}/modules`;
  async function request(status?: "enabled" | "suspended") {
    if (busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: status ? "PATCH" : "GET", cache: "no-store",
        headers: status ? { "Content-Type": "application/json" } : undefined,
        body: status ? JSON.stringify({ status, expectedRevision: data.store?.revision }) : undefined,
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (status) setRefreshRequired(true);
        throw new Error(result.error || "No se pudo confirmar el estado.");
      }
      if (result.modules.brand.slug !== initial.brand.slug) throw new Error("La respuesta no corresponde a esta marca.");
      setData(result.modules); setRefreshRequired(false);
      setMessage(status ? "Cambio confirmado. La publicación y las conexiones se gestionan por separado." : "Ficha actualizada.");
    } catch (cause) {
      if (status) setRefreshRequired(true);
      setError(cause instanceof Error ? cause.message : "No se pudo consultar el servicio.");
    } finally { setBusy(false); }
  }
  const enabled = data.store?.status === "enabled";
  return <section aria-labelledby="brand-modules-title" className="mt-8 rounded-3xl bg-[#f6f3e9] p-5 text-[#173e35] sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest">Servicios de la marca</p><h2 id="brand-modules-title" className="mt-2 text-2xl font-semibold">Módulos</h2><p className="mt-2 max-w-2xl text-sm">La habilitación del servicio, los permisos del equipo y la publicación son independientes.</p></div>
      <button type="button" disabled={busy} onClick={() => void request()} className="min-h-11 rounded-xl border border-[#173e35]/25 px-4 text-sm disabled:opacity-50">{busy ? "Procesando…" : "Actualizar"}</button>
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <Card title="COMETA OS" status={label(data.os.status)}><p>Acceso al espacio de trabajo y operación de esta marca.</p>{data.os.status === "active" && <Link className="mt-3 inline-block underline" href={`/brand/${encodeURIComponent(data.brand.slug)}/os`}>Abrir Cometa OS ↗</Link>}</Card>
      <Card title="COMETA POS" status={data.pos.reason?.includes("lookup_failed") || data.pos.reason === "commercial_access_response_invalid" ? "No se pudo verificar" : label(data.pos.state)}><p>Acceso comercial efectivo de POS. Su plan y suspensión se administran por separado.</p>{data.pos.state === "active" && <Link className="mt-3 inline-block underline" href={`/brand/${encodeURIComponent(data.brand.slug)}/pos`}>Abrir Cometa POS ↗</Link>}</Card>
      <Card title="COMU" status={label(data.comu.status)}><p>Verificación Seller: {label(data.comu.verification)}.</p><p>Publicación COMU: {label(data.comu.storefront)}.</p></Card>
      <Card title="Tienda online propia" status={!data.store ? "No se pudo verificar" : enabled ? "Servicio habilitado" : data.store.status === "suspended" ? "Servicio suspendido" : "Servicio deshabilitado"}>
        <p className="font-semibold">Apariencia publicada: {data.publication ? data.publication.hasPublishedAppearance ? `Sí · revisión ${data.publication.publishedRevision}` : "No" : "No se pudo verificar"}.</p>
        <p>Publicar apariencia no confirma dominio, pagos ni envíos operativos.</p>
        <Link className="mt-3 inline-block underline" href={`/brand/${encodeURIComponent(data.brand.slug)}/pos/online-store`}>Configurar tienda online ↗</Link>
        <p className="mt-2">Habilitar este servicio no publica productos, activa COMU ni conecta dominio, pagos o envíos.</p>
        {data.store?.status === "suspended" && <p className="mt-2">Nuevas operaciones bloqueadas. Suspender el servicio no elimina datos.</p>}
        <button type="button" disabled={busy || !data.store || refreshRequired || (!enabled && data.brand.status !== "active")}
          onClick={() => void request(enabled ? "suspended" : "enabled")}
          className="mt-5 min-h-11 rounded-xl bg-[#173e35] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
          {enabled ? "Suspender servicio" : "Habilitar servicio"}
        </button>
        {!enabled && data.brand.status !== "active" && <p className="mt-2">La marca debe estar activa para habilitar el servicio.</p>}
      </Card>
    </div>
    <PosCourtesy slug={initial.brand.slug} />
    <div className="mt-6 rounded-2xl border border-[#173e35]/15 p-5">
      <h3 className="font-semibold">Propietario y accesos de la marca</h3>
      {data.members ? data.members.length ? <ul className="mt-3 space-y-2">{data.members.map(member => <li key={`${member.context}:${member.userId}`}><Link className="underline" href={`/workspace/access/${encodeURIComponent(member.userId)}`}>{member.name}</Link> · {member.context} · {member.role} · {label(member.status)}</li>)}</ul> : <p>No hay membresías registradas.</p> : <p>No se pudieron verificar las membresías.</p>}
      <p className="mt-4">Plan POS: {data.pos.planCode || "No verificado"} · Suscripción: {label(data.pos.lifecycleStatus)}</p>
      <nav className="mt-4 flex flex-wrap gap-4"><Link className="underline" href="/workspace/access">Administrar accesos</Link><Link className="underline" href="/brand/admin/comu">Solicitudes COMU</Link><Link className="underline" href="/workspace/admin/whatsapp-connections">Consultar conexiones WhatsApp</Link></nav>
      <p className="mt-3 text-xs">Las asignaciones operativas no conceden permisos de administración. Una configuración guardada no demuestra conexión verificada.</p>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}
  </section>;
}
function Card({ title, status, children }: { title: string; status: string; children: React.ReactNode }) {
  return <article className="min-w-0 rounded-2xl border border-[#173e35]/15 bg-white/70 p-5"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 inline-block rounded-full bg-[#173e35]/10 px-3 py-1 text-xs font-semibold">{status}</p><div className="mt-4 text-sm leading-6">{children}</div></article>;
}
