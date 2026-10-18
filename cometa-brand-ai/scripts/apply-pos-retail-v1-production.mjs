import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
assert.equal(process.argv[2],'--authorized-launch');
const ref='zhtagqrzyovsrmsicaot',dir='build/pos-tickets/production-audit';
const expected=[["20261019090000_pos_retail_v1_reporting.sql","2dde6ce7f7ed26b551310a859b8969e0075bd33d2c2086d28212f551bf583bbb"]];
const hash=b=>createHash('sha256').update(b).digest('hex');
const recovery=JSON.parse(fs.readFileSync(dir+'/recovery-result.json','utf8'));
assert.equal(recovery.result,'PASS');assert.equal(recovery.sourceRef,ref);assert.ok(Date.now()-Date.parse(recovery.at)<7200000,'Fresh restored backup required');
const proof=JSON.parse(fs.readFileSync(recovery.folder+'/proof.private.json','utf8'));
assert.equal(proof.countsPreserved,true);assert.equal(proof.storageVerified,proof.storageHttpVerified);assert.equal(proof.databaseRestored,true);
assert.equal(hash(fs.readFileSync(recovery.folder+'/'+proof.databaseSnapshot.file)),proof.databaseSnapshot.sha256);
for(const item of JSON.parse(fs.readFileSync(recovery.folder+'/storage-manifest.private.json','utf8')))assert.equal(hash(fs.readFileSync(recovery.folder+'/'+item.file)),item.sha256);
function query(sql){const file=dir+'/migration-query.private.sql';fs.writeFileSync(file,sql);try{return JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref',ref,'--file',file,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:20000000})).rows;}catch(e){fs.writeFileSync(dir+'/migration-error.private.txt',String(e.stderr??''));throw Error('PRODUCTION_QUERY_FAILED; private diagnostic saved');}}
assert.equal(query("begin read only;select slug from brands where id='70880b54-b6fe-4775-bb39-c9ff19c47c39';commit;")[0]?.slug,'magenta-fitwear');
const tables=['pos_retail_rules','pos_retail_orders','pos_retail_order_events','pos_retail_order_payments','pos_retail_sale_requests','pos_factory_prices','pos_customers','pos_cash_sessions','pos_cash_movements','user_profiles','brands','user_brand_access','pos_products','pos_product_variants','pos_inventory','pos_sales','pos_payments','pos_locations','pos_staff','pos_staff_sessions'];
// Only additive metadata columns are excluded; existing business and financial fields remain compared.
const row=t=>t==='pos_retail_rules'?"(to_jsonb(t)-'allow_active_content_changes'-'ordinary_returns_allowed')":t==='pos_cash_movements'?"(to_jsonb(t)-'reverses_movement_id')":'to_jsonb(t)';
const fingerprint='select jsonb_build_object('+tables.map(t=>"'"+t+"',(select md5(coalesce(string_agg("+row(t)+"::text,'' order by "+row(t)+"::text),'')) from public."+t+" t)").join(',')+",'users',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) from auth.users t)) as value";

const log=[];
for(const [file,sha256] of expected){const bytes=fs.readFileSync('supabase/migrations/'+file);assert.equal(hash(bytes),sha256);assert.ok(proof.migrations.some(m=>m.file===file&&m.sha256===sha256));const version=file.split('_')[0],original=bytes.toString('utf8');
 const existing=query("begin read only;select statements from supabase_migrations.schema_migrations where version='"+version+"';commit;");
 if(existing.length){assert.equal(hash((existing[0].statements||[]).join('\n')),sha256,'Existing migration hash mismatch');log.push({file,sha256,status:'already-applied-hash-verified'});continue;}
 assert.match(original,/^begin;/i);assert.match(original,/commit;\s*$/i);assert.ok(!original.includes('$retail_original$'));
 const sql=original.replace(/^begin;/i,"begin isolation level repeatable read; set local lock_timeout='5s';set local statement_timeout='120s';select pg_advisory_xact_lock(hashtextextended('cometa:retail-release',0));create temporary table retail_before on commit drop as "+fingerprint+';').replace(/commit;\s*$/i,()=>"do $$ begin if (select value from retail_before) is distinct from ("+fingerprint+") then raise exception 'PRESERVATION_CHECK_FAILED';end if;end $$;insert into supabase_migrations.schema_migrations(version,name,statements) values ('"+version+"','"+file.slice(15,-4)+"',array[$retail_original$"+original+"$retail_original$]);commit;");
 assert.ok(sql.includes('do $$ begin'));
 query(sql);
 const saved=query("begin read only;select statements from supabase_migrations.schema_migrations where version='"+version+"';commit;")[0];assert.equal(hash(saved.statements.join('\n')),sha256);
 log.push({file,sha256,status:'applied',preservation:'transaction-verified',at:new Date().toISOString()});fs.writeFileSync(dir+'/applied.json',JSON.stringify({ref,backup:recovery.folder,log},null,2));console.log('Applied, preserved business data, verified ledger hash:',file);
}
const job=query("begin read only;select active,schedule,command from cron.job where jobname='pos-retail-expiry-v1';commit;");assert.equal(job.length,1);assert.equal(job[0].active,true);assert.equal(job[0].schedule,'* * * * *');
assert.equal(query("begin read only;select count(*)::int n from pos_retail_rules where open_box and brand_slug<>'magenta-fitwear';commit;")[0].n,0);
query("notify pgrst,'reload schema';");console.log(JSON.stringify({ref,migrations:log}));
