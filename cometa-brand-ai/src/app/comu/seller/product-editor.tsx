"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CatalogSnapshot } from "@/lib/comu/seller-catalog";

type Variant = { id?: string; name: string; sku: string; price: string; attributes: string; stock: Array<{ locationId: string; quantity: string; expectedQuantity: number; reserved: number; changed: boolean }> };
const fresh = (): Variant => ({ name: "Única", sku: "", price: "0", attributes: "{}", stock: [] });
const field = "rounded-lg border border-white/20 bg-[#0b1712] p-2 text-white w-full";
export default function ProductEditor({ sellerId, productId, done, cancel }: { sellerId: string; productId?: string; done: () => Promise<void>; cancel: () => void }) {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [category, setCategory] = useState(""); const [code, setCode] = useState("");
  const [variants, setVariants] = useState<Variant[]>([fresh()]); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const pending = useRef(false); const retry = useRef<{ json: string; requestId: string } | null>(null);
  useEffect(() => {
    let active = true;
    void fetch(`/api/comu/seller/catalog?sellerId=${encodeURIComponent(sellerId)}`, { cache: "no-store" }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo cargar el catálogo.");
      if (!active) return; const state = data as CatalogSnapshot;
      const product = state.products.find(p => p.id === productId);
      if (productId && !product) throw new Error("El producto ya no está disponible.");
      setSnapshot(state);
      if (product) {
        setName(product.name); setDescription(product.description || ""); setCode(product.product_code || ""); setCategory(state.categories.find(c => c.id === product.category_id)?.name || "");
        setVariants(state.variants.filter(v => v.product_id === productId).map(v => ({ id: v.id, name: v.name, sku: v.sku || "", price: String(v.price), attributes: JSON.stringify(v.attributes), stock: state.inventory.filter(i => i.variant_id === v.id).map(i => ({ locationId: i.location_id, quantity: String(i.quantity), expectedQuantity: Number(i.quantity), reserved: Number(i.reserved_quantity), changed: false })) })));
      }
    }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : "No se pudo cargar."); });
    return () => { active = false; };
  }, [sellerId, productId]);
  function patch(index: number, value: Partial<Variant>) { setVariants(rows => rows.map((row, i) => i === index ? { ...row, ...value } : row)); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!snapshot || pending.current) return; pending.current = true; setBusy(true); setMessage("");
    try {
      const product = { id: productId, expectedUpdatedAt: snapshot.products.find(p => p.id === productId)?.updated_at, name, description, productCode: code, categoryName: category, variants: variants.map(v => ({ id: v.id, name: v.name, sku: v.sku, price: Number(v.price), attributes: JSON.parse(v.attributes), stock: v.stock.filter(s => s.changed).map(s => ({ locationId: s.locationId || null, quantity: Number(s.quantity), expectedQuantity: s.expectedQuantity })) })) };
      const json = JSON.stringify(product); if (retry.current?.json !== json) retry.current = { json, requestId: crypto.randomUUID() };
      const response = await fetch("/api/comu/seller/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerId, requestId: retry.current.requestId, product }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      await done(); cancel();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar. Puedes reintentar sin duplicar."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <form onSubmit={save} className="my-5 space-y-4 rounded-xl border border-white/20 bg-[#0b1712] p-5 text-white">
    <h2 className="text-xl font-bold">{productId ? "Editar producto" : "Agregar producto"}</h2>
    <p className="text-sm text-slate-300">Guardar prepara un borrador COMU. La activación de tu tienda depende de COMETA.</p>
    {!snapshot && <p>Cargando catálogo…</p>}
    <label className="block">Nombre<input className={field} required maxLength={180} value={name} onChange={e => setName(e.target.value)} /></label>
    <label className="block">Descripción<textarea className={field} maxLength={1500} value={description} onChange={e => setDescription(e.target.value)} /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label>Categoría<input className={field} maxLength={100} value={category} onChange={e => setCategory(e.target.value)} /></label><label>Código de producto<input className={field} maxLength={80} value={code} onChange={e => setCode(e.target.value)} /></label></div>
    {variants.map((v, index) => <fieldset key={v.id || index} className="space-y-3 rounded-xl border border-white/15 p-3"><legend>Variante {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-3"><label>Nombre<input className={field} required value={v.name} onChange={e => patch(index, { name: e.target.value })} /></label><label>SKU<input className={field} value={v.sku} onChange={e => patch(index, { sku: e.target.value })} /></label><label>Precio MXN<input className={field} required type="number" min="0" step="0.01" value={v.price} onChange={e => patch(index, { price: e.target.value })} /></label></div>
      <label className="block">Atributos (JSON, por ejemplo talla y color)<input className={field} required value={v.attributes} placeholder={'{"talla":"M","color":"Azul"}'} onChange={e => patch(index, { attributes: e.target.value })} /></label>
      {v.stock.map((s, i) => <div key={i} className="grid gap-2 sm:grid-cols-2"><label>Ubicación<select className={field} value={s.locationId} disabled={s.expectedQuantity !== 0 || s.reserved !== 0} onChange={e => patch(index, { stock: v.stock.map((x, n) => n === i ? { ...x, locationId: e.target.value, changed: true } : x) })}><option value="">{snapshot?.locations.length ? "Selecciona ubicación" : "Crear almacén COMU"}</option>{snapshot?.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Cantidad física · {s.reserved} reservadas<input className={field} type="number" required min={s.reserved} step="0.001" value={s.quantity} onChange={e => patch(index, { stock: v.stock.map((x, n) => n === i ? { ...x, quantity: e.target.value, changed: true } : x) })} /></label></div>)}
      <button type="button" className="underline" onClick={() => patch(index, { stock: [...v.stock, { locationId: snapshot?.locations[0]?.id || "", quantity: "0", expectedQuantity: 0, reserved: 0, changed: true }] })}>Agregar stock por ubicación</button>
    </fieldset>)}
    <button type="button" className="mr-4 underline" onClick={() => setVariants(rows => [...rows, { ...fresh(), name: "Nueva variante" }])}>Agregar variante</button>
    {message && <p role="alert" className="text-amber-200">{message}</p>}
    {productId && snapshot?.listings.find(l => l.product_id === productId) && <ProductMedia sellerId={sellerId} listingId={snapshot.listings.find(l => l.product_id === productId)?.id || ""} />}
    <div className="flex gap-4"><button disabled={busy || !snapshot} className="rounded-lg bg-emerald-300 px-4 py-2 font-bold text-black disabled:opacity-50">{busy ? "Guardando…" : "Guardar producto"}</button><button type="button" disabled={busy} onClick={cancel}>Cerrar</button></div>
  </form>;
}

function ProductMedia({ sellerId, listingId }: { sellerId: string; listingId: string }) {
  const [media, setMedia] = useState<Array<{ id: string; public_url: string }>>([]);
  const [message, setMessage] = useState(""); const [revision, setRevision] = useState(0); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch(`/api/comu/media?sellerId=${encodeURIComponent(sellerId)}&listingId=${encodeURIComponent(listingId)}`, { cache: "no-store" }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error("No se pudieron consultar las imágenes.");
      if (active) setMedia(data.media || []);
    }).catch(() => { if (active) setMessage("No se pudieron consultar las imágenes."); });
    return () => { active = false; };
  }, [sellerId, listingId, revision]);
  async function mutate(file?: File, mediaId?: string) {
    if (busy) return; setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("sellerId", sellerId); form.set("listingId", listingId); if (file) form.set("file", file);
      const response = await fetch("/api/comu/media", file ? { method: "POST", body: form } : { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerId, mediaId }) });
      if (!response.ok) throw new Error("No se pudo actualizar la imagen."); setRevision(n => n + 1);
    } catch { setMessage("No se pudo actualizar la imagen. Reintenta."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3"><h3>Imágenes del producto</h3><input type="file" disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void mutate(file); e.currentTarget.value = ""; }} /><div className="flex flex-wrap gap-4">{media.map(item => <div key={item.id}><Image unoptimized width={96} height={96} src={item.public_url} alt="Imagen del producto" className="h-24 w-24 object-cover" /><button type="button" disabled={busy} onClick={() => void mutate(undefined, item.id)}>Eliminar imagen</button></div>)}</div>{message && <p role="status">{message}</p>}</section>;
}
