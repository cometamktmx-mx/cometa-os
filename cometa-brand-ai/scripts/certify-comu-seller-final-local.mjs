import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import vm from 'node:vm';
import Stripe from 'stripe';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const env=parseEnv(fs.readFileSync('.env.local','utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
assert.notEqual(process.env.NODE_ENV,'production');assert.ok(!process.env.VERCEL);
const origin='http://localhost:3000',supabase='http://127.0.0.1:54321';
const localFetch=(input,options={})=>{const u=new URL(typeof input==='string'?input:input.url);assert.equal(u.origin,supabase);return fetch(input,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});};
const admin=createClient(supabase,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}});
let source=fs.readFileSync('scripts/test-comu-seller-approval-postgres-local.mjs','utf8');source=source.slice(source.indexOf('const wire ='),source.indexOf('const db ='));
const scope={fs,net,crypto,vm,Buffer,console,process:{env:{}}};vm.runInNewContext(source+'\nthis.Pg=context.PgWire;',scope);
const db=await new scope.Pg().connect();
const stateFile='.env.comu-certification-fixture.json';
const mode=process.argv[2]||'--inspect';
let fixture=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{tag:'comu-local-cert-'+Date.now(),users:{},results:[]};
const persist=()=>fs.writeFileSync(stateFile,JSON.stringify(fixture,null,2));
async function session(label){
 const u=fixture.users[label];const jar=new Map();
 const client=createServerClient(supabase,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{global:{fetch:localFetch},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(c=>jar.set(c.name,c.value))}});
 const login=await client.auth.signInWithPassword({email:u.email,password:u.password});assert.equal(login.error,null);assert.equal(login.data.user.id,u.id);
 return {client,async http(path,method='GET',body){
   const response=await fetch(origin+path,{method,headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(60000)});
   for(const raw of response.headers.getSetCookie()){const kv=raw.split(';')[0];const i=kv.indexOf('=');jar.set(kv.slice(0,i),kv.slice(i+1));}
   const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={html:text.slice(0,250)};}
   return {status:response.status,data,location:response.headers.get('location'),accessDenied:/COMU_SELLER_ACCESS_DENIED|No tienes acceso/.test(text),notFound:text.includes('NEXT_HTTP_ERROR_FALLBACK;404')};
 }};
}
async function ok(result,name){assert.ok(result.status>=200&&result.status<300,name+': '+JSON.stringify(result));return result.data;}
try {
 assert.match(env.COMU_STRIPE_SECRET_KEY,/^sk_test_/);
 const stripe=new Stripe(env.COMU_STRIPE_SECRET_KEY,{timeout:20000,maxNetworkRetries:1});
 const A=await session('a'),D=await session('admin');
 const sid=fixture.users.a.sellerId;
 const saved=await admin.from('comu_seller_payment_accounts').select('stripe_account_id,onboarding_status').eq('seller_id',sid).single();assert.equal(saved.error,null);assert.ok(saved.data.stripe_account_id);
 const account=await stripe.accounts.retrieve(saved.data.stripe_account_id);
 assert.equal(account.metadata.comu_seller_id,sid);assert.equal(account.metadata.comu_mode,'test');
 const evidence={details_submitted:account.details_submitted,charges_enabled:account.charges_enabled,payouts_enabled:account.payouts_enabled,capabilities:account.capabilities,currently_due:account.requirements?.currently_due,past_due:account.requirements?.past_due,pending_verification:account.requirements?.pending_verification,disabled_reason:account.requirements?.disabled_reason};
 console.log('STRIPE TEST EXISTING ACCOUNT',JSON.stringify(evidence));
 const sync=await ok(await A.http('/api/comu/seller/connect/status'),'Connect refresh');console.log('COMU SYNC',JSON.stringify(sync));
 const persisted=await admin.from('comu_seller_payment_accounts').select('onboarding_status,details_submitted,charges_enabled,payouts_enabled,transfers_enabled,requirements_due').eq('seller_id',sid).single();assert.equal(persisted.error,null);assert.deepEqual(persisted.data,sync.result);
 const eligibility=await admin.rpc('comu_seller_activation_check_v1',{p_seller_id:sid});assert.equal(eligibility.error,null);console.log('ELIGIBILITY',JSON.stringify(eligibility.data));
 fixture.final={...fixture.final,connect:evidence,sync:sync.result,eligibility:eligibility.data};persist();
 if(mode==='--inspect' && fixture.final.orderFixture?.paymentId){
  const payment=await admin.from('comu_payment_intents').select('stripe_payment_intent_id').eq('id',fixture.final.orderFixture.paymentId).single();assert.equal(payment.error,null);
  const intent=await stripe.paymentIntents.retrieve(payment.data.stripe_payment_intent_id,{expand:['latest_charge.balance_transaction']});assert.equal(intent.livemode,false);
  const charge=intent.latest_charge;const balance=typeof charge==='object'&&charge?charge.balance_transaction:null;
  fixture.final.stripeFinanceEvidence={paymentStatus:intent.status,chargePaid:typeof charge==='object'&&charge?charge.paid:null,balanceAvailable:typeof balance==='object'&&Boolean(balance),feeCents:typeof balance==='object'&&balance?balance.fee:null};persist();console.log('STRIPE FINANCE READBACK',JSON.stringify(fixture.final.stripeFinanceEvidence));
 }
 if(!eligibility.data.ok){console.log('BLOCKED: no activation or order performed');}
 else if(mode==='--activate'){
  const state=await admin.from('comu_sellers').select('status').eq('id',sid).single();assert.equal(state.error,null);assert.equal(state.data.status,'PREPARING');
  await ok(await D.http('/api/comu/sellers','PATCH',{sellerId:sid,action:'activate'}),'Admin activation');
  for(const table of ['comu_sellers','comu_storefronts']){const row=await admin.from(table).select('status').eq(table==='comu_sellers'?'id':'seller_id',sid).single();assert.equal(row.error,null);assert.equal(row.data.status,'ACTIVE');}
  assert.equal((await A.http('/api/comu/sellers','PATCH',{sellerId:sid,action:'activate'})).status,403);
  fixture.final.activation='PASS';persist();console.log('PASS Admin activation ACTIVE seller/storefront; self activation DENIED');
 }
 if(mode==='--order'){
  assert.equal(fixture.final.activation,'PASS');
  const U=await session('buyer'),B=await session('b');
  await ok(await U.http('/api/comu/buyer/experience'),'Buyer fixture');
  const unwrap=(r)=>{assert.equal(r.error,null);return r.data;};
  const buyer=unwrap(await admin.from('comu_buyers').select('id').eq('user_id',fixture.users.buyer.id).single());
  fixture.final.orderFixture ||= {key:fixture.tag+':final-order:'+crypto.randomUUID()};const run=fixture.final.orderFixture;persist();
  if(!run.addressId){const existingAddresses=unwrap(await admin.from('comu_buyer_addresses').select('id').eq('buyer_id',buyer.id));run.addressId=crypto.randomUUID();unwrap(await admin.from('comu_buyer_addresses').insert({id:run.addressId,buyer_id:buyer.id,label:'LOCAL TEST final seller certification',recipient_name:'LOCAL TEST',phone:'5550000100',line1:'LOCAL TEST 1',city:'Leon',state:'Guanajuato',postal_code:'37000',country:'MX',is_default:existingAddresses.length===0}));persist();}
  const variant=unwrap(await admin.from('comu_variant_listings').select('id,variant_id').eq('listing_id',fixture.listingId).eq('enabled',true).limit(1).single());
  const stock=unwrap(await admin.from('pos_inventory').select('id,location_id,quantity,reserved_quantity').eq('variant_id',variant.variant_id).limit(1).single());
  if(run.reservationId&&!run.httpReservation){unwrap(await admin.rpc('comu_release_inventory_reservation',{p_reservation_id:run.reservationId,p_status:'CANCELLED'}));run.cancelledFixtureReservation=run.reservationId;delete run.reservationId;persist();}
  if(!run.reservationId){
   const cart=await ok(await U.http('/api/comu/cart'),'Read fixture cart');assert.ok(cart.items.every(i=>i.listing_id===fixture.listingId),'Preserve unrelated cart');
   await ok(await U.http('/api/comu/cart','POST',{listingId:fixture.listingId,variantListingId:variant.id,quantity:1}),'Add actual cart');
   run.stockBefore=unwrap(await admin.from('pos_inventory').select('id,location_id,quantity,reserved_quantity').eq('id',stock.id).single());run.variantId=variant.variant_id;
   const reserved=await ok(await U.http('/api/comu/reservations','POST',{idempotencyKey:run.key+':http-reserve'}),'Reserve actual cart');run.reservationId=reserved.reservation.id;run.httpReservation=true;persist();
  }
  if(!run.orderId){const checkout=await ok(await U.http('/api/comu/checkout','POST',{reservationId:run.reservationId,addressId:run.addressId,idempotencyKey:run.key,shippingMode:'STANDARD'}),'Checkout LOCAL_TEST');run.orderId=checkout.order.id;persist();}
  console.log('ORDER',run.orderId);
  if(!run.paymentId){const payment=await ok(await U.http('/api/comu/payments/intents','POST',{orderId:run.orderId,idempotencyKey:run.key+':payment'}),'Payment intent');run.paymentId=payment.paymentId;persist();}
  const payment=unwrap(await admin.from('comu_payment_intents').select('stripe_payment_intent_id,status').eq('id',run.paymentId).single());
  let intent=await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);assert.equal(intent.livemode,false);
  if(intent.status!=='succeeded')intent=await stripe.paymentIntents.confirm(intent.id,{payment_method:'pm_card_visa',return_url:origin+'/comu/account'});
  assert.equal(intent.status,'succeeded');assert.equal(intent.livemode,false);
  const events=await stripe.events.list({type:'payment_intent.succeeded',limit:50});const event=events.data.find(e=>e.data.object.id===intent.id);assert.ok(event,'Real Stripe TEST success event required');assert.equal(event.livemode,false);
  // Relay the real TEST event through the existing signed local webhook contract.
  // This certifies processing/retry, not automatic Stripe delivery to localhost.
  async function relay(){const raw=JSON.stringify(event),t=Math.floor(Date.now()/1000);const sig=crypto.createHmac('sha256',env.COMU_STRIPE_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex');const r=await fetch(origin+'/api/comu/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':`t=${t},v1=${sig}`},body:raw});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;}
  console.log('WEBHOOK',JSON.stringify(await relay()));const retry=await relay();assert.equal(retry.duplicate,true);
  const orders=await ok(await A.http('/api/comu/seller/orders?sellerId='+sid),'Seller orders');const order=orders.orders.find(o=>o.order_id===run.orderId);assert.ok(order);run.suborderId=order.id;persist();
  assert.equal((await B.http('/api/comu/seller/orders?sellerId='+sid)).status,403);
  const path='/api/comu/seller/orders/'+order.id+'/fulfillment';
  assert.equal((await B.http(path,'PATCH',{sellerId:fixture.users.b.sellerId,status:'PREPARING'})).status,403);
  if(order.fulfillment_status==='PAID')await ok(await A.http(path,'PATCH',{sellerId:sid,status:'PREPARING'}),'Prepare order');
  const ready=await A.http(path,'PATCH',{sellerId:sid,status:'READY_FOR_HUB'});assert.equal(ready.status,200);console.log('READY_FOR_HUB',ready.status,ready.data.suborder?.fulfillment_status);
  const forbidden=await A.http(path,'PATCH',{sellerId:sid,status:'DELIVERED'});assert.ok(forbidden.status>=400);console.log('Forbidden seller delivery',forbidden.status);
  const finalOrder=unwrap(await admin.from('comu_order_suborders').select('status,fulfillment_status,delivered_at,guarantee_expires_at').eq('id',order.id).single());
  const after=unwrap(await admin.from('pos_inventory').select('quantity,reserved_quantity').eq('id',stock.id).single());
  const reservation=unwrap(await admin.from('comu_inventory_reservations').select('status').eq('id',run.reservationId).single());
  assert.equal(reservation.status,'COMMITTED');assert.equal(Number(after.quantity),Number(run.stockBefore.quantity)-1);assert.equal(Number(after.reserved_quantity),Number(run.stockBefore.reserved_quantity));
  const allocations=unwrap(await admin.from('comu_payment_allocations').select('id,status,gross_amount_cents,seller_net_amount_cents').eq('order_id',run.orderId));
  const allocationIds=allocations.map(x=>x.id);
  const ledger=unwrap(await admin.from('comu_seller_ledger_entries').select('entry_type,amount_cents,settlement_id').in('allocation_id',allocationIds));
  const holds=unwrap(await admin.from('comu_seller_fund_holds').select('status').in('allocation_id',allocationIds));
  run.evidence={intentStatus:intent.status,suborder:finalOrder,inventory:after,reservation,allocations,ledger,holds,webhook:'Real Stripe TEST event relayed locally; automatic delivery not certified'};persist();console.log('FINAL ORDER EVIDENCE',JSON.stringify(run.evidence));
 }
} finally {await db.close();}
