"use client";
import {qzPrintOptions,type TerminalPrintConfig} from "./thermal";
export type PrinterStage = "authorization" | "connection" | "enumeration";
export class PrinterError extends Error {
 constructor(public stage:PrinterStage, message:string){super(message);this.name="PrinterError";}
}
function bridgeDetail(error:unknown){return typeof error==="object"&&error!==null&&"message" in error&&typeof error.message==="string"?error.message:typeof error==="string"?error:"El puente no proporcionó detalle.";}
// A separate document avoids hidden modal/layout boxes consuming paper.
// Call only after server authorization of the confirmed document.
export async function printBrowserReceipt(html:string):Promise<void>{
 const frame=document.createElement("iframe");
 frame.title="Comprobante para imprimir";
 frame.style.cssText="position:fixed;left:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
 const loaded=new Promise<void>((resolve,reject)=>{frame.onload=()=>resolve();frame.onerror=()=>reject(new Error("No se pudo preparar el comprobante."));});
 frame.srcdoc=html;document.body.appendChild(frame);
 try{await loaded;const target=frame.contentWindow;if(!target)throw new Error("No se pudo abrir el diálogo de impresión.");await target.document.fonts.ready;target.addEventListener("afterprint",()=>frame.remove(),{once:true});target.focus();target.print();}
 catch(error){frame.remove();throw error;}
}
type Job={id:string;kind:string;payload:{printer:string;width:58|80;data:unknown[]}};
type PrintResponse={ok:boolean;error?:string;unavailable?:boolean;jobs?:Job[];config?:TerminalPrintConfig|null;certificate?:string;ready?:boolean;manualTestAvailable?:boolean;signature?:string;sessions?:{id:string;register?:{name:string}}[]};
export function manualTestSelected(brand:string){return sessionStorage.getItem(`cometa:qz-manual-test:${brand}`)==="true";}
export function selectManualTest(brand:string,enabled:boolean){
 if(enabled)sessionStorage.setItem(`cometa:qz-manual-test:${brand}`,"true");
 else sessionStorage.removeItem(`cometa:qz-manual-test:${brand}`);
}
let connectionIdentity:string|null=null;
async function connectQz(settings:PrintResponse,manual:boolean){
 const qz=(await import("qz-tray")).default;
 const certificate=manual?"":settings.certificate||"";
 // Certificate is sent at connection time; never reuse another mode's trust.
 if(qz.websocket.isActive() && connectionIdentity!==certificate)await qz.websocket.disconnect();
 qz.security.setCertificatePromise(resolve=>resolve(certificate));
 qz.security.setSignatureAlgorithm("SHA512");
 if(!qz.websocket.isActive())await qz.websocket.connect({host:"localhost",usingSecure:true});
 connectionIdentity=certificate;
 return qz;
}
export function terminalId(brand:string) {
  const key=`cometa:print-terminal:${brand}`;
  let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;
}
export async function terminalRequest(brand:string,body?:Record<string,unknown>):Promise<PrintResponse> {
  const id=terminalId(brand),url=`/api/pos/terminal-print?brandSlug=${encodeURIComponent(brand)}`;
  const response=await fetch(body?url:`${url}&terminalId=${id}`,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,terminalId:id,manualTest:manualTestSelected(brand)})}:{cache:"no-store"});
  const result=await response.json() as PrintResponse;
  if(!response.ok)throw new Error(result.error||"No se pudo comunicar con la terminal.");return result;
}
// A single queue binds the QZ signing callback to exactly one persisted job.
let queue=Promise.resolve();
const pending=new Map<string,Promise<string>>();
export function printOperation(brand:string,body:Record<string,unknown>) {
  const key=JSON.stringify([brand,body.action,body.saleId,body.cashSessionId,body.orderId,body.paymentId]);
  const current=pending.get(key);if(current)return current;
  const task=queue.then(async()=>{
    const prepared=await terminalRequest(brand,body);
    if(prepared.unavailable)return "Cobro confirmado. Impresión y cajón automáticos deshabilitados: falta la firma confiable de COMETA.";
    if(!prepared.jobs?.length)return "Sin nuevas órdenes de impresión/cajón.";
    const failPending=async()=>{for(const job of prepared.jobs||[])await terminalRequest(brand,{action:"result",jobId:job.id,status:"failed"}).catch(()=>undefined);};
    const settings=await terminalRequest(brand);
    const manual=settings.manualTestAvailable===true && manualTestSelected(brand);
    if(!manual && (!settings.ready||!settings.certificate)){await failPending();throw new Error("Venta conservada. Falta configurar el certificado de impresión de esta instalación.");}
    let qz:Awaited<ReturnType<typeof connectQz>>;
    try{qz=await connectQz(settings,manual);}catch(error){await failPending();throw new Error(`Conexión QZ: ${bridgeDetail(error)}. Comprueba que esté abierto y permite la conexión local. No omitas advertencias TLS. No se envió el ticket ni el cajón; la venta se conserva.`);}
    let signedMessage="";
    qz.api.setSha256Type(async(message:string)=>{
      signedMessage=message;
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(message));
      return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
    });
    const failures:string[]=[];
    for(const job of prepared.jobs){
      qz.security.setSignaturePromise((digest:string)=>(resolve:(signature:string)=>void,reject:(error:unknown)=>void)=>{
        void terminalRequest(brand,{action:"sign",jobId:job.id,message:signedMessage,digest}).then(result=>{resolve(result.signature||"");}).catch(error=>reject(new Error(`Autorización/firma: ${bridgeDetail(error)}`)));
      });
      try {
        const config=qz.configs.create(job.payload.printer,qzPrintOptions(job.payload.width));
        await qz.print(config,job.payload.data);
        await terminalRequest(brand,{action:"result",jobId:job.id,status:"spooled"});
      }catch(error){
        await terminalRequest(brand,{action:"result",jobId:job.id,status:"failed"}).catch(()=>undefined);
        failures.push(job.kind==="drawer"?"Cajón: resultado incierto; no se reintentará automáticamente.":`Envío del ticket: ${bridgeDetail(error)}. Pago conservado. Revisa la cola Windows antes de reimprimir sin cobrar.`);
      }
    }
    if(failures.length)throw new Error(failures.join(" "));
    return "Órdenes aceptadas por el puente. Comprueba el ticket y el cajón físicamente.";
  });
  pending.set(key,task);
  queue=task.then(()=>{pending.delete(key);},()=>{pending.delete(key);});return task;
}

