"use client";
/* eslint-disable @next/next/no-img-element -- POS managed media previews use original uploaded URLs without a new image proxy. */
import { useEffect, useState, type ReactNode } from "react";
import { usePosFetch } from "@/lib/pos/client-transport";
import { WEB_ICONS, type WebCatalog, type WebColor, type WebContent, type WebRecord } from "@/lib/pos/product-web-contract";
import type { ProductChannels } from "@/lib/pos/product-channels";
import { ProductSalesChannels } from "./product-channels";
import { BenefitIcon, ColorCircle, ProductWebPreview } from "./product-web-preview";
import "./product-web.css";

export type WebEditorData = { catalog: WebCatalog; web: WebRecord; channels: ProductChannels; media: Record<string, string>; related: { id: string; name: string }[] };
type ProductChoice = { id: string; name: string };
type EditorProps = { data: WebEditorData; channels: ReactNode; save: (document: WebContent, revision: number, publish: boolean) => Promise<WebRecord>; upload: (file: File) => Promise<{ storagePath: string; imageUrl: string }>; search: (query: string) => Promise<ProductChoice[]>; reload: () => void; onDirtyChange?: (dirty: boolean) => void };
const move = <T,>(items: T[], index: number, delta: number) => {
  const target = index + delta; if (target < 0 || target >= items.length) return items;
  const copy = [...items]; [copy[index], copy[target]] = [copy[target], copy[index]]; return copy;
};

