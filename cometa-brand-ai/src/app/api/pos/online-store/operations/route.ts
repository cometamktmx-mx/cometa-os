import {storePaymentState} from '@/lib/pos/store-payments';
import {presentOrderItems} from '@/lib/pos/order-presentation';
import { requirePosOperationalAccess } from '@/lib/pos/access';
import { requirePosMutationAccess } from '@/lib/pos/mutation-access';
import { assertWebAdministrator } from '@/lib/pos/product-web';
import { getPosMode } from '@/lib/pos/staff-server';
import { getBrandSlugFromUrl, handlePosError, PosApiError, uuidValue } from '@/lib/pos/server';
import { emptyStoreSettings, parseStoreSettings, StoreSettingsValidationError } from '../../../../../../packages/own-storefront/operations-contract';
export const dynamic='force-dynamic';
const reply=(value:unknown)=>Response.json(value,{headers:{'Cache-Control':'private, no-store'}});
function failure(e:unknown){const r=handlePosError(e);r.headers.set('Cache-Control','private, no-store');return r;}
async function context(request:Request,mutation=false){const c=mutation?await requirePosMutationAccess({brandSlug:getBrandSlugFromUrl(request),operation:'settings.manage'}):await requirePosOperationalAccess({brandSlug:getBrandSlugFromUrl(request),entitlement:'pos.access'});assertWebAdministrator(c);if(await getPosMode(c)!=='RETAIL')throw new PosApiError(409,'POS_WEB_RETAIL_ONLY','Disponible para Retail.');return c;}
async function stripeState(c:Awaited<ReturnType<typeof context>>){try{const s=await storePaymentState(c);return {mode:s.runtime.mode,model:'CONNECTED_DIRECT',merchantConnection:s.ready?'ENABLED':s.binding?.stripe_account_id?'PENDING':'NOT_CONNECTED',onboardingSupported:true,status:s.ready&&s.runtime.connectWebhook?(s.runtime.live?'LIVE_CONFIGURED':'TEST_CONFIGURED'):'NOT_CONFIGURED',account:s.ready?s.account.id:null,chargesEnabled:!!s.binding?.stripe_account_id&&s.account.charges_enabled,payoutsEnabled:!!s.binding?.stripe_account_id&&s.account.payouts_enabled,detailsSubmitted:!!s.binding?.stripe_account_id&&s.account.details_submitted};}catch{return {status:'UNAVAILABLE',account:null};}}
const orderFields='id,status,payment_method,delivery_method,preparation_status,delivery_status,tracking,refund_required,operation_revision,currency,total_cents,subtotal_cents,shipping_cents,created_at,contact,delivery_snapshot';
export async function GET(request:Request){try{const c=await context(request),query=new URL(request.url).searchParams,view=query.get('view')??'settings';
 if(view==='orders'){
  const id=query.get('order');if(id)uuidValue(id,'order');
  let q=c.admin.from('store_orders').select(orderFields).eq('brand_id',c.brand.id);if(id)q=q.eq('id',id);
  const orders=await q.order('created_at',{ascending:false}).order('id').limit(100);if(orders.error)throw new PosApiError(503,'POS_WEB_LOOKUP_FAILED','Pedidos no disponibles. Comprueba las migraciones.');
  if(!id)return reply({orders:orders.data??[]});if(!orders.data?.length)throw new PosApiError(404,'POS_NOT_FOUND','Pedido no disponible.');
  const [items,events]=await Promise.all([c.admin.from('store_order_items').select('id,product_id,variant_id,quantity,unit_cents,snapshot').eq('order_id',id),c.admin.from('store_order_events').select('id,order_id,kind,created_at,detail').eq('brand_id',c.brand.id).eq('order_id',id).order('created_at').order('id')]);if(items.error||events.error)throw new PosApiError(503,'POS_WEB_LOOKUP_FAILED','No se pudo recuperar el detalle.');return reply({orders:orders.data,items:await presentOrderItems(c,items.data??[]),events:events.data});
 }
 if(view==='notifications'){
  const r=await c.admin.rpc(query.get('includeRead')==='1'?'store_notification_history_m8':'store_notification_list_m7',{p_brand:c.brand.slug,p_actor:c.user.userId});
  if(r.error||!r.data)throw new PosApiError(503,'POS_WEB_LOOKUP_FAILED','Avisos no disponibles.');return reply(r.data);
 }
 if(view!=='settings')throw new PosApiError(400,'POS_VALIDATION_ERROR','Consulta inválida.');
 const [settings,locations,products,members,payment]=await Promise.all([
 c.admin.from('store_settings').select('revision,document').eq('brand_id',c.brand.id).maybeSingle(),c.admin.from('pos_locations').select('id,name,currency').eq('brand_slug',c.brand.slug).eq('active',true),c.admin.from('pos_products').select('id,name').eq('brand_slug',c.brand.slug).order('name').limit(500),c.admin.from('user_brand_access').select('user_id,access_role').eq('brand_slug',c.brand.slug).eq('status','active').in('access_role',['owner','admin']),stripeState(c)]);
 if(settings.error||locations.error||products.error||members.error)throw new PosApiError(503,'POS_WEB_LOOKUP_FAILED','Configuración no disponible. Comprueba las migraciones.');
 let url:string|null=null;try{const mapping:unknown=JSON.parse(process.env.OWN_STOREFRONT_URLS??'{}');if(mapping&&typeof mapping==='object'){const v=(mapping as Record<string,unknown>)[c.brand.slug];if(typeof v==='string'){const u=new URL(v);if(u.protocol==='https:'&&!u.username&&!u.password)url=u.origin;}}}catch{/* no configured URL */}
 // Resolve only the actor and active administrators of the already-authorized brand.
 const recipients=[...new Set([c.user.userId,...(members.data??[]).map(m=>m.user_id)])];
 const profiles=await c.admin.from('user_profiles').select('user_id,email,full_name').in('user_id',recipients);
 if(profiles.error)throw new PosApiError(503,'POS_WEB_LOOKUP_FAILED','No se pudieron consultar los responsables de esta marca.');
 const recipientDetails=await Promise.all(recipients.map(async id=>{
  const profile=profiles.data?.find(p=>p.user_id===id);
  let name=typeof profile?.full_name==='string'?profile.full_name.trim():null,email=typeof profile?.email==='string'?profile.email.trim():null;
  if(!email){const result=await c.admin.auth.admin.getUserById(id);if(result.error||!result.data.user)throw new PosApiError(503,'POS_WEB_LOOKUP_FAILED','No se pudo consultar un responsable de esta marca.');email=result.data.user.email??null;const fullName:unknown=result.data.user.user_metadata?.full_name;if(!name&&typeof fullName==='string')name=fullName.trim();}
  return {id,name,email,role:members.data?.find(m=>m.user_id===id)?.access_role??'admin'};
 }));
 return reply({revision:settings.data?.revision??0,document:settings.data?.document??emptyStoreSettings(),locations:locations.data,products:products.data,recipients,recipientDetails,payment,domain:{url,status:url?'CONFIGURED_NOT_VERIFIED':'NOT_CONFIGURED'}});
 }catch(e){return failure(e);}}
