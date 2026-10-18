"use client";
import {useState} from "react";

export type RetailQuantityVariant={id:string;name:string;attributes?:Record<string,unknown>;available:number|null};
/** Retail-only callers. Availability is additional capacity, never requested quantity. */
export function RetailVariantQuantities({name,variants,onClose,onConfirm}:{name:string;variants:RetailQuantityVariant[];onClose:()=>void;onConfirm:(rows:{id:string;quantity:number}[])=>void}){
 const [quantities,setQuantities]=useState<Record<string,number>>({});
 const [error,setError]=useState("");
 const rows=variants.map(v=>({id:v.id,quantity:quantities[v.id]||0})).filter(v=>v.quantity>0);
 const total=rows.reduce((sum,v)=>sum+v.quantity,0);
 const invalid=variants.find(v=>!Number.isSafeInteger(quantities[v.id]||0)||(quantities[v.id]||0)<0||v.available!==null&&(quantities[v.id]||0)>v.available);
 const label=(v:RetailQuantityVariant)=>Object.values(v.attributes||{}).filter(value=>typeof value==="string"&&value.trim()).join(" · ")||v.name;
 return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/65 p-3"><form role="dialog" aria-modal="true" aria-label={`Cantidades de ${name}`} className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/20 bg-[var(--pos-panel-raised)] shadow-2xl" onSubmit={e=>{e.preventDefault();if(invalid||!total)return;try{onConfirm(rows);}catch(e){setError(e instanceof Error?e.message:"No se pudieron agregar las variantes.");}}}>
 <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 p-4"><div><h2 className="font-bold">{name}</h2><p className="text-xs text-slate-400">Captura las piezas de cada variante y confirma juntas.</p></div><button type="button" aria-label="Cerrar cantidades" onClick={onClose}>✕</button></header>
 <div className="min-h-0 overflow-y-auto p-4"><table className="w-full text-left text-sm"><thead><tr className="text-xs text-slate-400"><th>Variante · talla / color</th><th className="text-right">Disponible para agregar</th><th className="pl-3">Cantidad</th></tr></thead><tbody>{variants.map((v,index)=><tr key={v.id} className="border-t border-white/10"><td className="max-w-64 break-words py-3 pr-3">{label(v)}</td><td className="text-right tabular-nums">{v.available===null?"Sin límite de inventario":Math.max(v.available,0)}</td><td className="w-24 py-2 pl-3"><input autoFocus={index===0} aria-label={`Cantidad ${label(v)}`} type="number" min="0" max={v.available??undefined} step="1" value={quantities[v.id]??0} onChange={e=>{setQuantities({...quantities,[v.id]:Number(e.target.value)});setError("");}} className="h-9 w-full rounded border border-white/20 bg-black/20 px-2 text-white"/></td></tr>)}</tbody></table></div>
 <footer className="shrink-0 border-t border-white/10 p-4"><p className="mb-2 text-sm">{total} piezas · {rows.length} variantes seleccionadas</p>{(invalid||error)&&<p role="alert" className="mb-2 text-sm text-rose-300">{error||`Revisa ${invalid?label(invalid):"la cantidad"}: usa piezas enteras dentro de lo disponible.`}</p>}<button disabled={!total||!!invalid} className="w-full rounded-lg bg-cyan-300 px-4 py-3 font-bold text-slate-950 disabled:opacity-40">Agregar cantidades</button></footer>
 </form></div>;
}
