// Invoked ONLY by the disposable N1 PostgreSQL harness. No principal DB writes.
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {cpSync,mkdtempSync,symlinkSync,appendFileSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createServerClient} from '@supabase/ssr';

export async function certifyHTTP(f) {
 const {container,database,dock,sql,seller,sellerB,createOrder}=f;
 assert.match(database,/^comu_n1_\d+$/);
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
  const email=`n1-http-${name}@example.test`,password=randomBytes(24).toString('base64url');
  const r=await fetch('http://127.0.0.1:58230/auth/v1/admin/users',{method:'POST',headers:{'Content-Type':'application/json',apikey:service,Authorization:`Bearer ${service}`},body:JSON.stringify({email,password,email_confirm:true})});const u=await r.json();assert.equal(r.status,200,`Auth fixture ${name}: ${u.msg||u.message||r.status}`);
  const jar=new Map(),auth=createServerClient('http://127.0.0.1:58230',anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
  const login=await auth.auth.signInWithPassword({email,password});assert.equal(login.error,null);users[name]={id:u.id,jar,auth};
  sql(`insert into public.user_profiles(user_id,email,role,status) values('${u.id}','${email}','${name==='admin'?'admin':'client'}','active') on conflict(user_id) do update set role=excluded.role,status='active'`);
 }
 sql(`insert into public.comu_seller_memberships(seller_id,user_id,role,active) values('${seller}','${users.owner.id}','OWNER',true),('${sellerB}','${users.other.id}','OWNER',true)`);
 mkdirSync('.next',{recursive:true});const workspace=mkdtempSync(path.join(path.resolve('.next'),'n1-http-'));
 for(const source of ['src','public','config','package.json','package-lock.json','tsconfig.json','next.config.ts','postcss.config.mjs','next-env.d.ts'])cpSync(source,path.join(workspace,source),{recursive:true});symlinkSync(path.resolve('node_modules'),path.join(workspace,'node_modules'),'junction');
 // Pin the disposable project's root; do not infer the parent app from its lockfile.
 const nextConfig=path.join(workspace,'next.config.ts');writeFileSync(nextConfig,readFileSync(nextConfig,'utf8').replace('const nextConfig: NextConfig = {','const nextConfig: NextConfig = {\n  outputFileTracingRoot: process.cwd(),'));
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|LOCALAPPDATA|APPDATA|USERPROFILE|NUMBER_OF_PROCESSORS)$/i.test(k)));
 app=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3117'],{cwd:workspace,env:{...env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:58230',NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,SUPABASE_SERVICE_ROLE:service,SKYDROPX_WEBHOOK_SECRET:webhookSecret,NEXT_TELEMETRY_DISABLED:'1',COMU_NOTIFICATIONS_WORKER_SECRET:workerSecret},stdio:['ignore','pipe','pipe'],windowsHide:true});
 for(const stream of [app.stdout,app.stderr])stream.on('data',d=>appendFileSync(path.join(workspace,'next.log'),d));
 await ready('http://127.0.0.1:3117/api/comu/seller/orders');
 async function request(route,user='owner',body,method=body?'PATCH':'GET'){
  const jar=users[user]?.jar;const r=await fetch('http://127.0.0.1:3117'+route,{method,redirect:'manual',headers:{...(jar?{cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(jar)for(const cookie of r.headers.getSetCookie()){const part=cookie.split(';')[0],i=part.indexOf('=');jar.set(part.slice(0,i),part.slice(i+1));}
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={html:text};}return {status:r.status,data,headers:r.headers};
 }
 const endpoint='/api/comu/notifications';
 const runWorker=async(secret=workerSecret)=>{const r=await fetch('http://127.0.0.1:3117/api/comu/notifications/dispatch',{method:'POST',headers:{authorization:'Bearer '+secret}});return {status:r.status,data:await r.json()};};
 assert.equal((await runWorker('invalid')).status,401);
 assert.equal((await request(endpoint,'anonymous')).status,401);
 assert.equal((await request(endpoint+'?audience=OTHER')).status,400);
 assert.equal((await request(endpoint+'?limit=51')).status,400);
 assert.equal((await request(endpoint+'?sellerId=invalid')).status,400);
 assert.equal((await request(endpoint,'owner',{action:'read',audience:'SELLER',id:'invalid'})).status,400);
 sql(`update public.comu_buyers set user_id='${users.buyer.id}' where id='${f.bid}'`);
 const o=createOrder();sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${o.o}','ORDER_PAID','TEST')`);
 for(let i=0;i<4;i++){const w=await runWorker();assert.equal(w.status,200,JSON.stringify(w.data));}
 let r=await request(endpoint);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private.*no-store/);
 assert.equal(r.data.notifications.length,1);assert.equal(r.data.unreadCount,1);
 const nid=r.data.notifications[0].id;assert.ok(r.data.notifications[0].deep_link.endsWith(o.s));
 assert.equal((await request(endpoint+'?sellerId='+sellerB)).data.notifications.length,0);
 assert.equal((await request(endpoint,'other')).data.notifications.length,0);
 assert.equal((await request(endpoint,'buyer')).data.notifications.length,0);
 assert.equal((await request(endpoint+'?audience=BUYER','buyer')).data.notifications.length,1);
 assert.equal((await request(endpoint,'other',{action:'read',audience:'SELLER',id:nid})).status,404);
 assert.equal((await request(endpoint,'owner',{action:'read',audience:'SELLER',id:nid})).status,200);
 assert.equal((await request(endpoint)).data.unreadCount,0);
 assert.equal((await request(endpoint+'?audience=BUYER','buyer')).data.unreadCount,1);
 assert.equal((await request(endpoint,'buyer',{action:'read-all',audience:'BUYER'})).status,200);
 assert.equal((await request(endpoint+'?audience=BUYER','buyer')).data.unreadCount,0);
 r=await request(`/api/comu/seller/orders/${o.s}/fulfillment`,'owner',{sellerId:seller,status:'PREPARING'});assert.equal(r.status,200,JSON.stringify(r.data));
 for(let i=0;i<3;i++)assert.equal((await runWorker()).status,200);
 assert.equal((await request(endpoint)).data.unreadCount,1);
 assert.equal((await request(endpoint+'?audience=BUYER','buyer')).data.unreadCount,1);
 sql(`update public.comu_seller_memberships set active=false where user_id='${users.owner.id}'`);
 assert.equal((await request(endpoint)).data.notifications.length,0);
 assert.equal((await request(endpoint,'owner',{action:'read',audience:'SELLER',id:nid})).status,404);
 sql(`update public.comu_seller_memberships set active=true where user_id='${users.owner.id}'`);
 r=await request(endpoint);for(const secret of ['PRIVATE_','shipping_address','hub_handoff','stripe','label_url','email_payload','claim_token'])assert.ok(!JSON.stringify(r.data).includes(secret));
 assert.equal((await request(endpoint,'owner',{action:'read-all',audience:'SELLER',sellerId:sellerB})).data.changed,0);
 assert.equal((await request(endpoint,'owner',{action:'read-all',audience:'SELLER',sellerId:seller})).status,200);
 assert.equal((await request(endpoint)).data.unreadCount,0);
 // Engine works without any provider credentials. Failure is durable and safe.
 assert.ok(Number(sql("select count(*) from public.comu_notification_outbox where status='RETRY' and last_error='CONFIGURATION'"))>0);
 r=await request('/comu/seller/o1-a/orders');assert.equal(r.status,200);assert.ok(r.data.html.includes('Notificaciones'));
 const browserOrder=createOrder();sql(`insert into public.comu_order_events(order_id,event_type,actor_type) values('${browserOrder.o}','ORDER_PAID','TEST')`);
 for(let i=0;i<3;i++)assert.equal((await runWorker()).status,200);
 sql(`insert into public.comu_seller_memberships(seller_id,user_id,role,active) values('${sellerB}','${users.owner.id}','ORDER_MANAGER',true)`);
 await certifyBell(workspace,users.owner.jar);
 await users.owner.auth.auth.signOut();assert.equal((await request(endpoint)).status,401);
 console.log('PASS N1 real HTTP Auth/cookies, worker secret, Seller/Buyer inbox, read/read-all/count, cross-user/store, revocation, privacy, bell HTML, provider-disabled retry and logout');
 } catch(error) {
   for(const name of started) {const state=inspect(name).State;console.error('Isolated container',name,'running',state.Running,'exit',state.ExitCode);}
   throw error;
 } finally {if(app)app.kill();if(gateway)gateway.close();for(const name of started)dock(['rm','-f',name]);}
}

async function certifyBell(workspace,jar) {
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9237','--remote-debugging-address=127.0.0.1','--user-data-dir='+path.join(workspace,'browser-profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket,seq=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
 const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(200);}throw Error('Browser condition failed: '+expression);};
 const screenshot=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(workspace,name+'.png'),Buffer.from(r.data,'base64'));};
 const bell='document.querySelector(\'[aria-controls="comu-notification-panel"]\')';
 try {
  let tabs;for(let i=0;i<60;i++){try{tabs=await(await fetch('http://127.0.0.1:9237/json/list')).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await sleep(250);}
  assert.ok(tabs?.length,'Existing Chromium required');socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}});
  await send('Page.enable');await send('Network.enable');
  await send('Network.setCookies',{cookies:[...jar].map(([name,value])=>({name,value,url:'http://127.0.0.1:3117',path:'/',sameSite:'Lax'}))});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  const delayed=await send('Page.addScriptToEvaluateOnNewDocument',{source:`const realFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes('/api/comu/notifications')){window.__n1Requested=true;await new Promise(r=>setTimeout(r,4000));}return realFetch(...args);};`});
  await send('Page.navigate',{url:'http://127.0.0.1:3117/comu/seller/o1-a/orders'});
  await waitFor(`${bell}!==null && window.__n1Requested===true`);
  await evaluate(`${bell}.click()`);await waitFor(`document.querySelector('#comu-notification-panel')?.innerText.includes('Cargando')`);
  await screenshot('bell-loading');await waitFor(`${bell}.getAttribute('aria-label').includes('1 sin leer')`);
  await waitFor(`document.querySelector('#comu-notification-panel')?.innerText.includes('Nuevo pedido')`);await screenshot('bell-desktop');
  await evaluate(`[...document.querySelectorAll('#comu-notification-panel button')].find(b=>b.textContent==='Marcar como leída').click()`);
  await waitFor(`${bell}.getAttribute('aria-label').includes('0 sin leer')`);
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:delayed.identifier});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const box=await evaluate(`(()=>{const r=document.querySelector('#comu-notification-panel').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth};})()`);assert.ok(box.left>=0&&box.right<=box.width,JSON.stringify(box));await screenshot('bell-mobile');
  await evaluate(`window.fetch=async()=>{throw new Error('LOCAL_SIMULATED_NETWORK_FAILURE');};${bell}.click();`);await evaluate(`${bell}.click()`);
  await waitFor(`document.querySelector('#comu-notification-panel')?.innerText.includes('Notificaciones no disponibles')`);await screenshot('bell-error');
  await send('Page.navigate',{url:'http://127.0.0.1:3117/comu/seller/o1-b/orders'});
  await waitFor(`${bell}!==null && document.readyState==='complete'`);await sleep(1000);await evaluate(`${bell}.click()`);
  await waitFor(`document.querySelector('#comu-notification-panel')?.innerText.includes('No tienes notificaciones')`);await screenshot('bell-empty');
  console.log('PASS Chromium bell: real inbox/count, mark read, loading/empty/network error, mobile panel within viewport. Evidence:',workspace);
 } finally {if(socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}chrome.kill();}
}
