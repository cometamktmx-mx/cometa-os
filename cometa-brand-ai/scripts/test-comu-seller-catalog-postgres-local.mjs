// Execute the real C1 + C2 migrations in a disposable LOCAL schema, never public/remote.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import vm from 'node:vm';
const wire = fs.readFileSync('scripts/test-comu-postgres-concurrency-v1.mjs', 'utf8');
const context = { net, crypto, Buffer, console, process: { env: {} }, PgWire: null };
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
  const sigStart=baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."pos_variant_signature_v1"');
  await q(baseline.slice(sigStart,baseline.indexOf('ALTER FUNCTION',sigStart)).replaceAll('"public".',schema+'.'));
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
  assert.equal((await q(legacySql))[0].result,legacyOriginal);
  // Same table write boundary as M1; no grants are restored by C2.
  await q('revoke insert,update,delete on '+schema+'.pos_products,'+schema+'.pos_product_variants,'+schema+'.pos_inventory from authenticated');
  for (const [user, application] of [[sellerA,appA],[sellerB,appB],[rejected,appR]]) {
    await as(user); await q(`insert into ${schema}.comu_seller_applications(id,user_id,business_name) values('${application}','${user}','C2 shop')`);
  }
  await as(admin); const approved=JSON.parse((await q(rpc(appA)))[0].result); const b=JSON.parse((await q(rpc(appB)))[0].result); await q(rpc(appR,'REJECTED'));
  const sid=approved.seller_id;
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
  console.log('PASS C2 PostgreSQL: C1 new seller, DRAFT, variants, stock, direct writes DENIED, cross-brand/buyer/rejected DENIED, concurrent edits, real concurrent reservations, last unit, retry, media ownership, ten eligible + explicit activation, zero POS memberships, legacy preserved.');
} finally {
  await query(other,'rollback; reset role').catch(()=>{}); await other.close();
  await q('rollback; reset role').catch(()=>{});
  if(created) await q(`drop schema ${schema} cascade`);
  await db.close();
}
