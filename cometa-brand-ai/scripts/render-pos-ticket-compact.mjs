// Local HTML only. No application session, printer, sale, or drawer operations.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const dir=path.resolve('build/retail-compact'),profile=path.join(dir,'chrome-'+Date.now());
fs.mkdirSync(profile,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try{
 const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await delay(100);assert.ok(fs.existsSync(active));
 let port;for(let i=0;i<100&&!port;i++){try{port=fs.readFileSync(active,'utf8').split('\n')[0];}catch{await delay(100);}}assert.ok(port);
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 let serial=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails);return r.result.value;};
 await call('Page.enable');await call('Emulation.setDeviceMetricsOverride',{width:303,height:800,deviceScaleFactor:2,mobile:false});
 const measurements=[];
 for(const name of ['before','after','short-after']){
  await call('Page.navigate',{url:pathToFileURL(path.join(dir,name+'.html')).href});
  for(let i=0;i<100;i++){if(await evaluate('document.readyState==="complete" && !!document.querySelector("h1")'))break;await delay(50);}
  await evaluate('document.fonts.ready.then(()=>true)');
  const m=await evaluate('({height:document.body.getBoundingClientRect().height,width:document.body.getBoundingClientRect().width,overflow:[...document.querySelectorAll("td")].some(e=>e.scrollWidth>e.clientWidth+1),font:getComputedStyle(document.body).fontSize})');
  assert.equal(m.overflow,false,name+' cell overflow');
  const heightMm=m.height*25.4/96;
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:303,height:Math.ceil(m.height),scale:1}});
  fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(shot.data,'base64'));
  measurements.push({name,paperWidthMm:80,contentWidthMm:Number((m.width*25.4/96).toFixed(2)),contentHeightMm:Number(heightMm.toFixed(2)),estimatedRasterDots:{width:560,height:Math.ceil(heightMm*8)},font:m.font,physicalValidated:false});
 }
 fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify(measurements,null,2));
 console.log(JSON.stringify(measurements,null,2));
}finally{ws?.close();chrome.kill();}
