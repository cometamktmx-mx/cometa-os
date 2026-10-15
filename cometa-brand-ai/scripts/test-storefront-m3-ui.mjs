// Browser interaction of actual React components, isolated fixtures/transports.
// Does not connect to Supabase, Next authentication, storage or external services.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'cometa-m3-preview-'));
const evidence=path.resolve(process.env.STOREFRONT_EVIDENCE_DIR || 'docs/evidence/m3');fs.mkdirSync(evidence,{recursive:true});
const sectionKinds=['hero','marquee','categories','featured','look','videos','testimonials','benefits','wholesale','faq','newsletter'];
const product=randomUUID(),image='fixture/web/hero-demo.jpg',look='fixture/web/look-demo-v4.png';
const entry=(title,text='',image='',url='',productId='')=>({title,text,image,url,productId});
const appearance={name:'MAGENTA',logo:'',announcement:'VISTA LOCAL · DATOS DE DEMOSTRACIÓN',footer:'Evidencia M3. Sin checkout, pagos ni newsletter conectado.',paper:'#fff9f5',ink:'#29191f',accent:'#740a32',soft:'#fce5ec',font:'editorial',spacing:64,motion:true,entrance:true,navigation:[{title:'El edit',url:'#featured'},{title:'Looks',url:'#look'},{title:'Preguntas',url:'#faq'}],sections:sectionKinds.map(kind=>({kind,enabled:false,title:'',text:'',image:'',url:'',entries:[]}))};
const section=(kind,patch)=>Object.assign(appearance.sections.find(s=>s.kind===kind),{enabled:true,...patch});
section('hero',{title:'Tu nueva obsesión.',text:'The MAGENTA edit · composición de prueba basada en el tema aprobado.',image,url:'#featured'});
section('marquee',{text:'MAGENTA ATELIER — THE EDIT — DISEÑO DE REFERENCIA'});
section('categories',{title:'Encuentra tu mood',entries:[entry('Leggings · demo','',image,'#featured'),entry('Tops · demo','',look,'#featured'),entry('Conjuntos · demo','',image,'#featured'),entry('Esenciales · demo','',look,'#featured')]});
section('featured',{title:'Una selección para ti',text:'Selección editorial de prueba, no estadísticas de ventas.',entries:[entry('','','','',product)]});
section('look',{title:'Un look. Mil planes.',image:look,entries:[entry('','','','',product)]});
section('faq',{title:'¿Algo más?',entries:[entry('¿Esta es una tienda operativa?','No. Es una prueba visual aislada del componente M3.'),entry('¿Hay pagos?','No se generan pedidos ni cobros.')]});
const data={revision:1,draft:appearance,publishedRevision:1,service:'enabled',products:[{id:product,name:'Prenda de prueba',image:look,price:299,currency:'MXN',soldOut:true}],mediaBase:'/'};
fs.writeFileSync(path.join(temp,'transport.ts'),`let data=${JSON.stringify(data)};const fetcher=async(url,init)=>{if(init?.method==='PATCH'){const b=JSON.parse(init.body);if(b.revision!==data.revision)return{ok:false,json:async()=>({ok:false,error:'Conflicto simulado'})};data={...data,revision:data.revision+1,draft:b.document,publishedRevision:b.publish?data.revision+1:data.publishedRevision};return{ok:true,json:async()=>({ok:true,appearance:{...data,publishedRevision:data.publishedRevision}})}}return{ok:true,json:async()=>({ok:true,...data})}};export const usePosFetch=()=>fetcher;`);
fs.writeFileSync(path.join(temp,'loader.cjs'),`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){if(this.resourcePath.endsWith('.css'))return '';return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;};`);
fs.writeFileSync(path.join(temp,'entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{AppearanceEditor}from'${path.resolve('src/app/brand/[brandSlug]/pos/online-store/appearance/appearance-editor').replaceAll('\\','/')}';import{StoreHome}from'${path.resolve('packages/own-storefront/home').replaceAll('\\','/')}';const data=${JSON.stringify(data)};createRoot(document.getElementById('root')).render(location.pathname==='/admin'?<AppearanceEditor brandSlug="fixture"/>:<StoreHome appearance={data.draft} products={data.products} mediaBase="/"/>);`);
const {webpack}=require('next/dist/compiled/webpack/webpack');
await new Promise((resolve,reject)=>{
 const compiler=webpack({mode:'development',devtool:false,context:root,entry:path.join(temp,'entry.tsx'),output:{path:temp,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'@/lib/pos/client-transport':path.join(temp,'transport.ts'),'@':path.join(root,'src')}},module:{rules:[{test:/\.(tsx?|css)$/,use:path.join(temp,'loader.cjs')}]}});
 compiler.run((error,stats)=>{compiler.close(()=>{});if(error||stats.hasErrors())reject(error??Error(stats.toString({all:false,errors:true})));else resolve();});
});
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M3 evidencia</title><style>${fs.readFileSync('packages/own-storefront/home.css','utf8')}${fs.readFileSync('src/app/brand/[brandSlug]/pos/online-store/appearance/appearance.css','utf8')}body{margin:0;font-family:Arial}#evidence{padding:8px 20px;background:#163d32;color:white;font:12px Arial}</style><div id="evidence">M3 · Componentes reales · datos y transporte simulados · sin conexión comercial</div><div id="root"></div><script src="/bundle.js"></script></html>`;
const server=http.createServer((req,res)=>{
 const files={'/bundle.js':path.join(temp,'bundle.js'),'/fixture/web/hero-demo.jpg':path.resolve('docs/evidence/m2/hero-demo.jpg'),'/fixture/web/look-demo-v4.png':path.resolve('docs/evidence/m2/look-demo-v4.png')};
 if(req.url==='/'||req.url==='/admin'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(files[req.url]){res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':req.url.endsWith('.png')?'image/png':'image/jpeg');res.end(fs.readFileSync(files[req.url]));return;}
 res.writeHead(404);res.end();
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let chrome,ws;
try{
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--remote-allow-origins=http://127.0.0.1',`--user-data-dir=${path.join(temp,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const active=path.join(temp,'profile','DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);
 assert.ok(fs.existsSync(active),'Chrome debugging ready');const port=fs.readFileSync(active,'utf8').split('\n')[0];
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let serial=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id);if(m.error)reject(Error(JSON.stringify(m.error)));else resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timeout: '+expression);};
 const click=async expression=>{assert.equal(await evaluate(`Boolean(${expression})`),true,'target exists: '+expression);await evaluate(`${expression}.click()`);await delay(120);};
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 const navigate=async route=>{await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}${route}`});await wait(`document.querySelector('.mag-home')!==null`);await evaluate(`Array.from(document.images).forEach(i=>i.loading='eager')`);await wait(`Array.from(document.images).every(i=>i.complete)`);await delay(800);};
 const screenshot=async name=>{const layout=await call('Page.getLayoutMetrics');const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:layout.cssContentSize.width,height:Math.min(7000,Math.ceil(layout.cssContentSize.height)),scale:1}});fs.writeFileSync(path.join(evidence,name),Buffer.from(shot.data,'base64'));};
 await navigate('/');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 assert.equal(await evaluate(`document.querySelectorAll('.mag-newsletter, .mag-testimonials, form').length`),0);
 assert.equal(await evaluate(`document.querySelector('.mag-product-image small').textContent`),'Agotado');
 await screenshot('home-desktop.png');
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await screenshot('home-phone.png');
 await click(`document.querySelector('.mag-faq summary')`);assert.equal(await evaluate(`document.querySelector('.mag-faq details').open`),true);
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await evaluate(`getComputedStyle(document.querySelector('.mag-entrance')).display`),'none');
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await navigate('/admin');await screenshot('appearance-desktop.png');
 await evaluate(`(()=>{const e=document.querySelector('.appearance-controls input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'MAGENTA EDIT');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(150);assert.equal(await evaluate(`document.querySelector('.mag-logo').textContent`),'MAGENTA EDIT');
 await click(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Guardar borrador')`);await wait(`document.querySelector('[role=status]')!==null`);
 await click(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Publicar versión')`);await wait(`document.querySelector('[role=status]').textContent.includes('publicada')`);
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate('scrollTo(0,0)');await delay(200);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await screenshot('appearance-phone-edit.png');
 await click(`document.querySelectorAll('.appearance-tabs button')[1]`);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.appearance-controls')).display`),'none');await screenshot('appearance-phone-preview.png');
 await call('Emulation.setDeviceMetricsOverride',{width:820,height:1180,deviceScaleFactor:1,mobile:true});await delay(150);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 console.log('PASS M3 UI: actual renderer/editor, unsaved preview, mock draft/publish, hidden unsupported sections, out-of-stock, FAQ, reduced motion, desktop/tablet/phone no overflow');
 await call('Browser.close');
}finally{ws?.close();chrome?.kill();await new Promise(r=>server.close(r));}