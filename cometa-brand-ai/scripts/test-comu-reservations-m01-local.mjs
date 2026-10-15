// M0: local Docker only; creates a new database, never applies SQL to postgres.
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const socketPath = '\\\\.\\pipe\\dockerDesktopLinuxEngine';
const database = 'comu_m0_' + Date.now();
const api = (method, path, body) => new Promise((resolve, reject) => {
  const req = http.request({ socketPath, method, path, headers: body ? { 'Content-Type': Buffer.isBuffer(body) ? 'application/x-tar' : 'application/json' } : {} }, res => {
    const chunks = []; res.on('data', b => chunks.push(b)); res.on('end', () => {
      const b = Buffer.concat(chunks); if (res.statusCode >= 300) reject(new Error(b.toString())); else resolve(b);
    });
  }); req.on('error', reject); req.setTimeout(120000, () => req.destroy(new Error('Docker timeout')));
  req.end(Buffer.isBuffer(body) ? body : body ? JSON.stringify(body) : undefined);
});
let container;
async function destination() {
  const c = JSON.parse((await api('GET', '/containers/' + container + '/json')).toString());
  assert.ok(c.Name.startsWith('/supabase_db_'));
  assert.ok(c.NetworkSettings.Ports['5432/tcp'].some(p => p.HostPort === '54322'));
  assert.match(database, /^comu_m0_\d+$/);
}
async function exec(args, user = 'postgres') {
  await destination();
  const e = JSON.parse((await api('POST', '/containers/' + container + '/exec', { User: user, AttachStdout: true, AttachStderr: true, Cmd: args })).toString());
  const raw = await api('POST', '/exec/' + e.Id + '/start', { Detach: false, Tty: false });
  let out = '', err = ''; for (let i = 0; i < raw.length;) { const n = raw.readUInt32BE(i + 4); const b = raw.subarray(i + 8, i + 8 + n).toString(); if (raw[i] === 2) err += b; else out += b; i += n + 8; }
  const result = JSON.parse((await api('GET', '/exec/' + e.Id + '/json')).toString());
  if (result.ExitCode) throw new Error(err || out); return out.trim();
}
async function sql(q) {
  await destination();
  // Transfer literal UTF-8 bytes as a file, never interpolate SQL into shell code.
  const name = 'm0_' + randomUUID() + '.sql', data = Buffer.from(q), header = Buffer.alloc(512);
  header.write(name); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136); header.fill(32, 148, 156); header[156] = 48;
  const sum = header.reduce((a, b) => a + b, 0); header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  const tar = Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512 + 1024)]);
  await api('PUT', '/containers/' + container + '/archive?path=/tmp', tar);
  try { return await exec(['psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, '-f', '/tmp/' + name]); }
  finally { await exec(['rm', '--', '/tmp/' + name], 'root'); }
}
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
const migration = 'supabase/migrations/20261010120000_comu_reservation_lifecycle_m0.sql';
const id = randomUUID;
const ids = { brand: id(), brandB: id(), location: id(), location2: id(), foreignLocation: id(), product: id(), variant: id(), seller: id(), sellerB: id(), storefront: id(), listing: id(), vl: id(), user: id(), other: id(), buyer: id(), buyerB: id(), register: id(), cash: id() };
let created = false;
try {
  const list = JSON.parse((await api('GET', '/containers/json')).toString()).filter(c => c.Names.some(n => n.startsWith('/supabase_db_')));
  assert.equal(list.length, 1); container = list[0].Id;
  await destination(); console.log('TARGET 127.0.0.1:54322 / NEW DATABASE', database);
  await exec(['createdb', '-U', 'postgres', '--template=template0', database]); created = true;
  await sql('create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions; create extension vector with schema extensions; create extension pg_stat_statements with schema extensions; create extension supabase_vault;');
  const dump = await exec(['pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--no-owner', '--schema=public', '--schema=auth', '--schema=storage']);
  await sql('drop schema public; create schema public; alter extension vector set schema public;');
  await sql(dump.replace('CREATE SCHEMA public;', '').replace(/^ALTER DEFAULT PRIVILEGES[^;]+;$/gm, ''));
  console.log('Schema-only baseline SHA256', createHash('sha256').update(dump).digest('hex'));
  console.log('Final installed definitions', await sql("select proname||':'||md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace and proname in ('comu_reserve_inventory','comu_create_order_from_reservation','comu_cancel_order','comu_expire_inventory_reservations','comu_release_inventory_reservation','comu_mark_payment_succeeded','pos_complete_sale_v4') order by proname"));
  // Synthetic fixtures only, in the new database. C1 setup uses the same explicit
  // fixture-only guard bypass as existing O1 suites; production migrations don't.
  await sql(`begin; set local session_replication_role=replica; insert into public.pos_units(code,name,symbol,unit_type) values('piece','Pieza','pza','count');
    insert into public.comu_financial_settings(id) values(true);
    insert into auth.users(id,email) values('${ids.user}','m0-a@example.test'),('${ids.other}','m0-b@example.test');
    insert into public.user_profiles(user_id,email,role,status) values('${ids.user}','m0-a@example.test','client','active'),('${ids.other}','m0-b@example.test','client','active');
    insert into public.brands(id,slug,name) values('${ids.brand}','m0-fixture','M0');
    insert into public.brands(id,slug,name) values('${ids.brandB}','m0-other','M0 other');
    insert into public.pos_locations(id,brand_id,brand_slug,name,code) values('${ids.location}','${ids.brand}','m0-fixture','M0','M0');
    insert into public.pos_locations(id,brand_id,brand_slug,name,code) values('${ids.location2}','${ids.brand}','m0-fixture','M0 second','M02'),('${ids.foreignLocation}','${ids.brandB}','m0-other','Other','OTHER');
    insert into public.pos_products(id,brand_id,brand_slug,name,product_type,track_inventory,active,sellable,purchasable) values('${ids.product}','${ids.brand}','m0-fixture','M0','physical',true,true,true,true);
    insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,price,active,variant_signature) values('${ids.variant}','${ids.brand}','m0-fixture','${ids.product}','M0',10,true,'m0');
    insert into public.pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity) values('${ids.brand}','m0-fixture','${ids.location}','${ids.variant}',20);
    insert into public.pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity) values('${ids.brand}','m0-fixture','${ids.location2}','${ids.variant}',3);
    insert into public.pos_registers(id,brand_id,brand_slug,location_id,name,code,status) values('${ids.register}','${ids.brand}','m0-fixture','${ids.location}','M0','M0','available');
    insert into public.pos_cash_sessions(id,brand_id,brand_slug,location_id,register_id,status,opening_amount) values('${ids.cash}','${ids.brand}','m0-fixture','${ids.location}','${ids.register}','open',0);
    alter table public.comu_sellers disable trigger comu_c1_seller_guard;
    insert into public.comu_sellers(id,brand_id,brand_slug,public_name,slug,status,verification_status,approval_origin) values('${ids.seller}','${ids.brand}','m0-fixture','M0','m0-fixture','ACTIVE','VERIFIED','LEGACY');
    insert into public.comu_sellers(id,brand_id,brand_slug,public_name,slug,status,verification_status,approval_origin) values('${ids.sellerB}','${ids.brandB}','m0-other','Other','m0-other','ACTIVE','VERIFIED','LEGACY');
    alter table public.comu_sellers enable trigger comu_c1_seller_guard;
    insert into public.comu_storefronts(id,seller_id,name,slug,status) values('${ids.storefront}','${ids.seller}','M0','m0-fixture','ACTIVE');
    insert into public.comu_product_listings(id,seller_id,storefront_id,product_id,public_slug,status) values('${ids.listing}','${ids.seller}','${ids.storefront}','${ids.product}','m0-fixture','PUBLISHED');
    insert into public.comu_variant_listings(id,listing_id,variant_id) values('${ids.vl}','${ids.listing}','${ids.variant}');
    insert into public.comu_buyers(id,user_id) values('${ids.buyer}','${ids.user}'),('${ids.buyerB}','${ids.other}'); commit;`);
  await sql(fs.readFileSync(migration, 'utf8'));
  const { certify } = await import('./test-comu-reservations-m01-http.mjs');
  await certify({sql, ids, quote});
} finally {
  if (created) { await destination(); await exec(['dropdb', '-U', 'postgres', '--force', database]); console.log('Dropped only disposable', database); }
}
