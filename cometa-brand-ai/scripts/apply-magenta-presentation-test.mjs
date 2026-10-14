import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const ref='ephmrsjnpkcgddulvckj',file='20261014180000_store_order_presentation_m8.sql',dir=path.resolve('.next/magenta-functional',ref);
const cli=args=>JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20000000}));
const project=cli(['projects','list']).find(p=>p.id===ref);assert.equal(project.name,'magenta-preview-test');assert.equal(project.status,'ACTIVE_HEALTHY');
if(!process.argv.includes('--apply')){console.log('PLAN ONLY: M8 to verified dedicated test backend');process.exit(0);}
const fingerprint="md5(jsonb_build_object('items',(select jsonb_agg(to_jsonb(x) order by id) from store_order_items x),'orders',(select jsonb_agg(to_jsonb(x) order by id) from store_orders x),'inventory',(select jsonb_agg(to_jsonb(x) order by id) from pos_inventory x),'effects',(select jsonb_agg(to_jsonb(x) order by order_id,variant_id,effect) from store_order_inventory_effects x))::text)";
const source=fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^begin;/,'').replace(/commit;\s*$/,'');
const sql=`begin;create temporary table magenta_m8_before as select ${fingerprint} as hash;\n${source}\ninsert into supabase_migrations.schema_migrations(version,name) values('20261014180000','store_order_presentation_m8');\ndo $$begin if (select hash from magenta_m8_before) is distinct from (select ${fingerprint}) then raise exception 'PRESENTATION_MIGRATION_CHANGED_HISTORY';end if;end $$;select 'M8 applied; historical orders/items and inventory unchanged' as verification;commit;`;
const target=path.join(dir,'m8-apply.sql');fs.writeFileSync(target,sql);
cli(['db','query','--linked','--project-ref',ref,'--file',target]);
console.log('PASS M8 applied only to magenta-preview-test; historical orders, item snapshots, inventory and effects unchanged (transactional fingerprint).');
