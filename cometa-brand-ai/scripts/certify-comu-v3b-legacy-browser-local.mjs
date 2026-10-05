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
const output = 'docs/visual-evidence/comu-product-editor-v3b/final-certification'; fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'comu-seller-visual-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9239', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let socket, seq = 0; const pending = new Map();
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('Browser evaluation failed'); return r.result.value; }
const results=[],stateFile='.env.comu-v3b-final-fixture.json';
let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{name:'LOCAL TEST V3B FINAL '+Date.now(),code:'V3B'+Date.now(),results:[]};
const persist=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
function pass(name){results.push({name,status:'PASS'});state.results.push({name,status:'PASS'});persist();console.log('PASS',name);}
async function until(expression){for(let i=0;i<180;i++){if(await evaluate(expression))return;await sleep(200);}throw Error('Timeout '+expression+' / '+await evaluate("document.querySelector('.pe-message')?.textContent||document.body.innerText.slice(0,150)"));}
async function click(text,scope='.product-editor'){const found=await evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope+' button')})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true;})()`);assert.ok(found,'Button available: '+text);await sleep(120);}
async function fill(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(80);}
const user=fixture.users.a;
async function http(route,method='GET',body){return evaluate(`fetch(${JSON.stringify(route)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},${body===undefined?'':`body:${JSON.stringify(JSON.stringify(body))},`}cache:'no-store'}).then(async r=>({status:r.status,data:await r.json()}))`);}
async function catalog(){const r=await http('/api/comu/seller/catalog?sellerId='+user.sellerId);assert.equal(r.status,200);return r.data;}
async function openProduct(productId){await send('Page.navigate',{url:state.url});await until("document.querySelector('[data-products-ready=true]') !== null");await fill('.sp-search input',state.name);await until(`document.querySelector('[data-product-id="${productId}"]') !== null`);await evaluate(`document.querySelector('[data-product-id="${productId}"] .sp-actions summary').click();document.querySelector('[data-product-id="${productId}"] .sp-actions button').click()`);await until("document.querySelector('[data-editor-ready=true]') !== null");await sleep(300);}
async function save(label){await click(label);await until("[...document.querySelectorAll('.pe-primary')].every(b=>!b.disabled)&&/guardad[oa]/i.test(document.querySelector('.pe-message')?.textContent||'')&&!/Reintenta|No se|Catálogo:|Mayoreo:|Fotografías:/.test(document.querySelector('.pe-message')?.textContent||'')");}
try{
  let tabs;for(let i=0;i<80;i++){try{tabs=await(await fetch('http://127.0.0.1:9239/json/list')).json();if(tabs.length)break;}catch{}await sleep(250);}assert.ok(tabs?.length);
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}});
  await send('Page.enable');await send('Network.enable');
  const jar=new Map();const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(r=>jar.set(r.name,r.value))}});assert.equal((await auth.auth.signInWithPassword({email:user.email,password:user.password})).error,null);
  const seller=await admin.from('comu_sellers').select('brand_id,brand_slug,status').eq('id',user.sellerId).single();assert.equal(seller.error,null);state.brandId=seller.data.brand_id;state.brandSlug=seller.data.brand_slug;state.sellerStatus=seller.data.status;state.url='http://localhost:3000/comu/seller/'+state.brandSlug+'/products';persist();
  await send('Network.setCookies',{cookies:[...jar].map(([name,value])=>({name,value,url:'http://localhost:3000',path:'/',sameSite:'Lax'}))});await send('Emulation.setDeviceMetricsOverride',{width:1536,height:1024,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:state.url});await until("document.querySelector('[data-products-ready=true]') !== null");

  const legacyId=fixture.productId;
  const before=await catalog();const original=before.products.find(p=>p.id===legacyId);assert.ok(original,'Existing legacy fixture');
  const existingName=state.name;state.name=original.name;
  const invariant=s=>({product:s.products.filter(p=>p.id===legacyId).map(p=>({id:p.id,product_code:p.product_code,category_id:p.category_id})),variants:s.variants.filter(v=>v.product_id===legacyId).map(v=>({id:v.id,sku:v.sku,attributes:v.attributes,barcode:v.barcode,active:v.active})).sort((a,b)=>a.id.localeCompare(b.id)),inventory:s.inventory.filter(i=>s.variants.some(v=>v.product_id===legacyId&&v.id===i.variant_id)).sort((a,b)=>(a.variant_id+a.location_id).localeCompare(b.variant_id+b.location_id))});
  await openProduct(legacyId);const status=before.listings.find(l=>l.product_id===legacyId).status;
  await fill('.pe-info input',original.name+' V3B check');await save(status==='PUBLISHED'?'Guardar cambios':'Guardar borrador');
  const after=await catalog();assert.deepEqual(invariant(after),invariant(before));
  state.name=original.name+' V3B check';await openProduct(legacyId);await fill('.pe-info input',original.name);await save(status==='PUBLISHED'?'Guardar cambios':'Guardar borrador');assert.deepEqual(invariant(await catalog()),invariant(before));
  state.name=existingName;pass('Existing legacy browser edit/reopen/restoration: IDs/SKU/product_code/attributes/barcode/inventory preserved');
  fs.writeFileSync(output+'/legacy-results.json',JSON.stringify({status:'PASS',productId:legacyId,fields:['SKU','product_code','attributes','variant IDs','barcode','inventory'],restoredOriginalName:true},null,2));
}finally{if(socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}chrome.kill();}
