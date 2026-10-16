"use client";
import {qzPrintOptions,type TerminalPrintConfig} from "./thermal";
type Job={id:string;kind:string;payload:{printer:string;width:58|80;data:unknown[]}};
type PrintResponse={ok:boolean;error?:string;jobs?:Job[];config?:TerminalPrintConfig|null;certificate?:string;ready?:boolean;signature?:string;sessions?:{id:string;register?:{name:string}}[]};
export function terminalId(brand:string) {
  const key=`cometa:print-terminal:${brand}`;
  let id=localStorage.getItem(key);if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;
}
export async function terminalRequest(brand:string,body?:Record<string,unknown>):Promise<PrintResponse> {
  const id=terminalId(brand),url=`/api/pos/terminal-print?brandSlug=${encodeURIComponent(brand)}`;
  const response=await fetch(body?url:`${url}&terminalId=${id}`,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,terminalId:id})}:{cache:"no-store"});
  const result=await response.json() as PrintResponse;
  if(!response.ok)throw new Error(result.error||"No se pudo comunicar con la terminal.");return result;
}
// A single queue binds the QZ signing callback to exactly one persisted job.
let queue=Promise.resolve();
const pending=new Map<string,Promise<string>>();
export function printOperation(brand:string,body:Record<string,unknown>) {
  const key=JSON.stringify([brand,body.action,body.saleId,body.cashSessionId]);
  const current=pending.get(key);if(current)return current;
  const task=queue.then(async()=>{
    const prepared=await terminalRequest(brand,body);
    if(!prepared.jobs?.length)return "Sin nuevas órdenes de impresión/cajón.";
    const failPending=async()=>{for(const job of prepared.jobs||[])await terminalRequest(brand,{action:"result",jobId:job.id,status:"failed"}).catch(()=>undefined);};
    const settings=await terminalRequest(brand);
    if(!settings.ready||!settings.certificate){await failPending();throw new Error("Venta conservada. Falta configurar el certificado de impresión de esta instalación.");}
    const qz=(await import("qz-tray")).default;
    qz.security.setCertificatePromise((resolve:(certificate:string)=>void)=>resolve(settings.certificate||""));
    qz.security.setSignatureAlgorithm("SHA512");
    try{if(!qz.websocket.isActive())await qz.websocket.connect({host:"localhost",usingSecure:true});}catch(error){await failPending();throw error;}
    let signedMessage="";
    qz.api.setSha256Type(async(message:string)=>{
      signedMessage=message;
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(message));
      return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
    });
    const failures:string[]=[];
    for(const job of prepared.jobs){
      qz.security.setSignaturePromise((digest:string)=>(resolve:(signature:string)=>void,reject:(error:unknown)=>void)=>{
        void terminalRequest(brand,{action:"sign",jobId:job.id,message:signedMessage,digest}).then(result=>{resolve(result.signature||"");}).catch(reject);
      });
      try {
        const config=qz.configs.create(job.payload.printer,qzPrintOptions(job.payload.width));
        await qz.print(config,job.payload.data);
        await terminalRequest(brand,{action:"result",jobId:job.id,status:"spooled"});
      }catch(error){
        await terminalRequest(brand,{action:"result",jobId:job.id,status:"failed"}).catch(()=>undefined);
        failures.push(job.kind==="drawer"?"Cajón: resultado incierto; no se reintentará automáticamente.":`Ticket: ${error instanceof Error?error.message:"no se pudo enviar"}. Puedes reimprimir sin cobrar.`);
      }
    }
    if(failures.length)throw new Error(failures.join(" "));
    return "Órdenes aceptadas por el puente. Comprueba el ticket y el cajón físicamente.";
  });
  pending.set(key,task);
  queue=task.then(()=>{pending.delete(key);},()=>{pending.delete(key);});return task;
}
