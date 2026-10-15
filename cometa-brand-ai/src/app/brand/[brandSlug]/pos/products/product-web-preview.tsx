"use client";
/* eslint-disable @next/next/no-img-element -- POS managed media previews use original uploaded URLs without a new image proxy. */
import { useState } from "react";
import { webPhotos, type WebCatalog, type WebColor, type WebContent, type WebIcon } from "@/lib/pos/product-web-contract";

export function BenefitIcon({ icon }: { icon: WebIcon }) {
  const paths: Record<WebIcon, string> = { spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z", layers: "m2 8 10-6 10 6-10 6ZM2 12l10 6 10-6M2 16l10 6 10-6", heart: "M12 21S2 15 2 8c0-6 8-7 10-1 2-6 10-5 10 1 0 7-10 13-10 13Z", feather: "M4 20 17 7M7 17C-2 4 18-4 21 3s-5 19-14 14Z", shield: "m12 2 9 4v7c0 5-9 9-9 9s-9-4-9-9V6ZM7 12l3 3 7-7", ruler: "m2 16 14-14 6 6L8 22ZM7 11l3 3m1-7 3 3m1-7 3 3" };
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={paths[icon]} /></svg>;
}
export function ColorCircle({ color, media, selected, onClick }: { color: WebColor; media: Record<string, string>; selected: boolean; onClick: () => void }) {
  return <button type="button" className={`pw-swatch ${selected ? "selected" : ""} ${!color.hex && !color.swatchPath ? "neutral" : ""}`} title={`${color.name || "Sin nombre"}${!color.hex && !color.swatchPath ? " · tono pendiente de configurar" : ""}`} aria-label={`Color ${color.name || "sin nombre"}`} aria-pressed={selected} onClick={onClick} style={{ backgroundColor: color.hex || undefined }}>
    {color.swatchPath && media[color.swatchPath] ?  <img src={media[color.swatchPath]} alt="" /> : null}
    {!color.hex && !color.swatchPath ? <span aria-hidden="true">?</span> : null}
  </button>;
}
export function ProductWebPreview({ content, catalog, media, related }: { content: WebContent; catalog: WebCatalog; media: Record<string, string>; related: { id: string; name: string }[] }) {
  const [colorId, setColorId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const color = content.colors.find(c => c.id === colorId) ?? content.colors[0];
  const photos = color ? webPhotos(content, color.id) : [];
  const variants = catalog.variants.filter(v => v.active && (color ? color.variantIds.includes(v.id) : !content.colors.length));
  const variant = variants.find(v => v.id === variantId) ?? variants[0];
  const photo = photos[photoIndex] ?? photos[0];
  const hasGuide = Boolean(content.guide.content || content.guide.imagePath || content.guide.rows.length);
  return <div className="pw-store">
    <header className="pw-store-header"><span aria-hidden="true">☰</span><strong>{catalog.brandName}</strong><span aria-hidden="true">◇</span></header>
    <div className="pw-store-product">
      <div className="pw-gallery">
        <div className="pw-hero-image">{photo && media[photo.path] ?  <img src={media[photo.path]} alt={photo.alt || catalog.name} /> : <p>Sin fotos asignadas a este color</p>}</div>
        <div className="pw-thumbnails">{photos.map((p, i) => <button type="button" key={p.path} aria-label={`Ver foto ${i + 1}`} aria-pressed={p === photo} onClick={() => setPhotoIndex(i)}><img src={media[p.path]} alt={p.alt} /></button>)}</div>
      </div>
      <div className="pw-store-info"><p className="pw-eyebrow">{catalog.brandName}</p><h2>{catalog.name}</h2>
        <strong className="pw-price">{variant && catalog.currency ? new Intl.NumberFormat("es-MX", { style: "currency", currency: catalog.currency }).format(variant.price) : "Moneda o variante no disponible"}</strong>
        <div className="pw-benefits-preview">{content.benefits.filter(b => b.enabled && b.title).map(b => <div key={b.id}><BenefitIcon icon={b.icon} /><span>{b.title}{b.description && <small>{b.description}</small>}</span></div>)}</div>
        {color && <><p>Color: <strong>{color.name}</strong></p><div className="pw-swatches">{content.colors.map(c => <ColorCircle key={c.id} color={c} media={media} selected={c.id === color.id} onClick={() => { setColorId(c.id); setVariantId(""); setPhotoIndex(0); }} />)}</div></>}
        <p>Talla / variante</p><div className="pw-sizes">{variants.map(v => <button type="button" key={v.id} aria-pressed={v.id === variant?.id} onClick={() => setVariantId(v.id)}>{v.name}</button>)}</div>
        {hasGuide && <button type="button" className="pw-link" onClick={() => setGuideOpen(true)}>Guía de tallas ↗</button>}
        <p className="pw-muted">{variant ? variant.available > 0 ? `${variant.available} disponibles en el alcance de inventario consultado` : "Agotado" : "Sin variantes activas para este color"}</p>
        <button type="button" className="pw-buy" disabled>Agregar a bolsa · vista previa</button><small className="pw-muted">No genera pedidos ni reserva inventario.</small>
      </div>
    </div>
    {content.details.filter(d => d.enabled && d.title && d.content).map(d => <details className="pw-preview-detail" key={`${d.id}-${d.open}`} open={d.open}><summary>{d.title}</summary><div className="pw-prose">{d.content}</div></details>)}
    {content.wholesale.enabled && content.wholesale.content && <section className="pw-wholesale"><h3>{content.wholesale.title}</h3><p className="pw-prose">{content.wholesale.content}</p></section>}
    {content.relatedIds.length > 0 && <section className="pw-look"><h3>Completa tu look</h3>{content.relatedIds.map(id => { const p = related.find(r => r.id === id); return p ? <span key={id}>{p.name}</span> : null; })}</section>}
    {guideOpen && <div className="pw-guide-overlay" role="dialog" aria-modal="true" aria-label="Guía de tallas" onKeyDown={e => { if (e.key === "Escape") setGuideOpen(false); }}><div><button type="button" autoFocus className="pw-secondary" onClick={() => setGuideOpen(false)}>Cerrar guía ×</button><h3>Guía de tallas</h3><div className="pw-prose">{content.guide.content}</div>
      {content.guide.imagePath && media[content.guide.imagePath] &&  <img src={media[content.guide.imagePath]} alt="Guía de tallas" />}
      {content.guide.rows.length > 0 && <div className="pw-table-scroll"><table><thead><tr>{content.guide.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead><tbody>{content.guide.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
    </div></div>}
  </div>;
}
