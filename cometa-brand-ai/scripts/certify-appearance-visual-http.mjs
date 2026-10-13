// Authorized release verification. Only identified synthetic brand content is changed.
// Real Next handlers, Supabase Auth, PostgREST and Storage. No messages or payments.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
assert.equal(process.argv[2],'--authorized-editor-verification');
const dir='.next/release-private-20261011',raw=fs.readFileSync(dir+'/api-keys.private.json');
const keys=JSON.parse(raw.toString(raw[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,''));
const fixture=JSON.parse(fs.readFileSync(dir+'/http-fixtures.private.json','utf8'));
assert.ok(fixture.retail.brand.slug.startsWith('release-test-'));
const url='https://zhtagqrzyovsrmsicaot.supabase.co',origin='https://app.cometaos.com';
const db=createClient(url,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false,autoRefreshToken:false}}),sessions=[],results=[];
const checked=(r,label)=>{if(r.error)throw Error(label+': '+r.error.code);return r.data;};
async function session(id){
 const u=checked(await db.auth.admin.getUserById(id),'identity').user;
 const link=checked(await db.auth.admin.generateLink({type:'magiclink',email:u.email}),'temporary link');
 const jar=new Map(),client=createServerClient(url,keys.find(k=>k.name==='anon').api_key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(c=>jar.set(c.name,c.value))}});
 assert.equal(checked(await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'}),'OTP').user.id,id);sessions.push(client);
 return async(path,body,method)=>{const r=await fetch(origin+path,{method:method||(body instanceof FormData?'POST':body?'PATCH':'GET'),headers:{Origin:origin,Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body && !(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=null;}return{status:r.status,data,cache:r.headers.get('cache-control')};};
}
const ok=(r,label)=>{assert.equal(r.status,200,label+' HTTP '+r.status+' '+(r.data?.code||r.data?.error||''));assert.ok(r.data && r.data.ok!==false,label);return r.data;};
const pass=label=>{results.push(label);console.log('PASS',label);};
let cleanupCourtesy,cleanupService;
try{
 const owner=await session('493f2651-9690-42f0-afe8-e34c8848754e'),test=await session('c7f07107-180b-4019-859b-33bdbe9a6445');
 const administrator=await session('c7f07107-180b-4019-859b-33bdbe9a6445'),courtesyPath='/api/admin/brands/'+fixture.retail.brand.slug+'/pos-courtesy';
 const commercial=ok(await administrator(courtesyPath),'synthetic access');
 if(!commercial.access.effective.accessAllowed){
  const active=commercial.grants.find(g=>g.status==='active');assert.ok(!active,'do not replace an existing grant');
  const plan=commercial.access.effective.planCode||commercial.plans[0].code;
  const result=ok(await administrator(courtesyPath,{action:'save',expectedId:null,plan,endsAt:new Date(Date.now()+7200000).toISOString(),reason:'PRUEBA IDENTIFICADA editor visual; retirar al finalizar'}),'temporary synthetic courtesy');
  const grant=result.grants.find(g=>g.status==='active');assert.ok(grant);
  cleanupCourtesy=async()=>ok(await administrator(courtesyPath,{action:'revoke',expectedId:grant.id,plan,endsAt:null,reason:'FIN PRUEBA IDENTIFICADA editor visual'}),'revoke temporary test courtesy');
 }
 const servicePath='/api/admin/brands/'+fixture.retail.brand.slug+'/modules';
 const service=ok(await administrator(servicePath),'synthetic service').modules.store;
 if(service.status!=='enabled'){
   ok(await administrator(servicePath,{status:'enabled',expectedRevision:service.revision}),'enable isolated test publication');
   cleanupService=async()=>{const current=ok(await administrator(servicePath),'service cleanup').modules.store;ok(await administrator(servicePath,{status:service.status,expectedRevision:current.revision}),'restore synthetic service');};
 }
 const magentaPath='/api/pos/online-store/appearance?brandSlug=magenta-fitwear',testPath='/api/pos/online-store/appearance?brandSlug='+fixture.retail.brand.slug;
 const before=checked(await db.from('brand_storefront_appearance').select('draft,published,revision,published_revision').eq('brand_id','70880b54-b6fe-4775-bb39-c9ff19c47c39').single(),'MAGENTA preservation');
 fs.writeFileSync(dir+'/appearance-before-verification.json',JSON.stringify(before));
 const actual=await owner(magentaPath);ok(actual,'owner appearance');assert.match(actual.cache,/private/);assert.match(actual.cache,/no-store/);
 assert.equal((await owner(testPath)).status,403);assert.equal((await fetch(origin+magentaPath)).status,401);pass('owner courtesy read; anonymous/cross-brand denied; private no-store');
 const ownerSave=ok(await owner(magentaPath,{revision:actual.data.revision,document:actual.data.draft,publish:false}),'owner same draft');
 const reloaded=ok(await owner(magentaPath),'owner reload');assert.deepEqual(reloaded.draft,actual.data.draft);assert.equal(reloaded.revision,ownerSave.appearance.revision);pass('MAGENTA owner unchanged draft saves and reloads');
 let state=ok(await test(testPath),'synthetic appearance');
 const form=new FormData();form.set('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8XcAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'identified-editor-test.png');
 const uploaded=await test('/api/pos/product-images?brandSlug='+fixture.retail.brand.slug+'&purpose=web',form);assert.equal(uploaded.status,201);const image=uploaded.data.storagePath;assert.ok(image.startsWith(fixture.retail.brand.slug+'/web/'));
 const media=ok(await test(testPath+'&media=1'),'library');assert.ok(media.media.includes(image));assert.ok(media.media.every(p=>p.startsWith(fixture.retail.brand.slug+'/')));pass('real Storage upload and brand media library');
 const legacy=media.media.find(p=>!p.startsWith(fixture.retail.brand.slug+'/web/'));if(legacy){const imported=ok(await test(testPath,{source:legacy},'POST'),'legacy copy');assert.ok(imported.storagePath.startsWith(fixture.retail.brand.slug+'/web/'));pass('legacy catalog photo selected and copied without moving original');}assert.equal((await owner(magentaPath,{source:fixture.retail.brand.slug+'/00000000-0000-0000-0000-000000000000/photo.jpg'},'POST')).status,400);pass('cross-brand media import denied');
 const originalPublished=checked(await db.from('brand_storefront_appearance').select('published').eq('brand_id',fixture.retail.brand.id).single(),'synthetic published').published;
 const document={...state.draft,name:'PRUEBA EDITOR — NO COMERCIAL',footerDesign:{identity:'both',wordmark:true,wordmarkText:'PRUEBA — NO COMERCIAL',wordmarkSize:64,mobileWordmarkSize:32,columns:[{title:'Explorar',links:[{title:'Catálogo',url:'/catalogo'}]}],social:[],contact:'Datos sintéticos'},bag:{title:'Bolsa de prueba',description:'Prueba',emptyText:'Sin selección',continueText:'Continuar',summaryTitle:'Resumen de prueba'},mediaLayout:{[image]:{mobileImage:image,x:25,y:50,mobileX:75,mobileY:40}},buttonLabels:{hero:'Ver catálogo'},sections:state.draft.sections.map(s=>s.kind==='hero'?{...s,enabled:true,title:'PRUEBA EDITOR',image,url:'/catalogo'}:s)};
 let saved=ok(await test(testPath,{revision:state.revision,document,publish:false}),'synthetic draft');
 assert.deepEqual(checked(await db.from('brand_storefront_appearance').select('published').eq('brand_id',fixture.retail.brand.id).single(),'published unchanged').published,originalPublished);
 const stale=await test(testPath,{revision:state.revision,document,publish:false});assert.equal(stale.status,409);pass('draft separated; stale revision conflict without overwrite');
 state=ok(await test(testPath),'draft reload');assert.deepEqual(state.draft.mediaLayout,document.mediaLayout);
 const bad={...document,mediaLayout:{['magenta-fitwear/web/foreign.png']:{mobileImage:'',x:50,y:50,mobileX:50,mobileY:50}}};assert.equal((await test(testPath,{revision:state.revision,document:bad,publish:false})).status,400);pass('foreign responsive media rejected');
 saved=ok(await test(testPath,{revision:state.revision,document,publish:true}),'explicit test publish');
 const publicRead=checked(await db.rpc('brand_storefront_home_m3',{p_brand_slug:fixture.retail.brand.slug}),'published projection');assert.deepEqual(publicRead.appearance.mediaLayout,document.mediaLayout);assert.deepEqual(publicRead.appearance.footerDesign,document.footerDesign);assert.deepEqual(publicRead.appearance.bag,document.bag);assert.equal(saved.appearance.publishedRevision,saved.appearance.revision);pass('explicit synthetic publish and real public projection preserve responsive media');
 const after=checked(await db.from('brand_storefront_appearance').select('draft,published,revision,published_revision').eq('brand_id','70880b54-b6fe-4775-bb39-c9ff19c47c39').single(),'MAGENTA unchanged');assert.deepEqual(after.published,before.published);assert.equal(after.published_revision,before.published_revision);assert.deepEqual(after.draft,before.draft);pass('MAGENTA public content and original draft preserved');
 fs.writeFileSync(dir+'/appearance-http-pass.json',JSON.stringify({at:new Date().toISOString(),results,auth:'real temporary OTP sessions; no email/password changes',syntheticBrand:fixture.retail.brand.slug},null,2));
}finally{try{if(cleanupService)await cleanupService();}finally{try{if(cleanupCourtesy)await cleanupCourtesy();}finally{for(const c of sessions)await c.auth.signOut({scope:'local'});}}}
