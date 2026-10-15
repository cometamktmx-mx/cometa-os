import {checkoutStore,stripePayments,storeStripeRuntime} from './checkout-server';
import {assertStoreAccount} from '../../../packages/own-storefront/stripe-runtime';

export async function paymentAvailability(brandId:string){
 const mode=process.env.STOREFRONT_PAYMENTS_MODE==='live'?'live':'test';
 try{
  const runtime=storeStripeRuntime();
  if(!runtime.connectWebhook)throw Error();
  const {db}=checkoutStore(),binding=await db.from('store_payment_accounts').select('stripe_account_id,active').eq('brand_id',brandId).eq('mode',runtime.mode).maybeSingle();
  if(binding.error||!binding.data?.active||!binding.data.stripe_account_id)throw Error();
  const account=await stripePayments().accounts.retrieve(binding.data.stripe_account_id);
  assertStoreAccount(account,brandId,runtime.mode);
  if(!account.charges_enabled||!account.payouts_enabled||!account.details_submitted)throw Error();
  return {mode,ready:true,message:''};
 }catch{return {mode,ready:false,message:'El pago con tarjeta no está disponible hasta que la tienda habilite su cuenta receptora.'};}
}
