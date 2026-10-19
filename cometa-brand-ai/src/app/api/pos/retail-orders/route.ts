import {requirePosOperationalAccess} from "@/lib/pos/access";
import {requireRetailPermission,getPosMode} from "@/lib/pos/staff-server";
import {requirePosPermission} from "@/lib/pos/rbac";
import {getBrandSlugFromUrl,uuidValue,readJsonBody,PosApiError,ok,handlePosError} from "@/lib/pos/server";
import {retailOrderReceipt,type RetailOrder,type RetailPayment} from "@/lib/pos/retail-orders";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function context(request:Request){
 const c=await requirePosOperationalAccess({brandSlug:getBrandSlugFromUrl(request),entitlement:"pos.sales"});
 if(await getPosMode(c)!=="RETAIL")throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Disponible únicamente para comercio.");
 return c;
}
const errors:Record<string,string>={POS_BALANCE_RESOLUTION_REQUIRED:"Hay saldo disponible. Un administrador debe confirmar su registro pendiente de resolución antes del cierre.",POS_RETAIL_REQUIRED:"Operación exclusiva de Retail.",POS_LOCATION_INVALID:"Sucursal no disponible.",POS_ITEMS_INVALID:"Agrega entre 1 y 250 variantes.",POS_DUPLICATE_VARIANT:"Combina las cantidades de cada variante en una sola fila.",POS_QUANTITY_OR_DISCOUNT_INVALID:"Revisa cantidades y descuentos.",POS_WHOLE_PIECES_REQUIRED:"Las prendas requieren cantidades enteras de piezas.",POS_PRODUCT_UNAVAILABLE:"Un producto ya no está disponible en este negocio.",POS_DISCOUNT_EXCEEDS_SUBTOTAL:"El descuento supera el importe del producto.",POS_ORDERS_DISABLED:"Notas y apartados no están activados para este negocio.",POS_ORDER_NOT_FOUND:"Pedido no disponible.",POS_ORDER_NOT_EDITABLE:"El estado actual ya no permite modificar este pedido.",POS_ORDER_CHANGED:"El pedido cambió. Reábrelo y revisa sus movimientos antes de continuar.",POS_CONTACT_REQUIRED:"Registra un contacto de entre 3 y 200 caracteres.",POS_CUSTOMER_INVALID:"Selecciona un cliente de este negocio.",POS_ORDER_TOTAL_INVALID:"El pedido debe tener un total positivo.",POS_INVENTORY_UNAVAILABLE:"Existencias insuficientes para reservar o convertir el pedido. No se registró el pago.",POS_CASH_SESSION_NOT_OPEN:"Selecciona un turno abierto de la misma sucursal.",POS_PAYMENT_INVALID:"Revisa el importe, método y efectivo recibido.",POS_INITIAL_DEPOSIT_INVALID:"El depósito inicial debe alcanzar el mínimo configurado. Revisa la modalidad de esta caja.",POS_USE_SETTLEMENT:"Para cubrir todo el saldo usa Liquidar saldo.",POS_BALANCE_CHANGED:"El importe no coincide con el saldo actual. Revísalo antes de confirmar.",POS_ORDER_STATE_INVALID:"El pedido ya cambió de estado. Reábrelo antes de continuar.",POS_DELIVERY_INVALID:"Solo se puede entregar una vez un pedido liquidado.",POS_IDEMPOTENCY_CONFLICT:"La solicitud ya fue utilizada. Revisa el historial del pedido.",POS_PRICE_INVALID:"Introduce un precio de fábrica positivo, con máximo dos decimales.",POS_POLICY_REQUIRED:"Describe la política que aceptará el cliente.",POS_STAFF_LOCATION_FORBIDDEN:"El operador no tiene acceso a esta sucursal."};
function dbError(error:{message:string}|null){if(error)throw new PosApiError(409,"POS_WEB_CONFLICT",errors[error.message]||"No se pudo completar la operación. No vuelvas a cobrar; consulta el pedido antes de reintentar.");}
export async function GET(request:Request){try{
 const c=await context(request);const staff=await requireRetailPermission(c,"SELL");
 const url=new URL(request.url),id=url.searchParams.get("id"),location=c.device?.locationId||staff?.locationId;
 if(!id&&url.searchParams.get("list")==="1"){
  const page=Number(url.searchParams.get("page")||1),size=25,search=(url.searchParams.get("search")||"").trim(),filter=url.searchParams.get("filter")||"all",sort=url.searchParams.get("sort")||"activity";
  if(!Number.isSafeInteger(page)||page<1||page>100000||search.length>120||!["all","notes","active","soon","expired","finished"].includes(filter)||!["activity","expiry"].includes(sort))throw new PosApiError(400,"POS_VALIDATION_ERROR","Revisa la búsqueda y los filtros.");
  const [result,rules]=await Promise.all([c.admin.rpc("pos_retail_orders_list_v1",{p_brand:c.brand.slug,p_location:location||null,p_search:search,p_filter:filter,p_sort:sort,p_page:page,p_size:size}),c.admin.from("pos_retail_rules").select("*").eq("brand_slug",c.brand.slug).maybeSingle()]);
  dbError(result.error);dbError(rules.error);
  return ok({...result.data,page,pageSize:size,rules:rules.data});
 }
 let orders=c.admin.from("pos_retail_orders").select("*").eq("brand_slug",c.brand.slug).order("created_at",{ascending:false}).limit(100);
 if(location)orders=orders.eq("location_id",location);
 if(id)orders=orders.eq("id",uuidValue(id,"id"));
 const [found,rules]=await Promise.all([orders,c.admin.from("pos_retail_rules").select("*").eq("brand_slug",c.brand.slug).maybeSingle()]);
 dbError(found.error);dbError(rules.error);
 if(id){
  const order=found.data?.[0] as RetailOrder|undefined;
  if(!order)throw new PosApiError(404,"POS_NOT_FOUND","Pedido no disponible.");
  const payments=await c.admin.from("pos_retail_order_payments").select("*").eq("brand_slug",c.brand.slug).eq("order_id",order.id).order("created_at");dbError(payments.error);
  const events=await c.admin.from("pos_retail_order_events").select("id,action,staff_id,created_at,payload,result").eq("brand_slug",c.brand.slug).eq("order_id",order.id).order("created_at");dbError(events.error);
  if(url.searchParams.get("print")==="1"){
   await requireRetailPermission(c,"REPRINT");
   const paymentId=url.searchParams.get("paymentId");const payment=paymentId?(payments.data as RetailPayment[]).find(p=>p.id===paymentId):undefined;
   if(paymentId&&!payment)throw new PosApiError(404,"POS_NOT_FOUND","Abono no disponible.");
   let snapshot=order;
   if(payment){const event=await c.admin.from("pos_retail_order_events").select("result").eq("brand_slug",c.brand.slug).eq("order_id",order.id).eq("request_key",payment.request_key).single();dbError(event.error);if(!event.data?.result?.order)throw new PosApiError(409,"POS_WEB_CONFLICT","No se encontró el comprobante original.");snapshot=event.data.result.order as RetailOrder;}
   const [identity,customer,operator]=await Promise.all([c.admin.from("pos_branding").select("display_name").eq("brand_slug",c.brand.slug).maybeSingle(),c.admin.from("pos_customers").select("first_name,last_name").eq("brand_slug",c.brand.slug).eq("id",snapshot.customer_id).maybeSingle(),payment?c.admin.from("pos_staff").select("name").eq("brand_slug",c.brand.slug).eq("id",payment.staff_id).maybeSingle():Promise.resolve({data:null,error:null})]);
   dbError(identity.error);dbError(customer.error);dbError(operator.error);
   return ok({receiptHtml:retailOrderReceipt(snapshot,identity.data?.display_name||c.brand.name,operator.data?.name||"No registrado",[customer.data?.first_name,customer.data?.last_name].filter(Boolean).join(" "),payment,true,{payments:(payments.data||[]) as RetailPayment[],showSku:url.searchParams.get("showSku")==="1",paymentHistory:url.searchParams.get("paymentHistory")==="1"})});
  }
  return ok({order,payments:payments.data,events:events.data,rules:rules.data});
 }
 const prices=await c.admin.from("pos_factory_prices").select("product_id,variant_id,price").eq("brand_slug",c.brand.slug);dbError(prices.error);
 return ok({orders:found.data,rules:rules.data,prices:prices.data});
}catch(e){return handlePosError(e);}}
export async function POST(request:Request){try{
 if(request.headers.get("origin")!==new URL(request.url).origin)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Origen no autorizado.");
 const c=await context(request),body=await readJsonBody<Record<string,unknown>>(request);
 const action=String(body.action);
 if(action==="rules"||action==="price"||action==="product-discount"){
  await requireRetailPermission(c,"SETTINGS");if(!c.user.isAdmin)requirePosPermission(c,"pos.settings.manage");
  const r=await c.admin.rpc("pos_retail_rules_save_v1",{p_brand:c.brand.slug,p_actor:c.user.userId,p_body:body});dbError(r.error);return ok({rules:r.data});
 }
 const staff=await requireRetailPermission(c,"SELL");if(!staff)throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Selecciona un operador.");
 if(!c.user.isAdmin)requirePosPermission(c,"pos.sale.create");
 const location=uuidValue(body.location_id,"location_id",false);
 if(location&&((staff.locationId&&location!==staff.locationId)||(c.device&&location!==c.device.locationId)))throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Sucursal no autorizada.");
 if(action==="quote"){
  if(!location)throw new PosApiError(400,"POS_VALIDATION_ERROR","Selecciona sucursal.");
  const r=await c.admin.rpc("pos_retail_order_quote_customer_v1",{p_brand:c.brand.slug,p_location:location,p_items:body.items,p_allow_empty:true,p_customer:uuidValue(body.customer_id,"customer_id",false)});dbError(r.error);return ok({quote:r.data});
 }
 const id=uuidValue(body.id,"id"),requestKey=uuidValue(body.request_key,"request_key");
 const found=await c.admin.from("pos_retail_orders").select("location_id,state").eq("id",id).eq("brand_slug",c.brand.slug).maybeSingle();dbError(found.error);
 if(found.data&&((c.device&&found.data.location_id!==c.device.locationId)||(staff.locationId&&found.data.location_id!==staff.locationId)))throw new PosApiError(403,"POS_PERMISSION_REQUIRED","Pedido de otra sucursal.");
 if(action==="cancel")await requireRetailPermission(c,"CANCEL");
 if(body.balance_resolution!==undefined){await requireRetailPermission(c,"SETTINGS");if(body.balance_resolution!=="pending"||typeof body.resolution_reason!=="string"||body.resolution_reason.trim().length<3)throw new PosApiError(400,"POS_VALIDATION_ERROR","Describe la resolución administrativa del saldo.");}
 // SELL explicitly authorizes building an active package; SETTINGS is not a sales permission.
 if(action==="cancel" && (typeof body.reason!=="string"||body.reason.trim().length<3))throw new PosApiError(400,"POS_VALIDATION_ERROR","Indica el motivo de cancelación.");
 if(Array.isArray(body.items)&&body.items.some(item=>typeof item==='object'&&item!==null&&'discount_amount' in item&&Number(item.discount_amount)>0))await requireRetailPermission(c,"DISCOUNT");
 const r=await c.admin.rpc("pos_retail_order_action_v1",{p_brand:c.brand.slug,p_actor:c.user.userId,p_staff:staff.staff.id,p_id:id,p_action:action,p_request:requestKey,p_body:body});dbError(r.error);
 return ok(r.data);
}catch(e){return handlePosError(e);}}
