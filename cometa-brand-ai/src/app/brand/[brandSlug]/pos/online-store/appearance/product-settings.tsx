"use client";
import { defaultProduct, type ProductConfig } from "../../../../../../../packages/own-storefront/product-contract";
export function ProductSettings({ value = defaultProduct(), onChange }: { value?: ProductConfig; onChange: (value: ProductConfig) => void }) {
  const set = (patch: Partial<ProductConfig>) => onChange({ ...value, ...patch });
  const labels = { heading: "Nombre", price: "Precio", selection: "Colores y variantes", guide: "Guía de tallas", benefits: "Beneficios", buy: "Cantidad y bolsa", details: "Detalles", wholesale: "Mayoreo", related: "Completa tu look" };
  return <details open className="sa-panel"><summary>Producto · ficha pública</summary><p>El contenido de cada prenda se edita en Productos ? Ficha web. Ocultar la selección no elige una variante automáticamente: solo un enlace con variante válida permitirá agregar.</p>
    {(["buyText", "guideText", "relatedText"] as const).map(k => <label key={k}>{({ buyText: "Botón de bolsa", guideText: "Guía", relatedText: "Productos relacionados" })[k]}<input maxLength={80} value={value[k]} onChange={e => set({ [k]: e.target.value })} /></label>)}
    <label>Espacio entre bloques<input type="number" min={8} max={48} value={value.gap} onChange={e => set({ gap: Number(e.target.value) })} /></label>
    <label>Galería<select value={value.gallery} onChange={e => set({ gallery: e.target.value as ProductConfig["gallery"] })}><option value="compact">Imagen y miniaturas</option><option value="grid">Cuadrícula adicional</option></select></label>
    <label>Fotografías<select value={value.fit} onChange={e => set({ fit: e.target.value as ProductConfig["fit"] })}><option value="cover">Llenar encuadre</option><option value="contain">Imagen completa</option></select></label>
    <label><input type="checkbox" checked={value.sticky} onChange={e => set({ sticky: e.target.checked })} />Barra de bolsa fija en teléfono</label>
    {value.blocks.map((b, index) => <div key={b.kind}><label><input type="checkbox" checked={b.enabled} onChange={e => set({ blocks: value.blocks.map(x => x.kind === b.kind ? { ...x, enabled: e.target.checked } : x) })} />{labels[b.kind]}</label>{[-1, 1].map(step => <button type="button" key={step} disabled={index + step < 0 || index + step >= value.blocks.length} aria-label={`${step < 0 ? "Subir" : "Bajar"} ${labels[b.kind]}`} onClick={() => { const blocks = [...value.blocks]; [blocks[index], blocks[index + step]] = [blocks[index + step], blocks[index]]; set({ blocks }); }}>{step < 0 ? "↑" : "↓"}</button>)}</div>)}
  </details>;
}