export async function POST(request:Request){try{const c=await context(request,true);const raw=await request.text();if(raw.length>65000)throw new PosApiError(400,'POS_VALIDATION_ERROR','Solicitud demasiado grande.');let value:unknown;try{value=JSON.parse(raw);}catch{throw new PosApiError(400,'POS_VALIDATION_ERROR','Solicitud inválida.');}if(!value||typeof value!=='object'||Array.isArray(value))throw new PosApiError(400,'POS_VALIDATION_ERROR','Solicitud inválida.');const b=value as Record<string,unknown>;let result;
 if(b.action==='settings'){
  if(Object.keys(b).some(k=>!['action','revision','document'].includes(k))||!Number.isSafeInteger(b.revision)||Number(b.revision)<0||Number(b.revision)>=2147483647)throw new PosApiError(400,'POS_VALIDATION_ERROR','Revisión inválida.');let document;try{document=parseStoreSettings(b.document);}catch(e){const fields=e instanceof StoreSettingsValidationError?e.fields:{document:'Configuración inválida.'};console.info('STORE_SETTINGS_VALIDATION',{fields:Object.keys(fields)});throw new PosApiError(400,'POS_VALIDATION_ERROR',e instanceof Error?e.message:'Configuración inválida.',{fields});}
  const payment=document.payments.stripe?await stripeState(c):null;if(payment&&!['TEST_CONFIGURED','LIVE_CONFIGURED'].includes(payment.status))throw new PosApiError(409,'POS_WEB_SAVE_FAILED','Faltan la cuenta receptora y el webhook del modo correspondiente.');
  result=await c.admin.rpc('store_settings_save_m7',{p_brand:c.brand.slug,p_actor:c.user.userId,p_revision:b.revision,p_document:document,p_stripe_account:payment?.account??null});
 }else if(b.action==='read'){
  if(Object.keys(b).some(k=>!['action','event'].includes(k)))throw new PosApiError(400,'POS_VALIDATION_ERROR','Solicitud inválida.');result=await c.admin.rpc('store_notification_read_m7',{p_brand:c.brand.slug,p_actor:c.user.userId,p_event:uuidValue(b.event,'event')});
 }else{
  if(Object.keys(b).some(k=>!['action','order','revision','tracking'].includes(k))||!['PREPARE','READY','SHIP','DELIVER','CANCEL'].includes(String(b.action))||!Number.isSafeInteger(b.revision)||Number(b.revision)<0||typeof (b.tracking??'')!=='string'||String(b.tracking??'').length>200)throw new PosApiError(400,'POS_VALIDATION_ERROR','Acción inválida.');result=await c.admin.rpc('store_order_action_m7',{p_brand:c.brand.slug,p_actor:c.user.userId,p_order:uuidValue(b.order,'order'),p_revision:b.revision,p_action:b.action,p_tracking:b.tracking??null});
 }
 if(result.error){if(/DENIED/.test(result.error.message))throw new PosApiError(403,'POS_WEB_DENIED','No tienes permiso.');if(/CONFLICT|TRANSITION|PAYMENT_REQUIRED/.test(result.error.message))throw new PosApiError(409,'POS_WEB_CONFLICT','El pedido cambió o la transición no está permitida. Recarga para revisar pago y entrega.');throw new PosApiError(503,'POS_WEB_SAVE_FAILED','No se pudo confirmar el cambio. Recarga antes de reintentar.');}return reply({result:result.data});
 }catch(e){return failure(e);}}
