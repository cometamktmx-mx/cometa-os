// Explicit production launch only: reviewed files, fresh restored backup, atomic ledger.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
assert.equal(process.argv[2], '--authorized-launch');
const ref='zhtagqrzyovsrmsicaot',dir='.next/magenta-launch-audit';
const expected=[
 ['20261014120000_pos_imports_v1.sql','d65d64a6242e879b03f94da62f9db83c5d83b08009bcb2fddf2346be08993c1e'],
 ['20261014140000_pos_product_delivery_save.sql','c24559391cc82b69f148e39bc6225be10da4a9f94e3aaf942530bbd5568a9b53'],
 ['20261014160000_store_operations_m7.sql','d429865609ae5db82380e66cf8521952a50c6c37dba2f2ff6022afd485176dbd'],
 ['20261014180000_store_order_presentation_m8.sql','4e89f219cf835d73e37ac6215ed9ec34156d89c4ac7500f14517355d39f91101'],
 ['20261014200000_store_payment_accounts_m9.sql','35d61b823cb171cc7d321c1bfa2b065ce0dda893032ffc1c36dafcd408336cbd'],
];
const recovery=JSON.parse(fs.readFileSync(dir+'/recovery-result.json','utf8'));
assert.equal(recovery.result,'PASS');assert.equal(recovery.sourceRef,ref);
assert.ok(Date.now()-Date.parse(recovery.at)<7200000,'Fresh recovery required');
const proof=JSON.parse(fs.readFileSync(recovery.folder+'/proof.private.json','utf8'));
assert.ok(proof.databaseSnapshot?.singleSnapshot);assert.equal(proof.storageVerified,proof.storageHttpVerified);
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(fs.readFileSync(recovery.folder+'/'+proof.databaseSnapshot.file)),proof.databaseSnapshot.sha256);
for(const [file,sha] of expected)assert.equal(hash(fs.readFileSync('supabase/migrations/'+file)),sha);
function query(sql){
 const file=dir+'/launch-query.sql';fs.writeFileSync(file,sql);
 try{return JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--project-ref',ref,'--file',file,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:20000000})).rows;}
 catch(e){fs.writeFileSync(recovery.folder+'/migration-error.private.txt',String(e.stderr??''),{mode:0o600});throw Error('MIGRATION_QUERY_FAILED_PRIVATE_DIAGNOSTIC');}
}
const identity=query("begin read only;select id,slug from public.brands where id='70880b54-b6fe-4775-bb39-c9ff19c47c39';commit;");assert.equal(identity[0]?.slug,'magenta-fitwear');
const fingerprint="select jsonb_build_object('brands',(select md5(string_agg(to_jsonb(t)::text,'' order by id)) from public.brands t),'users',(select md5(string_agg(to_jsonb(t)::text,'' order by id)) from auth.users t),'access',(select md5(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text)) from public.user_brand_access t),'products',(select md5(string_agg(to_jsonb(t)::text,'' order by id)) from public.pos_products t),'inventory',(select md5(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text)) from public.pos_inventory t)) as fingerprint;";
const before=query('begin read only;'+fingerprint+'commit;')[0];
const ledger=query('begin read only;select version from supabase_migrations.schema_migrations;commit;').map(r=>r.version);
const log=[];
for(const [file,sha256] of expected){
 const version=file.split('_')[0],name=file.slice(15,-4);
 if(ledger.includes(version)){console.log('Already registered; skipped',file);continue;}
 let sql=fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^\uFEFF/,'');
 assert.match(sql,/^begin;/i);assert.match(sql,/commit;\s*$/i);
 sql=sql.replace(/commit;\s*$/i,`insert into supabase_migrations.schema_migrations(version,name) values ('${version}','${name}');\ncommit;`);
 query(sql);
 assert.equal(query(`begin read only;select version from supabase_migrations.schema_migrations where version='${version}';commit;`)[0]?.version,version);
 log.push({file,sha256,at:new Date().toISOString()});fs.writeFileSync(dir+'/production-migrations.json',JSON.stringify({ref,backup:recovery.folder,applied:log},null,2));console.log('Applied and atomically registered',file);
}
const after=query('begin read only;'+fingerprint+'commit;')[0];
fs.writeFileSync(dir+'/production-preservation.json',JSON.stringify({before,after,unchanged:JSON.stringify(before)===JSON.stringify(after)},null,2));
assert.deepEqual(after,before,'Concurrent changes or unexpected mutation: inspect before continuing');
query("notify pgrst,'reload schema';");console.log('PASS existing brands/users/access/products/inventory unchanged');
