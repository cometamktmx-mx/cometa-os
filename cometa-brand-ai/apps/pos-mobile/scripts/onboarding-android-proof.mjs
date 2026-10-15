// Real debug WebView + native screenshots. No account/PIN/DB changes or app install.
// Run from apps/pos-mobile: node scripts/onboarding-android-proof.mjs SERIAL LABEL
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const serial=process.argv[2],label=process.argv[3];
assert.match(serial||'',/^emulator-\d+$/);assert.match(label||'',/^[a-z0-9-]+$/);
const adb=process.env.ADB_EXE||'C:/Users/jesus/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const output=path.resolve('artifacts/m2-6');mkdirSync(output,{recursive:true});
function command(args,binary=false){const r=spawnSync(adb,['-s',serial,...args],{encoding:binary?undefined:'utf8',windowsHide:true,timeout:20000,maxBuffer:20*1024*1024});if(r.error||r.status!==0)throw Error(String(r.error||r.stderr));return r.stdout;}
const pid=command(['shell','pidof','com.cometaos.pos']).trim();assert.match(pid,/^\d+$/);
const port=serial==='emulator-5554'?9236:9237;
command(['forward',`tcp:${port}`,`localabstract:webview_devtools_remote_${pid}`]);
const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page=pages.find(p=>p.url.startsWith('https://localhost'));assert.ok(page,'Local Capacitor WebView required');
const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
const pending=new Map();let id=0;
socket.onmessage=event=>{const value=JSON.parse(event.data);if(value.id){const item=pending.get(value.id);if(item){clearTimeout(item.timer);pending.delete(value.id);value.error?item.reject(Error(value.error.message)):item.resolve(value.result);}}};
function cdp(method,params={}){return new Promise((resolve,reject)=>{const current=++id;const timer=setTimeout(()=>{pending.delete(current);reject(Error('CDP timeout '+method));},15000);pending.set(current,{resolve,reject,timer});socket.send(JSON.stringify({id:current,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value;}
async function until(expression){for(let i=0;i<40;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI condition timeout: '+expression);}
function capture(name){writeFileSync(path.join(output,`${label}-${name}.png`),command(['exec-out','screencap','-p'],true));}
async function resetPresentation(){await evaluate("localStorage.removeItem('cometa-pos-onboarding-v1'); location.reload();");await until("!!document.querySelector('.ob-continue')");}
async function settle(){await evaluate("Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))");await new Promise(r=>setTimeout(r,380));}
const metrics=[];
try {
  await resetPresentation();
  for(let n=1;n<=4;n++){
    await settle();
    const state=await evaluate(`(() => {const root=document.querySelector('.pos-onboarding');const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};return {slide:root.dataset.slide,layout:root.dataset.layout,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,headline:document.querySelector('h1').innerText,cta:rect('.ob-continue'),account:rect('.ob-account'),skip:rect('.ob-skip'),safeTop:getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top'),safeBottom:getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom'),buttons:[...root.querySelectorAll('button')].map(b=>({text:b.innerText||b.getAttribute('aria-label'),height:b.getBoundingClientRect().height}))}})()`);
    metrics.push(state);capture(`slide-${n}`);
    assert.ok(state.scrollWidth<=state.width+1,'Horizontal overflow');
    assert.ok(state.scrollHeight<=state.height+1,'Vertical overflow');
    assert.ok(state.cta.bottom<=state.height+1,'CTA outside viewport');
    assert.ok(state.account.bottom<=state.height+1,'Account entry outside viewport');
    assert.ok(state.skip.y>=parseFloat(state.safeTop||'0'),'Skip behind status bar');
    assert.ok(state.buttons.every(b=>b.height>=43.5),'Touch target below 44px');
    if(n<4){await evaluate("document.querySelector('.ob-continue').click()");await until(`document.querySelector('.ob-count b').textContent==='0${n+1}'`);}
  }
  // A real progress control returns to the first slide; Skip persists the flag.
  await evaluate("document.querySelector('[aria-label=\"Ir a slide 1\"]').click()");await until("document.querySelector('.ob-count b').textContent==='01'");
  await evaluate("document.querySelector('.ob-skip').click()");await until("!!document.querySelector('input[type=email]')");
  assert.equal(await evaluate("localStorage.getItem('cometa-pos-onboarding-v1')"),'yes');capture('auth-after-skip');
  await evaluate('location.reload()');await until("!!document.querySelector('input[type=email]')");
  assert.equal(await evaluate("!!document.querySelector('.pos-onboarding')"),false,'Seen onboarding must not reopen after reload');
  // Account entry and final CTA use exactly the same existing Auth entry.
  await resetPresentation();await evaluate("document.querySelector('.ob-account').click()");await until("!!document.querySelector('input[type=email]')");
  await resetPresentation();await evaluate("document.querySelector('[aria-label=\"Ir a slide 4\"]').click()");await until("document.querySelector('.ob-count b').textContent==='04'");
  await evaluate("document.querySelector('.ob-continue').click()");await until("!!document.querySelector('input[type=email]')");
  assert.equal(await evaluate("localStorage.getItem('cometa-pos-onboarding-v1')"),'yes');
  // Leave the presentation open for review; do not read/change account credentials.
  await resetPresentation();await settle();
  writeFileSync(path.join(output,`${label}-metrics.json`),JSON.stringify({serial,metrics,navigation:'PASS',seenFlag:'PASS',authEntry:'PASS'},null,2));
  console.log(JSON.stringify({serial,label,screenshots:output,metrics,navigation:'PASS'},null,2));
} finally {socket.close();command(['forward','--remove',`tcp:${port}`]);}
