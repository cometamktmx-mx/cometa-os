// M1: local Docker only; creates a new database, never applies SQL to postgres.
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const socketPath = '\\\\.\\pipe\\dockerDesktopLinuxEngine';
const database = 'cometa_m1_' + Date.now();
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
  assert.match(database, /^cometa_m1_\d+$/);
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
const scalar = async q => JSON.parse(await sql('select to_jsonb(x) from (' + q + ') x'));
const ids=Object.fromEntries(['admin','owner','inventory','viewer','other','brand','brandB','product','legacy','variant','location','seller','storefront','listing','vl'].map(k=>[k,randomUUID()]));
let created=false;
try{
 const list=JSON.parse((await api('GET','/containers/json')).toString()).filter(c=>c.Names.some(n=>n.startsWith('/supabase_db_')));
 assert.equal(list.length,1);container=list[0].Id;
 await destination();console.log('TARGET local port 54322 NEW DATABASE',database);
 await exec(['createdb','-U','postgres','--template=template0',database]);created=true;
 await sql('create schema extensions;create extension pgcrypto with schema extensions;create extension "uuid-ossp" with schema extensions;create extension vector with schema extensions;create extension pg_stat_statements with schema extensions;create extension supabase_vault;');
 const dump=await exec(['pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--schema=public','--schema=auth','--schema=storage']);
 await sql('drop schema public;create schema public;alter extension vector set schema public;');
 await sql(dump.replace('CREATE SCHEMA public;','').replace(/^ALTER DEFAULT PRIVILEGES[^;]+;$/gm,''));
 console.log('Baseline SHA256',createHash('sha256').update(dump).digest('hex'));
 for(const file of ['20261010160000_brand_online_store_access_a1.sql','20261010180000_pos_product_sales_channels_m1.sql']){
   const source=fs.readFileSync('supabase/migrations/'+file,'utf8');await sql(source);console.log('Applied ONLY disposable',file,createHash('sha256').update(source).digest('hex'));
 }
 await sql(`begin;set local session_replication_role=replica;
 insert into auth.users(id,email) values ${['admin','owner','inventory','viewer','other'].map(k=>`('${ids[k]}','m1-${k}@example.test')`).join(',')};
 insert into user_profiles(user_id,email,role,status) values ${['admin','owner','inventory','viewer','other'].map(k=>`('${ids[k]}','m1-${k}@example.test','${k==='admin'?'admin':'client'}','active')`).join(',')};
 insert into brands(id,slug,name,status) values('${ids.brand}','m1-brand','M1 fixture','active'),('${ids.brandB}','m1-other','Other','active');
 insert into user_brand_access(user_id,brand_slug,access_role,status) values('${ids.owner}','m1-brand','owner','active'),('${ids.inventory}','m1-brand','inventory','active'),('${ids.viewer}','m1-brand','viewer','active'),('${ids.other}','m1-other','owner','active');
 insert into pos_business_profiles(brand_id,brand_slug,profile_code) values('${ids.brand}','m1-brand','retail'),('${ids.brandB}','m1-other','retail');
 insert into pos_units(code,name,symbol,unit_type) values('piece','Pieza','pza','count');
 insert into pos_locations(id,brand_id,brand_slug,name,code) values('${ids.location}','${ids.brand}','m1-brand','Fixture','M1');
 insert into pos_products(id,brand_id,brand_slug,name,sellable) values('${ids.product}','${ids.brand}','m1-brand','M1 product',true),('${ids.legacy}','${ids.brand}','m1-brand','Legacy',true);
 insert into pos_product_variants(id,brand_id,brand_slug,product_id,name,sku,barcode,price,active,variant_signature) values('${ids.variant}','${ids.brand}','m1-brand','${ids.product}','M1 variant','M1SKU','1234567890123',100,true,'m1');
 insert into pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity,reserved_quantity) values('${ids.brand}','m1-brand','${ids.location}','${ids.variant}',0,0);
 insert into comu_sellers(id,brand_id,brand_slug,public_name,slug,status,verification_status,approval_origin) values('${ids.seller}','${ids.brand}','m1-brand','M1','m1-brand','ACTIVE','VERIFIED','LEGACY');
 insert into comu_storefronts(id,seller_id,name,slug,status) values('${ids.storefront}','${ids.seller}','M1','m1-brand','ACTIVE');
 insert into comu_product_listings(id,seller_id,storefront_id,product_id,public_slug,status) values('${ids.listing}','${ids.seller}','${ids.storefront}','${ids.product}','m1-product','PUBLISHED');
 insert into comu_variant_listings(id,listing_id,variant_id) values('${ids.vl}','${ids.listing}','${ids.variant}');commit;`);
 const snapshot=()=>sql(`select jsonb_build_object('products',(select jsonb_agg(x order by id) from pos_products x),'variants',(select jsonb_agg(x) from pos_product_variants x),'inventory',(select jsonb_agg(x) from pos_inventory x),'moves',(select jsonb_agg(x) from pos_inventory_movements x),'listings',(select jsonb_agg(x) from comu_product_listings x),'vlistings',(select jsonb_agg(x) from comu_variant_listings x))`);
 const before=await snapshot();
 const change=(physical,online,revision,actor=ids.owner,slug='m1-brand')=>sql(`set role service_role;select public.pos_set_product_channels_m1('${slug}','${ids.product}','${actor}',${physical},${online},${revision})`);
 await assert.rejects(()=>change(false,true,0),/POS_ONLINE_SERVICE_DISABLED/);
 assert.equal((await scalar('select count(*)::int n from pos_product_sales_channels')).n,0);
 for(const actor of [ids.viewer,ids.other])await assert.rejects(()=>change(false,false,0,actor),/DENIED/);
 await assert.rejects(()=>change(false,false,0,ids.admin,'m1-other'),/POS_PRODUCT_NOT_FOUND/);
 await sql(`set role service_role;select public.brand_online_store_set_access_a1('m1-brand','${ids.admin}','enabled',0)`);
 await assert.rejects(()=>change(false,true,0,ids.inventory),/POS_ONLINE_CHANNEL_DENIED/);
 assert.equal((await scalar('select count(*)::int n from pos_product_sales_channels')).n,0);
 for(const [physical,online,rev]of [[true,true,0],[false,true,1],[false,false,2],[true,false,3]]){
   const result=JSON.parse(await change(physical,online,rev));assert.equal(result.physical_requested,physical);assert.equal(result.online_requested,online);assert.equal(result.revision,rev+1);
 }
 assert.equal(await snapshot(),before,'channels must not touch canonical catalog, stock, movements or COMU');
 const race=await Promise.allSettled([change(false,false,4),change(false,false,4)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.match(race.find(r=>r.status==='rejected').reason.message,/CONFLICT/);
 for(const role of ['authenticated','anon'])await assert.rejects(()=>sql(`set role ${role};select public.pos_set_product_channels_m1('m1-brand','${ids.product}','${ids.admin}',true,true,5)`),/permission denied/);
 await assert.rejects(()=>sql(`set role service_role;update pos_product_sales_channels set online_requested=true`),/permission denied/);
 console.log('PASS SQL channel combinations, atomic denial, existing defaults, COMU independence, stock/prices/variants unchanged, CAS and grants');
 const {certify}=await import('./test-product-channels-m1-http.mjs');await certify({sql,ids,quote});
 assert.equal(await snapshot(),before);
}finally{
 if(created){await destination();await exec(['dropdb','-U','postgres','--force',database]);console.log('Dropped only',database);}
}
