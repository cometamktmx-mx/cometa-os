// Restore test of private backup in a NEW local DB; never prints customer rows.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const folder='.next/release-private-20261011';
for(const name of ['schema.sql','data.sql'])if(fs.statSync(folder+'/'+name).size<1000)throw Error('Incomplete backup');
const source=fs.readFileSync('scripts/test-storefront-m6-local.mjs','utf8');
const prefix=source.slice(0,source.indexOf('const ids='));
const body=`
let created=false;
try {
 const list=JSON.parse((await api('GET','/containers/json')).toString()).filter(c=>c.Names.some(n=>n.startsWith('/supabase_db_')));assert.equal(list.length,1);container=list[0].Id;
 await destination();await exec(['createdb','-U','postgres','--template=template0',database]);created=true;
 await sql('create schema extensions;create extension pgcrypto with schema extensions;create extension "uuid-ossp" with schema extensions;create extension vector with schema public;create extension pg_stat_statements with schema extensions;create extension supabase_vault;');
 await sql(fs.readFileSync('${folder}/schema.sql','utf8'),'supabase_admin');
 await sql('begin;set local session_replication_role=replica;'+fs.readFileSync('${folder}/data.sql','utf8')+';commit;','supabase_admin');
 const summary=await sql("select jsonb_build_object('brands',(select count(*) from brands),'users',(select count(*) from auth.users),'inventory',(select count(*) from pos_inventory),'orders',(select count(*) from comu_orders))");
 fs.writeFileSync('${folder}/restore-evidence.json',JSON.stringify({database,summary,checkedAt:new Date().toISOString(),schemaHash:createHash('sha256').update(fs.readFileSync('${folder}/schema.sql')).digest('hex'),dataHash:createHash('sha256').update(fs.readFileSync('${folder}/data.sql')).digest('hex')}));
 console.log('PASS private backup restore',database,'schema + data; counts recorded privately');
} catch(error){fs.writeFileSync('${folder}/restore-error.private.txt',String(error));throw Error('Backup restore failed; private diagnostic retained');}
finally{if(created){await exec(['dropdb','-U','postgres',database]);console.log('Dropped only',database);}}
`;
const destination=path.resolve(folder+'/restore-'+Date.now()+'.mjs');
fs.writeFileSync(destination,prefix+body);
await import(pathToFileURL(destination).href);
