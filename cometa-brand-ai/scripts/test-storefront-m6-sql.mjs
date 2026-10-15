import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
export async function certify({sql,quote,ids,document}) {
 const json=async q=>JSON.parse(await sql(q)), owner='a'.repeat(64), other='b'.repeat(64);
 const audit=await json(`select jsonb_build_object('rlsTables',(select count(*) from pg_class where relname in ('store_checkout_configuration','store_shipping_quotes','store_orders','store_order_items','store_payment_events','store_order_inventory_effects') and relrowsecurity),'anonCreate',has_function_privilege('anon','store_order_create_m6(text,text,uuid,jsonb,jsonb,uuid,text)','EXECUTE'),'authenticatedResolve',has_function_privilege('authenticated','store_order_resolve_m6(uuid,text,text,text,text,bigint,text)','EXECUTE'),'serviceCreate',has_function_privilege('service_role','store_order_create_m6(text,text,uuid,jsonb,jsonb,uuid,text)','EXECUTE'))`);
 assert.deepEqual(audit,{rlsTables:6,anonCreate:false,authenticatedResolve:false,serviceCreate:true});console.log('PASS M6 installed RLS/grants',JSON.stringify(audit));
 const contact={email:'fixture@example.test',name:'Fixture',phone:'5555555555',line1:'Fixture street',line2:'',city:'Fixture',state:'Fixture',postalCode:'00000',country:'MX'};
 const requestHash=lines=>createHash('sha256').update(JSON.stringify({lines,contact})).digest('hex');
 const fresh=async()=>{
  const p=randomUUID(),v=randomUUID();const doc={...document,colors:[{...document.colors[0],variantIds:[v]}],relatedIds:[]};
  await sql(`begin;set local session_replication_role=replica;
   insert into pos_products(id,brand_id,brand_slug,name,sellable) values('${p}','${ids.brand}','m1-brand','M6 fixture',true);
   insert into pos_product_variants(id,brand_id,brand_slug,product_id,name,price,active,variant_signature) values('${v}','${ids.brand}','m1-brand','${p}','M6 variant',100,true,'m6');
   insert into pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity,reserved_quantity) values('${ids.brand}','m1-brand','${ids.location}','${v}',1,0);
   insert into pos_product_sales_channels(product_id,physical_requested,online_requested,revision,updated_by) values('${p}',true,true,1,'${ids.owner}');
   insert into pos_product_web_content(product_id,brand_id,revision,draft,published,published_revision,updated_by,published_at) values('${p}','${ids.brand}',1,${quote(JSON.stringify(doc))},${quote(JSON.stringify(doc))},1,'${ids.owner}',now());commit;`);
  return {p,v,lines:[{productId:p,variantId:v,quantity:1}]};
 };
 const f=await fresh();
 const cart=await json(`set role service_role;select store_cart_m6('m1-brand',${quote(JSON.stringify(f.lines))})`);
 assert.equal(cart.configurationReady,false);assert.equal(cart.totalCents,null);assert.equal(cart.subtotalCents,10000);
 await assert.rejects(()=>sql(`set role anon;select store_cart_m6('m1-brand',${quote(JSON.stringify(f.lines))})`),/permission denied/);
 await sql(`insert into store_checkout_configuration values('${ids.brand}','${ids.location}','RETAIL_GROSS','MXN','acct_fixture',now(),'${ids.admin}')`);
 const shipping=async(lines,who=owner)=>{const id=randomUUID();await sql(`insert into store_shipping_quotes(id,brand_id,owner_hash,request_hash,location_id,currency,amount_cents,provider,provider_reference,verified_at,expires_at) values('${id}','${ids.brand}','${who}','${requestHash(lines)}','${ids.location}','MXN',5000,'ISOLATED_FIXTURE','no real quote',now(),now()+interval '1 hour')`);return id;};
 const attempt=async(f,who=owner)=>{const key=randomUUID(),q=await shipping(f.lines,who);return {key,q,create:(lines=f.lines,as=who)=>json(`set role service_role;select to_jsonb(store_order_create_m6('m1-brand','${as}','${key}',${quote(JSON.stringify(lines))},${quote(JSON.stringify(contact))},'${q}','${requestHash(f.lines)}'))`)};};
 const stock=f=>json(`select jsonb_build_object('quantity',quantity,'reserved',reserved_quantity) from pos_inventory where variant_id='${f.v}' and location_id='${ids.location}'`);
 const resolve=(o,action,evt=randomUUID())=>json(`set role service_role;select to_jsonb(store_order_resolve_m6('${o.id}','${action}','${evt}','cs_test_${o.id}','pi_${o.id}',${o.total_cents},'mxn'))`);
 const attach=o=>sql(`set role service_role;select store_order_attach_session_m6('${o.id}','cs_test_${o.id}')`);
 const a=await attempt(f),o=await a.create();assert.equal(o.total_cents,15000);assert.deepEqual(await stock(f),{quantity:1,reserved:1});
 await assert.rejects(()=>sql(`set role service_role;select store_cart_m6('m1-brand',${quote(JSON.stringify([{...f.lines[0],productId:ids.legacy}]))})`),/STORE_PRODUCT_UNAVAILABLE/);
 assert.equal((await a.create()).id,o.id);await assert.rejects(()=>a.create(f.lines,other),/IDEMPOTENCY_CONFLICT/);await assert.rejects(()=>a.create([{...f.lines[0],quantity:2}]),/IDEMPOTENCY_CONFLICT/);
 const concurrent=await Promise.all([a.create(),a.create()]);assert.equal(concurrent[0].id,concurrent[1].id);
 await attach(o);await Promise.all([resolve(o,'PAID','evt_same'),resolve(o,'PAID','evt_same')]);assert.deepEqual(await stock(f),{quantity:0,reserved:0});await resolve(o,'EXPIRED');assert.deepEqual(await stock(f),{quantity:0,reserved:0});
 assert.equal(await sql(`select count(*) from pos_inventory_movements where reference_id in(select id from store_order_items where order_id='${o.id}')`),'1');
 // New sessions recover the durable attempt despite zero stock and a later catalog price.
 await sql(`update pos_product_variants set price=999 where id='${f.v}'`);
 const replay=await a.create();assert.equal(replay.id,o.id);assert.equal(replay.total_cents,15000);assert.equal(replay.status,'PAID');
 assert.equal(await sql(`select unit_cents from store_order_items where order_id='${o.id}'`),'10000');
 console.log('PASS M6 create/retry, zero remaining stock, duplicate paid, immutable price snapshot');
 await assert.rejects(()=>sql(`set role service_role;select store_order_create_m6('m1-other','${owner}','${a.key}',${quote(JSON.stringify(f.lines))},${quote(JSON.stringify(contact))},'${a.q}','${requestHash(f.lines)}')`),/STORE_/);
 for(const action of ['CANCELLED','FAILED','EXPIRED']){
  const f=await fresh(),a=await attempt(f),o=await a.create();await attach(o);await resolve(o,action);await resolve(o,action);assert.deepEqual(await stock(f),{quantity:1,reserved:0});
  assert.equal((await a.create()).status,action==='FAILED'?'CANCELLED':action);assert.deepEqual(await stock(f),{quantity:1,reserved:0});
  const b=await attempt(f,other),p=await b.create();await attach(p);await resolve(p,'PAID');assert.equal((await resolve(o,'PAID')).status,'PAYMENT_REVIEW');assert.deepEqual(await stock(f),{quantity:0,reserved:0});
 }
 for(let i=0;i<3;i++){
  const f=await fresh(),a=await attempt(f),o=await a.create();await attach(o);
  await Promise.all([resolve(o,'PAID'),resolve(o,'CANCELLED')]);const status=await sql(`select status from store_orders where id='${o.id}'`);assert.ok(['PAID','PAYMENT_REVIEW'].includes(status));assert.deepEqual(await stock(f),{quantity:status==='PAID'?0:1,reserved:0});
 }
 console.log('PASS M6 cancel/failed/expiry release, terminal retry, late paid after resale, payment/cancel races');
 const deadline=await fresh(),da=await attempt(deadline),d=await da.create();await attach(d);await sql(`update store_orders set expires_at=now()-interval '1 second' where id='${d.id}'`);await Promise.all([sql("set role service_role;select store_orders_expire_m6('m1-brand')"),resolve(d,'PAID')]);assert.equal(await sql(`select status from store_orders where id='${d.id}'`),'PAYMENT_REVIEW');assert.deepEqual(await stock(deadline),{quantity:1,reserved:0});
 // Actual Retail RPC, not a mock or a manual stock decrement.
 const reg=randomUUID(),cash=randomUUID();await sql(`begin;set local session_replication_role=replica;insert into pos_registers(id,brand_id,brand_slug,location_id,name,code,status) values('${reg}','${ids.brand}','m1-brand','${ids.location}','M6','M6','available');insert into pos_cash_sessions(id,brand_id,brand_slug,location_id,register_id,status,opening_amount) values('${cash}','${ids.brand}','m1-brand','${ids.location}','${reg}','open',0);commit;`);
 const race=await fresh(),ra=await attempt(race);
 const retail=()=>sql(`select pos_complete_sale_v4('m1-brand','${ids.location}','${reg}','${cash}',null,${quote(JSON.stringify([{variant_id:race.v,quantity:1,discount_amount:0}]))},'[{"method":"cash","amount":100,"tendered_amount":100}]','M6 fixture',null,null,'${randomUUID()}',null)`);
 const results=await Promise.allSettled([ra.create(),retail()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/stock|inventory|reserved/i);
 if(results[0].status==='fulfilled')await resolve(results[0].value,'CANCELLED');
 // COMU reserve against the same last unit, with actual M0 RPC.
 const co=await fresh(),ca=await attempt(co),buyer=randomUUID(),listing=randomUUID(),vl=randomUUID();await sql(`begin;set local session_replication_role=replica;insert into comu_buyers(id,user_id) values('${buyer}','${ids.owner}');insert into comu_product_listings(id,seller_id,storefront_id,product_id,public_slug,status) values('${listing}','${ids.seller}','${ids.storefront}','${co.p}','m6-${listing}','PUBLISHED');insert into comu_variant_listings(id,listing_id,variant_id) values('${vl}','${listing}','${co.v}');commit;`);
 const items=[{seller_id:ids.seller,listing_id:listing,variant_listing_id:vl,variant_id:co.v,location_id:ids.location,quantity:1}];
 const competition=await Promise.allSettled([ca.create(),json(`select to_jsonb(comu_reserve_inventory('${buyer}','fixture','${randomUUID()}',${quote(JSON.stringify(items))}))`)]);assert.equal(competition.filter(r=>r.status==='fulfilled').length,1);assert.match(competition.find(r=>r.status==='rejected').reason.message,/STOCK|inventory|reserved/i);
 if(competition[0].status==='fulfilled')await resolve(competition[0].value,'CANCELLED');
 else await sql(`select comu_release_inventory_reservation('${competition[1].value.id}')`);
 // Three independent transactions contest one new physical unit simultaneously.
 const triple=await fresh(),ta=await attempt(triple),tl=randomUUID(),tv=randomUUID();
 await sql(`begin;set local session_replication_role=replica;insert into comu_product_listings(id,seller_id,storefront_id,product_id,public_slug,status) values('${tl}','${ids.seller}','${ids.storefront}','${triple.p}','m61-${tl}','PUBLISHED');insert into comu_variant_listings(id,listing_id,variant_id) values('${tv}','${tl}','${triple.v}');commit;`);
 const three=await Promise.allSettled([ta.create(),json(`select to_jsonb(comu_reserve_inventory('${buyer}','fixture','${randomUUID()}',${quote(JSON.stringify([{...items[0],listing_id:tl,variant_listing_id:tv,variant_id:triple.v}]))}))`),sql(`select pos_complete_sale_v4('m1-brand','${ids.location}','${reg}','${cash}',null,${quote(JSON.stringify([{variant_id:triple.v,quantity:1,discount_amount:0}]))},'[{"method":"cash","amount":100,"tendered_amount":100}]','M61 fixture',null,null,'${randomUUID()}',null)`)]);
 assert.equal(three.filter(r=>r.status==='fulfilled').length,1);
 for(const r of three.filter(r=>r.status==='rejected'))assert.match(r.reason.message,/stock|inventario|inventory|reserved/i);
 if(three[0].status==='fulfilled')await resolve(three[0].value,'CANCELLED');
 if(three[1].status==='fulfilled')await sql(`select comu_release_inventory_reservation('${three[1].value.id}')`);
 // Stock in another branch is neither borrowed nor released by this order.
 const branch=randomUUID(),isolated=await fresh(),ia=await attempt(isolated);
 await sql(`insert into pos_locations(id,brand_id,brand_slug,name,code) values('${branch}','${ids.brand}','m1-brand','M61 isolated','M61');insert into pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity,reserved_quantity) values('${ids.brand}','m1-brand','${branch}','${isolated.v}',5,0)`);
 const io=await ia.create();await resolve(io,'CANCELLED');assert.deepEqual(await json(`select jsonb_build_array(quantity,reserved_quantity) from pos_inventory where location_id='${branch}' and variant_id='${isolated.v}'`),[5,0]);
 const second=await attempt(isolated),sold=await second.create();await attach(sold);await resolve(sold,'PAID');
 const noBorrow=await attempt(isolated);await assert.rejects(()=>noBorrow.create(),/STORE_STOCK_UNAVAILABLE/);
 assert.deepEqual(await json(`select jsonb_build_array(quantity,reserved_quantity) from pos_inventory where location_id='${branch}' and variant_id='${isolated.v}'`),[5,0]);
 const simultaneous=await fresh(),same=await attempt(simultaneous);
 const both=await Promise.all([same.create(),same.create()]);assert.equal(both[0].id,both[1].id);
 assert.equal(await sql(`select count(*) from store_order_inventory_effects where order_id='${both[0].id}' and effect='RESERVE'`),'1');
 await resolve(both[0],'CANCELLED');assert.deepEqual(await stock(simultaneous),{quantity:1,reserved:0});
 await assert.rejects(()=>sql('set role authenticated;select * from store_orders'),/permission denied/);
 // Deadline must be evaluated after waiting for inventory, not before the row lock.
 const waiting=await fresh(),wa=await attempt(waiting),wo=await wa.create();await attach(wo);
 await sql(`update store_orders set expires_at=clock_timestamp()+interval '6 seconds' where id='${wo.id}'`);
 const locker=sql(`begin;set local application_name='m61_inventory_lock';select id from pos_inventory where variant_id='${waiting.v}' for update;select pg_sleep(10);rollback;`);
 let locked=false;for(let i=0;i<20;i++){if(await sql("select count(*) from pg_stat_activity where application_name='m61_inventory_lock' and wait_event='PgSleep'")==='1'){locked=true;break;}}assert.ok(locked,'inventory lock acquired');
 const late=resolve(wo,'PAID');await locker;const afterWait=await late;
 assert.equal(afterWait.status,'PAYMENT_REVIEW','payment that waits past deadline must not consume inventory');assert.deepEqual(await stock(waiting),{quantity:1,reserved:0});
 const s=await fresh(),sa=await attempt(s),so=await sa.create();await attach(so);await sql(`update brand_online_store_access set status='suspended' where brand_id='${ids.brand}'`);await resolve(so,'PAID');assert.deepEqual(await stock(s),{quantity:0,reserved:0});await sql(`update brand_online_store_access set status='enabled' where brand_id='${ids.brand}'`);
 console.log('PASS M6 PostgreSQL: fail-closed config/shipping, immutable retail cents, idempotency/owner/payload, actual Retail+COMU last-unit races, duplicate payments, late paid review, cancel/expiry races, grants, suspension permits resolution. All configuration/quotes are isolated fixtures.');
 return {fresh,attempt,attach,owner,contact};
}
