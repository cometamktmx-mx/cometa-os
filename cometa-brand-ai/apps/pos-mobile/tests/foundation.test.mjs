import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,deps={}) { const module={exports:{}}; const source=readFileSync(path,'utf8').replaceAll('import.meta.env','({})'); const code=ts.transpileModule(source,{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',code)(name=>Object.hasOwn(deps,name)?deps[name]:name==='./environment'?{mobileConfig:testConfig}:require(name),module,module.exports);return module.exports; }
const policy=load('src/policy.ts');
const testConfig={channel:'development',backend:'http://127.0.0.1:3105',supabaseUrl:'http://127.0.0.1:58130',publicKey:'public-fixture',metadataUrl:'',release:'development'};
test('onboarding-seen persists only a presentation flag',()=>{const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};assert.equal(policy.hasSeenOnboarding(storage),false);policy.markOnboardingSeen(storage);assert.equal(policy.hasSeenOnboarding(storage),true);assert.deepEqual([...values],[[policy.onboardingKey,'yes']]);});
test('zero / one / multiple authorized businesses remain POS-only',()=>{assert.equal(policy.brandDestination([]),'empty');assert.equal(policy.brandDestination([{}]),'single');assert.equal(policy.brandDestination([{},{}]),'selector');});
test('M2 endpoints reject production, credentials and URL paths',()=>{for(const url of ['https://example.com','https://x.supabase.co','http://u:p@localhost','http://localhost/api','http://127.0.0.1.evil.test'])assert.throws(()=>policy.localOrigin(url));for(const url of ['http://127.0.0.1:3105','http://10.0.2.2:3105','http://192.168.1.4:3105'])assert.equal(policy.localOrigin(url),url);});
test('authorization failures are distinct from offline and server errors',()=>{assert.equal(policy.networkState(401),'auth');assert.equal(policy.networkState(403),'denied');assert.equal(policy.networkState(500),'server');assert.equal(policy.networkState(),'offline');});
test('native vault persists via secure plugin; absent entry is null and storage failures propagate',async()=>{
 const data=new Map();let fail=false;
 const vault=load('src/vault.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>true}},'@capgo/capacitor-native-biometric':{NativeBiometric:{isDataSaved:async({key})=>({isSaved:data.has(key)}),getData:async({key})=>{if(fail)throw Error('locked');return{value:data.get(key)}},setData:async({key,value})=>data.set(key,value),deleteData:async({key})=>data.delete(key)}}}).vault;
 assert.equal(await vault.getItem('host'),null);await vault.setItem('host','refresh-fixture');assert.equal(await vault.getItem('host'),'refresh-fixture');fail=true;await assert.rejects(vault.getItem('host'),/locked/);fail=false;await vault.removeItem('host');assert.equal(await vault.getItem('host'),null);
});
test('browser storage is memory only and separate vault instances cannot restore secrets',async()=>{
 const deps={'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}},'@capgo/capacitor-native-biometric':{NativeBiometric:{}}};const a=load('src/vault.ts',deps).vault,b=load('src/vault.ts',deps).vault;await a.setItem('host','secret-fixture');assert.equal(await a.getItem('host'),'secret-fixture');assert.equal(await b.getItem('host'),null);
});
test('mobile transport restores host, sends bearer/device/operator, locks operator and rejects stale credentials',async()=>{
 const data=new Map();const calls=[];let payload={},credentials={},status=200;let cleared=0,events=0;
 const previousFetch=globalThis.fetch,previousWindow=globalThis.window;
 globalThis.window={dispatchEvent:()=>{events++}};
 globalThis.fetch=async(url,init)=>{calls.push({url,headers:new Headers(init.headers)});return Response.json({payload,credentials},{status});};
 const vault={getItem:async k=>data.get(k)||null,setItem:async(k,v)=>data.set(k,v),removeItem:async k=>data.delete(k)};
 const auth={auth:{getSession:async()=>({data:{session:{access_token:'verified-by-server-fixture'}}})}};
 try {
 const mobile=load('src/transport.ts',{'@capacitor/core':{Capacitor:{isNativePlatform:()=>false},CapacitorHttp:{}},'@supabase/supabase-js':{createClient:(_u,_a,options)=>{assert.equal(options.auth.storage,vault);assert.equal(options.auth.detectSessionInUrl,false);return auth}},'./vault':{vault},'./policy':policy,'@/lib/pos/offline-storage':{clearPosLocalContext:async()=>{cleared++}}});
 payload={device:{id:'terminal'}};credentials={cometa_pos_device:'device-fixture'};
 await mobile.api('devices',{brandSlug:'brand',locationId:'branch'});assert.equal(JSON.parse(data.get('terminal')).brandSlug,'brand');
 payload={session:{staff:{id:'waiter'}}};credentials={cometa_pos_staff_session:'operator-fixture'};await mobile.api('operator-session',{action:'login',pin:'1234'});
 payload={};credentials={};await mobile.api('food?brandSlug=brand');assert.equal(calls.at(-1).headers.get('authorization'),'Bearer verified-by-server-fixture');assert.equal(calls.at(-1).headers.get('x-cometa-pos-device'),'device-fixture');assert.equal(calls.at(-1).headers.get('x-cometa-pos-staff-session'),'operator-fixture');assert.ok(!data.has('pin'));
 mobile.forgetOperator();await mobile.api('food?brandSlug=brand');assert.equal(calls.at(-1).headers.get('x-cometa-pos-staff-session'),null);assert.ok(data.has('terminal'));
 const immediateFetch=globalThis.fetch;let release;
 globalThis.fetch=()=>new Promise(resolve=>{release=resolve;});
 const pendingLogin=mobile.api('operator-session',{action:'login'});
 while(!release)await new Promise(resolve=>setImmediate(resolve));
 mobile.forgetOperator();release(Response.json({payload:{session:{}},credentials:{cometa_pos_staff_session:'late-operator'}}));
 await assert.rejects(pendingLogin,{name:'AbortError'});globalThis.fetch=immediateFetch;
 await mobile.api('food?brandSlug=brand');assert.equal(calls.at(-1).headers.get('x-cometa-pos-staff-session'),null);
 status=403;payload={code:'POS_DEVICE_REVOKED',error:'revoked'};await assert.rejects(mobile.api('food'),{status:403});assert.equal(cleared,1);assert.equal(events,1);
 await mobile.clearMobileContext();assert.equal(data.has('terminal'),false);
 }finally{globalThis.fetch=previousFetch;globalThis.window=previousWindow;}
});
test('server transport isolates parallel requests and preserves browser cookie fallback',async()=>{
 const web={get:()=>({value:'web'})};const transport=load('../../src/lib/pos/transport-server.ts',{'server-only':{},'next/headers':{cookies:async()=>web}});
 assert.equal(await transport.posCookies(),web);
 await Promise.all(['a','b'].map(bearer=>transport.withMobileTransport({bearer,values:new Map(),changes:{},discovery:false},async()=>{const jar=await transport.posCookies();jar.set('operator',bearer);await new Promise(r=>setTimeout(r,5));assert.equal((await transport.posCookies()).get('operator').value,bearer);assert.equal(transport.mobileTransport().bearer,bearer);})));assert.equal(transport.mobileTransport(),undefined);
});
test('bundle contains shared Food and no server modules or private credential names',()=>{
 const js=readdirSync('dist/assets').filter(p=>p.endsWith('.js')).map(p=>readFileSync(`dist/assets/${p}`,'utf8')).join('\n');
 assert.match(js,/PAYMENT_PENDING/);assert.match(js,/cometa_pos_device/);
 for(const match of js.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
   let claims;try{claims=JSON.parse(Buffer.from(match[1],'base64url').toString('utf8'));}catch{continue;}
   assert.notEqual(claims.role,'service_role','service-role JWT in mobile bundle');
 }
 assert.doesNotMatch(js,/sk_(?:live|test)_[a-zA-Z0-9]{16,}/);
 for(const text of ['SUPABASE_SERVICE_ROLE','STRIPE_SECRET_KEY','PIN_HASH_SECRET','createStaffSession','pos_revoke_device_v1','next/headers'])assert.ok(!js.includes(text),text);
 const app=readFileSync('src/App.tsx','utf8');assert.match(app,/PosFoodOperations/);assert.match(app,/hasSeenOnboarding/);assert.match(app,/appStateChange/);assert.match(app,/setPin\(""\)/);assert.ok(!app.includes('/workspace'));
});
