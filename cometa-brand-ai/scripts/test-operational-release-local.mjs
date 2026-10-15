// Reuses the certified M6 fixture suite against the ACTUAL remote schema backup.
// No remote connection or customer data is used by this rehearsal.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const backup = '.next/release-private-20261011/schema.sql';
if (!fs.existsSync(backup) || fs.statSync(backup).size < 100000) throw Error('Remote schema backup required');
const prerequisites = ['20260928180000_comu_buyer_experience_v1.sql','20261002120000_pos_device_foundation_v1.sql','20261002121000_pos_mutation_api_boundary_v1.sql','20261003130000_comu_seller_approval_v1.sql','20261003150000_comu_seller_catalog_v1.sql','20261003170000_comu_shared_variant_contract_v1.sql','20261005120000_comu_order_contract_state_safety_v1.sql','20261005150000_comu_notifications_v1.sql','20261005170000_comu_buyer_order_read_privacy_v1.sql'];
let code = fs.readFileSync('scripts/test-storefront-m6-local.mjs','utf8');
code=code.replace("async function sql(q, dbUser = 'postgres')", "async function sql(q, dbUser = 'postgres', atomic = false)").replace("['psql', '-X', '-q'", "['psql', ...(atomic ? ['--single-transaction'] : []), '-X', '-q'");
const start = code.indexOf(' const dump=');
const end = code.indexOf(' console.log(\'Baseline SHA256\'', start);
if(start < 0 || end < 0) throw Error('Runner structure changed; review required');
code = code.slice(0,start) + ` const dump=fs.readFileSync(${JSON.stringify(backup)},'utf8');
 await sql('alter extension vector set schema public;');
 await sql(dump,'supabase_admin');
 for(const file of ${JSON.stringify(prerequisites)}){await sql(fs.readFileSync('supabase/migrations/'+file,'utf8'),'postgres',file.startsWith('20260928180000'));console.log('Remote-baseline prerequisite PASS',file);}
` + code.slice(end);
code=code.replaceAll("import('./", "import('" + pathToFileURL(path.resolve('scripts')).href + '/');
code=code.replace('}finally{if(created)', `
 await sql(fs.readFileSync('supabase/migrations/20261011180000_comu_seller_release_purchase_boundary.sql','utf8'));
 assert.equal(await sql("select has_function_privilege('authenticated','public.comu_reserve_inventory(uuid,text,text,jsonb)','execute')"),'f');
 assert.equal(await sql("select has_function_privilege('authenticated','public.comu_create_order_from_reservation(uuid,text,jsonb,text)','execute')"),'f');
 assert.equal(await sql("select has_function_privilege('authenticated','public.comu_cancel_order(uuid)','execute')"),'t');
 console.log('PASS seller-only SQL boundary: direct public purchase denied; cancellation retained');
}finally{if(created)`);
const destination=path.resolve('.next/release-private-20261011/rehearsal-'+Date.now()+'.mjs');
fs.writeFileSync(destination,code);
await import(pathToFileURL(destination).href);
