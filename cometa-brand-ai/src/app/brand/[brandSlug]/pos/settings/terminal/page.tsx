"use client";
import {useEffect,useState} from "react";
import {usePosContext} from "../../../components/pos-shell";
import {PosPage,PosPageHeader,PosCard,PosInput,PosButton} from "../../../components/pos-ui";
import {terminalRequest,printOperation} from "@/lib/pos/thermal-client";
import type {TerminalPrintConfig} from "@/lib/pos/thermal";

export default function TerminalPage(){
 const {brand}=usePosContext();
 const [config,setConfig]=useState<TerminalPrintConfig>({printer:"",width:80,autoPrint:false,autoDrawer:false,profile:"driver"});
 const [message,setMessage]=useState("Leyendo terminal…"),[busy,setBusy]=useState(false),[reason,setReason]=useState(""),[cashSession,setCashSession]=useState("");
 const [sessions,setSessions]=useState<{id:string;label:string}[]>([]);
 useEffect(()=>{let active=true;void terminalRequest(brand.slug).then(r=>{if(active){if(r.config)setConfig(r.config);setMessage(r.ready?"Firma configurada. La conexión USB se comprueba al enviar una prueba.":"Falta configurar la firma segura del puente QZ Tray.");}}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false};},[brand.slug]);
 async function run(action:"configure"|"test"|"drawer"){
   if(busy)return;setBusy(true);
   try {if(action==="configure"){await terminalRequest(brand.slug,{action,config});setMessage("Configuración guardada para este navegador/app y marca.");}else setMessage(await printOperation(brand.slug,{action,reason,cashSessionId:cashSession,requestKey:crypto.randomUUID()}));}
   catch(e){setMessage(e instanceof Error?e.message:"No se pudo completar la solicitud.");}finally{setBusy(false);}
 }
 async function loadCash(){try{const b=await terminalRequest(brand.slug,{action:"cash"});setSessions((b.sessions||[]).map(s=>({id:s.id,label:s.register?.name||"Turno abierto"})));}catch(e){setMessage(e instanceof Error?e.message:"No disponible.");}}
 return <PosPage><PosPageHeader title="Impresora y cajón" description="Configuración de esta terminal. Guarda antes de probar. Ninguna prueba registra una venta."/><PosCard><div className="grid max-w-2xl gap-5">
 <PosInput label="Nombre exacto de la impresora instalada en Windows" value={config.printer} onChange={e=>setConfig({...config,printer:e.target.value})}/>
 <label>Papel<select className="ml-3 rounded-xl bg-slate-900 p-3" value={config.width} onChange={e=>setConfig({...config,width:Number(e.target.value) as 58|80})}><option value={58}>58 mm</option><option value={80}>80 mm</option></select></label>
 <label>Perfil confirmado del cajón<select className="mt-2 w-full rounded-xl bg-slate-900 p-3" value={config.profile} onChange={e=>setConfig({...config,profile:e.target.value as TerminalPrintConfig["profile"],autoDrawer:false})}><option value="driver">Sin confirmar · solo imprimir con controlador Windows</option><option value="escpos-pin2">ESC/POS compatible · pulso pin 2</option><option value="escpos-pin5">ESC/POS compatible · pulso pin 5</option></select></label>
 <p className="text-sm text-slate-400">No selecciones ESC/POS sin comprobar el manual del modelo. Desactiva la apertura automática del cajón en el controlador Windows para que reimprimir no lo abra.</p>
 <label className="flex gap-3"><input type="checkbox" checked={config.autoPrint} onChange={e=>setConfig({...config,autoPrint:e.target.checked})}/>Imprimir al confirmar la venta</label>
 <label className="flex gap-3"><input type="checkbox" disabled={config.profile==="driver"} checked={config.autoDrawer} onChange={e=>setConfig({...config,autoDrawer:e.target.checked})}/>Enviar apertura cuando el cobro incluya efectivo</label>
 <div className="flex flex-wrap gap-3"><PosButton disabled={busy} onClick={()=>void run("configure")}>Guardar terminal</PosButton><PosButton disabled={busy} onClick={()=>void run("test")}>Probar impresión</PosButton></div>
 <hr className="border-white/10"/><h2 className="font-bold">Apertura manual / prueba de cajón</h2><PosButton variant="secondary" onClick={()=>void loadCash()}>Consultar turnos autorizados</PosButton>
 <label>Turno de caja<select className="mt-2 w-full rounded-xl bg-slate-900 p-3" value={cashSession} onChange={e=>setCashSession(e.target.value)}><option value="">Selecciona un turno abierto</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
 <PosInput label="Motivo obligatorio" value={reason} onChange={e=>setReason(e.target.value)}/><PosButton disabled={busy||!reason.trim()||!cashSession||config.profile==="driver"} onClick={()=>void run("drawer")}>Solicitar apertura con registro</PosButton>
 <p role="status" className="rounded-xl border border-cyan-300/20 p-4">{message}</p><p className="text-sm text-slate-400">La cola de impresión no confirma que el cajón se abrió físicamente. No repitas una solicitud incierta sin revisar el equipo.</p>
 </div></PosCard></PosPage>;
}
