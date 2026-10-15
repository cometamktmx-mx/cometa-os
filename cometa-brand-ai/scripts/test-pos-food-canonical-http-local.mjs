// Real HTTP certification against an explicitly named isolated LOCAL database.
// Uses existing Docker images only; does not read .env or access remote services.
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { createServer } from 'node:http';
import { cpSync, mkdtempSync, symlinkSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';
import * as XLSX from 'xlsx';

const database = process.argv.find(arg => arg.startsWith('--database='))?.slice(11);
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
const template=await request(`/api/pos/food/inventory-import?brandSlug=${slug}&locationId=${location}`);assert.equal(template.status,200);
const workbook=XLSX.utils.book_new();const sheet=XLSX.utils.json_to_sheet([{ 'Código interno':'IMP-LECHE','Nombre del insumo':'Import Leche','Categoría':'food','Unidad de control':'ml','Cantidad por empaque':1000,'Unidad del empaque':'ml','Costo por empaque':29,'Stock inicial':5000,'Stock mínimo':0,'Proveedor':'Fixture','Activo':'Sí','Notas':'E2E' }]);XLSX.utils.book_append_sheet(workbook,sheet,'Insumos');const xlsxBytes=XLSX.write(workbook,{bookType:'xlsx',type:'buffer'});const form=new FormData();form.append('file',new Blob([xlsxBytes]),'insumos-e2e.xlsx');const upload=await fetch(`http://127.0.0.1:3105/api/pos/food/inventory-import?brandSlug=${slug}&locationId=${location}`,{method:'POST',body:form,headers:{cookie:[...cookieJar].map(([name,value])=>`${name}=${value}`).join('; ')}});const uploadText=await upload.text();assert.equal(upload.status,200,uploadText);const previewImport=JSON.parse(uploadText);assert.equal(previewImport.summary.total,1);const importKey=randomUUID();const confirm=await request(`/api/pos/food/inventory-import?brandSlug=${slug}&locationId=${location}`,{mode:'confirm',requestKey:importKey,rows:previewImport.rows.map(row=>({...row,decision:'create'}))});assert.equal(confirm.status,200,JSON.stringify(confirm));const confirmRetry=await request(`/api/pos/food/inventory-import?brandSlug=${slug}&locationId=${location}`,{mode:'confirm',requestKey:importKey,rows:previewImport.rows.map(row=>({...row,decision:'create'}))});assert.equal(confirmRetry.status,200);assert.equal(confirmRetry.data.result.status,'done');console.log('PASS HTTP XLSX template preview confirm retry');
async function command(action,payload){const result=await request('/api/pos/food/recipes',{brandSlug:slug,locationId:location,action,command_key:randomUUID(),...payload});assert.equal(result.status,200,JSON.stringify(result));console.log(`PASS HTTP ${action}`);return result.data.result;}

try {
const ingredients = {};
for (const [key,name,unit] of [['milk','Entera','ml'],['almond','Almendra','ml'],['coffee','Café','ml'],['vanilla','Vainilla','ml'],['ice','Hielo','g']]) {
 ingredients[key] = (await command('ingredient_save',{name,unit_code:unit,category:'food',initial_quantity:10000,minimum_quantity:0,waste_percent:0,active:true,presentations:[]})).id;
}
const latte=await command('product_save',{name:'Latte',price:50,tax_rate:0,active:true});
let catalog=(await request(`/api/pos/food/recipes?brandSlug=${slug}&locationId=${location}`)).data.catalog;
const product=catalog.products.find(p=>p.id===latte.id).product_id;
const sizes=[{id:latte.id,name:'Chico',milk:180,coffee:60},{id:randomUUID(),name:'Mediano',milk:220,coffee:70},{id:randomUUID(),name:'Grande',milk:280,coffee:90}];
for(const size of sizes) {
 if(size.id!==latte.id) {
  result=await request('/api/pos/food/prepared-variants',{brandSlug:slug,locationId:location,productId:product,id:size.id,name:size.name,price:50});assert.equal(result.status,200,JSON.stringify(result));
 }
 await command('recipe_publish',{id:size.id,components:[{ingredient_variant_id:ingredients.milk,quantity:size.milk,unit_code:'ml'},{ingredient_variant_id:ingredients.coffee,quantity:size.coffee,unit_code:'ml'}]});
}
const group=randomUUID(), flavor=randomUUID(), almond=randomUUID(), cold=randomUUID(), shot=randomUUID();
sql(`insert into public.pos_food_modifier_groups(id,brand_slug,name,selection_mode,min_selections,max_selections) values(${literal(group)},${literal(slug)},'Latte options','multiple',0,4);
insert into public.pos_food_modifier_options(id,brand_slug,group_id,name,price_delta) values
(${literal(flavor)},${literal(slug)},${literal(group)},'Vainilla',5),(${literal(almond)},${literal(slug)},${literal(group)},'Almendra',8),(${literal(cold)},${literal(slug)},${literal(group)},'Frío',0),(${literal(shot)},${literal(slug)},${literal(group)},'Shot',10);
insert into public.pos_food_product_modifier_groups(brand_slug,product_id,group_id) values(${literal(slug)},${literal(product)},${literal(group)});`);
for(const [option,effects] of [
 [flavor,[{effect:'ADD',ingredient_variant_id:ingredients.vanilla,quantity:20,unit_code:'ml'}]],
 [almond,[{effect:'REPLACE',quantity_mode:'source',source_variant_id:ingredients.milk,ingredient_variant_id:ingredients.almond}]],
 [cold,[{effect:'ADD',ingredient_variant_id:ingredients.ice,quantity:120,unit_code:'g'}]],
 [shot,[{effect:'ADD',ingredient_variant_id:ingredients.coffee,quantity:70,unit_code:'ml'}]],
]) await command('effects_save',{product_id:product,option_id:option,effects});
const optionIds=[flavor,almond,cold,shot];
async function operation(action,payload,key=randomUUID()) {
 const response=await request('/api/pos/food',{brandSlug:slug,action,idempotencyKey:key,...payload});
 assert.equal(response.status,200,JSON.stringify(response));return response.data.result;
}
const stock=()=>JSON.parse(sql(`select jsonb_object_agg(variant_id,quantity) from public.pos_inventory where brand_slug=${literal(slug)} and location_id=${literal(location)}`));
for(const size of sizes) {
 const previewRequest={brandSlug:slug,locationId:location,variantId:size.id,modifierOptionIds:optionIds};
 const before=stock();
 const response=await request('/api/pos/food/configuration-preview',previewRequest);assert.equal(response.status,200,JSON.stringify(response));
 const preview=response.data.preview;assert.equal(preview.unitPrice,73);assert.equal(preview.canAdd,true);assert.deepEqual(stock(),before,'preview read only');
 const expected={[ingredients.almond]:size.milk,[ingredients.vanilla]:20,[ingredients.ice]:120,[ingredients.coffee]:size.coffee+70};
 assert.deepEqual(Object.fromEntries(preview.recipe.components.map(c=>[c.ingredient_variant_id,c.base_quantity])),expected);
 const table=await operation('table_create',{locationId:location,name:`Cert ${size.name}`});
 const check=await operation('open',{tableId:table.tableId,guests:1});
 const item=await operation('item_add',{checkId:check.checkId,variantId:size.id,quantity:1,modifierOptionIds:optionIds});
 const version=Number(sql(`select version from public.pos_food_checks where id=${literal(check.checkId)}`));
 const key=randomUUID(), payload={checkId:check.checkId,version};
 const sent=await operation('send',payload,key);await operation('send',payload,key);
 const after=stock();
 for(const [ingredient,quantity] of Object.entries(expected)) assert.equal(before[ingredient]-after[ingredient],quantity);
 assert.equal(before[ingredients.milk],after[ingredients.milk]);
 const snapshot=JSON.parse(sql(`select effective_recipe from public.pos_food_item_recipe_snapshots where food_item_id=${literal(item.itemId)}`));
 assert.deepEqual(Object.fromEntries(snapshot.components.map(c=>[c.ingredient_variant_id,c.base_quantity])),expected);
 assert.equal(snapshot.unit_price,73);assert.equal(snapshot.variant_id,size.id);
 console.log(`PASS HTTP PREVIEW == POSTGRES SEND ${size.name}: almond=${size.milk}, coffee=${size.coffee+70}, vanilla=20, ice=120, whole=0, price=73, available=${preview.available}; ticket=${sent.ticketId}`);
}
const previewRequest={brandSlug:slug,locationId:location,variantId:sizes[1].id,modifierOptionIds:optionIds};
assert.equal((await request('/api/pos/food/configuration-preview',previewRequest,false)).status,401);
assert.equal((await request('/api/pos/food/configuration-preview',{...previewRequest,brandSlug:otherSlug})).status,403);
assert.equal((await request('/api/pos/food/configuration-preview',{...previewRequest,locationId:randomUUID()})).status,403);
assert.equal((await request('/api/pos/food/configuration-preview',{...previewRequest,modifierOptionIds:[randomUUID()]})).status,409);
sql(`update public.pos_inventory set quantity=0 where variant_id=${literal(ingredients.almond)} and location_id=${literal(location)}`);
result=await request('/api/pos/food/configuration-preview',previewRequest);assert.equal(result.status,200);assert.equal(result.data.preview.canAdd,false);
console.log('PASS HTTP unauthenticated / cross-brand / foreign location / invalid option / exhausted modifier');
console.log('CANONICAL_HTTP_POSTGRES_PASS');
} finally {
 app.kill(); gateway.close();
 run(['stop',authName,restName]);
}
