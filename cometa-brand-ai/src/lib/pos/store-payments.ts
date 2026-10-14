import 'server-only';
import Stripe from 'stripe';
import {PosApiError,type PosRequestContext} from './server';
import {storeStripeRuntime,assertStoreAccount,type StorePaymentAccount} from '../../../packages/own-storefront/stripe-runtime';
export async function storePaymentState(c:PosRequestContext){
 const runtime=storeStripeRuntime(),stripe=new Stripe(runtime.key,{timeout:10000,maxNetworkRetries:1});
 const saved=await c.admin.from('store_payment_accounts').select('*').eq('brand_id',c.brand.id).eq('mode',runtime.mode).maybeSingle();
 if(saved.error)throw new PosApiError(503,'POS_WEB_LOOKUP_FAILED','No se pudo comprobar la cuenta receptora.');
 const binding=saved.data as StorePaymentAccount|null;
 const account=binding?.stripe_account_id?await stripe.accounts.retrieve(binding.stripe_account_id):await stripe.accounts.retrieveCurrent();
 if(binding?.stripe_account_id)assertStoreAccount(account,c.brand.id,runtime.mode);
 const ready=!!binding?.active&&account.charges_enabled&&account.payouts_enabled&&account.details_submitted;
 return {runtime,stripe,binding,account,ready};
}
export async function syncStorePayment(c:PosRequestContext){
 const state=await storePaymentState(c);
 if(state.binding?.stripe_account_id){const a=state.account,r=await c.admin.rpc('store_payment_sync_m9',{p_brand:c.brand.id,p_mode:state.runtime.mode,p_account:a.id,p_charges:a.charges_enabled,p_payouts:a.payouts_enabled,p_details:a.details_submitted});if(r.error)throw new PosApiError(503,'POS_WEB_SAVE_FAILED','No se pudieron actualizar las capacidades de la cuenta.');}
 return state;
}
