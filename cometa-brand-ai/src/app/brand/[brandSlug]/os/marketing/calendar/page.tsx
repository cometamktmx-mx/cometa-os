"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader, StatusBadge } from "../../components/os-primitives";

type Item = { id: string; title: string; contentType: string | null; platform: string | null; publishDate: string | null; statusLabel: string };
type Detail = { item: Record<string, unknown>; assets?: Record<string, unknown>[]; displayContent?: Record<string, unknown>; displayAssets?: Record<string, unknown>[]; review?: { status: string; submittedAt: string | null; decidedAt: string | null; decisionComment: string | null; canApprove: boolean; canRequestChanges: boolean } | null };
const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const summaries = ["inProduction", "inReview", "approved", "scheduled", "published"];
const key = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Fecha no disponible";

function parseReferences(value: unknown) {
  const links: string[] = [];
  const notes: string[] = [];
  if (typeof value !== "string") return { links, notes: "" };
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    try {
      const url = new URL(trimmed);
      if (trimmed && (url.protocol === "http:" || url.protocol === "https:")) {
        links.push(trimmed);
        continue;
      }
    } catch {
      // Historical free text remains presentation text.
    }
    notes.push(line);
  }
  return { links: Array.from(new Set(links)), notes: notes.join("\n").trim() };
}

