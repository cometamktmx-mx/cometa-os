"use client";
import Image from "next/image";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

type Media = { id: string; public_url: string; sort_order: number; is_primary: boolean };
type PendingImage = { key: string; file: File; url: string; uncertain: boolean };
export type ProductMediaHandle = { flush: (listingId: string) => Promise<void> };
async function digest(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}
export default function ProductEditorMedia({ sellerId, listingId, locked, onPreview, handle }: { sellerId: string; listingId?: string; locked: boolean; onPreview: (url: string) => void; handle: Ref<ProductMediaHandle> }) {
  const [media, setMedia] = useState<Media[]>([]), [queue, setQueue] = useState<PendingImage[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef<PendingImage[]>([]), urls = useRef<string[]>([]), running = useRef(false);
  const preview = useRef(onPreview);
  useEffect(() => { preview.current = onPreview; }, [onPreview]);
  async function read(id: string) {
    const response = await fetch(`/api/comu/media?sellerId=${encodeURIComponent(sellerId)}&listingId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.media)) throw new Error("No se pudieron verificar las fotografías guardadas.");
    return data.media as Media[];
  }
  useEffect(() => {
    let alive = true;
    if (listingId) void read(listingId).then(rows => { if (alive) { setMedia(rows); preview.current(rows.find(r => r.is_primary)?.public_url || rows[0]?.public_url || ""); } }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
    // read is scoped to this seller; no cross-seller cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, listingId]);
  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  async function select(files: FileList | null) {
    if (!files || locked || running.current) return;
    running.current = true; setBusy(true); setError("");
    const next: PendingImage[] = [];
    try {
    for (const file of Array.from(files)) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) { setError("Usa JPG, PNG o WEBP de hasta 5 MB por fotografía."); continue; }
      const key = await digest(await file.arrayBuffer());
      if (pending.current.some(item => item.key === key) || next.some(item => item.key === key)) continue;
      const url = URL.createObjectURL(file); urls.current.push(url); next.push({ file, key, url, uncertain: false });
    }
    pending.current = [...pending.current, ...next]; setQueue([...pending.current]);
    if (!media.length && pending.current.length) onPreview(pending.current[0].url);
    } catch { setError("No se pudo preparar la fotografía. Selecciónala nuevamente."); }
    finally { running.current = false; setBusy(false); }
  }
  useImperativeHandle(handle, () => ({ async flush(id) {
    if (running.current) throw new Error("Espera a que termine la operación de fotografías.");
    running.current = true; setBusy(true); setError("");
    try {
      let rows = await read(id);
      for (const item of [...pending.current]) {
        // The upload API has no idempotency key. Reconcile by content before sending;
        // an ambiguous response is never blindly retried.
        let found = false;
        for (const row of rows) {
          const response = await fetch(row.public_url, { cache: "no-store" });
          if (!response.ok) throw new Error("No se pudo verificar una imagen existente. No se repetirá la carga.");
          if (await digest(await response.arrayBuffer()) === item.key) { found = true; break; }
        }
        if (!found) {
          if (item.uncertain) throw new Error("La carga anterior no tiene confirmación. Vuelve a verificar; no se enviará otra copia. Si persiste, revisa las fotos antes de volver a seleccionarla.");
          const form = new FormData(); form.set("sellerId", sellerId); form.set("listingId", id); form.set("file", item.file);
          item.uncertain = true;
          const response = await fetch("/api/comu/media", { method: "POST", body: form });
          const data = await response.json();
          if (!response.ok || !data.media?.id) throw new Error("No se confirmó la fotografía. El catálogo está guardado; verifica la carga antes de publicar.");
          rows.push(data.media as Media);
        }
        pending.current = pending.current.filter(p => p.key !== item.key); setQueue([...pending.current]); setMedia([...rows]);
      }
      rows = await read(id); setMedia(rows); onPreview(rows.find(r => r.is_primary)?.public_url || rows[0]?.public_url || "");
    } catch (e) { const message = e instanceof Error ? e.message : "No se pudieron guardar las fotografías."; setError(message); throw new Error(message); }
    finally { running.current = false; setBusy(false); }
  } }));
  async function mutate(item: Media, update?: { sortOrder?: number; isPrimary?: boolean }) {
    if (locked || running.current || !listingId) return;
    if (!update && !window.confirm("¿Eliminar esta fotografía del producto?")) return;
    running.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/comu/media", { method: update ? "PATCH" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerId, mediaId: item.id, ...update }) });
      if (!response.ok) throw new Error("No se confirmó el cambio de fotografía. Actualiza antes de reintentar.");
      const rows = await read(listingId); setMedia(rows); onPreview(rows.find(r => r.is_primary)?.public_url || rows[0]?.public_url || "");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar."); }
    finally { running.current = false; setBusy(false); }
  }
  return <section className="pe-panel pe-photos"><h2>1. Fotografías</h2><p>Fotos del producto. JPG, PNG o WEBP · hasta 5 MB por imagen.</p>
    <div className="pe-gallery"><label className="pe-upload" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void select(e.dataTransfer.files); }}><span aria-hidden="true">＋</span><strong>Agrega tus fotografías</strong><small>Arrastra aquí o selecciona desde tu dispositivo</small><input aria-label="Agregar fotografías" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={locked || busy} onChange={e => { void select(e.target.files); e.currentTarget.value = ""; }} /></label>
      {media.map((item, index) => <div className="pe-photo" key={item.id}><Image unoptimized src={item.public_url} width={144} height={176} alt={`Fotografía ${index + 1}`} /><div><button type="button" disabled={locked || busy} onClick={() => void mutate(item)} aria-label={`Eliminar fotografía ${index + 1}`}>Eliminar</button></div></div>)}
      {queue.map(item => <div className="pe-photo" key={item.key}><Image unoptimized src={item.url} width={144} height={176} alt={item.file.name} /><small>{item.uncertain ? "Por verificar" : "Pendiente de guardar"}</small><button type="button" disabled={locked || busy || item.uncertain} onClick={() => { pending.current = pending.current.filter(p => p.key !== item.key); setQueue([...pending.current]); onPreview(media[0]?.public_url || pending.current[0]?.url || ""); }}>Quitar</button></div>)}
    </div>{busy && <p role="status">Verificando fotografías…</p>}{error && <p role="alert" className="pe-error">{error}</p>}
  </section>;
}
