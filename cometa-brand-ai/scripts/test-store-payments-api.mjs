// Real route, simulated authorization/Stripe transport. No network or charges.
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';
class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
let denied=0,mode='RETAIL',calls=0,links=0,bindError=false,bound=false,old=false,enabled=false,webhook='whsec_fixture',created=[];
const env={STOREFRONT_ADMIN_ORIGIN:'https://admin.example.test'},account={id:'acct_fixture',metadata:{store_brand_id:'brand',store_mode:'test'},charges_enabled:false,payouts_enabled:false,details_submitted:false};
const binding=()=>({stripe_account_id:bound?account.id:null,request_key:'stable-request',request_started_at:new Date(Date.now()-(old?86400000:0)).toISOString(),country:'MX'});
const context={brand:{id:'brand',slug:'fixture'},user:{userId:'actor'},admin:{rpc:async name=>{calls++;if(name==='store_payment_prepare_m9')return {data:binding()};if(name==='store_payment_bind_m9'){if(bindError)return {error:{message:'private'}};bound=true;return {data:{}};}if(name==='store_payment_activate_m9')return {error:enabled?null:{message:'not ready'}};throw Error(name);}}};
const guard=async args=>{if(denied)throw new ApiError(denied,'DENIED','Denied');if(args.brandSlug!=='fixture')throw new ApiError(403,'DENIED','Denied');return context;};
const state=async()=>({runtime:{mode:'test'},binding:binding(),account,ready:enabled});
const deps={
 'stripe':class{accounts={create:async(payload,options)=>{created.push({payload,options});return account;}};accountLinks={create:async payload=>{links++;assert.equal(payload.return_url,'https://admin.example.test/brand/fixture/pos/online-store?connect=return');return {url:'https://connect.stripe.com/fixture',expires_at:1};}};},
 '@/lib/pos/mutation-access':{requirePosMutationAccess:async args=>{assert.equal(args.operation,'settings.manage');return guard(args);}},
 '@/lib/pos/access':{requirePosOperationalAccess:guard},'@/lib/pos/product-web':{assertWebAdministrator:()=>{}},'@/lib/pos/staff-server':{getPosMode:async()=>mode},
 '@/lib/pos/server':{PosApiError:ApiError,getBrandSlugFromUrl:r=>new URL(r.url).searchParams.get('brandSlug'),handlePosError:e=>Response.json({error:e.message},{status:e.status??500})},
 '@/lib/pos/store-payments':{storePaymentState:state,syncStorePayment:state},
 '../../../../../../packages/own-storefront/stripe-runtime':{storeStripeRuntime:()=>({key:'sk_test_fixture',mode:'test',connectWebhook:webhook}),assertStoreAccount:(a,b,m)=>{assert.equal(a.metadata.store_brand_id,b);assert.equal(a.metadata.store_mode,m);}}
};
const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/pos/online-store/payments/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,Request,Response,URL,Date,process:{env},require:n=>{assert.ok(n in deps,n);return deps[n];}});
const route=module.exports,post=(body,brand='fixture')=>route.POST(new Request('https://admin.example.test/api?brandSlug='+brand,{method:'POST',body:JSON.stringify(body)}));
for(const status of [401,403]){denied=status;assert.equal((await post({action:'create',country:'MX'})).status,status);}denied=0;assert.equal((await post({action:'create',country:'MX'},'foreign')).status,403);mode='FOOD';assert.equal((await post({action:'create',country:'MX'})).status,409);mode='RETAIL';assert.equal(calls,0);
for(const b of [{action:'unknown'},{action:'create',country:'mx'},{action:'create',country:'MX',return_url:'https://evil.test'}])assert.equal((await post(b)).status,400);
old=true;assert.equal((await post({action:'create',country:'MX'})).status,409);assert.equal(created.length,0);old=false;
bindError=true;assert.equal((await post({action:'create',country:'MX'})).status,503);bindError=false;assert.equal((await post({action:'create',country:'MX'})).status,200);assert.equal(created.length,2);assert.deepEqual(created[0],created[1]);assert.equal(created[0].options.idempotencyKey,'store-account:stable-request');
assert.equal((await post({action:'create',country:'MX'})).status,200);assert.equal(created.length,2);
assert.equal((await post({action:'activate'})).status,409);enabled=true;webhook='';assert.equal((await post({action:'activate'})).status,409);webhook='whsec_fixture';assert.equal((await post({action:'activate'})).status,200);
env.STOREFRONT_ADMIN_ORIGIN='http://evil.test';assert.equal((await post({action:'onboard'})).status,503);assert.equal(links,0);env.STOREFRONT_ADMIN_ORIGIN='https://admin.example.test';assert.equal((await post({action:'onboard'})).status,200);assert.equal(links,1);
console.log('PASS payments API: auth, brand, Retail, invalid payload, retry identity, expired reconciliation, account reuse, capability/webhook gates, server-owned HTTPS return. Transport simulated.');
