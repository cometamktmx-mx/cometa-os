// Reuse certified disposable harnesses, applying B1 only inside their disposable DB.
// No private data dump, .env reads, production calls or changes to existing suites.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const migration='supabase/migrations/20261005170000_comu_buyer_order_read_privacy_v1.sql';
const install=`sql(fs.readFileSync('${migration}','utf8'));console.log('B1 privacy migration applied ONLY to',database);`;
const checks=String.raw`
 const sensitive=[['comu_orders','shipping_snapshot'],['comu_orders','shipping_address_snapshot'],['comu_orders','idempotency_key'],['comu_order_suborders','hub_handoff_token'],['comu_order_item_snapshots','snapshot'],['comu_order_events','payload'],['comu_shipments','label_url'],['comu_shipments','provider_shipment_id'],['comu_shipments','metadata'],['comu_fulfillment_events','note'],['comu_fulfillment_events','payload'],['comu_fulfillment_incidents','note'],['comu_shipping_webhook_events','payload'],['comu_payment_intents','stripe_payment_intent_id'],['comu_payment_allocations','seller_net_amount_cents'],['comu_payment_economics','attribution_note'],['comu_refund_allocations','liability_owner']];
 for(const [table,column] of sensitive){
  assert.equal(sql("select has_column_privilege('authenticated','public."+table+"','"+column+"','SELECT')"),'f',table+'.'+column);
  denied(buyer,'select '+column+' from public.'+table,/permission denied/);
 }
 const safe=()=>JSON.parse(as(buyer,"select public.comu_buyer_order_read_b1('"+a.o+"')").split('\n').find(x=>x.startsWith('{')));
 const output=safe();assert.equal(output.orderId,a.o);assert.ok(output.suborders[0].products.length);
 for(const secret of ['PRIVATE_PHONE','PRIVATE_INTERNAL_NOTE','hub_handoff_token','label_url','provider_shipment_id','stripe_payment_intent_id','privateNote']) assert.ok(!JSON.stringify(output).includes(secret),secret);
 assert.equal(sql("select has_table_privilege('authenticated','public.comu_orders','SELECT')"),'f');
 assert.ok(as(buyer,"select id,order_number from public.comu_orders where id='"+a.o+"'").includes(a.o));
 assert.ok(!as(other,"select id from public.comu_orders where id='"+a.o+"'").includes(a.o));
 denied(other,"select public.comu_buyer_order_read_b1('"+a.o+"')",/COMU_ORDER_NOT_FOUND/);
 assert.throws(()=>sql("set role anon;select public.comu_buyer_order_read_b1('"+a.o+"')"),/permission denied/);
 sql("insert into public.comu_seller_memberships(seller_id,user_id,role,active) values('"+seller+"','"+buyer+"','OWNER',true)");
 assert.equal(safe().orderId,a.o);
 denied(buyer,'select hub_handoff_token from public.comu_order_suborders',/permission denied/);
 sql("update public.user_profiles set status='inactive' where user_id='"+buyer+"'");
 denied(buyer,"select public.comu_buyer_order_read_b1('"+a.o+"')",/COMU_BUYER_READ_DENIED/);
 assert.ok(!as(buyer,"select id from public.comu_orders where id='"+a.o+"'").includes(a.o));
 sql("update public.user_profiles set status='active' where user_id='"+buyer+"'");
 assert.equal(safe().orderId,a.o);
 assert.equal(sql("select has_column_privilege('service_role','public.comu_shipments','label_url','SELECT')"),'t');
 console.log('B1 PRIVACY PASS: sensitive direct denied; safe snapshots/address; own/cross/anonymous/dual/inactive; service access');
`;

const suites=process.argv.includes('--n1-only')?['notifications-n1']:process.argv.includes('--o1-only')?['orders-o1']:['orders-o1','notifications-n1'];
for(const suite of suites){
 let source=fs.readFileSync(`scripts/test-comu-${suite}-local.mjs`,'utf8');
 if(suite==='orders-o1'){
  source=source.replace(' const a=order();',` sql(fs.readFileSync('supabase/migrations/20261005150000_comu_notifications_v1.sql','utf8'));\n ${install}\n const a=order();`);
  source=source.replace(" if(process.argv.includes('--http'))",checks+"\n const {certifyBuyerSQL}=await import('./test-comu-buyer-orders-b1-sql.mjs');certifyBuyerSQL({sql,as,rows,order,buyer,sellerB,admin});\n if(process.argv.includes('--http'))");
  source=source.replace("import('./test-comu-orders-o1-http-local.mjs')","import('./test-comu-buyer-orders-b1-http.mjs')");
 }else{
  const needle="sql(fs.readFileSync('supabase/migrations/20261005150000_comu_notifications_v1.sql','utf8'));";
  if(!source.includes(needle))throw Error('N1 harness layout changed');
  source=source.replace(needle,needle+'\n'+install);
 }
 source=source.replace(/import\('(\.\/[^']+)'\)/g,(_,file)=>`import('${pathToFileURL(path.resolve('scripts',file)).href}')`);
 const args=['--input-type=module','-'];if(process.argv.includes('--http'))args.push('--http');
 const result=spawnSync(process.execPath,args,{input:source,encoding:'utf8',windowsHide:true,stdio:['pipe','inherit','inherit']});
 if(result.error)throw result.error;
 if(result.status!==0){process.exitCode=result.status||1;break;}
}
