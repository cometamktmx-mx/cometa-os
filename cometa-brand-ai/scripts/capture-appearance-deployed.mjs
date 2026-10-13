// Read-only browser verification of the deployed editor with the real owner session.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
assert.equal(process.argv[2],'--authorized-owner-preview');
const dir='.next/release-private-20261011',raw=fs.readFileSync(dir+'/api-keys.private.json');
const keys=JSON.parse(raw.toString(raw[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,''));
const url='https://zhtagqrzyovsrmsicaot.supabase.co',origin='https://app.cometaos.com',owner='493f2651-9690-42f0-afe8-e34c8848754e';
const db=createClient(url,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=r=>{if(r.error)throw Error(r.error.code);return r.data;};
const user=checked(await db.auth.admin.getUserById(owner)).user,link=checked(await db.auth.admin.generateLink({type:'magiclink',email:user.email}));
const jar=new Map(),client=createServerClient(url,keys.find(k=>k.name==='anon').api_key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(c=>jar.set(c.name,c.value))}});
assert.equal(checked(await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'})).user.id,owner);
const profile=path.resolve(dir,'editor-browser-'+Date.now());fs.mkdirSync(profile);const evidence='docs/evidence/appearance-visual';fs.mkdirSync(evidence,{recursive:true});
let chrome,ws;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const active=path.join(profile,'DevToolsActivePort');for(let n=0;n<100&&!fs.existsSync(active);n++)await delay(100);assert.ok(fs.existsSync(active));
 const port=fs.readFileSync(active,'utf8').split('\n')[0],targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let serial=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('Browser protocol failed')):p.resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(Error('Browser timeout '+method)),45000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Page evaluation failed');return r.result.value;};
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setCookies',{cookies:[...jar].map(([name,value])=>({name,value,url:origin,secure:true,sameSite:'Lax',path:'/'}))});
 await call('Emulation.setDeviceMetricsOverride',{width:1536,height:1024,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:origin+'/brand/magenta-fitwear/pos/online-store/appearance'});
 for(let n=0;n<150;n++){if(await evaluate('Boolean(document.querySelector(".ae-inspector") && document.querySelector("iframe")?.contentDocument?.querySelector(".mag-home"))'))break;await delay(200);}
 assert.equal(await evaluate('Boolean(document.querySelector(".ae-inspector"))'),true,'real authenticated editor loaded');
 assert.equal(await evaluate('Boolean(document.querySelector(".ae-error"))'),false);
 await evaluate('document.fonts.ready.then(()=>true)');await delay(700);
 assert.ok(await evaluate('Array.from(document.querySelectorAll(".ae-row-name")).every(e=>e.textContent.trim().length>3)'));
 assert.equal(await evaluate('document.querySelector(".ae-top-actions a")?.href'),'https://magenta-controlled-preview.vercel.app/');
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 const shot=async name=>{const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(evidence,name),Buffer.from(r.data,'base64'));};
 await shot('editor-real-magenta-desktop.png');
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);
 await evaluate('Array.from(document.querySelectorAll(".ae-mobile-tabs button")).find(e=>e.textContent==="Vista previa").click()');
 await evaluate('Array.from(document.querySelectorAll(".ae-preview-tools button")).find(e=>e.textContent.includes("Celular")).click()');await delay(300);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);assert.ok(await evaluate('document.querySelector("iframe").getBoundingClientRect().height>400'));
 await shot('editor-real-magenta-phone.png');
 console.log('PASS real deployed owner editor, courtesy access, iframe preview, store link, desktop/phone, no content edits. Auth OTP generated administratively, no email.');
 await call('Browser.close');
}finally{ws?.close();chrome?.kill();await client.auth.signOut({scope:'local'});}
