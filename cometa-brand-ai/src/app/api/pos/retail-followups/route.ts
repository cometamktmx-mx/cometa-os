import {requirePosOperationalAccess} from "@/lib/pos/access";
import {getPosMode,requireRetailPermission} from "@/lib/pos/staff-server";
import {getBrandSlugFromUrl,uuidValue,PosApiError,ok,handlePosError,readJsonBody} from "@/lib/pos/server";
export const dynamic="force-dynamic";
async function context(request:Request){const c=await requirePosOperationalAccess({brandSlug:getBrandSlugFromUrl(request),entitlement:"pos.sales"});if(await getPosMode(c)!=="RETAIL")throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Solo Retail.");const operator=await requireRetailPermission(c,"SELL");if(!operator)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Selecciona un operador.");return {c,operator};}
export async function GET(request:Request){try{
 const {c,operator}=await context(request),u=new URL(request.url),id=uuidValue(u.searchParams.get('order'), 'order',false),scope=c.device?.locationId||operator.locationId;
 let query=c.admin.from('pos_retail_followups').select('*,order:pos_retail_orders!inner(id,folio,location_id)').eq('brand_slug',c.brand.slug).order('due_at').limit(500);
 if(scope)query=query.eq('order.location_id',scope);if(id)query=query.eq('order_id',id);else query=query.is('completed_at',null);
 let staff=c.admin.from('pos_staff').select('id,name').eq('brand_slug',c.brand.slug).eq('active',true);if(scope)staff=staff.or(`location_id.is.null,location_id.eq.${scope}`);
 const [rows,people]=await Promise.all([query,staff]);if(rows.error||people.error)throw new PosApiError(503,"POS_WEB_LOOKUP_FAILED","No se pudieron consultar los seguimientos.");
 return ok({followups:rows.data,staff:people.data,limit:500});
}catch(e){return handlePosError(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Origen no autorizado.");
 const {c,operator}=await context(request),b=await readJsonBody<Record<string,unknown>>(request),id=uuidValue(b.order_id,'order_id');
 const order=await c.admin.from('pos_retail_orders').select('location_id').eq('id',id).eq('brand_slug',c.brand.slug).maybeSingle();
 if(order.error||!order.data)throw new PosApiError(404,"POS_NOT_FOUND","Cajita no disponible.");
 if(c.device&&c.device.locationId!==order.data.location_id||operator.locationId&&operator.locationId!==order.data.location_id)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Sucursal no autorizada.");
 if(!['create','complete'].includes(String(b.action)))throw new PosApiError(400,"POS_VALIDATION_ERROR","Acción inválida.");
 const result=await c.admin.rpc('pos_retail_followup_v1',{p_brand:c.brand.slug,p_actor:c.user.userId,p_staff:operator.staff.id,p_order:id,p_body:b,p_request:uuidValue(b.request_key,'request_key')});
 if(result.error)throw new PosApiError(409,"POS_WEB_CONFLICT","No se guardó el seguimiento. Revisa responsable, fecha y nota.");
 return ok({followup:result.data});
}catch(e){return handlePosError(e);}}
