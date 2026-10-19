// Authorized release only. Require a freshly restored, hash-verified backup.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
assert.equal(process.argv[2],'--authorized-launch');
const ref='zhtagqrzyovsrmsicaot',dir='build/retail-workspace-production/audit';
const expected=[['20261019230000_pos_retail_inventory_workspace.sql','fd87a636a8bff70578e847289b7b58ac7e0dd356205fb3606a51c642c55c5f5c'],['20261020001000_pos_customer_factory_benefit.sql','d14ab4a6d2167c2be231a5866daec2b9938be4e3b6a681d7802d334e0fc6770d']];
const hash=b=>createHash('sha256').update(b).digest('hex');
const recovery=JSON.parse(fs.readFileSync(dir+'/recovery-result.json','utf8'));
assert.equal(recovery.result,'PASS');assert.equal(recovery.sourceRef,ref);assert.ok(Date.now()-Date.parse(recovery.at)<7200000,'Fresh restored backup required');
const proof=JSON.parse(fs.readFileSync(recovery.folder+'/proof.private.json','utf8'));
assert.equal(proof.countsPreserved,true);assert.equal(proof.storageVerified,proof.storageHttpVerified);assert.equal(proof.databaseRestored,true);
assert.equal(hash(fs.readFileSync(recovery.folder+'/'+proof.databaseSnapshot.file)),proof.databaseSnapshot.sha256);
for(const item of JSON.parse(fs.readFileSync(recovery.folder+'/storage-manifest.private.json','utf8')))assert.equal(hash(fs.readFileSync(recovery.folder+'/'+item.file)),item.sha256);
function query(sql){const file=dir+'/migration-query.private.sql';fs.writeFileSync(file,sql);try{return JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref',ref,'--file',file,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:20000000})).rows;}catch(e){fs.writeFileSync(dir+'/migration-error.private.txt',String(e.stderr??''));throw Error('PRODUCTION_QUERY_FAILED; private diagnostic saved');}}
assert.equal(query("begin read only;select slug from brands where id='70880b54-b6fe-4775-bb39-c9ff19c47c39';commit;")[0]?.slug,'magenta-fitwear');
const log=[];
for(const [file,sha256] of expected){
 const bytes=fs.readFileSync('supabase/migrations/'+file);assert.equal(hash(bytes),sha256);assert.ok(proof.migrations.some(m=>m.file===file&&m.sha256===sha256));const version=file.split('_')[0],original=bytes.toString('utf8');
 const existing=query("begin read only;select statements from supabase_migrations.schema_migrations where version='"+version+"';commit;");
 if(existing.length){assert.equal(hash((existing[0].statements||[]).join('\n')),sha256);log.push({file,sha256,status:'already-applied-hash-verified'});continue;}
 const tables=query("begin read only;select tablename from pg_tables where schemaname='public' order by tablename;commit;").map(r=>r.tablename);for(const table of tables)assert.match(table,/^[a-z0-9_]+$/);
 const row=t=>t==='pos_retail_rules'?"(to_jsonb(t)-'customer_benefit_exclusions')":t==='pos_sales'?"(to_jsonb(t)-'retail_pricing_snapshot')":'to_jsonb(t)';
 const fingerprint="select jsonb_object_agg(name,digest) as value from ("+tables.map(t=>"select '"+t+"'::text as name,md5(coalesce(string_agg("+row(t)+"::text,'' order by "+row(t)+"::text),'')) as digest from public."+t+" t").join(' union all ')+" union all select 'auth.users',md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) from auth.users t) fingerprints";
 assert.match(original,/^begin;/i);assert.match(original,/commit;\s*$/i);assert.ok(!original.includes('$workspace_original$'));
 const sql=original.replace(/^begin;/i,"begin isolation level repeatable read;set local lock_timeout='5s';set local statement_timeout='120s';select pg_advisory_xact_lock(hashtextextended('cometa:retail-release',0));create temporary table workspace_before on commit drop as "+fingerprint+';').replace(/commit;\s*$/i,()=>"do $$ begin if (select value from workspace_before) is distinct from ("+fingerprint+") then raise exception 'PRESERVATION_CHECK_FAILED';end if;end $$;insert into supabase_migrations.schema_migrations(version,name,statements) values ('"+version+"','"+file.slice(15,-4)+"',array[$workspace_original$"+original+"$workspace_original$]);commit;");
 query(sql);const saved=query("begin read only;select statements from supabase_migrations.schema_migrations where version='"+version+"';commit;")[0];assert.equal(hash(saved.statements.join('\n')),sha256);
 log.push({file,sha256,status:'applied',preservation:'all existing public rows and auth users verified within transaction; only explicitly added fields excluded',at:new Date().toISOString()});
 fs.writeFileSync(dir+'/applied.json',JSON.stringify({ref,backup:recovery.folder,log},null,2));console.log('Applied with preservation and ledger hash verified:',file);
}
const verified=query(`begin read only;
select jsonb_build_object(
 'customerBenefits',(select count(*) from pos_customer_factory_benefits),
 'inventoryBatches',(select count(*) from pos_retail_inventory_batches),
 'departures',(select count(*) from pos_retail_stock_outs),
 'exceptions',(select jsonb_agg(jsonb_build_object('brand',brand_slug,'excluded',customer_benefit_exclusions)) from pos_retail_rules where customer_benefit_exclusions<>'[]'),
 'banditasOverride',(select product_discounts from pos_retail_rules where brand_slug='magenta-fitwear')
) verification;commit;`)[0].verification;
assert.equal(verified.customerBenefits,0);assert.equal(verified.inventoryBatches,0);assert.equal(verified.departures,0);
assert.deepEqual(verified.exceptions,[{brand:'magenta-fitwear',excluded:['22873a43-aee6-4313-b110-38262c80b907']}]);
assert.equal(verified.banditasOverride['4d1afc58-fd94-447c-8619-352969374124'],5);
fs.writeFileSync(dir+'/verification.json',JSON.stringify(verified,null,2));query("notify pgrst,'reload schema';");console.log(JSON.stringify({ref,log,verified}));
