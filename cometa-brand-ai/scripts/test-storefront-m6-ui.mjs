// Real component/browser. All order, contact, stock and payment data below are fixtures.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'cometa-m6-ui-'));
const evidence=path.resolve('docs/evidence/m6');fs.mkdirSync(evidence,{recursive:true});
const brand='11111111-1111-4111-8111-111111111111',product='22222222-2222-4222-8222-222222222222',variant='33333333-3333-4333-8333-333333333333',orderId='44444444-4444-4444-8444-444444444444';
const appearance={name:'MAGENTA',logo:'',announcement:'ESTUDIO LOCAL · DATOS SIMULADOS',footer:'Evidencia M6. Sin cobros reales.',paper:'#fff9f5',ink:'#29191f',accent:'#740a32',soft:'#fce5ec',font:'editorial',spacing:64,motion:false,entrance:false,navigation:[{title:'Inicio',url:'/'},{title:'Catálogo',url:'/catalogo'}],sections:[]};
fs.writeFileSync(path.join(temp,'loader.cjs'),`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(s){return ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;};`);
fs.writeFileSync(path.join(temp,'entry.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{Checkout}from'${path.resolve('packages/own-storefront/checkout').replaceAll('\\','/')}';import{StoreHome}from'${path.resolve('packages/own-storefront/home').replaceAll('\\','/')}';createRoot(document.getElementById('root')).render(<StoreHome appearance={${JSON.stringify(appearance)}} products={[]} mediaBase="/"><Checkout brandId="${brand}" orderId={location.pathname.startsWith('/pedido/')?'${orderId}':''}/></StoreHome>);`);
const {webpack}=require('next/dist/compiled/webpack/webpack');
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,context:root,entry:path.join(temp,'entry.tsx'),output:{path:temp,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules')]},module:{rules:[{test:/\.tsx?$/,use:path.join(temp,'loader.cjs')}]}});compiler.run((e,s)=>{compiler.close(()=>{});if(e||s.hasErrors())reject(e??Error(s.toString({all:false,errors:true})));else resolve();});});
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync('packages/own-storefront/home.css','utf8')}${fs.readFileSync('packages/own-storefront/checkout.css','utf8')}body{margin:0;font-family:Arial}#fixture{padding:8px;background:#740a32;color:white;font-size:12px}</style><div id="fixture">M6 · React real · sesión, envío y pagos SIMULADOS · sin conexión comercial</div><div id="root"></div><script>window.process={env:{}};if(!localStorage.getItem('seeded')){localStorage.setItem('seeded','1');localStorage.setItem('cometa.own-store.bag.v1.${brand}',JSON.stringify([{productId:'${product}',variantId:'${variant}',quantity:1}]))}</script><script src="/bundle.js"></script></html>`;
const order={id:orderId,status:'PAID',currency:'MXN',subtotal_cents:89000,shipping_cents:5000,total_cents:94000,expires_at:new Date(Date.now()+600000).toISOString()};
const server=http.createServer(async(req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(temp,'bundle.js')));return;}
 if(req.url.startsWith('/api/checkout')){
  res.setHeader('Content-Type','application/json');
  if(req.method==='GET'){res.end(JSON.stringify({order:req.url.includes('order=')?order:null}));return;}
  const chunks=[];for await(const b of req)chunks.push(b);const b=JSON.parse(Buffer.concat(chunks));
  if(b.action==='session'){res.end('{"ready":true}');return;}
  await new Promise(r=>setTimeout(r,250));const qty=b.lines?.[0]?.quantity??1,ready=!!b.contact;
  res.end(JSON.stringify({brandId:brand,currency:'MXN',items:[{productId:product,variantId:variant,name:'Conjunto Atelier · fixture',variantName:'Rosa / M',quantity:qty,unitCents:89000,totalCents:89000*qty,available:true}],subtotalCents:89000*qty,discountCents:0,shippingCents:ready?5000:null,totalCents:ready?89000*qty+5000:null,quoteId:ready?'fixture':null,ready,blockers:ready?[]:['Completa la entrega para revisar el envío.']}));return;
 }
 res.setHeader('Content-Type','text/html');res.end(html);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let chrome,ws;
try{
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${path.join(temp,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const delay=ms=>new Promise(r=>setTimeout(r,ms)),active=path.join(temp,'profile','DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);assert.ok(fs.existsSync(active));
 const port=fs.readFileSync(active,'utf8').split('\n')[0],targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let serial=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Timeout '+expression);};
 const shot=async name=>{const s=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(evidence,name),Buffer.from(s.data,'base64'));};
 await call('Page.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/checkout`});await wait("document.querySelector('.m6-line')?.textContent.includes('Atelier')");assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await shot('checkout-desktop.png');
 await evaluate(`Array.from(document.querySelectorAll('.m6-fields input')).forEach((x,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(x,['Persona Fixture','test@example.invalid','5555555555','Dirección de prueba','','Ciudad','Estado','00000','MX'][i]);x.dispatchEvent(new Event('input',{bubbles:true}));x.dispatchEvent(new Event('change',{bubbles:true}));})`);
 await evaluate("document.querySelector('form').requestSubmit()");await wait("document.querySelector('.m6-total').textContent.includes('940')");await shot('checkout-summary-fixture.png');
 for(const [width,height,name] of [[820,1180,'checkout-tablet.png'],[390,844,'checkout-phone.png']]){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(150);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await shot(name);}
 await call('Page.reload');await wait("document.querySelector('.m6-line')?.textContent.includes('Atelier')");assert.equal(await evaluate("document.querySelector('.m6-fields input').value"),'');
 await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/pedido/${orderId}`});await wait("document.querySelector('.m6-order')?.textContent.includes('Pago confirmado')");await shot('confirmation-phone-fixture.png');
 console.log('PASS M6 browser: actual React desktop/tablet/phone, no overflow, form/summary, delayed synthetic quote, reload bag retention, contact not persisted, fixture paid confirmation. HTTP/session/payment data simulated, no Stripe checkout screen certified.');
}finally{ws?.close();chrome?.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
