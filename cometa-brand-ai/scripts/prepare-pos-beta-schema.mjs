// Generates a reviewable SQL plan only. No database driver, credentials or network.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const output='apps/pos-mobile/artifacts/m2-7b/schema';
const all=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
// Conservative foundational prefix plus later POS dependencies; exclude all COMU migrations.
const files=all.filter(f=>f<'20260920100000' || /^202609221[2345]00/.test(f) || /^2026100212[01]000/.test(f));
if(files.some(f=>f.includes('_comu_')) || files.at(-2)!=='20261002120000_pos_device_foundation_v1.sql' || files.at(-1)!=='20261002121000_pos_mutation_api_boundary_v1.sql')throw Error('Unexpected migration chain');
mkdirSync(output,{recursive:true});
const manifest=files.map(file=>({file,sha256:createHash('sha256').update(readFileSync('supabase/migrations/'+file)).digest('hex')}));
writeFileSync(path.join(output,'manifest.json'),JSON.stringify({status:'REVIEW_REQUIRED_NOT_AUTHORIZED',targetProjectRef:null,files:manifest},null,2));
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const lines=[
  "\\set ON_ERROR_STOP on",
  "-- EMPTY BETA ONLY. Independently verify connection/project before execution.",
  "select current_database(), current_user, inet_server_addr();",
  "select set_config('cometa.approved_beta_ref', :'approved_beta_ref', false);",
  "do $$ begin if current_setting('cometa.approved_beta_ref') = 'zhtagqrzyovsrmsicaot' or current_setting('cometa.approved_beta_ref') !~ '^[a-z]{20}$' then raise exception 'Unapproved Beta project'; end if; end $$;",
  "do $$ begin if to_regclass('public.brands') is not null then raise exception 'Expected empty Beta database'; end if; end $$;",
  "create schema if not exists supabase_migrations;",
  "create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);"
];
for(const f of files){
  let sql=readFileSync('supabase/migrations/'+f,'utf8');
  // Files may carry their own transaction; wrap each as one migration + history record.
  sql=sql.replace(/^\s*(?:begin|commit);\s*$/gim,'');
  if(/\\connect|\\!|create\s+subscription/i.test(sql))throw Error('Manual review required for external SQL directives');
  lines.push(`-- ${f}\nbegin;\n${sql}\ninsert into supabase_migrations.schema_migrations(version,name) values (${quote(f.split('_')[0])},${quote(f.slice(15,-4))});\ncommit;`);
}
writeFileSync(path.join(output,'review-only.sql'),lines.join('\n'));
console.log(`Prepared ${files.length} migrations and SHA-256 manifest. REVIEW REQUIRED; nothing applied.`);
