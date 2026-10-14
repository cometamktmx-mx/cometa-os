"use client";
import { useEffect, useState } from "react";
import { usePosFetch } from "@/lib/pos/client-transport";
import type { ProductChannels } from "@/lib/pos/product-channels";

export function ProductSalesChannels({brandSlug,productId,onDraftChange}:{brandSlug:string;productId:string|null;onDraftChange?:(value:{physicalRequested:boolean;onlineRequested:boolean})=>void}){
  const fetch=usePosFetch();
  const [saved,setSaved]=useState<ProductChannels|null>(null);
  const [physical,setPhysical]=useState(true),[online,setOnline]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
  const [stale,setStale]=useState(false),[reload,setReload]=useState(0);
  const [options,setOptions]=useState<{onlineEnabled:boolean;canManageOnline:boolean}|null>(null);
  useEffect(()=>{
    if(productId)return;
    let alive=true;
    fetch(`/api/pos/product-channel-options?brandSlug=${encodeURIComponent(brandSlug)}`,{cache:"no-store"}).then(async response=>{
      const body=await response.json();if(!response.ok||!body.ok)throw new Error("No se pudo verificar la habilitación de canales.");
      if(alive)setOptions(body);
    }).catch(cause=>{if(alive)setError(cause instanceof Error?cause.message:"No se pudieron consultar los canales.");});
    return ()=>{alive=false;};
  },[brandSlug,productId,fetch]);
  const endpoint=`/api/pos/products/${encodeURIComponent(productId??"")}/channels?brandSlug=${encodeURIComponent(brandSlug)}`;
  useEffect(()=>{
    if(!productId)return;
    let alive=true;
    fetch(endpoint,{cache:"no-store"}).then(async response=>{
      const body=await response.json();if(!response.ok||!body.ok)throw new Error(body.error||"No se pudieron consultar los canales.");
      if(alive){setSaved(body.channels);setPhysical(body.channels.physicalRequested);setOnline(body.channels.onlineRequested);setError(null);setStale(false);}
    }).catch(cause=>{if(alive){setSaved(null);setError(cause instanceof Error?cause.message:"No se pudieron consultar los canales.");}});
    return ()=>{alive=false;};
  },[endpoint,productId,fetch,reload]);
  async function save(){
    if(!saved||busy||stale)return;setBusy(true);setError(null);setMessage(null);
    try{
      const response=await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({physicalRequested:physical,onlineRequested:online,revision:saved.revision})});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"No se pudo confirmar el guardado.");
      setSaved(result.channels);setPhysical(result.channels.physicalRequested);setOnline(result.channels.onlineRequested);setMessage("Canales guardados. Precios, variantes e inventario no cambiaron.");
    }catch(cause){setStale(true);setError(cause instanceof Error?cause.message:"No se pudo guardar. Recarga para comprobar el estado.");}
    finally{setBusy(false);}
  }
  const locked=busy||!saved||stale;
  return <section aria-labelledby="product-sales-channels" className="my-5 rounded-2xl border border-[#244e41]/20 bg-[#f7f4eb] p-5 text-[#173e35]">
    <h3 id="product-sales-channels" className="text-lg font-semibold">Canales de venta</h3>
    <p className="mt-2 text-sm">Un catálogo e inventario. COMU conserva su publicación independiente.</p>
    {!productId?<div className="mt-3 space-y-3">
      <label className="flex gap-3"><input type="checkbox" checked={physical} onChange={event=>{setPhysical(event.target.checked);onDraftChange?.({physicalRequested:event.target.checked,onlineRequested:online});}}/>POS</label>
      {options?.onlineEnabled&&<label className="flex gap-3"><input type="checkbox" checked={online} disabled={!options.canManageOnline} onChange={event=>{setOnline(event.target.checked);onDraftChange?.({physicalRequested:physical,onlineRequested:event.target.checked});}}/>Tienda propia</label>}
      <p className="text-sm">La selección se conserva al guardar el producto. Si un canal no puede activarse, se mostrará pendiente para revisión.</p>
      {options&&!options.onlineEnabled&&<p className="text-sm">La tienda propia no está habilitada para esta marca.</p>}
    </div>:<>
      {!saved&&!error&&<p role="status" className="mt-3 text-sm">Cargando canales…</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-[#244e41]/20 bg-white p-3"><input type="checkbox" checked={physical} disabled={locked||!saved?.canManagePhysical} onChange={e=>setPhysical(e.target.checked)}/>Tienda física</label>
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-[#244e41]/20 bg-white p-3"><input type="checkbox" checked={online} disabled={locked||!saved?.canManageOnline||(!online&&saved?.serviceStatus!=="enabled")} onChange={e=>setOnline(e.target.checked)}/>Tienda online</label>
      </div>
      {saved&&<div className="mt-3 space-y-1 text-sm">
        <p>En caja: {saved.physicalEffective?"incluido":"no disponible"}.</p>
        <p>Publicación online solicitada: {saved.onlineRequested?"sí":"no"}. Disponibilidad efectiva: {saved.onlineEffective?"catálogo elegible":"no disponible"}.</p>
        {saved.serviceStatus!=="enabled"&&<p>{saved.serviceStatus==="suspended"?"Servicio online suspendido. La selección guardada se conserva.":saved.serviceStatus==="unknown"?"No se pudo verificar el servicio online.":"Servicio online deshabilitado. Solo un administrador global puede habilitarlo."}</p>}
        {!saved.catalogEligible&&<p>Online requiere producto físico activo, habilitado para venta, inventario directo y al menos una variante activa. Stock cero no elimina la publicación.</p>}
        {!saved.canManageOnline&&<p>La publicación online requiere propietario o administrador de la marca.</p>}
      </div>}
      <p className="mt-3 text-sm">Este guardado cambia la selección de canales. La ficha web y los requisitos de publicación determinan qué se muestra en la tienda.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled={locked||!saved?.canManagePhysical} onClick={()=>void save()} className="min-h-11 rounded-xl bg-[#173e35] px-4 text-sm font-semibold text-white disabled:opacity-40">{busy?"Guardando…":"Guardar canales"}</button>
        <button type="button" disabled={busy} onClick={()=>{setStale(true);setReload(n=>n+1);}} className="min-h-11 rounded-xl border border-[#173e35]/30 px-4 text-sm">Recargar canales</button>
      </div>
    </>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
