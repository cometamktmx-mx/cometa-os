import { createHash } from "node:crypto";
import { getBrandSlugFromUrl, requirePosContext, readJsonBody, uuidValue, PosApiError, ok, handlePosError } from "@/lib/pos/server";
import { requirePosCommercialAccess } from "@/lib/pos/access";
import { requireRetailPermission } from "@/lib/pos/staff-server";
import { automaticOperations, qzReceiptData, drawerCommand, thermalReceipt, samePrintOptions, type TerminalPrintConfig, type ThermalSale } from "@/lib/pos/thermal";
import {retailOrderReceipt,type RetailOrder,type RetailPayment} from "@/lib/pos/retail-orders";

import {qzSigningMaterial,signQzDigest} from "@/lib/pos/qz-signing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
// No fallback to unsigned printing outside an explicitly enabled Preview.
function manualTestAvailable(brand:string,terminal:string|null){return process.env.VERCEL_ENV==="preview" && process.env.POS_QZ_MANUAL_TEST==="true" && process.env.POS_QZ_MANUAL_BRAND===brand && process.env.POS_QZ_MANUAL_TERMINAL===terminal;}
async function context(request:Request) {
  const c=await requirePosContext(getBrandSlugFromUrl(request));
  await requirePosCommercialAccess(c,"pos.access");
  return c;
}
function config(value:unknown):TerminalPrintConfig {
  const c=value as Partial<TerminalPrintConfig>|null;
  if(!c || typeof c.printer!=="string" || !c.printer.trim() || c.printer.length>200 || /[\x00-\x1f]/.test(c.printer) || ![58,80].includes(Number(c.width)) || !["driver","escpos-pin2","escpos-pin5"].includes(String(c.profile)) || typeof c.autoPrint!=="boolean" || typeof c.autoDrawer!=="boolean") throw new PosApiError(400,"POS_VALIDATION_ERROR","Revisa la impresora, papel y perfil de comandos.");
  if(c.profile === "driver" && c.autoDrawer) throw new PosApiError(400,"POS_VALIDATION_ERROR","Confirma el modelo y perfil compatible antes de activar el cajón.");
  if(c.receiptMode!==undefined&&!["driver","epson-tm-t20ii"].includes(c.receiptMode))throw new PosApiError(400,"POS_VALIDATION_ERROR","Perfil de ticket no válido.");
  for(const key of ["showSku","paymentHistory"] as const)if(c[key]!==undefined&&typeof c[key]!=="boolean")throw new PosApiError(400,"POS_VALIDATION_ERROR","Opciones de ticket inválidas.");
  return {...c,printer:c.printer.trim()} as TerminalPrintConfig;
}
export async function GET(request:Request) {
  try {
    const c=await context(request); await requireRetailPermission(c,"PRODUCTS_READ");
    const id=uuidValue(new URL(request.url).searchParams.get("terminalId"),"terminalId");
    const result=await c.admin.from("pos_terminal_print_settings").select("config").eq("id",id).eq("brand_slug",c.brand.slug).eq("host_user_id",c.user.userId).maybeSingle();
    if(result.error) throw new PosApiError(503,"POS_SCHEMA_NOT_READY","No se pudo leer la configuración de terminal.");
    const signing=qzSigningMaterial(process.env,Date.now(),{brand:c.brand.slug,origin:new URL(request.url).origin});
    return ok({manualTestAvailable:manualTestAvailable(c.brand.slug,id),config:result.data?.config??null,certificate:signing.certificate||null,ready:signing.health.ready,signing:signing.health});
  } catch(e){return handlePosError(e);}
}
export async function POST(request:Request) {
 try {
  // Same-origin POST only. The bridge receives signed, server-generated jobs.
  if(request.headers.get("origin")!==new URL(request.url).origin) throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Origen no autorizado.");
  const c=await context(request),body=await readJsonBody<Record<string,unknown>>(request);
  const terminalId=uuidValue(body.terminalId,"terminalId") as string;
  const manualTest=body.manualTest===true && manualTestAvailable(c.brand.slug,terminalId);
  const signing=qzSigningMaterial(process.env,Date.now(),{brand:c.brand.slug,origin:new URL(request.url).origin});
  if(body.manualTest===true && !manualTest)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","La autorización manual requiere Preview y negocio/terminal expresamente habilitados.");
  if(body.action === "discover-sign") {
    await requireRetailPermission(c,"SETTINGS");
    if(!manualTest && !signing.health.ready) throw new PosApiError(503,"POS_SCHEMA_NOT_READY",signing.health.message);
    if(typeof body.message!=="string" || body.message.length>1000)throw new PosApiError(400,"POS_VALIDATION_ERROR","Consulta de impresoras inválida.");
    let message:Record<string,unknown>;
    try {message=JSON.parse(body.message);} catch {throw new PosApiError(400,"POS_VALIDATION_ERROR","Consulta de impresoras inválida.");}
    if(!message || message.call!=="printers.find" || JSON.stringify(message.params)!=="{}" || typeof message.timestamp!=="number" || Math.abs(Date.now()-message.timestamp)>30000 || Object.keys(message).some(k=>!["call","params","timestamp"].includes(k)))throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Solo se permite consultar las impresoras instaladas.");
    const digest=createHash("sha256").update(body.message).digest("hex");
    if(body.digest!==digest)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Firma de consulta inválida.");
    // Empty signature intentionally retains QZ's per-operation approval dialog.
    // All permissions, payload validation and (for printing) atomic dispatch run first.
    if(manualTest)return ok({signature:"",manualApprovalRequired:true});
    return ok({signature:signQzDigest(signing,digest)});
  }
  if(body.action === "cash") {
    const operator=await requireRetailPermission(c,"DRAWER");
    let query=c.admin.from("pos_cash_sessions").select("id,register:pos_registers(name)").eq("brand_slug",c.brand.slug).eq("status","open");
    const location=c.device?.locationId||operator?.locationId;
    if(location)query=query.eq("location_id",location);
    const sessions=await query;
    if(sessions.error)throw new PosApiError(503,"POS_WEB_LOOKUP_FAILED","No se pudieron consultar los turnos autorizados.");
    return ok({sessions:sessions.data??[]});
  }
  if(body.action === "configure") {
    await requireRetailPermission(c,"SETTINGS");
    const settings=config(body.config);
    if((settings.autoPrint||settings.autoDrawer) && !manualTest && !signing.health.ready)throw new PosApiError(400,"POS_VALIDATION_ERROR","Impresión y cajón automáticos deshabilitados: COMETA aún no dispone de firma confiable para este entorno. Puedes guardar la terminal con ambos automatismos apagados.");
    const existing=await c.admin.from("pos_terminal_print_settings").select("host_user_id,brand_slug").eq("id",terminalId).maybeSingle();
    if(existing.error || existing.data && (existing.data.brand_slug!==c.brand.slug||existing.data.host_user_id!==c.user.userId)) throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Terminal no disponible.");
    const values={id:terminalId,brand_slug:c.brand.slug,host_user_id:c.user.userId,config:settings,updated_at:new Date().toISOString()};
    const saved=existing.data ? await c.admin.from("pos_terminal_print_settings").update(values).eq("id",terminalId).eq("brand_slug",c.brand.slug).eq("host_user_id",c.user.userId) : await c.admin.from("pos_terminal_print_settings").insert(values);
    if(saved.error) throw new PosApiError(503,"POS_WEB_SAVE_FAILED","No se pudo guardar la terminal.");
    return ok({saved:true});
  }
  const found=await c.admin.from("pos_terminal_print_settings").select("config").eq("id",terminalId).eq("brand_slug",c.brand.slug).eq("host_user_id",c.user.userId).maybeSingle();
  if(found.error) throw new PosApiError(503,"POS_SCHEMA_NOT_READY","No se pudo consultar la terminal.");
  if(!found.data) {if(body.action==="automatic")return ok({jobs:[]});throw new PosApiError(400,"POS_VALIDATION_ERROR","Configura esta terminal primero.");}
  const settings=config(found.data.config);
  if(body.action === "order-reprint") {
    const operator=await requireRetailPermission(c,"REPRINT");
    if(!operator)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Selecciona un operador.");
    if(!manualTest&&!signing.health.ready)throw new PosApiError(503,"POS_SCHEMA_NOT_READY",signing.health.message);
    const orderId=uuidValue(body.orderId,"orderId"),requestKey=uuidValue(body.requestKey,"requestKey");
    const result=await c.admin.from("pos_retail_orders").select("*").eq("brand_slug",c.brand.slug).eq("id",orderId).single();
    if(result.error||!result.data)throw new PosApiError(404,"POS_NOT_FOUND","Pedido no disponible.");
    let order=result.data as RetailOrder;
    if((operator.locationId&&operator.locationId!==order.location_id)||(c.device&&c.device.locationId!==order.location_id))throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Pedido de otra sucursal.");
    let payment:RetailPayment|undefined;
    if(body.paymentId){
      const paymentId=uuidValue(body.paymentId,"paymentId");
      const paid=await c.admin.from("pos_retail_order_payments").select("*").eq("brand_slug",c.brand.slug).eq("order_id",orderId).eq("id",paymentId).single();
      if(paid.error||!paid.data)throw new PosApiError(404,"POS_NOT_FOUND","Abono no disponible.");
      payment=paid.data as RetailPayment;
      const event=await c.admin.from("pos_retail_order_events").select("result").eq("brand_slug",c.brand.slug).eq("order_id",orderId).eq("request_key",payment.request_key).single();
      if(event.error||!event.data?.result?.order)throw new PosApiError(409,"POS_WEB_CONFLICT","Comprobante original no disponible.");
      order=event.data.result.order as RetailOrder;
    }
    const identity=await c.admin.from("pos_branding").select("display_name").eq("brand_slug",c.brand.slug).maybeSingle();
    const customer=await c.admin.from("pos_customers").select("first_name,last_name").eq("brand_slug",c.brand.slug).eq("id",order.customer_id).maybeSingle();
    const original=payment?await c.admin.from("pos_staff").select("name").eq("brand_slug",c.brand.slug).eq("id",payment.staff_id).maybeSingle():null;
    if(identity.error||customer.error||original?.error)throw new PosApiError(503,"POS_WEB_LOOKUP_FAILED","No se pudo preparar el comprobante.");
    const history=payment?null:await c.admin.from("pos_retail_order_payments").select("*").eq("brand_slug",c.brand.slug).eq("order_id",orderId).order("created_at");
    if(history?.error)throw new PosApiError(503,"POS_WEB_LOOKUP_FAILED","No se pudieron consultar los abonos.");
    const html=retailOrderReceipt(order,identity.data?.display_name||c.brand.name,original?.data?.name||"No registrado",[customer.data?.first_name,customer.data?.last_name].filter(Boolean).join(" "),payment,true,{...settings,payments:(history?.data||[]) as RetailPayment[]});
    const payload={printer:settings.printer,width:settings.width,receiptMode:settings.receiptMode||"driver",data:qzReceiptData(html,settings),orderId};
    const job=await c.admin.from("pos_terminal_print_jobs").insert({brand_slug:c.brand.slug,terminal_id:terminalId,host_user_id:c.user.userId,staff_id:operator.staff.id,sale_id:null,cash_session_id:null,kind:"reprint",reason:"Copia de pedido / abono",dedupe_key:`order-reprint:${requestKey}`,payload}).select("id,payload,kind").single();
    if(job.error?.code==="23505")return ok({jobs:[]});
    if(job.error||!job.data)throw new PosApiError(503,"POS_WEB_SAVE_FAILED","No se pudo registrar la reimpresión.");
    return ok({jobs:[job.data]});
  }
  if(body.action === "order-payment"){
    const operator=await requireRetailPermission(c,"SELL");
    if(!operator)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Selecciona un operador.");
    const orderId=uuidValue(body.orderId,"orderId"),paymentId=uuidValue(body.paymentId,"paymentId");
    const paymentResult=await c.admin.from("pos_retail_order_payments").select("*").eq("id",paymentId).eq("order_id",orderId).eq("brand_slug",c.brand.slug).eq("staff_id",operator.staff.id).eq("host_user_id",c.user.userId).single();
    if(paymentResult.error||!paymentResult.data)throw new PosApiError(404,"POS_NOT_FOUND","Pago confirmado no disponible.");
    const payment=paymentResult.data as RetailPayment & {cash_session_id:string};
    if(Date.now()-Date.parse(payment.created_at)>300000)throw new PosApiError(409,"POS_WEB_CONFLICT","El abono ya no admite apertura automática. Reimprime el comprobante sin cajón.");
    const event=await c.admin.from("pos_retail_order_events").select("result").eq("order_id",orderId).eq("brand_slug",c.brand.slug).eq("request_key",payment.request_key).single();
    const order=event.data?.result?.order as RetailOrder|undefined;
    if(event.error||!order)throw new PosApiError(409,"POS_WEB_CONFLICT","No se encontró la confirmación del pago.");
    if((operator.locationId&&operator.locationId!==order.location_id)||(c.device&&c.device.locationId!==order.location_id))throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Pago de otra sucursal.");
    if(!manualTest&&!signing.health.ready)return ok({jobs:[],unavailable:true});
    const identity=await c.admin.from("pos_branding").select("display_name").eq("brand_slug",c.brand.slug).maybeSingle();
    if(identity.error)throw new PosApiError(503,"POS_WEB_LOOKUP_FAILED","No se pudo preparar el comprobante.");
    const jobs=[];
    for(const kind of automaticOperations(settings,[{payment_method:payment.method,amount:payment.amount,tendered_amount:payment.tendered,change_amount:payment.change}])){
      const data=kind==="drawer"?[{type:"raw",format:"command",flavor:"hex",data:drawerCommand(settings.profile)}]:qzReceiptData(retailOrderReceipt(order,identity.data?.display_name||c.brand.name,operator.staff.name,order.contact,payment,false,settings),settings);
      const job=await c.admin.from("pos_terminal_print_jobs").insert({brand_slug:c.brand.slug,terminal_id:terminalId,host_user_id:c.user.userId,staff_id:operator.staff.id,sale_id:null,cash_session_id:payment.cash_session_id,kind,reason:"Abono confirmado",dedupe_key:`order-payment:${payment.id}:${kind}`,payload:{printer:settings.printer,width:settings.width,receiptMode:settings.receiptMode||"driver",data,orderPaymentId:payment.id}}).select("id,payload,kind").single();
      if(job.error?.code==="23505")continue;
      if(job.error||!job.data)throw new PosApiError(503,"POS_WEB_SAVE_FAILED","Pago conservado; no se pudo registrar la impresión.");
      jobs.push(job.data);
    }
    return ok({jobs});
  }
  if(body.action === "result" || body.action === "sign") {
    const staff=await requireRetailPermission(c,"PRODUCTS_READ");
    if(!staff) throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Disponible para comercio.");
    const jobId=uuidValue(body.jobId,"jobId");
    const result=await c.admin.from("pos_terminal_print_jobs").select("*").eq("id",jobId).eq("terminal_id",terminalId).eq("brand_slug",c.brand.slug).eq("host_user_id",c.user.userId).eq("staff_id",staff.staff.id).single();
    if(result.error||!result.data)throw new PosApiError(404,"POS_NOT_FOUND","Solicitud no disponible.");
    const job=result.data;
    if(body.action === "result") {
      if(!["spooled","failed","uncertain"].includes(String(body.status)))throw new PosApiError(400,"POS_VALIDATION_ERROR","Resultado inválido.");
      if(!["requested","dispatched"].includes(job.status) || job.status==="requested" && body.status!=="failed")throw new PosApiError(409,"POS_WEB_CONFLICT","La solicitud no admite ese resultado.");
      const state=job.status==="requested"?"failed":job.kind==="drawer" && body.status!=="spooled"?"uncertain":body.status;
      const saved=await c.admin.from("pos_terminal_print_jobs").update({status:state,completed_at:new Date().toISOString()}).eq("id",job.id).eq("status",job.status);
      if(saved.error)throw new PosApiError(503,"POS_WEB_SAVE_FAILED","No se pudo registrar el resultado.");
      return ok({recorded:true,physicalConfirmation:false});
    }
    await requireRetailPermission(c,job.kind==="drawer" && !job.sale_id && !job.payload.orderPaymentId ? "DRAWER" : job.kind==="test" ? "SETTINGS" : job.kind==="reprint" ? "REPRINT" : "SELL");
    if(!manualTest && !signing.health.ready) throw new PosApiError(503,"POS_SCHEMA_NOT_READY",signing.health.message);
    if(typeof body.message!=="string" || body.message.length>250000)throw new PosApiError(400,"POS_VALIDATION_ERROR","Solicitud de impresión inválida.");
    const message=JSON.parse(body.message) as {call?:string;params?:{printer?:unknown;data?:unknown;options?:Record<string,unknown>};timestamp?:number};
    const digest=createHash("sha256").update(body.message).digest("hex");
    if(body.digest!==digest)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Firma de solicitud inválida.");
    if(message.call!=="print" || !message.params || JSON.stringify(message.params.printer)!==JSON.stringify({name:job.payload.printer}) || JSON.stringify(message.params.data)!==JSON.stringify(job.payload.data) || !message.timestamp || Math.abs(Date.now()-message.timestamp)>30000 || Date.now()-Date.parse(job.created_at)>120000) throw new PosApiError(403,"POS_PERMISSION_REQUIRED","La orden no coincide con el ticket autorizado o venció.");
    const options=message.params.options;
    if(!samePrintOptions(options,job.payload.width,job.payload.receiptMode))throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Opciones de impresión no autorizadas.");
    // Atomic one-shot dispatch. Lost responses are uncertain, never auto retried.
    const claimed=await c.admin.from("pos_terminal_print_jobs").update({status:"dispatched",dispatched_at:new Date().toISOString()}).eq("id",job.id).eq("status","requested").select("id").maybeSingle();
    if(claimed.error||!claimed.data)throw new PosApiError(409,"POS_WEB_CONFLICT","Esta orden ya fue enviada. No se repetirá automáticamente.");
    // Empty signature intentionally retains QZ's per-operation approval dialog.
    // All permissions, payload validation and (for printing) atomic dispatch run first.
    if(manualTest)return ok({signature:"",manualApprovalRequired:true});
    return ok({signature:signQzDigest(signing,digest)});
  }
  const action=String(body.action);
  if(!["automatic","reprint","test","drawer"].includes(action)) throw new PosApiError(400,"POS_VALIDATION_ERROR","Operación inválida.");
  const staff=await requireRetailPermission(c,action==="automatic"?"SELL":action==="reprint"?"REPRINT":action==="drawer"?"DRAWER":"SETTINGS");
  if(!staff) throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Disponible para comercio.");
  if(action==="automatic" && !manualTest && !signing.health.ready)return ok({jobs:[],unavailable:true});
  type ConfirmedSale=ThermalSale & {id:string;status:string;cash_session_id:string;location_id:string;cashier_staff_id:string|null;customer_id?:string|null};
  let sale: ConfirmedSale|null=null;
  let cashier=staff.staff.name;
  let customerName:string|undefined;
  if(action==="automatic"||action==="reprint") {
    const saleId=uuidValue(body.saleId,"saleId");
    const result=await c.admin.from("pos_sales").select("*,items:pos_sale_items(*),payments:pos_payments(*)").eq("id",saleId).eq("brand_slug",c.brand.slug).single();
    if(result.error||!result.data||!["completed","partially_refunded","refunded"].includes(result.data.status))throw new PosApiError(409,"POS_WEB_CONFLICT","La venta no está confirmada.");
    sale=result.data as ConfirmedSale;
    if(!sale || (staff.locationId && staff.locationId!==sale.location_id) || (c.device && c.device.locationId!==sale.location_id)) throw new PosApiError(403,"POS_PERMISSION_REQUIRED","La venta pertenece a otra sucursal.");
    if(action==="automatic" && (sale.status!=="completed" || sale.cashier_staff_id!==staff.staff.id))throw new PosApiError(403,"POS_PERMISSION_REQUIRED","No corresponde al cobro de este operador.");
    const original= sale.cashier_staff_id ? await c.admin.from("pos_staff").select("name").eq("id",sale.cashier_staff_id).eq("brand_slug",c.brand.slug).maybeSingle():null;
    if(original?.error)throw new PosApiError(503,"POS_WEB_LOOKUP_FAILED","No se pudo consultar el operador original.");
    cashier=original?.data?.name || "No registrado";
    if(sale.customer_id){const customer=await c.admin.from("pos_customers").select("first_name,last_name").eq("id",sale.customer_id).eq("brand_slug",c.brand.slug).maybeSingle();if(customer.error)throw new PosApiError(503,"POS_WEB_LOOKUP_FAILED","No se pudo consultar el cliente del ticket.");if(customer.data)customerName=[customer.data.first_name,customer.data.last_name].filter(Boolean).join(" ");}
  }
  let cashSession=sale?.cash_session_id??null;
  const reason=typeof body.reason==="string"?body.reason.trim().slice(0,300):"";
  if(action==="drawer") {
    if(!reason)throw new PosApiError(400,"POS_VALIDATION_ERROR","Indica el motivo de apertura.");
    cashSession=uuidValue(body.cashSessionId,"cashSessionId") as string;
    const cash=await c.admin.from("pos_cash_sessions").select("id,location_id,status").eq("id",cashSession).eq("brand_slug",c.brand.slug).single();
    if(cash.error||!cash.data||cash.data.status!=="open"||staff.locationId&&cash.data.location_id!==staff.locationId||c.device&&cash.data.location_id!==c.device.locationId)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Selecciona un turno abierto de tu sucursal.");
  }
  const brand=await c.admin.from("pos_branding").select("display_name").eq("brand_slug",c.brand.slug).maybeSingle();
  if(brand.error)throw new PosApiError(503,"POS_WEB_LOOKUP_FAILED","No se pudo obtener el nombre del negocio.");
  const kinds=action==="automatic"&&sale?automaticOperations(settings,sale.payments):[action as "reprint"|"drawer"|"test"];
  const key=action==="automatic"?sale?.id:uuidValue(body.requestKey,"requestKey");
  const jobs=[];
  for(const kind of kinds) {
    const testSale:ThermalSale={sale_number:"PRUEBA",sold_at:new Date().toISOString(),subtotal:100,discount_total:0,tax_total:0,total:100,currency:"MXN",items:[{product_name:"Prueba de impresión · acentos áéíóú ñ",variant_name:"Modelo de ejemplo · Color azul · Talla CH",sku:null,quantity:2,unit_price:50,line_total:100}],payments:[]};
    const data=kind==="drawer"?[{type:"raw",format:"command",flavor:"hex",data:drawerCommand(settings.profile)}]:qzReceiptData(thermalReceipt(sale||testSale,brand.data?.display_name||c.brand.slug,cashier,settings.width,{copy:kind==="reprint",test:!sale,customer:customerName,showSku:settings.showSku,paymentHistory:settings.paymentHistory}),settings);
    const payload={printer:settings.printer,width:settings.width,receiptMode:settings.receiptMode||"driver",data};
    const inserted=await c.admin.from("pos_terminal_print_jobs").insert({brand_slug:c.brand.slug,terminal_id:terminalId,host_user_id:c.user.userId,staff_id:staff.staff.id,sale_id:sale?.id??null,cash_session_id:cashSession,kind,reason:reason||null,dedupe_key:`${key}:${kind}`,payload}).select("id,payload,kind").single();
    if(inserted.error?.code==="23505")continue;
    if(inserted.error||!inserted.data)throw new PosApiError(503,"POS_WEB_SAVE_FAILED","No se pudo registrar la solicitud. La venta no se modifica.");
    jobs.push(inserted.data);
  }
  return ok({jobs});
 }catch(e){return handlePosError(e);}
}
