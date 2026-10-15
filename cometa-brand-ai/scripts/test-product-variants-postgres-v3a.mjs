// Execute the real C1 + C2 migrations in a disposable LOCAL schema, never public/remote.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
const helperScope={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/pos/product-variants.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,helperScope);
const shared=helperScope.exports;
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
const host='npipe:////./pipe/dockerDesktopLinuxEngine';
const dock=(args,input)=>execFileSync(docker,['--host',host,...args],{input,encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true});
const containers=dock(['ps','--format','{{.Names}}']).trim().split(/\r?\n/).filter(x=>x.startsWith('supabase_db_'));
assert.equal(containers.length,1); const container=containers[0];
const database='comu_v3a_'+Date.now();assert.match(database,/^comu_v3a_[0-9]+$/);
dock(['exec','-u','postgres',container,'createdb','-U','postgres','--template=template0',database]);
console.log('ISOLATED LOCAL TARGET 127.0.0.1:54322 / '+database+'; no main database writes');
const wire = fs.readFileSync('scripts/test-comu-postgres-concurrency-v1.mjs', 'utf8');
const context = { net, crypto, Buffer, console, process: { env: {COMU_PG_DATABASE:database} }, PgWire: null };
vm.runInNewContext(wire.slice(wire.indexOf('const cfg ='), wire.indexOf('const sqlQuote =')).replace('crypto.createHmac("sha256", salted).update("Server Key").digest("base64")', 'crypto.createHmac("sha256", crypto.createHmac("sha256", salted).update("Server Key").digest()).update(authMessage).digest("base64")').replace('console.warn("SCRAM server signature differed; continuing to let PostgreSQL report authentication status.")', '(() => { throw new Error("LOCAL_SCRAM_SIGNATURE_INVALID"); })()') + '\nthis.PgWire = PgWire;', context);
const db = await new context.PgWire().connect();
const other = await new context.PgWire().connect();
const schema = 'comu_c2_test_' + crypto.randomUUID().replaceAll('-', '');
assert.match(schema, /^comu_c2_test_[a-f0-9]{32}$/);
const admin = crypto.randomUUID(), sellerA = crypto.randomUUID(), sellerB = crypto.randomUUID(), rejected = crypto.randomUUID();
const appA = crypto.randomUUID(), appB = crypto.randomUUID(), appR = crypto.randomUUID();
async function query(connection, sql) {
  try { return await connection.query(sql); }
  catch (error) { while ((await connection.next()).type !== 'Z') {} throw error; }
}
const q = sql => query(db, sql);
const as = async (user, connection = db) => query(connection, `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`);
const rpc = (app, decision = 'APPROVED', brand = null) => `select ${schema}.comu_review_seller_application_v1('${app}','${decision}','Test decision',${brand ? `'${brand}'` : 'null'}) as result`;
const translated = source => source.replaceAll('public.', schema + '.').replaceAll('search_path=public', 'search_path=' + schema)
  .replaceAll('auth.users', schema + '.auth_users').replaceAll('auth.uid()', schema + '.uid()');
