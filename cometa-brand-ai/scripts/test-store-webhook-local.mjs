import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import Stripe from 'stripe';
import {randomUUID} from 'node:crypto';
export async function certifyWebhook({sql,quote,brandId,order,slug='m1-brand',connect=false}){
 const stripe=new Stripe('sk_test_synthetic_no_network'),secret='whsec_synthetic_only';
 const json=async q=>JSON.parse(await sql(q));
 const db={from:table=>{const filters={};const chain={select:()=>chain,eq:(k,v)=>{filters[k]=v;return chain;},maybeSingle:async()=>{
  assert.ok(['brands','store_orders'].includes(table));const predicates=Object.entries(filters).map(([k,v])=>{assert.ok(['id','slug','brand_id'].includes(k));return k+'='+quote(v);});const data=await json(`select coalesce((select to_jsonb(x) from ${table} x where ${predicates.join(' and ')}),'null'::jsonb)`);return {data,error:null};}};return chain;},rpc:async(name,p)=>{assert.equal(name,'store_order_resolve_m6');try{return {data:await json(`set role service_role;select to_jsonb(store_order_resolve_m6('${p.p_order}',${quote(p.p_action)},${quote(p.p_event)},${quote(p.p_session)},${quote(p.p_intent)},${p.p_amount},${quote(p.p_currency)}))`),error:null};}catch{return {data:null,error:{message:'synthetic safe failure'}};}}};
 stripe.accounts.retrieveCurrent=async()=>({id:order.stripe_account_ref});
 const loaded={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/magenta-storefront/lib/payment-webhook.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loaded,exports:loaded.exports,Response,require:()=>({checkoutStore:()=>({slug,db}),stripePayments:()=>stripe,storeStripeRuntime:()=>({mode:'test',live:false,webhook:secret,connectWebhook:secret}),assertStoreAccount:()=>{}})});
 const session='cs_test_'+randomUUID();await sql(`set role service_role;select store_order_attach_session_m6('${order.id}','${session}')`);
 const event={id:'evt_'+randomUUID(),type:'checkout.session.completed',livemode:false,...(connect?{account:order.stripe_account_ref}:{}),data:{object:{id:session,livemode:false,payment_status:'paid',client_reference_id:order.id,metadata:{store_order_id:order.id,store_brand_id:brandId},payment_intent:'pi_'+randomUUID(),amount_total:order.total_cents,currency:'mxn'}}};
 const send=(e,signature,connected=connect)=>{const payload=JSON.stringify(e);return loaded.exports.paymentWebhook(new Request('http://local/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':signature??stripe.webhooks.generateTestHeaderString({payload,secret})},body:payload}),connected);};
 assert.equal((await send(event,'invalid')).status,400);assert.equal((await send({...event,livemode:true})).status,400);
 assert.equal((await send({...event,data:{object:{...event.data.object,amount_total:event.data.object.amount_total+1}}})).status,503);
 assert.equal((await send({...event,data:{object:{...event.data.object,metadata:{...event.data.object.metadata,store_brand_id:randomUUID()}}}})).status,connect?200:503);
 assert.equal((await send({...event,account:'acct_foreign'},undefined,true)).status,503);
 const delivered=await Promise.all([send(event),send(event)]);assert.ok(delivered.every(r=>r.status===200));
 assert.equal(await sql(`select status from store_orders where id='${order.id}'`),'PAID');assert.equal(await sql(`select count(*) from store_payment_events where event_id='${event.id}'`),'1');
 assert.equal(await sql(`select count(*) from store_order_inventory_effects where order_id='${order.id}' and effect='SALE'`),'1');
 console.log('PASS actual webhook handler + Stripe SDK signature + local PostgreSQL: forged/live/wrong amount/foreign brand rejected; concurrent duplicate event pays once. No Stripe provider/network/payment.');
}
