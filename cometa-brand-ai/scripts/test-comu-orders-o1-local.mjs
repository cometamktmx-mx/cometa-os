// Real disposable PostgreSQL + optional isolated Auth/PostgREST/Next HTTP. Never mutates principal DB.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
const dock=(args,input)=>execFileSync(docker,['--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],{input,encoding:'utf8',windowsHide:true,maxBuffer:80*1024*1024,stdio:['pipe','pipe','pipe']});
const containers=dock(['ps','--format','{{.Names}}']).trim().split(/\r?\n/).filter(n=>n.startsWith('supabase_db_'));assert.equal(containers.length,1);const container=containers[0];
assert.ok(JSON.parse(dock(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'].some(p=>p.HostPort==='54322'));
const database='comu_o1_'+Date.now();assert.match(database,/^comu_o1_\d+$/);
const sql=(q,db=database)=>{assert.ok(db===database||db==='postgres');return dock(['exec','-i','-u','postgres',container,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],db===database?q:`begin read only;${q};commit;`).trim();};
const rows=q=>JSON.parse(sql(`select coalesce(json_agg(q),'[]') from (${q})q`));
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const uid=randomUUID(),other=randomUUID(),buyer=randomUUID(),admin=randomUUID(),seller=randomUUID(),sellerB=randomUUID(),brand=randomUUID(),brandB=randomUUID(),bid=randomUUID(),reservation=randomUUID();
const as=(user,q)=>sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub',${quote(user)},true); ${q}; commit;`);
function denied(user,q,pattern=/COMU_.*(DENIED|UNAUTHORIZED|FORBIDDEN|CONFIRMED|INVALID|PREPARED)|permission denied/){let failure;try{as(user,q);}catch(e){failure=e.stderr?.toString()||e.message;}assert.ok(failure,'Expected denial');assert.match(failure,pattern);}
const order=(targetSeller=seller)=>{const o=randomUUID(),s=randomUUID(),payment=randomUUID();sql(`insert into public.comu_orders(id,buyer_id,reservation_id,idempotency_key,status,grand_total,currency,shipping_mode,guarantee_days,shipping_address_snapshot) values('${o}','${bid}','${reservation}','${o}','PAID',100,'MXN','STANDARD',7,'{"recipient_name":"Local recipient","phone":"PRIVATE_PHONE","line1":"PRIVATE_ADDRESS"}'); insert into public.comu_order_suborders(id,order_id,seller_id,grand_total) values('${s}','${o}','${targetSeller}',100); insert into public.comu_payment_intents(id,order_id,buyer_id,amount_cents,currency,status,idempotency_key) values('${payment}','${o}','${bid}',10000,'MXN','SUCCEEDED','${payment}');`);return {o,s,payment};};
const transition=(s,target,actor='SELLER')=>`select public.comu_transition_suborder_fulfillment_v1('${s}','${target}','${actor}',null)`;
let keep=false;
try {
 dock(['exec','-u','postgres',container,'createdb','-U','postgres','--template=template0',database]);
 console.log('ISOLATED LOCAL',database,'127.0.0.1:54322; principal read-only schema dump');
 sql('create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions; create extension vector with schema extensions; create extension pg_stat_statements with schema extensions; create extension supabase_vault;');
 const schema=dock(['exec','-u','postgres',container,'pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--schema=public','--schema=auth','--schema=storage']);
 sql('drop schema public; create schema public; alter extension vector set schema public;');
 const restoredSchema = schema.replace('CREATE SCHEMA public;', '').replace(/^ALTER DEFAULT PRIVILEGES[^;]+;$/gm, '');
 sql(restoredSchema);
 sql(fs.readFileSync('supabase/migrations/20261005120000_comu_order_contract_state_safety_v1.sql','utf8'));
 console.log('PASS O1 migration applied only to disposable database');
 sql('insert into public.comu_financial_settings(id) values(true)');
 sql("insert into public.pos_units(code,name,symbol,unit_type) values('piece','Pieza','pza','count')");
 sql(`insert into auth.users(id,email) values('${uid}','o1-owner@example.test'),('${other}','o1-other@example.test'),('${buyer}','o1-buyer@example.test'),('${admin}','o1-admin@example.test');
 insert into public.user_profiles(user_id,email,role,status) values('${uid}','o1-owner@example.test','client','active'),('${other}','o1-other@example.test','client','active'),('${buyer}','o1-buyer@example.test','client','active'),('${admin}','o1-admin@example.test','admin','active');
 insert into public.brands(id,slug,name) values('${brand}','o1-a','O1 A'),('${brandB}','o1-b','O1 B');
 alter table public.comu_sellers disable trigger comu_c1_seller_guard;
 insert into public.comu_sellers(id,brand_id,brand_slug,public_name,slug,status,verification_status,approval_origin) values('${seller}','${brand}','o1-a','O1 A','o1-a','ACTIVE','VERIFIED','LEGACY'),('${sellerB}','${brandB}','o1-b','O1 B','o1-b','ACTIVE','VERIFIED','LEGACY');
 alter table public.comu_sellers enable trigger comu_c1_seller_guard;
 insert into public.comu_seller_memberships(seller_id,user_id,role,active) values('${seller}','${uid}','OWNER',true),('${sellerB}','${other}','OWNER',true);
 insert into public.comu_buyers(id,user_id) values('${bid}','${buyer}');
 insert into public.comu_inventory_reservations(id,buyer_id,session_key,expires_at,idempotency_key,status) values('${reservation}','${bid}','o1',now()+interval '1 day','o1','COMMITTED');`);
 const a=order();
 // Financial exception records must block even when master/payment snapshots lag.
 const refund=randomUUID();sql(`insert into public.comu_refunds(id,payment_id,master_order_id,amount_cents,idempotency_key,status) values('${refund}','${a.payment}','${a.o}',100,'${refund}','REQUESTED')`);
 for(const status of ['REQUESTED','PROCESSING','SUCCEEDED']) {sql(`update public.comu_refunds set status='${status}' where id='${refund}'`);denied(uid,transition(a.s,'PREPARING'));}
 sql(`update public.comu_refunds set status='CANCELLED' where id='${refund}'`);
 const dispute=randomUUID();sql(`insert into public.comu_disputes(id,stripe_dispute_id,payment_id,amount_cents,status) values('${dispute}','LOCAL_TEST_${dispute}','${a.payment}',100,'OPEN')`);denied(uid,transition(a.s,'PREPARING'));sql(`update public.comu_disputes set status='WON' where id='${dispute}'`);
 for(const [master,payment] of [['PAYMENT_PENDING','REQUIRES_PAYMENT'],['PAYMENT_PENDING','PROCESSING'],['PAYMENT_PENDING','FAILED'],['CANCELLED','CANCELLED'],['EXPIRED','FAILED'],['PAID','PROCESSING'],['PAID','REFUNDED'],['DISPUTED','DISPUTED']]){sql(`update public.comu_orders set status='${master}' where id='${a.o}';update public.comu_payment_intents set status='${payment}' where id='${a.payment}'`);denied(uid,transition(a.s,'PREPARING'));}
 sql(`update public.comu_orders set status='PAID' where id='${a.o}';update public.comu_payment_intents set status='SUCCEEDED',amount_cents=9999 where id='${a.payment}'`);denied(uid,transition(a.s,'PREPARING'));sql(`update public.comu_payment_intents set amount_cents=10000,currency='USD' where id='${a.payment}'`);denied(uid,transition(a.s,'PREPARING'));sql(`update public.comu_payment_intents set currency='MXN' where id='${a.payment}'`);
 denied(buyer,transition(a.s,'PREPARING'));denied(other,transition(a.s,'PREPARING'));
 sql(`update public.comu_seller_memberships set role='CATALOG_MANAGER' where seller_id='${seller}'`);denied(uid,transition(a.s,'PREPARING'));
 for(const role of ['OWNER','ADMIN','ORDER_MANAGER']){sql(`update public.comu_seller_memberships set role='${role}' where seller_id='${seller}'`);as(uid,transition(a.s,'PREPARING'));}
 sql(`update public.comu_seller_memberships set active=false where seller_id='${seller}'`);denied(uid,transition(a.s,'PREPARING'));sql(`update public.comu_seller_memberships set active=true where seller_id='${seller}'`);
 as(uid,transition(a.s,'READY_FOR_HUB'));as(uid,transition(a.s,'HANDED_TO_HUB'));denied(uid,transition(a.s,'HUB_RECEIVED'));as(admin,transition(a.s,'HUB_RECEIVED','HUB'));denied(uid,transition(a.s,'READY_TO_SHIP'));
 console.log('PASS payment amounts/currency/state, roles, cross seller, buyer, revoked retry, legacy HUB');
 const d=order();sql(`update public.comu_order_suborders set fulfillment_route='DIRECT' where id='${d.s}'`);as(uid,transition(d.s,'PREPARING'));denied(uid,transition(d.s,'READY_FOR_HUB'));as(uid,transition(d.s,'READY_TO_SHIP'));denied(uid,transition(d.s,'SHIPPED'));
 const sh=randomUUID();sql(`insert into public.comu_shipments(id,master_order_id,provider,provider_shipment_id,status) values('${sh}','${d.o}','SKYDROPX','o1-shipment','READY_TO_SHIP')`);as(uid,transition(d.s,'SHIPPED'));as(uid,transition(d.s,'SHIPPED'));
 const track=(key,status)=>`set role service_role; select public.comu_process_tracking_event_v1('SKYDROPX','${key}','o1-shipment','${status}','O1TRACK');reset role;`;
 // Inject failure after event insertion: transaction must roll back both event and shipment.
 sql(`create function public.o1_fail_tracking() returns trigger language plpgsql as $$begin if new.status='DELIVERED' then raise exception 'O1_INJECTED_FAILURE'; end if;return new;end$$;create trigger o1_fail before update on public.comu_shipments for each row execute function public.o1_fail_tracking();`);
 assert.throws(()=>sql(track('retry','DELIVERED')));assert.equal(rows("select count(*) n from public.comu_shipping_webhook_events where provider_event_id='retry'")[0].n,0);
 sql('drop trigger o1_fail on public.comu_shipments;drop function public.o1_fail_tracking()');sql(track('retry','DELIVERED'));sql(track('retry','DELIVERED'));sql(track('late','IN_TRANSIT'));sql(track('unknown','UNKNOWN'));assert.equal(rows(`select status from public.comu_shipments where id='${sh}'`)[0].status,'DELIVERED');assert.equal(rows(`select fulfillment_status from public.comu_orders where id='${d.o}'`)[0].fulfillment_status,'DELIVERED');
 console.log('PASS DIRECT, shipment prerequisite, tracking rollback/retry/duplicate/out-of-order/delivery');
 const incident=randomUUID();as(admin,`select public.comu_record_fulfillment_incident_v1('${a.s}','OTHER','${incident}','PRIVATE_INTERNAL_NOTE')`);as(admin,`select public.comu_record_fulfillment_incident_v1('${a.s}','OTHER','${incident}','PRIVATE_INTERNAL_NOTE')`);assert.equal(rows(`select fulfillment_status from public.comu_orders where id='${a.o}'`)[0].fulfillment_status,'ISSUE');assert.equal(rows(`select count(*) n from public.comu_fulfillment_incidents where suborder_id='${a.s}'`)[0].n,1);
 const read=(q='')=>{const out=as(uid,`select public.comu_seller_orders_read_o1('${seller}'${q})`);return JSON.parse(out.split('\n').find(l=>l.startsWith('{')));};
 // Build valid item references through C2 in the disposable fixture, without stock writes.
 sql(`select set_config('request.jwt.claim.sub','${admin}',false);insert into public.comu_storefronts(seller_id,name,slug,status) values('${seller}','O1 A','o1-a','PREPARING')`);
 sql(`update public.comu_seller_memberships set role='OWNER' where seller_id='${seller}' and user_id='${uid}'`);
 as(uid,`select public.comu_catalog_save_v1('${seller}','${randomUUID()}','{"name":"O1 fixture product","variants":[{"name":"Negro / M","sku":"O1-SKU","price":100,"attributes":{}}]}')`);
 const source=rows(`select l.id listing_id,l.product_id,v.id variant_listing_id,v.variant_id from public.comu_product_listings l join public.comu_variant_listings v on v.listing_id=l.id where l.seller_id='${seller}'`)[0];
 const item=randomUUID();sql(`insert into public.comu_order_items(id,order_id,suborder_id,seller_id,listing_id,variant_listing_id,product_id,variant_id,quantity,unit_price,subtotal) values('${item}','${a.o}','${a.s}','${seller}','${source.listing_id}','${source.variant_listing_id}','${source.product_id}','${source.variant_id}',1,100,100);insert into public.comu_order_item_snapshots(order_item_id,snapshot) values('${item}','{"listingTitle":"O1 historical snapshot","sku":"O1-SKU","variant":"Negro / M","attributes":{},"image":"/comu/test-image.png","privateNote":"PRIVATE_INTERNAL_NOTE"}');`);

 const r=read();assert.equal(r.orders.length,2);const text=JSON.stringify(r);for(const secret of ['PRIVATE_PHONE','PRIVATE_ADDRESS','PRIVATE_INTERNAL_NOTE','hub_handoff_token','provider_shipment_id','label_url'])assert.ok(!text.includes(secret));assert.ok(r.orders.some(o=>o.timeline.some(e=>e.type==='SUBORDER_PREPARING')));
 sql(`update public.comu_order_suborders set created_at=now()-interval '60 days' where id='${a.s}'`);assert.equal(read().orders.length,1);assert.equal(read(",null,90").orders.length,2);assert.equal(read(`,'${a.s}',30`).selected.suborderId,a.s);assert.equal(read(",null,90,'DELIVERED'").orders.length,1);assert.equal(read(",null,90,'ALL','',1,1").orders.length,1);assert.equal(read(",null,90,'ALL','',2,1").orders.length,1);const number=rows(`select order_number from public.comu_orders where id='${a.o}'`)[0].order_number;assert.equal(read(`,null,90,'ALL','${number}'`).orders.length,1);
 denied(other,`select public.comu_seller_orders_read_o1('${seller}')`);denied(buyer,`select public.comu_seller_orders_read_o1('${seller}')`);
 assert.equal(read(",null,90,'ALL','O1-SKU'").orders.length,1);assert.equal(read(",null,90,'ALL','historical snapshot'").orders[0].items[0].sku,'O1-SKU');
 denied(uid,`select public.comu_seller_orders_read_o1('${sellerB}','${a.s}')`);
 denied(uid,`select public.comu_seller_order_detail_o1('${a.s}')`);
 try {as(uid,`update public.comu_order_suborders set fulfillment_status='DELIVERED' where id='${a.s}'`);} catch(error) {assert.match(error.stderr?.toString()||error.message,/permission denied|row-level security/);}
 assert.equal(rows(`select fulfillment_status from public.comu_order_suborders where id='${a.s}'`)[0].fulfillment_status,'ISSUE');
 // C1 provenance is real data, scoped fixture, not fabricated legacy history.
 const application=randomUUID();sql(`insert into public.comu_seller_applications(id,user_id,contact_name,business_name,email,phone,city,business_type,status) values('${application}','${uid}','LOCAL TEST','O1 C1','o1@example.test','5550000000','LOCAL','Retail','PENDING')`);
 as(admin,`select public.comu_review_seller_application_v1('${application}','APPROVED')`);
 const c1Seller=rows(`select seller_id from public.comu_seller_applications where id='${application}'`)[0].seller_id;
 const c=order(c1Seller);as(uid,transition(c.s,'PREPARING'));sql(`update public.comu_seller_applications set status='REJECTED',decision='REJECTED' where id='${application}'`);denied(uid,transition(c.s,'PREPARING'));sql(`update public.comu_seller_applications set status='APPROVED',decision='APPROVED' where id='${application}'`);
 console.log('PASS C1 revoked retry, privacy, timeline, selected, dates, states, search, pagination');
 if(process.argv.includes('--http')){const {certifyHTTP}=await import('./test-comu-orders-o1-http-local.mjs');await certifyHTTP({docker,container,database,dock,sql,uid,other,buyer,admin,seller,sellerB,order:a,direct:d,createOrder:order});}
 if(process.argv.includes('--keep')){keep=true;console.log('Retained isolated DB',database);}
 console.log('O1 PostgreSQL PASS');
} catch(e){console.error(e.stderr?.toString().slice(-3000)||e.stack);process.exitCode=1;}
finally{if(!keep){dock(['exec','-u','postgres',container,'dropdb','-U','postgres','--force',database]);console.log('Removed disposable',database);}}
