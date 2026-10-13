import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const env=parseEnv(fs.readFileSync('.env.local','utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
assert.notEqual(process.env.NODE_ENV,'production');assert.ok(!process.env.VERCEL);
const origin='http://localhost:3000',supabase='http://127.0.0.1:54321';
const localFetch=(input,options={})=>{const u=new URL(typeof input==='string'?input:input.url);assert.equal(u.origin,supabase);return fetch(input,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});};
const admin=createClient(supabase,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}});
let source=fs.readFileSync('scripts/test-comu-seller-approval-postgres-local.mjs','utf8');source=source.slice(source.indexOf('const wire ='),source.indexOf('const db ='));
const scope={fs,net,crypto,vm,Buffer,console,process:{env:{}}};vm.runInNewContext(source+'\nthis.Pg=context.PgWire;',scope);
const db=await new scope.Pg().connect();
async function sql(text){try{return await db.query(text);}catch(error){while((await db.next()).type!=='Z'){}throw error;}}
const chain=['20260928180000_comu_buyer_experience_v1.sql','20261002121000_pos_mutation_api_boundary_v1.sql','20261003130000_comu_seller_approval_v1.sql','20261003150000_comu_seller_catalog_v1.sql'];
const stateFile='.env.comu-certification-fixture.json';
const mode=process.argv[2]||'--inspect';
let fixture=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{tag:'comu-local-cert-'+Date.now(),users:{},results:[]};
const persist=()=>fs.writeFileSync(stateFile,JSON.stringify(fixture,null,2));
const pass=(name,detail='')=>{console.log('PASS',name,detail);fixture.results.push({name,status:'PASS',detail});persist();};
async function session(label){
 const u=fixture.users[label];const jar=new Map();
 const client=createServerClient(supabase,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{global:{fetch:localFetch},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(c=>jar.set(c.name,c.value))}});
 const login=await client.auth.signInWithPassword({email:u.email,password:u.password});assert.equal(login.error,null);assert.equal(login.data.user.id,u.id);
 return {client,async http(path,method='GET',body){
   const response=await fetch(origin+path,{method,headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(60000)});
   for(const raw of response.headers.getSetCookie()){const kv=raw.split(';')[0];const i=kv.indexOf('=');jar.set(kv.slice(0,i),kv.slice(i+1));}
   const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={html:text.slice(0,250)};}
   return {status:response.status,data,location:response.headers.get('location'),accessDenied:/COMU_SELLER_ACCESS_DENIED|No tienes acceso/.test(text),notFound:text.includes('NEXT_HTTP_ERROR_FALLBACK;404')};
 }};
}
async function ok(result,name){assert.ok(result.status>=200&&result.status<300,name+': '+JSON.stringify(result));return result.data;}
try {
 if(mode==='--inspect'){
  console.log('LOCAL ONLY',supabase,'PG 127.0.0.1:54322');
  console.log(await sql("select version from supabase_migrations.schema_migrations order by version desc limit 12"));
  console.log(await sql("select table_name from information_schema.tables where table_schema='public' and table_name in ('comu_seller_applications','comu_buyer_favorites','comu_seller_payment_accounts','comu_catalog_commands','comu_buyers','comu_buyer_addresses')"));
  console.log(await sql("select column_name from information_schema.columns where table_schema='public' and table_name='comu_seller_payment_accounts' order by ordinal_position"));
  console.log(await sql("select has_table_privilege('authenticated','public.pos_products','INSERT') product_write,has_table_privilege('authenticated','public.pos_inventory','UPDATE') inventory_write"));
  console.log(await sql("select id,public from storage.buckets where id='comu-products'"));
 }
 if(mode==='--apply'){
  for(const file of chain){
   const version=file.split('_')[0];const found=await sql(`select version from supabase_migrations.schema_migrations where version='${version}'`);
   if(found.length){console.log('Already recorded',file);continue;}
   let body=fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
   await sql(`begin; ${body}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${file.slice(15,-4)}',array[]::text[]); commit;`);
   console.log('APPLIED LOCAL',file);
  }
  await sql("notify pgrst,'reload schema'");
 }
 if(mode==='--verify'){
  const routines=await sql("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('comu_review_seller_application_v1','comu_admin_seller_state_v1','comu_seller_activation_check_v1','comu_catalog_read_v1','comu_catalog_save_v1') order by proname");assert.equal(routines.length,5);console.log('RPCs',routines);
  const tables=await sql("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('comu_seller_applications','comu_sellers','comu_storefronts','comu_catalog_commands','comu_product_media')");assert.equal(tables.length,5);assert.ok(tables.every(t=>t.relrowsecurity==='t'));console.log('RLS',tables);
  console.log('TRIGGERS',await sql("select trigger_name,event_object_table from information_schema.triggers where trigger_schema='public' and (trigger_name like 'comu_c1_%' or trigger_name='comu_catalog_media_guard') order by trigger_name"));
  console.log('CONSTRAINTS',await sql("select conname from pg_constraint where conrelid in ('public.comu_sellers'::regclass,'public.comu_storefronts'::regclass,'public.comu_catalog_commands'::regclass,'public.pos_inventory'::regclass) order by conname"));
  const grants=await sql("select has_table_privilege('authenticated','public.pos_products','INSERT') product_write,has_table_privilege('authenticated','public.pos_inventory','UPDATE') stock_write,has_function_privilege('anon','public.comu_catalog_save_v1(uuid,uuid,jsonb)','EXECUTE') anon_catalog,has_function_privilege('authenticated','public.comu_catalog_save_v1(uuid,uuid,jsonb)','EXECUTE') member_catalog");assert.deepEqual({...grants[0]},{product_write:'f',stock_write:'f',anon_catalog:'f',member_catalog:'t'});console.log('GRANTS',grants);
  console.log('Storage policies',await sql("select policyname,cmd from pg_policies where schemaname='storage' and (qual like '%comu-products%' or with_check like '%comu-products%')"));
  const A=await session('a'),B=await session('b');
  for(const [rpc,args] of [['comu_review_seller_application_v1',{p_application_id:fixture.users.a.applicationId,p_decision:'APPROVED'}],['comu_admin_seller_state_v1',{p_seller_id:fixture.users.a.sellerId,p_action:'activate'}]]){const r=await A.client.rpc(rpc,args);assert.equal(r.error?.message,'COMU_ADMIN_REQUIRED');}
  const cross=await B.client.rpc('comu_catalog_read_v1',{p_seller:fixture.users.a.sellerId});assert.match(cross.error?.message||'',/COMU_.*(DENIED|REQUIRED)/);
  const protectedState=await A.client.from('comu_storefronts').update({status:'ACTIVE'}).eq('seller_id',fixture.users.a.sellerId);assert.ok(protectedState.error);
  pass('SQL direct security','Real JWT RPC self approval/activation and foreign catalog rejected; storefront state writes denied');
  console.log('LOCAL FIXTURE',fixture.tag,'credentials in ignored '+stateFile);
  console.log('Seller URL',origin+'/comu/seller/'+fixture.users.a.slug+'/products');
  for(const table of ['comu_seller_ledger_entries','comu_seller_settlements']){const r=await admin.from(table).select('id',{count:'exact',head:true}).eq('seller_id',fixture.users.a.sellerId);assert.equal(r.error,null);console.log('LOCAL FINANCE',table,r.count);}
  for(const path of ['/comu/seller/'+fixture.users.a.slug+'/orders','/comu/seller/orders']){const r=await A.http(path);console.log('ORDER PAGE',path,r.status,'streamed notFound',r.notFound);}
 }
 if(mode==='--run'){
  for(const label of ['admin','a','b','rejected','buyer']){
   if(fixture.users[label])continue;
   const email=`${fixture.tag}-${label}@example.test`,password=crypto.randomBytes(18).toString('base64url')+'!a9';
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{local_test:fixture.tag}});assert.equal(error,null);
   fixture.users[label]={id:data.user.id,email,password};persist();
   const profile=await admin.from('user_profiles').upsert({user_id:data.user.id,email,role:label==='admin'?'admin':'client',status:'active'},{onConflict:'user_id'});assert.equal(profile.error,null);
  }
  const A=await session('a'),B=await session('b'),D=await session('admin'),R=await session('rejected'),U=await session('buyer');
  pass('Auth real','GoTrue password sessions + SSR cookies');
  const anon=await fetch(origin+'/api/comu/seller/catalog?sellerId='+crypto.randomUUID());assert.equal(anon.status,401);
  for(const [label,S] of [['a',A],['b',B],['rejected',R]]){
   const existing=await admin.from('comu_seller_applications').select('*').eq('user_id',fixture.users[label].id).maybeSingle();assert.equal(existing.error,null);
   if(!existing.data)await ok(await S.http('/api/comu/seller-applications','POST',{contact_name:'LOCAL TEST '+label,business_name:fixture.tag+' '+label,email:fixture.users[label].email,phone:'5550000100',city:'LOCAL TEST',business_type:'Retail'}),'Application '+label);
  }
  const applications=await ok(await D.http('/api/comu/admin/applications'),'Admin list');
  for(const [label,S] of [['a',A],['b',B],['rejected',R]]){
   const application=applications.applications.find(x=>x.user_id===fixture.users[label].id);assert.ok(application);
   assert.equal((await S.http('/api/comu/admin/applications','POST',{applicationId:application.id,decision:'APPROVED'})).status,403);
   const decision=label==='rejected'?'REJECTED':'APPROVED';
   const reviewed=await ok(await D.http('/api/comu/admin/applications','POST',{applicationId:application.id,decision,note:'LOCAL TEST certification'}),'Review '+label);
   fixture.users[label].applicationId=application.id;fixture.users[label].sellerId=reviewed.application.seller_id;fixture.users[label].brandId=reviewed.application.brand_id;persist();
  }
  pass('Seller application/review HTTP','Real API, approval/rejection, self approval denied');
  const sid=fixture.users.a.sellerId,bid=fixture.users.b.sellerId;
  let sellers=await ok(await A.http('/api/comu/sellers?mine=1'),'Seller access');const seller=sellers.sellers.find(x=>x.id===sid);assert.ok(seller);fixture.users.a.slug=seller.brand_slug;fixture.users.a.storefrontId=(Array.isArray(seller.comu_storefronts)?seller.comu_storefronts[0]:seller.comu_storefronts).id;persist();
  assert.equal((await A.http('/comu/seller/'+seller.brand_slug+'/products')).status,200);
  const crossPage=await B.http('/comu/seller/'+seller.brand_slug+'/products'); console.log('Cross page',crossPage.status,crossPage.location,crossPage.accessDenied); assert.ok(crossPage.accessDenied || [403,404,500].includes(crossPage.status));
  pass('Seller access','Authenticated own seller page returned 200');
  let snapshot=await ok(await A.http('/api/comu/seller/catalog?sellerId='+sid),'Read catalog');
  if(!fixture.catalogStarted){assert.equal(snapshot.products.length,0);fixture.catalogStarted=true;persist();pass('New seller empty catalog');}
  const write={sellerId:sid,requestId:crypto.randomUUID(),product:{name:'Denied',variants:[{name:'Default',price:100,attributes:{}}]}};
  for(const [name,S] of [['cross seller',B],['buyer',U],['rejected',R]])assert.equal((await S.http('/api/comu/seller/catalog','POST',write)).status,403,name);
  assert.equal((await A.http('/api/comu/sellers','PATCH',{sellerId:sid,action:'activate'})).status,403);
  const direct=await A.client.from('pos_products').insert({brand_id:seller.brand_id,brand_slug:seller.brand_slug,name:'DENIED'});assert.ok(direct.error);
  const inventory=await A.client.from('pos_inventory').update({quantity:999}).eq('brand_slug',seller.brand_slug);assert.ok(inventory.error);
  const pos=await A.http('/api/pos/products?brandSlug='+seller.brand_slug);assert.ok([401,403].includes(pos.status),JSON.stringify(pos));
  const accessRows=await admin.from('user_brand_access').select('user_id').eq('user_id',fixture.users.a.id);assert.equal(accessRows.error,null);assert.equal(accessRows.data.length,0);
  pass('HTTP/SQL security','Self activation, cross seller, buyer, rejected, POS API and direct writes denied');
  for(let i=snapshot.products.length;i<10;i++){
   const product={name:`LOCAL TEST product ${i+1}`,description:'Certification fixture, not for sale',categoryName:'LOCAL TEST',variants:[{name:'M / Blue',sku:fixture.tag+'-'+i,price:100,attributes:{size:'M',color:'blue'},stock:[{locationId:snapshot.locations[0]?.id,quantity:20,expectedQuantity:0}]}]};
   const result=await ok(await A.http('/api/comu/seller/catalog','POST',{sellerId:sid,requestId:crypto.randomUUID(),product}),'Create product');
   await ok(await A.http('/api/comu/listings','PATCH',{sellerId:sid,listingId:result.listingId,status:'PUBLISHED'}),'Publish');
   snapshot=await ok(await A.http('/api/comu/seller/catalog?sellerId='+sid),'Catalog refresh');
  }
  fixture.productId=snapshot.products[0].id;fixture.listingId=snapshot.listings.find(l=>l.product_id===fixture.productId).id;persist();
  pass('Catalog HTTP','10 canonical products, variants and physical stock, published via real APIs');
  console.log('PROGRESS',snapshot.progress);
  await ok(await A.http('/api/comu/storefronts','PATCH',{sellerId:sid,name:fixture.tag+' A',description:'LOCAL TEST seller certification storefront',headline:'LOCAL TEST only',city:'Local'}),'Store configuration');
  pass('Storefront configuration HTTP');
  const p=snapshot.products.find(p=>p.id===fixture.productId),v=snapshot.variants.find(v=>v.product_id===p.id),stock=snapshot.inventory.find(i=>i.variant_id===v.id);
  const edit={id:p.id,expectedUpdatedAt:p.updated_at,name:p.name,description:'Edited through real HTTP',categoryId:p.category_id,variants:[{id:v.id,name:v.name,sku:v.sku,price:125,attributes:v.attributes,stock:[{locationId:stock.location_id,quantity:21,expectedQuantity:Number(stock.quantity)}]}]};
  await ok(await A.http('/api/comu/seller/catalog','POST',{sellerId:sid,requestId:crypto.randomUUID(),product:edit}),'Edit variant/stock');
  snapshot=await ok(await A.http('/api/comu/seller/catalog?sellerId='+sid),'Read persisted edits');assert.equal(Number(snapshot.variants.find(x=>x.id===v.id).price),125);assert.equal(Number(snapshot.inventory.find(x=>x.variant_id===v.id).quantity),21);
  pass('Variants/stock real','Persisted canonical price and physical quantity');
  await ok(await A.http('/api/comu/wholesale/product','PUT',{sellerId:sid,listingId:fixture.listingId,mode:'CUSTOM',tiers:[{minQuantity:6,pricingMode:'UNIT_PRICE',value:100}]}),'Wholesale');pass('Wholesale HTTP');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  async function upload(S,sellerId,listingId){const form=new FormData();form.set('sellerId',sellerId);form.set('listingId',listingId);form.set('file',new Blob([png],{type:'image/png'}),'local-cert.png');return S.http('/api/comu/media','POST',form);}
  const own=await ok(await upload(A,sid,fixture.listingId),'Storage upload');fixture.mediaId=own.media.id;persist();
  const imageUrl=new URL(own.media.public_url);assert.equal(imageUrl.origin,supabase);const image=await fetch(imageUrl);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
  const media=await ok(await A.http('/api/comu/media?sellerId='+sid+'&listingId='+fixture.listingId),'Media persisted');assert.ok(media.media.some(m=>m.id===own.media.id));
  const bp=await ok(await B.http('/api/comu/seller/catalog?sellerId='+bid),'B catalog');let bl=bp.listings[0]?.id;
  if(!bl){const r=await ok(await B.http('/api/comu/seller/catalog','POST',{sellerId:bid,requestId:crypto.randomUUID(),product:{name:'LOCAL TEST B asset owner',variants:[{name:'Default',price:100,attributes:{}}]}}),'B own product');bl=r.listingId;}
  const bm=await ok(await upload(B,bid,bl),'B upload');
  assert.equal((await A.http('/api/comu/media','PATCH',{sellerId:sid,mediaId:bm.media.id,isPrimary:false})).status,404);
  assert.equal((await A.http('/api/comu/media','DELETE',{sellerId:sid,mediaId:bm.media.id})).status,404);
  assert.equal((await upload(A,sid,bl)).status,404);pass('Storage real','Upload, persisted metadata, PNG bytes/public URL and cross-seller mutation DENIED');
  snapshot=await ok(await A.http('/api/comu/seller/catalog?sellerId='+sid),'Eligibility');assert.equal(snapshot.progress.publishedListings,10);assert.equal(snapshot.progress.reason,'COMU_CONNECT_REQUIRED');
  assert.equal((await admin.from('comu_sellers').select('status').eq('id',sid).single()).data.status,'PREPARING');pass('10 products / PREPARING','Central eligibility requires real Connect, no automatic activation');
  const activation=await D.http('/api/comu/sellers','PATCH',{sellerId:sid,action:'activate'});assert.equal(activation.status,409);pass('Activation guard HTTP','COMETA cannot bypass missing Connect');
  assert.match(env.COMU_STRIPE_SECRET_KEY,/^(sk|rk)_test_/);
  const account=await A.http('/api/comu/seller/connect/account','POST');fixture.connect={accountStatus:account.status,result:account.data};persist();console.log('CONNECT TEST account',account.status,JSON.stringify(account.data));
  if(account.status===200){
    const configured=env.APP_ORIGIN||env.NEXT_PUBLIC_APP_URL||env.APP_URL;
    assert.ok(!configured||['http://localhost:3000','http://127.0.0.1:3000'].includes(configured.replace(/\/$/,'')));
    const link=await A.http('/api/comu/seller/connect/onboarding-link','POST');fixture.connect.link=link.data;persist();console.log('CONNECT TEST onboarding',link.status,'Link saved privately; manual onboarding required');
  }
  const orders=await A.http('/api/comu/seller/orders?sellerId='+sid);fixture.orders={status:orders.status,count:orders.data.orders?.length};persist();console.log('Seller orders API',orders.status,'count',orders.data.orders?.length);
 }
} finally {await db.close();}
