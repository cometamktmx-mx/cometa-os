// Invoked ONLY by the disposable V4 PostgreSQL harness. No principal DB writes.
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {cpSync,mkdtempSync,symlinkSync,appendFileSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createServerClient} from '@supabase/ssr';

export async function certifyHTTP(f) {
 const {container,database,dock,sql,seller,sellerB,createOrder}=f;
 assert.match(database,/^comu_v4_\d+$/);
 const inspect=name=>JSON.parse(dock(['inspect',name]))[0];
 const suffix=container.slice('supabase_db_'.length), authConfig=inspect('supabase_auth_'+suffix),restConfig=inspect('supabase_rest_'+suffix);
 const network=Object.keys(inspect(container).NetworkSettings.Networks)[0];
 const envObject=c=>Object.fromEntries(c.Config.Env.map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
 const workerSecret=randomBytes(32).toString('hex'); const secret=randomBytes(48).toString('base64url'),webhookSecret=randomBytes(32).toString('hex');
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
  const email=`v4-http-${name}@example.test`,password=randomBytes(24).toString('base64url');
  const r=await fetch('http://127.0.0.1:58230/auth/v1/admin/users',{method:'POST',headers:{'Content-Type':'application/json',apikey:service,Authorization:`Bearer ${service}`},body:JSON.stringify({email,password,email_confirm:true})});const u=await r.json();assert.equal(r.status,200,`Auth fixture ${name}: ${u.msg||u.message||r.status}`);
  const jar=new Map(),auth=createServerClient('http://127.0.0.1:58230',anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
  const login=await auth.auth.signInWithPassword({email,password});assert.equal(login.error,null);users[name]={id:u.id,jar,auth};
  sql(`insert into public.user_profiles(user_id,email,role,status) values('${u.id}','${email}','${name==='admin'?'admin':'client'}','active') on conflict(user_id) do update set role=excluded.role,status='active'`);
 }
 sql(`insert into public.comu_seller_memberships(seller_id,user_id,role,active) values('${seller}','${users.owner.id}','OWNER',true),('${sellerB}','${users.other.id}','OWNER',true)`);
 mkdirSync('.next',{recursive:true});const workspace=mkdtempSync(path.join(path.resolve('.next'),'v4-http-'));
 for(const source of ['src','public','config','package.json','package-lock.json','tsconfig.json','next.config.ts','postcss.config.mjs','next-env.d.ts'])cpSync(source,path.join(workspace,source),{recursive:true});symlinkSync(path.resolve('node_modules'),path.join(workspace,'node_modules'),'junction');
 // Pin the disposable project's root; do not infer the parent app from its lockfile.
 const nextConfig=path.join(workspace,'next.config.ts');writeFileSync(nextConfig,readFileSync(nextConfig,'utf8').replace('const nextConfig: NextConfig = {','const nextConfig: NextConfig = {\n  outputFileTracingRoot: process.cwd(),'));
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|LOCALAPPDATA|APPDATA|USERPROFILE|NUMBER_OF_PROCESSORS)$/i.test(k)));
 app=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3117'],{cwd:workspace,env:{...env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:58230',NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,SUPABASE_SERVICE_ROLE:service,SKYDROPX_WEBHOOK_SECRET:webhookSecret,NEXT_TELEMETRY_DISABLED:'1',COMU_ENABLED:'true',COMU_CATALOG_ENABLED:'true',COMU_SELLER_ONBOARDING_ENABLED:'true',COMU_NOTIFICATIONS_WORKER_SECRET:workerSecret},stdio:['ignore','pipe','pipe'],windowsHide:true});
 for(const stream of [app.stdout,app.stderr])stream.on('data',d=>appendFileSync(path.join(workspace,'next.log'),d));
 await ready('http://127.0.0.1:3117/api/comu/seller/orders');
 async function request(route,user='owner',body,method=body?'PATCH':'GET'){
  const jar=users[user]?.jar;const r=await fetch('http://127.0.0.1:3117'+route,{method,redirect:'manual',headers:{...(jar?{cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(jar)for(const cookie of r.headers.getSetCookie()){const part=cookie.split(';')[0],i=part.indexOf('=');jar.set(part.slice(0,i),part.slice(i+1));}
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={html:text};}return {status:r.status,data,headers:r.headers};
 }

 // Seed historical snapshots through real C2 references, in the disposable database only.
 sql(`select set_config('request.jwt.claim.sub','${f.admin}',false);insert into public.comu_storefronts(seller_id,name,slug,status) values('${seller}','Taller del Valle','o1-a','PREPARING')`);
 f.as(f.uid,`select public.comu_catalog_save_v1('${seller}','${randomUUID()}','{"name":"Camisa de lino","variants":[{"name":"Arena / M","sku":"V4-LINO","price":40,"attributes":{}}]}')`);
 f.as(f.uid,`select public.comu_catalog_save_v1('${seller}','${randomUUID()}','{"name":"Bolsa de algodón","variants":[{"name":"Olivo","sku":"V4-BOLSA","price":60,"attributes":{}}]}')`);
 const products=f.rows(`select l.id listing_id,l.product_id,v.id variant_listing_id,v.variant_id,pv.name variant from public.comu_product_listings l join public.comu_variant_listings v on v.listing_id=l.id join public.pos_product_variants pv on pv.id=v.variant_id where l.seller_id='${seller}'`);
 const art=path.join(workspace,'public','v4-fixtures');mkdirSync(art,{recursive:true});
 for(const [name,color] of [['shirt','#c6b48f'],['bag','#7d8a62']])writeFileSync(path.join(art,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="160"><rect width="140" height="160" fill="#eeece3"/><ellipse cx="70" cy="141" rx="40" ry="5" fill="#d8d5ca"/>${name==='shirt'?`<path d="M47 27L26 40 12 65 32 75 43 58 40 134 100 134 97 58 108 75 128 65 114 40 93 27 80 36 60 36Z" fill="${color}"/><path d="M60 27L70 48 80 27M70 48V132" fill="none" stroke="#ac9874" stroke-width="2"/>`:`<path d="M42 57V42C42 10 98 10 98 42V57" fill="none" stroke="${color}" stroke-width="9"/><path d="M32 53H108L116 135H24Z" fill="${color}"/>`}</svg>`);
 const fixture=(name,route='HUB',state='PAID')=>{
  const o=createOrder();sql(`update public.comu_orders set shipping_address_snapshot='{"recipient_name":"${name}","phone":"PRIVATE_PHONE","line1":"PRIVATE_ADDRESS"}' where id='${o.o}';update public.comu_order_suborders set fulfillment_route='${route}' where id='${o.s}';insert into public.comu_order_events(order_id,event_type,actor_type) values('${o.o}','ORDER_PAID','TEST')`);
  for(const [title,image,price,variant,sku] of [['Camisa de lino','shirt',40,'Arena / M','V4-LINO'],['Bolsa de algodón','bag',60,'Olivo','V4-BOLSA']]){
   const product=products.find(p=>p.variant===variant);assert.ok(product,'Canonical variant fixture');
   const item=randomUUID(),snapshot=JSON.stringify({listingTitle:title,image:'/v4-fixtures/'+image+'.svg',variant,sku,privateNote:'PRIVATE_NOTE'});
   sql(`insert into public.comu_order_items(id,order_id,suborder_id,seller_id,listing_id,variant_listing_id,product_id,variant_id,quantity,unit_price,subtotal) values('${item}','${o.o}','${o.s}','${seller}','${product.listing_id}','${product.variant_listing_id}','${product.product_id}','${product.variant_id}',1,${price},${price});insert into public.comu_order_item_snapshots(order_item_id,snapshot) values('${item}','${snapshot}')`);
  }
  if(state!=='PAID')f.as(f.uid,f.transition(o.s,'PREPARING'));
  if(['READY','SHIPPED','DELIVERED'].includes(state))f.as(f.uid,f.transition(o.s,route==='HUB'?'READY_FOR_HUB':'READY_TO_SHIP'));
  if(['SHIPPED','DELIVERED'].includes(state)){
   sql(`insert into public.comu_shipments(id,master_order_id,provider,provider_shipment_id,status,tracking_number,carrier) values('${randomUUID()}','${o.o}','SKYDROPX','v4-${o.s}','READY_TO_SHIP','V4-LOCAL-TRACK','Transportista local')`);
   f.as(f.uid,f.transition(o.s,'SHIPPED'));
   if(state==='DELIVERED')sql(`set role service_role;select public.comu_process_tracking_event_v1('SKYDROPX','delivered-${o.s}','v4-${o.s}','DELIVERED',null);reset role`);
  }
  if(state==='ISSUE')f.as(f.admin,`select public.comu_record_fulfillment_incident_v1('${o.s}','WRONG_PRODUCT','${randomUUID()}','PRIVATE_NOTE')`);
  return o;
 };
 for(let i=0;i<16;i++)fixture('Destinatario de prueba '+(i+1));
 const old=fixture('Pedido anterior');sql(`update public.comu_order_suborders set created_at=now()-interval '60 days' where id='${old.s}'`);
 const delivered=fixture('Isabel Torres','DIRECT','DELIVERED'),transit=fixture('Mateo Rivera','DIRECT','SHIPPED'),issue=fixture('Elena García','HUB','ISSUE');
 const direct=fixture('Diego Flores','DIRECT','PREPARING'),hub=fixture('Valeria López','HUB','READY'),paid=fixture('Sofía Martínez'),preparing=fixture('Andrés Ruiz','HUB','PREPARING');
 const list='/api/comu/seller/orders?contract=o1&sellerId='+seller;
 let result=await request(list);assert.equal(result.status,200,JSON.stringify(result.data));assert.match(result.headers.get('cache-control'),/private.*no-store/);
 assert.equal(result.data.orders.length,20);assert.ok(result.data.pagination.total>20);
 for(const name of ['buyer','other'])assert.equal((await request(list,name)).status,403);
 assert.equal((await request(list,'anonymous')).status,401);
 assert.equal((await request(list+'&days=90')).data.pagination.total,result.data.pagination.total+1);
 assert.equal((await request(list+'&selected='+old.s)).data.selected.suborderId,old.s);
 assert.equal((await request(list+'&search=V4-BOLSA')).data.pagination.total,result.data.pagination.total);
 assert.equal((await request(list+'&search=does-not-exist')).data.orders.length,0);
 for(const bad of ['PRIVATE_','label_url','hub_handoff','stripe','shipping_address'])assert.ok(!JSON.stringify(result.data).includes(bad));
 const mutate='/api/comu/seller/orders/'+paid.s+'/fulfillment';
 const response=await request(mutate,'owner',{sellerId:seller,status:'PREPARING'});assert.equal(response.status,200,JSON.stringify(response.data));
 assert.equal((await request(mutate,'owner',{sellerId:seller,status:'PREPARING'})).status,200);
 assert.equal(Number(sql(`select count(*) from public.comu_fulfillment_events where suborder_id='${paid.s}' and event_type='SUBORDER_PREPARING'`)),1);
 // Activate the existing N1 migration after historical fixtures: no retrospective notifications.
 // Isolated Auth owns its tables now; restore only the migration role's required fixture privileges.
 dock(['exec','-i','-u','postgres',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],"grant select,references on auth.users to postgres;");
 sql(readFileSync('supabase/migrations/20261005150000_comu_notifications_v1.sql','utf8'));
 dock(['exec','-u','postgres',container,'psql','-X','-U','postgres','-d',database,'-c',"NOTIFY pgrst, 'reload schema'"]);
 sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${old.o}','ORDER_PAID','TEST')`);
 for(let i=0;i<3;i++){const w=await fetch('http://127.0.0.1:3117/api/comu/notifications/dispatch',{method:'POST',headers:{authorization:'Bearer '+workerSecret}});assert.equal(w.status,200);}
 const inbox=await request('/api/comu/notifications');assert.ok(inbox.data.notifications.some(n=>n.deep_link.endsWith(old.s)));
 // The second store stays empty, and uses independently authorized routing.
 sql(`insert into public.comu_seller_memberships(seller_id,user_id,role,active) values('${sellerB}','${users.owner.id}','ORDER_MANAGER',true)`);
 for(const route of ['/api/comu/sellers?mine=1','/api/comu/seller/catalog?sellerId='+seller,'/api/comu/storefronts?sellerId='+seller]) {
  const response=await request(route);assert.equal(response.status,200,JSON.stringify(response.data));
 }
 await certifyOrders(workspace,users.owner.jar,{hub,direct,issue,old,preparing,delivered,transit,seller,sql});
 console.log('PASS V4 HTTP: O1 Auth/authorization, 30/90/search/pagination/selected, privacy/no-store, idempotent mutation, N1 deep link');
 } catch(error) {
   for(const name of started) {const state=inspect(name).State;console.error('Isolated container',name,'running',state.Running,'exit',state.ExitCode);}
   throw error;
 } finally {if(app)app.kill();if(gateway)gateway.close();for(const name of started)dock(['rm','-f',name]);}
}

async function certifyOrders(workspace,jar,f) {
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9237','--remote-debugging-address=127.0.0.1','--user-data-dir='+path.join(workspace,'browser-profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
 const output=path.resolve('docs/visual-evidence/comu-seller-orders-v4');mkdirSync(output,{recursive:true});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket,seq=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed: '+JSON.stringify(r.exceptionDetails));return r.result.value;};
 const waitFor=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(200);}throw Error('Browser condition failed: '+expression+'; '+await evaluate('document.body.innerText.slice(-900)'));};
 const screenshot=async name=>{await evaluate("document.querySelectorAll('nextjs-portal').forEach(e=>e.style.visibility='hidden')");const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(output,name+'.png'),Buffer.from(r.data,'base64'));};
 const settled=()=>waitFor("document.querySelector('.orders-list-panel')?.getAttribute('aria-busy')==='false'");
 const navigate=async suffix=>{await send('Page.navigate',{url:'http://127.0.0.1:3117/comu/seller/o1-a/'+suffix});await settled();};
 const select=async id=>{await navigate('orders?selected='+id);await waitFor("document.querySelector('.orders-detail')?.getAttribute('aria-busy')==='false'");};
 const button=async(text,scope='document')=>evaluate(`[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
 const input=async value=>{await evaluate(`(()=>{const el=document.querySelector('.orders-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(250);await settled();};
 const noOverflow=async()=>assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"),'No horizontal overflow');
 try {
  let tabs;for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9237/json/list')).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await sleep(250);}
  assert.ok(tabs?.length,'Existing Chromium required');socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}});
  await send('Page.enable');await send('Network.enable');
  await send('Network.setCookies',{cookies:[...jar].map(([name,value])=>({name,value,url:'http://127.0.0.1:3117',path:'/',sameSite:'Lax'}))});
  await send('Emulation.setDeviceMetricsOverride',{width:1536,height:1024,deviceScaleFactor:1,mobile:false});
  await navigate('orders');await noOverflow();
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.seller-sidebar')).backgroundColor"),'rgb(13, 28, 23)');
  assert.equal(await evaluate("document.querySelectorAll('.orders-metric').length"),6);
  assert.equal(await evaluate("document.querySelectorAll('.orders-table tbody tr').length"),20);
  assert.ok(await evaluate("document.querySelector('.orders-count-note').innerText.includes('de esta página')"));
  await waitFor("[...document.querySelectorAll('.orders-thumbnail img')].filter(i=>i.getClientRects().length && i.getBoundingClientRect().top<innerHeight).every(i=>i.complete&&i.naturalWidth>0)");
  await screenshot('orders-desktop-list');
  const first=await evaluate("document.querySelector('.orders-table tbody tr').dataset.orderId");
  await button('Siguiente');await sleep(300);await settled();
  assert.notEqual(await evaluate("document.querySelector('.orders-table tbody tr').dataset.orderId"),first);
  await button('Anterior');await sleep(300);await settled();
  await input('does-not-exist');assert.ok(await evaluate("document.querySelector('.orders-empty').innerText.includes('No encontramos')"));
  await input('Camisa');assert.equal(await evaluate("document.querySelectorAll('.orders-table tbody tr').length"),20);
  await input('');
  await button('Incidencias',"document.querySelector('.orders-filters')");await sleep(300);await settled();
  assert.equal(await evaluate("document.querySelectorAll('.orders-table tbody tr').length"),1);
  await button('Todos',"document.querySelector('.orders-filters')");await sleep(300);await settled();
  const count=await evaluate("document.querySelector('.orders-pagination').textContent");
  await evaluate("(()=>{const el=document.querySelector('.orders-period select');el.value='90';el.dispatchEvent(new Event('change',{bubbles:true}));})()");await sleep(300);await settled();
  assert.notEqual(await evaluate("document.querySelector('.orders-pagination').textContent"),count);
  await select(f.hub.s);await screenshot('orders-desktop-detail-hub');
  assert.ok(await evaluate("document.querySelector('.orders-primary').textContent.includes('Confirmar entrega al HUB')"));
  assert.equal(await evaluate("document.querySelectorAll('.orders-timeline [data-evidenced=true]').length"),3);
  // A lost response after a confirmed real mutation is safe to refresh and does not duplicate a transition.
  await evaluate("window.__realFetch=window.fetch;window.__failOnce=true;window.fetch=async(...args)=>{if(args[1]?.method==='PATCH'&&window.__failOnce){window.__failOnce=false;const r=await window.__realFetch(...args);if(r.ok)throw Error('Respuesta perdida; se verificará el estado del pedido.');return r;}return window.__realFetch(...args);};document.querySelector('.orders-primary').click()");
  await waitFor("document.querySelector('.orders-next')?.innerText.includes('Esperando recepción del HUB')");
  assert.equal(await evaluate("document.querySelector('.orders-primary')===null"),true);
  assert.equal(Number(f.sql(`select count(*) from public.comu_fulfillment_events where suborder_id='${f.hub.s}' and event_type='SUBORDER_HANDED_TO_HUB'`)),1);
  await select(f.direct.s);await screenshot('orders-desktop-detail-direct');
  assert.ok(await evaluate("document.querySelector('.orders-primary').textContent.includes('listo para envío')"));
  assert.ok(await evaluate("!document.querySelector('.orders-detail').innerText.includes('Listo para HUB')"));
  // Network failure before submission: same allowed action remains retryable.
  await evaluate("window.__realFetch=window.fetch;window.__failOnce=true;window.fetch=async(...args)=>{if(args[1]?.method==='PATCH'&&window.__failOnce){window.__failOnce=false;throw Error('No se pudo conectar. Reintenta la acción.');}return window.__realFetch(...args);};document.querySelector('.orders-primary').click()");
  await waitFor("document.querySelector('.orders-notice--error')!==null && document.querySelector('.orders-primary')?.disabled===false");
  await evaluate("document.querySelector('.orders-primary').click()");
  await waitFor("document.querySelector('.orders-notice--success')!==null && document.querySelector('.orders-primary')===null");
  assert.equal(Number(f.sql(`select count(*) from public.comu_fulfillment_events where suborder_id='${f.direct.s}' and event_type='SUBORDER_READY_TO_SHIP'`)),1);
  await evaluate("document.querySelector('.orders-close').click()");await waitFor("document.querySelector('.orders-detail')===null");
  await select(f.issue.s);await screenshot('orders-issue');assert.ok(await evaluate("document.querySelector('.orders-issue')!==null"));
  await navigate('orders');
  const bell="document.querySelector('[aria-controls=\"comu-notification-panel\"]')";
  await evaluate(bell+'.click()');await waitFor(`document.querySelector('#comu-notification-panel a[href$="${f.old.s}"]')!==null`);
  await evaluate(`document.querySelector('#comu-notification-panel a[href$="${f.old.s}"]').click()`);
  await waitFor("document.querySelector('.orders-detail')!==null");await settled();
  assert.ok(await evaluate(`location.pathname==='/comu/seller/o1-a/orders' && new URLSearchParams(location.search).get('selected')==='${f.old.s}'`));
  assert.ok(await evaluate("document.querySelector('.orders-detail').innerText.includes('Pedido anterior')"));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await waitFor("document.querySelector('.orders-detail')===null");
  await send('Emulation.setDeviceMetricsOverride',{width:834,height:1112,deviceScaleFactor:1,mobile:false});await navigate('orders');await noOverflow();await screenshot('orders-tablet-list');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.orders-table-wrap')).display"),'none');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await navigate('orders');await noOverflow();await screenshot('orders-phone-list');
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.seller-mobile-nav')).display"),'none');
  await select(f.preparing.s);await noOverflow();await screenshot('orders-phone-detail');
  assert.equal(await evaluate("document.querySelector('.orders-detail').getBoundingClientRect().width"),390);
  assert.equal(await evaluate("document.querySelectorAll('.orders-timeline [data-evidenced=true]').length"),2);
  await evaluate("document.querySelector('.orders-close').click()");await waitFor("document.querySelector('.orders-detail')===null");
  await evaluate("(()=>{const el=document.querySelector('[aria-label=\"Elegir tienda\"]');el.value='o1-b';el.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await waitFor("location.pathname==='/comu/seller/o1-b/orders' && document.querySelector('.orders-empty')!==null");await settled();
  assert.ok(await evaluate("document.querySelector('.orders-empty').textContent.includes('Aún no tienes pedidos.')"));
  await screenshot('orders-empty');
  // Loading/error/retry uses a local network fault, never fixture data in the component.
  const delay=await send('Page.addScriptToEvaluateOnNewDocument',{source:"const originalFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/api/comu/seller/orders?'))await new Promise(r=>setTimeout(r,1800));return originalFetch(...args);};"});
  await send('Page.navigate',{url:'http://127.0.0.1:3117/comu/seller/o1-a/orders'});
  await waitFor("document.querySelector('.orders-feedback')?.textContent.includes('Cargando pedidos')");await settled();await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:delay.identifier});
  await evaluate("window.__realFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/api/comu/seller/orders?'))throw Error('Fallo local de red');return window.__realFetch(...args);}");
  await input('retry');await waitFor("document.querySelector('.orders-feedback--error')!==null");
  await evaluate("window.fetch=window.__realFetch");await button('Reintentar');await settled();
  assert.equal(await evaluate("document.querySelector('.orders-feedback--error')"),null);
  console.log('PASS Chromium V4: desktop/tablet/phone, snapshots, search/status/30-90/pagination, HUB/DIRECT, real timeline, retry/lost-response, issue, N1 selected deep link, multistore, empty/loading/error, no overflow');
  // Existing V1/V2 surfaces in the same isolated backend (no principal fixture credentials).
  for(const [device,width,height] of [['desktop',1536,1024],['tablet',834,1112],['phone',390,844]]){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:device==='phone'});
   await send('Page.navigate',{url:'http://127.0.0.1:3117/comu/seller/o1-a/summary'});
   await waitFor("document.querySelector('[data-seller-state=\"ACTIVE\"]')!==null");await noOverflow();
   assert.ok(await evaluate("document.body.innerText.includes('Haz crecer tu negocio con COMETA.') && !document.querySelector('[aria-label=\"Navegación principal\"]')"));
   await screenshot('regression-v1-'+device);
   await send('Page.navigate',{url:'http://127.0.0.1:3117/comu/seller/o1-a/products'});
   await waitFor("document.querySelector('.sp-product')!==null");await noOverflow();await screenshot('regression-v2-'+device);
   assert.equal(await evaluate("!!document.querySelector('.sp-progress')"),false);
   if(device==='phone'){
    await evaluate("document.querySelector('.seller-mobile-nav button').click()");await waitFor("document.querySelector('.seller-mobile-menu')!==null");
    await evaluate("document.querySelector('.seller-mobile-menu button').click()");
   }
  }
  console.log('PASS isolated Seller Visual V1 + Products V2 active desktop/tablet/phone regressions');
  writeFileSync(path.join(output,'results.json'),JSON.stringify({status:'PASS',database:'disposable',emails:'none',tested:['search','filters','pagination','selected','open-close','hub','direct','mutation-retry','issue','multi-store','notification-deep-link','V1','V2'],viewport:[1536,834,390]},null,2));
 } finally {if(socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}chrome.kill();}
}
