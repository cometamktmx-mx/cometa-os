// Authorized Production variables only. Shared values retain their Preview scope.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
assert.equal(process.argv[2],'--authorized-launch');
const dir='.next/release-private-20261011',vc=path.join(process.env.APPDATA,'npm/node_modules/vercel/dist/vc.js'),scope='cometa-os-s-projects';
const projects={admin:'prj_ecEVtItINKExbKMjTCfterMj1tJy',storefront:'prj_MOOHfmywnzMF83PxRtqpDk1fvAqE'};
function api(url,method='GET',body){const args=['api',url,'--scope',scope,'--method',method];if(body){fs.writeFileSync(dir+'/vercel-body.private.json',JSON.stringify(body),{mode:0o600});args.push('--input',path.resolve(dir+'/vercel-body.private.json'));}try{return JSON.parse(execFileSync(process.execPath,[vc,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20000000}));}catch(e){fs.writeFileSync(dir+'/vercel-error.private.txt',String(e.stderr??''),{mode:0o600});throw Error('VERCEL_CONFIGURATION_FAILED_PRIVATE_DIAGNOSTIC');}}
const bytes=fs.readFileSync(dir+'/api-keys.private.json');const keys=JSON.parse(bytes.toString(bytes[0]===255?'utf16le':'utf8').replace(/^\uFEFF/,''));
const anon=keys.find(x=>x.name==='anon')?.api_key,service=keys.find(x=>x.name==='service_role')?.api_key;
for(const [key,role] of [[anon,'anon'],[service,'service_role']]){assert.ok(key);const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));assert.equal(claims.ref,'zhtagqrzyovsrmsicaot');assert.equal(claims.role,role);}
const common={STOREFRONT_PAYMENTS_MODE:'live',STOREFRONT_LIVE_ENABLED:'true',STOREFRONT_ADMIN_ORIGIN:'https://app.cometaos.com'};
const values={admin:{...common,NEXT_PUBLIC_SUPABASE_URL:'https://zhtagqrzyovsrmsicaot.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,OWN_STOREFRONT_URLS:JSON.stringify({'magenta-fitwear':'https://magenta-controlled-preview.vercel.app'})},storefront:{...common,STOREFRONT_SUPABASE_URL:'https://zhtagqrzyovsrmsicaot.supabase.co',STOREFRONT_SUPABASE_ANON_KEY:anon,STOREFRONT_SUPABASE_SERVICE_ROLE_KEY:service,STOREFRONT_BRAND_SLUG:'magenta-fitwear',STOREFRONT_ORIGIN:'https://magenta-controlled-preview.vercel.app'}};
for(const [app,id] of Object.entries(projects)){
 const original=api('/v10/projects/'+id+'/env').envs;
 const backup=dir+'/'+app+'-production-env-before.private.json';if(!fs.existsSync(backup))fs.writeFileSync(backup,JSON.stringify(original),{mode:0o600});
 // This entry was absent in the audited project. Do not overwrite future multi-brand maps.
 if(app==='admin')assert.ok(!original.some(e=>e.key==='OWN_STOREFRONT_URLS'&&e.target.includes('production')),'Review existing multi-brand URL map before replacing');
 for(const [key,value] of Object.entries(values[app])){
  const existing=original.find(e=>e.key===key&&e.target.includes('production'));
  if(existing&&existing.target.length>1)api('/v9/projects/'+id+'/env/'+existing.id,'PATCH',{target:existing.target.filter(t=>t!=='production')});
  api('/v10/projects/'+id+'/env?upsert=true','POST',{key,value,type:'encrypted',target:['production']});
  console.log('Configured Production only:',app,key);
 }
 const after=api('/v10/projects/'+id+'/env').envs;
 for(const old of original.filter(e=>e.target.includes('preview'))){const kept=after.find(e=>e.id===old.id);assert.ok(kept?.target.includes('preview'));assert.equal(kept.gitBranch,old.gitBranch);}
 fs.writeFileSync('.next/magenta-launch-audit/'+app+'-production-env.json',JSON.stringify({at:new Date().toISOString(),keys:Object.keys(values[app]),previewIdsPreserved:true,liveSecretConfigured:false},null,2));
}
console.log('No Stripe credential copied. Online card stays blocked until live key, webhook and brand account are configured.');
