import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
assert.equal(process.argv[2],'--authorized-courtesy-release');
const dir='.next/release-private-20261011',raw=fs.readFileSync(dir+'/api-keys.private.json');
const keys=JSON.parse(raw.toString(raw[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,''));
const url='https://zhtagqrzyovsrmsicaot.supabase.co',origin='https://app.cometaos.com';
const db=createClient(url,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false,autoRefreshToken:false}});
const sessions=[],evidence=[];
function data(r,label){if(r.error)throw Error(label+': '+r.error.code);return r.data;}
async function session(id){
 const user=data(await db.auth.admin.getUserById(id),'identity').user;
 const link=data(await db.auth.admin.generateLink({type:'magiclink',email:user.email}),'temporary link');
 const jar=new Map(),client=createServerClient(url,keys.find(k=>k.name==='anon').api_key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(c=>jar.set(c.name,c.value))}});
 assert.equal(data(await client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'}),'temporary OTP').user.id,id);sessions.push(client);
 return async(slug,body)=>{
  console.log('Checking',slug,body?.action||'read');
  const r=await fetch(origin+'/api/admin/brands/'+slug+'/pos-courtesy',{method:body?'PATCH':'GET',headers:{Origin:origin,Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
  const b=await r.json();evidence.push({slug,method:body?'PATCH':'GET',status:r.status});fs.writeFileSync(dir+'/courtesy-http-progress.json',JSON.stringify(evidence));console.log('HTTP',r.status);return{status:r.status,body:b};
 };
}
function ok(r){if(r.status!==200)throw Error('Courtesy HTTP '+r.status+' '+r.body.error);return r.body;}
try{
 const admin=await session('c7f07107-180b-4019-859b-33bdbe9a6445'),owner=await session('493f2651-9690-42f0-afe8-e34c8848754e');
 assert.equal((await fetch(origin+'/api/admin/brands/magenta-fitwear/pos-courtesy')).status,401);
 assert.equal((await owner('magenta-fitwear')).status,403);
 assert.equal((await owner('magenta-fitwear',{action:'save',expectedId:null,plan:'pro',endsAt:null,reason:'Must be denied'})).status,403);
 const fixture=JSON.parse(fs.readFileSync(dir+'/http-fixtures.private.json','utf8')).retail.brand.slug;
 assert.ok(fixture.startsWith('release-test-'));
 let m=ok(await admin(fixture));let active=m.grants.find(g=>g.status==='active');
 const plan=m.access.effective.planCode||m.plans[0].code;
 const save={action:'save',expectedId:active?.id??null,plan,endsAt:null,reason:'PRUEBA IDENTIFICADA cortesía; no cliente'};
 m=ok(await admin(fixture,save));assert.equal(m.access.grant.active,true);active=m.grants.find(g=>g.status==='active');
 assert.equal((await admin(fixture,save)).status,409);
 m=ok(await admin(fixture,{...save,expectedId:active.id,endsAt:new Date(Date.now()+86400000).toISOString(),reason:'PRUEBA cambio de vigencia'}));active=m.grants.find(g=>g.status==='active');
 assert.equal(m.access.grant.active,true);
 m=ok(await admin(fixture,{...save,action:'revoke',expectedId:active.id,reason:'PRUEBA retiro; conservar datos'}));assert.equal(m.access.grant.active,false);assert.ok(m.events.length>=3);
 m=ok(await admin('magenta-fitwear'));active=m.grants.find(g=>g.status==='active');
 const originalPlan=m.access.effective.planCode;assert.ok(originalPlan&&m.plans.some(p=>p.code===originalPlan));
 const reason='Cliente de Agencia COMETA — cortesía comercial';
 if(!(active?.ends_at==='infinity'&&active.reason===reason))m=ok(await admin('magenta-fitwear',{action:'save',expectedId:active?.id??null,plan:originalPlan,endsAt:null,reason}));
 m=ok(await admin('magenta-fitwear'));assert.equal(m.access.effective.accessAllowed,true);assert.equal(m.access.effective.accessSource,'commercial_grant');assert.equal(m.access.grant.endsAt,null);assert.equal(m.access.subscriptionLifecycle.effectiveStatus,'trial_expired');
 fs.writeFileSync(dir+'/courtesy-http-pass.json',JSON.stringify({at:new Date().toISOString(),evidence,plan:originalPlan,magenta:'complimentary, unlimited, revocable; native trial unchanged',auth:'real OTP generated administratively, no messages or password changes'},null,2));
 console.log('PASS real HTTP/Auth/PostgREST admin grant/replace/revoke/history/conflict; anonymous/owner denied; MAGENTA unlimited courtesy, original plan, trial unchanged');
}finally{for(const client of sessions)await client.auth.signOut({scope:'local'});}
