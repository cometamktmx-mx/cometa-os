import {checkoutStore,stripePayments,storeStripeRuntime} from './checkout-server';
import {assertStoreAccount} from '../../../packages/own-storefront/stripe-runtime';
import type Stripe from 'stripe';
export async function paymentWebhook(request:Request,connect=false){
 let event:Stripe.Event;let stripe:Stripe;let mode:'test'|'live';
 try{const config=storeStripeRuntime();mode=config.mode;stripe=stripePayments();const secret=connect?config.connectWebhook:config.webhook,signature=request.headers.get('stripe-signature');if(!secret||!signature)throw Error();const raw=await request.text();if(raw.length>1000000)throw Error();event=stripe.webhooks.constructEvent(raw,signature,secret);if(event.livemode!==config.live||connect!==!!event.account)throw Error();}catch{return new Response('Invalid signature or mode',{status:400});}
 const types=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'];
 if(event.type!=='account.updated'&&!types.includes(event.type))return Response.json({received:true});
 try{
  const {slug,db}=checkoutStore(),brand=await db.from('brands').select('id').eq('slug',slug).maybeSingle();if(brand.error||!brand.data)throw Error();
  if(event.type==='account.updated'){
   if(!connect||!event.account)throw Error();const binding=await db.from('store_payment_accounts').select('stripe_account_id').eq('brand_id',brand.data.id).eq('mode',mode).eq('stripe_account_id',event.account).maybeSingle();if(binding.error)throw Error();if(!binding.data)return Response.json({received:true});
   const account=await stripe.accounts.retrieve(event.account);assertStoreAccount(account,brand.data.id,mode);const result=await db.rpc('store_payment_sync_m9',{p_brand:brand.data.id,p_mode:mode,p_account:account.id,p_charges:account.charges_enabled,p_payouts:account.payouts_enabled,p_details:account.details_submitted});if(result.error)throw Error();return Response.json({received:true});
  }
  const session=event.data.object as Stripe.Checkout.Session;
  if(session.livemode!==(mode==='live'))throw Error();
  if(connect&&session.metadata?.store_brand_id!==brand.data.id)return Response.json({received:true});
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&session.payment_status!=='paid')return Response.json({received:true});
  const result=await db.from('store_orders').select('id,stripe_session_id,stripe_account_ref').eq('id',session.metadata?.store_order_id??'').eq('brand_id',brand.data.id).maybeSingle();
  if(result.error||!result.data||session.metadata?.store_brand_id!==brand.data.id||session.client_reference_id!==result.data.id||session.id!==result.data.stripe_session_id)throw Error();
  const sourceAccount=connect?event.account:(await stripe.accounts.retrieveCurrent()).id;if(result.data.stripe_account_ref!==sourceAccount)throw Error();
  const action=event.type==='checkout.session.expired'?'EXPIRED':event.type==='checkout.session.async_payment_failed'?'FAILED':'PAID';
  const applied=await db.rpc('store_order_resolve_m6',{p_order:result.data.id,p_action:action,p_event:event.id,p_session:session.id,p_intent:typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id??null,p_amount:session.amount_total,p_currency:session.currency});if(applied.error)throw Error();return Response.json({received:true});
 }catch{return new Response('Retry required',{status:503});}
}
