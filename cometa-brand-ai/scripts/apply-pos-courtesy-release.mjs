import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
assert.equal(process.argv[2],'--authorized-courtesy-release');
const dir='.next/release-private-20261011',file='supabase/migrations/20261012180000_pos_complimentary_workspace_v1.sql';
const evidence=JSON.parse(fs.readFileSync(dir+'/courtesy-sql-pass.json','utf8'));
assert.equal(evidence.hash,createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
const cli=path.resolve('node_modules/@supabase/cli-windows-x64/bin/supabase.exe');
function query(args){return JSON.parse(execFileSync(cli,['db','query','--linked','--project-ref','zhtagqrzyovsrmsicaot',...args],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']}));}
if(process.argv[3]==='--domain-conflict-fix'){
 const fix='supabase/migrations/20261012181000_pos_courtesy_domain_conflict_v1.sql';
 assert.equal(JSON.parse(fs.readFileSync(dir+'/courtesy-fix-pass.json','utf8')).hash,createHash('sha256').update(fs.readFileSync(fix)).digest('hex'));
 const pre=query(["begin read only; select current_database() db,pg_get_functiondef('public.pos_manage_complimentary_v1(text,uuid,uuid,text,text,timestamptz,text)'::regprocedure) definition,exists(select 1 from supabase_migrations.schema_migrations where version='20261012181000') installed;commit;"]).rows[0];assert.equal(pre.db,'postgres');assert.equal(pre.installed,false);
 fs.writeFileSync(dir+'/courtesy-rpc-before-fix.json',JSON.stringify(pre));
 query(['--file',path.resolve(fix)]);query(["insert into supabase_migrations.schema_migrations(version,name) values('20261012181000','pos_courtesy_domain_conflict_v1');notify pgrst,'reload schema';"]);
 console.log('PASS domain conflict fix applied separately; no grants modified');process.exit(0);
}
const before=query(["begin read only; select current_database() db,pg_get_functiondef('public.pos_get_effective_commercial_access(text)'::regprocedure) resolver,(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from pos_commercial_grants g) grants,(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from pos_subscriptions s) subscriptions,exists(select 1 from supabase_migrations.schema_migrations where version='20261012180000') installed;commit;"]).rows[0];
assert.equal(before.db,'postgres');assert.equal(before.installed,false);
fs.writeFileSync(dir+'/courtesy-before-remote-'+Date.now()+'.json',JSON.stringify(before,null,2),{flag:'wx'});
// Fail if the canonical resolver drifted beyond formatting/ownership since the backed-up baseline.
const migration=fs.readFileSync(file,'utf8');
const expected=migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION "public"."pos_get_effective_commercial_access"'));
const functionBody=source=>{const s=source.replace(/\r/g,'');return s.slice(s.indexOf('DECLARE'),s.indexOf('END\n',s.indexOf('DECLARE'))+3).replace(/\s+/g,' ');};
assert.equal(functionBody(before.resolver),functionBody(expected).replace(' AND isfinite(v_grant.ends_at)',''));
query(['--file',path.resolve(file)]);
query(["insert into supabase_migrations.schema_migrations(version,name) values('20261012180000','pos_complimentary_workspace_v1');notify pgrst,'reload schema';"]);
const after=query(["begin read only; select (select coalesce(jsonb_agg(to_jsonb(g)),'[]') from pos_commercial_grants g) grants,(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from pos_subscriptions s) subscriptions;commit;"]).rows[0];
assert.deepEqual(after.grants,before.grants);assert.deepEqual(after.subscriptions,before.subscriptions);
console.log('PASS original migration applied + ledger; grants/subscriptions unchanged; rollback resolver backup retained privately');
