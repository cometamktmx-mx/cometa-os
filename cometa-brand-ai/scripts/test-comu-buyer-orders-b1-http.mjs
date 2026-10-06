import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
export async function certifyHTTP(f) {
 // Execute unchanged O1 harness with additional Buyer checks in its isolated server.
 let source=fs.readFileSync('scripts/test-comu-orders-o1-http-local.mjs','utf8');
 source=source.replace("'@supabase/ssr'",JSON.stringify(pathToFileURL(require.resolve('@supabase/ssr')).href));
 source=source.replace("NEXT_TELEMETRY_DISABLED:'1'","NEXT_TELEMETRY_DISABLED:'1',COMU_CATALOG_ENABLED:'true',COMU_ENABLED:'true'");
 source=source.replace(' const list=`/api/comu/seller/orders', ' await f.certifyBuyer({request,users,sql,createOrder,seller});\n const list=`/api/comu/seller/orders');
 const harness=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 await harness.certifyHTTP({...f,certifyBuyer:async({request,users,sql,createOrder,seller})=>{
  const o=createOrder();
  const bid=JSON.parse(sql(`select to_json(buyer_id) from public.comu_orders where id='${o.o}'`));
  // Relink synthetic buyer identity to the isolated Auth user; no real data.
  sql(`update public.comu_buyers set user_id='${users.buyer.id}' where id='${bid}'`);
  const endpoint=`/api/comu/orders/${o.o}`;
  let r=await request(endpoint,'buyer');assert.equal(r.status,200,JSON.stringify(r.data));assert.match(r.headers.get('cache-control'),/private.*no-store/);
  for(const secret of ['hub_handoff_token','label_url','provider_shipment_id','stripe_payment_intent_id','PRIVATE_PHONE','shipping_snapshot'])assert.ok(!JSON.stringify(r.data).includes(secret),secret);
  assert.equal(r.data.order.context.deepLink,`/comu/account/orders/${o.o}?view=detail`);
  assert.equal(r.data.order.deliveryEstimate,null);assert.deepEqual(r.data.order.availableActions,[]);
  for(const user of ['owner','other','anonymous']){r=await request(endpoint,user);assert.equal(r.status,user==='anonymous'?401:404);assert.match(r.headers.get('cache-control'),/private.*no-store/);}
  sql(`insert into public.comu_seller_memberships(seller_id,user_id,role,active) values('${seller}','${users.buyer.id}','OWNER',true)`);
  assert.equal((await request(endpoint,'buyer')).status,200);
  const unsafe=await users.buyer.auth.from('comu_order_suborders').select('hub_handoff_token');assert.ok(unsafe.error);
  let list=await request('/api/comu/orders?contract=b1&pageSize=1','buyer');assert.equal(list.status,200,JSON.stringify(list.data));assert.equal(list.data.orders.length,1);assert.ok(list.data.pagination.total>=1);assert.ok(!('shippingAddress' in list.data.orders[0]));
  for(const q of ['days=30','days=90','status=PREPARING','status=IN_TRANSIT','status=ISSUE','search=missing','page=999'])assert.equal((await request('/api/comu/orders?contract=b1&'+q,'buyer')).status,200);
  assert.equal((await request('/api/comu/orders?contract=b1&days=29','buyer')).status,400);
  assert.equal((await request(endpoint+'?suborderId='+o.s,'buyer')).data.order.context.focusSuborderId,o.s);
  assert.equal((await request(endpoint+'?suborderId=00000000-0000-4000-8000-000000000001','buyer')).status,404);
  assert.equal((await request(endpoint+'/cancel','buyer',{restock:true},'POST')).status,409);
  assert.equal((await request(endpoint+'/cancel','buyer',{},'POST')).status,409);
  assert.equal(JSON.parse(sql(`select to_json(status) from public.comu_orders where id='${o.o}'`)),'PAID');
  sql(`select set_config('request.jwt.claim.sub','${users.owner.id}',false);select public.comu_transition_suborder_fulfillment_v1('${o.s}','PREPARING','SELLER',null);
   select public.comu_n1_emit('fulfillment',id,'PREPARING',order_id,suborder_id,null,'${users.buyer.id}','BUYER',false) from public.comu_fulfillment_events where suborder_id='${o.s}' and event_type='SUBORDER_PREPARING'`);
  const nid=JSON.parse(sql(`select to_json(id) from public.comu_notifications where order_id='${o.o}' and audience='BUYER' limit 1`));
  assert.equal((await request(endpoint+'?notificationId='+nid,'buyer')).data.order.context.focusSuborderId,o.s);
  sql(`update public.comu_notifications set visibility='HIDDEN' where id='${nid}'`);
  assert.equal((await request(endpoint+'?notificationId='+nid,'buyer')).status,404);
  assert.equal((await request(endpoint+'/payment-status','buyer')).status,200);
  assert.equal((await request(endpoint+'/fulfillment','buyer')).status,200);
  assert.equal((await request('/api/comu/buyer/order-delivery?orderId='+o.o,'buyer')).status,200);
  const page=await request(`/comu/account/orders/${o.o}?view=detail`,'buyer');assert.equal(page.status,200);assert.equal(page.headers.get('location'),null);
  sql(`update public.user_profiles set status='inactive' where user_id='${users.buyer.id}'`);
  for(const url of [endpoint,endpoint+'/payment-status',endpoint+'/fulfillment','/api/comu/buyer/order-delivery?orderId='+o.o])assert.equal((await request(url,'buyer')).status,403);
  sql(`update public.user_profiles set status='active' where user_id='${users.buyer.id}'`);
  // A read by an identity with no buyer record leaves it absent.
  const before=sql(`select count(*) from public.comu_buyers where user_id='${users.other.id}'`);
  list=await request('/api/comu/orders?contract=b1','other');assert.equal(list.status,200);assert.equal(list.data.orders.length,0);
  for(const url of ['/api/comu/buyer/experience','/api/comu/buyer/addresses']) {
   const account=await request(url,'other');assert.equal(account.status,200,JSON.stringify(account.data));assert.match(account.headers.get('cache-control'),/private.*no-store/);
  }
  assert.equal(sql(`select count(*) from public.comu_buyers where user_id='${users.other.id}'`),before);
  const profile=await request('/api/comu/buyer/experience','other',{action:'profile',displayName:'Synthetic Buyer B1'},'POST');assert.equal(profile.status,200,JSON.stringify(profile.data));
  assert.equal(JSON.parse(sql(`select to_json(display_name) from public.comu_buyers where user_id='${users.other.id}'`)),'Synthetic Buyer B1');
  sql(`delete from public.comu_seller_memberships where user_id='${users.buyer.id}' and seller_id='${seller}'`);
  console.log('B1 HTTP PASS: safe own/cross/anon/dual/inactive; no upsert; list/filter/pagination; direct PostgREST denial; paid cancellation blocked; deep link; legacy endpoints');
 }});
}
