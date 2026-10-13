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
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'cometa-m2-preview-'));
const evidence=path.resolve('docs/evidence/m2');fs.mkdirSync(evidence,{recursive:true});
const uuid=()=>randomUUID(), product=uuid(),v1=uuid(),v2=uuid(),v3=uuid(),relatedId=uuid();
const p1=`fixture/web/${uuid()}/${uuid()}.jpg`,p2=`fixture/web/${uuid()}/${uuid()}.png`;
const content={colors:[{id:uuid(),name:'Magenta · fixture',hex:'#a51962',swatchPath:'',variantIds:[v1,v2],photos:[{path:p1,alt:'Recurso de diseño ZIP · fixture M2'}]},{id:uuid(),name:'Segundo tono · fixture',hex:'',swatchPath:'',variantIds:[v3],photos:[{path:p2,alt:'Segundo recurso de diseño · fixture M2'}]}],benefits:[{id:uuid(),icon:'layers',title:'Beneficio de prueba',description:'Contenido sintético; no es una afirmación sobre un producto real.',enabled:true}],details:[{id:uuid(),title:'Detalles de prueba',content:'Texto de prueba <script>window.pwned=true</script>',enabled:true,open:false}],guide:{content:'Medidas sintéticas para probar la interfaz.',columns:['Talla','Medida de prueba'],rows:[['S','10'],['M','20']],imagePath:''},relatedIds:[relatedId],wholesale:{enabled:true,title:'Información de prueba',content:'Sin reglas de precio ni descuentos.'}};
const channels={physicalRequested:true,onlineRequested:true,revision:1,physicalEffective:true,onlineEffective:true,catalogEligible:true,canManagePhysical:true,canManageOnline:true,serviceStatus:'enabled'};
const data={catalog:{id:product,name:'Prenda de prueba M2',brandName:'MAGENTA · fixture',currency:'MXN',variants:[{id:v1,name:'S',attributes:{color:'Magenta',size:'S'},price:299,available:3,active:true},{id:v2,name:'M',attributes:{color:'Magenta',size:'M'},price:319,available:0,active:true},{id:v3,name:'S',attributes:{color:'Otro',size:'S'},price:329,available:2,active:true}]},web:{revision:0,draft:content,published:null,publishedRevision:null},channels,media:{[p1]:'/hero-demo.jpg',[p2]:'/look-demo-v4.png'},related:[{id:relatedId,name:'Complemento de prueba'}]};
fs.writeFileSync(path.join(temp,'transport.ts'),`const channels=${JSON.stringify(channels)};const fetcher=async()=>({ok:true,json:async()=>({ok:true,channels})});export const usePosFetch=()=>fetcher;`);
fs.writeFileSync(path.join(temp,'loader.cjs'),`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){if(this.resourcePath.endsWith('.css'))return '';return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;};`);
fs.writeFileSync(path.join(temp,'entry.tsx'),`
import React from 'react';import{createRoot}from'react-dom/client';
import{WebEditorSurface}from'${path.resolve('src/app/brand/[brandSlug]/pos/products/product-web-editor').replaceAll('\\','/')}';
import{ProductSalesChannels}from'${path.resolve('src/app/brand/[brandSlug]/pos/products/product-channels').replaceAll('\\','/')}';
const data=${JSON.stringify(data)};window.m2={calls:[],fail:false};let revision=0,published=null,publishedRevision=null;
createRoot(document.getElementById('root')).render(<WebEditorSurface data={data} channels={<ProductSalesChannels brandSlug="fixture" productId="${product}"/>} reload={()=>location.reload()} upload={async()=>{throw Error('Storage real no conectado en esta prueba')}} search={async()=>data.related} save={async(document,expected,publish)=>{window.m2.calls.push({document,expected,publish});if(window.m2.fail)throw Object.assign(Error('Conflicto simulado: recarga'),{code:'POS_WEB_CONFLICT'});if(expected!==revision)throw Error('Revision mismatch');revision++;if(publish){published=structuredClone(document);publishedRevision=revision;}return{revision,draft:structuredClone(document),published,publishedRevision};}}/>);
`);
const {webpack}=require('next/dist/compiled/webpack/webpack');
await new Promise((resolve,reject)=>{
 const compiler=webpack({mode:'development',devtool:false,context:root,entry:path.join(temp,'entry.tsx'),output:{path:temp,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')],alias:{'@/lib/pos/client-transport':path.join(temp,'transport.ts'),'@':path.join(root,'src')}},module:{rules:[{test:/\.(tsx?|css)$/,use:path.join(temp,'loader.cjs')}]}});
 compiler.run((error,stats)=>{compiler.close(()=>{});if(error||stats.hasErrors())reject(error??Error(stats.toString({all:false,errors:true})));else resolve();});
});
const {compile}=await import('@tailwindcss/node');const compiler=await compile('@import "tailwindcss";',{base:root,onDependency(){}});
const m1=fs.readFileSync('src/app/brand/[brandSlug]/pos/products/product-channels.tsx','utf8');
const css=compiler.build(m1.match(/[\w!:[\]#%().,/-]+/g));
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M2 · evidencia aislada</title><style>${css}${fs.readFileSync('src/app/brand/[brandSlug]/pos/products/product-web.css','utf8')}body{margin:0;background:#f6f5f0}#evidence{padding:8px 20px;background:#163d32;color:white;font:12px Arial}#root{max-width:1440px;margin:auto}</style><div id="evidence">M2 · Componentes reales · datos, sesión y transporte simulados · sin tienda pública</div><div id="root"></div><script src="/bundle.js"></script></html>`;
const server=http.createServer((req,res)=>{
 const files={'/bundle.js':path.join(temp,'bundle.js'),'/hero-demo.jpg':path.join(evidence,'hero-demo.jpg'),'/look-demo-v4.png':path.join(evidence,'look-demo-v4.png')};
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
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
 await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});await wait(`document.querySelector('.pw-buy')!==null`);
 await wait(`Array.from(document.images).every(i=>i.complete)`);await wait(`document.querySelector('[aria-labelledby=product-sales-channels]').textContent.includes('En caja: incluido')`);
 const screenshot=async name=>{const full=name.includes('phone');const layout=full?await call('Page.getLayoutMetrics'):null;const clip=layout?{x:0,y:0,width:390,height:Math.ceil(layout.cssContentSize.height),scale:1}:undefined;const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:full,...(clip?{clip}:{})});fs.writeFileSync(path.join(evidence,name),Buffer.from(shot.data,'base64'));};
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 await screenshot('product-web-desktop.png');
 assert.match(await evaluate(`document.querySelector('.pw-hero-image img').getAttribute('src')`),/hero-demo/);
 await click(`document.querySelectorAll('.pw-store .pw-swatch')[1]`);
 assert.match(await evaluate(`document.querySelector('.pw-hero-image img').getAttribute('src')`),/look-demo/);
 assert.equal(await evaluate(`document.querySelectorAll('.pw-store .pw-thumbnails button').length`),1);
 assert.equal(await evaluate(`document.querySelectorAll('.pw-store .pw-sizes button').length`),1);
 await click(`document.querySelectorAll('.pw-store .pw-swatch')[0]`);
 await click(`document.querySelectorAll('.pw-store .pw-sizes button')[1]`);
 assert.match(await evaluate(`document.querySelector('.pw-price').textContent`),/319/);
 assert.ok((await evaluate(`document.querySelector('.pw-store-info').textContent`)).includes('Agotado'));
 await click(`Array.from(document.querySelectorAll('.pw-store button')).find(b=>b.textContent.includes('Guía de tallas'))`);
 assert.equal(await evaluate(`document.querySelectorAll('.pw-guide-overlay tbody tr').length`),2);
 await click(`document.querySelector('.pw-guide-overlay button')`);
 await click(`document.querySelector('.pw-preview-detail summary')`);assert.equal(await evaluate(`document.querySelector('.pw-preview-detail').open`),true);assert.equal(await evaluate('Boolean(window.pwned)'),false);
 assert.equal(await evaluate(`document.querySelector('.pw-buy').disabled`),true);
 await evaluate(`(()=>{const e=document.querySelector('.pw-repeat input:not([type=checkbox])');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Beneficio editado sin guardar');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(100);
 assert.ok((await evaluate(`document.querySelector('.pw-benefits-preview').textContent`)).includes('editado sin guardar'));
 assert.equal(await evaluate('window.m2.calls.length'),0);
 await click(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Guardar borrador')`);await wait('window.m2.calls.length===1');
 assert.equal(await evaluate('window.m2.calls[0].publish'),false);
 await click(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Publicar cambios')`);await wait('window.m2.calls.length===2');assert.equal(await evaluate('window.m2.calls[1].publish'),true);
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate('scrollTo(0,0)');await delay(200);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await screenshot('product-web-phone-edit.png');
 await click(`document.querySelectorAll('.pw-mobile-nav button')[1]`);await screenshot('product-web-phone-preview.png');
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.pw-fields')).display`),'none');
 await call('Emulation.setDeviceMetricsOverride',{width:820,height:1180,deviceScaleFactor:1,mobile:true});await delay(100);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 await evaluate('window.m2.fail=true');await click(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Guardar borrador')`);await wait(`document.querySelector('[role=alert]')!==null`);
 assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Publicar cambios').disabled`),true);
 console.log('PASS M2 browser: explicit color photo filtering, actual variant prices/zero stock, guide, details, escaped content, unsaved live preview, separate draft/publication, conflict lock, desktop/tablet/phone without overflow');
 await call('Browser.close');
}finally{ws?.close();chrome?.kill();await new Promise(r=>server.close(r));}
