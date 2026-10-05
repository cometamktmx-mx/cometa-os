// Real disposable PostgreSQL + optional isolated Auth/PostgREST/Next HTTP. Never mutates principal DB.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
const dock=(args,input)=>execFileSync(docker,['--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],{input,encoding:'utf8',windowsHide:true,maxBuffer:80*1024*1024,stdio:['pipe','pipe','pipe']});
const containers=dock(['ps','--format','{{.Names}}']).trim().split(/\r?\n/).filter(n=>n.startsWith('supabase_db_'));assert.equal(containers.length,1);const container=containers[0];
assert.ok(JSON.parse(dock(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'].some(p=>p.HostPort==='54322'));
const database='comu_n1_'+Date.now();assert.match(database,/^comu_n1_\d+$/);
const sql=(q,db=database)=>{assert.ok(db===database||db==='postgres');return dock(['exec','-i','-u','postgres',container,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],db===database?q:`begin read only;${q};commit;`).trim();};
const rows=q=>JSON.parse(sql(`select coalesce(json_agg(q),'[]') from (${q})q`));
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const uid=randomUUID(),other=randomUUID(),buyer=randomUUID(),admin=randomUUID(),seller=randomUUID(),sellerB=randomUUID(),brand=randomUUID(),brandB=randomUUID(),bid=randomUUID(),reservation=randomUUID();
const as=(user,q)=>sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub',${quote(user)},true); ${q}; commit;`);
function denied(user,q,pattern=/COMU_.*(DENIED|UNAUTHORIZED|FORBIDDEN|CONFIRMED|INVALID|PREPARED)|permission denied/){let failure;try{as(user,q);}catch(e){failure=e.stderr?.toString()||e.message;}assert.ok(failure,'Expected denial');assert.match(failure,pattern);}
const order=(targetSeller=seller)=>{const o=randomUUID(),s=randomUUID(),payment=randomUUID();sql(`insert into public.comu_orders(id,buyer_id,reservation_id,idempotency_key,status,grand_total,currency,shipping_mode,guarantee_days,shipping_address_snapshot) values('${o}','${bid}','${reservation}','${o}','PAID',100,'MXN','STANDARD',7,'{"recipient_name":"Local recipient","phone":"PRIVATE_PHONE","line1":"PRIVATE_ADDRESS"}'); insert into public.comu_order_suborders(id,order_id,seller_id,grand_total) values('${s}','${o}','${targetSeller}',100); insert into public.comu_payment_intents(id,order_id,buyer_id,amount_cents,currency,status,idempotency_key) values('${payment}','${o}','${bid}',10000,'MXN','SUCCEEDED','${payment}');`);return {o,s,payment};};
const transition=(s,target,actor='SELLER')=>`select public.comu_transition_suborder_fulfillment_v1('${s}','${target}','${actor}',null)`;
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
 const historical=order();sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${historical.o}','ORDER_PAID','TEST')`);
 sql(fs.readFileSync('supabase/migrations/20261005150000_comu_notifications_v1.sql','utf8'));
 if(process.argv.includes('--http-only')) {
  const {certifyHTTP}=await import('./test-comu-notifications-n1-http-local.mjs');
  await certifyHTTP({docker,container,database,dock,sql,uid,other,buyer,admin,seller,sellerB,bid,createOrder:order});
 } else {
 const service=q=>sql(`set role service_role;${q};reset role;`);
 const count=table=>rows(`select count(*)::int n from public.${table}`)[0].n;
 const inbox=(user,audience='SELLER',sid=null)=>JSON.parse(as(user,`select public.comu_notifications_read_n1('${audience}',${sid?quote(sid):'null'},50)`).split('\n').find(l=>l.startsWith('{')));
 service('select public.comu_n1_reconcile()');assert.equal(count('comu_notification_outbox'),0);
 // Execute the actual TS worker against real SQL; email transport is an injected local fake.
 const ts=(await import('typescript')).default, vm=await import('node:vm');
 const allowed=new Set(['comu_n1_reconcile','comu_n1_claim','comu_n1_expand','comu_n1_prepare_email','comu_n1_finish']);
 const rpc=async(name,args={})=>{assert.ok(allowed.has(name));const params=Object.entries(args).map(([k,v])=>`${k}=>${v===null?'null':typeof v==='boolean'||typeof v==='number'?String(v):quote(v)}`).join(',');
  try{const query=name==='comu_n1_claim'?`select coalesce(jsonb_agg(q),'[]'::jsonb) from public.${name}(${params})q`:`select to_jsonb(public.${name}(${params}))`;return {data:JSON.parse(service(query)),error:null};}catch{return {data:null,error:{message:'LOCAL_SQL_FAILURE'}};}};
 const deliveries=new Map();let failure=false,lost=false;
 const transport=async(payload,key)=>{assert.ok(!JSON.stringify(payload).includes('PRIVATE_'));if(failure)return {ok:false,error:'PROVIDER_UNAVAILABLE'};deliveries.set(key,JSON.stringify(payload));if(lost){lost=false;return {ok:false,error:'PROVIDER_UNAVAILABLE'};}return {ok:true};};
 const context={exports:{},require(name){if(name==='server-only')return {};if(name==='@/lib/pos/server')return {getAdminClient:()=>({rpc})};if(name==='./notification-email')return {notificationEmailConfig:()=>({from:'comu@example.test',origin:'https://comu.example.test'}),sendComuEmail:transport};throw Error(name);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/comu/notification-worker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 const dispatch=()=>context.exports.dispatchNotifications(10,transport);
 const drain=async()=>{for(let i=0;i<30;i++){const r=await dispatch();if(!r.processed)return;}throw Error('Unbounded dispatch');};
 const a=order(), second=randomUUID();sql(`insert into public.comu_order_suborders(id,order_id,seller_id,grand_total) values('${second}','${a.o}','${sellerB}',50)`);
 const paid=randomUUID();sql(`insert into public.comu_order_events(id,order_id,event_type,actor_type) values('${paid}','${a.o}','ORDER_PAID','TEST')`);
 await drain();assert.equal(inbox(uid).notifications.length,1);assert.equal(inbox(other).notifications.length,1);assert.equal(inbox(buyer,'BUYER').notifications.length,1);assert.equal(deliveries.size,3);
 assert.equal(inbox(uid).notifications[0].metadata.scope,'SUBORDER');assert.equal(inbox(buyer,'BUYER').notifications[0].metadata.scope,'MASTER');
 assert.ok(inbox(uid).notifications[0].deep_link.endsWith('selected='+a.s));assert.ok(inbox(other).notifications[0].deep_link.endsWith('selected='+second));assert.equal(inbox(buyer,'BUYER').notifications[0].deep_link,`/comu/account/orders/${a.o}?view=detail`);
 sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${a.o}','ORDER_PAID','TEST')`);await drain();assert.equal(count('comu_notifications'),3);assert.equal(deliveries.size,3);
 console.log('PASS ORDER_PAID Seller/Buyer, MASTER/SUBORDER, multistore isolation, source and semantic dedupe, no backfill');
 denied(other,`select public.comu_notifications_mark_n1('${inbox(uid).notifications[0].id}','SELLER')`,/COMU_NOTIFICATION_NOT_FOUND/);
 const own=inbox(uid).notifications[0].id;
 as(uid,`select public.comu_notifications_mark_n1('${own}','SELLER')`);assert.equal(inbox(uid).unreadCount,0);assert.equal(inbox(other).unreadCount,1);
 as(other,"select public.comu_notifications_mark_n1(null,'SELLER')");assert.equal(inbox(other).unreadCount,0);
 denied(buyer,"select public.comu_n1_claim(1)",/permission denied/);
 denied(buyer,"select * from public.comu_notification_outbox",/permission denied/);
 assert.equal(Number(as(buyer,'select count(*) from public.comu_notifications').split('\n').at(-1)),1);
 console.log('PASS read/read-all/unread, cross-user denied, RLS and worker grants');
 as(uid,transition(a.s,'PREPARING'));await drain();assert.equal(inbox(other).notifications.length,1);assert.equal(inbox(uid).notifications.length,2);assert.equal(inbox(buyer,'BUYER').notifications.length,2);assert.equal(deliveries.size,3);
 as(uid,transition(a.s,'READY_FOR_HUB'));await drain();assert.ok(inbox(buyer,'BUYER').notifications.some(n=>n.event_kind==='READY_FOR_HUB'));assert.equal(deliveries.size,3);
 const direct=order();sql(`update public.comu_order_suborders set fulfillment_route='DIRECT' where id='${direct.s}'`);as(uid,transition(direct.s,'PREPARING'));as(uid,transition(direct.s,'READY_TO_SHIP'));await drain();
 const sh=randomUUID();sql(`insert into public.comu_shipments(id,master_order_id,provider,provider_shipment_id,status) values('${sh}','${direct.o}','SKYDROPX','n1-tracking','READY_TO_SHIP')`);
 as(uid,transition(direct.s,'SHIPPED'));await drain();const beforeTracking=deliveries.size;
 service("select public.comu_process_tracking_event_v1('SKYDROPX','n1-transit','n1-tracking','IN_TRANSIT',null)");await drain();assert.equal(deliveries.size,beforeTracking);
 service("select public.comu_process_tracking_event_v1('SKYDROPX','n1-delivered','n1-tracking','DELIVERED',null)");await drain();assert.equal(deliveries.size,beforeTracking+1);
 assert.ok(inbox(buyer,'BUYER').notifications.some(n=>n.event_kind==='DELIVERED'));
 console.log('PASS PREPARING/READY in-app only, DIRECT, IN_TRANSIT reconciled, DELIVERED buyer email');
 const incident=randomUUID(),beforeIncident=deliveries.size;
 as(admin,`select public.comu_record_fulfillment_incident_v1('${a.s}','WRONG_PRODUCT','${incident}','PRIVATE_NOTE')`);await drain();assert.equal(deliveries.size,beforeIncident+2);
 const b=order();as(admin,`select public.comu_record_fulfillment_incident_v1('${b.s}','OTHER','${randomUUID()}','PRIVATE_NOTE')`);await drain();assert.equal(deliveries.size,beforeIncident+3);
 console.log('PASS ISSUE seller actionable policy and buyer relevant email, no private notes');
 // Revoked before expansion: no intent. Revoked after expansion: invisible and suppressed email.
 sql(`update public.comu_seller_memberships set active=false where seller_id='${seller}'`);const revoked=order();sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${revoked.o}','ORDER_PAID','TEST')`);await drain();assert.equal(inbox(uid).notifications.length,0);assert.equal(rows(`select id from public.comu_notifications where order_id='${revoked.o}' and audience='SELLER'`).length,0);
 sql(`update public.comu_seller_memberships set active=true where seller_id='${seller}'`);
 const late=order();sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${late.o}','ORDER_PAID','TEST')`);
 const captured=JSON.parse(service('select coalesce(jsonb_agg(q),\'[]\') from public.comu_n1_claim(1)q'))[0];service(`select public.comu_n1_expand('${captured.id}','${captured.claim_token}')`);
 sql(`update public.comu_seller_memberships set active=false where seller_id='${seller}'`);await drain();assert.equal(rows(`select b.status from public.comu_notification_outbox b join public.comu_notifications n on n.id=b.notification_id where n.order_id='${late.o}' and n.audience='SELLER' and b.channel='EMAIL'`)[0].status,'SUPPRESSED');sql(`update public.comu_seller_memberships set active=true where seller_id='${seller}'`);
 console.log('PASS revoked before dispatch and before send, previously visible rows hidden dynamically');
 failure=true;const retry=order();sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${retry.o}','ORDER_PAID','TEST')`);as(uid,transition(retry.s,'PREPARING'));await drain();assert.equal(rows(`select fulfillment_status from public.comu_order_suborders where id='${retry.s}'`)[0].fulfillment_status,'PREPARING');
 const attempts=rows("select id,attempt_count from public.comu_notification_outbox where status='RETRY'");assert.ok(attempts.length>=2);assert.ok(rows("select id from public.comu_notification_outbox where status='RETRY' and next_attempt_at>now()").length>=2);
 await dispatch();for(const row of attempts)assert.equal(rows(`select attempt_count from public.comu_notification_outbox where id='${row.id}'`)[0].attempt_count,row.attempt_count);
 failure=false;lost=true;sql("update public.comu_notification_outbox set next_attempt_at=now() where status='RETRY'");await drain();const received=deliveries.size;
 sql("update public.comu_notification_outbox set next_attempt_at=now() where status='RETRY'");await drain();assert.equal(deliveries.size,received);
 console.log('PASS provider failure does not rollback order, retry/backoff, received-but-lost dedupe with stable provider key');
 const stale=order();sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${stale.o}','ORDER_PAID','TEST')`);
 const claim1=JSON.parse(service('select jsonb_agg(q) from public.comu_n1_claim(1)q'))[0];assert.deepEqual(JSON.parse(service("select coalesce(jsonb_agg(q),'[]') from public.comu_n1_claim(1)q")),[]);
 sql(`update public.comu_notification_outbox set lease_until=now()-interval '1 second' where id='${claim1.id}'`);
 const claim2=JSON.parse(service('select jsonb_agg(q) from public.comu_n1_claim(1)q'))[0];assert.notEqual(claim1.claim_token,claim2.claim_token);
 assert.equal(service(`select public.comu_n1_finish('${claim1.id}','${claim1.claim_token}',true,null)`),'f');service(`select public.comu_n1_expand('${claim2.id}','${claim2.claim_token}')`);await drain();
 console.log('PASS exclusive claim, stale recovery, fencing rejects old worker');
 // A notification capture storage error cannot abort the original fulfillment event.
 sql("create function public.n1_inject_failure() returns trigger language plpgsql as $$begin raise exception 'injected';end$$;create trigger n1_fail before insert on public.comu_notification_outbox for each row execute function public.n1_inject_failure()");
 const recover=order();as(uid,transition(recover.s,'PREPARING'));assert.equal(rows(`select fulfillment_status from public.comu_order_suborders where id='${recover.s}'`)[0].fulfillment_status,'PREPARING');
 sql('drop trigger n1_fail on public.comu_notification_outbox;drop function public.n1_inject_failure()');await drain();assert.ok(inbox(uid).notifications.some(n=>n.deep_link.endsWith(recover.s)));
 console.log('PASS capture failure preserves fulfillment; bounded reconciliation repairs missing intent');
 // Transactional intent disappears on source rollback; no parallel business event.
 const rollbackId=randomUUID(),rollbackOrder=order();sql(`begin;insert into public.comu_order_events(id,order_id,event_type,actor_type) values('${rollbackId}','${rollbackOrder.o}','ORDER_PAID','TEST');rollback;`);
 assert.equal(rows(`select id from public.comu_notification_outbox where source_event_id='${rollbackId}'`).length,0);
 const final=order();sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${final.o}','ORDER_PAID','TEST')`);
 const finalCapture=JSON.parse(service('select jsonb_agg(q) from public.comu_n1_claim(1)q'))[0];service(`select public.comu_n1_expand('${finalCapture.id}','${finalCapture.claim_token}')`);
 const finalEmails=rows(`select b.id from public.comu_notification_outbox b join public.comu_notifications n on n.id=b.notification_id where n.order_id='${final.o}' and b.channel='EMAIL' order by b.id`);
 assert.equal(finalEmails.length,2);
 sql(`update public.comu_notification_outbox set first_send_at=now()-interval '23 hours 1 minute' where id='${finalEmails[0].id}';update public.comu_notification_outbox set attempt_count=6 where id='${finalEmails[1].id}'`);
 await drain();assert.equal(rows(`select count(*)::int n from public.comu_notification_outbox where id in ('${finalEmails[0].id}','${finalEmails[1].id}') and status='FAILED' and last_error='DELIVERY_REVIEW_REQUIRED'`)[0].n,2);
 denied(uid,`update public.comu_notifications set read_at=now() where id='${own}'`,/permission denied/);
 console.log('PASS source rollback atomicity, bounded attempts, provider-window review, direct writes denied');
 for(const role of ['ADMIN','ORDER_MANAGER','CATALOG_MANAGER']) {
  sql(`update public.comu_seller_memberships set role='${role}' where seller_id='${seller}' and user_id='${uid}'`);
  const test=order();sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${test.o}','ORDER_PAID','TEST')`);await drain();
  assert.equal(rows(`select id from public.comu_notifications where recipient_user_id='${uid}' and order_id='${test.o}'`).length,role==='CATALOG_MANAGER'?0:1);
 }
 sql(`update public.comu_seller_memberships set role='OWNER' where seller_id='${seller}' and user_id='${uid}'`);
 const application=randomUUID();sql(`insert into public.comu_seller_applications(id,user_id,contact_name,business_name,email,phone,city,business_type,status) values('${application}','${uid}','LOCAL TEST','N1 C1','n1@example.test','5550000000','LOCAL','Retail','PENDING')`);
 as(admin,`select public.comu_review_seller_application_v1('${application}','APPROVED')`);
 const approved=rows(`select seller_id from public.comu_seller_applications where id='${application}'`)[0].seller_id;
 const approvedOrder=order(approved);sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${approvedOrder.o}','ORDER_PAID','TEST')`);await drain();assert.equal(inbox(uid,'SELLER',approved).notifications.length,1);
 sql(`update public.comu_seller_applications set status='REJECTED',decision='REJECTED' where id='${application}'`);assert.equal(inbox(uid,'SELLER',approved).notifications.length,0);
 sql(`update public.comu_seller_applications set status='APPROVED',decision='APPROVED' where id='${application}'`);
 console.log('PASS N1 OWNER/ADMIN/ORDER_MANAGER, catalog excluded, C1 real approval/revocation and legacy');
 const concurrent=order();sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${concurrent.o}','ORDER_PAID','TEST')`);
 const locked=new Promise((resolve,reject)=>execFile(docker,['--host','npipe:////./pipe/dockerDesktopLinuxEngine','exec','-u','postgres',container,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',database,'-c',"begin;set role service_role;select jsonb_agg(q) from public.comu_n1_claim(1)q;select pg_sleep(2);commit;"],{encoding:'utf8',windowsHide:true},(error,out)=>error?reject(error):resolve(out)));
 await new Promise(r=>setTimeout(r,400));
 assert.deepEqual(JSON.parse(service("select coalesce(jsonb_agg(q),'[]') from public.comu_n1_claim(1)q")),[]);
 const held=JSON.parse((await locked).trim().split('\n').find(l=>l.startsWith('[')))[0];service(`select public.comu_n1_expand('${held.id}','${held.claim_token}')`);await drain();
 console.log('PASS independent PostgreSQL sessions SKIP LOCKED concurrent claim');
 const serialized=JSON.stringify(rows('select title,body,deep_link,metadata from public.comu_notifications'));for(const bad of ['PRIVATE_','phone','address','stripe','hub_handoff','label_url','payment_method'])assert.ok(!serialized.includes(bad));
 if(process.argv.includes('--http')){const {certifyHTTP}=await import('./test-comu-notifications-n1-http-local.mjs');await certifyHTTP({docker,container,database,dock,sql,uid,other,buyer,admin,seller,sellerB,bid,createOrder:order});}
 }
 console.log(process.argv.includes('--http-only')?'N1 HTTP/Chromium PASS; real emails 0':'N1 Notification Engine PostgreSQL/worker PASS; provider transport MOCK only');
} catch(e){console.error(e.stderr?.toString().slice(-2000)||e.stack);process.exitCode=1;}
finally{dock(['exec','-u','postgres',container,'dropdb','-U','postgres','--force',database]);console.log('Removed disposable',database);}