export function WebEditorSurface({ data, channels, save, upload, search, reload, onDirtyChange }: EditorProps) {
  const [record, setRecord] = useState(data.web);
  const [doc, setDoc] = useState(data.web.draft);
  const [media, setMedia] = useState(data.media);
  const [selected, setSelected] = useState(data.web.draft.colors[0]?.id ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [previewPhone, setPreviewPhone] = useState(false);
  const [publishedPreview, setPublishedPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [stale, setStale] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductChoice[]>([]);
  const [related, setRelated] = useState(data.related);
  const [attribute, setAttribute] = useState("");
  const color = doc.colors.find(c => c.id === selected) ?? doc.colors[0];
  const dirty = JSON.stringify(doc) !== JSON.stringify(record.draft);
  const unpublished = JSON.stringify(doc) !== JSON.stringify(record.published);
  const attributes = [...new Set(data.catalog.variants.flatMap(v => Object.keys(v.attributes)))];
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const updateColor = (patch: Partial<WebColor>) => { if (color) setDoc(d => ({ ...d, colors: d.colors.map(c => c.id === color.id ? { ...c, ...patch } : c) })); };
  async function persist(publish: boolean) {
    setBusy(true); setError(""); setMessage("");
    try { const next = await save(doc, record.revision, publish); setRecord(next); setDoc(next.draft); setMessage(publish ? "Versión de contenido publicada. No habilita un sitio público." : "Borrador guardado; la versión publicada se conserva."); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); const code = e && typeof e === "object" && "code" in e ? e.code : null; setStale(!code || code === "POS_WEB_CONFLICT" || code === "POS_WEB_SAVE_FAILED"); }
    finally { setBusy(false); }
  }
  async function addMedia(file: File | undefined, target: "photo" | "swatch" | "guide") {
    if (!file) return; setBusy(true); setError("");
    try {
      const uploaded = await upload(file); setMedia(m => ({ ...m, [uploaded.storagePath]: uploaded.imageUrl }));
      if (target === "guide") setDoc(d => ({ ...d, guide: { ...d.guide, imagePath: uploaded.storagePath } }));
      else if (target === "swatch") updateColor({ swatchPath: uploaded.storagePath });
      else if (color) updateColor({ photos: [...color.photos, { path: uploaded.storagePath, alt: "" }] });
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar la imagen."); } finally { setBusy(false); }
  }
  function addColor() { const c: WebColor = { id: crypto.randomUUID(), name: "", hex: "", swatchPath: "", photos: [], variantIds: [] }; setDoc(d => ({ ...d, colors: [...d.colors, c] })); setSelected(c.id); }
  function groupAttribute() {
    if (!attribute || doc.colors.length) return;
    const names = [...new Set(data.catalog.variants.map(v => String(v.attributes[attribute] ?? "")).filter(Boolean))];
    const colors = names.map(name => ({ id: crypto.randomUUID(), name, hex: "", swatchPath: "", photos: [], variantIds: data.catalog.variants.filter(v => String(v.attributes[attribute] ?? "") === name).map(v => v.id) }));
    setDoc(d => ({ ...d, colors })); setSelected(colors[0]?.id ?? "");
  }
  return <section className="pw-editor">
    <header className="pw-header"><div><p className="pw-eyebrow">{data.catalog.name} · Ficha web</p><h1>Edita cómo se ve tu producto</h1><p className="pw-muted">Una ficha que se siente tan bien como tu marca.</p></div><div className="pw-actions"><span className="pw-muted">{dirty ? "Cambios sin guardar" : unpublished ? "Borrador sin publicar" : "Contenido publicado"} · r{record.revision}</span><button type="button" className="pw-secondary" disabled={busy || stale} onClick={() => void persist(false)}>Guardar borrador</button><button type="button" className="pw-primary" disabled={busy || stale || data.channels.serviceStatus !== "enabled"} onClick={() => void persist(true)}>Publicar cambios</button></div></header>
    <p className="pw-muted">Contenido por producto. La apariencia general y el orden de los botones se configurarán en un bloque posterior. No hay tienda pública ni checkout en esta vista.</p>
    {data.channels.serviceStatus !== "enabled" && <p className="pw-notice">Servicio {data.channels.serviceStatus === "suspended" ? "suspendido" : "no habilitado o no verificable"}: se conserva el contenido y puedes guardar un borrador. Publicación bloqueada.</p>}
    {error && <div role="alert" className="pw-error">{error}{stale && <button type="button" className="pw-secondary" onClick={() => { if (!dirty || window.confirm("Recargar reemplazará los cambios locales sin guardar. ¿Continuar?")) reload(); }}>Recargar versión del servidor</button>}</div>}
    {message && <p role="status" className="pw-notice">{message}</p>}
    <nav className="pw-mobile-nav" aria-label="Ficha web"><button type="button" className={mode === "edit" ? "pw-primary" : "pw-secondary"} onClick={() => setMode("edit")}>Editar</button><button type="button" className={mode === "preview" ? "pw-primary" : "pw-secondary"} onClick={() => setMode("preview")}>Vista previa</button></nav>
    <div className="pw-grid"><div className={`pw-fields ${mode !== "edit" ? "hide-mobile" : ""}`}>
      {channels}
      <fieldset disabled={busy || stale} style={{ border: 0, padding: 0, minWidth: 0 }}>
      <section className="pw-card"><h2>Fotos por color</h2><p className="pw-muted">Asocia las variantes reales que comparten color. La primera foto será su portada.</p>
        {!doc.colors.length && <div className="pw-row"><select aria-label="Atributo de color" value={attribute} onChange={e => setAttribute(e.target.value)}><option value="">Elige el atributo que representa color</option>{attributes.map(a => <option key={a}>{a}</option>)}</select><button type="button" className="pw-secondary" disabled={!attribute} onClick={groupAttribute}>Crear grupos desde variantes</button></div>}
        <div className="pw-swatches">{doc.colors.map(c => <ColorCircle key={c.id} color={c} media={media} selected={c.id === color?.id} onClick={() => setSelected(c.id)} />)}<button type="button" className="pw-secondary" disabled={doc.colors.length >= 40} onClick={addColor}>+ Color</button></div>
        {color && <><label>Nombre del color<input value={color.name} maxLength={80} onChange={e => updateColor({ name: e.target.value })} /></label><div className="pw-row"><label>Tono <input aria-label="Tono del color" type="color" value={color.hex || "#d7d7d0"} onChange={e => updateColor({ hex: e.target.value })} /></label><button type="button" className="pw-link" onClick={() => updateColor({ hex: "", swatchPath: "" })}>Sin tono</button><label className="pw-upload">Subir muestra de tela<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { void addMedia(e.target.files?.[0], "swatch"); e.target.value = ""; }} /></label></div>
          {!color.hex && !color.swatchPath && <p className="pw-muted">El círculo neutral no representa el tono real. Configura un color o una muestra de tela.</p>}
          <details><summary>Variantes asociadas ({color.variantIds.length})</summary><div className="pw-variant-list">{data.catalog.variants.map(v => <label key={v.id}><input type="checkbox" checked={color.variantIds.includes(v.id)} disabled={doc.colors.some(c => c.id !== color.id && c.variantIds.includes(v.id))} onChange={e => updateColor({ variantIds: e.target.checked ? [...color.variantIds, v.id] : color.variantIds.filter(id => id !== v.id) })} />{v.name}{!v.active ? " · inactiva" : ""}</label>)}</div></details>
          <div className="pw-photo-grid">{color.photos.map((p, i) => <div className="pw-photo" key={p.path}><img src={media[p.path]} alt={p.alt || `Foto ${i + 1}`} /><input aria-label={`Descripción foto ${i + 1}`} placeholder="Describe la foto" value={p.alt} maxLength={250} onChange={e => updateColor({ photos: color.photos.map((p, j) => j === i ? { ...p, alt: e.target.value } : p) })} /><div className="pw-actions"><button type="button" onClick={() => updateColor({ photos: [p, ...color.photos.filter((_, j) => j !== i)] })}>{i === 0 ? "Portada" : "Hacer portada"}</button><button type="button" aria-label="Mover foto antes" onClick={() => updateColor({ photos: move(color.photos, i, -1) })}>←</button><button type="button" aria-label="Mover foto después" onClick={() => updateColor({ photos: move(color.photos, i, 1) })}>→</button><button type="button" onClick={() => updateColor({ photos: color.photos.filter((_, j) => j !== i) })}>Quitar</button></div></div>)}</div>
          <label className="pw-upload">+ Agregar foto<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={color.photos.length >= 12} onChange={e => { void addMedia(e.target.files?.[0], "photo"); e.target.value = ""; }} /></label>
          <details><summary>Asignar una foto compartida explícitamente</summary>{[...new Set(doc.colors.flatMap(c => c.photos.map(p => p.path)))].filter(p => !color.photos.some(x => x.path === p)).map(path => <button type="button" className="pw-secondary" key={path} disabled={color.photos.length >= 12} onClick={() => updateColor({ photos: [...color.photos, { path, alt: "" }] })}><img src={media[path]} alt="Foto disponible para asignar" width={50} /></button>)}</details>
          <button type="button" className="pw-link" onClick={() => { setDoc(d => ({ ...d, colors: d.colors.filter(c => c.id !== color.id) })); setSelected(""); }}>Quitar este grupo de la ficha</button>
        </>}
      </section>
      <section className="pw-card"><h2>Beneficios destacados</h2><p className="pw-muted">Añade únicamente propiedades reales de esta prenda.</p>{doc.benefits.map((b, i) => <div className="pw-repeat" key={b.id}><div className="pw-row"><BenefitIcon icon={b.icon} /><select aria-label="Icono" value={b.icon} onChange={e => setDoc(d => ({ ...d, benefits: d.benefits.map(x => x.id === b.id ? { ...x, icon: e.target.value as typeof b.icon } : x) }))}>{WEB_ICONS.map(icon => <option key={icon}>{icon}</option>)}</select><label><input type="checkbox" checked={b.enabled} onChange={e => setDoc(d => ({ ...d, benefits: d.benefits.map(x => x.id === b.id ? { ...x, enabled: e.target.checked } : x) }))} />Mostrar</label></div><label>Título<input maxLength={100} value={b.title} onChange={e => setDoc(d => ({ ...d, benefits: d.benefits.map(x => x.id === b.id ? { ...x, title: e.target.value } : x) }))} /></label><label>Descripción<textarea maxLength={600} value={b.description} onChange={e => setDoc(d => ({ ...d, benefits: d.benefits.map(x => x.id === b.id ? { ...x, description: e.target.value } : x) }))} /></label><div className="pw-actions"><button type="button" className="pw-link" onClick={() => setDoc(d => ({ ...d, benefits: move(d.benefits, i, -1) }))}>Subir</button><button type="button" className="pw-link" onClick={() => setDoc(d => ({ ...d, benefits: move(d.benefits, i, 1) }))}>Bajar</button><button type="button" className="pw-link" onClick={() => setDoc(d => ({ ...d, benefits: d.benefits.filter(x => x.id !== b.id) }))}>Quitar</button></div></div>)}<button type="button" className="pw-secondary" disabled={doc.benefits.length >= 12} onClick={() => setDoc(d => ({ ...d, benefits: [...d.benefits, { id: crypto.randomUUID(), icon: "spark", title: "", description: "", enabled: false }] }))}>+ Añadir beneficio</button></section>
      <details className="pw-card"><summary>Descripción y detalles</summary><div><p className="pw-muted">Texto seguro, sin HTML ejecutable. No se modifica la descripción general del POS.</p>{doc.details.map((x, i) => <div className="pw-repeat" key={x.id}><label>Título<input value={x.title} maxLength={120} onChange={e => setDoc(d => ({ ...d, details: d.details.map(v => v.id === x.id ? { ...v, title: e.target.value } : v) }))} /></label><label>Contenido<textarea value={x.content} maxLength={8000} onChange={e => setDoc(d => ({ ...d, details: d.details.map(v => v.id === x.id ? { ...v, content: e.target.value } : v) }))} /></label><label><input type="checkbox" checked={x.enabled} onChange={e => setDoc(d => ({ ...d, details: d.details.map(v => v.id === x.id ? { ...v, enabled: e.target.checked } : v) }))} />Mostrar</label><label><input type="checkbox" checked={x.open} onChange={e => setDoc(d => ({ ...d, details: d.details.map(v => v.id === x.id ? { ...v, open: e.target.checked } : v) }))} />Abierto al cargar</label><div className="pw-actions"><button type="button" className="pw-link" onClick={() => setDoc(d => ({ ...d, details: move(d.details, i, -1) }))}>Subir</button><button type="button" className="pw-link" onClick={() => setDoc(d => ({ ...d, details: move(d.details, i, 1) }))}>Bajar</button><button type="button" className="pw-link" onClick={() => setDoc(d => ({ ...d, details: d.details.filter(v => v.id !== x.id) }))}>Quitar</button></div></div>)}<button type="button" className="pw-secondary" disabled={doc.details.length >= 12} onClick={() => setDoc(d => ({ ...d, details: [...d.details, { id: crypto.randomUUID(), title: "", content: "", enabled: false, open: false }] }))}>+ Añadir desplegable</button></div></details>
      <details className="pw-card"><summary>Guía de tallas</summary><div><label>Contenido<textarea value={doc.guide.content} maxLength={8000} onChange={e => setDoc(d => ({ ...d, guide: { ...d.guide, content: e.target.value } }))} /></label><label>Tabla · columnas separadas por tabulador; primera fila = encabezados<textarea aria-label="Tabla de tallas" defaultValue={[doc.guide.columns, ...doc.guide.rows].filter(r => r.length).map(r => r.join("\t")).join("\n")} onChange={e => { const [columns = [], ...rows] = e.target.value ? e.target.value.split("\n").map(r => r.split("\t")) : []; setDoc(d => ({ ...d, guide: { ...d.guide, columns, rows } })); }} /></label><label className="pw-upload">Subir imagen de guía<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={e => { void addMedia(e.target.files?.[0], "guide"); e.target.value = ""; }} /></label>{doc.guide.imagePath && <button type="button" className="pw-link" onClick={() => setDoc(d => ({ ...d, guide: { ...d.guide, imagePath: "" } }))}>Quitar imagen de guía</button>}</div></details>
      <details className="pw-card"><summary>Completa tu look</summary><div><div className="pw-row"><input aria-label="Buscar productos de la marca" placeholder="Buscar productos de esta marca" value={query} onChange={e => setQuery(e.target.value)} /><button type="button" className="pw-secondary" onClick={async () => { try { setResults(await search(query)); } catch { setError("No se pudieron buscar los productos."); } }}>Buscar</button></div><p className="pw-muted">Hasta 30 resultados por búsqueda. Refina el nombre para encontrar otro producto.</p>{results.filter(p => p.id !== data.catalog.id && !doc.relatedIds.includes(p.id)).map(p => <button type="button" className="pw-secondary" key={p.id} disabled={doc.relatedIds.length >= 12} onClick={() => { setRelated(r => [...r.filter(x => x.id !== p.id), p]); setDoc(d => ({ ...d, relatedIds: [...d.relatedIds, p.id] })); }}>+ {p.name}</button>)}{doc.relatedIds.map((id, i) => <div className="pw-row" key={id}><span>{related.find(p => p.id === id)?.name ?? "Producto no disponible"}</span><button type="button" className="pw-link" onClick={() => setDoc(d => ({ ...d, relatedIds: move(d.relatedIds, i, -1) }))}>Subir</button><button type="button" className="pw-link" onClick={() => setDoc(d => ({ ...d, relatedIds: d.relatedIds.filter(v => v !== id) }))}>Quitar</button></div>)}</div></details>
      <details className="pw-card"><summary>Información de mayoreo</summary><div><label><input type="checkbox" checked={doc.wholesale.enabled} onChange={e => setDoc(d => ({ ...d, wholesale: { ...d.wholesale, enabled: e.target.checked } }))} />Mostrar información</label><label>Título<input value={doc.wholesale.title} maxLength={120} onChange={e => setDoc(d => ({ ...d, wholesale: { ...d.wholesale, title: e.target.value } }))} /></label><label>Condiciones reales<textarea value={doc.wholesale.content} maxLength={4000} onChange={e => setDoc(d => ({ ...d, wholesale: { ...d.wholesale, content: e.target.value } }))} /></label><p className="pw-muted">Contenido informativo. No configura descuentos ni modifica precios.</p></div></details>
      </fieldset>
    </div><section className={`pw-preview pw-card ${previewPhone ? "phone" : ""} ${mode !== "preview" ? "hide-mobile" : ""}`}><div className="pw-preview-head"><div><h2>Vista previa</h2><small className="pw-muted">Incluye los cambios sin guardar.</small></div><div className="pw-actions"><button type="button" className={!previewPhone ? "pw-primary" : "pw-secondary"} onClick={() => setPreviewPhone(false)}>Escritorio</button><button type="button" className={previewPhone ? "pw-primary" : "pw-secondary"} onClick={() => setPreviewPhone(true)}>Móvil</button></div></div><label><input type="checkbox" checked={publishedPreview} disabled={!record.published} onChange={e => setPublishedPreview(e.target.checked)} />Ver versión publicada {record.publishedRevision ? `r${record.publishedRevision}` : "(aún no existe)"}</label><ProductWebPreview content={publishedPreview && record.published ? record.published : doc} catalog={data.catalog} media={media} related={related} /></section></div>
  </section>;
}

export function ProductWebEditor({ brandSlug, productId, locationId, onDirtyChange }: { brandSlug: string; productId: string | null; locationId?: string; onDirtyChange?: (dirty: boolean) => void }) {
  const posFetch = usePosFetch();
  const [data, setData] = useState<WebEditorData | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const url = `/api/pos/products/${productId}/web?brandSlug=${encodeURIComponent(brandSlug)}${locationId ? `&locationId=${encodeURIComponent(locationId)}` : ""}`;
  useEffect(() => {
    if (!productId) return;
    let current = true;
    posFetch(url).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo cargar la ficha."); if (current) { setData(body); setError(""); } }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [url, productId, posFetch, reload]);
  if (!productId) return <div className="pw-editor"><h2>Ficha web</h2><p>Guarda primero el producto y sus variantes en POS. Después podrás preparar su presentación web.</p></div>;
  if (error) return <div className="pw-editor" role="alert">{error}<button type="button" className="pw-secondary" onClick={() => setReload(n => n + 1)}>Reintentar</button></div>;
  if (!data) return <div className="pw-editor" role="status">Cargando ficha web…</div>;
  return <WebEditorSurface key={reload} data={data} onDirtyChange={onDirtyChange} channels={<ProductSalesChannels brandSlug={brandSlug} productId={productId} />} reload={() => { setData(null); setReload(n => n + 1); }} save={async (document, revision, publish) => {
    const response = await posFetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document, revision, publish }) });
    const body = await response.json(); if (!response.ok) throw Object.assign(new Error(body.error || "No se pudo guardar."), { code: body.code }); return body.web;
  }} upload={async file => {
    const form = new FormData(); form.set("file", file);
    const response = await posFetch(`/api/pos/product-images?brandSlug=${encodeURIComponent(brandSlug)}&purpose=web`, { method: "POST", body: form });
    const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo cargar la imagen."); return body;
  }} search={async query => { const response = await posFetch(`${url}&search=${encodeURIComponent(query)}`); const body = await response.json(); if (!response.ok) throw new Error(body.error); return body.products; }} />;
}
