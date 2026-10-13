import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { inspectContent } from '../scripts/scan-bundle.mjs';
function load(file, deps = {}) { const m = { exports: {} }; const code = ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText; new Function('require','module','exports',code)(name => { if (!(name in deps)) throw Error(`Missing dependency ${name}`); return deps[name]; },m,m.exports); return m.exports; }
const policy = load('src/policy.ts');
const environment = load('config/environment.ts', { '../src/policy': policy });
const targets = { beta: { backendOrigin: 'https://backend.beta.invalid', supabaseOrigin: 'https://database.beta.invalid', metadataUrl: 'https://backend.beta.invalid/mobile/releases/latest' }, production: {enabled:false,backendOrigin:'',supabaseOrigin:'',metadataUrl:''} };
const env = { VITE_POS_ENV:'beta',VITE_POS_BACKEND:targets.beta.backendOrigin,VITE_SUPABASE_URL:targets.beta.supabaseOrigin,VITE_SUPABASE_ANON_KEY:'sb_publishable_fixture_public_key_only',VITE_POS_UPDATE_METADATA_URL:targets.beta.metadataUrl,VITE_POS_RELEASE:'0.1.0-beta.1-test' };
test('profiles reject missing, unknown, disabled and mismatched configuration', () => {
  assert.equal(environment.validateEnvironment('beta',env,targets).channel,'beta');
  for (const key of Object.keys(env)) { const bad={...env};delete bad[key];assert.throws(()=>environment.validateEnvironment('beta',bad,targets),key); }
  for (const mode of ['production','preview','test','']) assert.throws(()=>environment.validateEnvironment(mode,env,targets));
  assert.throws(()=>environment.validateEnvironment('beta',env,{...targets,beta:{backendOrigin:'',supabaseOrigin:'',metadataUrl:''}}));
  for (const host of ['http://localhost','https://127.0.0.1','https://app.cometaos.com','https://cometaos.com','https://zhtagqrzyovsrmsicaot.supabase.co','https://evil.invalid','https://u:p@backend.beta.invalid']) assert.throws(()=>environment.validateEnvironment('beta',{...env,VITE_POS_BACKEND:host},targets));
  for(const key of ['sb_secret_12345678901234567890','private-value','eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.sig'])assert.throws(()=>environment.validateEnvironment('beta',{...env,VITE_SUPABASE_ANON_KEY:key},targets));
});
const beta = load('../../src/lib/pos/beta-policy.ts', {'../../../config/pos-environments.json':targets});
const user='00000000-0000-4000-8000-000000000001', branch='00000000-0000-4000-8000-000000000002';
const grants=beta.betaGrants(JSON.stringify([{userId:user,brandSlug:'pilot',locationIds:[branch],expiresAt:'2099-01-01T00:00:00Z'}]));
test('Beta partners require exact user, canonical brand, branch and live grant; no admin bypass',()=>{
  assert.equal(beta.betaAllows(grants,user,'pilot',branch),true);
  for(const args of [['other','pilot',branch],[user,'other',branch],[user,'pilot','other']])assert.equal(beta.betaAllows(grants,...args),false);
  assert.equal(beta.betaAllows(grants,user,'pilot',branch,Date.parse('2100-01-01')),false);
  assert.equal(beta.betaAllows([],user),false);
  assert.throws(()=>beta.betaGrants('[{"userId":"*"}]'));
});
test('dedicated Beta rejects external secrets and all nonmobile operational routes',()=>{
  const config={POS_MOBILE_ENV:'beta',COMETA_RUNTIME_ENV:'beta',POS_MOBILE_ENABLED:'true',NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_fixture_only_not_a_real_key',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture_only_not_a_real_key',NEXT_PUBLIC_SUPABASE_URL:targets.beta.supabaseOrigin,APP_ORIGIN:targets.beta.backendOrigin,SALES_AI_SEND_WHATSAPP_ENABLED:'false',SALES_AI_AGENT_MODE:'disabled',POS_BETA_EXTERNAL_INTEGRATIONS:'disabled',POS_BETA_PARTNERS_JSON:'[]'};
  beta.assertBetaBackend(config);
  for(const name of ['STRIPE_SECRET_KEY','COMU_STRIPE_SECRET_KEY','OPENAI_API_KEY','WHATSAPP_ACCESS_TOKEN','CRON_SECRET','SKYDROPX_CLIENT_SECRET'])assert.throws(()=>beta.assertBetaBackend({...config,[name]:'canary'}));
  assert.throws(()=>beta.assertBetaBackend({...config,NEXT_PUBLIC_SUPABASE_URL:'https://zhtagqrzyovsrmsicaot.supabase.co'}));
  for(const route of ['/api/pos/sales','/api/pos/food','/api/webhooks/stripe','/api/cron/sales-ai-followups','/comu','/brand/pilot/pos'])assert.equal(beta.betaPublicPath(route,'POST'),false);
  assert.equal(beta.betaPublicPath('/android','POST'),false);
  assert.equal(beta.betaPublicPath('/api/pos/mobile/food','POST'),true);
});
const update = load('src/updates.ts');
const metadata={applicationId:'com.cometaos.pos',channel:'beta',versionName:'0.1.0-beta.2',versionCode:3,minimumSupportedVersionCode:2,downloadUrl:'https://download.beta.invalid/android/beta/3/cometa-pos-0.1.0-beta.2.apk',sha256:'a'.repeat(64),sizeBytes:16000000,publishedAt:'2026-10-03T00:00:00Z'};
test('metadata rejects wrong identity/channel, mutable paths, downgrade constraints and corrupt hashes',()=>{
  const parse=v=>update.parseUpdateMetadata(v,['https://download.beta.invalid']);
  assert.equal(parse(metadata).versionCode,3);
  for(const patch of [{applicationId:'other'},{channel:'production'},{versionCode:1},{minimumSupportedVersionCode:4},{sha256:'no'},{downloadUrl:'https://download.beta.invalid/latest.apk'},{sizeBytes:-1},{publishedAt:'invalid'}])assert.throws(()=>parse({...metadata,...patch}));
  assert.throws(()=>update.parseUpdateMetadata(metadata,[]));
});
const links=load('src/deep-links.ts');
test('links accept only reserved HTTPS host, single-use PKCE code and explicit surfaces',()=>{
  assert.equal(links.parseMobileLink('https://pos-beta.cometaos.com/mobile/auth/recovery?code=abcdefgh','beta').kind,'recovery');
  for(const url of ['https://evil.invalid/mobile/auth/callback?code=abcdefgh','com.cometaos.pos://auth','https://pos-beta.cometaos.com/mobile/auth/callback#access_token=x','https://pos-beta.cometaos.com/mobile/auth/callback?access_token=x','https://pos-beta.cometaos.com/mobile/pos/other?code=abcdefgh']) assert.throws(()=>links.parseMobileLink(url,'beta'));
  assert.equal(links.parseMobileLink('https://pos-beta.cometaos.com/mobile/auth/callback?code=abcdefgh','development'),null);
});
test('bundle scanner catches secret canaries, database URLs and forbidden Production endpoints',()=>{
  for(const s of ['sk_live_'+'a'.repeat(24),'whsec_'+'a'.repeat(24),'postgresql://name:pass@host/db','https://app.cometaos.com/api','https://zhtagqrzyovsrmsicaot.supabase.co','http://127.0.0.1:3105'])assert.throws(()=>inspectContent(s,'beta'));
  assert.throws(()=>inspectContent('opaque-password-canary','beta',['opaque-password-canary']));
  inspectContent('sb_publishable_public_key_fixture','beta');
});
test('actual mobile dispatcher enforces Partner gates outside selector and keeps logout reachable',async()=>{
  const { AsyncLocalStorage } = await import('node:async_hooks');
  const scope=new AsyncLocalStorage();let currentUser=user,operations=0;
  class PosApiError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
  const ok=(body,status=200)=>Response.json(body,{status});
  const server={PosApiError,ok,handlePosError:e=>ok({code:e.code},e.status||500),requirePosUser:async()=>({userId:currentUser,allowedBrandSlugs:['pilot']}),getAdminClient:()=>({auth:{admin:{signOut:async()=>({error:null})}}}),readJsonBody:r=>r.json(),requiredText:v=>{if(typeof v!=='string'||!v)throw new PosApiError(400,'POS_VALIDATION_ERROR');return v;}};
  const operate=async request=>{const url=new URL(request.url);scope.getStore().authorizeContext?.(currentUser,url.searchParams.get('brandSlug'),url.searchParams.get('locationId'));operations++;return ok({done:true});};
  const deps={'node:crypto':await import('node:crypto'),'@/lib/pos/transport-server':{withMobileTransport:(v,f)=>scope.run(v,f)},'@/lib/pos/server':server,'@/lib/pos/access':{},'@/lib/pos/beta-policy':beta};
  for(const route of ['devices','operator-session','food','food/configuration-preview','food/customer-memory','customers','cash-sessions'])deps[`@/app/api/pos/${route}/route`]={GET:operate,POST:operate};
  const api=load('../../src/app/api/pos/mobile/[...path]/route.ts',deps);
  const keys={POS_MOBILE_ENV:'beta',COMETA_RUNTIME_ENV:'beta',POS_MOBILE_ENABLED:'true',NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_fixture_only_not_a_real_key',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture_only_not_a_real_key',NEXT_PUBLIC_SUPABASE_URL:targets.beta.supabaseOrigin,APP_ORIGIN:targets.beta.backendOrigin,SALES_AI_SEND_WHATSAPP_ENABLED:'false',SALES_AI_AGENT_MODE:'disabled',POS_BETA_EXTERNAL_INTEGRATIONS:'disabled',POS_BETA_PARTNERS_JSON:JSON.stringify(grants)};
  const saved=Object.fromEntries(Object.keys(keys).map(k=>[k,process.env[k]]));Object.assign(process.env,keys);
  const invoke=(name,brand='pilot',location=branch,method='GET')=>api[method](new Request(`https://backend.beta.invalid/api/pos/mobile/${name}?brandSlug=${brand}&locationId=${location}`,{method,headers:{Authorization:'Bearer fixture'}}),{params:Promise.resolve({path:name.split('/')})});
  try {
    assert.equal((await invoke('food')).status,200);assert.equal(operations,1);
    assert.equal((await invoke('food','other')).status,403);
    assert.equal((await invoke('food','pilot','other')).status,403);
    currentUser='00000000-0000-4000-8000-000000000099';assert.equal((await invoke('food')).status,403);assert.equal(operations,1);
    const logout=await invoke('session','pilot',branch,'DELETE');assert.equal(logout.status,200);assert.equal(logout.headers.get('cache-control'),'no-store');
    process.env.POS_MOBILE_ENV='production';assert.equal((await invoke('food')).status,503);
  } finally {for(const [k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
