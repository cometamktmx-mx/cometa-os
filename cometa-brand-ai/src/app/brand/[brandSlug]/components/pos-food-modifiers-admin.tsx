"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FoodModifierGroup, FoodModifierOption } from "@/lib/pos/food-shared";
import { PosFoodRecipesAdmin } from "./pos-food-recipes-admin";

type Group = Omit<FoodModifierGroup,"options"> & {active:boolean};
type Option = FoodModifierOption & {group_id:string;active:boolean};
type Catalog = {groups:Group[];options:Option[];products:{id:string;name:string}[];associations:{product_id:string;group_id:string}[]};
type GroupForm = Omit<Group,"id"> & {id?:string};
type OptionForm = Omit<Option,"id"> & {id?:string};
const emptyGroup = ():GroupForm=>({name:"",required:false,min_selections:0,max_selections:1,selection_mode:"single",display_order:0,active:true});
const emptyOption = (group_id=""):OptionForm=>({group_id,name:"",price_delta:0,type:"choice",display_order:0,active:true});
const field="pos-ui-focus mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-[#152532] px-3 py-2 text-sm";
const button="pos-ui-focus min-h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold disabled:opacity-40";
const panel="space-y-4 rounded-2xl border border-white/10 bg-[#101e29] p-5";

export function PosFoodModifiersAdmin({brandSlug}:{brandSlug:string}) {
  const [catalog,setCatalog]=useState<Catalog|null>(null);
  const [group,setGroup]=useState<GroupForm>(emptyGroup);
  const [option,setOption]=useState<OptionForm>(()=>emptyOption());
  const [productId,setProductId]=useState("");
  const [groupIds,setGroupIds]=useState<string[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const load=useCallback(async()=>{
    const response=await fetch(`/api/pos/food/modifiers?brandSlug=${encodeURIComponent(brandSlug)}`,{cache:"no-store"});
    const body:{catalog?:Catalog;error?:string}=await response.json();
    if(!response.ok || !body.catalog) throw new Error(body.error||"No se pudo cargar la configuración.");
    setCatalog(body.catalog);
  },[brandSlug]);
  // The initial catalog load is an external request; its result updates the view asynchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load().catch(reason=>setError(reason instanceof Error?reason.message:"Error de conexión."));},[load]);
  async function save(action:string,payload:Record<string,unknown>) {
    if(busy) return;
    setBusy(true);setError(null);setNotice(null);
    try {
      const response=await fetch("/api/pos/food/modifiers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({brandSlug,action,...payload})});
      const body:{error?:string}=await response.json();
      if(!response.ok) throw new Error(body.error||"No se pudo guardar.");
      await load();setNotice("Configuración guardada. Los pedidos enviados conservan sus selecciones.");
    } catch(reason) {setError(reason instanceof Error?reason.message:"Error de conexión.");}
    finally {setBusy(false);}
  }
  return <section className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Catálogo Food</p><h1 className="mt-2 text-3xl font-bold">Modificadores</h1><p className="mt-2 text-sm text-slate-400">Define elecciones táctiles y reutiliza grupos entre productos.</p></div><Link className={button+" flex items-center"} href={`/brand/${brandSlug}/pos/admin`}>Volver a administración</Link></div>
    {error?<div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-4 text-sm">{error}<button className="ml-3 underline" onClick={()=>void load().then(()=>setError(null)).catch(reason=>setError(reason.message))}>Actualizar</button></div>:null}
    {notice?<p role="status" className="rounded-xl bg-emerald-300/10 p-3 text-sm text-emerald-200">{notice}</p>:null}
    {!catalog?<p role="status" className={panel}>Cargando grupos, opciones y productos…</p>:<fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <form className={panel} onSubmit={event=>{event.preventDefault();const payload={...group,id:group.id||crypto.randomUUID()};setGroup(payload);void save("group_save",payload);}}>
          <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Grupos</h2><button type="button" className={button} onClick={()=>setGroup(emptyGroup())}>Nuevo grupo</button></div>
          <label className="block text-xs text-slate-400">Editar grupo<select className={field} value={catalog.groups.some(g=>g.id===group.id)?group.id:""} onChange={event=>{const current=catalog.groups.find(g=>g.id===event.target.value);setGroup(current?{...current}:emptyGroup());}}><option value="">Nuevo grupo</option>{catalog.groups.map(g=><option key={g.id} value={g.id}>{g.name}{g.active?"":" · Inactivo"}</option>)}</select></label>
          <label className="block text-xs text-slate-400">Nombre<input required maxLength={100} className={field} value={group.name} onChange={event=>setGroup({...group,name:event.target.value})}/></label>
          <label className="block text-xs text-slate-400">Selección<select className={field} value={group.selection_mode} onChange={event=>setGroup({...group,selection_mode:event.target.value==='single'?'single':'multiple',max_selections:event.target.value==='single'?1:group.max_selections,min_selections:event.target.value==='single'?Math.min(group.min_selections,1):group.min_selections})}><option value="single">Única</option><option value="multiple">Múltiple</option></select></label>
          <div className="grid grid-cols-3 gap-3"><NumberField label="Mínimo" value={group.min_selections} min={group.required?1:0} max={group.max_selections} onChange={value=>setGroup({...group,min_selections:value})}/><NumberField label="Máximo" value={group.max_selections} min={Math.max(group.min_selections,1)} max={group.selection_mode==='single'?1:100} onChange={value=>setGroup({...group,max_selections:value})}/><NumberField label="Orden" value={group.display_order} min={0} max={100000} onChange={value=>setGroup({...group,display_order:value})}/></div>
          <div className="flex gap-5 text-sm"><label><input type="checkbox" checked={group.required} onChange={event=>setGroup({...group,required:event.target.checked,min_selections:event.target.checked?Math.max(group.min_selections,1):group.min_selections})}/> Obligatorio</label><label><input type="checkbox" checked={group.active} onChange={event=>setGroup({...group,active:event.target.checked})}/> Activo</label></div>
          <button className={button+" w-full bg-cyan-300 text-slate-950"}>Guardar grupo</button>
        </form>
        <form className={panel} onSubmit={event=>{event.preventDefault();const payload={...option,id:option.id||crypto.randomUUID()};setOption(payload);void save("option_save",payload);}}>
          <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Opciones</h2><button type="button" className={button} onClick={()=>setOption(emptyOption(option.group_id))}>Nueva opción</button></div>
          <label className="block text-xs text-slate-400">Grupo<select required className={field} value={option.group_id} onChange={event=>setOption(emptyOption(event.target.value))}><option value="">Selecciona grupo</option>{catalog.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          <label className="block text-xs text-slate-400">Editar opción<select className={field} value={catalog.options.some(o=>o.id===option.id)?option.id:""} onChange={event=>{const current=catalog.options.find(o=>o.id===event.target.value);setOption(current?{...current}:emptyOption(option.group_id));}}><option value="">Nueva opción</option>{catalog.options.filter(o=>o.group_id===option.group_id).map(o=><option key={o.id} value={o.id}>{o.name}{o.active?"":" · Inactiva"}</option>)}</select></label>
          <label className="block text-xs text-slate-400">Nombre<input required maxLength={100} className={field} value={option.name} onChange={event=>setOption({...option,name:event.target.value})}/></label>
          <div className="grid grid-cols-3 gap-3"><label className="text-xs text-slate-400">Tipo<select className={field} value={option.type} onChange={event=>setOption({...option,type:event.target.value==='remove'?'remove':event.target.value==='add'?'add':'choice',price_delta:Math.max(option.price_delta,0)})}><option value="choice">Elección</option><option value="add">Extra</option><option value="remove">Quitar</option></select></label><NumberField label="Extra por unidad" value={option.price_delta} min={option.type==='remove'?-1000000:0} max={1000000} step={0.01} onChange={value=>setOption({...option,price_delta:value})}/><NumberField label="Orden" value={option.display_order} min={0} max={100000} onChange={value=>setOption({...option,display_order:value})}/></div>
          <label className="block text-sm"><input type="checkbox" checked={option.active} onChange={event=>setOption({...option,active:event.target.checked})}/> Activa</label><p className="text-[11px] text-slate-400">Quitar no cambia el precio salvo que configures un importe. El impacto de receta se configura por separado.</p>
          <button disabled={!option.group_id} className={button+" w-full bg-cyan-300 text-slate-950"}>Guardar opción</button>
        </form>
      </div>
      <form className={panel} onSubmit={event=>{event.preventDefault();void save("product_groups_save",{product_id:productId,group_ids:groupIds});}}><h2 className="text-xl font-bold">Producto → grupos</h2><label className="block text-xs text-slate-400">Producto<select required className={field} value={productId} onChange={event=>{setProductId(event.target.value);setGroupIds(catalog.associations.filter(a=>a.product_id===event.target.value).map(a=>a.group_id));}}><option value="">Selecciona producto</option>{catalog.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{catalog.groups.map(g=><label key={g.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 px-3 text-sm"><input disabled={!productId} type="checkbox" checked={groupIds.includes(g.id)} onChange={event=>setGroupIds(previous=>event.target.checked?[...previous,g.id]:previous.filter(id=>id!==g.id))}/>{g.name}{!g.active?<span className="text-xs text-slate-500">Inactivo</span>:null}</label>)}</div><button disabled={!productId} className={button+" bg-cyan-300 text-slate-950"}>Guardar asociación</button></form>
    </fieldset>}
    {option.id && <PosFoodRecipesAdmin key={option.id} brandSlug={brandSlug} kind="effects" optionId={option.id} />}
  </section>;
}

function NumberField({label,value,min,max,step=1,onChange}:{label:string;value:number;min:number;max:number;step?:number;onChange:(value:number)=>void}) {
  return <label className="block text-xs text-slate-400">{label}<input type="number" required className={field} value={value} min={min} max={max} step={step} onChange={event=>onChange(Number(event.target.value))}/></label>;
}

export function PosFoodProductOptions({ brandSlug, productId, onChanged }: { brandSlug: string; productId: string; onChanged: () => Promise<void> }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pending = useRef<{ signature: string; groupId: string; optionIds: string[] } | null>(null);
  const [customName, setCustomName] = useState('');
  const [customOptions, setCustomOptions] = useState('');
  const load = useCallback(async () => {
    const response = await fetch(`/api/pos/food/modifiers?brandSlug=${encodeURIComponent(brandSlug)}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || !body.catalog) throw new Error('No se pudieron cargar las opciones.');
    setCatalog(body.catalog as Catalog);
  }, [brandSlug]);
  useEffect(() => { let stopped = false; void Promise.resolve().then(() => load()).catch(() => { if (!stopped) setError('No se pudieron cargar las opciones.'); }); return () => { stopped = true; }; }, [load]);
  async function preset(name: string, names: string[], required = true) {
    if (lock.current || !catalog || !name.trim() || !names.length) return;
    lock.current = true; setBusy(true); setError(null);
    const signature = JSON.stringify({ productId, name, names, required });
    if (pending.current?.signature !== signature) pending.current = { signature, groupId: crypto.randomUUID(), optionIds: names.map(() => crypto.randomUUID()) };
    const command = pending.current;
    const post = async (action: string, payload: object) => {
      const response = await fetch('/api/pos/food/modifiers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandSlug, action, ...payload }) });
      if (!response.ok) throw new Error('No se completó la configuración. Reintenta la misma opción para continuar sin duplicarla.');
    };
    try {
      await post('group_save', { id: command.groupId, name, required, min_selections: required ? 1 : 0, max_selections: required ? 1 : names.length, selection_mode: required ? 'single' : 'multiple', display_order: name === 'Temperatura' ? 30 : name === 'Tipo de leche' ? 20 : name === 'Sabor' ? 10 : 40, active: true });
      for (let index = 0; index < names.length; index++) await post('option_save', { id: command.optionIds[index], group_id: command.groupId, name: names[index], price_delta: 0, type: required ? 'choice' : 'add', display_order: index, active: true });
      const previous = catalog.associations.filter(a => a.product_id === productId).map(a => a.group_id).filter(id => catalog.groups.find(g => g.id === id)?.name !== name);
      await post('product_groups_save', { product_id: productId, group_ids: [...new Set([...previous, command.groupId])] });
      await load(); await onChanged();
      pending.current = null;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron guardar las opciones.'); }
    finally { lock.current = false; setBusy(false); }
  }
  const attached = catalog?.groups.filter(group => catalog.associations.some(a => a.product_id === productId && a.group_id === group.id)) || [];
  return <div className="space-y-4">
    {error && <p role="alert" className="text-rose-200">{error}<button type="button" className="ml-2 underline" onClick={() => void load().then(() => setError(null)).catch(() => setError('No se pudieron cargar las opciones.'))}>Actualizar</button></p>}
    <fieldset disabled={busy || !catalog} className="space-y-3">
      <h4 className="font-semibold">¿Cómo puede prepararse?</h4><div className="flex flex-wrap gap-2">{(['Solo caliente', 'Solo fría', 'El cliente puede elegir'] as const).map((label, index) => <button type="button" className={button} key={label} onClick={() => void preset('Temperatura', index === 0 ? ['Caliente'] : index === 1 ? ['Frío'] : ['Caliente', 'Frío'])}>{label}</button>)}</div>
      <p className="text-xs text-slate-400">Una sola opción obligatoria se aplica automáticamente. Frío puede agregar hielo; no reduce leche automáticamente.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => void preset('Sabor', ['Natural', 'Vainilla', 'Caramelo', 'Oreo'])}>+ Sabor</button><button type="button" className={button} onClick={() => void preset('Tipo de leche', ['Entera', 'Deslactosada', 'Almendra', 'Avena'])}>+ Tipo de leche</button><button type="button" className={button} onClick={() => void preset('Extras', ['Shot extra', 'Crema'], false)}>+ Extras</button><button type="button" className={button} onClick={() => void preset('Toppings', ['Oreo', 'Canela'], false)}>+ Toppings</button></div>
      <details className={panel}><summary>+ Opción personalizada</summary><input className={field} placeholder="Nombre del grupo" maxLength={100} value={customName} onChange={e => setCustomName(e.target.value)} /><input className={field} placeholder="Opciones separadas por coma" value={customOptions} onChange={e => setCustomOptions(e.target.value)} /><button type="button" className={button} onClick={() => void preset(customName.trim(), [...new Set(customOptions.split(',').map(value => value.trim()).filter(Boolean))].slice(0, 20))}>Crear grupo</button></details>
    </fieldset>
    {attached.map(group => <div key={group.id} className="rounded-xl border border-white/10 p-3"><strong>{group.name}</strong><p className="text-sm">{group.required ? 'Obligatorio' : 'Opcional'} · {group.selection_mode === 'single' ? 'Una opción' : 'Varias opciones'} · {group.min_selections}–{group.max_selections}</p><p className="text-sm text-slate-400">{catalog?.options.filter(option => option.group_id === group.id && option.active).map(option => `${option.name} (+${option.price_delta})`).join(' · ')}</p></div>)}
    <p className="text-xs text-amber-200">Los presets crean opciones comerciales, sin inventario automático. Configura sus efectos abajo. Un efecto por opción; las cantidades no cambian por tamaño. No uses una sustitución fija si las recetas requieren cantidades distintas.</p>
    <Link className="inline-flex min-h-11 items-center underline" href={`/brand/${brandSlug}/pos/admin/modifiers`}>Editar grupos, precios, mínimos y máximos</Link>
  </div>;
}
