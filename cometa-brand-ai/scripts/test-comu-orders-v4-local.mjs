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
const database='comu_v4_'+Date.now();assert.match(database,/^comu_v4_\d+$/);
const sql=(q,db=database)=>{assert.ok(db===database||db==='postgres');return dock(['exec','-i','-u','postgres',container,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],db===database?q:`begin read only;${q};commit;`).trim();};
const rows=q=>JSON.parse(sql(`select coalesce(json_agg(q),'[]') from (${q})q`));
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const uid=randomUUID(),other=randomUUID(),buyer=randomUUID(),admin=randomUUID(),seller=randomUUID(),sellerB=randomUUID(),brand=randomUUID(),brandB=randomUUID(),bid=randomUUID(),reservation=randomUUID();
const as=(user,q)=>sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub',${quote(user)},true); ${q}; commit;`);
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
 const {certifyHTTP}=await import('./test-comu-orders-v4-http-local.mjs');
 await certifyHTTP({container,database,dock,sql,uid,admin,seller,sellerB,brand,bid,createOrder:order,as,transition,rows});
 console.log('PASS Visual V4 isolated PostgreSQL/HTTP/Chromium; no real emails');
} catch(e){console.error(e.stderr?.toString().slice(-2000)||e.stack);process.exitCode=1;}
finally{dock(['exec','-u','postgres',container,'dropdb','-U','postgres','--force',database]);console.log('Removed disposable',database);}
