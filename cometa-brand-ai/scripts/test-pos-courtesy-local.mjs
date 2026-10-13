import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const source=fs.readFileSync('scripts/test-storefront-m6-local.mjs','utf8');
const prefix=source.slice(0,source.indexOf('const ids='));
const body=String.raw`
let created=false;
try{
 const list=JSON.parse((await api('GET','/containers/json')).toString()).filter(c=>c.Names.some(n=>n.startsWith('/supabase_db_')));assert.equal(list.length,1);container=list[0].Id;
 await destination();await exec(['createdb','-U','postgres','--template=template0',database]);created=true;
 await sql('create schema extensions;create extension pgcrypto with schema extensions;create extension "uuid-ossp" with schema extensions;create extension vector with schema public;create extension pg_stat_statements with schema extensions;create extension supabase_vault;');
 await sql(fs.readFileSync('.next/release-private-20261011/schema.sql','utf8'),'supabase_admin');
 await sql(fs.readFileSync('supabase/migrations/20261012180000_pos_complimentary_workspace_v1.sql','utf8'));
 await sql(fs.readFileSync('supabase/migrations/20261012181000_pos_courtesy_domain_conflict_v1.sql','utf8'));
 const admin=randomUUID(),owner=randomUUID(),inactive=randomUUID();
 await sql("begin;set local session_replication_role=replica;insert into auth.users(id,email) values('"+admin+"','courtesy-admin@example.test'),('"+owner+"','courtesy-owner@example.test'),('"+inactive+"','courtesy-inactive@example.test');insert into user_profiles(user_id,email,role,status) values('"+admin+"','courtesy-admin@example.test','admin','active'),('"+owner+"','courtesy-owner@example.test','client','active'),('"+inactive+"','courtesy-inactive@example.test','admin','inactive');insert into brands(slug,name,status) values('courtesy-test','SYNTHETIC','active'),('courtesy-other','SYNTHETIC OTHER','active');insert into pos_plans(code,name,description,list_price) values('pro','Synthetic Pro','Test only',0);commit;");
 await sql("insert into pos_subscriptions(brand_id,brand_slug,plan_code,status,list_price,contracted_price,trial_ends_at) select id::text,slug,'pro','trial',0,0,now()-interval '1 day' from brands where slug='courtesy-test'");
 assert.equal(JSON.parse(await sql("select pos_get_effective_commercial_access('courtesy-test')")).subscriptionLifecycle.effectiveStatus,'trial_expired');
 const call=(actor,expected,action,end='null',brand='courtesy-test')=>"select pos_manage_complimentary_v1("+quote(brand)+","+quote(actor)+","+(expected?quote(expected):'null')+","+quote(action)+",'pro',"+end+",'Synthetic verification')";
 await assert.rejects(()=>sql(call(owner,null,'save')),/ADMIN_REQUIRED/);
 await assert.rejects(()=>sql(call(inactive,null,'save')),/ADMIN_REQUIRED/);
 await assert.rejects(()=>sql("set role authenticated;"+call(admin,null,'save')),/permission denied/);
 await assert.rejects(()=>sql("set role anon;"+call(admin,null,'save')),/permission denied/);
 const g=JSON.parse(await sql(call(admin,null,'save'))).id;
 let effective=JSON.parse(await sql("select pos_get_effective_commercial_access('courtesy-test')"));assert.equal(effective.effective.accessAllowed,true);assert.equal(effective.grant.endsAt,null);
 assert.equal(JSON.parse(await sql("select pos_get_effective_commercial_access('courtesy-other')")).effective.accessAllowed,false);
 const race=await Promise.allSettled([sql(call(admin,g,'save',"now()+interval '2 days'")),sql(call(admin,g,'save',"now()+interval '3 days'"))]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 const next=JSON.parse(race.find(r=>r.status==='fulfilled').value).id;
 await sql(call(admin,next,'revoke'));assert.equal(JSON.parse(await sql("select pos_get_effective_commercial_access('courtesy-test')")).effective.accessAllowed,false);
 await sql("insert into pos_commercial_grants(brand_slug,grant_code,grant_type,plan_code,status,starts_at,ends_at,reason,created_by) values('courtesy-test','expired','complimentary','pro','active',now()-interval '2 days',now()-interval '1 day','Synthetic expiry',"+quote(admin)+")");
 assert.equal(JSON.parse(await sql("select pos_get_effective_commercial_access('courtesy-test')")).effective.accessAllowed,false);
 assert.equal(await sql("select count(*) from pos_commercial_grants"),'3');assert.equal(await sql("select count(*) from pos_commercial_grant_events"),'3');
 assert.equal(await sql("select count(*) from pos_subscriptions where status='trial' and trial_ends_at<now()"),'1');
 fs.writeFileSync('.next/release-private-20261011/courtesy-sql-pass.json',JSON.stringify({database,at:new Date().toISOString(),hash:createHash('sha256').update(fs.readFileSync('supabase/migrations/20261012180000_pos_complimentary_workspace_v1.sql')).digest('hex'),tests:['grant','unlimited','replace','concurrent CAS','revoke','expired','inactive','owner denied','anon/authenticated execute denied','brand isolation','immutable history preserved','no paid subscription']}));
 fs.writeFileSync('.next/release-private-20261011/courtesy-fix-pass.json',JSON.stringify({hash:createHash('sha256').update(fs.readFileSync('supabase/migrations/20261012181000_pos_courtesy_domain_conflict_v1.sql')).digest('hex')}));
 console.log('PASS disposable SQL courtesy grant/replace/revoke/expiry/concurrency/authorization/isolation/history',database);
}finally{if(created)await exec(['dropdb','-U','postgres',database]);}
`;
const file=path.resolve('.next/release-private-20261011/courtesy-test-'+Date.now()+'.mjs');fs.writeFileSync(file,prefix+body);await import(pathToFileURL(file).href);
