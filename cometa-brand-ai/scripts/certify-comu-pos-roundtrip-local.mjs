// Explicit LOCAL TEST certification. Runtime operations use real user sessions/APIs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import ts from 'typescript';
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
const url='http://127.0.0.1:54321',origin='http://localhost:3000';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,url);assert.ok(!process.env.VERCEL);assert.notEqual(process.env.NODE_ENV,'production');
const project='zhtagqrzyovsrmsicaot',container='supabase_db_'+project;
assert.ok(fs.readFileSync('supabase/config.toml','utf8').includes(`project_id = "${project}"`));
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
const dock=(args,input)=>execFileSync(docker,['--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],{input,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
assert.ok(JSON.parse(dock(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'].some(p=>p.HostPort==='54322'));
assert.ok(JSON.parse(dock(['inspect','supabase_kong_'+project]))[0].NetworkSettings.Ports['8000/tcp'].some(p=>p.HostPort==='54321'));
console.log('LOCAL CONFIRMED',url,'PostgreSQL 127.0.0.1:54322',project);
const sql=q=>dock(['exec','-i','-u','postgres',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'],q).trim();
const rows=q=>JSON.parse(sql(`select coalesce(json_agg(q),'[]') from (${q}) q;`));
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const output='docs/visual-evidence/comu-product-editor-v3b/pos-roundtrip';fs.mkdirSync(output,{recursive:true});
const stateFile='.env.comu-pos-roundtrip-fixture.json';
assert.equal(execFileSync('git',['check-ignore',stateFile],{encoding:'utf8'}).trim(),stateFile);
const old=JSON.parse(fs.readFileSync('.env.comu-certification-fixture.json','utf8'));
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{tag:'local-test-comu-pos-'+Date.now(),results:[]};
const persist=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
function sellerA(){return {
  access:rows(`select * from public.user_brand_access where user_id=${quote(old.users.a.id)} order by brand_slug`),
  subscriptions:rows(`select * from public.pos_subscriptions where brand_slug=${quote(old.users.a.slug)}`),
  seller:rows(`select * from public.comu_sellers where id=${quote(old.users.a.sellerId)}`),
  storefront:rows(`select * from public.comu_storefronts where seller_id=${quote(old.users.a.sellerId)}`),
  catalogHash:rows(`select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text,'')) hash from public.pos_products p where brand_slug=${quote(old.users.a.slug)}`),
  variantsHash:rows(`select md5(coalesce(jsonb_agg(to_jsonb(v) order by v.id)::text,'')) hash from public.pos_product_variants v where brand_slug=${quote(old.users.a.slug)}`),
  inventoryHash:rows(`select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id)::text,'')) hash from public.pos_inventory i where brand_slug=${quote(old.users.a.slug)}`)
};}
state.sellerABefore??=sellerA();persist();
function pass(name,detail={}){console.log('PASS',name);state.results.push({name,...detail});persist();}
const history=rows('select version from supabase_migrations.schema_migrations order by version');
const mode=process.argv[2];
assert.ok(['--apply-m1','--run','--verify'].includes(mode),'Use --apply-m1, --run or --verify explicitly');
if(mode==='--verify'){
  assert.ok(state.comuProductId&&state.posProductId,'Run HTTP certification first');
  const inventory=rows(`select v.id,v.product_id,v.sku,v.attributes,i.location_id,i.quantity,i.reserved_quantity,i.quantity-i.reserved_quantity available from public.pos_product_variants v join public.pos_inventory i on i.variant_id=v.id where v.brand_slug=${quote(state.slug)} order by v.product_id,v.sku`);
  assert.equal(inventory.length,13);
  for(const row of inventory){assert.equal(row.location_id,state.locationId);assert.equal(Number(row.reserved_quantity),0);assert.equal(Number(row.quantity),row.product_id===state.comuProductId?8:7);assert.equal(Number(row.available),Number(row.quantity));if(row.attributes.size==='CH')assert.ok(row.sku.endsWith('-C'));if(row.attributes.size==='XL')assert.ok(row.sku.endsWith('-X'));}
  assert.deepEqual(sellerA(),state.sellerABefore);
  const subscription=rows(`select plan_code,status,contracted_price,promotion_code from public.pos_subscriptions where brand_slug=${quote(state.slug)}`);
  assert.equal(subscription[0].status,'active');assert.equal(subscription[0].promotion_code,'LOCAL_TEST_ONLY');
  const security=rows("select tgname from pg_trigger where not tgisinternal and tgrelid in ('public.pos_devices'::regclass,'public.pos_staff_sessions'::regclass) order by tgname");
  fs.writeFileSync(output+'/inventory-verification.json',JSON.stringify({inventory,subscription,security,sellerAPreserved:true},null,2));console.log('PASS physical stock 12x8 + 1x7; reserved 0; SKU CH=C XL=X; Seller A unchanged');process.exit(0);
}
if(mode==='--apply-m1'){
  const deps=rows("select to_regclass('public.brands') brands,to_regclass('public.pos_locations') locations,to_regclass('public.pos_staff') staff,to_regclass('public.pos_staff_sessions') sessions,to_regclass('public.pos_business_profiles') profiles,to_regprocedure('public.pos_food_actor_v1(text,uuid,uuid)') actor")[0];
  assert.ok(Object.values(deps).every(Boolean),'Missing M1 dependency: stop');
  console.log('Dependencies',JSON.stringify(deps));
  if(!history.some(h=>h.version==='20261002120000')){
    const migration=fs.readFileSync('supabase/migrations/20261002120000_pos_device_foundation_v1.sql','utf8').replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,'');
    sql(`begin; ${migration}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('20261002120000','pos_device_foundation_v1',array[]::text[]); commit; notify pgrst,'reload schema';`);
  }
  const proof=rows("select c.relrowsecurity rls,has_table_privilege('authenticated','public.pos_devices','INSERT') authenticated_insert,has_function_privilege('authenticated','public.pos_revoke_device_v1(text,uuid,uuid)','EXECUTE') authenticated_revoke from pg_class c where c.oid='public.pos_devices'::regclass");
  assert.deepEqual(proof,[{rls:true,authenticated_insert:false,authenticated_revoke:false}]);
  assert.deepEqual(sellerA(),state.sellerABefore);
  fs.writeFileSync(output+'/m1-installation.json',JSON.stringify({url,postgres:'127.0.0.1:54322',project,dependencies:deps,applied:'20261002120000',proof,sellerAPreserved:true},null,2));pass('M1 local installation');
  process.exit(0);
}
assert.ok(rows("select version from supabase_migrations.schema_migrations where version='20261002120000'").length);
const localFetch=(input,options={})=>{assert.equal(new URL(typeof input==='string'?input:input.url).origin,url);return fetch(input,{...options,redirect:'error'});};
const admin=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,{global:{fetch:localFetch},auth:{persistSession:false,autoRefreshToken:false}});
async function session(user){const jar=new Map();const auth=createServerClient(url,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{global:{fetch:localFetch},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(c=>jar.set(c.name,c.value))}});assert.equal((await auth.auth.signInWithPassword({email:user.email,password:user.password})).error,null);return async(route,method='GET',body)=>{assert.ok(route.startsWith('/api/'));const r=await fetch(origin+route,{method,headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(60000)});for(const raw of r.headers.getSetCookie()){const kv=raw.split(';')[0],i=kv.indexOf('=');jar.set(kv.slice(0,i),kv.slice(i+1));}return {status:r.status,data:await r.json()};};}
function ok(r,label){assert.ok(r.status>=200&&r.status<300,`${label}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
if(!state.user){const email=state.tag+'@example.test',password=crypto.randomBytes(24).toString('base64url')+'!a9';const r=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{local_test:state.tag}});assert.equal(r.error,null);state.user={id:r.data.user.id,email,password};persist();assert.equal((await admin.from('user_profiles').upsert({user_id:state.user.id,email,role:'client',status:'active'})).error,null);}
const S=await session(state.user),D=await session(old.users.admin);
if(!state.sellerId){
 const found=await admin.from('comu_seller_applications').select('id').eq('user_id',state.user.id).maybeSingle();assert.equal(found.error,null);
 if(!found.data)ok(await S('/api/comu/seller-applications','POST',{contact_name:'LOCAL TEST COMU POS',business_name:state.tag,email:state.user.email,phone:'5550000100',city:'LOCAL TEST',business_type:'Retail'}),'application');
 const apps=ok(await D('/api/comu/admin/applications'),'applications');const application=apps.applications.find(a=>a.user_id===state.user.id);assert.ok(application);
 const review=ok(await D('/api/comu/admin/applications','POST',{applicationId:application.id,decision:'APPROVED',note:'LOCAL TEST separate COMU + POS certification'}),'approval');
 state.applicationId=application.id;state.sellerId=review.application.seller_id;state.brandId=review.application.brand_id;
 const sellers=ok(await S('/api/comu/sellers?mine=1'),'sellers');const seller=sellers.sellers.find(s=>s.id===state.sellerId);state.slug=seller.brand_slug;persist();
}
// Explicit TEST POS owner access for this separate fixture only, never Seller A.
assert.notEqual(state.user.id,old.users.a.id);assert.notEqual(state.slug,old.users.a.slug);
sql(`insert into public.user_brand_access(user_id,brand_slug,access_role,status) select ${quote(state.user.id)},${quote(state.slug)},'owner','active' where not exists(select 1 from public.user_brand_access where user_id=${quote(state.user.id)} and brand_slug=${quote(state.slug)});`);
ok(await D('/api/pos/subscription','POST',{brandSlug:state.slug,action:'initialize'}),'subscription initialize');
ok(await D('/api/pos/subscription','POST',{brandSlug:state.slug,action:'set_offer',contractedPrice:0,promotionCode:'LOCAL_TEST_ONLY',priceLocked:true,status:'active'}),'TEST subscription');
ok(await S('/api/pos/profile','POST',{brandSlug:state.slug,profileCode:'retail',operationMode:'single'}),'retail profile');
state.locationId=rows(`select id from public.pos_locations where brand_slug=${quote(state.slug)} and active order by created_at limit 1`)[0]?.id;
if(!state.locationId){ok(await S('/api/pos/locations','POST',{brandSlug:state.slug,name:'LOCAL TEST branch',code:'LOCAL_TEST',addressLine1:'LOCAL TEST ONLY'}),'create location');state.locationId=rows(`select id from public.pos_locations where brand_slug=${quote(state.slug)} and active order by created_at limit 1`)[0]?.id;}
assert.ok(state.locationId);persist();
state.operatorPin??=String(crypto.randomInt(100000,1000000));persist();
if(!state.staffId){const staff=ok(await S('/api/pos/staff','POST',{brandSlug:state.slug,name:'LOCAL TEST POS Admin',role:'ADMIN',locationId:state.locationId,pin:state.operatorPin}),'staff');state.staffId=staff.staff.id;persist();}
const device=ok(await S('/api/pos/devices','POST',{brandSlug:state.slug,locationId:state.locationId,label:'LOCAL TEST COMU POS round trip'}),'device enrollment');
ok(await S('/api/pos/operator-session','POST',{brandSlug:state.slug,action:'login',staffId:state.staffId,pin:state.operatorPin}),'operator login');
ok(await S('/api/pos/operator-session','POST',{brandSlug:state.slug,action:'admin'}),'operator admin');
pass('COMU approval + TEST POS subscription + device + ADMIN operator',{deviceEnrolled:!!device});
for(const [code,name,options,order] of [['color','Color',['Negro','Rosa','Beige'],1],['size','Talla',['CH','M','G','XL'],2]])sql(`insert into public.pos_product_attribute_definitions(brand_id,brand_slug,code,name,input_type,options,sort_order,required,use_in_variant_name,active) select ${quote(state.brandId)},${quote(state.slug)},${quote(code)},${quote(name)},'select',${quote(JSON.stringify(options))}::jsonb,${order},false,true,true where not exists(select 1 from public.pos_product_attribute_definitions where brand_id=${quote(state.brandId)} and code=${quote(code)});`);
const engine=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(fs.readFileSync('src/lib/pos/product-variants.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const comu=async()=>ok(await S('/api/comu/seller/catalog?sellerId='+state.sellerId),'COMU read');
const pos=async()=>ok(await S('/api/pos/products?brandSlug='+state.slug+'&pageSize=100'),'POS read');
if(!state.comuProductId){const attrs=engine.generateCombinations([{code:'color',values:['Negro','Rosa','Beige']},{code:'size',values:['CH','M','G','XL']}],100);assert.equal(attrs.length,12);const generated=engine.generateMissingSkus(attrs.map(attributes=>({sku:'',attributes,name:Object.values(attributes).join(' / '),price:499,active:true,stock:[{locationId:state.locationId,quantity:8,expectedQuantity:0}]})),'RTC001',[{code:'color',sort_order:1},{code:'size',sort_order:2}]);
 const result=ok(await S('/api/comu/seller/catalog','POST',{sellerId:state.sellerId,requestId:crypto.randomUUID(),product:{name:'LOCAL TEST COMU to POS',description:'Disposable round-trip fixture',productCode:'RTC001',variants:generated.variants}}),'COMU create');state.comuProductId=result.productId;state.listingId=result.listingId;persist();
 ok(await S('/api/comu/listings','PATCH',{sellerId:state.sellerId,listingId:state.listingId,status:'PUBLISHED'}),'publish');}
function identities(snapshot,id){return snapshot.variants.filter(v=>v.product_id===id).map(v=>({id:v.id,sku:v.sku,attributes:v.attributes,active:v.active})).sort((a,b)=>a.id.localeCompare(b.id));}
function check(c,p,id){const product=p.products.find(p=>p.id===id);assert.ok(product);const shared=identities(c,id);assert.deepEqual(product.variants.map(v=>({id:v.id,sku:v.sku,attributes:v.attributes,active:v.active})).sort((a,b)=>a.id.localeCompare(b.id)),shared);for(const v of product.variants){const ci=c.inventory.filter(i=>i.variant_id===v.id).map(i=>({location:i.location_id,quantity:Number(i.quantity),reserved:Number(i.reserved_quantity)})).sort((a,b)=>String(a.location).localeCompare(String(b.location)));assert.deepEqual(v.inventory.map(i=>({location:i.location_id,quantity:Number(i.quantity),reserved:Number(i.reserved_quantity)})).sort((a,b)=>String(a.location).localeCompare(String(b.location))),ci);}return product;}
let c=await comu(),p=await pos();let product=check(c,p,state.comuProductId);assert.equal(product.variants.length,12);state.comuIdentities=identities(c,product.id);persist();pass('COMU -> POS API 12 IDs/SKU/attributes/inventory');
const payload=p=>({brandSlug:state.slug,locationId:state.locationId,action:'update_product',productId:p.id,name:p.name,productCode:p.product_code,description:p.description,categoryId:p.category_id,productType:p.product_type,inventoryMode:p.inventory_mode,defaultUnitCode:p.default_unit_code,hasVariants:p.has_variants,sellable:p.sellable,purchasable:p.purchasable,taxRate:p.tax_rate,imageUrl:p.image_url,configuration:p.configuration,variants:p.variants.map(v=>({id:v.id,name:v.name,sku:v.sku,barcode:v.barcode,price:Number(v.price),cost:Number(v.cost||0),attributes:v.attributes,unitCode:v.unit_code,imageUrl:v.image_url,sortOrder:v.sort_order,configuration:v.configuration,active:v.active}))});
const update=payload(product);update.variants[0].price=525;const changedId=update.variants[0].id;
ok(await S('/api/pos/products','PATCH',update),'POS edit');c=await comu();p=await pos();check(c,p,state.comuProductId);assert.deepEqual(identities(c,state.comuProductId),state.comuIdentities);assert.equal(Number(c.variants.find(v=>v.id===changedId).price),525);pass('POS edit -> COMU same identities and stock');
if(!state.posProductId){const result=ok(await S('/api/pos/products','POST',{brandSlug:state.slug,locationId:state.locationId,name:'LOCAL TEST POS to COMU',productCode:'RTP001',productType:'physical',inventoryMode:'direct',defaultUnitCode:'piece',hasVariants:true,sellable:true,purchasable:true,taxRate:0,variants:[{name:'Negro / M',sku:'RTP001-N-M',price:299,cost:0,initialQuantity:7,minimumQuantity:0,attributes:{color:'Negro',size:'M'},unitCode:'piece',sortOrder:0,active:true}]}),'POS create');state.posCreateKeys=Object.keys(result);state.posProductId=result.product?.id||result.productId;assert.ok(state.posProductId,'POS response keys '+Object.keys(result));persist();}
c=await comu();p=await pos();product=check(c,p,state.posProductId);const before=identities(c,product.id),cp=c.products.find(p=>p.id===product.id),cv=c.variants.filter(v=>v.product_id===product.id);
ok(await S('/api/comu/seller/catalog','POST',{sellerId:state.sellerId,requestId:crypto.randomUUID(),product:{id:cp.id,expectedUpdatedAt:cp.updated_at,name:cp.name,description:cp.description,categoryId:cp.category_id,productCode:cp.product_code,variants:cv.map(v=>({id:v.id,name:v.name,sku:v.sku,price:319,attributes:v.attributes,active:v.active}))}}),'COMU edit POS product');
c=await comu();p=await pos();product=check(c,p,state.posProductId);assert.deepEqual(identities(c,product.id),before);assert.equal(Number(product.variants[0].price),319);pass('POS -> COMU -> POS authenticated HTTP');
const A=await session(old.users.a);ok(await A('/api/comu/seller/catalog?sellerId='+old.users.a.sellerId),'Seller A COMU');const denied=await A('/api/pos/products?brandSlug='+old.users.a.slug);assert.equal(denied.status,403);assert.equal(denied.data.code,'POS_BRAND_FORBIDDEN');assert.deepEqual(sellerA(),state.sellerABefore);pass('Seller A unchanged COMU-only; POS DENIED',{http:denied.status,code:denied.data.code});
assert.equal(c.products.length,2);assert.equal(c.variants.length,13);assert.equal(new Set(c.variants.map(v=>v.id)).size,13);assert.equal(new Set(c.variants.map(v=>v.sku)).size,13);pass('No duplicated products/variants/SKU');
const gate=ok(await S('/api/pos/operator-session?brandSlug='+state.slug),'device session');assert.ok(gate.deviceId);assert.ok(gate.adminMode);assert.equal(gate.session.staff.role,'ADMIN');
fs.writeFileSync(output+'/results.json',JSON.stringify({local:{supabase:url,postgres:'127.0.0.1:54322'},fixture:{tag:state.tag,brandSlug:state.slug,sellerId:state.sellerId,comuProductId:state.comuProductId,posProductId:state.posProductId,deviceId:gate.deviceId,operatorRole:gate.session.staff.role},results:state.results,identities:state.comuIdentities,products:2,variants:13,sellerAPreserved:true,duplicates:false,runtime:'Authenticated HTTP COMU/POS; no direct product writes',certified:true},null,2));
console.log('V3B FUNCTIONALLY CERTIFIED = YES');
