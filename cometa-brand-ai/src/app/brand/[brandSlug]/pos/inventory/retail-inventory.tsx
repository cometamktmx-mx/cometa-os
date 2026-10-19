"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePosContext } from "../../components/pos-shell";
import { PosProductImage } from "../../components/pos-product-image";
import { retailPermissions } from "@/lib/pos/retail-permissions";
import { capturedRows, variantLabel, variantMatrix, type InventoryAction, type InventoryModel, type InventoryVariant } from "@/lib/pos/retail-inventory";
import { RetailInventoryCreate } from "./retail-inventory-create";
import "./retail-inventory.css";

type Location = { id: string; name: string };
type StockData = { models: InventoryModel[]; total: number; totals: { quantity: number; reserved: number; available: number; outside: number } };
type Out = { id: string; folio: string; responsible: string; reason: string; created_at: string; expected_at: string; items: { variant_id: string; sent: number; returned: number; disposed: number; variant: { name: string; sku: string; unit_code: string; attributes: Record<string, unknown>; product: { id: string; name: string; image_url: string | null } } }[] };
type Movement = { id: string; created_at: string; movement_type: string; quantity_delta: number; quantity_before: number; quantity_after: number; notes: string; variant: { name: string; product: { name: string } } };
const titles: Record<InventoryAction, string> = { receive: "Recibir mercancía", count: "Corregir conteo", out: "Salida temporal", return: "Registrar regreso", dispose: "Baja de prendas fuera de tienda" };
async function read<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options }); const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || "No se pudo cargar la información."); return data;
}
export default function RetailInventory() {
  const { brand, currentOperator } = usePosContext();
  const permissions = currentOperator ? retailPermissions(currentOperator) : [];
  const canWrite = permissions.includes("INVENTORY");
  const [locations, setLocations] = useState<Location[]>([]), [location, setLocation] = useState("");
  const [categories, setCategories] = useState<Location[]>([]), [category, setCategory] = useState("");
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("all"), [page, setPage] = useState(1);
  const [clockNow] = useState(() => Date.now());
  const [tab, setTab] = useState("stock"), [variantView, setVariantView] = useState(false), [data, setData] = useState<StockData | null>(null);
  const [outTotal, setOutTotal] = useState(0);
  const [outs, setOuts] = useState<Out[]>([]), [movements, setMovements] = useState<Movement[]>([]), [movementTotal, setMovementTotal] = useState(0);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false), [notice, setNotice] = useState("");
  const [action, setAction] = useState<InventoryAction>("receive"), [panel, setPanel] = useState(false), [models, setModels] = useState<InventoryModel[]>([]);
  const [values, setValues] = useState<Record<string, string>>({}), [reason, setReason] = useState(""), [supplier, setSupplier] = useState(""), [reference, setReference] = useState("");
  const [responsible, setResponsible] = useState(""), [expected, setExpected] = useState(""), [outId, setOutId] = useState("");
  const [addSearch, setAddSearch] = useState(""), [addResults, setAddResults] = useState<InventoryModel[]>([]), [scan, setScan] = useState("");
  const [review, setReview] = useState(false), [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false), [create, setCreate] = useState(false);
  const pending = useRef<{ key: string; payload: string } | null>(null), initialized = useRef(false), dialog = useRef<HTMLDialogElement>(null);
  const api = useCallback((extra = "") => `/api/pos/retail-inventory?brandSlug=${encodeURIComponent(brand.slug)}&locationId=${location}${extra}`, [brand.slug, location]);
  useEffect(() => {
    let alive = true;
    read<{ locations: Location[]; categories?: Location[] }>(`/api/pos/bootstrap?brandSlug=${encodeURIComponent(brand.slug)}`).then(d => {
      if (!alive) return;
      setLocations(d.locations); const params = new URLSearchParams(window.location.search);
      const requested = params.get("locationId") || sessionStorage.getItem(`inventory-location:${brand.slug}`);
      setLocation(currentOperator?.locationId || d.locations.find(l => l.id === requested)?.id || d.locations[0]?.id || "");
      setSearch(params.get("search") || ""); setCategory(params.get("categoryId") || ""); setFilter(params.get("filter") || "all");
    }).catch(e => alive && setError(e.message));
    read<{ categories: Location[] }>(`/api/pos/categories?brandSlug=${encodeURIComponent(brand.slug)}`).then(d => alive && setCategories(d.categories || [])).catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [brand.slug, currentOperator?.locationId]);
  const load = useCallback(async () => {
    if (!location) return; setLoading(true); setError("");
    try {
      const stock = await read<StockData>(api(`&search=${encodeURIComponent(search)}&categoryId=${category}&filter=${filter}&page=${page}`)); setData(stock);
      if (tab === "outs") { const d = await read<{ outs: Out[]; total: number }>(api(`&view=outs&page=${page}&search=${encodeURIComponent(search)}`)); setOuts(d.outs); setOutTotal(d.total); }
      if (tab === "movements") { const d = await read<{ movements: Movement[]; total: number }>(api(`&view=movements&page=${page}`)); setMovements(d.movements); setMovementTotal(d.total); }
    } catch (e) { setError(e instanceof Error ? e.message : "Error al cargar inventario."); } finally { setLoading(false); }
  }, [api, location, search, category, filter, page, tab]);
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!location) return; sessionStorage.setItem(`inventory-location:${brand.slug}`, location);
    const url = new URL(window.location.href); for (const [key, value] of Object.entries({ search, categoryId: category, filter, locationId: location })) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); } window.history.replaceState(null, "", url);
  }, [search, category, filter, location, brand.slug]);
  useEffect(() => {
    if (!location || initialized.current) return; initialized.current = true;
    const id = new URLSearchParams(window.location.search).get("productId");
    if (id) read<StockData>(api(`&productId=${encodeURIComponent(id)}`)).then(d => { if (d.models[0]) { setModels(d.models); setPanel(true); } }).catch(e => setError(e.message));
  }, [location, api]);
  useEffect(() => { if (panel) dialog.current?.showModal(); else dialog.current?.close(); }, [panel]);
  const dirty = Object.values(values).some(v => v.trim() !== "");
  useEffect(() => { const prevent = (e: BeforeUnloadEvent) => { if (dirty || uncertain) e.preventDefault(); }; window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent); }, [dirty, uncertain]);
  useEffect(() => {
    if (!panel || !addSearch.trim()) return; let alive = true;
    const timer = setTimeout(() => { read<StockData>(api(`&search=${encodeURIComponent(addSearch)}`)).then(d => alive && setAddResults(d.models)).catch(e => alive && setError(e.message)); }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [panel, addSearch, api]);
  function close() { if (saving || uncertain) return; if (dirty && !window.confirm("¿Descartar las cantidades capturadas?")) return; setPanel(false); setValues({}); setReview(false); setModels([]); setError(""); }
  function start(next: InventoryAction, model?: InventoryModel) { setAction(next); setModels(model ? [model] : []); setValues({}); setReason(""); setOutId(""); setReview(false); setPanel(true); setError(""); pending.current = null; }
  function add(model: InventoryModel) { setModels(previous => previous.some(p => p.id === model.id) ? previous : [...previous, model]); setAddSearch(""); setAddResults([]); }
  async function scanCode() {
    try {
      const result = await read<{ found: boolean; variant?: { id: string; product: { id: string } }; productMatch?: { id: string } }>(`/api/pos/product-scan?brandSlug=${encodeURIComponent(brand.slug)}&surface=administration&code=${encodeURIComponent(scan)}`);
      const id = result.variant?.product.id || result.productMatch?.id;
      if (!id) throw new Error("Código no encontrado. Busca el nombre o código del modelo.");
      const found = await read<StockData>(api(`&productId=${id}`)); if (!found.models[0]) throw new Error("El modelo no utiliza inventario directo o está inactivo.");
      start("receive", found.models[0]); setScan("");
      if (result.variant) { const variantId = result.variant.id; requestAnimationFrame(() => document.getElementById(`qty-${variantId}`)?.focus()); }
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo leer el código."); }
  }
  async function reconcile() {
    try { const updated = await Promise.all(models.map(m => read<StockData>(api(`&productId=${m.id}`)))); setModels(updated.flatMap(d => d.models)); setReview(false); setError("Existencias actualizadas. Tu captura sigue intacta: revisa diferencias y vuelve a confirmar."); pending.current = null; } catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar."); }
  }
  async function save() {
    if (saving) return;
    try {
      const items = capturedRows(models, values, action); if (!items.length) throw new Error("Captura al menos una cantidad.");
      if (["count", "out", "dispose"].includes(action) && reason.trim().length < 3) throw new Error("Indica un motivo de al menos tres caracteres.");
      if (action === "out" && (!responsible.trim() || !expected)) throw new Error("Indica responsable y fecha esperada de regreso.");
      if (!review) { setReview(true); setError(""); return; }
      const payload = { items, reason, supplier, reference, responsible, expected_at: expected ? new Date(expected).toISOString() : null, out_id: outId || null };
      const serialized = JSON.stringify(payload);
      if (!pending.current) pending.current = { key: crypto.randomUUID(), payload: serialized };
      if (pending.current.payload !== serialized) throw new Error("Reintenta el lote original antes de cambiar cantidades.");
      setSaving(true); setError("");
      let response: Response;
      try { response = await fetch(api(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, locationId: location, requestKey: pending.current.key, payload }) }); } catch { setUncertain(true); throw new Error("No se recibió confirmación. Reintenta este mismo lote: su clave evita duplicados. No cierres la captura."); }
      const result = await response.json();
      if (!response.ok) { if (!uncertain) pending.current = null; throw new Error(result.error || "No se guardó el lote."); }
      setUncertain(false); pending.current = null; setValues({}); setModels([]); setPanel(false); setReview(false); setNotice(`${titles[action]}: lote guardado una sola vez.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); } finally { setSaving(false); }
  }
  function openOut(out: Out, next: "return" | "dispose") {
    const grouped = new Map<string, InventoryModel>();
    for (const item of out.items) {
      const pendingQty = Number(item.sent) - Number(item.returned) - Number(item.disposed); if (pendingQty <= 0) continue;
      const product = item.variant.product;
      const model = grouped.get(product.id) || { ...product, product_code: null, category_id: null, variants: [], quantity: 0, reserved: 0, available: 0, outside: 0 };
      model.variants.push({ id: item.variant_id, name: item.variant.name, sku: item.variant.sku, barcode: null, attributes: item.variant.attributes, unit_code: item.variant.unit_code, image_url: null, quantity: pendingQty, reserved: 0, available: pendingQty, outside: pendingQty, version: "outside" }); grouped.set(product.id, model);
    }
    start(next); setModels([...grouped.values()]); setOutId(out.id); setReference(out.folio);
  }
  let rows: ReturnType<typeof capturedRows> = [], captureError = "";
  try { rows = capturedRows(models, values, action); } catch (e) { captureError = e instanceof Error ? e.message : "Revisa cantidades."; }
  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  const counts = data?.totals;
  const filteredOuts = outs;
  return <div className="retail-inventory space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Inventario</h1><select aria-label="Sucursal" value={location} disabled={!!currentOperator?.locationId || panel} onChange={e => { setLocation(e.target.value); setPage(1); }}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div><div className="flex flex-wrap gap-2">{permissions.includes("PRODUCTS_WRITE") && <button onClick={() => setCreate(true)}>Nuevo producto</button>}{canWrite && <><button onClick={() => start("out")}>Salida temporal</button><button className="primary" onClick={() => start("receive")}>Recibir mercancía</button></>}</div></header>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{([["En tienda", counts?.quantity], ["Reservado", counts?.reserved], ["Fuera de tienda", counts?.outside], ["Disponible", counts?.available]] as const).map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value ?? "—"}</strong></div>)}</div>
    <nav aria-label="Secciones de inventario" className="flex gap-2">{[["stock", "Existencias"], ["movements", "Movimientos"], ["outs", "Salidas temporales"]].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => { setTab(key); setPage(1); }}>{label}</button>)}</nav>
    {notice && <p role="status" className="text-emerald-400">{notice}</p>}{error && !panel && <p role="alert" className="text-rose-400">{error} <button onClick={() => void load()}>Reintentar</button></p>}
    {tab !== "movements" && <div className="flex flex-wrap gap-2"><input aria-label="Buscar inventario" placeholder="Nombre, código del modelo, SKU o código de barras" className="min-w-60 flex-1" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />{tab === "stock" && <><select aria-label="Categoría" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">Todas las categorías</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="Disponibilidad" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="all">Todas las existencias</option><option value="available">Disponibles</option><option value="empty">Sin disponible</option><option value="reserved">Con reservas</option><option value="outside">Fuera de tienda</option></select><button aria-pressed={variantView} onClick={() => setVariantView(v => !v)}>{variantView ? "Ver por modelo" : "Ver por variante"}</button></>}</div>}
    {tab === "stock" && <><form className="flex max-w-lg gap-2" onSubmit={e => { e.preventDefault(); void scanCode(); }}><input aria-label="Código del escáner" placeholder="Atajo de escáner: código + Enter" value={scan} onChange={e => setScan(e.target.value)} /><button disabled={!scan.trim()}>Abrir</button></form><div className="table-scroll"><table><thead><tr><th>Modelo / código</th><th>En tienda</th><th>Reservado</th><th>Fuera</th><th>Disponible</th><th>Variantes</th></tr></thead><tbody>{data?.models.map(m => <ModelRows key={m.id} model={m} variants={variantView} open={() => start("receive", m)} />)}</tbody></table></div>{!loading && !data?.models.length && <p>No hay modelos con estos filtros.</p>}</>}
    {tab === "movements" && <div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Modelo / variante</th><th>Movimiento</th><th>Antes</th><th>Cambio</th><th>Después</th><th>Motivo</th></tr></thead><tbody>{movements.map(m => <tr key={m.id}><td>{new Date(m.created_at).toLocaleString("es-MX")}</td><td>{m.variant?.product?.name}<small>{m.variant?.name.replace(/\s+[?\ufffd]\s+/g, " / ")}</small></td><td>{m.movement_type}</td><td>{m.quantity_before}</td><td>{m.quantity_delta}</td><td>{m.quantity_after}</td><td>{m.notes}</td></tr>)}</tbody></table>{!movements.length && <p>No hay movimientos en esta sucursal.</p>}</div>}
    {tab === "outs" && <div className="space-y-3">{filteredOuts.map(o => {
      const sent = o.items.reduce((s, i) => s + Number(i.sent), 0), returned = o.items.reduce((s, i) => s + Number(i.returned), 0), disposed = o.items.reduce((s, i) => s + Number(i.disposed), 0), remaining = sent - returned - disposed;
      return <article className="out-card" key={o.id}><div className="flex flex-wrap justify-between gap-2"><div><strong>{o.folio} · {o.responsible}</strong><p>{remaining === 0 ? "Completada" : returned + disposed > 0 ? "Parcial" : "Pendiente"}{remaining > 0 && new Date(o.expected_at).getTime() < clockNow ? " · Vencida" : ""} · {o.reason}</p><small>Salida: {new Date(o.created_at).toLocaleString("es-MX")} · Regreso esperado: {new Date(o.expected_at).toLocaleString("es-MX")}</small></div><span>{sent} enviadas · {returned} devueltas · {disposed} bajas · {remaining} pendientes</span></div><details><summary>Ver prendas y cantidades</summary>{o.items.map(i => <p key={i.variant_id}>{i.variant.product.name} · {variantLabel(i.variant)}: enviadas {i.sent}, devueltas {i.returned}, bajas {i.disposed}, pendientes {Number(i.sent) - Number(i.returned) - Number(i.disposed)}</p>)}</details>{canWrite && remaining > 0 && <div className="mt-3 flex gap-2"><button onClick={() => openOut(o, "return")}>Registrar regreso</button>{permissions.includes("SETTINGS") && <button onClick={() => openOut(o, "dispose")}>Resolver pérdida / daño</button>}</div>}</article>;
    })}{!filteredOuts.length && <p>No hay salidas temporales con esta búsqueda.</p>}</div>}
    {loading && <p role="status">Cargando inventario…</p>}{<footer className="flex items-center justify-between"><span>{tab === "stock" ? data?.total || 0 : tab === "outs" ? outTotal : movementTotal} {tab === "stock" ? "modelos" : tab === "outs" ? "salidas" : "movimientos"}</span><div className="flex items-center gap-3"><button disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page}</span><button disabled={page * 25 >= (tab === "stock" ? data?.total || 0 : tab === "outs" ? outTotal : movementTotal) || loading} onClick={() => setPage(p => p + 1)}>Siguiente</button></div></footer>}
    <dialog ref={dialog} className="inventory-dialog" onCancel={e => { e.preventDefault(); close(); }}><div className="dialog-layout"><header className="dialog-header"><div><h2>{titles[action]}</h2><p>{locations.find(l => l.id === location)?.name}</p></div><button aria-label="Cerrar captura" disabled={saving || uncertain} onClick={close}>✕</button></header><div className="dialog-content">
      <p className="mb-3">{action === "receive" ? "Las cantidades se sumarán a tus existencias." : action === "count" ? "El número capturado es la cantidad física en tienda, incluidas prendas reservadas que siguen aquí; excluye prendas fuera en salida temporal. Vacío: sin cambio. Cero: conteo explícito." : action === "out" ? "Las prendas saldrán de lo disponible para vender y seguirán siendo propiedad del negocio." : action === "return" ? "Captura solo las prendas que regresan. Actualiza únicamente lo efectivamente recibido." : "Baja autorizada de prendas pendientes: no simula un regreso ni resta otras prendas en tienda."}</p>
      {!review && !outId && <div className="flex flex-wrap gap-2 mb-3">{canWrite && ["receive", "count", "out"].map(a => <button key={a} disabled={dirty || saving || uncertain} aria-pressed={action === a} onClick={() => setAction(a as InventoryAction)}>{titles[a as InventoryAction]}</button>)}<input aria-label="Agregar modelo al lote" placeholder="Buscar otro modelo para este lote" value={addSearch} disabled={uncertain} onChange={e => setAddSearch(e.target.value)} /></div>}
      {!!addSearch.trim() && !!addResults.length && <div className="search-results">{addResults.map(m => <button key={m.id} onClick={() => add(m)}>{m.name} · {m.product_code} · {m.variants.length} variantes</button>)}</div>}
      <fieldset disabled={review || saving || uncertain}>{models.map(m => <section key={m.id} className="model-matrix"><header className="flex items-center gap-3"><PosProductImage src={m.image_url} alt={m.name} className="h-14 w-14 rounded object-cover"/><div><h3>{m.name}</h3><small>{m.product_code || "Sin código base"} · {m.variants.length} variantes</small></div></header><VariantInputs model={m} values={values} action={action} onChange={(id, value) => setValues(v => ({ ...v, [id]: value }))}/></section>)}
      {action === "out" && <div className="grid gap-3 sm:grid-cols-2"><label>Responsable<input value={responsible} onChange={e => setResponsible(e.target.value)} maxLength={200}/></label><label>Regreso esperado<input type="datetime-local" value={expected} onChange={e => setExpected(e.target.value)}/></label></div>}
      <label className="block mt-3">{["count", "out", "dispose"].includes(action) ? "Motivo obligatorio (contenido, sesión fotográfica u otro)" : "Notas"}<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={1000}/></label>{action === "receive" && <details><summary>Proveedor, referencia y costos</summary><label>Proveedor<input value={supplier} onChange={e => setSupplier(e.target.value)} maxLength={200}/></label><label>Referencia<input value={reference} onChange={e => setReference(e.target.value)} maxLength={200}/></label><p>Este lote conserva los costos vigentes. La recepción queda identificada con costo no informado; no se toma como costo cero.</p></details>}</fieldset>
      {review && <section className="review"><h3>Revisar antes de guardar</h3>{models.map(m => { const selected = rows.filter(r => m.variants.some(v => v.id === r.variant_id)); return selected.length ? <p key={m.id}>{m.name}: {selected.reduce((s, r) => s + r.quantity, 0)} piezas capturadas · {selected.length} variantes</p> : null; })}<p>{rows.length} variantes · {total} piezas {action === "count" ? "contadas" : "en el lote"}. Sucursal: {locations.find(l => l.id === location)?.name}.</p></section>}
    </div><footer className="dialog-footer">{(error || captureError) && <p role="alert" className="text-rose-400 mb-2">{error || captureError}</p>}<div className="flex flex-wrap items-center justify-between gap-2"><span>{rows.length} cambios · {total} piezas</span><div className="flex flex-wrap gap-2">{action === "count" && !uncertain && <button disabled={saving} onClick={() => void reconcile()}>Actualizar y reconciliar</button>}{review && !uncertain && <button disabled={saving} onClick={() => setReview(false)}>Volver a captura</button>}{canWrite && <button className="primary" disabled={saving || !!captureError || !rows.length} onClick={() => void save()}>{saving ? "Guardando…" : uncertain ? "Reintentar el mismo lote" : review ? "Confirmar y guardar lote" : "Revisar lote"}</button>}</div></div></footer></div></dialog>
    {create && <RetailInventoryCreate brandSlug={brand.slug} locationId={location} onClose={() => setCreate(false)} onSaved={() => { setCreate(false); setNotice("Modelo, variantes y entrada inicial guardados."); void load(); }}/>}
  </div>;
}
function ModelRows({ model: m, variants, open }: { model: InventoryModel; variants: boolean; open: () => void }) {
  return <><tr><td><button className="model-link" onClick={open}><PosProductImage src={m.image_url} alt={m.name} className="h-12 w-12 shrink-0 rounded object-cover"/><span><strong>{m.name}</strong><small>{m.product_code || "Sin código base"}</small></span></button></td><td>{m.quantity}</td><td>{m.reserved}</td><td>{m.outside}</td><td className="font-bold">{m.available}</td><td><button onClick={open}>{m.variants.length} variantes →</button></td></tr>{variants && m.variants.map(v => <tr key={v.id}><td className="pl-16">{variantLabel(v)}<small>{v.sku}</small></td><td>{v.quantity}</td><td>{v.reserved}</td><td>{v.outside}</td><td>{v.available}</td><td><button onClick={open}>Capturar</button></td></tr>)}</>;
}
function VariantInputs({ model, values, action, onChange }: { model: InventoryModel; values: Record<string, string>; action: InventoryAction; onChange: (id: string, value: string) => void }) {
  const matrix = variantMatrix(model.variants);
  const input = (v: InventoryVariant) => <div className="quantity-cell"><small>{action === "return" || action === "dispose" ? "Pendiente" : "En tienda"}: {v.quantity}{v.reserved ? ` · Reserva ${v.reserved}` : ""}</small><input id={`qty-${v.id}`} aria-label={`${model.name} ${variantLabel(v)}`} inputMode="decimal" type="number" min="0" step={v.unit_code === "piece" ? "1" : "0.001"} placeholder="—" value={values[v.id] ?? ""} onChange={e => onChange(v.id, e.target.value)}/>{action === "count" && (values[v.id] ?? "") !== "" && <small>Diferencia: {Number(values[v.id]) - Number(v.quantity)} · Disponible: {Number(values[v.id]) - Number(v.reserved)}</small>}</div>;
  return <div className="table-scroll">{matrix ? <table><thead><tr><th>Color / talla</th>{matrix.sizes.map(size => <th key={size}>{size}</th>)}</tr></thead><tbody>{matrix.colors.map(color => <tr key={color}><th>{color}</th>{matrix.sizes.map(size => { const cell = matrix.cells.find(c => c.color === color && c.size === size); return <td key={size}>{cell ? input(cell.variant) : <input disabled aria-label={`${color} ${size}: combinación inexistente`} placeholder="No existe"/>}</td>; })}</tr>)}</tbody></table> : <table><thead><tr><th>Variante</th><th>Código</th><th>Cantidad</th></tr></thead><tbody>{model.variants.map(v => <tr key={v.id}><td>{variantLabel(v)}</td><td>{v.sku}</td><td>{input(v)}</td></tr>)}</tbody></table>}</div>;
}
