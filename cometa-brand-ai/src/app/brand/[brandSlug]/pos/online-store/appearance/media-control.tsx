"use client";
import { useState } from "react";
import { mediaUrl } from "../../../../../../../packages/own-storefront/contract";
export function MediaControl({ value, onChange, upload, mediaBase, library, onBusy, prepare = async path => path }: { value: string; onChange: (path: string) => void; upload: (file: File) => Promise<string>; mediaBase: string; library: () => Promise<string[]>; onBusy: (busy: boolean) => void; prepare?: (path: string) => Promise<string> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [files, setFiles] = useState<string[] | null>(null);
  const load = async (file?: File) => { if (!file || busy) return; setBusy(true); onBusy(true); setError(""); try { onChange(await upload(file)); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar la imagen."); } finally { setBusy(false); onBusy(false); } };
  return <div className="appearance-image" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void load(e.dataTransfer.files[0]); }}>
    {value ? <img src={mediaUrl(mediaBase, value)} alt="Imagen seleccionada" /> : <div className="ae-photo-empty">＋<small>Agrega una fotografía</small></div>}
    <label className="ae-upload">{busy ? "Subiendo…" : value ? "Cambiar foto" : "Subir foto"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => void load(e.target.files?.[0])} /></label>
    <button type="button" disabled={busy} onClick={async () => { setError(""); try { setFiles(await library()); } catch { setError("No se pudo abrir la biblioteca. Reintenta."); } }}>Elegir de mis archivos</button>
    <small>Arrastra una imagen · JPG, PNG o WebP · hasta 5 MB</small>
    {value && <button type="button" disabled={busy} onClick={() => onChange("")}>Quitar imagen</button>}
    {error && <p role="alert">{error}</p>}
    {files && <div className="ae-library"><strong>Archivos de esta marca</strong><button type="button" onClick={() => setFiles(null)}>Cerrar biblioteca</button>{files.length ? files.map(path => <button key={path} type="button" aria-label={"Usar " + path.split("/").at(-1)} disabled={busy} onClick={async () => { setBusy(true); onBusy(true); setError(""); try { onChange(await prepare(path)); setFiles(null); } catch { setError("No se pudo seleccionar la imagen. Reintenta."); } finally { setBusy(false); onBusy(false); } }}><img src={mediaUrl(mediaBase, path)} alt="" loading="lazy" /></button>) : <p>Aún no hay imágenes. Sube la primera.</p>}</div>}
  </div>;
}
