// Real Chromium screenshots with existing LOCAL Auth; no mock API responses.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';
import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
const fixture = JSON.parse(fs.readFileSync('.env.comu-certification-fixture.json', 'utf8'));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const output = 'docs/visual-evidence/comu-product-editor-v3b'; fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'comu-seller-visual-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9238', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let socket, seq = 0; const pending = new Map();
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('Browser evaluation failed'); return r.result.value; }
const results=[];
async function until(expression) { for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(300);}throw Error('Browser condition timed out: '+expression); }
async function shot(name,width) { await evaluate("document.querySelectorAll('nextjs-portal').forEach(e=>e.style.visibility='hidden')");await evaluate('document.fonts.ready.then(()=>true)');await sleep(300);const metrics=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert.ok(metrics.scroll<=metrics.width,JSON.stringify(metrics));const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:await evaluate('document.documentElement.scrollHeight'),scale:1}});fs.writeFileSync(`${output}/${name}.png`,Buffer.from(result.data,'base64'));results.push({name,...metrics});console.log('PASS visual',name,metrics); }
try {
  let tabs;for(let i=0;i<80;i++){try{tabs=await(await fetch('http://127.0.0.1:9238/json/list')).json();if(tabs.length)break;}catch{}await sleep(250);}
  assert.ok(tabs?.length,'Chromium unavailable');socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}});
  await send('Page.enable');await send('Network.enable');
  for(const label of ['a','b']){
    const user=fixture.users[label],jar=new Map();const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(r=>jar.set(r.name,r.value))}});
    assert.equal((await auth.auth.signInWithPassword({email:user.email,password:user.password})).error,null);
    const seller=await admin.from('comu_sellers').select('brand_slug,status').eq('id',user.sellerId).single();assert.equal(seller.error,null);
    await send('Network.clearBrowserCookies');await send('Network.setCookies',{cookies:[...jar].map(([name,value])=>({name,value,url:'http://localhost:3000',path:'/',sameSite:'Lax'}))});
    for(const [device,width,height] of [['desktop',1536,1024],['tablet',834,1112],['phone',390,844]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'});
      await send('Page.navigate',{url:`http://localhost:3000/comu/seller/${seller.data.brand_slug}/products`});await until("document.querySelector('[data-products-ready=true]') !== null");
      await evaluate("document.querySelector('.sp-primary').click()");await until("document.querySelector('[data-editor-ready=true]') !== null");
      assert.equal(await evaluate("document.querySelector('.product-editor').innerText.includes('JSON')"),false);
      assert.ok(await evaluate("document.querySelector('.seller-sidebar') !== null"));
      const contract=await evaluate(`fetch('/api/comu/seller/catalog?sellerId=${encodeURIComponent(user.sellerId)}').then(r=>r.json()).then(d=>({version:d.variantContract?.version||null,definitions:d.attributeDefinitions?.length||0}))`);
      results.push({seller:label,device,contract});console.log('REAL catalog contract',label,device,contract);
      await evaluate('scrollTo(0,0)');await shot(`product-editor-create-${label==='a'?'': 'preparing-'}${device}`,width);
      await evaluate("document.querySelector('.pe-back').click()");await evaluate("document.querySelector('.sp-actions summary').click();document.querySelector('.sp-actions[open] button').click()");await until("document.querySelector('[data-editor-ready=true]') !== null");
      await sleep(500);await evaluate('scrollTo(0,0)');
      if(label==='a'&&device==='desktop') {await shot('product-editor-edit-desktop',width);await shot('product-editor-variants-desktop',width);}
      if(device==='phone')await shot(`product-editor-edit-${label}-phone`,width);
      assert.ok(await evaluate("[...document.querySelectorAll('.pe-variant input')].some(e=>e.value.length>0)"));
    }
  }
  fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));
}finally{if(socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}chrome.kill();}
