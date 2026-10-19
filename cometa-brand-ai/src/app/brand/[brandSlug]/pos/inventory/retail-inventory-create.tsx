"use client";
import { useEffect, useRef, useState } from "react";
type Row = { key: string; size: string; color: string; sku: string; quantity: string; selected: boolean };
function InitialQuantityMatrix({rows,update}:{rows:Row[];update:(index:number,field:Partial<Row>)=>void}) {
  const sizes=[...new Set(rows.map(r=>r.size))],colors=[...new Set(rows.map(r=>r.color))];
  if(!rows.length)return null;
  return <div className="table-scroll mt-3"><table><thead><tr><th>Color / talla</th>{sizes.map(s=><th key={s}>{s||"Única"}</th>)}</tr></thead><tbody>{colors.map(color=><tr key={color}><th>{color||"Único"}</th>{sizes.map(size=>{const index=rows.findIndex(r=>r.color===color&&r.size===size),row=rows[index];return <td key={size}><label className="text-xs"><input type="checkbox" checked={row.selected} onChange={e=>update(index,{selected:e.target.checked})}/>Vender combinación</label><input aria-label={`Inicial matriz ${color} ${size}`} type="number" min="0" step="1" placeholder="0" disabled={!row.selected} value={row.quantity} onChange={e=>update(index,{quantity:e.target.value})}/></td>;})}</tr>)}</tbody></table></div>;
}
export function RetailInventoryCreate({ brandSlug, locationId, onClose, onSaved }: { brandSlug: string; locationId: string; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), request = useRef<{ key: string; body: string } | null>(null);
  const [name, setName] = useState(""), [code, setCode] = useState(""), [price, setPrice] = useState(""), [cost, setCost] = useState("");
  const [sizes, setSizes] = useState(""), [colors, setColors] = useState(""), [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [review, setReview] = useState(false);
  const [attributes, setAttributes] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => {
    dialog.current?.showModal();
    fetch(`/api/pos/product-config?brandSlug=${encodeURIComponent(brandSlug)}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setAttributes(d.attributes || []); }).catch(e => setError(e.message));
  }, [brandSlug]);
  function close() { if (busy || uncertain) return; if (name && !confirm("¿Descartar el producto sin guardar?")) return; onClose(); }
  function generate() {
    if (!name.trim() || !/^[A-Za-z0-9_-]+$/.test(code)) { setError("Indica nombre y un código base con letras, números o guiones."); return; }
    const sizeList = [...new Set(sizes.split(",").map(v => v.trim()).filter(Boolean))], colorList = [...new Set(colors.split(",").map(v => v.trim()).filter(Boolean))];
    const next: Row[] = []; for (const color of colorList.length ? colorList : [""]) for (const size of sizeList.length ? sizeList : [""]) {
      const key = JSON.stringify([size, color]); const old = rows.find(r => r.key === key);
      next.push(old || { key, size, color, sku: `${code.toUpperCase()}-${String(next.length + 1).padStart(3, "0")}`, quantity: "", selected: true });
    }
    if (next.length > 250) { setError("Usa hasta 250 combinaciones por modelo."); return; } setRows(next); setError("");
  }
  async function save() {
    if (busy) return;
    try {
      const selected = rows.filter(r => r.selected); if (!selected.length) throw new Error("Selecciona las combinaciones que vendes.");
      if (!price.trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || cost !== "" && (!Number.isFinite(Number(cost)) || Number(cost) < 0)) throw new Error("Revisa precio y costo.");
      if (selected.some(r => !r.sku.trim() || !Number.isSafeInteger(Number(r.quantity || 0)) || Number(r.quantity || 0) < 0) || new Set(selected.map(r => r.sku.trim().toUpperCase())).size !== selected.length) throw new Error("Revisa códigos únicos y cantidades enteras.");
      const sizeKey = attributes.find(a => ["size", "talla"].includes(a.code))?.code, colorKey = attributes.find(a => ["color", "colour"].includes(a.code))?.code;
      if (selected.some(r => r.size && !sizeKey || r.color && !colorKey)) throw new Error("El perfil no tiene estos atributos habilitados. Configúralos desde Productos antes de generar variantes.");
      if (!review) { setReview(true); return; }
      const body = JSON.stringify({ brandSlug, locationId, name, productCode: code, productType: "physical", inventoryMode: "direct", defaultUnitCode: "piece", hasVariants: selected.some(r => r.size || r.color), sellable: true, purchasable: true, variants: selected.map(r => ({ name: [r.size, r.color].filter(Boolean).join(" / ") || "Única", sku: r.sku, price: Number(price), cost: cost === "" ? undefined : Number(cost), initialQuantity: Number(r.quantity || 0), attributes: { ...(r.size && sizeKey ? { [sizeKey]: r.size } : {}), ...(r.color && colorKey ? { [colorKey]: r.color } : {}) }, configuration: { costKnown: cost !== "" } })) });
      if (!request.current) request.current = { key: crypto.randomUUID(), body };
      if (request.current.body !== body) throw new Error("Reintenta los datos originales antes de cambiarlos.");
      setBusy(true); setError("");
      let response: Response;
      try { response = await fetch("/api/pos/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body), requestId: request.current.key }) }); } catch { setUncertain(true); throw new Error("Confirmación pendiente. Reintenta: se conserva la misma clave para evitar duplicados."); }
      const data = await response.json(); if (!response.ok) { if (!uncertain) request.current = null; throw new Error(data.error || "No se creó el producto."); } onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); } finally { setBusy(false); }
  }
  function update(index: number, field: Partial<Row>) { setRows(old => old.map((v, i) => i === index ? { ...v, ...field } : v)); }
  return <dialog ref={dialog} className="inventory-dialog" onCancel={e => { e.preventDefault(); close(); }}><div className="dialog-layout"><header className="dialog-header"><h2>Nuevo producto</h2><button disabled={busy || uncertain} onClick={close}>Cerrar</button></header><div className="dialog-content"><fieldset disabled={busy || review || uncertain}><div className="grid gap-3 sm:grid-cols-2"><label>Nombre<input value={name} onChange={e => setName(e.target.value)} maxLength={180}/></label><label>Código base<input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={60}/></label><label>Precio<input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)}/></label><label>Costo opcional<input type="number" step="0.01" min="0" placeholder="No informado" value={cost} onChange={e => setCost(e.target.value)}/></label><label>Tallas, separadas por coma<input placeholder="Tallas de este modelo" value={sizes} onChange={e => setSizes(e.target.value)}/></label><label>Colores, separados por coma<input placeholder="Colores de este modelo" value={colors} onChange={e => setColors(e.target.value)}/></label></div><p className="my-2">Sin variantes: deja tallas y colores vacíos. Desmarca las combinaciones que no vendes.</p><button onClick={generate}>Preparar combinaciones y códigos</button><InitialQuantityMatrix rows={rows} update={update}/><details><summary>Revisar y ajustar los SKU</summary><div className="table-scroll"><table><thead><tr><th>Vender</th><th>Color / talla</th><th>SKU único</th><th>Existencia inicial</th></tr></thead><tbody>{rows.map((r, index) => <tr key={r.key}><td><input type="checkbox" aria-label={`Vender ${r.color} ${r.size}`} checked={r.selected} onChange={e => update(index, { selected: e.target.checked })}/></td><td>{[r.color, r.size].filter(Boolean).join(" / ") || "Única"}</td><td><input aria-label={`SKU ${r.color} ${r.size}`} value={r.sku} onChange={e => update(index, { sku: e.target.value })}/></td><td><input aria-label={`Inicial ${r.color} ${r.size}`} type="number" min="0" step="1" disabled={!r.selected} value={r.quantity} onChange={e => update(index, { quantity: e.target.value })}/></td></tr>)}</tbody></table></div></details></fieldset>{review && <p className="review">{name} · {rows.filter(r => r.selected).length} variantes · {rows.filter(r => r.selected).reduce((s, r) => s + Number(r.quantity || 0), 0)} piezas iniciales. Se crearán juntas en una sola transacción.</p>}</div><footer className="dialog-footer">{error && <p role="alert" className="text-rose-400">{error}</p>}<div className="flex justify-end gap-2">{review && !uncertain && <button disabled={busy} onClick={() => setReview(false)}>Revisar datos</button>}<button className="primary" disabled={busy || !rows.length} onClick={() => void save()}>{busy ? "Guardando…" : uncertain ? "Reintentar guardado" : review ? "Crear modelo y entrada inicial" : "Revisar producto"}</button></div></footer></div></dialog>;
}
