"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CatalogSnapshot } from "@/lib/comu/seller-catalog";
import { COMU_VARIANT_LIMIT, generateCombinations, generateMissingSkus, reconcileVariants, normalizeProductCode, validateSku, variantSignature, type JsonValue } from "@/lib/pos/product-variants";
import ProductEditorMedia, { type ProductMediaHandle } from "./product-editor-media";
import "./product-editor.css";

type Stock = { locationId: string; quantity: string; expectedQuantity: number; reserved: number; changed: boolean };
type Variant = { id: string | null; localId: string; name: string; sku: string; price: string; attributes: Record<string, JsonValue>; active: boolean; stock: Stock[]; skuOrigin: "saved" | "auto" | "manual" };
type Tier = { minQuantity: number; pricingMode: "UNIT_PRICE" | "AMOUNT_OFF" | "PERCENT_OFF"; value: number };
type Wholesale = { mode: "STORE" | "CUSTOM" | "DISABLED"; tiers: Tier[]; allowProductMix: boolean; allowVariantMix: boolean; allowPieces: boolean; allowRun: boolean; corridaEnabled: boolean; runName?: string; runItems: { variantListingId: string; quantityPerRun: number }[] };
const emptyWholesale = (): Wholesale => ({ mode: "DISABLED", tiers: [], allowProductMix: false, allowVariantMix: true, allowPieces: true, allowRun: false, corridaEnabled: false, runItems: [] });
const fresh = (): Variant => ({ id: null, localId: crypto.randomUUID(), name: "Única", sku: "", price: "0", attributes: {}, active: true, stock: [], skuOrigin: "saved" });
const isText = (attributes: Record<string, JsonValue>): attributes is Record<string, string> => Object.values(attributes).every(value => typeof value === "string");
const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options }); const data = await response.json();
  if (!response.ok || data.ok === false) throw Object.assign(new Error(data.error || "No se pudo completar la operación."), { status: response.status });
  return data as T;
}
const jsonRequest = (method: string, data: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
export function loadEditorVariants(state: CatalogSnapshot, productId?: string): Variant[] {
  const rows = state.variants.filter(v => v.product_id === productId).map(v => ({ id: v.id, localId: v.id, name: v.name, sku: v.sku || "", price: String(v.price), attributes: v.attributes, active: v.active !== false, skuOrigin: "saved" as const, stock: state.inventory.filter(i => i.variant_id === v.id).map(i => ({ locationId: i.location_id, quantity: String(i.quantity), expectedQuantity: Number(i.quantity), reserved: Number(i.reserved_quantity), changed: false })) }));
  return rows.length ? rows : [fresh()];
}
export function catalogPayload(snapshot: CatalogSnapshot, productId: string | undefined, fields: { name: string; description: string; category: string; code: string }, variants: Variant[]) {
  const previous = snapshot.products.find(p => p.id === productId);
  const unchangedCategory = previous && fields.category === (snapshot.categories.find(c => c.id === previous.category_id)?.name || "");
  const unchangedCode = previous && snapshot.variantContract && fields.code === (previous.product_code || "");
  return { id: productId, expectedUpdatedAt: previous?.updated_at, name: fields.name, description: fields.description,
    ...(unchangedCategory ? { categoryId: previous.category_id } : { categoryName: fields.category }),
    // V3A explicitly preserves an omitted code; avoids even trimming legacy whitespace.
    ...(unchangedCode ? {} : { productCode: normalizeProductCode(fields.code, previous?.product_code ?? (previous ? "" : undefined)) }),
    variants: variants.map(v => { const old = snapshot.variants.find(row => row.id === v.id); return { id: v.id || undefined, name: v.name, sku: validateSku(v.sku, old?.sku ?? (old ? "" : undefined)), price: Number(v.price), attributes: v.attributes, ...(snapshot.variantContract ? { active: v.active } : {}), stock: v.stock.filter(s => s.changed).map(s => ({ locationId: s.locationId || null, quantity: Number(s.quantity), expectedQuantity: s.expectedQuantity })) }; }) };
}

export default function ProductEditor({ sellerId, productId, done, cancel }: { sellerId: string; productId?: string; done: () => Promise<void>; cancel: () => void }) {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [id, setId] = useState(productId), [listingId, setListingId] = useState<string>();
  const [name, setName] = useState(""), [description, setDescription] = useState(""), [category, setCategory] = useState(""), [code, setCode] = useState("");
  const [variants, setVariants] = useState<Variant[]>([fresh()]), [selections, setSelections] = useState<Record<string, string[]>>({});
  const [basePrice, setBasePrice] = useState("0"), [preview, setPreview] = useState("");
  const [wholesale, setWholesale] = useState<Wholesale>(emptyWholesale()), [wholesaleDirty, setWholesaleDirty] = useState(false), [wholesaleReady, setWholesaleReady] = useState(!productId);
  const [status, setStatus] = useState("DRAFT"), [sellerStatus, setSellerStatus] = useState("");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [locked, setLocked] = useState(false);
  const media = useRef<ProductMediaHandle>(null), pending = useRef(false);
  const attempt = useRef<{ body: ReturnType<typeof catalogPayload>; requestId: string; target: string; catalog?: { productId: string; listingId: string }; wholesaleDone?: boolean; published?: boolean } | null>(null);
  function hydrate(state: CatalogSnapshot, selectedId?: string) {
    const product = state.products.find(p => p.id === selectedId); if (selectedId && !product) throw new Error("El producto ya no está disponible.");
    setSnapshot(state); setId(selectedId);
    if (product) { setName(product.name); setDescription(product.description || ""); setCategory(state.categories.find(c => c.id === product.category_id)?.name || ""); setCode(product.product_code || ""); }
    const rows = loadEditorVariants(state, selectedId); setVariants(rows); setBasePrice(rows[0]?.price || "0");
    setSelections(Object.fromEntries((state.attributeDefinitions || []).map(def => [def.code, [...new Set(rows.filter(v => v.active).map(v => v.attributes[def.code]).filter((v): v is string => typeof v === "string" && !!v))]])));
    const listing = state.listings.find(l => l.product_id === selectedId); setListingId(listing?.id); setStatus(listing?.status || "DRAFT");
  }
  useEffect(() => {
    let alive = true;
    void api<CatalogSnapshot>(`/api/comu/seller/catalog?sellerId=${encodeURIComponent(sellerId)}`).then(state => { if (alive) hydrate(state, productId); }).catch(e => { if (alive) setMessage(e.message); });
    void api<{ sellers: { id: string; status: string }[] }>("/api/comu/sellers?mine=1").then(data => { if (alive) setSellerStatus(data.sellers.find(s => s.id === sellerId)?.status || ""); }).catch(() => { /* Optional presentation only; never infer entitlement. */ });
    return () => { alive = false; };
    // Initial persisted snapshot; subsequent refreshes are explicit save stages.
  }, [sellerId, productId]);
  useEffect(() => {
    let alive = true;
    if (listingId) void api<{ override: Record<string, unknown> | null; tiers: { min_quantity: number; pricing_mode: Tier["pricingMode"]; value: number }[]; run: { name?: string; comu_product_run_items?: { variant_listing_id: string; quantity_per_run: number }[] } | null }>(`/api/comu/wholesale/product?sellerId=${encodeURIComponent(sellerId)}&listingId=${encodeURIComponent(listingId)}`).then(data => {
      if (!alive || attempt.current) return; const o = data.override;
      setWholesale({ mode: o?.mode === "CUSTOM" || o?.mode === "DISABLED" ? o.mode : "STORE", tiers: data.tiers.map(t => ({ minQuantity: Number(t.min_quantity), pricingMode: t.pricing_mode, value: Number(t.value) })), allowProductMix: o?.allow_product_mix === true, allowVariantMix: o?.allow_variant_mix !== false, allowPieces: o?.allow_pieces !== false, allowRun: o?.allow_run === true, corridaEnabled: o?.corrida_enabled === true, runName: data.run?.name, runItems: (data.run?.comu_product_run_items || []).map(r => ({ variantListingId: r.variant_listing_id, quantityPerRun: r.quantity_per_run })) }); setWholesaleReady(true);
    }).catch(e => { if (alive) { setWholesaleReady(false); setMessage(`Mayoreo: ${e.message} Los valores existentes no serán reemplazados.`); } });
    return () => { alive = false; };
  }, [sellerId, listingId]);
  function patch(index: number, changes: Partial<Variant>) { setVariants(rows => rows.map((row, i) => i === index ? { ...row, ...changes } : row)); }
  function generate() {
    if (!snapshot?.variantContract || !snapshot.attributeDefinitions) return;
    try {
      const defs = [...snapshot.attributeDefinitions].sort((a, b) => a.sort_order - b.sort_order);
      const combos = generateCombinations(defs.map(d => ({ code: d.code, values: selections[d.code] || [] })), COMU_VARIANT_LIMIT);
      if (!combos.length) throw new Error("Selecciona al menos un valor para generar variantes.");
      if (new Set(combos.map(variantSignature)).size !== combos.length) throw new Error("Hay opciones equivalentes repetidas. Revisa los atributos.");
      const compatible = variants.filter((v): v is Variant & { attributes: Record<string, string> } => isText(v.attributes) && Object.keys(v.attributes).every(key => defs.some(d => d.code === key)));
      const retained = variants.filter(v => !compatible.includes(v as typeof compatible[number]));
      const result = reconcileVariants(compatible, combos, () => ({ ...fresh(), attributes: {} as Record<string, string>, price: basePrice }), v => defs.filter(d => d.use_in_variant_name).map(d => v.attributes[d.code]).filter(Boolean).join(" / ") || Object.values(v.attributes).join(" / "));
      if (result.length + retained.length > COMU_VARIANT_LIMIT) throw new Error("El total, incluidas variantes anteriores, supera 100.");
      setVariants([...result, ...retained]); setMessage(`${combos.length} variantes generadas. Las retiradas se conservan y pueden reactivarse explícitamente.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "No se pudieron generar las variantes."); }
  }
  function skus() {
    try {
      const normalized = normalizeProductCode(code, snapshot?.products.find(p => p.id === id)?.product_code); if (!normalized) throw new Error("Escribe un código de producto antes de generar SKU.");
      const projected = variants.map(v => ({ ...v, attributes: Object.fromEntries(Object.entries(v.attributes).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }));
      const result = generateMissingSkus(projected, normalized, snapshot?.attributeDefinitions || []); result.variants.forEach((v, i) => validateSku(v.sku, variants[i].sku));
      setVariants(rows => rows.map((v, i) => ({ ...v, sku: result.variants[i].sku, skuOrigin: !v.sku && result.variants[i].sku ? "auto" : v.skuOrigin }))); setMessage(`${result.generated} SKU faltantes generados.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "No se pudieron generar los SKU."); }
  }
  function changeWholesale(patch: Partial<Wholesale>) { setWholesale(current => ({ ...current, ...patch })); setWholesaleDirty(true); }
  async function save(event: FormEvent, target = status) {
    event.preventDefault(); if (!snapshot || pending.current) return; pending.current = true; setBusy(true); setMessage(""); let stage = "Catálogo";
    try {
      if (!attempt.current) {
        if (!name.trim()) throw new Error("Escribe el nombre del producto.");
        if (!variants.length || variants.some(v => !v.name.trim() || !Number.isFinite(Number(v.price)) || Number(v.price) < 0)) throw new Error("Revisa los nombres y precios de las variantes.");
        if (wholesaleDirty && (!wholesaleReady || (wholesale.mode === "CUSTOM" && (!wholesale.tiers.length || wholesale.tiers.some(t => t.minQuantity <= 0 || !Number.isFinite(t.value) || t.value < 0 || (t.pricingMode === "PERCENT_OFF" && t.value > 100)) || new Set(wholesale.tiers.map(t => t.minQuantity)).size !== wholesale.tiers.length)))) throw new Error("Revisa los niveles de mayoreo antes de guardar.");
        attempt.current = { body: catalogPayload(snapshot, id, { name, description, category, code }, variants), requestId: crypto.randomUUID(), target }; setLocked(true);
      }
      const current = attempt.current;
      if (!current.catalog) {
        const result = await api<{ productId: string; listingId: string }>("/api/comu/seller/catalog", jsonRequest("POST", { sellerId, requestId: current.requestId, product: current.body }));
        if (!result.productId || !result.listingId) throw new Error("Respuesta sin confirmación del producto. Reintenta la misma operación.");
        current.catalog = result; setId(result.productId); setListingId(result.listingId);
      }
      stage = "Fotografías"; if (!media.current) throw new Error("El panel de fotografías no está listo."); await media.current.flush(current.catalog.listingId);
      stage = "Mayoreo";
      if (wholesaleDirty && !current.wholesaleDone) {
        await api("/api/comu/wholesale/product", jsonRequest("PUT", { sellerId, listingId: current.catalog.listingId, ...wholesale }));
        const verified = await api<{ override: { mode: string }; tiers: { min_quantity: number; pricing_mode: string; value: number }[] }>(`/api/comu/wholesale/product?sellerId=${sellerId}&listingId=${current.catalog.listingId}`);
        const actual = verified.tiers.map(t => ({ minQuantity: Number(t.min_quantity), pricingMode: t.pricing_mode, value: Number(t.value) })).sort((a, b) => a.minQuantity - b.minQuantity);
        if (verified.override?.mode !== wholesale.mode || (wholesale.mode === "CUSTOM" && JSON.stringify(actual) !== JSON.stringify([...wholesale.tiers].sort((a, b) => a.minQuantity - b.minQuantity)))) throw new Error("No se verificaron todos los niveles; publicación pendiente.");
        current.wholesaleDone = true;
      }
      stage = "Publicación";
      if (current.target !== status && !current.published) { await api("/api/comu/listings", jsonRequest("PATCH", { sellerId, listingId: current.catalog.listingId, status: current.target })); current.published = true; }
      stage = "Verificación final";
      const state = await api<CatalogSnapshot>(`/api/comu/seller/catalog?sellerId=${encodeURIComponent(sellerId)}`);
      if (state.listings.find(l => l.id === current.catalog?.listingId)?.status !== current.target) throw new Error("El estado de publicación aún no está confirmado.");
      hydrate(state, current.catalog.productId); setWholesaleDirty(false); attempt.current = null; setLocked(false); setMessage(current.target === "PUBLISHED" ? "Producto guardado y publicación verificada." : "Cambios guardados y estado verificado.");
      try { await done(); } catch { setMessage("Producto guardado. No se pudo actualizar el listado; vuelve a Productos para consultarlo."); }
    } catch (e) {
      // A definitive rejected catalog transaction can be corrected. Ambiguous responses
      // keep the exact command/request ID until acknowledged.
      if (!attempt.current?.catalog && e instanceof Error && "status" in e && [400, 403, 409, 422].includes(Number(e.status))) { attempt.current = null; setLocked(false); }
      setMessage(`${stage}: ${e instanceof Error ? e.message : "No se pudo completar."}${attempt.current?.catalog ? " El catálogo ya está guardado. Reintenta las etapas pendientes; no se volverá a ajustar el stock." : attempt.current ? " Reintenta sin cambiar el formulario para conservar la identidad de la operación." : ""}`);
    }
    finally { pending.current = false; setBusy(false); }
  }
  const disabled = busy || locked, definitions = [...(snapshot?.attributeDefinitions || [])].sort((a, b) => a.sort_order - b.sort_order), price = Number(variants.find(v => v.active)?.price || basePrice);
  return <form className="product-editor" data-editor-ready={!!snapshot} onSubmit={event => void save(event)}>
    <header className="pe-header"><div><button className="pe-back" type="button" disabled={busy} onClick={() => { if (!locked || window.confirm("Hay etapas pendientes. El catálogo guardado se conserva. ¿Salir del editor?")) cancel(); }}>← Productos</button><h1>{id ? "Editar producto" : "Crear producto"}</h1><p>Completa la información de tu producto para vender en COMU.</p></div><div className="pe-header-actions">{status !== "PUBLISHED" && <button type="button" disabled={busy || !snapshot || locked} onClick={e => { if (e.currentTarget.form?.reportValidity()) void save(e, "DRAFT"); }}>Guardar borrador</button>}<button className="pe-primary" disabled={busy || !snapshot} type="button" onClick={e => { if (locked || e.currentTarget.form?.reportValidity()) void save(e, "PUBLISHED"); }}>{busy ? "Guardando…" : locked ? "Reintentar etapas pendientes" : status === "PUBLISHED" ? "Guardar cambios" : "Publicar producto"}</button></div></header>
    {message && <p className="pe-message" role="status">{message}</p>}{!snapshot && <p role="status">Cargando producto…</p>}
    {sellerStatus === "PREPARING" && snapshot && <p className="pe-progress">{snapshot.progress.publishedListings} / {snapshot.progress.minimumListings} productos listos · La activación final está a cargo de COMETA.</p>}
    <div className="pe-layout"><div className="pe-main"><ProductEditorMedia sellerId={sellerId} listingId={listingId} locked={disabled} onPreview={setPreview} handle={media} />
      <section className="pe-panel"><h2>2. Información básica</h2><div className="pe-info"><fieldset disabled={disabled}><div className="pe-fields"><label>Nombre del producto *<input required maxLength={180} value={name} onChange={e => setName(e.target.value)} /></label><label>Categoría<input list="pe-categories" maxLength={100} value={category} onChange={e => setCategory(e.target.value)} /><datalist id="pe-categories">{snapshot?.categories.map(c => <option key={c.id} value={c.name} />)}</datalist></label></div><label>Descripción<textarea rows={4} maxLength={1500} value={description} onChange={e => setDescription(e.target.value)} /></label><label>Código de producto<input value={code} onChange={e => setCode(e.target.value)} placeholder="Ej. LEG001" /><small>Identifica tu producto y sirve de base para los SKU.</small></label></fieldset><aside className="pe-tips"><strong>Consejos para vender más</strong><p>✓ Usa un nombre claro y descriptivo</p><p>✓ Destaca los beneficios principales</p><p>✓ Incluye materiales y recomendaciones</p><p>✓ Agrega fotos de buena calidad</p></aside></div></section>
      <section className="pe-panel"><h2>3. Precio</h2><fieldset disabled={disabled} className="pe-price"><label>Precio de venta · MXN<input type="number" min="0" step="0.01" required value={basePrice} onChange={e => { setBasePrice(e.target.value); if (variants.length === 1) patch(0, { price: e.target.value }); }} /></label><button type="button" onClick={() => setVariants(rows => rows.map(v => ({ ...v, price: basePrice })))}>Aplicar precio a todas</button></fieldset><p>Puedes ajustar el precio de cada variante a continuación.</p></section>
      <section className="pe-panel pe-variants"><div className="pe-section-heading"><div><h2>4. Variantes</h2><p>Define las opciones, precios y stock de tu producto.</p></div><button type="button" disabled={disabled || !snapshot?.variantContract || !definitions.length} onClick={generate}>Generar combinaciones</button></div>
        {!snapshot?.variantContract ? <p className="pe-notice">La configuración de variantes de esta tienda aún no está disponible. Conservamos las variantes existentes. COMETA debe habilitar el contrato compartido antes de generar combinaciones.</p> : !definitions.length ? <p className="pe-notice">Tu marca aún no tiene atributos configurados. Puedes preparar un producto de presentación única. COMETA debe configurar sus opciones para generar combinaciones.</p> : null}
        <fieldset disabled={disabled} className="pe-attributes">{definitions.map(def => { const options = Array.isArray(def.options) ? def.options.filter((v): v is string => typeof v === "string") : [], chosen = selections[def.code] || []; return <div key={def.id}><strong>{def.name}{def.required ? " *" : ""}</strong><div className="pe-chips">{[...new Set([...options, ...chosen])].map(value => <button type="button" key={value} aria-pressed={chosen.includes(value)} onClick={() => setSelections(s => ({ ...s, [def.code]: chosen.includes(value) ? chosen.filter(v => v !== value) : [...chosen, value] }))}>{value}</button>)}</div>{def.input_type !== "select" && <label className="pe-option-input">Agregar valor de {def.name}<input type={def.input_type === "number" ? "number" : "text"} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const value = e.currentTarget.value.trim(); if (value) setSelections(s => ({ ...s, [def.code]: [...new Set([...(s[def.code] || []), value])] })); e.currentTarget.value = ""; } }} placeholder="Escribe un valor y pulsa Enter" /></label>}</div>; })}</fieldset>
        <div className="pe-variant-summary"><span>{variants.filter(v => v.active).length} variantes activas · máximo {COMU_VARIANT_LIMIT}</span><button type="button" disabled={disabled || !snapshot?.variantContract || !variants.some(v => !v.sku)} onClick={skus}>Generar SKU faltantes</button></div><div className="pe-variant-head" aria-hidden="true"><span>Variante</span><span>SKU</span><span>Precio</span><span>Stock por ubicación</span></div>
        {variants.map((v, index) => <fieldset disabled={disabled} className={`pe-variant ${v.active ? "" : "pe-retired"}`} key={v.localId}><div><label><span className="pe-mobile-label">Variante</span><input aria-label={`Nombre variante ${index + 1}`} value={v.name} required onChange={e => patch(index, { name: e.target.value })} /></label><small>{Object.values(v.attributes).filter((value): value is string => typeof value === "string").join(" / ") || "Presentación única"}</small>{!isText(v.attributes) && <small>Atributos anteriores conservados sin cambios.</small>}{(v.id || variants.length > 1) && <button type="button" disabled={!snapshot?.variantContract} onClick={() => v.id ? patch(index, { active: !v.active }) : setVariants(rows => rows.filter((_, i) => i !== index))}>{v.id ? v.active ? "Retirar" : "Reactivar" : "Quitar"}</button>}</div><label><span className="pe-mobile-label">SKU</span><input aria-label={`SKU variante ${index + 1}`} value={v.sku} onChange={e => patch(index, { sku: e.target.value, skuOrigin: "manual" })} /><small>{v.skuOrigin === "auto" ? "Generado automáticamente" : v.skuOrigin === "manual" ? "Personalizado" : v.sku ? "SKU existente · conservado" : "Pendiente de generar"}</small></label><label><span className="pe-mobile-label">Precio MXN</span><input aria-label={`Precio variante ${index + 1}`} type="number" min="0" step="0.01" required value={v.price} onChange={e => patch(index, { price: e.target.value })} /></label><div className="pe-stock">{v.stock.map((s, i) => <div key={i}><select aria-label={`Ubicación variante ${index + 1}`} value={s.locationId} disabled={!!v.id || s.reserved !== 0} onChange={e => patch(index, { stock: v.stock.map((x, n) => n === i ? { ...x, locationId: e.target.value, changed: true } : x) })}><option value="">{snapshot?.locations.length ? "Selecciona ubicación" : "Almacén COMU"}</option>{snapshot?.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select><input aria-label={`Stock variante ${index + 1} ubicación ${i + 1}`} type="number" min={s.reserved} step="0.001" required value={s.quantity} onChange={e => patch(index, { stock: v.stock.map((x, n) => n === i ? { ...x, quantity: e.target.value, changed: true } : x) })} /><small>{s.reserved} reservadas · cantidad física</small></div>)}<button type="button" disabled={v.stock.length >= Math.max(1, snapshot?.locations.length || 0)} onClick={() => patch(index, { stock: [...v.stock, { locationId: snapshot?.locations.find(l => !v.stock.some(s => s.locationId === l.id))?.id || "", quantity: "0", expectedQuantity: 0, reserved: 0, changed: true }] })}>+ Stock por ubicación</button></div></fieldset>)}<p>Retirar una variante conserva su historial. Reactivarla es una decisión explícita.</p>
      </section></div><aside className="pe-side"><details open className="pe-panel pe-preview"><summary>Vista previa</summary><div className="pe-preview-image">{preview ? <Image unoptimized src={preview} width={440} height={480} alt={name || "Vista previa del producto"} /> : <span>COMU.<small>Tu producto, en primer plano</small></span>}</div><h3>{name || "Nombre de tu producto"}</h3><strong className="pe-preview-price">{money(Number.isFinite(price) ? price : 0)}</strong><p>{description || "La descripción de tu producto aparecerá aquí."}</p><span className="pe-badge">{status === "PUBLISHED" ? "Publicado" : "Borrador"}</span></details>
      <section className="pe-panel"><h2>5. Venta al mayoreo</h2><fieldset disabled={disabled || !wholesaleReady}><label className="pe-toggle"><input type="checkbox" checked={wholesale.mode !== "DISABLED"} onChange={e => changeWholesale({ mode: e.target.checked ? "CUSTOM" : "DISABLED" })} />Ofrecer este producto al mayoreo</label>{wholesale.mode !== "DISABLED" && <><label>Reglas<select value={wholesale.mode} onChange={e => changeWholesale({ mode: e.target.value as Wholesale["mode"] })}><option value="STORE">Usar reglas de la tienda</option><option value="CUSTOM">Precios de este producto</option></select></label>{wholesale.mode === "CUSTOM" && <>{wholesale.tiers.map((t, i) => <div className="pe-tier" key={i}><label>Desde<input type="number" min="1" required value={t.minQuantity} onChange={e => changeWholesale({ tiers: wholesale.tiers.map((row, n) => n === i ? { ...row, minQuantity: Number(e.target.value) } : row) })} /></label><label>Tipo<select value={t.pricingMode} onChange={e => changeWholesale({ tiers: wholesale.tiers.map((row, n) => n === i ? { ...row, pricingMode: e.target.value as Tier["pricingMode"] } : row) })}><option value="UNIT_PRICE">Precio MXN</option><option value="AMOUNT_OFF">Descuento MXN</option><option value="PERCENT_OFF">Descuento %</option></select></label><label>Valor<input type="number" min="0" step="0.01" required value={t.value} onChange={e => changeWholesale({ tiers: wholesale.tiers.map((row, n) => n === i ? { ...row, value: Number(e.target.value) } : row) })} /></label><button type="button" onClick={() => changeWholesale({ tiers: wholesale.tiers.filter((_, n) => n !== i) })} aria-label={`Quitar nivel ${i + 1}`}>×</button></div>)}<button type="button" onClick={() => changeWholesale({ tiers: [...wholesale.tiers, { minQuantity: (wholesale.tiers.at(-1)?.minQuantity || 0) + 6, pricingMode: "UNIT_PRICE", value: Number(basePrice) }] })}>+ Agregar nivel</button></>}</>}</fieldset><p>Los precios por volumen se guardan después del catálogo.</p></section>
      <section className="pe-panel"><h2>6. Inventario</h2><p>Administra el stock de cada variante por ubicación. Las unidades reservadas se conservan.</p></section><section className="pe-panel"><h2>7. Estado del producto</h2><p><span className="pe-badge">{status === "PUBLISHED" ? "Publicado" : status === "DRAFT" ? "Borrador" : status}</span></p><p>{status === "PUBLISHED" ? "Los cambios guardados de catálogo e imágenes se aplican al producto publicado. Las etapas se confirman por separado." : "Tu producto se publicará solo al completar las etapas requeridas. Esto no activa tu tienda."}</p><button className="pe-primary pe-save" type="submit" disabled={busy || !snapshot}>{busy ? "Guardando…" : locked ? "Reintentar etapas pendientes" : status === "PUBLISHED" ? "Guardar cambios" : "Guardar borrador"}</button></section>
    </aside></div>
  </form>;
}
