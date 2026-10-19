import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
assert.equal(process.argv[2],'--authorized-launch');
const ref='zhtagqrzyovsrmsicaot',dir='build/pos-tickets/production-audit';
const expected=[["20261019193000_pos_product_discount_override.sql","753bccc566c0f7c64e234a8d5782128f201e8cf80c0bbaa4747cc70e99e95279"]];
const hash=b=>createHash('sha256').update(b).digest('hex');
const recovery=JSON.parse(fs.readFileSync(dir+'/recovery-result.json','utf8'));
assert.equal(recovery.result,'PASS');assert.equal(recovery.sourceRef,ref);assert.ok(Date.now()-Date.parse(recovery.at)<7200000,'Fresh restored backup required');
const proof=JSON.parse(fs.readFileSync(recovery.folder+'/proof.private.json','utf8'));
assert.equal(proof.countsPreserved,true);assert.equal(proof.storageVerified,proof.storageHttpVerified);assert.equal(proof.databaseRestored,true);
assert.equal(hash(fs.readFileSync(recovery.folder+'/'+proof.databaseSnapshot.file)),proof.databaseSnapshot.sha256);
for(const item of JSON.parse(fs.readFileSync(recovery.folder+'/storage-manifest.private.json','utf8')))assert.equal(hash(fs.readFileSync(recovery.folder+'/'+item.file)),item.sha256);
function query(sql){const file=dir+'/migration-query.private.sql';fs.writeFileSync(file,sql);try{return JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref',ref,'--file',file,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:20000000})).rows;}catch(e){fs.writeFileSync(dir+'/migration-error.private.txt',String(e.stderr??''));throw Error('PRODUCTION_QUERY_FAILED; private diagnostic saved');}}
assert.equal(query("begin read only;select slug from brands where id='70880b54-b6fe-4775-bb39-c9ff19c47c39';commit;")[0]?.slug,'magenta-fitwear');
const tables=query("begin read only;select tablename from pg_tables where schemaname='public' order by tablename;commit;").map(r=>r.tablename);
for(const table of tables)assert.match(table,/^[a-z0-9_]+$/);
const row=t=>t==='pos_retail_rules'?"(to_jsonb(t)-'product_discounts')":'to_jsonb(t)';
const fingerprint="select jsonb_object_agg(name,digest) as value from ("+tables.map(t=>"select '"+t+"'::text as name,md5(coalesce(string_agg("+row(t)+"::text,'' order by "+row(t)+"::text),'')) as digest from public."+t+" t").join(' union all ')+" union all select 'auth.users',md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) from auth.users t) fingerprints";
const verifyPrices=`do $verify$ declare loc uuid;variant uuid;qty integer;result jsonb;begin
 select id into loc from pos_locations where brand_slug='magenta-fitwear' and active and currency='MXN' and prices_include_tax order by id limit 1;
 select id into variant from pos_product_variants where brand_slug='magenta-fitwear' and product_id='4d1afc58-fd94-447c-8619-352969374124' and active order by id limit 1;
 if loc is null or variant is null then raise exception 'BANDITAS_VERIFICATION_CONTEXT_MISSING';end if;
 foreach qty in array array[49,50,51] loop
  result:=pos_retail_quote_v1('magenta-fitwear',loc,jsonb_build_array(jsonb_build_object('variant_id',variant,'quantity',qty,'discount_amount',0)));
  if (result->>'total')::numeric<>(case when qty<50 then qty*15 else qty*10 end) then raise exception 'BANDITAS_VERIFICATION_FAILED';end if;
 end loop;
 if (select product_discounts from pos_retail_rules where brand_slug='magenta-fitwear') is distinct from '{"4d1afc58-fd94-447c-8619-352969374124":5}'::jsonb
  or exists(select 1 from pos_retail_rules where brand_slug<>'magenta-fitwear' and product_discounts<>'{}'::jsonb) then raise exception 'PRODUCT_DISCOUNT_SCOPE_FAILED';end if;
end $verify$;`;

const log=[];
for(const [file,sha256] of expected){const bytes=fs.readFileSync('supabase/migrations/'+file);assert.equal(hash(bytes),sha256);assert.ok(proof.migrations.some(m=>m.file===file&&m.sha256===sha256));const version=file.split('_')[0],original=bytes.toString('utf8');
 const existing=query("begin read only;select statements from supabase_migrations.schema_migrations where version='"+version+"';commit;");
 if(existing.length){assert.equal(hash((existing[0].statements||[]).join('\n')),sha256,'Existing migration hash mismatch');log.push({file,sha256,status:'already-applied-hash-verified'});continue;}
 assert.match(original,/^begin;/i);assert.match(original,/commit;\s*$/i);assert.ok(!original.includes('$retail_original$'));
 const sql=original.replace(/^begin;/i,"begin isolation level repeatable read; set local lock_timeout='5s';set local statement_timeout='120s';select pg_advisory_xact_lock(hashtextextended('cometa:retail-release',0));create temporary table retail_before on commit drop as "+fingerprint+';').replace(/commit;\s*$/i,()=>"do $$ begin if (select value from retail_before) is distinct from ("+fingerprint+") then raise exception 'PRESERVATION_CHECK_FAILED';end if;end $$;"+verifyPrices+"insert into supabase_migrations.schema_migrations(version,name,statements) values ('"+version+"','"+file.slice(15,-4)+"',array[$retail_original$"+original+"$retail_original$]);commit;");
 assert.ok(sql.includes('do $$ begin'));
 query(sql);
 const saved=query("begin read only;select statements from supabase_migrations.schema_migrations where version='"+version+"';commit;")[0];assert.equal(hash(saved.statements.join('\n')),sha256);
 log.push({file,sha256,status:'applied',preservation:'transaction-verified',at:new Date().toISOString()});fs.writeFileSync(dir+'/product-discount-applied.json',JSON.stringify({ref,backup:recovery.folder,log},null,2));console.log('Applied, preserved business data, verified ledger hash:',file);
}
const configured=query("begin read only;select brand_slug,product_discounts from pos_retail_rules where product_discounts<>'{}'::jsonb;commit;");
assert.deepEqual(configured,[{brand_slug:'magenta-fitwear',product_discounts:{'4d1afc58-fd94-447c-8619-352969374124':5}}]);
query("notify pgrst,'reload schema';");console.log(JSON.stringify({ref,migrations:log,configured}));
