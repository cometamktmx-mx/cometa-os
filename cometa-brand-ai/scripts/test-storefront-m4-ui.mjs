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
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'cometa-m4-preview-'));
const evidence=path.resolve(process.env.STOREFRONT_EVIDENCE_DIR || 'docs/evidence/m4');fs.mkdirSync(evidence,{recursive:true});
const hero='fixture/web/campaign-demo.png',look='fixture/web/look-demo-v4.png';
const category=randomUUID();
const config={title:'El edit MAGENTA',description:'Catálogo de demostración · productos y disponibilidad sintéticos.',banner:'',columns:3,ratio:'portrait',secondImage:true,swatches:true,filters:['category','color','size','price','available'],sort:'newest',perPage:8};
const appearance={name:'MAGENTA',logo:'',announcement:'VISTA LOCAL · CATÁLOGO DE PRUEBA',footer:'Sin checkout ni ficha pública. Evidencia aislada M4.',paper:'#fff9f5',ink:'#29191f',accent:'#740a32',soft:'#fce5ec',font:'editorial',spacing:64,motion:false,entrance:false,navigation:[{title:'Inicio',url:'/'},{title:'Catálogo',url:'/catalogo'}],sections:[],catalog:config};
const products=Array.from({length:11},(_,i)=>({id:randomUUID(),name:['Conjunto editorial','Camisa atelier','Pantalón fluido','Top esencial'][i%4]+' · fixture '+(i+1),min:299+i*20,max:349+i*20,currency:'MXN',available:i%3!==1,colors:[{id:randomUUID(),name:'Rosa',hex:'#d591aa',swatch:'',photos:[{path:hero,alt:'Foto del tema · fixture magenta'},{path:hero,alt:'Segunda foto del mismo color · fixture'}],min:299+i*20,max:349+i*20,available:i%3!==1},{id:randomUUID(),name:'Negro',hex:'#272124',swatch:'',photos:[{path:look,alt:'Foto del tema · fixture negro'}],min:319+i*20,max:319+i*20,available:false},{id:randomUUID(),name:'Sin fotografía',hex:'',swatch:'',photos:[],min:309+i*20,max:309+i*20,available:false}]}));
fs.writeFileSync(path.join(temp,'loader.cjs'),`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){if(this.resourcePath.endsWith('.css'))return '';return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;};`);
fs.writeFileSync(path.join(temp,'entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{Catalog}from'${path.resolve('packages/own-storefront/catalog').replaceAll('\\','/')}';import{StoreHome}from'${path.resolve('packages/own-storefront/home').replaceAll('\\','/')}';import{catalogQuery}from'${path.resolve('packages/own-storefront/catalog-contract').replaceAll('\\','/')}';const appearance=${JSON.stringify(appearance)},all=${JSON.stringify(products)};const query=catalogQuery(new URLSearchParams(location.search));let filtered=all.filter(p=>(!query.q||p.name.toLowerCase().includes(query.q.toLowerCase()))&&(!query.available||p.available));const data={products:filtered.slice((query.page-1)*8,query.page*8),total:filtered.length,page:query.page,perPage:8,categories:[{value:'${category}',label:'Prendas',count:11}],colors:[{value:'Rosa',label:'Rosa',count:11},{value:'Negro',label:'Negro',count:11}],sizes:[{value:'S',label:'S',count:11},{value:'M',label:'M',count:11}]};createRoot(document.getElementById('root')).render(<StoreHome appearance={appearance} products={[]} mediaBase="/"><Catalog data={data} query={query} config={appearance.catalog} mediaBase="/"/></StoreHome>);`);
const {webpack}=require('next/dist/compiled/webpack/webpack');
await new Promise((resolve,reject)=>{
 const compiler=webpack({mode:'development',devtool:false,context:root,entry:path.join(temp,'entry.tsx'),output:{path:temp,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'@/lib/pos/client-transport':path.join(temp,'transport.ts'),'@':path.join(root,'src')}},module:{rules:[{test:/\.(tsx?|css)$/,use:path.join(temp,'loader.cjs')}]}});
 compiler.run((error,stats)=>{compiler.close(()=>{});if(error||stats.hasErrors())reject(error??Error(stats.toString({all:false,errors:true})));else resolve();});
});
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M4 evidencia</title><style>${fs.readFileSync('packages/own-storefront/home.css','utf8')}${fs.readFileSync('packages/own-storefront/catalog.css','utf8')}body{margin:0;font-family:Arial}#evidence{padding:8px 20px;background:#163d32;color:white;font:12px Arial}</style><div id="evidence">M4 · React real · productos, sesión y transporte simulados · sin conexiones comerciales</div><div id="root"></div><script src="/bundle.js"></script></html>`;
const server=http.createServer((req,res)=>{
 const files={'/bundle.js':path.join(temp,'bundle.js'),'/fixture/web/campaign-demo.png':path.resolve('docs/evidence/m4/campaign-demo.png'),'/fixture/web/look-demo-v4.png':path.resolve('docs/evidence/m2/look-demo-v4.png')};
 if(req.url==='/'||req.url.startsWith('/catalogo')){res.setHeader('Content-Type','text/html');res.end(html);return;}
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
 const ready=async()=>{await wait(`document.querySelector('.mc-card')!==null`);await evaluate(`Array.from(document.images).forEach(i=>i.loading='eager')`);await wait(`Array.from(document.images).every(i=>i.complete)`);await delay(100);};
 await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/catalogo`});await ready();
 const screenshot=async name=>{const layout=await call('Page.getLayoutMetrics');const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:layout.cssContentSize.width,height:Math.min(7000,Math.ceil(layout.cssContentSize.height)),scale:1}});fs.writeFileSync(path.join(evidence,name),Buffer.from(shot.data,'base64'));};
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await screenshot('catalog-desktop.png');
 assert.equal(await evaluate(`document.querySelectorAll('.mc-card').length`),8);
 await click(`document.querySelector('.mc-card button[aria-label=Negro]')`);assert.equal(await evaluate(`document.querySelector('.mc-card').querySelector('.mc-second')===null`),true);assert.match(await evaluate(`document.querySelector('.mc-card').querySelector('.mc-photo img').src`),/look-demo/);assert.equal(await evaluate(`document.querySelector('.mc-card .mc-price').textContent.includes('Desde')`),false);await screenshot('catalog-desktop-color.png');
 await click(`document.querySelector('.mc-card button[aria-label="Sin fotografía"]')`);assert.equal(await evaluate(`document.querySelector('.mc-card').querySelector('.mc-photo img')===null`),true);assert.equal(await evaluate(`document.querySelector('.mc-card').querySelector('.mc-placeholder')!==null`),true);
 await click(`document.querySelector('.mc-card button[aria-label=Rosa]')`);assert.match(await evaluate(`document.querySelector('.mc-card').querySelector('.mc-second').src`),/campaign-demo/);
 await click(`Array.from(document.querySelectorAll('.mc-pagination a')).find(a=>a.textContent.includes('Siguiente'))`);await wait(`location.search.includes('page=2')`);await ready();assert.equal(await evaluate(`document.querySelectorAll('.mc-card').length`),3);
 await evaluate('history.back()');await wait(`!location.search.includes('page=2')`);await ready();assert.equal(await evaluate(`document.querySelectorAll('.mc-card').length`),8);
 await evaluate(`(()=>{const e=document.querySelector('.mc-search input[type=search]');e.value='Camisa';e.form.requestSubmit();})()`);await wait(`location.search.includes('q=Camisa')`);await ready();assert.equal(await evaluate(`document.querySelectorAll('.mc-card').length`),3);
 await call('Page.reload');await ready();assert.equal(await evaluate(`document.querySelector('.mc-search input[type=search]').value`),'Camisa');
 await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/catalogo`});await ready();
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.mc-sidebar')).display`),'none');await screenshot('catalog-phone.png');
 await click(`document.querySelector('.mc-open-filters')`);assert.equal(await evaluate(`document.querySelector('dialog').open`),true);await screenshot('catalog-phone-filters.png');
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait(`!document.querySelector('dialog').open`);
 await click(`document.querySelector('.mc-card button[aria-label=Negro]')`);await screenshot('catalog-phone-color.png');
 await call('Emulation.setDeviceMetricsOverride',{width:820,height:1180,deviceScaleFactor:1,mobile:true});await delay(100);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 console.log('PASS M4 browser: colors/photo isolation, second photo same group, price range updates, placeholder, stock, URL search/reload/back/pagination, mobile dialog/Escape, desktop/tablet/phone');
 await call('Browser.close');
}finally{ws?.close();chrome?.kill();await new Promise(r=>server.close(r));}