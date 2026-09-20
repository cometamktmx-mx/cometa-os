// Real HTTP certification against an explicitly named isolated LOCAL database.
// Uses existing Docker images only; does not read .env or access remote services.
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { createServer } from 'node:http';
import { writeFileSync, cpSync, mkdtempSync, symlinkSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';

const database = process.env.COMETA_CERT_DATABASE;
assert.match(database || '', /^food_integration_[0-9]+$/);
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
const secret=randomBytes(48).toString('base64url');
function jwt(role) { const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'), body=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200})).toString('base64url'); return `${head}.${body}.${createHmac('sha256',secret).update(`${head}.${body}`).digest('base64url')}`; }
const anon=jwt('anon'), service=jwt('service_role');
const authName=`food_cert_auth_${Date.now()}`, restName=`food_cert_rest_${Date.now()}`;
function localUri(value) { const uri=new URL(value); uri.hostname=db[0]; uri.pathname=`/${database}`; return uri.toString(); }
const authEnv=envObject(authConfig),restEnv=envObject(restConfig);
authEnv.GOTRUE_DB_DATABASE_URL=localUri(authEnv.GOTRUE_DB_DATABASE_URL);
authEnv.GOTRUE_JWT_SECRET=secret; authEnv.GOTRUE_SITE_URL='http://127.0.0.1:3105'; authEnv.API_EXTERNAL_URL='http://127.0.0.1:58130'; authEnv.GOTRUE_MAILER_AUTOCONFIRM='true'; authEnv.GOTRUE_DISABLE_SIGNUP='false';
for(const key of Object.keys(authEnv)) if(key.includes('JWT_KEYS')) delete authEnv[key];
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
start(authName,authConfig,authEnv,58131,9999); start(restName,restConfig,restEnv,58132,3000);
const gateway=createServer(async(req,res)=>{
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
const email=`food-cert-${Date.now()}@example.test`,password=randomBytes(18).toString('base64url');
const signup=await fetch('http://127.0.0.1:58130/auth/v1/signup',{method:'POST',headers:{'Content-Type':'application/json',apikey:anon},body:JSON.stringify({email,password})});
const session=await signup.json();assert.equal(signup.status,200,JSON.stringify(session));assert.ok(session.access_token);
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
const appWorkspace=mkdtempSync(path.join(path.resolve('.next'),'food-http-'));
for(const source of ['src','public','package.json','package-lock.json','tsconfig.json','next.config.ts','postcss.config.mjs','next-env.d.ts']) cpSync(source,path.join(appWorkspace,source),{recursive:true});
symlinkSync(path.resolve('node_modules'),path.join(appWorkspace,'node_modules'),'junction');
const app=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3105'],{cwd:appWorkspace,env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:58130',NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,SUPABASE_SERVICE_ROLE:service,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
app.stdout.on('data',data=>appendFileSync(path.join(appWorkspace,'certification-next.log'),data));app.stderr.on('data',data=>appendFileSync(path.join(appWorkspace,'certification-next.log'),data));
await ready('http://127.0.0.1:3105/login');
async function request(path,body,cookies=true) {
 const response=await fetch(`http://127.0.0.1:3105${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookies?{cookie:[...cookieJar].map(([name,value])=>`${name}=${value}`).join('; ')}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(cookies)for(const value of response.headers.getSetCookie()){const part=value.split(';')[0],index=part.indexOf('=');cookieJar.set(part.slice(0,index),part.slice(index+1));}
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={message:text.slice(0,200)};} return {status:response.status,data};
}
let result=await request('/api/pos/operator-session',{brandSlug:slug,action:'login',staffId:staff,pin});assert.equal(result.status,200,JSON.stringify(result));
result=await request('/api/pos/operator-session',{brandSlug:slug,action:'admin'});assert.equal(result.status,200,JSON.stringify(result));
async function command(action,payload){const result=await request('/api/pos/food/recipes',{brandSlug:slug,locationId:location,action,command_key:randomUUID(),...payload});assert.equal(result.status,200,JSON.stringify(result));console.log(`PASS HTTP ${action}`);return result.data.result;}
const milk=await command('ingredient_save',{name:'Leche entera',unit_code:'ml',category:'base',initial_quantity:3000,minimum_quantity:500,waste_percent:5,active:true,presentations:[{name:'Leche 1 L',content:1,unit_code:'l',cost:28,active:true}]});
let catalog=(await request(`/api/pos/food/recipes?brandSlug=${slug}&locationId=${location}`)).data.catalog;
let ingredient=catalog.ingredients.find(i=>i.id===milk.id);
await command('ingredient_save',{id:milk.id,name:'Leche entera',unit_code:'ml',category:'base',minimum_quantity:500,waste_percent:5,active:true,presentations:ingredient.presentations.map(p=>({id:p.id,name:p.name,content:1000,unit_code:'ml',cost:28,active:true}))});
await command('receive',{id:milk.id,presentation_id:ingredient.presentations[0].id,quantity:1,request_key:randomUUID()});
await command('adjust',{id:milk.id,quantity:-1000,notes:'HTTP certification adjustment'});
const coffee=await command('ingredient_save',{name:'Café',unit_code:'g',category:'food',initial_quantity:500,minimum_quantity:100,waste_percent:0,active:true,presentations:[{name:'Café 1 kg',content:1,unit_code:'kg',cost:380,active:true}]});
const cinnamon=await command('ingredient_save',{name:'Canela',unit_code:'g',category:'food',initial_quantity:30,minimum_quantity:10,waste_percent:0,active:true,presentations:[{name:'Canela 100 g',content:100,unit_code:'g',cost:40,active:true}]});
const cappuccino=await command('product_save',{name:'Capuchino',price:60,tax_rate:0,active:true});
await command('recipe_publish',{id:cappuccino.id,components:[{ingredient_variant_id:coffee.id,quantity:18,unit_code:'g'},{ingredient_variant_id:milk.id,quantity:220,unit_code:'ml'},{ingredient_variant_id:cinnamon.id,quantity:2,unit_code:'g'}]});
catalog=(await request(`/api/pos/food/recipes?brandSlug=${slug}&locationId=${location}`)).data.catalog;
const product=catalog.products.find(p=>p.id===cappuccino.id),group=randomUUID(),option=randomUUID();
sql(`insert into public.pos_food_modifier_groups(id,brand_slug,name,selection_mode,min_selections,max_selections) values(${literal(group)},${literal(slug)},'Extras','multiple',0,1);
insert into public.pos_food_modifier_options(id,brand_slug,group_id,name,price_delta) values(${literal(option)},${literal(slug)},${literal(group)},'Shot extra',10);
insert into public.pos_food_product_modifier_groups(brand_slug,product_id,group_id) values(${literal(slug)},${literal(product.product_id)},${literal(group)});`);
await command('effect_save',{product_id:product.product_id,option_id:option,effect:'ADD',ingredient_variant_id:coffee.id,quantity:18,unit_code:'g'});
assert.equal(product.recipe.unit_cost,13.8);assert.equal(product.recipe.availability,13);assert.equal(product.recipe.limiting_ingredient,'Leche entera');console.log('PASS HTTP cost/margin/availability');
assert.equal((await request(`/api/pos/food/recipes?brandSlug=${slug}&locationId=${location}`,undefined,false)).status,401);console.log('PASS HTTP unauthenticated');
assert.equal((await request(`/api/pos/food/recipes?brandSlug=${otherSlug}&locationId=${location}`)).status,403);console.log('PASS HTTP cross-brand authorization');
assert.equal((await request(`/api/pos/food/recipes?brandSlug=${slug}&locationId=${randomUUID()}`)).status,403);console.log('PASS HTTP foreign location');
result=await request('/api/pos/food/recipes',{brandSlug:slug,locationId:location,action:'recipe_publish',command_key:randomUUID(),id:cappuccino.id,components:[]});assert.equal(result.status,400);console.log('PASS HTTP invalid payload');
writeFileSync('.next/food-certification-session.json',JSON.stringify({url:`http://127.0.0.1:3105/brand/${slug}/pos/admin/inventory`,email,password,pin,staff,slug,location,cookies:[...cookieJar].map(([name,value])=>({name,value}))}));
console.log(`HTTP_CERTIFICATION_PASS ${slug}; local UI http://127.0.0.1:3105/brand/${slug}/pos/admin/inventory`);
console.log('Local services retained for authenticated UI review; session artifact in .next only.');
// Keep localhost services alive until the UI review explicitly stops this cell.
process.on('SIGINT',()=>{app.kill();gateway.close();process.exit(0);});
