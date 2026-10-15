// Read-only production metadata audit. Never applies migrations, copies rows or reads API keys.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const ref='zhtagqrzyovsrmsicaot',dir=path.resolve('.next/magenta-launch-audit');fs.mkdirSync(dir,{recursive:true});
const cli=args=>JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20000000}));
const project=cli(['projects','list']).find(p=>p.id===ref);assert.ok(project);assert.equal(project.status,'ACTIVE_HEALTHY');
async function query(sql){assert.ok(sql.startsWith('begin read only;'));const file=path.join(dir,'readonly.sql');fs.writeFileSync(file,sql);return cli(['db','query','--linked','--project-ref',ref,'--file',file]).rows;}
const migrations=await query('begin read only; select version,name from supabase_migrations.schema_migrations order by version; commit;');
const metadata=await query("begin read only; select jsonb_build_object('brand',(select jsonb_agg(jsonb_build_object('id',id,'slug',slug,'status',status)) from brands where slug in ('magenta-fitwear','magenta-fit-wear')),'tables',(select jsonb_agg(tablename order by tablename) from pg_tables where schemaname='public'),'extensions',(select jsonb_agg(extname order by extname) from pg_extension),'storage',(select jsonb_agg(jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)) from storage.buckets where id='pos-products'),'cronAvailable',to_regclass('cron.job') is not null) as audit; commit;");
const applied=new Set(migrations.map(m=>m.version)),files=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
const pending=files.filter(f=>!applied.has(f.split('_')[0])).map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync('supabase/migrations/'+file)).digest('hex')}));
const report={at:new Date().toISOString(),project:{ref,name:project.name,status:project.status},mode:'READ_ONLY',migrations,metadata:metadata[0]?.audit,pending};
fs.writeFileSync(path.join(dir,'audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({project:report.project,mode:report.mode,remoteMigrationCount:migrations.length,pending,brand:report.metadata.brand,storage:report.metadata.storage,cronAvailable:report.metadata.cronAvailable},null,2));
