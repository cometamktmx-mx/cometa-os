// Server-only callers. Live mode requires explicit release gates; Preview can never use it.
export function storeStripeRuntime(env:Record<string,string|undefined>=process.env){
 const mode=env.STOREFRONT_PAYMENTS_MODE??'test';
 if(!['test','live'].includes(mode))throw Error('STORE_PAYMENT_MODE_INVALID');
 const live=mode==='live';
 if(live&&(env.VERCEL_ENV!=='production'||env.STOREFRONT_LIVE_ENABLED!=='true'))throw Error('STORE_LIVE_RELEASE_NOT_APPROVED');
 const key=live?env.STOREFRONT_STRIPE_LIVE_SECRET_KEY:env.STOREFRONT_STRIPE_TEST_SECRET_KEY;
 if(!key?.startsWith(live?'sk_live_':'sk_test_'))throw Error('STORE_PAYMENT_KEY_MODE_MISMATCH');
 return {mode:live?'live' as const:'test' as const,live,key,webhook:live?env.STOREFRONT_STRIPE_LIVE_WEBHOOK_SECRET:env.STOREFRONT_STRIPE_TEST_WEBHOOK_SECRET,connectWebhook:live?env.STOREFRONT_STRIPE_LIVE_CONNECT_WEBHOOK_SECRET:env.STOREFRONT_STRIPE_TEST_CONNECT_WEBHOOK_SECRET};
}
export type StorePaymentAccount={brand_id:string;mode:'test'|'live';country:string;stripe_account_id:string|null;request_key:string;request_started_at:string;charges_enabled:boolean;payouts_enabled:boolean;details_submitted:boolean;active:boolean};
export function assertStoreAccount(account:{id:string;metadata?:Record<string,string>|null},brandId:string,mode:string){if(account.metadata?.store_brand_id!==brandId||account.metadata?.store_mode!==mode)throw Error('STORE_CONNECT_ACCOUNT_MISMATCH');}