// Discovery shares the print queue to preserve each job's signing callback.
export function discoverPrinters(brand:string,onStage?:(stage:PrinterStage)=>void):Promise<string[]> {
 const task=queue.then(async()=>{
  onStage?.("authorization");
  const settings=await terminalRequest(brand);
  const manual=settings.manualTestAvailable===true && manualTestSelected(brand);
  if(!manual && (!settings.ready||!settings.certificate))throw new PrinterError("authorization","Autorización/firma: COMETA no tiene configurada la firma. Conexión QZ y enumeración no comprobadas. Puedes imprimir desde Ventas con el navegador y seleccionar la impresora de Windows; no necesitas claves.");
  const qz=(await import("qz-tray")).default;

  let message="";
  qz.api.setSha256Type(async value=>{
   message=value;
   const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
   return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  });
  qz.security.setSignaturePromise(digest=>(resolve,reject)=>{
   void terminalRequest(brand,{action:"discover-sign",message,digest}).then(r=>resolve(r.signature||"")).catch(e=>reject(new PrinterError("authorization",`Autorización/firma: ${bridgeDetail(e)}. Revisa tu sesión y permisos de configuración.`)));
  });
  onStage?.("connection");
  try {await connectQz(settings,manual);}catch(e){throw new PrinterError("connection",`Conexión QZ: ${bridgeDetail(e)}. Abre QZ Tray y permite el acceso local de este sitio. No omitas alertas TLS. Enumeración aún no realizada.`);}
  onStage?.("enumeration");
  try {
   const printers=await qz.printers.find();
   if(!Array.isArray(printers)||printers.some(p=>typeof p!=="string"))throw new Error("Respuesta de impresoras inválida.");
   if(!printers.length)throw new Error("QZ devolvió cero impresoras. Comprueba que QZ se ejecute con el usuario Windows que tiene instalada la impresora y reinicia QZ después de instalar el controlador.");
   return [...new Set(printers)].sort();
  } catch(e) {
   if(e instanceof PrinterError)throw e;
   throw new PrinterError("enumeration",`Enumeración: conexión QZ establecida, pero la consulta no se completó. ${bridgeDetail(e)}. Revisa el aviso de autorización QZ y vuelve a buscar. Puedes usar impresión por navegador.`);
  }
 });
 queue=task.then(()=>undefined,()=>undefined);
 return task;
}
