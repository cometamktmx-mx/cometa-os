// Explicit user-authorized activation. No migrations, payments, email or stock writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
assert.equal(process.argv[2], '--authorized-magenta-activation');
const dir='.next/release-private-20261011';
const raw=fs.readFileSync(dir+'/api-keys.private.json');
const keys=JSON.parse(raw.toString(raw[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,''));
const url='https://zhtagqrzyovsrmsicaot.supabase.co',origin='https://app.cometaos.com';
const slug='magenta-fitwear',brandId='70880b54-b6fe-4775-bb39-c9ff19c47c39';
const owner='493f2651-9690-42f0-afe8-e34c8848754e',actor='c7f07107-180b-4019-859b-33bdbe9a6445';
const db=createClient(url,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false,autoRefreshToken:false}});
function checked(r,label){if(r.error)throw Error(label+': '+r.error.code);return r.data;}
async function snapshot(){
 const out={};
 for(const s of [slug,'magenta-fit-wear']){
  out[s]={};
  for(const table of ['user_brand_access','pos_products','pos_product_variants','pos_inventory','pos_locations','pos_business_profiles'])out[s][table]=checked(await db.from(table).select('*').eq('brand_slug',s).order('id'),'snapshot '+table);
 }
 out.profile=checked(await db.from('user_profiles').select('*').eq('user_id',owner),'profile');
 out.service=checked(await db.from('brand_online_store_access').select('*').eq('brand_id',brandId),'service');
 out.appearance=checked(await db.from('brand_storefront_appearance').select('*').eq('brand_id',brandId),'appearance');
 return out;
}
const before=await snapshot();
const backup=dir+'/magenta-before-activation.json';
if(!fs.existsSync(backup))fs.writeFileSync(backup,JSON.stringify(before,null,2),{flag:'wx'});
const authUser=checked(await db.auth.admin.getUserById(owner),'Auth owner').user;
assert.equal(authUser.email,'guiasmagenta@gmail.com');assert.ok(authUser.email_confirmed_at);
assert.ok(before[slug].user_brand_access.some(a=>a.user_id===owner&&a.access_role==='owner'&&a.status==='active'));
const admin=checked(await db.from('user_profiles').select('role,status').eq('user_id',actor).single(),'admin actor');
assert.deepEqual(admin,{role:'admin',status:'active'});
if(!before.profile.length)checked(await db.from('user_profiles').insert({user_id:owner,email:authUser.email,full_name:typeof authUser.user_metadata?.full_name==='string'?authUser.user_metadata.full_name:null,role:'client',status:'active'}),'create missing client profile');
else {assert.equal(before.profile[0].role,'client');assert.equal(before.profile[0].status,'active');}
const service=before.service[0];
if(service?.status!=='enabled')checked(await db.rpc('brand_online_store_set_access_a1',{p_brand_slug:slug,p_actor_user_id:actor,p_status:'enabled',p_expected_revision:service?.revision??0}),'enable A1');
console.log('PASS client profile + existing owner + audited A1; no global admin grant');
if(process.argv[3]==='--publish-shell'){
 // Global administrator publication, separately authorized from owner POS access.
 // Does not override subscription guards or claim an owner HTTP success.
 if(!before.appearance.length){
  const document={name:'MAGENTA FITWEAR',logo:'',announcement:'',footer:'',paper:'#fff9f5',ink:'#29191f',accent:'#740a32',soft:'#fce5ec',font:'editorial',spacing:64,motion:true,entrance:true,navigation:[{title:'Inicio',url:'/'},{title:'Catálogo',url:'/catalogo'}],sections:['hero','marquee','categories','featured','look','videos','testimonials','benefits','wholesale','faq','newsletter'].map(kind=>({kind,enabled:kind==='hero',title:kind==='hero'?'MAGENTA FITWEAR':'',text:'',image:'',url:kind==='hero'?'/catalogo':'',entries:[]}))};
  checked(await db.rpc('brand_storefront_save_m3',{p_brand_slug:slug,p_actor:actor,p_revision:0,p_document:document,p_publish:true}),'publish identity-only shell');
 }
 const publicRead=checked(await db.rpc('brand_storefront_home_m3',{p_brand_slug:slug}),'public home');
 assert.equal(publicRead.appearance.name,'MAGENTA FITWEAR');assert.equal(publicRead.products.length,0);
 const after=await snapshot();for(const s of [slug,'magenta-fit-wear'])assert.deepEqual(after[s],before[s]);
 console.log('PASS persisted public MAGENTA identity/navigation; no product auto-publication; both brands catalog/inventory/memberships unchanged');
 process.exit(0);
}
// Admin-generated one-time link is consumed locally, never emailed, logged or persisted.
const link=checked(await db.auth.admin.generateLink({type:'magiclink',email:authUser.email}),'temporary verification link');
const jar=new Map();
const auth=createServerClient(url,keys.find(k=>k.name==='anon').api_key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(c=>jar.set(c.name,c.value))}});
const verified=checked(await auth.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'}),'temporary owner session');
assert.equal(verified.user.id,owner);
const evidence=[];
async function http(path,method='GET',body){
 const r=await fetch(origin+path,{method,headers:{Origin:origin,Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(60000)});
 for(const raw of r.headers.getSetCookie()){const kv=raw.split(';')[0],i=kv.indexOf('=');jar.set(kv.slice(0,i),kv.slice(i+1));}
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=null;}
 evidence.push({path,method,status:r.status});
 return {status:r.status,data,text};
}
function ok(r,label){if(r.status!==200){fs.writeFileSync(dir+'/magenta-last-error.private.json',JSON.stringify({label,status:r.status,data:r.data}));throw Error(label+' HTTP '+r.status);}return r.data;}
try{
 for(const p of ['/brand/'+slug+'/pos','/brand/'+slug+'/pos/products','/brand/'+slug+'/pos/online-store/appearance'])ok(await http(p),'owner page');
 assert.equal((await http('/api/admin/brands/'+slug+'/modules')).status,403);
 assert.equal((await http('/api/pos/products?brandSlug=magenta-fit-wear')).status,403);
 const appearancePath='/api/pos/online-store/appearance?brandSlug='+slug;
 const current=ok(await http(appearancePath),'appearance read');
 if(current.revision===0){
  const document={...current.draft,name:'MAGENTA FITWEAR',navigation:[{title:'Inicio',url:'/'},{title:'Catálogo',url:'/catalogo'}]};
  // Existing approved palette/layout, no invented commercial assets or promises.
  document.sections=document.sections.map(s=>s.kind==='hero'?{...s,enabled:true,title:'MAGENTA FITWEAR',url:'/catalogo'}:s);
  ok(await http(appearancePath,'PATCH',{revision:0,document,publish:false}),'save appearance draft');
  const saved=ok(await http(appearancePath),'reload draft');assert.deepEqual(saved.draft,document);assert.equal(saved.publishedRevision,null);
  ok(await http(appearancePath,'PATCH',{revision:saved.revision,document:saved.draft,publish:true}),'publish appearance');
 }
 const published=ok(await http(appearancePath),'reload published');assert.ok(published.publishedRevision>0);
 ok(await http(appearancePath,'PATCH',{revision:published.revision,document:published.draft,publish:false}),'save same appearance draft');
 const reread=ok(await http(appearancePath),'reload appearance persisted');assert.deepEqual(reread.draft,published.draft);assert.equal(reread.publishedRevision,published.publishedRevision);
 const product=before[slug].pos_products[0],location=before[slug].pos_locations[0];
 if(product&&location){
  ok(await http('/api/pos/products/'+product.id+'/channels?brandSlug='+slug),'channels read');
  const webPath='/api/pos/products/'+product.id+'/web?brandSlug='+slug+'&locationId='+location.id;
  const web=ok(await http(webPath),'web content read');
  ok(await http(webPath,'PATCH',{revision:web.web.revision,document:web.web.draft,publish:false}),'save web draft only');
  const webReload=ok(await http(webPath),'reload web draft');assert.deepEqual(webReload.web.draft,web.web.draft);assert.equal(webReload.web.publishedRevision,web.web.publishedRevision);
 }
 const after=await snapshot();
 for(const s of [slug,'magenta-fit-wear'])assert.deepEqual(after[s],before[s],'preserved brand inventory/catalog/memberships '+s);
 assert.equal(after.profile[0].role,'client');assert.equal(after.service[0].status,'enabled');
 fs.writeFileSync(dir+'/magenta-activation-evidence.json',JSON.stringify({at:new Date().toISOString(),evidence,profile:'client/active',service:'enabled',publishedRevision:published.publishedRevision,unchangedInventoryCatalogMemberships:true,temporaryAuth:'admin-generated OTP; no email/password change',productPublication:'unchanged'},null,2));
 console.log('PASS owner real HTTP: POS, products, appearance draft/save/reload/publish; cross-brand/global-admin denied; inventory unchanged');
}finally{await auth.auth.signOut({scope:'local'});}
