// Real browser/HTTP/Auth/Storage test. Mutations restricted to the identified synthetic release brand.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
assert.equal(process.argv[2],'--authorized-synthetic-publication');
const dir='.next/release-private-20261011',raw=fs.readFileSync(dir+'/api-keys.private.json');
const keys=JSON.parse(raw.toString(raw[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,''));
const url='https://zhtagqrzyovsrmsicaot.supabase.co',origin='https://app.cometaos.com',owner='c7f07107-180b-4019-859b-33bdbe9a6445';
const db=createClient(url,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=r=>{if(r.error)throw Error(r.error.code);return r.data;};
const user=checked(await db.auth.admin.getUserById(owner)).user,link=checked(await db.auth.admin.generateLink({type:'magiclink',email:user.email}));
const jar=new Map(),client=createServerClient(url,keys.find(k=>k.name==='anon').api_key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(c=>jar.set(c.name,c.value))}});
assert.equal(checked(await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'})).user.id,owner);
const fixture=JSON.parse(fs.readFileSync(dir+'/http-fixtures.private.json','utf8'));const slug=fixture.retail.brand.slug;assert.ok(slug.startsWith('release-test-'));
const request=async(path,body,method)=>{const r=await fetch(origin+path,{method:method||(body?'PATCH':'GET'),headers:{Origin:origin,Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,body instanceof FormData?201:200,d.code||'HTTP');return d;};
let cleanupCourtesy,cleanupService;
const profile=path.resolve(dir,'editor-browser-'+Date.now());fs.mkdirSync(profile);const evidence='docs/evidence/appearance-visual';fs.mkdirSync(evidence,{recursive:true});
let chrome,ws;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const cp='/api/admin/brands/'+slug+'/pos-courtesy',mp='/api/admin/brands/'+slug+'/modules';const access=await request(cp);if(!access.access.effective.accessAllowed){assert.ok(!access.grants.some(g=>g.status==='active'));const plan=access.access.effective.planCode||access.plans[0].code;const grant=(await request(cp,{action:'save',expectedId:null,plan,endsAt:new Date(Date.now()+7200000).toISOString(),reason:'PRUEBA NAVEGADOR EDITOR — temporal'})).grants.find(g=>g.status==='active');cleanupCourtesy=()=>request(cp,{action:'revoke',expectedId:grant.id,plan,endsAt:null,reason:'FIN PRUEBA NAVEGADOR EDITOR'});}
 const service=(await request(mp)).modules.store;if(service.status!=='enabled'){await request(mp,{status:'enabled',expectedRevision:service.revision});cleanupService=async()=>{const v=(await request(mp)).modules.store;await request(mp,{status:service.status,expectedRevision:v.revision});};}
 const form=new FormData();form.set('file',new Blob([fs.readFileSync('docs/evidence/m2/hero-demo.jpg')],{type:'image/jpeg'}),'DEMO-NO-COMERCIAL.jpg');const uploaded=await request('/api/pos/product-images?brandSlug='+slug,form,'POST');
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const active=path.join(profile,'DevToolsActivePort');for(let n=0;n<100&&!fs.existsSync(active);n++)await delay(100);assert.ok(fs.existsSync(active));
 let port;for(let n=0;n<100;n++){try{port=fs.readFileSync(active,'utf8').split('\n')[0];if(port)break;}catch(e){if(e.code!=='EBUSY')throw e;}await delay(100);}assert.ok(port,'Chrome port readable');const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let serial=0,loadEvents=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Page.loadEventFired')loadEvents++;if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('Browser protocol failed')):p.resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(Error('Browser timeout '+method)),45000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Page evaluation failed');return r.result.value;};
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setCookies',{cookies:[...jar].map(([name,value])=>({name,value,url:origin,secure:true,sameSite:'Lax',path:'/'}))});
 await call('Emulation.setDeviceMetricsOverride',{width:1536,height:1024,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:origin+'/brand/'+slug+'/pos/online-store/appearance'});
 for(let n=0;n<150;n++){if(await evaluate('Boolean(document.querySelector(".ae-inspector") && document.querySelector("iframe")?.contentDocument?.querySelector(".mag-home"))'))break;await delay(200);}
 assert.equal(await evaluate('Boolean(document.querySelector(".ae-inspector"))'),true,'real authenticated editor loaded');
 assert.equal(await evaluate('Boolean(document.querySelector(".ae-error"))'),false);
 await evaluate('document.fonts.ready.then(()=>true)');await delay(700);
 assert.ok(await evaluate('Array.from(document.querySelectorAll(".ae-row-name")).every(e=>e.textContent.trim().length>3)'));

 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 const shot=async name=>{const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(evidence,name),Buffer.from(r.data,'base64'));};

 const wait=async expression=>{for(let i=0;i<180;i++){if(await evaluate('Boolean('+expression+')'))return;await delay(200);}throw Error('UI condition not met');};
 const click=async expression=>{await evaluate(expression+'.click()');await delay(200);};
 await evaluate(`(()=>{const e=document.querySelector('[data-editor-field="Título"] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'PRUEBA IDENTIFICADA — no comercial');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(`document.querySelector('.ae-save-state').textContent.includes('Borrador guardado')`);
 await click(`Array.from(document.querySelectorAll('.appearance-controls button')).find(b=>b.textContent==='Elegir de mis archivos')`);await wait(`document.querySelector('.ae-library img')`);await click(`Array.from(document.querySelectorAll('.ae-library button')).find(b=>b.getAttribute('aria-label')?.endsWith(${JSON.stringify(uploaded.storagePath.split('/').at(-1))}))`);await wait(`document.querySelector('.ae-save-state').textContent.includes('Borrador guardado')`);
 await click(`document.querySelector('button[aria-label="Bajar Portada"]')`);await wait(`document.querySelector('.ae-save-state').textContent.includes('Borrador guardado')`);
 const previousLoad=loadEvents;await call('Page.reload');for(let n=0;n<150&&loadEvents===previousLoad;n++)await delay(200);assert.ok(loadEvents>previousLoad,'new document loaded');await wait(`document.querySelector('iframe')?.contentDocument?.querySelector('.mag-hero h1')?.textContent==='PRUEBA IDENTIFICADA — no comercial'`);
 await click(`document.querySelector('.ae-top .primary')`);await wait(`document.querySelector('.ae-save-state').textContent.includes('Versión publicada')`);
 const persisted=await request('/api/pos/online-store/appearance?brandSlug='+slug);assert.equal(persisted.revision,persisted.publishedRevision);const publicRead=checked(await db.rpc('brand_storefront_home_m3',{p_brand_slug:slug}));const selectedPath=persisted.draft.sections.find(s=>s.kind==='hero').image;assert.ok(selectedPath.startsWith(slug+'/web/'));assert.notEqual(selectedPath,uploaded.storagePath);assert.equal(publicRead.appearance.sections.find(s=>s.kind==='hero').image,selectedPath);const pieces=uploaded.storagePath.split('/'),file=pieces.pop();assert.ok(checked(await db.storage.from('pos-products').list(pieces.join('/'))).some(v=>v.name===file),'original catalog image preserved');
 await evaluate('document.fonts.ready.then(()=>true)');await delay(800);
 await shot('editor-real-synthetic-desktop.png');
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);
 await evaluate('Array.from(document.querySelectorAll(".ae-mobile-tabs button")).find(e=>e.textContent==="Vista previa").click()');
 await evaluate('Array.from(document.querySelectorAll(".ae-preview-tools button")).find(e=>e.textContent.includes("Celular")).click()');await delay(300);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);assert.ok(await evaluate('document.querySelector("iframe").getBoundingClientRect().height>400'));
 await shot('editor-real-synthetic-phone.png');
 console.log('PASS real browser: synthetic brand photo library selection, title edit, reorder, autosave, reload, explicit publish verified in public RPC; desktop/phone. Real admin session, no email.');
 await call('Browser.close');
}finally{ws?.close();chrome?.kill();try{if(cleanupService)await cleanupService();}finally{try{if(cleanupCourtesy)await cleanupCourtesy();}finally{await client.auth.signOut({scope:'local'});}}}
