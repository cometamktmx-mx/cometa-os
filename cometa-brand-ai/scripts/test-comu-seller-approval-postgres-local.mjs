// Execute the real C1 migration in a disposable LOCAL schema, never public/remote.
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
const schema = 'comu_c1_test_' + crypto.randomUUID().replaceAll('-', '');
assert.match(schema, /^comu_c1_test_[a-f0-9]{32}$/);
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
    create table ${schema}.pos_products(id uuid primary key,brand_id text,brand_slug text,active boolean,sellable boolean);
    create table ${schema}.pos_product_variants(id uuid primary key,product_id uuid,brand_slug text,active boolean,price numeric);
  `);
  for (const file of ['20260920100000_comu_foundation_sellers.sql','20260920101000_comu_storefronts.sql','20260920102000_comu_catalog_listings.sql']) {
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
  for (const [user, application] of [[sellerA, appA], [sellerB, appB], [rejected, appR]]) {
    await as(user);
    await q(`insert into ${schema}.comu_seller_applications(id,user_id,contact_name,business_name,email,phone,city,business_type) values('${application}','${user}','Applicant','Business','contact@example.test','5550000000','City','Retail')`);
  }
  await denied(rpc(appA)); // buyer cannot approve
  await as(sellerA); await denied(rpc(appA));
  await denied(`update ${schema}.comu_seller_applications set status='APPROVED' where id='${appA}'`);
  await as(admin); await as(admin, other);
  const concurrentApproval = await Promise.all([q(rpc(appA)),query(other,rpc(appA))]);
  const approved = JSON.parse(concurrentApproval[0][0].result);
  assert.equal(JSON.parse(concurrentApproval[1][0].result).seller_id,approved.seller_id);
  assert.equal(approved.status,'APPROVED'); assert.equal(approved.reviewed_by,admin);
  await as(admin, other);
  const replay = await Promise.all([q(rpc(appA)),query(other,rpc(appA))]);
  assert.ok(replay.every(rows => JSON.parse(rows[0].result).seller_id === approved.seller_id));
  await q(rpc(appR,'REJECTED')); await denied(rpc(appR),/COMU_DECISION_CONFLICT/);
  await q(rpc(appB));
  // Even a COMETA admin cannot approve their own application.
  const selfApplication=crypto.randomUUID();
  await q(`insert into ${schema}.comu_seller_applications(id,user_id,business_name) values('${selfApplication}','${admin}','Self')`);
  await denied(rpc(selfApplication),/COMU_SELF_APPROVAL_DENIED/);
  await q('reset role');
  const state = (await q(`select s.status,s.verification_status,s.approval_origin,sf.status as storefront_status from ${schema}.comu_sellers s join ${schema}.comu_storefronts sf on sf.seller_id=s.id where s.id='${approved.seller_id}'`))[0];
  assert.deepEqual({ ...state },{status:'PREPARING',verification_status:'VERIFIED',approval_origin:'C1',storefront_status:'PREPARING'});
  assert.equal((await q(`select count(*) as n from ${schema}.brands`))[0].n,'2');
  assert.equal((await q(`select count(*) as n from ${schema}.user_profiles where user_id='${sellerA}'`))[0].n,'1');
  assert.equal((await q(`select count(*) as n from ${schema}.comu_seller_memberships where user_id='${sellerA}'`))[0].n,'1');
  assert.equal((await q(`select count(*) as n from ${schema}.user_brand_access`))[0].n,'0');
  assert.equal((await q(`select count(*) as n from ${schema}.comu_seller_memberships where user_id='${rejected}'`))[0].n,'0');
  // An administrator cannot attach a foreign brand to a new applicant implicitly.
  const foreignUser=crypto.randomUUID(),foreignApplication=crypto.randomUUID();
  await q(`insert into ${schema}.auth_users values('${foreignUser}','foreign@example.test')`);
  await as(foreignUser);
  await denied(`insert into ${schema}.comu_seller_applications(id,user_id,business_name,status) values('${foreignApplication}','${foreignUser}','Foreign','APPROVED')`);
  await q(`insert into ${schema}.comu_seller_applications(id,user_id,business_name) values('${foreignApplication}','${foreignUser}','Foreign')`);
  await as(admin); await denied(rpc(foreignApplication,'APPROVED',approved.brand_id),/COMU_BRAND_ACCESS_DENIED/);
  await q('reset role');
  assert.equal((await q(`select count(*) as n from ${schema}.user_profiles where user_id='${foreignUser}'`))[0].n,'0','Failed approval rolls back account creation');
  const legacyState = (await q(`select status,approval_origin,approval_application_id,verified_at from ${schema}.comu_sellers where id='${legacy}'`))[0];
  assert.deepEqual({ ...legacyState },{status:'ACTIVE',approval_origin:'LEGACY',approval_application_id:null,verified_at:null});
  await as(sellerB); assert.equal((await q(`select id from ${schema}.comu_sellers where id='${legacy}'`)).length,1);
  await as(sellerA);
  await denied(`insert into ${schema}.comu_seller_memberships(seller_id,user_id,role) values('${legacy}','${sellerA}','OWNER')`);
  await denied(`update ${schema}.comu_storefronts set status='ACTIVE' where seller_id='${approved.seller_id}'`);
  await denied(`update ${schema}.comu_sellers set verification_status='VERIFIED' where id='${approved.seller_id}'`);
  await q(`reset role; select set_config('request.jwt.claim.sub','',false); set role service_role`);
  await denied(`update ${schema}.comu_storefronts set status='ACTIVE' where seller_id='${approved.seller_id}'`);
  await as(sellerA);
  await q(`update ${schema}.comu_storefronts set description='Configured' where seller_id='${approved.seller_id}'`);
  assert.equal((await q(`update ${schema}.comu_storefronts set description='ATTACK' where seller_id='${legacy}' returning id`)).length,0);
  await denied(`select ${schema}.comu_admin_seller_state_v1('${approved.seller_id}','activate')`);
  await as(admin);
  const activate = `select ${schema}.comu_admin_seller_state_v1('${approved.seller_id}','activate') as result`;
  assert.equal(JSON.parse((await q(activate))[0].result).reason,'MINIMUM_LISTINGS_REQUIRED');
  await q('reset role');
  const brand = (await q(`select * from ${schema}.brands where id='${approved.brand_id}'`))[0];
  const storefront = (await q(`select id from ${schema}.comu_storefronts where seller_id='${approved.seller_id}'`))[0].id;
  for(let i=0;i<10;i++) {
    const p=crypto.randomUUID(),v=crypto.randomUUID(),l=crypto.randomUUID();
    await q(`insert into ${schema}.pos_products values('${p}','${brand.id}','${brand.slug}',true,true);
      insert into ${schema}.pos_product_variants values('${v}','${p}','${brand.slug}',true,100);
      insert into ${schema}.comu_product_listings(id,seller_id,storefront_id,product_id,public_slug,status) values('${l}','${approved.seller_id}','${storefront}','${p}','product-${i}','PUBLISHED');
      insert into ${schema}.comu_variant_listings(listing_id,variant_id) values('${l}','${v}');`);
  }
  await as(sellerB);
  const ownProduct=(await q(`select product_id from ${schema}.comu_product_listings where seller_id='${approved.seller_id}'`));
  assert.equal(ownProduct.length,0,'Preparing catalog is not public to another seller');
  await q('reset role');
  const product=(await q(`select id from ${schema}.pos_products limit 1`))[0].id;
  await as(sellerB);
  const legacyStorefront=(await q(`select id from ${schema}.comu_storefronts where seller_id='${legacy}'`))[0].id;
  await denied(`insert into ${schema}.comu_product_listings(seller_id,storefront_id,product_id,public_slug) values('${legacy}','${legacyStorefront}','${product}','foreign-product')`,/COMU_PRODUCT_BRAND_MISMATCH/);
  await as(admin); assert.equal(JSON.parse((await q(activate))[0].result).reason,'COMU_CONNECT_REQUIRED');
  await q('reset role');
  await q(`insert into ${schema}.comu_seller_payment_accounts values('${approved.seller_id}','acct_fixture','COMPLETE',true,true,false)`);
  // Reaching ten never auto-activates.
  assert.equal((await q(`select status from ${schema}.comu_sellers where id='${approved.seller_id}'`))[0].status,'PREPARING');
  await as(admin); assert.equal(JSON.parse((await q(activate))[0].result).ok,true);
  console.log('PASS PostgreSQL C1: approve/reject, concurrent retry, no duplicate account/brand/seller/membership, no POS membership, PREPARING, direct status DENIED, operational edit PASS, cross-seller DENIED, legacy preserved, 10 + Connect + admin activation.');
} finally {
  await query(other,'reset role').catch(()=>{}); await other.close();
  await q('reset role').catch(()=>{});
  if(created) await q(`drop schema ${schema} cascade`);
  await db.close();
}
