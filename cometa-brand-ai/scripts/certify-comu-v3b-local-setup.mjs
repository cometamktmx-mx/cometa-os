// Explicit local-only V3A installation and controlled certification attributes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');assert.ok(!process.env.VERCEL);assert.notEqual(process.env.NODE_ENV,'production');
const project='zhtagqrzyovsrmsicaot',container='supabase_db_'+project;
assert.ok(fs.readFileSync('supabase/config.toml','utf8').includes(`project_id = "${project}"`));
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
const dock=(args,input)=>execFileSync(docker,['--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],{input,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
const inspect=JSON.parse(dock(['inspect',container]))[0];assert.ok(inspect.NetworkSettings.Ports['5432/tcp'].some(p=>p.HostPort==='54322'));
const gateway=JSON.parse(dock(['inspect','supabase_kong_'+project]))[0];assert.ok(gateway.NetworkSettings.Ports['8000/tcp'].some(p=>p.HostPort==='54321'));
console.log('CONFIRMED LOCAL Supabase http://127.0.0.1:54321; PostgreSQL 127.0.0.1:54322; Docker '+container);
const sql=query=>dock(['exec','-i','-u','postgres',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'],query).trim();
const rows=query=>JSON.parse(sql(`select coalesce(json_agg(q),'[]') from (${query}) q;`));
const required=['20260928180000','20261002121000','20261003130000','20261003150000'];
const history=rows("select version from supabase_migrations.schema_migrations order by version");for(const version of required)assert.ok(history.some(h=>h.version===version),'Missing dependency '+version);
console.log('DEPENDENCIES',required.join(', '));
const security=()=>({
  grants:rows("select has_table_privilege('authenticated','public.pos_products','INSERT') product_write,has_table_privilege('authenticated','public.pos_inventory','UPDATE') stock_write,has_function_privilege('anon','public.comu_catalog_save_v1(uuid,uuid,jsonb)','EXECUTE') anon_catalog,has_function_privilege('authenticated','public.comu_catalog_save_v1(uuid,uuid,jsonb)','EXECUTE') member_catalog"),
  rls:rows("select relname,relrowsecurity from pg_class where oid in ('public.pos_products'::regclass,'public.pos_product_variants'::regclass,'public.pos_inventory'::regclass,'public.comu_catalog_commands'::regclass) order by relname"),
  constraints:rows("select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid in ('public.pos_products'::regclass,'public.pos_product_variants'::regclass,'public.pos_inventory'::regclass) order by conname"),
  policies:rows("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('pos_products','pos_product_variants','pos_inventory','pos_product_attribute_definitions') order by tablename,policyname")
});
const before=security();assert.deepEqual(before.grants,[{product_write:false,stock_write:false,anon_catalog:false,member_catalog:true}]);
const output='docs/visual-evidence/comu-product-editor-v3b/final-certification';fs.mkdirSync(output,{recursive:true});
const mode=process.argv[2]||'--inspect';
if(mode==='--apply') {
  if(!history.some(h=>h.version==='20261003170000')) {
    const file='20261003170000_comu_shared_variant_contract_v1.sql';
    const body=fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
    sql(`begin; ${body}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values ('20261003170000','comu_shared_variant_contract_v1',array[]::text[]); commit; notify pgrst,'reload schema';`);
    console.log('APPLIED ONLY '+file);
  }else console.log('V3A already installed; no reapplication');
  assert.deepEqual(security(),before,'Security/schema protections must be unchanged');
  const functions=rows("select proname,prosecdef,position('attributeDefinitions' in prosrc)>0 exposes_definitions,position('variantContract' in prosrc)>0 exposes_contract from pg_proc where oid in ('public.comu_catalog_read_v1(uuid)'::regprocedure,'public.comu_catalog_save_v1(uuid,uuid,jsonb)'::regprocedure) order by proname");
  assert.ok(functions.some(f=>f.proname==='comu_catalog_read_v1'&&f.exposes_definitions&&f.exposes_contract));
  fs.writeFileSync(output+'/local-installation.json',JSON.stringify({supabase:'http://127.0.0.1:54321',postgres:'127.0.0.1:54322',project,dependencies:required,applied:'20261003170000',securityBefore:before,securityAfter:security(),functions},null,2));console.log('PASS functions, grants, RLS, constraints and policies preserved');
}
if(mode==='--fixtures') {
  assert.ok(rows("select version from supabase_migrations.schema_migrations where version='20261003170000'").length);
  const fixture=JSON.parse(fs.readFileSync('.env.comu-certification-fixture.json','utf8'));const sid=fixture.users.a.sellerId;assert.match(sid,/^[a-f0-9-]{36}$/i);
  const brand=rows(`select brand_id,brand_slug from public.comu_sellers where id='${sid}'`)[0];assert.ok(brand?.brand_id);
  const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
  for(const [code,name,options,order] of [['color','Color',['Negro','Rosa','Beige'],1],['size','Talla',['CH','M','G','XL'],2]]) {
    const existing=rows(`select id,options from public.pos_product_attribute_definitions where brand_id='${brand.brand_id}' and code='${code}'`);
    if(existing.length){assert.ok(options.every(o=>existing[0].options.includes(o)),'Existing definition differs; do not overwrite');}
    else sql(`insert into public.pos_product_attribute_definitions(brand_id,brand_slug,code,name,input_type,options,sort_order,required,use_in_variant_name,active) values('${brand.brand_id}',${quote(brand.brand_slug)},'${code}',${quote(name)},'select',${quote(JSON.stringify(options))}::jsonb,${order},false,true,true);`);
  }
  console.log('PASS controlled Seller A definitions: Color 3 options; Talla 4 options. No POS membership or entitlement granted.');
}
if(mode==='--inspect')console.log(JSON.stringify({history:history.filter(h=>required.includes(h.version)||h.version==='20261003170000'),security:before},null,2));
