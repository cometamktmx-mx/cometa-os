"use client";

import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { FoodRecipeProduct, FoodRecipesCatalog } from "@/lib/pos/food-recipes-shared";
import { normalizeNumericDraft, sanitizeNumericDraft } from "@/lib/pos/numeric-input";

type ProductForm = { name: string; description: string; price: number; tax_rate: number; active: boolean; category_id: string };
type Component = { ingredient_variant_id: string; quantity: number; unit_code: string };
type Category = { id: string; name: string; active: boolean };

const panel = "rounded-2xl border border-white/10 bg-[#101e29] p-5";
const field = "pos-ui-focus mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-[#152532] px-3 py-2 text-sm";
const button = "pos-ui-focus min-h-11 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-40";

export function PosFoodPreparedWorkspace({
  open,
  onClose,
  product,
  newProduct,
  productForm,
  setProductForm,
  productImageUrl,
  imageBusy,
  imageError,
  onFile,
  onRemoveImage,
  busy,
  error,
  catalog,
  categories,
  components,
  setComponents,
  ingredientSearch,
  setIngredientSearch,
  activeIngredients,
  money,
  onSave,
  onPublish,
  modifiersContent,
}: {
  open: boolean;
  onClose: () => void;
  product: FoodRecipeProduct | null;
  newProduct: boolean;
  productForm: ProductForm;
  setProductForm: Dispatch<SetStateAction<ProductForm>>;
  productImageUrl: string;
  imageBusy: boolean;
  imageError: string | null;
  onFile: (file: File) => Promise<void>;
  onRemoveImage: () => void;
  busy: boolean;
  error: string | null;
  catalog: FoodRecipesCatalog;
  categories: Category[];
  components: Component[];
  setComponents: Dispatch<SetStateAction<Component[]>>;
  ingredientSearch: string;
  setIngredientSearch: Dispatch<SetStateAction<string>>;
  activeIngredients: FoodRecipesCatalog["ingredients"];
  money: (value: number, digits?: number) => string;
  onSave: () => void;
  onPublish: () => void;
  modifiersContent: ReactNode;
}) {
  if (!open) return null;
  const recipe = product?.recipe;
  const readyRecipe = Boolean(recipe?.components?.length);
  const hasPrice = productForm.price > 0;
  const status = newProduct ? "Borrador" : readyRecipe ? "Listo para publicar" : "Receta pendiente";
  const statusTone = readyRecipe ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : "border-amber-300/30 bg-amber-300/10 text-amber-200";

  return (
    <div className="fixed inset-0 z-[100] flex bg-black/70 backdrop-blur-sm">
      <aside className="mx-auto flex h-full w-full max-w-[1280px] flex-col overflow-hidden border-x border-white/10 bg-[#081521] text-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-5 border-b border-white/10 bg-[#0b1c2a]/95 px-6 py-5 backdrop-blur-xl lg:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[.18em]">
              <span className="text-cyan-300">Preparado con receta</span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] tracking-normal ${statusTone}`}>{status}</span>
            </div>
            <h2 className="mt-2 truncate text-2xl font-bold tracking-tight">{productForm.name || "Nuevo preparado"}</h2>
            <p className="mt-1 text-sm text-slate-400">Diseña el producto, la receta y su rentabilidad en un solo lugar.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className={button} disabled={busy} onClick={onSave}>Guardar borrador</button>
            <button type="button" className={`${button} bg-cyan-300 text-slate-950`} disabled={busy || !product || !components.length} onClick={onPublish}>{recipe ? "Actualizar receta" : "Publicar receta"}</button>
            <button type="button" className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-xl text-slate-400 hover:bg-white/[.06] hover:text-white" onClick={onClose} aria-label="Cerrar">×</button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 lg:px-8">
          {error ? <div role="alert" className="mb-5 rounded-2xl border border-rose-300/30 bg-rose-300/10 p-4 text-sm text-rose-100">{error}</div> : null}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <main className="space-y-5">
              <Section eyebrow="01 · Producto" title="Información general" description="Presenta el producto como lo verá tu equipo y tu cliente.">
                <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
                  <ProductImageField imageUrl={productImageUrl} busy={imageBusy} error={imageError} onFile={onFile} onRemove={onRemoveImage} />
                  <div className="space-y-4">
                    <TextField label="Nombre comercial" value={productForm.name} onChange={name => setProductForm(current => ({ ...current, name }))} placeholder="Ej. Capuchino" />
                    <label className="block text-xs text-slate-400">Categoría<select className={field} value={productForm.category_id} onChange={event => setProductForm(current => ({ ...current, category_id: event.target.value }))}><option value="">Sin categoría</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><span className="mt-1 block text-[11px] text-slate-500">Categorías activas de esta marca.</span></label>
                    <TextAreaField label="Descripción comercial" value={productForm.description} onChange={description => setProductForm(current => ({ ...current, description }))} placeholder="Describe brevemente la experiencia o los ingredientes principales." />
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[.05] px-4 py-3 text-sm"><span className="text-cyan-200">Tipo</span><strong>Preparado con receta</strong><span className="text-slate-400">Su disponibilidad se calcula automáticamente según tus insumos.</span><p className="text-xs text-slate-400">No captures stock del preparado. Al vender se descuentan los insumos de la receta del pedido.</p></div>
                    <label className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={productForm.active} onChange={event => setProductForm(current => ({ ...current, active: event.target.checked }))} /> Disponible para venta</label>
                  </div>
                </div>
              </Section>

              <Section eyebrow="02 · Rentabilidad" title="Precio y margen" description="Define el precio y entiende cuánto aporta cada unidad.">
                <div className="grid gap-4 sm:grid-cols-2"><NumberField label="Precio de venta" value={productForm.price} step={0.01} onChange={price => setProductForm(current => ({ ...current, price }))} /><NumberField label="Impuesto %" value={productForm.tax_rate} step={0.0001} max={100} onChange={tax_rate => setProductForm(current => ({ ...current, tax_rate }))} /></div>
                {recipe ? <RecipeSummary recipe={recipe} money={money} /> : <div className="mt-4 rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-400">Publica una receta para calcular costo, utilidad y margen.</div>}
              </Section>

              <Section eyebrow="03 · Producción" title="Receta base" description="Captura los gramajes, mililitros o piezas que componen una unidad.">
                <div className="flex flex-col gap-3 sm:flex-row"><input className={field} placeholder="Buscar insumo para agregarlo" value={ingredientSearch} onChange={event => setIngredientSearch(event.target.value)} /><select className={field} value="" aria-label="Agregar insumo" onChange={event => { const ingredient = activeIngredients.find(item => item.id === event.target.value); if (ingredient) setComponents(current => [...current, { ingredient_variant_id: ingredient.id, quantity: 1, unit_code: ingredient.unit_code }]); }}><option value="">Agregar insumo…</option>{activeIngredients.filter(item => !components.some(component => component.ingredient_variant_id === item.id) && item.name.toLocaleLowerCase().includes(ingredientSearch.toLocaleLowerCase())).map(item => <option key={item.id} value={item.id}>{item.name} · {item.unit_code}</option>)}</select></div>
                {!components.length ? <div className="mt-4 rounded-xl border border-dashed border-amber-300/25 bg-amber-300/[.04] p-5 text-sm text-amber-100">Receta pendiente. Agrega al menos un insumo para poder publicar y calcular disponibilidad.</div> : <div className="mt-4 space-y-3">{components.map((component, index) => { const ingredient = activeIngredients.find(item => item.id === component.ingredient_variant_id); return <div key={component.ingredient_variant_id} className="grid gap-3 rounded-xl border border-white/10 bg-white/[.025] p-4 md:grid-cols-[minmax(0,1.3fr)_130px_130px_auto] md:items-end"><div><p className="text-xs uppercase tracking-wider text-slate-500">Insumo</p><p className="mt-1 font-semibold">{ingredient?.name || "Insumo no disponible"}</p><p className="mt-1 text-xs text-slate-500">Costo unitario {money(ingredient?.unit_cost || 0, 6)} / {ingredient?.unit_code || component.unit_code}</p></div><NumberField label="Cantidad" value={component.quantity} min={0.000001} step="any" onChange={quantity => setComponents(current => current.map((item, n) => n === index ? { ...item, quantity } : item))} /><UnitSelect catalog={catalog} base={ingredient?.unit_code || "g"} value={component.unit_code} onChange={unit_code => setComponents(current => current.map((item, n) => n === index ? { ...item, unit_code } : item))} /><button type="button" className="min-h-11 rounded-xl border border-rose-300/20 px-3 text-sm text-rose-200 hover:bg-rose-300/10" onClick={() => setComponents(current => current.filter((_, n) => n !== index))}>Quitar</button></div>; })}</div>}
                <p className="mt-4 text-xs text-slate-500">La conversión, el costo y la versión publicada se validan en servidor.</p>
              </Section>

              <Section eyebrow="04 · Venta" title="Modificadores" description="Configura opciones que agregan, quitan o reemplazan componentes de la receta.">{modifiersContent}</Section>

              <Section eyebrow="05 · Operación" title="Disponibilidad por receta" description="El insumo limitante determina las porciones disponibles. No es stock físico del preparado.">{recipe ? <Availability recipe={recipe} /> : <div className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-slate-400">La disponibilidad aparecerá cuando publiques una receta válida.</div>}</Section>
            </main>

            <aside className="xl:sticky xl:top-0 xl:self-start">
              <div className="space-y-4 rounded-3xl border border-cyan-300/20 bg-gradient-to-b from-[#102b3b] to-[#0d1b28] p-5 shadow-[0_20px_70px_rgba(0,0,0,.25)]">
                <p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan-300">Resumen del preparado</p>
                <div className="flex items-center gap-3"><div className="h-16 w-16 overflow-hidden rounded-2xl border border-white/10 bg-white/[.05]">{productImageUrl ? <img src={productImageUrl} alt="Vista previa" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-2xl text-slate-500">☕</div>}</div><div className="min-w-0"><p className="truncate font-semibold">{productForm.name || "Nuevo preparado"}</p><p className="text-sm text-slate-400">Preparado con receta</p></div></div>
                <div className="grid grid-cols-2 gap-3"><SummaryMetric label="Precio" value={money(productForm.price)} /><SummaryMetric label="Costo" value={recipe ? money(recipe.unit_cost) : "—"} /><SummaryMetric label="Margen" value={recipe?.gross_margin === null || recipe?.gross_margin === undefined ? "—" : `${(recipe.gross_margin * 100).toFixed(1)}%`} /><SummaryMetric label="Disponibles" value={recipe?.availability == null ? "—" : `${recipe.availability} porciones disponibles`} /></div>
                <div className="space-y-2 border-t border-white/10 pt-4 text-sm"><Checklist label="Imagen lista" done={Boolean(productImageUrl)} /><Checklist label="Precio definido" done={hasPrice} /><Checklist label="Receta completa" done={readyRecipe} /><Checklist label="Disponibilidad calculada" done={Boolean(recipe)} /></div>
                <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs leading-5 text-slate-400">La utilidad mostrada es bruta estimada: precio menos costo de receta. No incluye gastos operativos.</div>
                <button type="button" className={`${button} w-full bg-cyan-300 text-slate-950`} disabled={busy} onClick={onSave}>{busy ? "Guardando…" : "Guardar preparado"}</button>
              </div>
            </aside>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Section({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) { return <section className={panel}><p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">{eyebrow}</p><h3 className="mt-2 text-xl font-bold">{title}</h3><p className="mt-1 text-sm text-slate-400">{description}</p><div className="mt-5">{children}</div></section>; }
function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="block text-xs text-slate-400">{label}<input required maxLength={180} className={field} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>; }
function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="block text-xs text-slate-400">{label}<textarea rows={3} maxLength={2000} className={`${field} resize-y`} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>; }
function NumberField({ label, value, onChange, min = 0, max = 99999999999, step = 0.001 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number | "any" }) { const [draft, setDraft] = useState(String(value)); const [focused, setFocused] = useState(false); return <label className="block text-xs text-slate-400">{label}<input required type="number" className={field} value={focused ? draft : String(value)} min={min} max={max} step={step} onFocus={() => { setFocused(true); setDraft(String(value)); }} onChange={event => { const next = sanitizeNumericDraft(event.target.value, /precio|impuesto/i.test(label) ? "MONEY" : "DECIMAL"); setDraft(next); if (next && !next.endsWith(".")) onChange(Number(next)); }} onBlur={() => { const next = normalizeNumericDraft(draft, /precio|impuesto/i.test(label) ? "MONEY" : "DECIMAL"); setDraft(next || "0"); onChange(next ? Number(next) : 0); setFocused(false); }} /></label>; }
function UnitSelect({ catalog, base, value, onChange }: { catalog: FoodRecipesCatalog; base: string; value: string; onChange: (value: string) => void }) { const type = base === "g" ? "weight" : base === "ml" ? "volume" : "count"; return <label className="text-xs text-slate-400">Unidad<select className={field} value={value} onChange={event => onChange(event.target.value)}>{catalog.units.filter(unit => unit.unit_type === type).map(unit => <option key={unit.code} value={unit.code}>{unit.symbol}</option>)}</select></label>; }
function ProductImageField({ imageUrl, busy, error, onFile, onRemove }: { imageUrl: string; busy: boolean; error: string | null; onFile: (file: File) => Promise<void>; onRemove: () => void }) { return <div className="space-y-3"><div className="aspect-square overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/10 to-white/[.03]">{imageUrl ? <img src={imageUrl} alt="Vista previa del preparado" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-4xl text-slate-500">☕</div>}</div><input id="food-prepared-image" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void onFile(file); event.currentTarget.value = ""; }} /><button type="button" className={`${button} w-full`} disabled={busy} onClick={() => document.getElementById("food-prepared-image")?.click()}>{busy ? "Subiendo…" : imageUrl ? "Cambiar imagen" : "Subir imagen"}</button>{imageUrl ? <button type="button" className="w-full text-xs text-slate-400 hover:text-rose-200" disabled={busy} onClick={onRemove}>Eliminar imagen</button> : <p className="text-center text-[11px] text-slate-500">JPG, PNG o WEBP · máximo 5 MB</p>}{error ? <p role="alert" className="text-xs text-rose-200">{error}</p> : null}</div>; }
function RecipeSummary({ recipe, money }: { recipe: NonNullable<FoodRecipeProduct["recipe"]>; money: (value: number, digits?: number) => string }) { return <div className="mt-4 grid gap-3 sm:grid-cols-2"><SummaryMetric label="Costo de receta" value={money(recipe.unit_cost)} /><SummaryMetric label="Utilidad bruta" value={money(recipe.gross_profit)} /><SummaryMetric label="Margen bruto" value={recipe.gross_margin === null ? "No calculable" : `${(recipe.gross_margin * 100).toFixed(1)}%`} /><SummaryMetric label="Versión publicada" value={`v${recipe.version}`} /></div>; }
function Availability({ recipe }: { recipe: NonNullable<FoodRecipeProduct["recipe"]> }) { return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><SummaryMetric label="Porciones disponibles" value={recipe.availability == null ? "—" : `${recipe.availability} porciones disponibles`} /><SummaryMetric label="Insumo limitante" value={recipe.limiting_ingredient || "—"} /></div><div className="rounded-xl border border-white/10 bg-white/[.025] p-4 text-sm"><p className="text-xs uppercase tracking-wider text-slate-500">Rendimiento por componente</p>{recipe.components.map(component => <div key={component.ingredient_variant_id} className="flex items-center justify-between border-b border-white/5 py-3 last:border-0"><span>{component.name}</span><strong>{component.possible} posibles</strong></div>)}</div><p className="text-sm text-slate-400">Remanente estimado: <strong className="text-slate-200">{recipe.limiting_remaining ?? "—"}</strong></p></div>; }
function SummaryMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-black/10 p-3"><p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-white">{value}</p></div>; }
function Checklist({ label, done }: { label: string; done: boolean }) { return <div className="flex items-center justify-between"><span className="text-slate-300">{label}</span><span className={done ? "text-emerald-300" : "text-slate-600"}>{done ? "✓" : "○"}</span></div>; }