const denied = async (sql, pattern = /permission denied|COMU_ADMIN_REQUIRED|COMU_SELF_APPROVAL_DENIED|row-level security/) => assert.rejects(q(sql), pattern);
let created = false;
try {
  await q(`create schema ${schema}; grant usage on schema ${schema} to authenticated,service_role;`); created = true;
  await q(`
    create table ${schema}.auth_users(id uuid primary key,email text);
    create table ${schema}.user_profiles(user_id uuid unique,email text,role text,status text);
    create table ${schema}.brands(id uuid primary key default gen_random_uuid(),slug text unique,name text,status text default 'active',created_by uuid);
    create table ${schema}.user_brand_access(user_id uuid,brand_slug text,status text,access_role text);
    create function ${schema}.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function ${schema}.is_cometa_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from ${schema}.user_profiles where user_id=${schema}.uid() and role='admin' and status='active') $$;
    create table ${schema}.comu_seller_applications(id uuid primary key default gen_random_uuid(),user_id uuid unique references ${schema}.auth_users(id),contact_name text,business_name text,email text,phone text,city text,business_type text,status text default 'PENDING',created_at timestamptz default now(),updated_at timestamptz default now());
    alter table ${schema}.comu_seller_applications enable row level security;
    create policy comu_application_admin on ${schema}.comu_seller_applications for update to authenticated using(${schema}.is_cometa_admin());
    create policy comu_application_insert on ${schema}.comu_seller_applications for insert to authenticated with check(user_id=${schema}.uid() and status='PENDING');
    create policy application_read on ${schema}.comu_seller_applications for select to authenticated using(user_id=${schema}.uid() or ${schema}.is_cometa_admin());
  `);

  const baseline=fs.readFileSync('supabase/migrations/20260828233603_remote_schema.sql','utf8');
  for(const name of ['pos_products','pos_product_variants','pos_inventory','pos_inventory_movements','pos_locations','pos_categories']) {
    const start=baseline.indexOf('CREATE TABLE IF NOT EXISTS "public"."'+name+'"');
    const ddl=baseline.slice(start,baseline.indexOf('\n);',start)+3).replaceAll('"public".',schema+'.');
    await q(ddl); await q('alter table '+schema+'.'+name+' add primary key(id); alter table '+schema+'.'+name+' enable row level security');
  }
  for(const name of ['pos_product_attribute_definitions','pos_business_profiles','pos_business_capabilities','pos_units']) {
    const start=baseline.indexOf('CREATE TABLE IF NOT EXISTS "public"."'+name+'"');
    assert.ok(start>=0); await q(baseline.slice(start,baseline.indexOf('\n);',start)+3).replaceAll('"public".',schema+'.'));
  }
  for(const name of ['pos_normalize_variant_attributes_v1','pos_product_variants_set_signature_v1','pos_create_product_v2','pos_update_product_v2']) {
    let offset=0;
    while(true){const start=baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."'+name+'"',offset);if(start<0)break;const end=baseline.indexOf('ALTER FUNCTION',start);await q(baseline.slice(start,end).replaceAll('"public".',schema+'.').replaceAll('public.',schema+'.'));offset=end;}
  }
  // Reproduce the M1 mutation execution boundary, only for these isolated POS RPCs.
  await q(`do $$ declare f record; begin for f in select p.oid::regprocedure identity from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='${schema}' and p.proname in ('pos_create_product_v2','pos_update_product_v2') loop execute format('revoke execute on function %s from public, authenticated',f.identity); end loop; end $$`);
  const sigStart=baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."pos_variant_signature_v1"');
  await q(baseline.slice(sigStart,baseline.indexOf('ALTER FUNCTION',sigStart)).replaceAll('"public".',schema+'.').replaceAll('public.',schema+'.'));
  await q('alter table '+schema+'.pos_inventory add unique(location_id,variant_id); alter table '+schema+'.pos_inventory add check(reserved_quantity<=quantity); create unique index variant_signature_unique on '+schema+'.pos_product_variants(product_id,variant_signature)');
  for (const file of ['20260920100000_comu_foundation_sellers.sql','20260920101000_comu_storefronts.sql','20260920102000_comu_catalog_listings.sql','20260920103000_comu_product_media.sql']) {
    await q(translated(fs.readFileSync('supabase/migrations/' + file, 'utf8')));
  }
  await q(`create table ${schema}.comu_seller_payment_accounts(seller_id uuid,stripe_account_id text,onboarding_status text,transfers_enabled boolean,payouts_enabled boolean,financial_suspended boolean);
    grant select,insert,update,delete on all tables in schema ${schema} to authenticated,service_role;
    insert into ${schema}.auth_users values('${admin}','admin@example.test'),('${sellerA}','a@example.test'),('${sellerB}','b@example.test'),('${rejected}','r@example.test');
    insert into ${schema}.user_profiles values('${admin}','admin@example.test','admin','active');`);
  // Legacy fixture before migration: no fabricated approval provenance.
  const legacy = crypto.randomUUID();
  await q(`insert into ${schema}.comu_sellers(id,brand_id,brand_slug,public_name,slug,status,verification_status) values('${legacy}','legacy','legacy','Legacy','legacy','ACTIVE','VERIFIED');
    insert into ${schema}.comu_storefronts(seller_id,name,slug,status) values('${legacy}','Legacy','legacy','ACTIVE');
    insert into ${schema}.comu_seller_memberships(seller_id,user_id,role) values('${legacy}','${sellerB}','OWNER');`);
  await q(translated(fs.readFileSync('supabase/migrations/20261003130000_comu_seller_approval_v1.sql','utf8')));

  const legacyProduct=crypto.randomUUID(),legacyVariant=crypto.randomUUID(),legacyLocation=crypto.randomUUID();
  await q(`insert into ${schema}.pos_products(id,brand_id,brand_slug,name) values('${legacyProduct}','legacy','legacy','Legacy product');
    insert into ${schema}.pos_product_variants(id,brand_id,brand_slug,product_id,name,price,variant_signature) values('${legacyVariant}','legacy','legacy','${legacyProduct}','Original',90,${schema}.pos_variant_signature_v1('{}'));
    insert into ${schema}.pos_locations(id,brand_id,brand_slug,name,code) values('${legacyLocation}','legacy','legacy','Original location','ORIGINAL');
    insert into ${schema}.pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity,reserved_quantity) values('legacy','legacy','${legacyLocation}','${legacyVariant}',7,2)`);
  const legacySql=`select jsonb_build_object('product',(select to_jsonb(p) from ${schema}.pos_products p where id='${legacyProduct}'),'variant',(select to_jsonb(v) from ${schema}.pos_product_variants v where id='${legacyVariant}'),'stock',(select to_jsonb(i) from ${schema}.pos_inventory i where variant_id='${legacyVariant}')) as result`;
  const legacyOriginal=(await q(legacySql))[0].result;
  await q(translated(fs.readFileSync('supabase/migrations/20261003150000_comu_seller_catalog_v1.sql','utf8')));
  await q(translated(fs.readFileSync('supabase/migrations/20261003170000_comu_shared_variant_contract_v1.sql','utf8')));
  await q('create trigger variant_signature before insert or update on '+schema+'.pos_product_variants for each row execute function '+schema+'.pos_product_variants_set_signature_v1()');
  await q(`create unique index sku_unique on ${schema}.pos_product_variants(brand_slug,lower(btrim(sku))) where sku is not null and btrim(sku)<>''; create unique index code_unique on ${schema}.pos_products(brand_slug,lower(btrim(product_code))) where product_code is not null and btrim(product_code)<>''`);
  assert.equal((await q(legacySql))[0].result,legacyOriginal);
  // Same table write boundary as M1; no grants are restored by C2.
  await q('revoke insert,update,delete on '+schema+'.pos_products,'+schema+'.pos_product_variants,'+schema+'.pos_inventory from authenticated');
  for (const [user, application] of [[sellerA,appA],[sellerB,appB],[rejected,appR]]) {
    await as(user); await q(`insert into ${schema}.comu_seller_applications(id,user_id,business_name) values('${application}','${user}','C2 shop')`);
  }
  await as(admin); const approved=JSON.parse((await q(rpc(appA)))[0].result); const b=JSON.parse((await q(rpc(appB)))[0].result); await q(rpc(appR,'REJECTED'));
  const sid=approved.seller_id;
  await q('reset role');
  for(const seller of [approved,b]) { const brand=(await q(`select brand_id,brand_slug from ${schema}.comu_sellers where id='${seller.seller_id}'`))[0]; for(const [code,sort] of [['size',2],['color',1]]) await q(`insert into ${schema}.pos_product_attribute_definitions(brand_id,brand_slug,code,name,sort_order) values('${brand.brand_id}','${brand.brand_slug}','${code}','${code}',${sort})`); }

  const quote=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
  const readSql=id=>`select ${schema}.comu_catalog_read_v1('${id}') as result`;
  const saveSql=(id,payload,key=crypto.randomUUID())=>`select ${schema}.comu_catalog_save_v1('${id}','${key}',${quote(payload)}) as result`;
  const read=async()=>JSON.parse((await q(readSql(sid)))[0].result);
  const base=name=>({name,description:'Catalog fixture',categoryName:'Clothing',variants:[{name:'M / Blue',price:100,sku:name,attributes:{size:'M',color:'blue'}}]});
  await as(sellerA); assert.equal((await read()).products.length,0);
  await denied(`insert into ${schema}.pos_products(brand_id,brand_slug,name) values('x','x','Bypass')`,/permission denied/);
  await denied(`update ${schema}.pos_inventory set quantity=999`,/permission denied/);
  await denied(readSql(b.seller_id),/COMU_CATALOG_DENIED/);
  const first=base('Product-1'); first.variants[0].stock=[{quantity:5,expectedQuantity:0}];
  const key=crypto.randomUUID(); const firstSql=saveSql(sid,first,key);
  await as(sellerA,other);
  const concurrentRetry=await Promise.all([q(firstSql),query(other,firstSql)]);
  const saved=JSON.parse(concurrentRetry[0][0].result); assert.equal(JSON.parse(concurrentRetry[1][0].result).productId,saved.productId); await q(firstSql);
  assert.equal((await read()).products.length,1);
  await denied(saveSql(sid,{...first,name:'different'},key),/COMU_IDEMPOTENCY_CONFLICT/);
  let snap=await read(); const pid=saved.productId,vid=snap.variants[0].id,loc=snap.locations[0].id;
  assert.equal(snap.variants[0].is_default,true); assert.equal(snap.variants[0].unit_code,'piece');
  assert.equal(snap.listings[0].status,'DRAFT'); assert.equal(snap.progress.publishedListings,0);
  const edit=async(amount,expected)=>{const state=await read(); const p=state.products.find(p=>p.id===pid);return {...base('Product-1'),id:pid,expectedUpdatedAt:p.updated_at,variants:[{...first.variants[0],id:vid,stock:amount===undefined?[]:[{locationId:loc,quantity:amount,expectedQuantity:expected}]}]};};
  let change=await edit(); change.variants.push({name:'L / Blue',price:125,sku:'Product-1-L',attributes:{size:'L',color:'blue'}});
  await q(saveSql(sid,change)); assert.equal((await read()).variants.length,2);
  const foreignStock=await edit(100,0); foreignStock.variants[0].stock[0].locationId=legacyLocation;
  await denied(saveSql(sid,foreignStock),/COMU_LOCATION_DENIED/);
  const foreignVariant=await edit(); foreignVariant.variants[0].id=legacyVariant;
  await denied(saveSql(sid,foreignVariant),/COMU_VARIANT_DENIED/);
  const invalidPrice=await edit(); invalidPrice.variants[0].price=-1;
  await denied(saveSql(sid,invalidPrice),/COMU_VARIANTS_INVALID/);
  assert.equal((await read()).products.length,1,'Failed transaction rolls back all partial writes');
  await as(sellerB); await denied(saveSql(b.seller_id,{...change,id:pid}),/COMU_PRODUCT_DENIED/); await denied(saveSql(sid,change),/COMU_CATALOG_DENIED/);
  await as(rejected); await denied(saveSql(sid,first),/COMU_CATALOG_DENIED/);
  await q('reset role'); const buyer=crypto.randomUUID(); await q(`insert into ${schema}.auth_users values('${buyer}','buyer@example.test'); insert into ${schema}.user_profiles values('${buyer}','buyer@example.test','client','active')`);
  await as(buyer); await denied(saveSql(sid,first),/COMU_CATALOG_DENIED/);
  await as(sellerA);
  // Same pre-edit version on two connections: exactly one administrative edit succeeds.
  change=await edit(4,5); await as(sellerA,other);
  let races=await Promise.allSettled([q(saveSql(sid,change)),query(other,saveSql(sid,{...change,name:'Concurrent'}))]);
  assert.equal(races.filter(r=>r.status==='fulfilled').length,1); assert.match(String(races.find(r=>r.status==='rejected').reason),/COMU_CATALOG_STALE/);
  snap=await read(); assert.equal(Number(snap.inventory[0].quantity),4);
  // Complete C1+C2: publish ten; Connect is an explicitly simulated local condition.
  await q(`update ${schema}.comu_product_listings set status='PUBLISHED' where id='${saved.listingId}'`);
  for(let i=2;i<=10;i++){const r=JSON.parse((await q(saveSql(sid,base('Product-'+i))))[0].result);await q(`update ${schema}.comu_product_listings set status='PUBLISHED' where id='${r.listingId}'`);}
  await q(`update ${schema}.comu_storefronts set description='Configured' where seller_id='${sid}'`);
  snap=await read(); assert.equal(snap.progress.publishedListings,10);assert.equal(snap.progress.reason,'COMU_CONNECT_REQUIRED');
  await q('reset role'); await q(`insert into ${schema}.comu_seller_payment_accounts values('${sid}','acct_fixture_only','COMPLETE',true,true,false)`);
  await as(sellerA); assert.equal((await read()).progress.ok,true);
  assert.equal((await q(`select status from ${schema}.comu_sellers where id='${sid}'`))[0].status,'PREPARING');
  await denied(`select ${schema}.comu_admin_seller_state_v1('${sid}','activate')`);
  await as(admin); assert.equal(JSON.parse((await q(`select ${schema}.comu_admin_seller_state_v1('${sid}','activate') as result`))[0].result).ok,true);
  await q('reset role');
  assert.equal((await q(`select count(*) n from ${schema}.user_brand_access`))[0].n,'0');
  // Load real reservation definitions, including the latest wholesale snapshot contract.
  await q(`create table ${schema}.comu_buyers(id uuid primary key,user_id uuid); insert into ${schema}.comu_buyers values('${buyer}','${buyer}')`);
  await q(translated(fs.readFileSync('supabase/migrations/20260920111000_comu_inventory_reservations.sql','utf8')).replaceAll('search_path = public','search_path = '+schema));
  await q(`alter table ${schema}.comu_inventory_reservation_items add column pricing_snapshot jsonb`);
  const wholesale=fs.readFileSync('supabase/migrations/20260923120000_comu_wholesale_core_v1.sql','utf8');
  await q(`create table ${schema}.comu_cart_items(id uuid primary key)`);
  await q(translated(wholesale.slice(0,wholesale.indexOf('-- Preserve pricing at reservation time'))));
  await q(`grant select,insert,update,delete on ${schema}.comu_wholesale_tiers,${schema}.comu_storefront_wholesale_policies,${schema}.comu_product_wholesale_overrides to authenticated`);
  // Existing wholesale API writes overrides server-side after requireSellerAccess.
  await q(`insert into ${schema}.comu_product_wholesale_overrides(listing_id,mode) values('${saved.listingId}','CUSTOM')`);
  await as(sellerA); const sf=(await read()).listings[0].storefront_id;
  await q(`insert into ${schema}.comu_storefront_wholesale_policies(storefront_id,enabled,minimum_quantity) values('${sf}',true,6);
    insert into ${schema}.comu_wholesale_tiers(storefront_id,product_id,min_quantity,pricing_mode,value) values('${sf}','${pid}',6,'UNIT_PRICE',80)`);
  assert.equal(Number((await q(`select value from ${schema}.comu_wholesale_tiers where product_id='${pid}'`))[0].value),80);
  await as(sellerB); assert.equal((await q(`select * from ${schema}.comu_wholesale_tiers where product_id='${pid}'`)).length,0);
  await q('reset role');
  const start=wholesale.indexOf('create or replace function public.comu_reserve_inventory(');
  await q(translated(wholesale.slice(start,wholesale.indexOf('revoke all on function public.comu_reserve_inventory',start))));
  const vl=(await q(`select id from ${schema}.comu_variant_listings where listing_id='${saved.listingId}' and variant_id='${vid}'`))[0].id;
  const reserve=key=>`select ${schema}.comu_reserve_inventory('${buyer}','fixture','${key}',${quote([{seller_id:sid,listing_id:saved.listingId,variant_listing_id:vl,variant_id:vid,location_id:loc,quantity:1}])})`;
  await as(sellerA); await q(saveSql(sid,await edit(1,4)));
  // Reservation wins the row lock; stock reduction cannot remove the last reserved unit.
  await as(buyer,other); await query(other,'begin'); await query(other,reserve('last-unit'));
  change=await edit(0,1); const blocked=q(saveSql(sid,change));
  await query(other,'commit'); await assert.rejects(blocked,/COMU_STOCK_RESERVED/);
  snap=await read(); assert.equal(Number(snap.inventory[0].quantity),1); assert.equal(Number(snap.inventory[0].reserved_quantity),1);
  await as(buyer,other); await assert.rejects(query(other,reserve('oversell')),/COMU_INSUFFICIENT_STOCK/);
  await query(other,reserve('last-unit')); // reservation retry is also idempotent
  // An administrative addition preserves the existing reservation.
  await q(saveSql(sid,await edit(2,1))); snap=await read(); assert.equal(Number(snap.inventory[0].reserved_quantity),1);
  // Two buyers race for the final available unit: exactly one succeeds.
  await as(buyer); races=await Promise.allSettled([q(reserve('race-a')),query(other,reserve('race-b'))]);
  assert.equal(races.filter(r=>r.status==='fulfilled').length,1);
  await as(sellerA); snap=await read(); assert.equal(Number(snap.inventory[0].quantity)-Number(snap.inventory[0].reserved_quantity),0);
  // Media metadata: own path accepted, foreign path rejected by SQL even directly.
  const mediaPath=`comu/${sid}/${saved.listingId}/${crypto.randomUUID()}.png`;
  await q(`insert into ${schema}.comu_product_media(listing_id,storage_path,public_url) values('${saved.listingId}','${mediaPath}','https://local.test/storage/v1/object/public/comu-products/${mediaPath}')`);
  await denied(`insert into ${schema}.comu_product_media(listing_id,storage_path,public_url) values('${saved.listingId}','comu/${b.seller_id}/foreign.png','https://local.test/foreign.png')`,/COMU_MEDIA_OWNERSHIP_REQUIRED/);
  await denied(`insert into ${schema}.comu_product_media(listing_id,variant_id,storage_path,public_url) values('${saved.listingId}','${legacyVariant}','${mediaPath}','https://local.test/storage/v1/object/public/comu-products/${mediaPath}')`,/COMU_MEDIA_VARIANT_DENIED/);
  await q('reset role');
  assert.equal((await q(`select count(*) n from ${schema}.pos_inventory_movements where reference_type='comu_catalog'`))[0].n,'4');
  await q(`insert into ${schema}.user_profiles values('${sellerB}','b@example.test','client','active') on conflict do nothing`);
  assert.equal((await q(legacySql))[0].result,legacyOriginal,'C2 and new seller operations leave every legacy field intact');
  await as(sellerB); const legacyBefore=JSON.parse((await q(readSql(legacy)))[0].result);
  assert.equal(legacyBefore.products.length,1); assert.equal(legacyBefore.variants[0].id,legacyVariant); assert.equal(Number(legacyBefore.inventory[0].quantity),7);
  await q(saveSql(legacy,{name:'Legacy edited',id:legacyProduct,expectedUpdatedAt:legacyBefore.products[0].updated_at,variants:[{id:legacyVariant,name:'Original',price:95,attributes:{}}]}));
  const legacyAfter=JSON.parse((await q(readSql(legacy)))[0].result);assert.equal(legacyAfter.products[0].id,legacyProduct);assert.equal(legacyAfter.variants[0].id,legacyVariant);assert.equal(Number(legacyAfter.variants[0].price),95);assert.deepEqual(legacyAfter.inventory,legacyBefore.inventory);
  assert.equal((await q(`select status,approval_origin from ${schema}.comu_sellers where id='${legacy}'`))[0].status,'ACTIVE');
  // Real V3A contract checks, using scoped authenticated RPCs, never direct seller writes.
  await as(sellerA);
  const makeEdit=async(productId)=>{
    const state=await read(), p=state.products.find(x=>x.id===productId);
    return {id:p.id,name:p.name,productCode:p.product_code,expectedUpdatedAt:p.updated_at,
      variants:state.variants.filter(v=>v.product_id===p.id).map(v=>({id:v.id,name:v.name,sku:v.sku,price:v.price,attributes:v.attributes,active:v.active}))};
  };
  await q(saveSql(sid,{...base('SKU80'),productCode:' new-01 ',variants:[{...base('x').variants[0],sku:'S'.repeat(80)}]}));
  let v3state=await read();assert.equal(v3state.products.find(p=>p.name==='SKU80').product_code,'NEW-01');
  await denied(saveSql(sid,{...base('too-long'),variants:[{...base('x').variants[0],sku:'S'.repeat(81)}]}),/COMU_SKU_MAX_80/);
  await denied(saveSql(sid,{...base('free'),variants:[{...base('x').variants[0],attributes:{not_defined:'free'}}]}),/COMU_ATTRIBUTE_UNDEFINED/);
  await denied(saveSql(sid,{...base('typed'),variants:[{...base('x').variants[0],attributes:{size:42}}]}),/COMU_ATTRIBUTE_TEXT_REQUIRED/);
  await denied(saveSql(sid,{...base('empty'),variants:[{...base('x').variants[0],attributes:{size:' '}}]}),/COMU_ATTRIBUTE_EMPTY/);
  await q('reset role');await q(`update ${schema}.pos_product_attribute_definitions set required=true where code='size'`);await as(sellerA);
  await denied(saveSql(sid,{...base('missing'),variants:[{...base('x').variants[0],attributes:{color:'Blue'}}]}),/COMU_ATTRIBUTE_REQUIRED/);
  await q('reset role');await q(`update ${schema}.pos_product_attribute_definitions set required=false where code='size'`);await as(sellerA);
  await denied(saveSql(sid,{...base('bad-code'),productCode:'bad code!'}),/COMU_PRODUCT_CODE_INVALID/);
  assert.deepEqual(v3state.attributeDefinitions.map(d=>d.code),['color','size']);
  await q('reset role');
  await q(`update ${schema}.pos_products set product_code='legacy code !' where id='${pid}'; update ${schema}.pos_product_variants set sku=repeat('L',90),barcode='2000000000008' where id='${vid}'`);
  await as(sellerA); let payload=await makeEdit(pid); const legacyKey=crypto.randomUUID();
  await q(saveSql(sid,payload,legacyKey));await q(saveSql(sid,payload,legacyKey));
  v3state=await read();assert.equal(v3state.variants.find(v=>v.id===vid).sku,'L'.repeat(90));assert.equal(v3state.products.find(p=>p.id===pid).product_code,'legacy code !');
  payload=await makeEdit(pid);payload.variants.find(v=>v.id===vid).sku='M'.repeat(90);await denied(saveSql(sid,payload),/COMU_SKU_MAX_80/);
  payload=await makeEdit(pid);payload.productCode='other legacy !';await denied(saveSql(sid,payload),/COMU_PRODUCT_CODE_INVALID/);
  payload=await makeEdit(pid);payload.productCode=' fixed-01 ';payload.variants.find(v=>v.id===vid).sku='FIXED-01';await q(saveSql(sid,payload));
  const stockBefore=(await read()).inventory;
  payload=await makeEdit(pid);payload.variants.find(v=>v.id===vid).active=false;await q(saveSql(sid,payload));
  v3state=await read();assert.equal(v3state.variants.find(v=>v.id===vid).active,false);assert.equal(v3state.variants.find(v=>v.id===vid).barcode,'2000000000008');assert.deepEqual(v3state.inventory,stockBefore);
  payload=await makeEdit(pid);payload.variants.find(v=>v.id===vid).active=true;await q(saveSql(sid,payload));assert.equal((await read()).variants.find(v=>v.id===vid).active,true);
  // SQL canonical identity preserves JSON types, whitespace, empty/null and accents.
  const signature=async attrs=>(await q(`select ${schema}.pos_variant_signature_v1(${quote(attrs)}) s`))[0].s;
  for(const attrs of [{},{a:''},{a:null},{a:1},{a:true},{b:' B ',a:'Á'},{a:['A',null,1]},{a:{z:1,b:false}},{a:'\tA\t'}]) {
    assert.deepEqual(JSON.parse(await signature(attrs)),JSON.parse(shared.variantSignature(attrs)));
  }
  assert.notEqual(await signature({a:null}),await signature({}));assert.notEqual(await signature({a:''}),await signature({}));
  assert.notEqual(await signature({a:1}),await signature({a:'1'}));assert.notEqual(await signature({a:true}),await signature({a:'true'}));
  assert.equal(await signature({b:' B ',a:'Á'}),await signature({a:'á',b:'b'}));
  await denied(`select ${schema}.pos_variant_signature_v1(${quote({' A ':1,a:2})})`,/KEY_COLLISION/);
  console.log('PASS V3A SQL: <=80, >80 denied, legacy preserved/explicit edits, attributes, inactive/reactivation, barcode/stock preserved, typed signature');

  // Database round trips through the ACTUAL POS create/update RPC definitions.
  // These privileged backend RPC calls are separate from Seller authentication and grant no POS entitlement.
  await q('reset role');const brand=(await q(`select brand_id,brand_slug from ${schema}.comu_sellers where id='${sid}'`))[0];
  assert.equal((await q(`select bool_or(has_function_privilege('authenticated',p.oid,'execute')) allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='${schema}' and p.proname in ('pos_create_product_v2','pos_update_product_v2')`))[0].allowed,'f');
  const posUpdate=async(productId)=>{
    await as(sellerA);const state=await read(), product=state.products.find(p=>p.id===productId);
    const variants=state.variants.filter(v=>v.product_id===productId).map(v=>({...v,price:Number(v.price)+1}));
    await q('reset role');
    await q(`select ${schema}.pos_update_product_v2(p_brand_id=>'${brand.brand_id}',p_brand_slug=>'${brand.brand_slug}',p_product_id=>'${productId}',p_category_id=>null,p_name=>'POS edited',p_description=>null,p_product_type=>'physical',p_inventory_mode=>'direct',p_default_unit_code=>'piece',p_has_variants=>true,p_sellable=>true,p_purchasable=>true,p_tax_rate=>0,p_image_url=>null,p_configuration=>'{}',p_variants=>${quote(variants)},p_user_id=>'${sellerA}',p_product_code=>'${product.product_code}')`);
    await as(sellerA);return {before:state,after:await read()};
  };
  let trip=await posUpdate(pid);
  const identities=(state,id)=>state.variants.filter(v=>v.product_id===id).map(v=>({id:v.id,sku:v.sku,attributes:v.attributes,barcode:v.barcode,active:v.active})).sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(identities(trip.after,pid),identities(trip.before,pid));for(const row of trip.before.inventory) assert.deepEqual(trip.after.inventory.find(i=>i.id===row.id),row); for(const row of trip.after.inventory.filter(i=>!trip.before.inventory.some(old=>old.id===i.id))) { assert.equal(Number(row.quantity),0); assert.equal(Number(row.reserved_quantity),0); } assert.equal(trip.after.products.find(p=>p.id===pid).name,'POS edited');
  console.log('PASS COMU -> real POS update RPC -> COMU: IDs/SKU/attributes/barcode/stock unchanged');
  await q('reset role');
  await q(`insert into ${schema}.pos_business_profiles(brand_id,brand_slug,profile_code,onboarding_status) values('${brand.brand_id}','${brand.brand_slug}','retail','completed'); insert into ${schema}.pos_units(code,name,symbol,unit_type) values('piece','Piece','pz','count')`);
  const posCreated=JSON.parse((await q(`select ${schema}.pos_create_product_v2(p_brand_id=>'${brand.brand_id}',p_brand_slug=>'${brand.brand_slug}',p_location_id=>'${loc}',p_category_id=>null,p_name=>'POS origin',p_description=>null,p_product_type=>'physical',p_inventory_mode=>'direct',p_default_unit_code=>'piece',p_has_variants=>true,p_sellable=>true,p_purchasable=>true,p_tax_rate=>0,p_image_url=>null,p_configuration=>'{}',p_variants=>${quote([{name:'M Blue',sku:'POS-ORIGIN',barcode:'2000000000015',price:95,cost:10,attributes:{size:'M',color:'blue'},initialQuantity:3}])},p_user_id=>'${sellerA}',p_product_code=>'POS001') result`))[0].result);
  await as(sellerA);const posBefore=await read();payload=await makeEdit(posCreated.id);payload.name='COMU edited';await q(saveSql(sid,payload));const posAfter=await read();assert.deepEqual(identities(posAfter,posCreated.id),identities(posBefore,posCreated.id));assert.deepEqual(posAfter.inventory,posBefore.inventory);
  await q('reset role');assert.equal((await q(`select name from ${schema}.pos_products where id='${posCreated.id}'`))[0].name,'COMU edited');assert.equal((await q(`select count(*) n from ${schema}.user_brand_access`))[0].n,'0');
  console.log('PASS real POS create RPC -> COMU edit -> POS canonical read: same IDs/SKU/attributes/inventory; no POS membership');
  console.log('PASS C2 PostgreSQL: C1 new seller, DRAFT, variants, stock, direct writes DENIED, cross-brand/buyer/rejected DENIED, concurrent edits, real concurrent reservations, last unit, retry, media ownership, ten eligible + explicit activation, zero POS memberships, legacy preserved.');
} finally {
  await query(other,'rollback; reset role').catch(()=>{}); await other.close();
  await q('rollback; reset role').catch(()=>{});
  if(created) await q(`drop schema ${schema} cascade`);
  await db.close();
  dock(['exec','-u','postgres',container,'dropdb','--force','-U','postgres',database]);
  console.log('Removed disposable database '+database);
}
