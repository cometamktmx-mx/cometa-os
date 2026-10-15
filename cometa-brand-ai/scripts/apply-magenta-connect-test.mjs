import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const ref='ephmrsjnpkcgddulvckj',file='20261014200000_store_payment_accounts_m9.sql',dir=path.resolve('.next/magenta-functional',ref);
const cli=args=>JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20000000}));
const project=cli(['projects','list']).find(p=>p.id===ref);assert.equal(project.name,'magenta-preview-test');assert.equal(project.status,'ACTIVE_HEALTHY');
if(!process.argv.includes('--apply')){console.log('PLAN ONLY: M9 exclusively on magenta-preview-test');process.exit(0);}
const fingerprint="md5(jsonb_build_object('items',(select jsonb_agg(to_jsonb(x) order by id) from store_order_items x),'orders',(select jsonb_agg(to_jsonb(x) order by id) from store_orders x),'inventory',(select jsonb_agg(to_jsonb(x) order by id) from pos_inventory x),'configuration',(select jsonb_agg(to_jsonb(x) order by brand_id) from store_checkout_configuration x))::text)";
const source=fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^begin;/,'').replace(/commit;\s*$/,'');
const sql=`begin;create temporary table magenta_m9_before as select ${fingerprint} as hash;\n${source}\ninsert into supabase_migrations.schema_migrations(version,name) values('20261014200000','store_payment_accounts_m9');\ndo $$begin if (select hash from magenta_m9_before) is distinct from (select ${fingerprint}) then raise exception 'CONNECT_MIGRATION_CHANGED_EXISTING_DATA';end if;end $$;commit;`;
const target=path.join(dir,'m9-apply.sql');fs.writeFileSync(target,sql);cli(['db','query','--linked','--project-ref',ref,'--file',target]);
console.log('PASS M9 applied only to verified test backend; historical orders, snapshots, inventory and checkout destination unchanged.');
