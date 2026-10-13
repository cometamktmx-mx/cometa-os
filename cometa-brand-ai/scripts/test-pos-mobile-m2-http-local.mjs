// Real HTTP certification against an explicitly named isolated LOCAL database.
// Uses existing Docker images only; does not read .env or access remote services.
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, symlinkSync, appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';


const database = process.argv.find(arg => arg.startsWith('--database='))?.slice(11);
assert.match(database || '', /^food_integration_[0-9]+$/);
const serve=process.argv.includes('--serve');
if(serve && !process.env.POS_M2_FIXTURE_PASSWORD)throw new Error('Set POS_M2_FIXTURE_PASSWORD for the synthetic local UI account; it will not be logged.');
const docker = process.env.COMETA_LOCAL_DOCKER_EXE || 'C:/Users/jesus/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const socket = 'npipe:////./pipe/dockerDesktopLinuxEngine';
function run(args, input) {
 const result = spawnSync(docker, ['--host', socket, ...args], { input, encoding: 'utf8', windowsHide: true });
 if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
 return result.stdout.trim();
}
const db = run(['ps','--format','{{.Names}}']).split(/\r?\n/).filter(name=>name.startsWith('supabase_db_'));
assert.equal(db.length,1);
const suffix = db[0].slice('supabase_db_'.length);
function inspect(name) { return JSON.parse(run(['inspect',name]))[0]; }
const authConfig = inspect(`supabase_auth_${suffix}`), restConfig = inspect(`supabase_rest_${suffix}`);
const network = Object.keys(inspect(db[0]).NetworkSettings.Networks)[0];
function envObject(config) { return Object.fromEntries(config.Config.Env.map(value=>[value.slice(0,value.indexOf('=')),value.slice(value.indexOf('=')+1)])); }
function sql(source, name=database, user='postgres') { return run(['exec','-i','-u','postgres',db[0],'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U',user,'-d',name,'-f','-'],source); }
// Interactive debug uses the existing LOCAL provider key so an installed debug
// APK's public anon credential survives a fixture restart. HTTP tests stay isolated.
const secret=serve ? envObject(authConfig).GOTRUE_JWT_SECRET : randomBytes(48).toString('base64url');
assert.ok(secret, 'LOCAL provider JWT secret is required for interactive debug');
function jwt(role) { const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'), body=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200})).toString('base64url'); return `${head}.${body}.${createHmac('sha256',secret).update(`${head}.${body}`).digest('base64url')}`; }
const anon=jwt('anon'), service=jwt('service_role');
let app, gateway, mobileApp;
const authName=`food_cert_auth_${Date.now()}`, restName=`food_cert_rest_${Date.now()}`;
function localUri(value) { const uri=new URL(value); uri.hostname=db[0]; uri.pathname=`/${database}`; return uri.toString(); }
const authEnv=envObject(authConfig),restEnv=envObject(restConfig);
authEnv.GOTRUE_DB_DATABASE_URL=localUri(authEnv.GOTRUE_DB_DATABASE_URL);
authEnv.GOTRUE_JWT_SECRET=secret; authEnv.GOTRUE_SITE_URL='http://127.0.0.1:3105'; authEnv.API_EXTERNAL_URL='http://127.0.0.1:58130'; authEnv.GOTRUE_MAILER_AUTOCONFIRM='true'; authEnv.GOTRUE_DISABLE_SIGNUP='false';
for(const key of Object.keys(authEnv)) if(key.includes('JWT_KEYS') || key.includes('HOOK') || key.includes('SMTP') || key.startsWith('GOTRUE_EXTERNAL_')) delete authEnv[key];
restEnv.PGRST_DB_URI=localUri(restEnv.PGRST_DB_URI);restEnv.PGRST_JWT_SECRET=secret;restEnv.PGRST_DB_SCHEMAS='public';
// Copy only migration version metadata, never users or sessions from the local source.
const versions=sql("select coalesce(string_agg(format('insert into auth.schema_migrations(version) values(%L) on conflict do nothing;',version),E'\\n'),'') from auth.schema_migrations;",'postgres');
sql(versions,database,'supabase_admin');
// Provider schema came from a schema-only dump without ownership/ACLs.
sql('grant usage,create on schema auth to supabase_auth_admin; grant all on all tables in schema auth to supabase_auth_admin; grant all on all sequences in schema auth to supabase_auth_admin;',database,'supabase_admin');
sql(`alter schema auth owner to supabase_auth_admin;
do $$ declare item record; begin
 for item in select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relkind in ('r','p','S') loop
 execute format('alter %s auth.%I owner to supabase_auth_admin',case when item.relkind='S' then 'sequence' else 'table' end,item.relname);
 end loop;
end $$;`,database,'supabase_admin');
function start(name,config,env,port,target) { run(['run','-d','--pull=never','--name',name,'--network',network,'-p',`127.0.0.1:${port}:${target}`,...Object.entries(env).flatMap(([k,v])=>['-e',`${k}=${v}`]),config.Config.Image]); }
try {
start(authName,authConfig,authEnv,58131,9999); start(restName,restConfig,restEnv,58132,3000);
gateway=createServer(async(req,res)=>{
 try {
  const isAuth=req.url.startsWith('/auth/v1/'), target=`http://127.0.0.1:${isAuth?58131:58132}${req.url.replace(isAuth?'/auth/v1':'/rest/v1','')}`;
  const chunks=[];for await(const chunk of req) chunks.push(chunk);
  const response=await fetch(target,{method:req.method,headers:{...req.headers,host:`127.0.0.1:${isAuth?58131:58132}`},...(req.method!=='GET'&&req.method!=='HEAD'?{body:Buffer.concat(chunks)}:{})});
  res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([key])=>!['content-encoding','content-length','transfer-encoding'].includes(key))));res.end(Buffer.from(await response.arrayBuffer()));
 }catch {res.writeHead(503);res.end('Local certification service unavailable');}
});
await new Promise(resolve=>gateway.listen(58130,'127.0.0.1',resolve));
async function ready(url) { for(let attempt=0;attempt<40;attempt++){try {if((await fetch(url)).status<500)return;}catch{} await new Promise(resolve=>setTimeout(resolve,500));}throw new Error(`Local service not ready: ${url}`); }
await ready('http://127.0.0.1:58131/health');
await ready('http://127.0.0.1:58132/');
assert.equal(sql("select to_regclass('public.pos_devices') is not null"),'t','M1 must already exist in the isolated local database');
const email=`mobile-cert-${Date.now()}@example.test`,password=serve?process.env.POS_M2_FIXTURE_PASSWORD:randomBytes(18).toString('base64url');
const signup=await fetch('http://127.0.0.1:58130/auth/v1/signup',{method:'POST',headers:{'Content-Type':'application/json',apikey:anon},body:JSON.stringify({email,password})});
const session=await signup.json();assert.equal(signup.status,200,session.error_code || "local signup failed");assert.ok(session.access_token);
const host=session.user.id,brand=randomUUID(),slug=`food-http-${Date.now()}`,location=randomUUID(),staff=randomUUID(),otherBrand=randomUUID(),otherSlug=`food-foreign-${Date.now()}`;
const salt=randomBytes(16),pin='7391',hash=`scrypt$${salt.toString('base64url')}$${scryptSync(pin,salt,32).toString('base64url')}`;
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
sql(`insert into public.user_profiles(user_id,email,role,status) values(${literal(host)},${literal(email)},'client','active') on conflict(user_id) do update set role='client',status='active';
insert into public.brands(id,slug,name) values(${literal(brand)},${literal(slug)},'Food HTTP certification'),(${literal(otherBrand)},${literal(otherSlug)},'Foreign HTTP certification');
insert into public.user_brand_access(user_id,brand_slug,role,access_role,status) values(${literal(host)},${literal(slug)},'owner','owner','active');
select public.pos_initialize_brand_setup(${literal(brand)},${literal(slug)},'Food HTTP certification',${literal(host)});
update public.pos_business_profiles set profile_code='coffee_shop',onboarding_status='completed' where brand_slug=${literal(slug)};
insert into public.pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax) values(${literal(location)},${literal(brand)},${literal(slug)},'HTTP location','HTTP','MXN',false);
insert into public.pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash) values(${literal(staff)},${literal(brand)},${literal(slug)},${literal(location)},'Certification Admin','ADMIN',${literal(hash)});`);
const cookieJar=new Map();
const auth=createServerClient('http://127.0.0.1:58130',anon,{cookies:{getAll:()=>[...cookieJar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>cookieJar.set(name,value))}});
await auth.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
// Keep the fixture workspace on the module drive (Windows webpack paths).
const appWorkspace=mkdtempSync(path.join(path.resolve('.next'),'m2-http-'));
function localCommand(command,args){const r=spawnSync(command,args,{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error(r.stderr || 'Local workspace preparation failed');}
localCommand('git',['archive','--format=tar', '--output='+path.join(appWorkspace,'source.tar'),'78a5998d33317e1e91f79b4952a481263eafca42']);
localCommand('tar',['-xf',path.join(appWorkspace,'source.tar'),'-C',appWorkspace]);
for(const file of ['src/lib/pos/server.ts','src/lib/pos/staff-server.ts','src/lib/pos/device-server.ts','src/lib/pos/transport-server.ts','src/app/api/pos/devices/route.ts','src/app/api/pos/mobile/[...path]/route.ts']){
 mkdirSync(path.dirname(path.join(appWorkspace,file)),{recursive:true});cpSync(file,path.join(appWorkspace,file));
}
symlinkSync(path.resolve('node_modules'),path.join(appWorkspace,'node_modules'),'junction');
app=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3105'],{cwd:appWorkspace,env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:58130',NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,SUPABASE_SERVICE_ROLE:service,NEXT_TELEMETRY_DISABLED:'1',POS_MOBILE_ENV:'development',POS_MOBILE_ENABLED:'true'},stdio:['ignore','pipe','pipe'],windowsHide:true});
app.stdout.on('data',data=>appendFileSync(path.join(appWorkspace,'certification-next.log'),data));app.stderr.on('data',data=>appendFileSync(path.join(appWorkspace,'certification-next.log'),data));
await ready('http://127.0.0.1:3105/api/pos/mobile/brands');
const mobileCredentials=new Map();
async function request(route,body,method=body?'POST':'GET',bearer=session.access_token) {
 const headers={'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})};
 for(const [k,v]of mobileCredentials)headers[`x-${k.replaceAll('_','-')}`]=v;
 const response=await fetch(`http://127.0.0.1:3105/api/pos/mobile/${route}`,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
 const value=await response.json();
 for(const[k,v]of Object.entries(value.credentials||{})){if(v===null)mobileCredentials.delete(k);else mobileCredentials.set(k,v);}
 return {status:response.status,data:value.payload??value};
}
function check(r,status,label){assert.equal(r.status,status,`${label}: ${JSON.stringify(r.data)}`);console.log(`PASS ${label}`);return r.data;}
const op=(staffId)=>request('operator-session',{brandSlug:slug,action:'login',staffId,pin});
const command=async(action,body,key=randomUUID())=>check(await request('food',{brandSlug:slug,action,...body,idempotencyKey:key}),200,`Food ${action}`).result;
check(await request('brands',undefined,'GET',null),401,'anonymous mobile denied');
check(await request('brands',undefined,'GET','forged-jwt'),401,'forged bearer denied');
const brands=check(await request('brands'),200,'verified bearer resolves businesses');assert.equal(brands.brands.length,1);assert.equal(brands.brands[0].slug,slug);
const emptySignup=await fetch('http://127.0.0.1:58130/auth/v1/signup',{method:'POST',headers:{'Content-Type':'application/json',apikey:anon},body:JSON.stringify({email:`empty-${Date.now()}@example.test`,password:randomBytes(18).toString('base64url')})});
const emptySession=await emptySignup.json();assert.equal(emptySignup.status,200,'empty fixture signup');
const emptyBrands=check(await request('brands',undefined,'GET',emptySession.access_token),200,'zero businesses is an explicit empty result');assert.equal(emptyBrands.brands.length,0);
sql(`insert into public.user_brand_access(user_id,brand_slug,role,access_role,status) values(${literal(host)},${literal(otherSlug)},'owner','owner','active');
select public.pos_initialize_brand_setup(${literal(otherBrand)},${literal(otherSlug)},'Second POS fixture',${literal(host)});`);
const multiple=check(await request('brands'),200,'multiple businesses for POS selector');assert.equal(multiple.brands.length,2);
check(await request(`operator-session?brandSlug=${slug}`),401,'mobile cannot operate as unenrolled legacy browser');
const device=check(await request('devices',{brandSlug:slug,locationId:location,label:'M2 Food proof'}),201,'mobile enrollment').device.id;
assert.ok(mobileCredentials.get('cometa_pos_device'));
check(await request('operator-session',{brandSlug:slug,action:'login',staffId:staff,pin:'0000'}),401,'wrong mobile PIN denied');
check(await op(staff),200,'ADMIN mobile PIN');
check(await request('operator-session',{brandSlug:slug,action:'admin'}),200,'ADMIN mobile administrative mode');
const table=(await command('table_create',{locationId:location,name:'M2 tablet'})).tableId;
const waiter=randomUUID(), kitchen=randomUUID(), cashier=randomUUID(),product=randomUUID(),variant=randomUUID(),group=randomUUID(),option=randomUUID(),register=randomUUID();
sql(`insert into public.pos_units(code,name,symbol,unit_type) values('piece','Piece','pc','count') on conflict(code) do nothing;
insert into public.pos_staff(id,brand_id,brand_slug,location_id,name,role,pin_hash) values
(${literal(waiter)},${literal(brand)},${literal(slug)},${literal(location)},'M2 Waiter','WAITER',${literal(hash)}),
(${literal(kitchen)},${literal(brand)},${literal(slug)},${literal(location)},'M2 Kitchen','KITCHEN',${literal(hash)}),
(${literal(cashier)},${literal(brand)},${literal(slug)},${literal(location)},'M2 Cashier','CASHIER',${literal(hash)});
insert into public.pos_products(id,brand_id,brand_slug,name,track_inventory,inventory_mode,tax_rate) values(${literal(product)},${literal(brand)},${literal(slug)},'M2 Coffee',false,'none',0);
insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,price,variant_signature) values(${literal(variant)},${literal(brand)},${literal(slug)},${literal(product)},'Regular',50,'{}');
insert into public.pos_food_modifier_groups(id,brand_slug,name,selection_mode,min_selections,max_selections) values(${literal(group)},${literal(slug)},'M2 options','multiple',0,1);
insert into public.pos_food_modifier_options(id,brand_slug,group_id,name,price_delta) values(${literal(option)},${literal(slug)},${literal(group)},'Extra',5);
insert into public.pos_food_product_modifier_groups(brand_slug,product_id,group_id) values(${literal(slug)},${literal(product)},${literal(group)});
insert into public.pos_registers(id,brand_id,brand_slug,location_id,name,code) values(${literal(register)},${literal(brand)},${literal(slug)},${literal(location)},'M2 register','M2');`);
check(await op(waiter),200,'WAITER mobile PIN');
check(await request('food',{brandSlug:slug,action:'table_create',locationId:location,name:'Forbidden',idempotencyKey:randomUUID(),role:'ADMIN',staffId:staff}),403,'forged mobile role denied');
const account=(await command('open',{tableId:table,guests:2})).checkId;
const preview=check(await request('food/configuration-preview',{brandSlug:slug,locationId:location,variantId:variant,modifierOptionIds:[option]}),200,'mobile modifier preview');assert.equal(preview.preview.unitPrice,55);
await command('item_add',{checkId:account,variantId:variant,quantity:1,modifierOptionIds:[option]});
const version=()=>Number(sql(`select version from public.pos_food_checks where id=${literal(account)}`));
const ticket=(await command('send',{checkId:account,version:version()})).ticketId;
check(await op(kitchen),200,'KITCHEN mobile PIN');
const kds=check(await request(`food?brandSlug=${slug}&locationId=${location}`),200,'mobile KDS snapshot');assert.ok(kds.snapshot.tickets.some(t=>t.id===ticket));
await command('prepare',{checkId:account,ticketId:ticket});await command('ready',{checkId:account,ticketId:ticket});
check(await op(waiter),200,'WAITER returns without host login');
await command('serve',{checkId:account,ticketId:ticket});await command('request_payment',{checkId:account,version:version()});
check(await op(cashier),200,'CASHIER mobile PIN');
check(await request('cash-sessions',{brandSlug:slug,action:'open',registerId:register,openingAmount:0,requestKey:randomUUID()}),201,'mobile open cash session');
const cash=sql(`select id from public.pos_cash_sessions where brand_slug=${literal(slug)} and register_id=${literal(register)} and status='open'`);
const payKey=randomUUID(),payment={checkId:account,version:version(),cashSessionId:cash,method:'cash',amount:55,amountReceived:60};
const paid=await command('pay',payment,payKey);await command('pay',payment,payKey);
assert.equal(sql(`select status from public.pos_food_checks where id=${literal(account)}`),'CLOSED');
assert.equal(sql(`select served_by::text from public.pos_food_tickets where id=${literal(ticket)}`),waiter);
assert.equal(sql(`select cashier_staff_id::text from public.pos_sales where id=(select sale_id from public.pos_food_checks where id=${literal(account)})`),cashier);
assert.equal(sql(`select count(*) from public.pos_food_payments where check_id=${literal(account)}`),'1');
console.log('PASS payment retry, close, served_by and cashier_staff_id remain canonical');
check(await request('cash-sessions',{brandSlug:slug,action:'close',sessionId:cash,countedCash:55,requestKey:randomUUID()}),200,'mobile close cash session');
const beforeLock=mobileCredentials.get('cometa_pos_staff_session');mobileCredentials.delete('cometa_pos_staff_session');
check(await request('session/lock',{brandSlug:slug}),200,'cold resume locks operator without stored PIN token');
mobileCredentials.set('cometa_pos_staff_session',beforeLock);
check(await request(`food?brandSlug=${slug}`),401,'pre-suspension operator replay is rejected');mobileCredentials.delete('cometa_pos_staff_session');
check(await request(`food?brandSlug=${slug}`),401,'locked mobile requires PIN');check(await op(cashier),200,'resume revalidates with PIN');
const stale=new Map(mobileCredentials);
check(await request('devices',{brandSlug:slug,deviceId:device},'DELETE'),200,'mobile device revocation');
check(await request(`food?brandSlug=${slug}`),403,'revoked mobile device denied without cookie');
for(const[k,v]of stale)mobileCredentials.set(k,v);
check(await request(`food?brandSlug=${slug}`),403,'revoked mobile credential replay denied');
check(await request('session',undefined,'DELETE'),200,'mobile host logout');assert.equal(mobileCredentials.size,0);
console.log('M2_BEARER_FOOD_HTTP_PASS');
if(serve){
 sql(`insert into public.pos_cash_sessions(brand_id,brand_slug,location_id,register_id,opened_by,opening_staff_id,opening_amount) values(${literal(brand)},${literal(slug)},${literal(location)},${literal(register)},${literal(host)},${literal(cashier)},0);`);
 mobileApp=spawn(process.execPath,[path.resolve('apps/pos-mobile/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5173','--strictPort'],{cwd:path.resolve('apps/pos-mobile'),env:{...process.env,VITE_POS_BACKEND:'http://127.0.0.1:3105',VITE_SUPABASE_URL:'http://127.0.0.1:58130',VITE_SUPABASE_ANON_KEY:anon},stdio:['ignore','pipe','pipe'],windowsHide:true});
 mobileApp.stdout.on('data',data=>appendFileSync(path.join(appWorkspace,'mobile-vite.log'),data));mobileApp.stderr.on('data',data=>appendFileSync(path.join(appWorkspace,'mobile-vite.log'),data));
 await ready('http://127.0.0.1:5173');
 console.log(`LOCAL_UI_READY http://127.0.0.1:5173 | synthetic account ${email} | password from POS_M2_FIXTURE_PASSWORD | operator PIN 7391 | business ${slug}`);
 console.log('Only public local configuration is passed to Vite. No service role or refresh token is written to mobile files. Ctrl+C stops the fixture services.');
 await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
}
} finally {
 if(mobileApp)mobileApp.kill();
 if(app) app.kill(); if(gateway)gateway.closeAllConnections();if(gateway)gateway.close();
 for(const name of [authName,restName])try{run(['stop',name]);}catch{}
}
