"use client";
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { usePosContext } from './pos-shell';
import { PosDrawer } from './pos-ui/pos-drawer';
import { PosFoodPreparedWorkspace } from './pos-food-prepared-workspace';
import type { FoodIngredient, FoodRecipeProduct, FoodRecipesCatalog } from '@/lib/pos/food-recipes-shared';
import { normalizeNumericDraft, sanitizeNumericDraft, type NumericIntent } from '@/lib/pos/numeric-input';

const field = 'pos-ui-focus mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-[#152532] px-3 py-2 text-sm';
const button = 'pos-ui-focus min-h-11 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-40';
const panel = 'rounded-2xl border border-white/10 bg-[#101e29] p-5';
const categories: Record<string, string> = { food: 'Alimento', base: 'Bebida / base', packaging: 'Empaque', consumable: 'Consumible' };
type Location = { id: string; name: string; currency: string };
type Category = { id: string; name: string; active: boolean };
type Presentation = { id?: string; name: string; content: number; unit_code: string; cost: number; supplier_name: string; active: boolean; initial_count?: string; minimum_count?: string };
type IngredientForm = { id?: string; name: string; category: string; unit_code: string; initial_quantity: number; minimum_quantity: number; waste_percent: number; supplier_name: string; active: boolean; presentations: Presentation[] };
type Component = { ingredient_variant_id: string; quantity: number; unit_code: string };
type Modifiers = { options: { id: string; group_id: string; name: string }[]; associations: { product_id: string; group_id: string }[] };
const emptyIngredient = (): IngredientForm => ({ name: '', category: 'food', unit_code: 'g', initial_quantity: 0, minimum_quantity: 0, waste_percent: 0, supplier_name: '', active: true, presentations: [] });
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación.');
  return body;
}
export function PosFoodRecipesAdmin({ brandSlug, kind = 'inventory', optionId }: { brandSlug: string; kind?: 'inventory' | 'products' | 'effects'; optionId?: string }) {
  const { currentOperator } = usePosContext();
  const [locations, setLocations] = useState<Location[]>([]), [locationId, setLocationId] = useState(''), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void request<{ locations: Location[] }>(`/api/pos/bootstrap?brandSlug=${encodeURIComponent(brandSlug)}`, { signal: abort.signal }).then(body => {
      setLocations(body.locations); setLocationId(currentOperator?.locationId || body.locations[0]?.id || '');
    }).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'Error de conexión.'); });
    return () => abort.abort();
  }, [brandSlug, currentOperator?.locationId]);
  return <section className="mx-auto max-w-6xl space-y-5">{error && <p role="alert" className={panel}>{error}</p>}{!locations.length && !error && <p role="status" className={panel}>Cargando sucursales…</p>}{!!locations.length && <label className="block max-w-xs text-xs text-slate-400">Sucursal<select className={field} disabled={!!currentOperator?.locationId} value={locationId} onChange={e => setLocationId(e.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}{locationId && <Workspace key={`${brandSlug}:${locationId}:${optionId || ''}`} brandSlug={brandSlug} location={locations.find(l => l.id === locationId)} locationId={locationId} kind={kind} optionId={optionId} />}</section>;
}
function Workspace({ brandSlug, location, locationId, kind, optionId }: { brandSlug: string; location?: Location; locationId: string; kind: 'inventory' | 'products' | 'effects'; optionId?: string }) {
  const [catalog, setCatalog] = useState<FoodRecipesCatalog | null>(null), [modifiers, setModifiers] = useState<Modifiers | null>(null), [productCategories, setProductCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [busy, setBusy] = useState(false), [search, setSearch] = useState('');
  const [ingredient, setIngredient] = useState<IngredientForm | null>(null);
  const [operation, setOperation] = useState<{ ingredient: FoodIngredient; action: 'receive' | 'adjust' | 'cost_set'; quantity: number; content: number; cost: number; unit_code: string; presentation_id: string; notes: string; request_key: string } | null>(null);
  const [product, setProduct] = useState<FoodRecipeProduct | null>(null), [newProduct, setNewProduct] = useState(false);
  const [productImageUrl, setProductImageUrl] = useState(''), [originalProductImageUrl, setOriginalProductImageUrl] = useState(''), [imageBusy, setImageBusy] = useState(false), [imageError, setImageError] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({ name: '', description: '', price: 0, tax_rate: 0, active: true, category_id: '' });
  const [components, setComponents] = useState<Component[]>([]), [ingredientSearch, setIngredientSearch] = useState('');
  const submitting = useRef(false);
  const pendingCommand = useRef<{ fingerprint: string; key: string } | null>(null);
  const money = (value: number, digits = 2) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: location?.currency || 'MXN', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  const load = useCallback(async (signal?: AbortSignal) => {
    const catalogRequest = request<{ catalog: FoodRecipesCatalog }>(`/api/pos/food/recipes?brandSlug=${encodeURIComponent(brandSlug)}&locationId=${locationId}`, { signal });
    const modifiersRequest = request<{ catalog: Modifiers }>(`/api/pos/food/modifiers?brandSlug=${encodeURIComponent(brandSlug)}`, { signal });
    const [body, mods] = await Promise.all([catalogRequest, modifiersRequest]);
    if (signal?.aborted) return;
    setCatalog(body.catalog); setModifiers(mods.catalog);
    if (kind === 'products') {
      const categoryResponse = await request<{ categories: Category[] }>(`/api/pos/categories?brandSlug=${encodeURIComponent(brandSlug)}`, { signal });
      if (!signal?.aborted) setProductCategories(categoryResponse.categories || []);
    }
    return body.catalog;
  }, [brandSlug, locationId, kind]);
  useEffect(() => { const abort = new AbortController(); void Promise.resolve().then(() => load(abort.signal)).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'Error de conexión.'); }); return () => abort.abort(); }, [load]);
  async function save(action: string, payload: object) {
    const fingerprint = JSON.stringify({ action, payload });
    if (pendingCommand.current?.fingerprint !== fingerprint) pendingCommand.current = { fingerprint, key: crypto.randomUUID() };
    return request<{ result: { id: string } }>('/api/pos/food/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandSlug, locationId, action, ...payload, command_key: pendingCommand.current.key }) });
  }
  async function run(work: () => Promise<void>, mutation = true) {
    if (submitting.current) return; submitting.current = true; setBusy(true); setError(null); setNotice(null);
    try { await work(); if (mutation) { pendingCommand.current = null; setNotice('Guardado. Los pedidos enviados conservan su receta y costo.'); } }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Error de conexión.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  function editProduct(p: FoodRecipeProduct) {
    setProduct(p); setNewProduct(false); setProductForm({ name: p.name, description: p.description || '', price: p.price, tax_rate: p.tax_rate, active: p.active, category_id: p.category_id || '' });
    setProductImageUrl(p.image_url || ''); setOriginalProductImageUrl(p.image_url || ''); setImageError(null);
    setComponents(p.recipe_components.map(c => ({ ingredient_variant_id: c.ingredient_variant_id, quantity: c.input_quantity, unit_code: c.input_unit_code })));
  }
  async function uploadProductImage(file: File) {
    setImageError(null);
    if (file.size <= 0) return setImageError('La imagen está vacía.');
    if (file.size > 5 * 1024 * 1024) return setImageError('La imagen no puede superar 5 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setImageError('Usa una imagen JPG, PNG o WEBP.');
    const formData = new FormData(); formData.append('file', file); setImageBusy(true);
    try { const response = await request<{ imageUrl: string }>(`/api/pos/product-images?brandSlug=${encodeURIComponent(brandSlug)}`, { method: 'POST', body: formData }); setProductImageUrl(response.imageUrl); }
    catch (reason) { setImageError(reason instanceof Error ? reason.message : 'No se pudo subir la imagen.'); }
    finally { setImageBusy(false); }
  }
  async function removeProductImage() {
    const current = productImageUrl; setImageError(null); setProductImageUrl('');
    if (!current || current === originalProductImageUrl) return;
    try { await fetch(`/api/pos/product-images?brandSlug=${encodeURIComponent(brandSlug)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: current }) }); }
    catch { setImageError('La imagen se quitó del formulario, pero no fue posible limpiar el archivo anterior.'); }
  }
  async function saveProduct() {
    const response = await save('product_save', { ...productForm, id: product?.id });
    if (productImageUrl !== originalProductImageUrl) {
      await save('image_save', { id: response.result.id, image_url: productImageUrl || null });
      if (originalProductImageUrl) await fetch(`/api/pos/product-images?brandSlug=${encodeURIComponent(brandSlug)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: originalProductImageUrl }) });
    }
    const next = await load(); const updated = next?.products.find(p => p.id === response.result.id);
    if (updated) { setProduct(updated); setNewProduct(false); setOriginalProductImageUrl(productImageUrl); }
  }
  const activeIngredients = catalog?.ingredients.filter(i => i.active) || [];
  return <>
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Food · Administración</p><h1 className="mt-2 text-3xl font-bold">{kind === 'inventory' ? 'Insumos y existencias' : kind === 'products' ? 'Productos y recetas' : 'Impacto en receta'}</h1><p className="mt-2 text-sm text-slate-400">Existencia física por sucursal. Costos vigentes globales y recetas versionadas.</p></div><div className="flex gap-2"><Link className={button} href={`/brand/${brandSlug}/pos/admin`}>Administración</Link>{kind !== 'effects' && <button disabled={busy || !catalog} className={button + ' bg-cyan-300 text-slate-950'} onClick={() => { if (kind === 'inventory') setIngredient(emptyIngredient()); else { setProduct(null); setNewProduct(true); setComponents([]); setProductForm({ name: '', description: '', price: 0, tax_rate: 0, active: true, category_id: '' }); setProductImageUrl(''); setOriginalProductImageUrl(''); setImageError(null); } }}>{kind === 'inventory' ? 'Crear insumo' : 'Crear preparado'}</button>}</div></div>
    {error && <div role="alert" className={panel + ' border-rose-300/30 text-rose-200'}>{error}<button className="ml-3 underline" onClick={() => void run(async () => { await load(); }, false)}>Reintentar carga</button></div>}{notice && <p role="status" className={panel + ' text-emerald-200'}>{notice}</p>}{!catalog && !error && <p role="status" className={panel}>Cargando inventario y recetas…</p>}
    {catalog && kind === 'inventory' && <>
      <div className="grid gap-3 sm:grid-cols-3"><Stat label="Insumos activos" value={String(activeIngredients.length)} /><Stat label="Bajo mínimo" value={String(activeIngredients.filter(i => i.stock - i.reserved_stock < i.minimum_stock).length)} /><Stat label="Fuente de existencia" value="Inventario por sucursal" /></div><label className="block max-w-lg text-xs text-slate-400">Buscar insumo<input className={field} placeholder="Café, leche, vaso…" value={search} onChange={e => setSearch(e.target.value)} /></label>{!catalog.ingredients.length && <div className={panel}>Agrega alimentos, bases, empaques y consumibles con su unidad base y presentaciones.</div>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{catalog.ingredients.filter(i => i.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(i => <article className={panel} key={i.id}><div className="flex justify-between"><div><p className="text-xs text-cyan-300">{categories[i.category]}</p><h2 className="mt-1 text-lg font-semibold">{i.name}</h2></div><span className="text-xs text-slate-400">{i.active ? 'Activo' : 'Inactivo'}</span></div><p className="mt-5 text-3xl font-bold">{i.stock} <span className="text-sm text-slate-400">{i.unit_code}</span></p><p className="mt-1 text-xs text-slate-400">Físico · mínimo {i.minimum_stock} · reservado {i.reserved_stock}{i.presentations.find(p => p.active) ? ` · equivalente ${formatEquivalent(i)}` : ""}</p><p className="mt-2 text-sm text-emerald-200">Utilizable estimado: {Number(i.usable_estimated_stock).toFixed(3)} {i.unit_code}</p><p className="mt-3 text-sm">{money(i.unit_cost, 6)} / {i.unit_code}</p><p className="mt-1 text-xs text-slate-400">Merma estimada {i.waste_percent}% · {i.supplier_name || 'Sin proveedor'}</p><div className="mt-4 flex flex-wrap gap-2"><button className={button} disabled={busy || !i.active} onClick={() => setIngredient({ id: i.id, name: i.name, category: i.category, unit_code: i.unit_code, initial_quantity: 0, minimum_quantity: i.minimum_stock, waste_percent: i.waste_percent, supplier_name: i.supplier_name || '', active: i.active, presentations: i.presentations.map(p => ({ id: p.id, name: p.name, content: p.conversion_factor, unit_code: p.base_unit_code, cost: p.configured_cost || 0, supplier_name: p.supplier_name || '', active: p.active })) })}>Editar</button>{(['receive', 'adjust', 'cost_set'] as const).map(action => <button key={action} className={button} disabled={busy || !i.active} onClick={() => setOperation({ ingredient: i, action, quantity: action === 'adjust' ? 0 : 1, content: i.presentations.find(p => p.active)?.conversion_factor || 1, cost: i.presentations.find(p => p.active)?.configured_cost || 0, unit_code: i.unit_code, presentation_id: i.presentations.find(p => p.active)?.id || '', notes: '', request_key: crypto.randomUUID() })}>{action === 'receive' ? 'Entrada' : action === 'adjust' ? 'Ajustar' : 'Costo'}</button>)}{!i.active && <button className={button} disabled={busy} onClick={() => void run(async () => { await save('ingredient_status', { id: i.id, active: true }); await load(); })}>Reactivar</button>}</div></article>)}</div>
      <details className={panel}><summary className="cursor-pointer font-semibold">Movimientos auditables · últimos 100</summary><div className="mt-4 space-y-3">{catalog.movements.map(m => <div key={m.id} className="flex flex-wrap justify-between gap-2 border-b border-white/5 pb-3 text-sm"><span>{catalog.ingredients.find(i => i.id === m.variant_id)?.name} · {m.movement_type}<small className="block text-slate-400">{new Date(m.created_at).toLocaleString('es-MX')} · {m.notes}</small></span><span>{m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta}<small className="block text-slate-400">{m.quantity_before} → {m.quantity_after}</small></span>{m.reference_id && <span className="break-all text-xs text-slate-500">Referencia {m.reference_id}</span>}</div>)}{!catalog.movements.length && <p className="text-sm text-slate-400">Sin movimientos.</p>}</div></details>
    </>}
    {catalog && kind === 'products' && <><label className="block max-w-lg text-xs text-slate-400">Buscar producto<input className={field} value={search} onChange={e => setSearch(e.target.value)} /></label><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{catalog.products.filter(p => p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(p => <button disabled={busy} key={p.id} className={panel + ' text-left'} onClick={() => editProduct(p)}><p className="text-xs text-cyan-300">{p.inventory_mode === 'recipe' ? `Receta ${p.recipe ? 'v' + p.recipe.version : 'pendiente'}` : 'Inventario ' + p.inventory_mode}</p><h2 className="mt-2 text-lg font-semibold">{p.name} <small className="text-slate-400">{p.variant_name}</small></h2><p className="mt-4 text-2xl font-bold">{money(p.price)}</p><p className="mt-2 text-sm text-slate-400">{p.recipe ? `Costo ${money(p.recipe.unit_cost)} · ${p.recipe.availability ?? '—'} disponibles` : 'Configura o revisa su receta'}</p>{!p.active && <p className="mt-2 text-xs text-amber-200">Inactivo</p>}</button>)}</div>{!catalog.products.length && <p className={panel}>Crea tu primer preparado y agrega su receta.</p>}</>}
    {catalog && modifiers && kind === 'effects' && <EffectEditor catalog={catalog} modifiers={modifiers} optionId={optionId} busy={busy} onSave={payload => void run(async () => { await save('effect_save', payload); await load(); })} />}
    <RecipeDrawer error={error} open={!!ingredient} title={ingredient?.id ? 'Editar insumo' : 'Crear insumo'} width="large" dismissible={!busy} onClose={() => setIngredient(null)}>{ingredient && <form onSubmit={e => { e.preventDefault(); void run(async () => { await save('ingredient_save', ingredient.id ? ingredient : { ...ingredient, initial_quantity: initialBaseQuantity(ingredient), minimum_quantity: minimumBaseQuantity(ingredient), presentations: ingredient.presentations.map(stripInitialFields) }); await load(); setIngredient(null); }); }}><fieldset disabled={busy} className="space-y-5"><TextField label="Nombre" value={ingredient.name} onChange={name => setIngredient({ ...ingredient, name })} /><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-slate-400">Categoría<select className={field} value={ingredient.category} onChange={e => setIngredient({ ...ingredient, category: e.target.value })}>{Object.entries(categories).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><label className="text-xs text-slate-400">Unidad base<select disabled={!!ingredient.id} className={field} value={ingredient.unit_code} onChange={e => setIngredient({ ...ingredient, unit_code: e.target.value })}><option value="g">g · masa</option><option value="ml">ml · volumen</option><option value="piece">piece · conteo</option></select></label><NumberField label="Stock mínimo" value={ingredient.minimum_quantity} onChange={minimum_quantity => setIngredient({ ...ingredient, minimum_quantity })} /><NumberField label="Merma estimada %" value={ingredient.waste_percent} max={99.9999} step={0.0001} onChange={waste_percent => setIngredient({ ...ingredient, waste_percent })} /><TextField label="Proveedor opcional" required={false} value={ingredient.supplier_name} onChange={supplier_name => setIngredient({ ...ingredient, supplier_name })} /></div><label className="text-sm"><input type="checkbox" checked={ingredient.active} onChange={e => setIngredient({ ...ingredient, active: e.target.checked })} /> Activo</label><p className="text-xs text-slate-400">La merma sólo estima rendimiento; no descuenta existencia física.</p><div className="flex justify-between"><h3 className="font-semibold">Presentaciones</h3><button type="button" className={button} onClick={() => setIngredient({ ...ingredient, presentations: [...ingredient.presentations, { name: '', content: 1, unit_code: ingredient.unit_code, cost: 0, supplier_name: '', active: true, initial_count: '0', minimum_count: '0' }] })}>Agregar</button></div>{ingredient.presentations.map((p, index) => { const change = (updates: Partial<Presentation>) => setIngredient({ ...ingredient, presentations: ingredient.presentations.map((previous, n) => n === index ? { ...previous, ...updates } : previous) }); return <div key={p.id || index} className={panel + ' space-y-3'}><TextField label="Nombre presentación" value={p.name} onChange={name => change({ name })} /><div className="grid gap-3 sm:grid-cols-3"><NumberField label="Contenido por presentación" value={p.content} min={0.000001} step="any" onChange={content => change({ content })} /><UnitSelect catalog={catalog} base={ingredient.unit_code} value={p.unit_code} onChange={unit_code => change({ unit_code })} /><NumberField label="Costo presentación" value={p.cost} intent="MONEY" step={0.01} onChange={cost => change({ cost })} />{!ingredient.id ? <NumberField label="Cantidad inicial" value={Number(p.initial_count || 0)} intent="INTEGER" step={1} onChange={initial_count => change({ initial_count: String(initial_count) })} /> : null}<NumberField label="Mínimo (presentaciones)" value={Number(p.minimum_count || 0)} intent="INTEGER" step={1} onChange={minimum_count => change({ minimum_count: String(minimum_count) })} /></div><TextField label="Proveedor" required={false} value={p.supplier_name} onChange={supplier_name => change({ supplier_name })} /><label className="text-sm"><input type="checkbox" checked={p.active} onChange={e => change({ active: e.target.checked })} /> Activa</label></div>; })}{!ingredient.id && ingredient.presentations.length ? <p className="rounded-xl bg-cyan-300/[.06] p-3 text-sm text-cyan-100">{initialSummary(ingredient)}</p> : null}<p className="text-xs text-slate-400">Editar presentaciones no modifica stock ni costo vigente. Usa Entrada o Costo para esas operaciones.</p><button className={button + ' w-full bg-cyan-300 text-slate-950'}>Guardar insumo</button></fieldset></form>}</RecipeDrawer>
    <RecipeDrawer error={error} open={!!operation} title={operation?.action === 'receive' ? 'Entrada por presentación' : operation?.action === 'adjust' ? 'Ajuste físico' : 'Actualizar costo vigente'} dismissible={!busy} onClose={() => setOperation(null)}>{operation && <form onSubmit={e => { e.preventDefault(); void run(async () => { const { ingredient: i, ...payload } = operation; await save(operation.action, { ...payload, id: i.id }); await load(); setOperation(null); }); }}><fieldset disabled={busy} className="space-y-4"><h3 className="text-lg font-semibold">{operation.ingredient.name}</h3>{operation.action === 'receive' ? <><label className="block text-xs text-slate-400">Presentación<select required className={field} value={operation.presentation_id} onChange={e => setOperation({ ...operation, presentation_id: e.target.value })}><option value="">Seleccionar</option>{operation.ingredient.presentations.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} · {p.conversion_factor} {p.base_unit_code} · {money(p.configured_cost || 0)}</option>)}</select></label><NumberField label="Número de presentaciones" value={operation.quantity} min={1} step={1} onChange={quantity => setOperation({ ...operation, quantity })} /></> : operation.action === 'adjust' ? <NumberField label={`Cambio físico en ${operation.ingredient.unit_code} (+ / −)`} value={operation.quantity} min={-99999999999} onChange={quantity => setOperation({ ...operation, quantity })} /> : <><NumberField label={`Contenido de referencia en ${operation.unit_code}`} value={operation.content} min={0.001} onChange={content => setOperation({ ...operation, content })} /><NumberField label="Costo de ese contenido" value={operation.cost} step={0.01} onChange={cost => setOperation({ ...operation, cost })} /><p className="text-xs text-slate-400">Costo global para nuevos snapshots. No cambia ventas ni pedidos enviados.</p></>}<TextField label="Motivo / referencia" required={operation.action === 'adjust'} value={operation.notes} onChange={notes => setOperation({ ...operation, notes })} /><button className={button + ' w-full bg-cyan-300 text-slate-950'}>Registrar</button></fieldset></form>}</RecipeDrawer>
    {catalog && <PosFoodPreparedWorkspace
      open={!!product || newProduct}
      onClose={() => { setProduct(null); setNewProduct(false); }}
      product={product}
      newProduct={newProduct}
      productForm={productForm}
      setProductForm={setProductForm}
      productImageUrl={productImageUrl}
      imageBusy={imageBusy}
      imageError={imageError}
      onFile={uploadProductImage}
      onRemoveImage={() => void removeProductImage()}
      busy={busy}
      error={error}
      catalog={catalog}
      categories={productCategories}
      components={components}
      setComponents={setComponents}
      ingredientSearch={ingredientSearch}
      setIngredientSearch={setIngredientSearch}
      activeIngredients={activeIngredients}
      money={money}
      onSave={() => void run(saveProduct)}
      onPublish={() => { if (!product) return; void run(async () => { await save('recipe_publish', { id: product.id, components }); const next = await load(); const updated = next?.products.find(p => p.id === product.id); if (updated) setProduct(updated); }); }}
      modifiersContent={catalog && modifiers && product?.inventory_mode === 'recipe' ? <EffectEditor key={product.id} catalog={catalog} modifiers={modifiers} productId={product.product_id} busy={busy} onSave={payload => void run(async () => { await save('effect_save', payload); await load(); })} /> : <p className="text-sm text-slate-400">Guarda primero el preparado para configurar sus opciones.</p>}
    />}
  </>;
}
function TextField({ label, value, onChange, required = true }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) { return <label className="block text-xs text-slate-400">{label}<input required={required} maxLength={180} className={field} value={value} onChange={e => onChange(e.target.value)} /></label>; }
function formatEquivalent(ingredient: FoodIngredient) { const presentation = ingredient.presentations.find(p => p.active); if (!presentation) return ""; const count = ingredient.stock / presentation.conversion_factor; return `${count.toLocaleString("es-MX", { maximumFractionDigits: 3 })} × ${presentation.name}`; }
function stripInitialFields(presentation: Presentation) { const { initial_count, minimum_count, ...persisted } = presentation; void initial_count; void minimum_count; return persisted; }
function unitFactor(unit: string, base: string) {
  if (unit === base) return 1;
  if (base === "g") return ({ mg: 0.001, kg: 1000 } as Record<string, number>)[unit] || 1;
  if (base === "ml") return ({ l: 1000 } as Record<string, number>)[unit] || 1;
  return 1;
}
function initialBaseQuantity(ingredient: IngredientForm) {
  return ingredient.presentations.reduce((total, presentation) => total + Number(presentation.initial_count || 0) * presentation.content * unitFactor(presentation.unit_code, ingredient.unit_code), 0);
}
function minimumBaseQuantity(ingredient: IngredientForm) { const presentation = ingredient.presentations.find(p => Number(p.minimum_count || 0) > 0); return presentation ? Number(presentation.minimum_count || 0) * presentation.content * unitFactor(presentation.unit_code, ingredient.unit_code) : ingredient.minimum_quantity; }
function initialSummary(ingredient: IngredientForm) {
  const base = initialBaseQuantity(ingredient);
  const first = ingredient.presentations.find(p => Number(p.initial_count || 0) > 0);
  if (!first) return "Agrega una cantidad inicial para calcular existencias.";
  const count = Number(first.initial_count || 0);
  const cost = count * first.cost;
  return `${count} ${first.name || "presentaciones"} × ${first.content} ${first.unit_code} = ${base.toLocaleString("es-MX")} ${ingredient.unit_code}${first.cost > 0 ? ` · ${count} × $${first.cost.toFixed(2)} = $${cost.toFixed(2)} · costo base $${(first.cost / (first.content * unitFactor(first.unit_code, ingredient.unit_code))).toFixed(6)} / ${ingredient.unit_code}` : ""}`;
}
function NumberField({ label, value, onChange, min = 0, max = 99999999999, step = 0.001, intent = "DECIMAL" }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number | 'any'; intent?: NumericIntent }) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const effectiveIntent: NumericIntent = intent === "DECIMAL" && /costo|precio/i.test(label) ? "MONEY" : intent === "DECIMAL" && /merma|porcentaje|impuesto/i.test(label) ? "PERCENT" : intent === "DECIMAL" && /número|numero|personas|piezas/i.test(label) ? "INTEGER" : intent;
  const commit = (raw: string) => { const normalized = normalizeNumericDraft(raw, effectiveIntent); setDraft(normalized || "0"); onChange(normalized ? Number(normalized) : 0); };
  return <label className="block text-xs text-slate-400">{label}<input required type="number" className={field} value={focused ? draft : String(value)} min={min} max={max} step={step} onFocus={() => { setFocused(true); setDraft(String(value)); }} onChange={e => { const next = sanitizeNumericDraft(e.target.value, effectiveIntent); setDraft(next); if (next !== "" && next !== "-" && !next.endsWith(".")) onChange(Number(next)); }} onBlur={() => { commit(draft); setFocused(false); }} /></label>;
}
function UnitSelect({ catalog, base, value, onChange }: { catalog: FoodRecipesCatalog | null; base: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs text-slate-400">Unidad<select className={field} value={value} onChange={e => onChange(e.target.value)}>{catalog?.units.filter(u => u.unit_type === (base === 'g' ? 'weight' : base === 'ml' ? 'volume' : 'count')).map(u => <option key={u.code} value={u.code}>{u.symbol}</option>)}</select></label>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className={panel}><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>; }
function EffectEditor({ catalog, modifiers, productId, optionId, busy, onSave }: { catalog: FoodRecipesCatalog; modifiers: Modifiers; productId?: string; optionId?: string; busy: boolean; onSave: (payload: object) => void }) {
  const [selectedProduct, setSelectedProduct] = useState(productId || ''), [selectedOption, setSelectedOption] = useState(optionId || '');
  const [effect, setEffect] = useState('NONE'), [source, setSource] = useState(''), [target, setTarget] = useState(''), [quantity, setQuantity] = useState(1), [unit, setUnit] = useState('g');
  function selectRule(p: string, o: string) { const rule = catalog.effects.find(e => e.product_id === p && e.option_id === o); setEffect(rule?.effect || 'NONE'); setSource(rule?.source_variant_id || ''); setTarget(rule?.ingredient_variant_id || ''); setQuantity(rule?.input_quantity || 1); setUnit(rule?.input_unit_code || 'g'); }
  const associated = modifiers.options.filter(o => modifiers.associations.some(a => a.product_id === selectedProduct && a.group_id === o.group_id));
  const active = catalog.ingredients.filter(i => i.active), destination = active.find(i => i.id === target);
  return <form className={panel + ' space-y-4'} onSubmit={e => { e.preventDefault(); onSave({ product_id: selectedProduct, option_id: selectedOption, effect, source_variant_id: source || undefined, ingredient_variant_id: target || undefined, ...(effect === 'ADD' || effect === 'REPLACE' ? { quantity, unit_code: unit } : {}) }); }}><fieldset disabled={busy} className="space-y-4"><h3 className="font-semibold">Impacto por producto y opción</h3><label className="block text-xs text-slate-400">Producto<select required disabled={!!productId} className={field} value={selectedProduct} onChange={e => { setSelectedProduct(e.target.value); setSelectedOption(optionId || ''); selectRule(e.target.value, optionId || ''); }}><option value="">Seleccionar</option>{catalog.products.filter(p => p.inventory_mode === 'recipe').filter((p, i, all) => all.findIndex(other => other.product_id === p.product_id) === i).map(p => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}</select></label><label className="block text-xs text-slate-400">Opción<select required className={field} value={selectedOption} onChange={e => { setSelectedOption(e.target.value); selectRule(selectedProduct, e.target.value); }}><option value="">Seleccionar</option>{associated.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label className="block text-xs text-slate-400">Impacto<select className={field} value={effect} onChange={e => setEffect(e.target.value)}><option value="NONE">Ninguno</option><option value="ADD">Agregar</option><option value="REMOVE">Quitar componente completo</option><option value="REPLACE">Reemplazar</option></select></label>{(effect === 'REMOVE' || effect === 'REPLACE') && <label className="block text-xs text-slate-400">Insumo de receta base<select required className={field} value={source} onChange={e => setSource(e.target.value)}><option value="">Seleccionar</option>{active.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}{(effect === 'ADD' || effect === 'REPLACE') && <><label className="block text-xs text-slate-400">Insumo agregado<select required className={field} value={target} onChange={e => { setTarget(e.target.value); setUnit(active.find(i => i.id === e.target.value)?.unit_code || 'g'); }}><option value="">Seleccionar</option>{active.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><NumberField label="Cantidad explícita" value={quantity} min={0.000001} step="any" onChange={setQuantity} /><UnitSelect catalog={catalog} base={destination?.unit_code || 'g'} value={unit} onChange={setUnit} /></div></>}<p className="text-xs text-slate-400">Independiente del precio; se congela al SEND.</p><button disabled={!selectedProduct || !associated.some(o => o.id === selectedOption)} className={button + ' bg-cyan-300 text-slate-950'}>Guardar impacto</button></fieldset></form>;
}

function RecipeDrawer({ error, children, ...props }: ComponentProps<typeof PosDrawer> & { error: string | null }) {
  return <PosDrawer {...props}>{error && <p role="alert" className={panel + " mb-4 border-rose-300/30 text-rose-200"}>{error}</p>}{children}</PosDrawer>;
}
