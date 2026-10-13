// M3: local Docker only; creates a new database, never applies SQL to postgres.
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const socketPath = '\\\\.\\pipe\\dockerDesktopLinuxEngine';
const database = 'cometa_m4_' + Date.now();
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
  assert.match(database, /^cometa_m4_\d+$/);
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
 for(const file of ['20261010160000_brand_online_store_access_a1.sql','20261010180000_pos_product_sales_channels_m1.sql','20261010200000_pos_product_web_content_m2.sql']){
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
 const variant2=randomUUID(),variant3=randomUUID(),foreign=randomUUID();
 const photo=`m1-brand/web/${randomUUID()}/${randomUUID()}.jpg`,photoB=`m1-other/web/${randomUUID()}/${randomUUID()}.jpg`;
 await sql(`begin;set local session_replication_role=replica;
 insert into pos_product_variants(id,brand_id,brand_slug,product_id,name,sku,price,attributes,active,variant_signature) values
 ('${variant2}','${ids.brand}','m1-brand','${ids.product}','Rosa M','M2M',120,'{"color":"Rosa","size":"M"}',true,'m2m'),
 ('${variant3}','${ids.brand}','m1-brand','${ids.product}','Negro S','M2N',130,'{"color":"Negro","size":"S"}',true,'m2n');
 insert into pos_products(id,brand_id,brand_slug,name) values('${foreign}','${ids.brandB}','m1-other','Foreign');
 insert into storage.buckets(id,name,public) values('pos-products','pos-products',true) on conflict do nothing;
 insert into storage.objects(bucket_id,name) values('pos-products','${photo}'),('pos-products','${photoB}');commit;`);
 const document={colors:[{id:randomUUID(),name:'Rosa',variantIds:[ids.variant,variant2],hex:'#bb397d',swatchPath:'',photos:[{path:photo,alt:'Fixture'}]},{id:randomUUID(),name:'Negro',variantIds:[variant3],hex:'',swatchPath:'',photos:[]}],benefits:[],details:[],guide:{content:'',columns:[],rows:[],imagePath:''},relatedIds:[ids.legacy],wholesale:{enabled:false,title:'',content:''}};
 await sql(fs.readFileSync('supabase/migrations/20261011100000_brand_storefront_appearance_m3.sql','utf8'));
 await sql(fs.readFileSync('supabase/migrations/20261011120000_storefront_catalog_m4.sql','utf8'));
 const kinds=['hero','marquee','categories','featured','look','videos','testimonials','benefits','wholesale','faq','newsletter'];
 const catalog={title:'Catálogo fixture',description:'Publicado',banner:'',columns:3,ratio:'portrait',secondImage:true,swatches:true,filters:['category','color','size','price','available'],sort:'newest',perPage:8};
 const appearance={name:'Fixture',logo:'',announcement:'',footer:'',paper:'#fff9f5',ink:'#29191f',accent:'#740a32',soft:'#fce5ec',font:'editorial',spacing:64,motion:true,entrance:false,navigation:[],sections:kinds.map(kind=>({kind,enabled:false,title:'',text:'',image:'',url:'',entries:[]})),catalog};
 const read=async(q={},slug='m1-brand')=>{const s=await sql(`set role anon;select brand_storefront_catalog_m4(${quote(slug)},${quote(JSON.stringify(q))})`);return s?JSON.parse(s):null;};
 const save=(doc,rev,publish=true)=>sql(`set role service_role;select brand_storefront_save_m3('m1-brand','${ids.owner}',${rev},${quote(JSON.stringify(doc))},${publish})`);
 assert.equal(await read(),null);
 await sql(`set role service_role;select brand_online_store_set_access_a1('m1-brand','${ids.admin}','enabled',0)`);
 await save(appearance,0);assert.equal((await read()).total,0);
 await sql(`set role service_role;select pos_set_product_channels_m1('m1-brand','${ids.product}','${ids.owner}',true,true,0)`);
 document.details=[{id:randomUUID(),title:'Descripción pública',content:'algodón editorial',enabled:true,open:false}];
 await sql(`set role service_role;select pos_save_product_web_m2('m1-brand','${ids.product}','${ids.owner}',0,${quote(JSON.stringify(document))},true)`);
 const cat=randomUUID(),privateCat=randomUUID();
 const hiddenVariant=randomUUID();
 await sql(`begin;set local session_replication_role=replica;
 insert into pos_categories(id,brand_id,brand_slug,name) values('${cat}','${ids.brand}','m1-brand','Prendas'),('${privateCat}','${ids.brand}','m1-brand','PRIVATE CATEGORY');
 update pos_products set category_id='${cat}' where id='${ids.product}';
 update pos_products set category_id='${privateCat}',description='PRIVATE DESCRIPTION' where id='${ids.legacy}';
 insert into pos_product_variants(id,brand_id,brand_slug,product_id,name,price,active,variant_signature,attributes) values('${hiddenVariant}','${ids.brand}','m1-brand','${ids.legacy}','PRIVATE VARIANT',1,true,'hidden','{"size":"PRIVATE SIZE"}');
 update pos_product_variants set attributes='{"color":"Rosa","size":"S"}' where id='${ids.variant}';
 insert into pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity,reserved_quantity) values('${ids.brand}','m1-brand','${ids.location}','${variant2}',1,0),('${ids.brand}','m1-brand','${ids.location}','${variant3}',1,1);commit;`);
 let result=await read();assert.equal(result.total,1);assert.equal(result.categories.length,1);assert.equal(result.categories[0].value,cat);
 const hiddenDocument={...document,relatedIds:[],colors:[{...document.colors[0],name:'PRIVATE COLOR',variantIds:[hiddenVariant]}]};
 await sql(`set role service_role;select pos_save_product_web_m2('m1-brand','${ids.legacy}','${ids.owner}',0,${quote(JSON.stringify(hiddenDocument))},true)`);
 assert.equal(JSON.stringify(await read()).includes('PRIVATE'),false,'M2 published without M1 is absent even from facets');
 await sql(`set role service_role;select pos_set_product_channels_m1('m1-brand','${ids.legacy}','${ids.owner}',true,true,0)`);
 assert.equal((await read()).total,2);
 await sql(`set role service_role;select pos_set_product_channels_m1('m1-brand','${ids.legacy}','${ids.owner}',true,false,1)`);
 assert.equal(JSON.stringify(await read()).includes('PRIVATE'),false,'removing M1 immediately removes result/facets');
 assert.equal((await read({color:'Negro',size:'M'})).total,0,'must match SAME variant');
 assert.equal((await read({color:'Rosa',size:'M',available:true})).total,1);
 assert.equal((await read({color:'Rosa',size:'S',available:true})).total,0);
 assert.equal((await read({color:'Negro',available:true})).total,0,'reserved unit is not available');
 assert.equal((await read({color:'Negro'})).total,1,'sold-out color remains published');
 assert.equal((await read({q:'algodón'})).total,1);assert.equal((await read({q:'PRIVATE'})).total,0);
 assert.equal((await read({category:privateCat})).total,0);
 assert.equal((await read({min:'110',max:'125',color:'Rosa',size:'S'})).total,0,'price and attributes same variant');
 assert.equal(result.products[0].colors.find(c=>c.name==='Negro').photos.length,0,'no cross-color fallback');
 assert.equal(result.products[0].min,100);assert.equal(result.products[0].max,130);
 const draft={...appearance,catalog:{...catalog,title:'DRAFT SECRET',columns:5}};await save(draft,1,false);assert.equal((await read()).appearance.catalog.title,'Catálogo fixture');
 await assert.rejects(()=>save({...appearance,catalog:{...catalog,banner:photoB}},2),/MEDIA_INVALID/);
 const race=await Promise.allSettled([save(draft,2,false),save(draft,2,false)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 // Extra public fixture products for stable pagination, not real inventory writes.
 for(let i=0;i<9;i++){
  const p=randomUUID(),v=randomUUID(),doc={...document,colors:[{...document.colors[0],variantIds:[v]}]};
  await sql(`begin;set local session_replication_role=replica;
  insert into pos_products(id,brand_id,brand_slug,name,sellable,category_id,created_at) values('${p}','${ids.brand}','m1-brand','Fixture ${i}',true,'${cat}','2026-10-01');
  insert into pos_product_variants(id,brand_id,brand_slug,product_id,name,price,active,variant_signature,attributes) values('${v}','${ids.brand}','m1-brand','${p}','M',${200+i},true,'fixture${i}','{"size":"M"}');
  insert into pos_product_sales_channels(product_id,physical_requested,online_requested,revision,updated_by) values('${p}',true,true,1,'${ids.owner}');
  insert into pos_product_web_content(product_id,brand_id,revision,draft,published,published_revision,updated_by,published_at) values('${p}','${ids.brand}',1,${quote(JSON.stringify(doc))},${quote(JSON.stringify(doc))},1,'${ids.owner}',now());commit;`);
 }
 const snapshot=()=>sql(`select jsonb_build_object('products',(select jsonb_agg(x order by id) from pos_products x),'variants',(select jsonb_agg(x order by id) from pos_product_variants x),'inventory',(select jsonb_agg(x) from pos_inventory x),'comu',(select jsonb_agg(x) from comu_product_listings x))`);
 const before=await snapshot();
 const first=await read({sort:'price_asc'}),second=await read({sort:'price_asc',page:2});assert.equal(first.total,10);assert.equal(first.products.length,8);assert.equal(second.products.length,2);assert.equal(new Set([...first.products,...second.products].map(p=>p.id)).size,10);
 assert.deepEqual(first,(await read({sort:'price_asc'})));assert.equal(first.products[0].min,100);assert.equal((await read({sort:'price_desc'})).products[0].min,208);
 assert.equal((await read({sort:'newest'})).products[0].id,ids.product);
 assert.equal((await read({sort:'name'})).products[0].name,'Fixture 0');assert.equal((await read({page:100})).products.length,0);
 assert.equal(JSON.stringify(first).includes('PRIVATE'),false);assert.equal(await read({},'m1-other'),null);
 assert.equal(await snapshot(),before);
 const {certify}=await import('./test-storefront-m4-http.mjs');await certify({sql,quote});
 await sql(`set role service_role;select brand_online_store_set_access_a1('m1-brand','${ids.admin}','suspended',1)`);assert.equal(await read(),null);
 console.log('PASS M4 SQL: gates, public facets/counts, cross-brand, same-variant filters, reserved stock, M2 description/photos, ranges, stable pagination, draft/CAS/banner, suspension and read invariance');
}finally{if(created){await destination();await exec(['dropdb','-U','postgres','--force',database]);console.log('Dropped only',database);}}
