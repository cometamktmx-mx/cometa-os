import Stripe from 'stripe';
import {requirePosMutationAccess} from '@/lib/pos/mutation-access';
import {requirePosOperationalAccess} from '@/lib/pos/access';
import {assertWebAdministrator} from '@/lib/pos/product-web';
import {getPosMode} from '@/lib/pos/staff-server';
import {getBrandSlugFromUrl,handlePosError,PosApiError} from '@/lib/pos/server';
import {storePaymentState,syncStorePayment} from '@/lib/pos/store-payments';
import {storeStripeRuntime,assertStoreAccount,type StorePaymentAccount} from '../../../../../../packages/own-storefront/stripe-runtime';
export const dynamic='force-dynamic';
const reply=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
async function context(request:Request,mutation=false){const c=mutation?await requirePosMutationAccess({brandSlug:getBrandSlugFromUrl(request),operation:'settings.manage'}):await requirePosOperationalAccess({brandSlug:getBrandSlugFromUrl(request),entitlement:'pos.access'});assertWebAdministrator(c);if(await getPosMode(c)!=='RETAIL')throw new PosApiError(409,'POS_WEB_RETAIL_ONLY','Disponible para Retail.');return c;}
export async function GET(request:Request){try{const c=await context(request),s=await storePaymentState(c);return reply({mode:s.runtime.mode,connected:!!s.binding?.stripe_account_id,active:s.ready,account:s.binding?.stripe_account_id??null,chargesEnabled:!!s.binding?.stripe_account_id&&s.account.charges_enabled,payoutsEnabled:!!s.binding?.stripe_account_id&&s.account.payouts_enabled,detailsSubmitted:!!s.binding?.stripe_account_id&&s.account.details_submitted,status:!s.binding?.stripe_account_id?'NOT_CONNECTED':s.ready?'ENABLED':'PENDING',onboardingSupported:true});}catch(e){return handlePosError(e);}}
export async function POST(request:Request){try{
 const c=await context(request,true),text=await request.text();if(text.length>2000)throw new PosApiError(400,'POS_VALIDATION_ERROR','Solicitud inválida.');let body:unknown;try{body=JSON.parse(text);}catch{throw new PosApiError(400,'POS_VALIDATION_ERROR','Solicitud inválida.');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw new PosApiError(400,'POS_VALIDATION_ERROR','Solicitud inválida.');const b=body as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['action','country'].includes(k))||!['create','onboard','sync','activate'].includes(String(b.action)))throw new PosApiError(400,'POS_VALIDATION_ERROR','Acción inválida.');
 const runtime=storeStripeRuntime(),stripe=new Stripe(runtime.key,{timeout:20000,maxNetworkRetries:2});
 if(b.action==='create'){
  if(typeof b.country!=='string'||!/^[A-Z]{2}$/.test(b.country))throw new PosApiError(400,'POS_VALIDATION_ERROR','Indica el país legal de la cuenta con dos letras.');
  const prepared=await c.admin.rpc('store_payment_prepare_m9',{p_brand:c.brand.slug,p_actor:c.user.userId,p_mode:runtime.mode,p_country:b.country});if(prepared.error)throw new PosApiError(409,'POS_WEB_CONFLICT','No se pudo preparar la cuenta. Revisa país y permisos.');const row=prepared.data as StorePaymentAccount;
  if(row.stripe_account_id)return reply({created:false,account:row.stripe_account_id});
  if(Date.now()-Date.parse(row.request_started_at)>23*3600000)throw new PosApiError(409,'POS_WEB_CONFLICT','La creación requiere conciliación antes de reintentar.');
  const account=await stripe.accounts.create({type:'standard',country:row.country,metadata:{store_brand_id:c.brand.id,store_mode:runtime.mode}},{idempotencyKey:'store-account:'+row.request_key});assertStoreAccount(account,c.brand.id,runtime.mode);
  const bound=await c.admin.rpc('store_payment_bind_m9',{p_brand:c.brand.slug,p_actor:c.user.userId,p_mode:runtime.mode,p_request:row.request_key,p_account:account.id});if(bound.error)throw new PosApiError(503,'POS_WEB_SAVE_FAILED','La cuenta se creó; reintenta para recuperar su vinculación sin crear otra.');return reply({created:true,account:account.id});
 }
 const state=await syncStorePayment(c);if(!state.binding?.stripe_account_id)throw new PosApiError(409,'POS_WEB_SAVE_FAILED','Primero prepara la cuenta receptora.');
 if(b.action==='activate'){
  if(!runtime.connectWebhook)throw new PosApiError(409,'POS_WEB_SAVE_FAILED','Falta configurar el webhook Connect del modo correspondiente.');
  const result=await c.admin.rpc('store_payment_activate_m9',{p_brand:c.brand.slug,p_actor:c.user.userId,p_mode:runtime.mode});if(result.error)throw new PosApiError(409,'POS_WEB_SAVE_FAILED','Completa la configuración y habilita cobros y depósitos antes de activar.');return reply({active:true,mode:runtime.mode});
 }
 if(b.action==='sync')return reply({chargesEnabled:state.account.charges_enabled,payoutsEnabled:state.account.payouts_enabled,detailsSubmitted:state.account.details_submitted});
 const origin=process.env.STOREFRONT_ADMIN_ORIGIN;let u:URL;try{u=new URL(origin??'');}catch{throw new PosApiError(503,'POS_WEB_SAVE_FAILED','Falta el origen administrativo autorizado.');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new PosApiError(503,'POS_WEB_SAVE_FAILED','Origen administrativo inválido.');
 const returnPath='/brand/'+encodeURIComponent(c.brand.slug)+'/pos/online-store';
 const link=await stripe.accountLinks.create({account:state.account.id,type:'account_onboarding',return_url:u.origin+returnPath+'?connect=return',refresh_url:u.origin+returnPath+'?connect=refresh'});
 return reply({url:link.url,expiresAt:link.expires_at});
}catch(e){return handlePosError(e);}}
