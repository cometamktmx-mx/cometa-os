import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
export async function certifyConnect({sql,fixture}){
 const {ids}=fixture,quote=v=>"'"+String(v).replaceAll("'","''")+"'",json=async q=>JSON.parse(await sql(q));
 const q=async text=>sql('set role service_role;'+text),prepare=()=>json(`set role service_role;select to_jsonb(store_payment_prepare_m9('magenta-preview','${ids.actor}','test','MX'))`);
 const before=await sql(`select jsonb_agg(to_jsonb(x) order by id) from store_orders x`),stock=await sql(`select jsonb_agg(to_jsonb(x) order by id) from pos_inventory x`);
 const [a,b]=await Promise.all([prepare(),prepare()]);assert.equal(a.request_key,b.request_key);
 const denied=async text=>{let failed=false;try{await q(text);}catch{failed=true;}assert.ok(failed);};
 await denied(`select store_payment_prepare_m9('magenta-preview','${randomUUID()}','test','MX')`);
 await denied(`select store_payment_activate_m9('magenta-preview','${ids.actor}','test')`);
 await q(`select store_payment_bind_m9('magenta-preview','${ids.actor}','test','${a.request_key}','acct_connectfixture')`);
 await q(`select store_payment_bind_m9('magenta-preview','${ids.actor}','test','${a.request_key}','acct_connectfixture')`);
 await denied(`select store_payment_bind_m9('magenta-preview','${ids.actor}','test','${a.request_key}','acct_foreign')`);
 await denied(`select store_payment_sync_m9('${ids.brand}','live','acct_connectfixture',true,true,true)`);
 await denied(`select store_payment_sync_m9('${ids.brand}','test','acct_foreign',true,true,true)`);
 await q(`select store_payment_sync_m9('${ids.brand}','test','acct_connectfixture',true,false,true)`);
 await denied(`select store_payment_activate_m9('magenta-preview','${ids.actor}','test')`);
 await q(`select store_payment_sync_m9('${ids.brand}','test','acct_connectfixture',true,true,true)`);
 await q(`select store_payment_activate_m9('magenta-preview','${ids.actor}','test')`);
 assert.equal(await sql(`select stripe_account_ref from store_checkout_configuration where brand_id='${ids.brand}'`),'acct_connectfixture');
 assert.equal(await sql('select jsonb_agg(to_jsonb(x) order by id) from store_orders x'),before);assert.equal(await sql('select jsonb_agg(to_jsonb(x) order by id) from pos_inventory x'),stock);
 for(const role of ['anon','authenticated']){let failed=false;try{await sql(`set role ${role};select * from store_payment_accounts`);}catch{failed=true;}assert.ok(failed);}
 // A new order freezes the connected destination; older paid orders retain the platform account.
 const contact={email:'connect@example.test',name:'Synthetic',phone:'2025550100',line1:'TEST',line2:'',city:'TEST',state:'TEST',postalCode:'00000',country:'MX'};
 const order=await json(`set role service_role;select to_jsonb(store_order_create_m7('magenta-preview','${'c'.repeat(64)}','${randomUUID()}',${quote(JSON.stringify([{productId:ids.product,variantId:ids.variant,quantity:1}]))},${quote(JSON.stringify(contact))},'PICKUP','STRIPE','${'e'.repeat(64)}'))`);assert.equal(order.stripe_account_ref,'acct_connectfixture');
 const {certifyWebhook}=await import('./test-store-webhook-local.mjs');await certifyWebhook({sql,quote,brandId:ids.brand,order,slug:'magenta-preview',connect:true});
 console.log('PASS M9 SQL: concurrent preparation, binding retry, foreign actor/account/mode denied, capability gates, historical destinations unchanged, connected signed webhook pays once; no provider payment.');
}
