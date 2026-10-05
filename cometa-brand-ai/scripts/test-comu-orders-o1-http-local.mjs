// Invoked ONLY by the disposable O1 PostgreSQL harness. No principal DB writes.
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {cpSync,mkdtempSync,symlinkSync,appendFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {createServerClient} from '@supabase/ssr';

export async function certifyHTTP(f) {
 const {container,database,dock,sql,seller,sellerB,createOrder}=f;
 assert.match(database,/^comu_o1_\d+$/);
 const inspect=name=>JSON.parse(dock(['inspect',name]))[0];
 const suffix=container.slice('supabase_db_'.length), authConfig=inspect('supabase_auth_'+suffix),restConfig=inspect('supabase_rest_'+suffix);
 const network=Object.keys(inspect(container).NetworkSettings.Networks)[0];
 const envObject=c=>Object.fromEntries(c.Config.Env.map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
 const secret=randomBytes(48).toString('base64url'),webhookSecret=randomBytes(32).toString('hex');
 const jwt=role=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200})).toString('base64url');return `${h}.${b}.${createHmac('sha256',secret).update(`${h}.${b}`).digest('base64url')}`;};
 const anon=jwt('anon'),service=jwt('service_role');
 const localUri=value=>{const u=new URL(value);u.hostname=container;u.pathname='/'+database;return u.toString();};
 const authEnv=envObject(authConfig),restEnv=envObject(restConfig);
 for(const k of Object.keys(authEnv))if(/JWT_KEYS|HOOK|SMTP|EXTERNAL_/.test(k))delete authEnv[k];
 Object.assign(authEnv,{GOTRUE_DB_DATABASE_URL:localUri(authEnv.GOTRUE_DB_DATABASE_URL),GOTRUE_JWT_SECRET:secret,GOTRUE_SITE_URL:'http://127.0.0.1:3117',API_EXTERNAL_URL:'http://127.0.0.1:58230',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_DISABLE_SIGNUP:'false'});
 Object.assign(restEnv,{PGRST_DB_URI:localUri(restEnv.PGRST_DB_URI),PGRST_JWT_SECRET:secret,PGRST_DB_SCHEMAS:'public'});
 const versions=sql("select coalesce(string_agg(format('insert into auth.schema_migrations(version) values(%L) on conflict do nothing;',version),E'\\n'),'') from auth.schema_migrations",'postgres');
 sql(versions);
 sql(`grant usage,create on schema auth to supabase_auth_admin;grant all on all tables in schema auth to supabase_auth_admin;grant all on all sequences in schema auth to supabase_auth_admin;`);
 dock(['exec','-i','-u','postgres',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],`alter schema auth owner to supabase_auth_admin;
 do $$ declare item record; begin for item in select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relkind in ('r','p','S') loop execute format('alter %s auth.%I owner to supabase_auth_admin',case when item.relkind='S' then 'sequence' else 'table' end,item.relname);end loop;end $$;`);
 const authName=database+'_auth',restName=database+'_rest';let app;let gateway;const started=[];
 const start=(name,c,env,port,target)=>{dock(['run','-d','--pull=never','--name',name,'--network',network,'-p',`127.0.0.1:${port}:${target}`,...Object.entries(env).flatMap(([k,v])=>['-e',`${k}=${v}`]),c.Config.Image]);started.push(name);};
 const ready=async(url)=>{for(let n=0;n<90;n++){try{if((await fetch(url,{signal:AbortSignal.timeout(2000)})).status<500)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Isolated service unavailable: '+url);};
 try {
 start(authName,authConfig,authEnv,58231,9999);start(restName,restConfig,restEnv,58232,3000);
 gateway=createServer(async(req,res)=>{try{assert.ok(req.url.startsWith('/auth/v1/')||req.url.startsWith('/rest/v1/'));const auth=req.url.startsWith('/auth/v1/'),port=auth?58231:58232;const chunks=[];for await(const c of req)chunks.push(c);const r=await fetch(`http://127.0.0.1:${port}${req.url.replace(auth?'/auth/v1':'/rest/v1','')}`,{method:req.method,headers:{...req.headers,host:`127.0.0.1:${port}`},...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});res.writeHead(r.status,Object.fromEntries([...r.headers].filter(([k])=>!['content-encoding','content-length','transfer-encoding'].includes(k))));res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(503);res.end('Isolated gateway unavailable');}});
 await new Promise(r=>gateway.listen(58230,'127.0.0.1',r));await ready('http://127.0.0.1:58231/health');await ready('http://127.0.0.1:58232/');
 const users={};
 for(const name of ['owner','other','buyer','admin']){
  const email=`o1-http-${name}@example.test`,password=randomBytes(24).toString('base64url');
  const r=await fetch('http://127.0.0.1:58230/auth/v1/admin/users',{method:'POST',headers:{'Content-Type':'application/json',apikey:service,Authorization:`Bearer ${service}`},body:JSON.stringify({email,password,email_confirm:true})});const u=await r.json();assert.equal(r.status,200,`Auth fixture ${name}: ${u.msg||u.message||r.status}`);
  const jar=new Map(),auth=createServerClient('http://127.0.0.1:58230',anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
  const login=await auth.auth.signInWithPassword({email,password});assert.equal(login.error,null);users[name]={id:u.id,jar,auth};
  sql(`insert into public.user_profiles(user_id,email,role,status) values('${u.id}','${email}','${name==='admin'?'admin':'client'}','active') on conflict(user_id) do update set role=excluded.role,status='active'`);
 }
 sql(`insert into public.comu_seller_memberships(seller_id,user_id,role,active) values('${seller}','${users.owner.id}','OWNER',true),('${sellerB}','${users.other.id}','OWNER',true)`);
 mkdirSync('.next',{recursive:true});const workspace=mkdtempSync(path.join(path.resolve('.next'),'o1-http-'));
 for(const source of ['src','public','config','package.json','package-lock.json','tsconfig.json','next.config.ts','postcss.config.mjs','next-env.d.ts'])cpSync(source,path.join(workspace,source),{recursive:true});symlinkSync(path.resolve('node_modules'),path.join(workspace,'node_modules'),'junction');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|LOCALAPPDATA|APPDATA|USERPROFILE|NUMBER_OF_PROCESSORS)$/i.test(k)));
 app=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3117'],{cwd:workspace,env:{...env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:58230',NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,SUPABASE_SERVICE_ROLE:service,SKYDROPX_WEBHOOK_SECRET:webhookSecret,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 for(const stream of [app.stdout,app.stderr])stream.on('data',d=>appendFileSync(path.join(workspace,'next.log'),d));
 await ready('http://127.0.0.1:3117/api/comu/seller/orders');
 async function request(route,user='owner',body,method=body?'PATCH':'GET'){
  const jar=users[user]?.jar;const r=await fetch('http://127.0.0.1:3117'+route,{method,redirect:'manual',headers:{...(jar?{cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(jar)for(const cookie of r.headers.getSetCookie()){const part=cookie.split(';')[0],i=part.indexOf('=');jar.set(part.slice(0,i),part.slice(i+1));}
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={html:text};}return {status:r.status,data,headers:r.headers};
 }
 const list=`/api/comu/seller/orders?contract=o1&sellerId=${seller}`;
 let r=await request(list);assert.equal(r.status,200,JSON.stringify(r.data));assert.match(r.headers.get('cache-control'),/private.*no-store/);
 for(const user of ['buyer','other'])assert.equal((await request(list,user)).status,403);assert.equal((await request(list,'anonymous')).status,401);
 const o=createOrder();sql(`update public.comu_payment_intents set status='PROCESSING' where id='${o.payment}'`);
 const mutate=`/api/comu/seller/orders/${o.s}/fulfillment`;
 assert.equal((await request(mutate,'owner',{sellerId:seller,status:'PREPARING'})).status,409);
 sql(`update public.comu_payment_intents set status='SUCCEEDED' where id='${o.payment}'`);
 for(const state of ['PREPARING','READY_FOR_HUB','HANDED_TO_HUB']){r=await request(mutate,'owner',{sellerId:seller,status:state});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.suborder.fulfillmentState,state);}
 assert.equal((await request(mutate,'other',{sellerId:sellerB,status:'PREPARING'})).status,403);
 sql(`update public.comu_seller_memberships set active=false where user_id='${users.owner.id}'`);assert.equal((await request(mutate,'owner',{sellerId:seller,status:'HANDED_TO_HUB'})).status,403);sql(`update public.comu_seller_memberships set active=true where user_id='${users.owner.id}'`);
 r=await request(`${list}&selected=${o.s}&page=999&days=90`);assert.equal(r.status,200);assert.equal(r.data.selected.suborderId,o.s);assert.equal(r.data.orders.length,0);
 for(const fragment of ['days=30','days=90','status=HANDED_TO_HUB','search=missing','pageSize=1&page=2'])assert.equal((await request(list+'&'+fragment)).status,200);
 assert.equal((await request(list+'&days=29')).status,400);
 r=await request(`/api/comu/seller/orders/${o.s}?sellerId=${seller}`);assert.equal(r.status,200);const safe=JSON.stringify(r.data);for(const value of ['PRIVATE_PHONE','PRIVATE_ADDRESS','hub_handoff_token','shipping_address_snapshot','label_url'])assert.ok(!safe.includes(value));
 r=await request(`${list}&search=O1-SKU&days=90`);assert.equal(r.data.orders.length,1);assert.equal(r.data.orders[0].items[0].sku,'O1-SKU');
 const incidentBody={suborderId:o.s,incidentType:'OTHER',requestId:crypto.randomUUID(),note:'LOCAL TEST internal note'};
 assert.equal((await request('/api/comu/admin/hub/incidents','owner',incidentBody,'POST')).status,403);
 for(let retry=0;retry<2;retry++)assert.equal((await request('/api/comu/admin/hub/incidents','admin',incidentBody,'POST')).status,200);
 r=await request(`${list}&selected=${o.s}`);assert.equal(r.data.selected.fulfillmentState,'ISSUE');assert.equal(r.data.selected.incidents.length,1);
 console.log('PASS real HTTP Auth/cookies, payment gate, HUB transitions, revoked retry, isolation, detail privacy, selected/filters/pagination');
 // Existing signature/parser + real transaction; no carrier network calls.
 const raw=JSON.stringify({id:'o1-http-event',shipment_id:'o1-shipment',status:'in_transit'});
 const hook=await fetch('http://127.0.0.1:3117/api/comu/shipping/skydropx/webhook',{method:'POST',headers:{'Content-Type':'application/json',authorization:'HMAC '+createHmac('sha512',webhookSecret).update(raw).digest('hex')},body:raw});assert.equal(hook.status,200);assert.equal(JSON.parse(sql("select to_json(status) from public.comu_shipments where provider_shipment_id='o1-shipment'")),'DELIVERED');
 r=await request('/comu/seller/o1-a/orders');assert.equal(r.status,200);assert.ok(r.data.html.includes('Pedidos'));
 r=await request('/comu/seller/orders');assert.ok(r.status===307 || (r.status===200 && r.data.html.includes('NEXT_REDIRECT')));assert.ok((r.headers.get('location')||r.data.html).includes('/o1-a/orders'));
 sql(`insert into public.comu_seller_memberships(seller_id,user_id,role,active) values('${sellerB}','${users.owner.id}','ORDER_MANAGER',true)`);
 r=await request('/comu/seller/orders');assert.equal(r.status,200);assert.ok(r.data.html.includes('o1-a/orders')&&r.data.html.includes('o1-b/orders'));
 assert.equal((await request(`/api/comu/seller/orders?contract=o1&sellerId=${sellerB}`)).status,200);
 await users.owner.auth.auth.signOut();assert.equal((await request(list)).status,401);
 console.log('PASS signed webhook, explicit brand, generic single/multi-store routing, ORDER_MANAGER and logout');
 } catch(error) {
   for(const name of started) {const state=inspect(name).State;console.error('Isolated container',name,'running',state.Running,'exit',state.ExitCode);}
   throw error;
 } finally {if(app)app.kill();if(gateway)gateway.close();for(const name of started)dock(['rm','-f',name]);}
}