export default function CalendarPage() {
  const { brandSlug } = useParams<{ brandSlug: string }>();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<{ summary: Record<string, number>; items: Item[] } | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(false);
  const [modal, setModal] = useState<"approve" | "changes" | null>(null);
  const [comment, setComment] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/os/${encodeURIComponent(brandSlug)}/marketing/calendar?month=${month}&year=${year}`, { cache: "no-store" });
      if (!response.ok) throw Error();
      setData(await response.json());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [brandSlug, month, year]);

  // The calendar period is external data synchronized by this effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const cells = useMemo(() => {
    const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const count = new Date(year, month, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [month, year]);

  async function openItem(item: Item) {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/os/${encodeURIComponent(brandSlug)}/marketing/content/${encodeURIComponent(item.id)}`, { cache: "no-store" });
      if (!response.ok) throw Error();
      setDetail(await response.json());
    } catch {
      setActionError("No se pudo cargar esta pieza.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function act(kind: "approve" | "changes") {
    if (!selected || !detail?.review) return;
    if (kind === "changes" && (comment.trim().length < 3 || comment.length > 2000)) {
      setActionError("Escribe al menos 3 caracteres para describir el cambio.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/os/${encodeURIComponent(brandSlug)}/marketing/content/${encodeURIComponent(selected.id)}/review/${kind === "approve" ? "approve" : "request-changes"}`, { method: "POST", headers: kind === "changes" ? { "content-type": "application/json" } : undefined, body: kind === "changes" ? JSON.stringify({ comment: comment.trim() }) : undefined });
      const body = await response.json();
      if (!response.ok) throw Error(body?.error || "REVIEW_FAILED");
      setModal(null);
      setComment("");
      await openItem(selected);
    } catch (cause) {
      setActionError(cause instanceof Error && cause.message === "INVALID_COMMENT" ? "Escribe al menos 3 caracteres para describir el cambio." : "No pudimos enviar la decisión. Intenta nuevamente.");
    } finally {
      setActionLoading(false);
    }
  }

  const content = detail?.review?.status === "pending" ? (detail.displayContent || detail.item) : detail?.item;
  const media = detail?.review?.status === "pending" ? (detail.displayAssets || []) : (detail?.assets || []);
  const references = parseReferences(content?.referenceNotes);

  return <div className="space-y-6">
    <PageHeader eyebrow="MARKETING · CALENDARIO" title="Calendario de contenido" description="Consulta lo que estamos preparando, revisando y publicando para tu marca." />
    <section className="os-card-primary space-y-5">
      <div className="flex flex-wrap items-center justify-between">
        <h2 className="text-2xl font-semibold capitalize">{new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 15))}</h2>
        <div className="flex gap-2"><button onClick={() => { const date = new Date(year, month - 2, 1); setMonth(date.getMonth() + 1); setYear(date.getFullYear()); }}>Anterior</button><button onClick={() => { setMonth(now.getMonth() + 1); setYear(now.getFullYear()); }}>Hoy</button><button onClick={() => { const date = new Date(year, month, 1); setMonth(date.getMonth() + 1); setYear(date.getFullYear()); }}>Siguiente</button></div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{summaries.map((summary) => <div key={summary} className="rounded-xl bg-[var(--os-surface-subtle)] p-2 text-xs">{summary}<strong className="block text-xl">{data?.summary?.[summary] ?? 0}</strong></div>)}</div>
    </section>
    {error ? <div className="os-card-subtle">No pudimos cargar el calendario.</div> : <section className="os-card overflow-hidden p-0"><div className="grid grid-cols-7 border-b">{days.map((day) => <div key={day} className="p-2 text-center text-xs">{day}</div>)}</div><div className="grid grid-cols-7 gap-px bg-slate-200">{loading ? Array.from({ length: 35 }, (_, index) => <div key={index} className="min-h-[112px] bg-white" />) : cells.map((day, index) => <div key={`${day}-${index}`} className="min-h-[112px] bg-white p-2"><span className="text-xs text-slate-500">{day || ""}</span>{day && (data?.items || []).filter((item) => item.publishDate === key(year, month, day)).map((item) => <button key={item.id} onClick={() => void openItem(item)} className="mt-2 block w-full rounded-lg bg-blue-50 p-2 text-left"><small className="block uppercase text-blue-700">{item.contentType || "Contenido"}</small><span className="block truncate text-xs font-semibold">{item.title}</span><small>{item.statusLabel}</small></button>)}</div>)}</div></section>}
    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" role="dialog" aria-modal="true"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6"><div className="flex justify-between"><div><p className="text-xs uppercase text-slate-500">Detalle</p><h2 className="text-2xl font-semibold">{String(content?.title || selected.title)}</h2></div><button onClick={() => { setSelected(null); setDetail(null); }}>×</button></div>{detailLoading ? <p className="py-10">Cargando detalle…</p> : detail && <div className="mt-5 space-y-4 text-sm">{detail.review?.status === "pending" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><b>REVISIÓN PENDIENTE</b><p>Esta pieza está lista para tu revisión.</p></div>}{detail.review?.status === "approved" && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><b>✓ Pieza aprobada</b><p>Aprobada el {formatDate(detail.review.decidedAt)}</p></div>}{detail.review?.status === "changes_requested" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><b>Cambios solicitados</b><p>{detail.review.decisionComment || "Sin comentario."}</p><small>{formatDate(detail.review.decidedAt)}</small></div>}<div className="flex gap-2"><StatusBadge label={String(detail.item.statusLabel || selected.statusLabel)} /><span>{String(content?.platform || selected.platform || "Sin plataforma")}</span></div><Info label="Fecha" value={String(content?.publishDate || selected.publishDate || "Sin fecha")} /><Info label="Objetivo" value={String(content?.objective || "Sin objetivo")} /><Info label="Copy" value={String(content?.copy || "Sin copy")} /><Info label="CTA" value={String(content?.cta || "Sin CTA")} />{(references.links.length > 0 || references.notes) && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-semibold">Referencias</h3>{references.links.length > 0 && <div className="mt-2 space-y-1">{references.links.map((link) => <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="block break-all text-blue-700 underline">{link}</a>)}</div>}{references.notes && <div className="mt-3"><p className="text-xs font-semibold uppercase text-slate-500">Notas de referencia</p><p className="mt-1 whitespace-pre-wrap">{references.notes}</p></div>}</section>}{media.length > 0 && <div><b>Archivos</b>{media.map((asset) => <div key={String(asset.id)} className="mt-2 rounded bg-slate-50 p-2">{asset.available === false ? <p>Archivo no disponible</p> : asset.url && String(asset.type || "").includes("video") ? <video controls preload="metadata" src={String(asset.url)} className="max-h-64 w-full" /> : asset.url && String(asset.type || "").includes("image") ? <img src={String(asset.url)} alt={String(asset.label || "Archivo")} className="max-h-64 w-full object-contain" /> : <a href={String(asset.url || "#")} target="_blank" rel="noreferrer">{String(asset.label || asset.provider || "Abrir archivo")}</a>}</div>)}</div>}{detail.review?.status === "pending" && detail.review.canApprove && detail.review.canRequestChanges && <div className="flex flex-col gap-2 sm:flex-row"><button onClick={() => setModal("changes")} className="rounded-lg border px-4 py-2">Solicitar cambios</button><button onClick={() => setModal("approve")} className="rounded-lg bg-emerald-600 px-4 py-2 text-white">Aprobar pieza</button></div>}{actionError && <p className="text-red-600">{actionError}</p>}</div>}</div></div>}
    {modal && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-2xl bg-white p-6"><h2 className="text-xl font-semibold">{modal === "approve" ? "Aprobar pieza" : "Solicitar cambios"}</h2>{modal === "approve" ? <p className="mt-3">Confirmas que el contenido enviado está listo para continuar.</p> : <label className="mt-4 block">¿Qué debemos ajustar?<textarea value={comment} onChange={(event) => setComment(event.target.value)} minLength={3} maxLength={2000} placeholder="Cuéntanos los cambios necesarios..." className="mt-2 min-h-28 w-full rounded border p-3" /><small>{comment.length}/2000</small></label>}<div className="mt-4 flex justify-end gap-2"><button disabled={actionLoading} onClick={() => setModal(null)}>Cancelar</button><button disabled={actionLoading} onClick={() => void act(modal)}>{actionLoading ? "Guardando…" : modal === "approve" ? "Aprobar pieza" : "Enviar solicitud"}</button></div></div></div>}
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase text-slate-500">{label}</p><p className="whitespace-pre-wrap">{value}</p></div>;
}
