// ELEVENTA: disposable local PostgreSQL only. No remote env or credentials.
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const socketPath = '\\\\.\\pipe\\dockerDesktopLinuxEngine';
const database = 'cometa_eleventa_' + Date.now();
const api = (method, path, body) => new Promise((resolve, reject) => {
  const req = http.request({ socketPath, method, path, headers: body ? { 'Content-Type': Buffer.isBuffer(body) ? 'application/x-tar' : 'application/json' } : {} }, res => {
    const chunks = []; res.on('data', b => chunks.push(b)); res.on('end', () => {
      const b = Buffer.concat(chunks); if (res.statusCode >= 300) reject(new Error(b.toString())); else resolve(b);
    });
  }); req.on('error', reject); req.setTimeout(15000, () => req.destroy(new Error('Docker timeout')));
  req.end(Buffer.isBuffer(body) ? body : body ? JSON.stringify(body) : undefined);
});
let container;
async function destination() {
  const c = JSON.parse((await api('GET', '/containers/' + container + '/json')).toString());
  assert.ok(c.Name.startsWith('/supabase_db_'));
  assert.ok(c.NetworkSettings.Ports['5432/tcp'].some(p => p.HostPort === '54322'));
  assert.match(database, /^cometa_eleventa_\d+$/);
}
async function exec(args, user = 'postgres') {
  await destination();
  const e = JSON.parse((await api('POST', '/containers/' + container + '/exec', { User: user, AttachStdout: true, AttachStderr: true, Cmd: args })).toString());
  const raw = await api('POST', '/exec/' + e.Id + '/start', { Detach: false, Tty: false });
  let out = '', err = ''; for (let i = 0; i < raw.length;) { const n = raw.readUInt32BE(i + 4); const b = raw.subarray(i + 8, i + 8 + n).toString(); if (raw[i] === 2) err += b; else out += b; i += n + 8; }
  const result = JSON.parse((await api('GET', '/exec/' + e.Id + '/json')).toString());
  if (result.ExitCode) throw new Error(err || out); return out.trim();
}
async function sql(q, dbUser = 'postgres') {
  assert.ok(['postgres','supabase_admin'].includes(dbUser));
  await destination();
  // Transfer literal UTF-8 bytes as a file, never interpolate SQL into shell code.
  const name = 'm0_' + randomUUID() + '.sql', data = Buffer.from(q), header = Buffer.alloc(512);
  header.write(name); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136); header.fill(32, 148, 156); header[156] = 48;
  const sum = header.reduce((a, b) => a + b, 0); header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  const tar = Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512 + 1024)]);
  await api('PUT', '/containers/' + container + '/archive?path=/tmp', tar);
  try { return await exec(['psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', dbUser, '-d', database, '-f', '/tmp/' + name]); }
  finally { await exec(['rm', '--', '/tmp/' + name], 'root'); }
}
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
const ids = Object.fromEntries(['owner','other','brand','brandB','location'].map(k => [k, randomUUID()]));
let created = false;
try {
 const list = JSON.parse((await api('GET','/containers/json')).toString()).filter(c => c.Names.some(n => n.startsWith('/supabase_db_')));
 assert.equal(list.length, 1, 'Exactly one local Supabase PostgreSQL expected'); container = list[0].Id;
 await destination(); console.log('LOCAL DISPOSABLE TARGET', database);
 await exec(['createdb','-U','postgres','--template=template0',database]); created = true;
 await sql('create schema extensions;create extension pgcrypto with schema extensions;create extension "uuid-ossp" with schema extensions;create extension vector with schema extensions;create extension pg_stat_statements with schema extensions;create extension supabase_vault;');
 const dump = await exec(['pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--schema=public','--schema=auth','--schema=storage']);
 await sql('drop schema public;create schema public;alter extension vector set schema public;');
 await sql(dump.replace('CREATE SCHEMA public;','').replace(/^ALTER DEFAULT PRIVILEGES[^;]+;$/gm,''));
 console.log('Read-only source schema SHA256', createHash('sha256').update(dump).digest('hex'));
 await sql(fs.readFileSync('supabase/migrations/20261014120000_pos_imports_v1.sql','utf8'));
 await sql(`begin;set local session_replication_role=replica;
 insert into auth.users(id,email) values('${ids.owner}','synthetic-owner@example.test'),('${ids.other}','synthetic-other@example.test');
 insert into user_profiles(user_id,email,role,status) values('${ids.owner}','synthetic-owner@example.test','client','active'),('${ids.other}','synthetic-other@example.test','client','active');
 insert into brands(id,slug,name,status) values('${ids.brand}','synthetic-import-a','SYNTHETIC A','active'),('${ids.brandB}','synthetic-import-b','SYNTHETIC B','active');
 insert into user_brand_access(user_id,brand_slug,access_role,status) values('${ids.owner}','synthetic-import-a','owner','active'),('${ids.other}','synthetic-import-b','owner','active');
 insert into pos_business_profiles(brand_id,brand_slug,profile_code) values('${ids.brand}','synthetic-import-a','retail'),('${ids.brandB}','synthetic-import-b','retail');
 insert into pos_units(code,name,symbol,unit_type) values('piece','Pieza','pza','count');
 insert into pos_locations(id,brand_id,brand_slug,name,code) values('${ids.location}','${ids.brand}','synthetic-import-a','SYNTHETIC','TEST');commit;`);
 const rows = values => values.map((v,i) => ({rowNumber:i+2,values:v,errors:[]}));
 const hash = s => createHash('sha256').update(s).digest('hex');
 const call = async (kind, mode, records, options = {}) => {
  const q = `set role service_role;select public.pos_import_v1(${quote(options.brand ?? 'synthetic-import-a')},'${options.actor ?? ids.owner}',${quote(kind)},${kind === 'inventory' ? quote(ids.location) : 'null'},${quote(mode)},${quote(JSON.stringify(records))}::jsonb,${options.request ? quote(options.request) : 'null'},${options.hash ? quote(options.hash) : 'null'},${options.token ? quote(options.token) : 'null'},${options.run ? quote(options.run) : 'null'})`;
  return JSON.parse(await sql(q));
 };
 const create = rows([{code:'000123',name:'SYNTHETIC PRODUCT',price:120,cost:50,creation_tax_rate:16}]);
 const preview = await call('products','preview',create);
 assert.equal(preview.rows[0].errors.length,0); assert.equal(preview.rows[0].matches.length,0);
 await assert.rejects(() => call('products','preview',create,{actor:ids.other}));
 await assert.rejects(() => call('products','preview',create,{brand:'synthetic-import-b'}));
 const records = create.map(r => ({...r,decision:'create'}));
 const options = {request:randomUUID(),hash:hash('synthetic-products'),token:preview.token};
 const concurrent = await Promise.all([call('products','apply',records,options),call('products','apply',records,options)]);
 const imported = concurrent[0]; assert.equal(concurrent[1].id,imported.id,'concurrent retry is one operation');
 assert.equal(imported.status,'done');
 const replay = await call('products','apply',records,options); assert.equal(replay.id,imported.id); assert.equal(replay.replayed,true);
 await assert.rejects(() => call('products','apply',records,{...options,request:randomUUID()}));
 await assert.rejects(() => call('products','apply',records.map(r=>({...r,values:{...r.values,price:999}})),options));
 assert.equal(await sql("select count(*) from pos_products where brand_slug='synthetic-import-a' and product_code='000123'"),'1');
 assert.equal(await sql("select count(*) from pos_products where brand_slug='synthetic-import-b'"),'0');
 const invalidBatch=rows([{code:'009998',name:'SYNTHETIC ATOMIC',price:10,cost:5,creation_tax_rate:0},{code:'009999',name:'SYNTHETIC INVALID',price:-1,cost:5,creation_tax_rate:0}]).map(r=>({...r,decision:'create'}));
 const invalidPreview=await call('products','preview',invalidBatch);
 await assert.rejects(()=>call('products','apply',invalidBatch,{request:randomUUID(),hash:hash('atomic-invalid'),token:invalidPreview.token}));
 assert.equal(await sql("select count(*) from pos_products where brand_slug='synthetic-import-a' and product_code in ('009998','009999')"),'0','failure rolls back the entire batch');
 const variant = await sql("select id from pos_product_variants where brand_slug='synthetic-import-a' and sku='000123'");
 assert.equal(await sql(`select price||':'||cost from pos_product_variants where id='${variant}'`),'120.00:50.000000');
 const update = rows([{code:'000123',name:'SYNTHETIC RENAMED'}]);
 const up = await call('products','preview',update); assert.equal(up.rows[0].matches.length,1);
 const upd = await call('products','apply',update.map(r=>({...r,decision:'update'})),{request:randomUUID(),hash:hash('update'),token:up.token});
 assert.equal(await sql(`select price||':'||cost from pos_product_variants where id='${variant}'`),'120.00:50.000000');
 await call('products','revert',[],{run:upd.id});
 assert.equal(await sql("select name from pos_products where brand_slug='synthetic-import-a'"),'SYNTHETIC PRODUCT');
 const inventory = rows([{code:'000123',quantity:10}]);
 const ip = await call('inventory','preview',inventory); assert.equal(ip.rows[0].inventoryExists,false);
 assert.equal(ip.rows[0].matches.length,1);assert.deepEqual(ip.rows[0].errors,[],'stock only needs code and quantity');
 await assert.rejects(()=>call('inventory','apply',inventory.map(r=>({...r,decision:'update'})),{request:randomUUID(),hash:hash('wrong-inventory-decision'),token:ip.token}),/POS_IMPORT_CONFLICT/);
 assert.equal(await sql(`select count(*) from pos_inventory where variant_id='${variant}'`),'0','rejected update must not create records');
 await call('inventory','apply',inventory.map(r=>({...r,decision:'create'})),{request:randomUUID(),hash:hash('inventory'),token:ip.token});
 const again=await call('inventory','preview',inventory);
 const againOptions={request:randomUUID(),hash:hash('same-absolute-values-new-export'),token:again.token};
 const againRows=inventory.map(r=>({...r,decision:'update'}));
 const againResult=await call('inventory','apply',againRows,againOptions);
 assert.equal((await call('inventory','apply',againRows,againOptions)).id,againResult.id);
 assert.equal(await sql(`select quantity from pos_inventory where variant_id='${variant}'`),'10.000','reimport replaces, never adds');
 assert.equal(await sql(`select count(*) from pos_inventory where variant_id='${variant}'`),'1');
 const replace = rows([{code:'000123',quantity:4}]);
 const rp = await call('inventory','preview',replace); assert.equal(rp.rows[0].inventoryExists,true);
 const replacement = await call('inventory','apply',replace.map(r=>({...r,decision:'update'})),{request:randomUUID(),hash:hash('inventory-absolute'),token:rp.token});
 assert.equal(await sql(`select quantity from pos_inventory where variant_id='${variant}'`),'4.000');
 await call('inventory','revert',[],{run:replacement.id});
 assert.equal(await sql(`select quantity from pos_inventory where variant_id='${variant}'`),'10.000');
 const stale = await call('inventory','preview',replace);
 await sql(`update pos_inventory set reserved_quantity=8 where variant_id='${variant}'`);
 await assert.rejects(() => call('inventory','apply',replace.map(r=>({...r,decision:'update'})),{request:randomUUID(),hash:hash('stale'),token:stale.token}));
 const reserved = await call('inventory','preview',replace);
 await assert.rejects(() => call('inventory','apply',replace.map(r=>({...r,decision:'update'})),{request:randomUUID(),hash:hash('reserved'),token:reserved.token}));
 await assert.rejects(() => call('products','revert',[],{run:imported.id}));
 const customers = rows([{code:'0009',first_name:'SYNTHETIC CLIENT',phone:'0005550100',email:'synthetic@example.test'}]);
 const cp = await call('customers','preview',customers);
 const ci = await call('customers','apply',customers.map(r=>({...r,decision:'create'})),{request:randomUUID(),hash:hash('customers'),token:cp.token});
 assert.equal((await call('customers','preview',customers)).rows[0].matches.length,1);
 assert.equal(await sql("select count(*) from pos_customers where brand_slug='synthetic-import-a'"),'1');
 await call('customers','revert',[],{run:ci.id});
 assert.equal(await sql("select count(*) from pos_customers where brand_slug='synthetic-import-a'"),'0');
 assert.equal((await call('customers','revert',[],{run:ci.id})).status,'reverted');
 await assert.rejects(() => sql(`set role anon;select public.pos_import_v1('synthetic-import-a','${ids.owner}','products',null,'preview')`));
 await assert.rejects(() => sql('set role authenticated;select * from pos_import_runs'));
 console.log('PASS REAL LOCAL POSTGRESQL: migration, durable records, exact repeat, changed retry rejection, same-file rejection, brand isolation, omitted fields, absolute stock, reserved stock rejection, rollback and later-operation barrier, role denials. No remote data used.');
 await sql(fs.readFileSync('supabase/migrations/20261014140000_pos_product_delivery_save.sql','utf8'));
 for (const file of ['20261010160000_brand_online_store_access_a1.sql','20261010180000_pos_product_sales_channels_m1.sql']) {
  await sql(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 }
 const payload = {
  p_brand_id:ids.brand,p_brand_slug:'synthetic-import-a',p_location_id:ids.location,p_category_id:null,
  p_name:'SYNTHETIC DELIVERY',p_description:null,p_product_type:'physical',p_inventory_mode:'direct',
  p_default_unit_code:'piece',p_has_variants:false,p_sellable:true,p_purchasable:true,p_tax_rate:0,
  p_image_url:null,p_configuration:{},p_user_id:ids.owner,p_product_code:'DELIVERY-001',
  p_variants:[{name:'Única',sku:'DELIVERY-001',price:100,cost:40,initial_quantity:3,minimum_quantity:0,attributes:{},is_default:true}],
 };
 const save = async (body,key,channels=null) => JSON.parse(await sql(`set role service_role;select pos_create_product_delivery_v1(${quote(JSON.stringify(body))}::jsonb,'${key}',${channels===null?'null':quote(JSON.stringify(channels))+'::jsonb'})`));
 const key=randomUUID();
 const saved=await Promise.all([save(payload,key),save(payload,key)]);
 assert.ok(saved[0].id);assert.deepEqual(saved[0],saved[1]);
 assert.deepEqual(await save(payload,key),saved[0]);
 assert.equal(await sql(`select count(*) from pos_products where id='${saved[0].id}'`),'1');
 assert.equal(await sql(`select sum(quantity) from pos_inventory where variant_id in (select id from pos_product_variants where product_id='${saved[0].id}')`),'3.000');
 await assert.rejects(()=>save({...payload,p_name:'CHANGED'},key),/POS_CREATE_RETRY_CONFLICT/);
 await assert.rejects(()=>save(payload,key,{physicalRequested:true,onlineRequested:false}),/POS_CREATE_RETRY_CONFLICT/);
 await assert.rejects(()=>save({...payload,p_user_id:ids.other},randomUUID()),/POS_CHANNELS_DENIED/);
 await assert.rejects(()=>save({...payload,p_brand_id:ids.brandB},randomUUID()),/POS_CHANNELS_DENIED/);
 const invalidKey=randomUUID();
 await assert.rejects(()=>save({...payload,p_name:''},invalidKey));
 assert.equal(await sql(`select count(*) from pos_product_create_receipts where request_id='${invalidKey}'`),'0');
 const pendingPayload={...payload,p_product_code:'DELIVERY-002',p_variants:[{...payload.p_variants[0],sku:'DELIVERY-002'}]};
 const pendingKey=randomUUID(),channels={physicalRequested:true,onlineRequested:true};
 const pending=await save(pendingPayload,pendingKey,channels);
 assert.equal(pending.channelResult.status,'pending','disabled store must not be reported as published');
 assert.deepEqual(await save(pendingPayload,pendingKey,channels),pending);
 assert.deepEqual(JSON.parse(await sql(`select configuration->'requestedSalesChannels' from pos_products where id='${pending.id}'`)),channels);
 assert.match(pending.channelResult.message,/no está habilitada/);
 await sql(`update user_profiles set role='admin' where user_id='${ids.owner}';set role service_role;select brand_online_store_set_access_a1('synthetic-import-a','${ids.owner}','enabled',0)`);
 const livePayload={...payload,p_product_code:'DELIVERY-003',p_variants:[{...payload.p_variants[0],sku:'DELIVERY-003'}]};
 const liveKey=randomUUID(),live=await save(livePayload,liveKey,channels);
 assert.equal(live.channelResult.status,'saved');
 assert.deepEqual(await save(livePayload,liveKey,channels),live);
 assert.equal(await sql(`select physical_requested and online_requested from pos_product_sales_channels where product_id='${live.id}'`),'t');
 await assert.rejects(()=>sql(`set role anon;select pos_create_product_delivery_v1('{}','${randomUUID()}',null)`),/permission denied/);
 await assert.rejects(()=>sql('set role authenticated;select * from pos_product_create_receipts'),/permission denied/);
 console.log('PASS REAL PRODUCT DELIVERY: migration, concurrent creation/retry, one stock receipt, changed payload/channels rejected, actor/brand denied, invalid creation atomic, pending channels persisted and replayed, role denials.');
} catch (error) {
 console.error('LOCAL PERSISTENCE NOT CERTIFIED:', error.message);
 process.exitCode = 1;
} finally {
 if (created) {
  try { await destination(); await exec(['dropdb','-U','postgres',database]); console.log('Removed ONLY disposable database',database); }
  catch { console.error('Cleanup pending for exact disposable database',database); process.exitCode=1; }
 }
}
