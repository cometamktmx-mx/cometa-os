"use client";
import {useCallback,useEffect,useRef,useState} from 'react';

type PaymentState={mode:'test'|'live';connected:boolean;active:boolean;chargesEnabled:boolean;payoutsEnabled:boolean;detailsSubmitted:boolean};
export function PaymentOnboarding({brandSlug,dirty}:{brandSlug:string;dirty:boolean}){
 const [state,setState]=useState<PaymentState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[country,setCountry]=useState(''),[notice,setNotice]=useState('');
 const returning=useRef(false),locked=useRef(false);
 const endpoint='/api/pos/online-store/payments?brandSlug='+encodeURIComponent(brandSlug);
 const request=useCallback(async(body?:object)=>{
  const response=await fetch(endpoint,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw Error(typeof data.error==='string'?data.error:data.error?.message??'No se pudo consultar Stripe. Vuelve a intentarlo.');return data;
 },[endpoint]);
 const refresh=useCallback(async()=>{const current:PaymentState=await request();if(current.connected)await request({action:'sync'});const latest:PaymentState=current.connected?await request():current;setState(latest);return latest;},[request]);
 const onboard=useCallback(async()=>{
  const link=await request({action:'onboard'});const url=new URL(link.url);
  if(url.protocol!=='https:'||url.hostname!=='connect.stripe.com'||url.username||url.password)throw Error('Stripe no devolvió un enlace válido. Vuelve a intentarlo.');
  window.location.assign(url.href);
 },[request]);
 const act=async(action:'connect'|'onboard'|'refresh')=>{
  if(locked.current)return;
  if(action!=='refresh'&&dirty){setError('Guarda los cambios de configuración antes de salir hacia Stripe.');return;}
  if(action==='connect'&&!/^[A-Z]{2}$/.test(country)){setError('Indica el país legal de la cuenta con dos letras, por ejemplo MX.');return;}
  locked.current=true;setBusy(true);setError('');setNotice('');
  try{if(action==='refresh'){await refresh();setNotice('Estado consultado directamente en Stripe.');}
   else{if(action==='connect')await request({action:'create',country});await refresh();await onboard();}
  }catch(e){setError(e instanceof Error?e.message:'No se pudo completar la solicitud.');}finally{locked.current=false;setBusy(false);}
 };
 useEffect(()=>{
  let disposed=false;
  const marker=new URL(window.location.href).searchParams.get('connect');
  if(returning.current)return;returning.current=true;locked.current=true;
  void (async()=>{setBusy(true);setError('');try{
   await refresh();if(disposed)return;
   // Consume the callback before redirecting: failed refreshes remain manually retryable.
   if(marker==='refresh'||marker==='return'){const url=new URL(window.location.href);url.searchParams.delete('connect');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}
   if(marker==='refresh'){setNotice('El enlace venció. Generando un nuevo acceso a Stripe…');await onboard();}
   else if(marker==='return')setNotice('Estado actualizado. Volver de Stripe no activa cobros ni confirma un pago.');
  }catch(e){if(!disposed)setError(e instanceof Error?e.message:'No se pudo consultar Stripe.');}finally{if(!disposed){setBusy(false);locked.current=false;}}})();
  return()=>{disposed=true;returning.current=false;};
 },[refresh,onboard]);
 const button='rounded-lg border border-[var(--pos-line-subtle)] px-4 py-2 text-sm disabled:opacity-50';
 return <div className="space-y-3 rounded-xl border border-[var(--pos-line-subtle)] p-4" aria-busy={busy}>
  <h3 className="font-semibold">Cuenta receptora de la marca</h3>
  {state&&<><p>Entorno: {state.mode==='test'?'Stripe test · sin cargos ni depósitos reales':'Stripe live'}.</p><p>{!state.connected?'Sin conectar':!state.detailsSubmitted?'Configuración pendiente':state.chargesEnabled&&state.payoutsEnabled?'Configuración completada':'Configuración pendiente de habilitación en Stripe'}.</p>
   <p>Cobros habilitados: {state.chargesEnabled?'Sí':'No'}. Depósitos habilitados: {state.payoutsEnabled?'Sí':'No'}.</p>
   <p className="text-sm">{state.active?'Esta cuenta está activada como destino de nuevas compras.':'Esta cuenta todavía no está activada como destino de nuevas compras. Completar el onboarding no cambia el destino automáticamente.'}</p>
   {!state.connected&&<label className="grid gap-1 text-sm">País legal de la cuenta (ISO)<input className="rounded-lg border border-[var(--pos-line-subtle)] bg-[var(--pos-panel-raised)] p-2" value={country} maxLength={2} placeholder="MX" disabled={busy} onChange={e=>setCountry(e.target.value.toUpperCase())}/><span>Confirma el país antes de conectar; no puede cambiarse al reintentar.</span></label>}
  </>}
  {dirty&&<p className="text-sm">Guarda los cambios antes de abrir Stripe. Consultar estado conserva tu borrador.</p>}
  <div className="flex flex-wrap gap-3">{state&&<button type="button" className={button} disabled={busy||dirty} onClick={()=>void act(state.connected?'onboard':'connect')}>{state.connected?'Completar configuración':'Conectar cuenta'}</button>}<button type="button" className={button} disabled={busy} onClick={()=>void act('refresh')}>Consultar estado</button></div>
  {busy&&<p role="status">Consultando Stripe…</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="text-red-500">{error}</p>}
  <p className="text-sm text-[var(--pos-text-muted)]">Los datos de la cuenta se completan en Stripe. Si el enlace vence, se genera uno nuevo al regresar o al pulsar Completar configuración.</p>
 </div>;
}
