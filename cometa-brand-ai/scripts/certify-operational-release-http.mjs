// Explicitly authorized remote certification. Mutations ONLY to generated test accounts/brands.
// Real Auth, deployed Next handlers, PostgREST and Storage; no payment/provider requests.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
assert.equal(process.argv[2],'--authorized-synthetic-test');
const dir='.next/release-private-20261011', stateFile=dir+'/http-fixtures.private.json';
const bytes=fs.readFileSync(dir+'/api-keys.private.json');
const keys=JSON.parse(bytes.toString(bytes[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,''));
const url='https://zhtagqrzyovsrmsicaot.supabase.co', origin='https://app.cometaos.com';
const admin=createClient(url,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false,autoRefreshToken:false}});
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{tag:'release-test-'+Date.now(),users:{},results:[]};
const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
const pass=(test,detail)=>{state.results.push({test,detail,status:'PASS',at:new Date().toISOString()});save();console.log('PASS',test,detail||'');};
function checked(result,label){if(result.error)throw Error(label+': '+result.error.code);return result.data;}
async function session(label){
 const u=state.users[label], jar=new Map();
 const client=createServerClient(url,keys.find(k=>k.name==='anon').api_key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(c=>jar.set(c.name,c.value))}});
 const login=await client.auth.signInWithPassword({email:u.email,password:u.password});checked(login,'sign in');assert.equal(login.data.user.id,u.id);
 return {client,async http(path,method='GET',body){
  const response=await fetch(origin+path,{method,headers:{Origin:origin,Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(60000)});
  for(const raw of response.headers.getSetCookie()){const kv=raw.split(';')[0],i=kv.indexOf('=');jar.set(kv.slice(0,i),kv.slice(i+1));}
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=null;}
  return {status:response.status,data,text,location:response.headers.get('location')};
 }};
}
const ok=(r,label)=>{if(r.status<200||r.status>=300)fs.writeFileSync(dir+'/last-http-error.private.json',JSON.stringify({label,status:r.status,data:r.data}));assert.ok(r.status>=200&&r.status<300,label+' HTTP '+r.status);return r.data;};
try {
 for(const label of ['admin','seller','retail']){
  if(state.users[label])continue;
  const email=state.tag+'-'+label+'@example.test',password=randomBytes(24).toString('base64url')+'!a9';
  const created=checked(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{release_test:state.tag}}),'create synthetic account');
  state.users[label]={id:created.user.id,email,password};save();
  checked(await admin.from('user_profiles').upsert({user_id:created.user.id,email,full_name:'PRUEBA ENTREGA '+label,role:label==='admin'?'admin':'client',status:'active'},{onConflict:'user_id'}),'synthetic profile');
 }
 const D=await session('admin'),S=await session('seller'),R=await session('retail');
 if(process.argv[3]==='--final-read-only'){
  const workspace=await D.http('/workspace');assert.equal(workspace.status,200);assert.ok(workspace.text.includes('Solicitudes COMU'));
  const modules=ok(await D.http('/api/admin/brands/'+state.slug+'/modules'),'final modules').modules;
  assert.ok(modules.members.some(m=>m.context==='COMU'&&m.role==='OWNER'));
  assert.ok(modules.members.some(m=>m.context==='OS/POS'&&m.role==='owner'));
  const inbox=ok(await S.http('/api/comu/notifications?audience=SELLER&sellerId='+state.sellerId),'Seller notifications');assert.ok(Number.isInteger(inbox.unreadCount));
  ok(await R.http('/api/pos/products?brandSlug='+state.retail.brand.slug),'final Retail catalog');
  assert.equal((await R.http('/api/admin/access-v2')).status,403);
  for(const route of ['/api/comu/checkout','/api/comu/reservations','/api/comu/payments/intents','/api/comu/shipping/quote'])assert.equal((await S.http(route,'POST',{})).status,503);
  const imageChecks=[];
  for(const base of [origin,'https://magenta-controlled-preview.vercel.app']){
   const image=await fetch(base+'/_next/image?url=%2Flogo.png&w=64&q=75',{redirect:'manual'});
   imageChecks.push({origin:base,status:image.status,redirect:image.headers.get('location')});
  }
  state.imageBoundary={status:'NOT_CERTIFIED',observed:imageChecks};save();
  pass('Final deployment core: Workspace navigation, separate memberships, Seller inbox, POS catalog, purchase closure');
  console.log('PENDING security: platform image endpoint closure not certified; dependency remediation remains.');
  process.exit(0);
 }
 pass('Real Auth + SSR cookies');
 const workspace=await D.http('/workspace');assert.equal(workspace.status,200);assert.ok(!workspace.text.includes('NEXT_HTTP_ERROR_FALLBACK'));pass('Global Workspace admin');
 assert.ok([401,403].includes((await S.http('/api/admin/access-v2')).status));
 assert.equal((await fetch(origin+'/api/admin/access-v2',{redirect:'manual'})).status,401);pass('Client and anonymous cannot administer global access');
 if(!state.applicationId){
  ok(await S.http('/api/comu/seller-applications','POST',{contact_name:'PRUEBA ENTREGA',business_name:state.tag,email:state.users.seller.email,phone:'5550000100',city:'PRUEBA NO COMERCIAL',business_type:'Retail'}),'application');
  const apps=ok(await D.http('/api/comu/admin/applications'),'admin application list');
  const application=apps.applications.find(a=>a.user_id===state.users.seller.id);assert.ok(application);
  state.applicationId=application.id;save();
 }
 if(!state.sellerId){
  assert.equal((await S.http('/api/comu/admin/applications','POST',{applicationId:state.applicationId,decision:'APPROVED'})).status,403);
  const result=ok(await D.http('/api/comu/admin/applications','POST',{applicationId:state.applicationId,decision:'APPROVED',note:'PRUEBA ENTREGA identificada; no venta ni comunicaciones'}),'approval');
  state.sellerId=result.application.seller_id;state.brandId=result.application.brand_id;save();
 }
 const sellers=ok(await S.http('/api/comu/sellers?mine=1'),'seller capabilities');
 const seller=sellers.sellers.find(s=>s.id===state.sellerId);assert.ok(seller);state.slug=seller.brand_slug;save();
 pass('Application → admin approval → owner Seller access',state.slug);
 for(const page of ['summary','products','orders']){const r=await S.http('/comu/seller/'+state.slug+'/'+page);assert.equal(r.status,200);assert.ok(!r.text.includes('Runtime PosApiError'));}
 pass('Seller summary/products/orders SSR');
 assert.equal((await R.http('/api/comu/seller/catalog?sellerId='+state.sellerId)).status,403);pass('Cross-seller catalog denied');
 let catalog=ok(await S.http('/api/comu/seller/catalog?sellerId='+state.sellerId),'catalog');
 if(!state.productId){
  const created=ok(await S.http('/api/comu/seller/catalog','POST',{sellerId:state.sellerId,requestId:randomUUID(),product:{name:'PRUEBA ENTREGA — NO COMERCIAL',description:'Producto sintético sin publicación comercial',variants:[{name:'Default',price:123,attributes:{}}]}}),'create draft product');
  state.productId=created.productId;state.listingId=created.listingId;save();
 }
 catalog=ok(await S.http('/api/comu/seller/catalog?sellerId='+state.sellerId),'read persisted product');
 assert.ok(catalog.products.some(p=>p.id===state.productId));pass('Canonical product persisted', 'DRAFT only; no stock invented');
 const p=catalog.products.find(p=>p.id===state.productId), variants=catalog.variants.filter(v=>v.product_id===p.id);
 ok(await S.http('/api/comu/seller/catalog','POST',{sellerId:state.sellerId,requestId:randomUUID(),product:{id:p.id,expectedUpdatedAt:p.updated_at,name:p.name,description:'Edición verificada por HTTP real — PRUEBA NO COMERCIAL',categoryId:p.category_id,variants:variants.map(v=>({id:v.id,name:v.name,sku:v.sku,price:Number(v.price),attributes:v.attributes}))}}),'edit seller product');
 catalog=ok(await S.http('/api/comu/seller/catalog?sellerId='+state.sellerId),'reload seller edit');
 assert.equal(catalog.products.find(p=>p.id===state.productId).description,'Edición verificada por HTTP real — PRUEBA NO COMERCIAL');
 pass('Seller product edit and reload');
 if(process.argv[3]==='--catalog-edit-only')process.exit(0);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 if(!state.mediaId){const form=new FormData();form.set('sellerId',state.sellerId);form.set('listingId',state.listingId);form.set('file',new Blob([png],{type:'image/png'}),'release-test.png');const image=ok(await S.http('/api/comu/media','POST',form),'Storage upload');state.mediaId=image.media.id;state.mediaUrl=image.media.public_url;save();}
 const image=await fetch(state.mediaUrl);assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);pass('Real Storage upload + retrieval');
 ok(await D.http('/api/admin/access-v2','PATCH',{action:'grant_brand',targetUserId:state.users.seller.id,brandSlug:state.slug,accessRole:'owner'}),'assign owner membership');
 const modules=ok(await D.http('/api/admin/brands/'+state.slug+'/modules'),'brand modules');
 state.modules=modules;save();pass('Brand modules and canonical access assignment');
 assert.equal(checked(await admin.from('user_brand_access').select('user_id').eq('user_id',state.users.admin.id).eq('brand_slug',state.slug),'no admin owner').length,0);
 pass('Global admin remains separate from owner');
 if(!state.retail){const retail=ok(await R.http('/api/onboarding/business','POST',{brandName:state.tag+' Retail',profileCode:'retail',idempotencyKey:state.retailKey||(state.retailKey=randomUUID(),save(),state.retailKey)}),'Retail onboarding');state.retail=retail;save();}
 const rs=state.retail.brand.slug, bid=state.retail.brand.id;
 assert.ok(rs.startsWith(state.tag));
 for(const page of ['', '/products','/register','/online-store/appearance'])assert.equal((await R.http('/brand/'+rs+'/pos'+page)).status,200);
 const posProducts=ok(await R.http('/api/pos/products?brandSlug='+rs),'Retail catalog read');
 assert.ok(posProducts.ok);assert.equal((await S.http('/api/pos/products?brandSlug='+rs)).status,403);
 pass('Retail owner pages/API and cross-brand isolation');
 if(!state.retailProduct){
  ok(await R.http('/api/pos/products','POST',{brandSlug:rs,locationId:state.retail.location.id,name:'PRUEBA ENTREGA RETAIL — NO COMERCIAL',productType:'physical',inventoryMode:'direct',hasVariants:false,variants:[{name:'Única',price:125,cost:0,initialStock:0,attributes:{}}]}),'Retail product creation');
  const row=checked(await admin.from('pos_products').select('id').eq('brand_slug',rs).eq('name','PRUEBA ENTREGA RETAIL — NO COMERCIAL').single(),'read created Retail product');state.retailProduct=row.id;save();
 }
 const ep='/api/admin/brands/'+rs+'/modules';
 const before=ok(await D.http(ep),'read Retail modules').modules;
 assert.equal((await R.http(ep,'PATCH',{status:'enabled',expectedRevision:before.store.revision})).status,403);
 if(before.store.status!=='enabled')ok(await D.http(ep,'PATCH',{status:'enabled',expectedRevision:before.store.revision}),'enable synthetic store');
 const enabled=ok(await D.http(ep),'read enabled modules').modules;
 assert.deepEqual(enabled.os,before.os);assert.deepEqual(enabled.pos,before.pos);assert.deepEqual(enabled.comu,before.comu);
 pass('A1 real admin enablement independent of OS/POS/COMU; owner denied');
 const channelPath='/api/pos/products/'+state.retailProduct+'/channels?brandSlug='+rs;
 let channels=ok(await R.http(channelPath),'read channels').channels;
 ok(await R.http(channelPath,'PATCH',{physicalRequested:true,onlineRequested:true,revision:channels.revision}),'save channels');
 channels=ok(await R.http(channelPath),'reload channels').channels;assert.equal(channels.onlineRequested,true);assert.equal(channels.physicalRequested,true);
 const webPath='/api/pos/products/'+state.retailProduct+'/web?brandSlug='+rs+'&locationId='+state.retail.location.id;
 let web=ok(await R.http(webPath),'read product content');
 if(!state.posImage){const form=new FormData();form.set('file',new Blob([png],{type:'image/png'}),'release-test.png');state.posImage=ok(await R.http('/api/pos/product-images?brandSlug='+rs+'&purpose=web','POST',form),'POS Storage upload');save();}
 const document=structuredClone(web.web.draft);
 document.colors=[{id:state.colorId||(state.colorId=randomUUID(),save(),state.colorId),name:'Muestra de prueba',variantIds:web.catalog.variants.map(v=>v.id),hex:'#202020',swatchPath:'',photos:[{path:state.posImage.storagePath,alt:'PRUEBA NO COMERCIAL'}]}];
 ok(await R.http(webPath,'PATCH',{revision:web.web.revision,document,publish:false}),'save web draft');
 web=ok(await R.http(webPath),'reload web draft');assert.deepEqual(web.web.draft.colors,document.colors);
 ok(await R.http(webPath,'PATCH',{revision:web.web.revision,document,publish:true}),'publish synthetic product content');
 web=ok(await R.http(webPath),'reload publication');assert.ok(web.web.publishedRevision>0);assert.deepEqual(web.web.published.colors,document.colors);
 const ap='/api/pos/online-store/appearance?brandSlug='+rs;
 let appearance=ok(await R.http(ap),'read appearance');
 const layout={...appearance.draft,name:'PRUEBA ENTREGA — NO COMERCIAL'};
 ok(await R.http(ap,'PATCH',{revision:appearance.revision,document:layout,publish:true}),'publish synthetic appearance');
 appearance=ok(await R.http(ap),'reload appearance');assert.ok(appearance.publishedRevision>0);
 pass('M1/M2/M3 real API + Storage: channels, photo assignment, draft, publication and reload');
 // No deployed storefront is bound to this test brand; retire public access after checking.
 const current=ok(await D.http(ep),'read access revision').modules;
 ok(await D.http(ep,'PATCH',{status:'suspended',expectedRevision:current.store.revision}),'suspend synthetic store');
 assert.equal(checked(await admin.from('brand_online_store_access').select('status').eq('brand_id',bid).single(),'verify suspension').status,'suspended');
 pass('Synthetic public store suspended; documents preserved');
 for(const endpoint of ['/api/comu/cart','/api/comu/reservations','/api/comu/checkout','/api/comu/payments/intents']){const r=await S.http(endpoint,'POST',{});assert.equal(r.status,503);assert.equal(r.data.code,'COMU_PURCHASES_CLOSED');}
 pass('Public COMU purchases closed at deployed backend');
 console.log('Synthetic test state retained privately; no paid providers or notifications invoked.');
}catch(e){fs.writeFileSync(dir+'/http-failure.private.txt',String(e.stack));console.error('FAIL',e.message);process.exitCode=1;}
