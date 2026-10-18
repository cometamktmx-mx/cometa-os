import {requirePosOperationalAccess} from "@/lib/pos/access";
import {getPosMode,requireRetailPermission} from "@/lib/pos/staff-server";
import {requirePosPermission} from "@/lib/pos/rbac";
import {getBrandSlugFromUrl,uuidValue,PosApiError,ok,handlePosError,readJsonBody} from "@/lib/pos/server";
export const dynamic="force-dynamic";
export const runtime="nodejs";
async function context(request:Request){
 const c=await requirePosOperationalAccess({brandSlug:getBrandSlugFromUrl(request),entitlement:"pos.reports"});
 if(await getPosMode(c)!=="RETAIL")throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Disponible únicamente en Retail.");
 if(!c.user.isAdmin)requirePosPermission(c,"pos.reports.view");
 const operator=await requireRetailPermission(c,"REPORTS");
 if(!operator)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Selecciona un operador autorizado.");
 return {c,operator};
}
export async function GET(request:Request){try{
 const {c,operator}=await context(request),u=new URL(request.url);
 if(u.searchParams.get('meta')==='1'){
  const scope=c.device?.locationId||operator.locationId;
  let l=c.admin.from('pos_locations').select('id,name,timezone,currency').eq('brand_slug',c.brand.slug),s=c.admin.from('pos_staff').select('id,name').eq('brand_slug',c.brand.slug),r=c.admin.from('pos_registers').select('id,name').eq('brand_slug',c.brand.slug);
  if(scope){l=l.eq('id',scope);s=s.or(`location_id.is.null,location_id.eq.${scope}`);r=r.eq('location_id',scope);}
  let sessions=c.admin.from('pos_cash_sessions').select('id,register_id,opened_at,status').eq('brand_slug',c.brand.slug).eq('status','open');if(scope)sessions=sessions.eq('location_id',scope);
  const [locations,staff,registers,openSessions]=await Promise.all([l,s,r,sessions]);if(locations.error||staff.error||registers.error||openSessions.error)throw new PosApiError(503,'POS_WEB_LOOKUP_FAILED','No se pudieron cargar los filtros.');
  return ok({locations:locations.data,staff:staff.data,registers:registers.data,openSessions:openSessions.data});
 }
 const from=u.searchParams.get("from"),to=u.searchParams.get("to");
 if(!from||!to||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))throw new PosApiError(400,"POS_VALIDATION_ERROR","Selecciona un periodo válido.");
 const location=uuidValue(u.searchParams.get("location"),"location",false),scope=c.device?.locationId||operator.locationId;
 if(scope&&location&&scope!==location)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Sucursal no autorizada.");
 const method=u.searchParams.get("method")||null;
 if(method&&!['cash','card','transfer','wallet','other'].includes(method))throw new PosApiError(400,"POS_VALIDATION_ERROR","Método inválido.");
 const r=await c.admin.rpc("pos_retail_report_v1",{p_brand:c.brand.slug,p_from:from,p_to:to,p_location:scope||location,p_staff:uuidValue(u.searchParams.get("staff"),"staff",false),p_register:uuidValue(u.searchParams.get("register"),"register",false),p_session:uuidValue(u.searchParams.get("session"),"session",false),p_method:method});
 if(r.error)throw new PosApiError(409,"POS_WEB_CONFLICT",r.error.message.includes("TIMEZONE")?"Selecciona una sucursal: existen distintas zonas horarias.":r.error.message.includes("RANGE")?"Reduce o revisa el periodo solicitado.":"No se pudo consultar el reporte. No se muestran totales parciales.");
 return ok({data:r.data});
}catch(e){return handlePosError(e);}}
export async function POST(request:Request){try{
 if(request.headers.get("origin")!==new URL(request.url).origin)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Origen no autorizado.");
 const {c,operator}=await context(request);await requireRetailPermission(c,"CASH");
 const b=await readJsonBody<Record<string,unknown>>(request);
 if(b.action==='reverse'){
  await requireRetailPermission(c,'SETTINGS');
  const id=uuidValue(b.movement_id,'movement_id'),target=uuidValue(b.target_session,'target_session');
  const row=await c.admin.from('pos_retail_money_v1').select('location_id').eq('brand_slug',c.brand.slug).eq('source','movement').eq('id',id).maybeSingle();
  if(row.error||!row.data)throw new PosApiError(404,'POS_NOT_FOUND','Movimiento no disponible.');
  if(c.device&&c.device.locationId!==row.data.location_id||operator.locationId&&operator.locationId!==row.data.location_id)throw new PosApiError(403,'POS_PERMISSION_REQUIRED','Sucursal no autorizada.');
  if(typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>500)throw new PosApiError(400,'POS_VALIDATION_ERROR','Indica el motivo del reverso.');
  const result=await c.admin.rpc('pos_retail_reverse_cash_v1',{p_brand:c.brand.slug,p_actor:c.user.userId,p_staff_session:operator.id,p_movement:id,p_target_session:target,p_reason:b.reason.trim(),p_request:uuidValue(b.request_key,'request_key')});
  if(result.error)throw new PosApiError(409,'POS_WEB_CONFLICT','No se pudo revertir. Revisa si ya fue corregido y selecciona un turno abierto de la misma caja física.');
  return ok({movement:result.data});
 }
 if(!['sale','order'].includes(String(b.source))||typeof b.verified!=="boolean"||typeof b.reference!=="string"||!b.reference.trim()||b.reference.length>200||typeof b.reason!=="string"||b.reason.trim().length<3||b.reason.length>1000)throw new PosApiError(400,"POS_VALIDATION_ERROR","Indica referencia y motivo de la verificación manual.");
 const payment=uuidValue(b.payment_id,"payment_id");
 const source=await c.admin.from("pos_retail_money_v1").select("location_id").eq("brand_slug",c.brand.slug).eq("source",b.source).eq("id",payment).maybeSingle();
 if(source.error||!source.data)throw new PosApiError(404,"POS_NOT_FOUND","Movimiento no disponible.");
 if(c.device&&c.device.locationId!==source.data.location_id||operator.locationId&&operator.locationId!==source.data.location_id)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Sucursal no autorizada.");
 const r=await c.admin.rpc("pos_retail_verify_transfer_v1",{p_brand:c.brand.slug,p_actor:c.user.userId,p_staff:operator.staff.id,p_source:b.source,p_payment:payment,p_verified:b.verified,p_reference:b.reference.trim(),p_reason:b.reason.trim(),p_request:uuidValue(b.request_key,"request_key")});
 if(r.error)throw new PosApiError(409,"POS_WEB_CONFLICT","No se pudo registrar la verificación. Consulta el movimiento antes de reintentar.");
 return ok({verification:r.data});
}catch(e){return handlePosError(e);}}
