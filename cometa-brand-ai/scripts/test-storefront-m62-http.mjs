// Called only after isolated M6 schema + fixtures. Real Auth/PostgREST/Next/browser.
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID,createHash} from 'node:crypto';
import http from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function certifyHTTP(f){
 const {api,exec,sql,container,database,ids,variant2}=f;assert.match(database,/^cometa_m6_\d+$/);
 const inspect=async id=>JSON.parse((await api('GET','/containers/'+id+'/json')).toString());
 const db=await inspect(container),suffix=db.Name.slice('/supabase_db_'.length),network=Object.keys(db.NetworkSettings.Networks)[0];
 const authConfig=await inspect('supabase_auth_'+suffix),restConfig=await inspect('supabase_rest_'+suffix);
 const envOf=c=>Object.fromEntries(c.Config.Env.map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
 const secret=randomBytes(48).toString('base64url');
 const jwt=role=>{const h=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),b=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200})).toString('base64url');return h+'.'+b+'.'+createHmac('sha256',secret).update(h+'.'+b).digest('base64url');};
 const anon=jwt('anon'),service=jwt('service_role'),authEnv=envOf(authConfig),restEnv=envOf(restConfig);
 const uri=v=>{const u=new URL(v);u.hostname=db.Name.slice(1);u.pathname='/'+database;return u.toString();};
 for(const k of Object.keys(authEnv))if(/JWT_KEYS|HOOK|SMTP|EXTERNAL_/.test(k))delete authEnv[k];
 Object.assign(authEnv,{GOTRUE_DB_DATABASE_URL:uri(authEnv.GOTRUE_DB_DATABASE_URL),GOTRUE_JWT_SECRET:secret,GOTRUE_SITE_URL:'http://127.0.0.1:3182',API_EXTERNAL_URL:'http://127.0.0.1:58380',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_DISABLE_SIGNUP:'false'});
 Object.assign(restEnv,{PGRST_DB_URI:uri(restEnv.PGRST_DB_URI),PGRST_JWT_SECRET:secret,PGRST_DB_SCHEMAS:'public'});
 // Read only migration version metadata from source; all writes target the new DB.
 const versions=await exec(['psql','-X','-q','-t','-A','-U','postgres','-d','postgres','-c',"select coalesce(string_agg(format('insert into auth.schema_migrations(version) values(%L) on conflict do nothing;',version),E'\\n'),'') from auth.schema_migrations"]);
 await sql(versions);
 await sql(`alter schema auth owner to supabase_auth_admin;do $$ declare t record;begin for t in select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relkind in('r','p','S') loop execute format('alter %s auth.%I owner to supabase_auth_admin',case when t.relkind='S' then 'sequence' else 'table' end,t.relname);end loop;end $$;grant usage,create on schema auth to supabase_auth_admin;grant all on all tables in schema auth to supabase_auth_admin;grant all on all sequences in schema auth to supabase_auth_admin;`,'supabase_admin');
 const started=[],apps=[],servers=[];let chrome,ws;const sessions=new Map();
 const workspace=path.resolve('.next',database+'_http');fs.mkdirSync(workspace,{recursive:true});
 const evidence=path.resolve('docs/evidence/m62');fs.mkdirSync(evidence,{recursive:true});
 const startContainer=async(name,c,env,port,target)=>{const r=JSON.parse((await api('POST','/containers/create?name='+name,{Image:c.Config.Image,Env:Object.entries(env).map(([k,v])=>k+'='+v),HostConfig:{NetworkMode:network,PortBindings:{[target+'/tcp']:[{HostIp:'127.0.0.1',HostPort:String(port)}]}}})).toString());started.push(r.Id);await api('POST','/containers/'+r.Id+'/start');};
 const ready=async url=>{for(let i=0;i<100;i++){try{if((await fetch(url,{signal:AbortSignal.timeout(2000)})).status<500)return;}catch{}await sleep(300);}throw Error('Isolated service unavailable '+url);};
 const listen=async(server,port)=>{servers.push(server);await new Promise((r,j)=>{server.once('error',j);server.listen(port,'127.0.0.1',r);});};
 try{
 await startContainer(database+'_auth',authConfig,authEnv,58381,9999);await startContainer(database+'_rest',restConfig,restEnv,58382,3000);
 await listen(http.createServer(async(req,res)=>{try{const auth=req.url.startsWith('/auth/v1/');if(!auth&&!req.url.startsWith('/rest/v1/')){res.writeHead(404);res.end();return;}const port=auth?58381:58382,chunks=[];for await(const c of req)chunks.push(c);const r=await fetch('http://127.0.0.1:'+port+req.url.replace(auth?'/auth/v1':'/rest/v1',''),{method:req.method,headers:{...req.headers,host:'127.0.0.1:'+port},...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});res.writeHead(r.status,Object.fromEntries([...r.headers].filter(([k])=>!['content-encoding','content-length','transfer-encoding'].includes(k))));res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(503);res.end();}}),58380);
 await ready('http://127.0.0.1:58381/health');await ready('http://127.0.0.1:58382/');
 const password=randomBytes(24).toString('base64url'),email='m62-real-auth@example.test';
 const created=await fetch('http://127.0.0.1:58380/auth/v1/admin/users',{method:'POST',headers:{apikey:service,authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});assert.equal(created.status,200,'real Auth fixture creation');
 const login=await fetch('http://127.0.0.1:58380/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);const authToken=(await login.json()).access_token;assert.ok(authToken);
 const denied=await fetch('http://127.0.0.1:58380/rest/v1/store_orders?select=id',{headers:{apikey:anon,authorization:'Bearer '+authToken}});assert.equal(denied.status,403,'real authenticated JWT cannot read guest orders directly');
 console.log('PASS real isolated Auth login and PostgREST authenticated order read denied; no guest registration requirement');
 await listen(http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const b=new URLSearchParams(Buffer.concat(chunks).toString());let data;
 if(req.url==='/v1/account')data={id:'acct_m62_fixture'};
 else if(req.url==='/v1/checkout/sessions'&&req.method==='POST'){const key=req.headers['idempotency-key'];data=sessions.get(key);if(!data){data={id:'cs_test_'+randomUUID(),object:'checkout.session',livemode:false,client_reference_id:b.get('client_reference_id'),amount_total:Number(b.get('line_items[0][price_data][unit_amount]')),currency:b.get('line_items[0][price_data][currency]'),status:'open',url:null};sessions.set(key,data);sessions.set(data.id,data);}}
 else data=sessions.get(req.url.split('/').pop());res.writeHead(data?200:404,{'Content-Type':'application/json'});res.end(JSON.stringify(data??{error:{message:'Stripe fixture endpoint unsupported'}}));}),58383);
 // Real app sources in ignored, isolated build trees; no .env files copied.
 for(const [index,slug] of ['m1-brand','m1-other'].entries()){
 const root=path.join(workspace,'app'+index),appdir=path.join(root,'apps/magenta-storefront');fs.mkdirSync(appdir,{recursive:true});
 for(const source of ['app','lib','package.json','next.config.ts','tsconfig.json'])fs.cpSync(path.join('apps/magenta-storefront',source),path.join(appdir,source),{recursive:true});
 fs.cpSync('packages',path.join(root,'packages'),{recursive:true});fs.mkdirSync(path.join(root,'src/lib/pos'),{recursive:true});fs.copyFileSync('src/lib/pos/product-web-contract.ts',path.join(root,'src/lib/pos/product-web-contract.ts'));fs.symlinkSync(path.resolve('node_modules'),path.join(root,'node_modules'),'junction');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|PATHEXT|LOCALAPPDATA|APPDATA|USERPROFILE|NUMBER_OF_PROCESSORS)$/i.test(k)));
 const app=spawn(process.execPath,['--require',path.resolve('scripts/test-storefront-m62-stripe.cjs'),path.resolve('node_modules/next/dist/bin/next'),'dev','--webpack',appdir,'--hostname','127.0.0.1','--port',String(3182+index)],{env:{...env,NEXT_TELEMETRY_DISABLED:'1',STOREFRONT_BRAND_SLUG:slug,STOREFRONT_SUPABASE_URL:'http://127.0.0.1:58380',STOREFRONT_SUPABASE_ANON_KEY:anon,STOREFRONT_SUPABASE_SERVICE_ROLE_KEY:service,STOREFRONT_STRIPE_TEST_SECRET_KEY:'sk_test_synthetic_m62',STOREFRONT_STRIPE_TEST_WEBHOOK_SECRET:'whsec_synthetic_m62',STOREFRONT_ORIGIN:'http://127.0.0.1:'+(3182+index),STOREFRONT_EXPIRY_SECRET:'m62-fixture-expiry',M62_STRIPE_PORT:'58383'},windowsHide:true,stdio:['ignore','pipe','pipe']});apps.push(app);for(const s of [app.stdout,app.stderr])s.on('data',d=>fs.appendFileSync(path.join(root,'next.log'),d));
 await ready('http://127.0.0.1:'+(3182+index)+'/api/checkout');
 }
 await sql(`insert into pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity,reserved_quantity) values('${ids.brand}','m1-brand','${ids.location}','${variant2}',1,0);insert into store_checkout_configuration values('${ids.brand}','${ids.location}','RETAIL_GROSS','MXN','acct_m62_fixture',now(),'${ids.admin}')`);
 const badOrigin=await fetch('http://127.0.0.1:3182/api/checkout',{method:'POST',headers:{origin:'https://foreign.example','Content-Type':'application/json'},body:'{"action":"session"}'});assert.equal(badOrigin.status,403);
 const lines=[{productId:ids.product,variantId:variant2,quantity:1}],contact={name:'Persona M62',email:'buyer@example.test',phone:'5555555555',line1:'Direccion sintetica original',line2:'',city:'Ciudad',state:'Estado',postalCode:'00000',country:'MX'};
 console.log('M62 applications ready');
 // Browser drives actual Next pages and handlers. No fetch/Supabase replacement.
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+path.join(workspace,'chrome'),'about:blank'],{windowsHide:true,stdio:'ignore'});
 const active=path.join(workspace,'chrome/DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(active);i++)await sleep(100);assert.ok(fs.existsSync(active));const port=fs.readFileSync(active,'utf8').split('\n')[0],targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let serial=0;const pending=new Map();let losePay=false,lost=false;
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}if(m.method==='Fetch.requestPaused'){console.log('M62 paused response',m.params.request.method,m.params.responseStatusCode);let pay=false;try{pay=JSON.parse(m.params.request.postData??'{}').action==='pay';}catch{}if(losePay&&pay&&m.params.responseStatusCode){losePay=false;lost=true;void call('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'Aborted'});}else void call('Fetch.continueRequest',{requestId:m.params.requestId});}};
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
 const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate('Boolean('+expression+')'))return;await sleep(200);}console.log('M62 diagnostic', {providerSessions:sessions.size,orders:await sql('select count(*) from store_orders')});console.log('Browser public status',await evaluate("({ready:document.readyState,status:document.querySelector('.mp-status')?.textContent,alert:document.querySelector('[role=alert]')?.textContent})"));throw Error('Browser condition timed out: '+expression);};
 const request=body=>evaluate(`fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(body)})}).then(async r=>({status:r.status,data:await r.json()}))`);
 const shot=async name=>{await evaluate(`document.body.insertAdjacentHTML('afterbegin','<div style="padding:8px;background:#740a32;color:white">M6.2 — PostgreSQL, PostgREST, Auth y Next reales · Stripe/envío sintéticos</div>')`);const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(evidence,name+'.png'),Buffer.from(r.data,'base64'));};
 await call('Page.enable');await call('Network.enable');await call('Emulation.setDeviceMetricsOverride',{width:1366,height:1000,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:'http://127.0.0.1:3182/productos/'+ids.product+'?variant='+variant2});await wait("document.querySelector('.mp-buy')&&!document.querySelector('.mp-buy').disabled&&Object.keys(document.querySelector('.mp-buy')).some(k=>k.startsWith('__reactProps'))");await evaluate("document.querySelector('.mp-buy').click()");await wait("document.querySelector('.mp-status').textContent.includes('Agregado')");
 await call('Page.navigate',{url:'http://127.0.0.1:3182/bolsa'});await wait("document.querySelector('.m6-line')?.textContent.includes('M1 product')");await shot('bag-real');
 await call('Page.navigate',{url:'http://127.0.0.1:3182/checkout'});await wait("document.querySelector('.m6-fields input')");
 const cookie=(await call('Network.getCookies',{urls:['http://127.0.0.1:3182']})).cookies.find(c=>c.name==='store_checkout_owner');assert.ok(cookie?.httpOnly);assert.equal(cookie.sameSite,'Lax');assert.ok(!await evaluate("document.cookie.includes('store_checkout_owner')"));
 // Match checkoutContact's canonical field order for the synthetic provider quote.
 const canonicalContact={email:contact.email,name:contact.name,phone:contact.phone,line1:contact.line1,line2:contact.line2,city:contact.city,state:contact.state,postalCode:contact.postalCode,country:contact.country};
 const hash=s=>createHash('sha256').update(s).digest('hex'),owner=hash(cookie.value),requestHash=hash(JSON.stringify({lines,contact:canonicalContact}));
 await sql(`insert into store_shipping_quotes(brand_id,owner_hash,request_hash,location_id,currency,amount_cents,provider,provider_reference,verified_at,expires_at) values('${ids.brand}','${owner}','${requestHash}','${ids.location}','MXN',5000,'M62_SYNTHETIC','fixture only',now(),now()+interval '1 hour')`);
 await evaluate(`Array.from(document.querySelectorAll('.m6-fields input')).forEach((x,i)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(x,${JSON.stringify(Object.values(contact))}[i]);x.dispatchEvent(new Event('input',{bubbles:true}));})`);await evaluate("document.querySelector('form').requestSubmit()");await wait("document.querySelector('.m6-summary button')&&!document.querySelector('.m6-summary button').disabled");await shot('checkout-real');
 await call('Fetch.enable',{patterns:[{urlPattern:'*/api/checkout',requestStage:'Response'}]});losePay=true;await evaluate("document.querySelector('.m6-summary button').click()");await wait("document.querySelector('[role=alert]')!==null");assert.ok(lost,'response dropped after real handler');await call('Fetch.disable');
 const attempt=await evaluate(`JSON.parse(localStorage.getItem('store.attempt.v1.${ids.brand}')).id`);
 console.log('M62 lost response observed');const row=JSON.parse(await sql(`select row_to_json(o) from store_orders o where attempt_id='${attempt}'`));assert.equal(row.status,'PENDING');assert.equal(row.total_cents,17000);assert.equal(sessions.size,2,'one Stripe fixture session');
 await call('Page.reload');await wait("document.querySelector('.m6-order')?.textContent.includes('Pago pendiente')");assert.equal(await evaluate(`JSON.parse(localStorage.getItem('store.attempt.v1.${ids.brand}')).id`),attempt);await shot('recovered-after-reload');
 await call('Page.navigate',{url:'http://127.0.0.1:3182/pedido/'+row.id});await wait("document.querySelector('.m6-order')?.textContent.includes('Pago pendiente')");await shot('private-order-real');
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await shot('private-order-phone-real');
 const body={action:'pay',lines,contact,attempt};assert.equal((await request(body)).data.order.id,row.id);
 const concurrent=await evaluate(`Promise.all([1,2].map(()=>fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:${JSON.stringify(JSON.stringify(body))}}).then(async r=>({status:r.status,data:await r.json()}))))`);assert.ok(concurrent.every(r=>r.status===200&&r.data.order.id===row.id));
 assert.equal((await request({...body,contact:{...contact,line1:'changed'}})).status,409);assert.equal((await request({...body,lines:[{...lines[0],quantity:2}]})).status,409);
 await sql(`update pos_product_variants set price=999 where id='${variant2}'`);assert.equal((await request(body)).data.order.total_cents,17000);assert.equal(await sql(`select contact->>'line1' from store_orders where id='${row.id}'`),contact.line1);
 const privateGet=await fetch('http://127.0.0.1:3182/api/checkout?order='+row.id);assert.equal((await privateGet.json()).order,null);assert.match(privateGet.headers.get('cache-control'),/private.*no-store/);
 const invalidCookie=await fetch('http://127.0.0.1:3182/api/checkout?order='+row.id,{headers:{cookie:'store_checkout_owner=invalid'}});assert.equal((await invalidCookie.json()).order,null);
 const authOnly=await fetch('http://127.0.0.1:3182/api/checkout?order='+row.id,{headers:{authorization:'Bearer '+authToken}});assert.equal((await authOnly.json()).order,null);
 await call('Network.deleteCookies',{name:'store_checkout_owner',url:'http://127.0.0.1:3182'});await request({action:'session'});assert.notEqual((await request(body)).status,200);assert.equal(await evaluate(`fetch('/api/checkout?order=${row.id}').then(r=>r.json()).then(d=>d.order)`),null);
 await call('Network.setCookie',{name:cookie.name,value:cookie.value,url:'http://127.0.0.1:3182',httpOnly:true,sameSite:'Lax'});
 const cross=await fetch('http://127.0.0.1:3183/api/checkout?order='+row.id,{headers:{cookie:cookie.name+'='+cookie.value}});assert.equal((await cross.json()).order,null);
 const crossPay=await fetch('http://127.0.0.1:3183/api/checkout',{method:'POST',headers:{origin:'http://127.0.0.1:3183',cookie:cookie.name+'='+cookie.value,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.notEqual(crossPay.status,200);
 await sql(`set role service_role;select brand_online_store_set_access_a1('m1-brand','${ids.admin}','suspended',1)`);assert.equal((await request({action:'resume',order:row.id})).status,200);assert.notEqual((await request({action:'quote',lines,contact})).status,200);
 assert.equal((await request({action:'cancel',order:row.id})).data.order.status,'CANCELLED');assert.equal((await request(body)).data.order.status,'CANCELLED');assert.notEqual((await request({...body,attempt:randomUUID()})).status,200);
 await sql(`set role service_role;select brand_online_store_set_access_a1('m1-brand','${ids.admin}','enabled',2)`);
 assert.equal(await sql(`select count(*) from store_orders`),'1');assert.equal(await sql(`select count(*) from store_order_inventory_effects where effect='RESERVE'`),'1');assert.equal(await sql(`select reserved_quantity::int from pos_inventory where variant_id='${variant2}'`),'0');
 const newQuote=()=>sql(`insert into store_shipping_quotes(brand_id,owner_hash,request_hash,location_id,currency,amount_cents,provider,provider_reference,verified_at,expires_at) values('${ids.brand}','${owner}','${requestHash}','${ids.location}','MXN',5000,'M62_SYNTHETIC','fixture only',clock_timestamp(),clock_timestamp()+interval '1 hour')`);
 await newQuote();const freshBody={...body,attempt:randomUUID()};
 const firstRace=await evaluate(`Promise.all([1,2].map(()=>fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:${JSON.stringify(JSON.stringify(freshBody))}}).then(async r=>({status:r.status,data:await r.json()}))))`);
 assert.ok(firstRace.every(r=>r.status===200&&r.data.order?.id),'initial concurrent HTTP creation must recover the same result');assert.equal(firstRace[0].data.order.id,firstRace[1].data.order.id);
 const expiring=firstRace[0].data.order.id;await sql(`update store_orders set expires_at=clock_timestamp()-interval '1 second' where id='${expiring}'`);
 const expire=await fetch('http://127.0.0.1:3182/api/checkout/expire',{method:'POST',headers:{authorization:'Bearer m62-fixture-expiry'}});assert.equal(expire.status,200);
 assert.equal((await request(freshBody)).data.order.status,'EXPIRED');assert.equal(await sql(`select count(*) from store_orders`),'2');assert.equal(await sql(`select reserved_quantity::int from pos_inventory where variant_id='${variant2}'`),'0');
 console.log('PASS M62 real browser/Next/PostgREST: bag, HttpOnly guest cookie, persisted attempt then lost response/reload, replay at zero stock, concurrent retry, owner/brand/payload denial, preserved snapshots/address, cancellation without resurrection, A1 resolution. Stripe transport and quote only are synthetic.');
 } finally {
 ws?.close();chrome?.kill();for(const a of apps)a.kill();
 for(const s of servers){s.closeAllConnections();await new Promise(r=>s.close(r));}
 for(const id of started.reverse()){await api('POST','/containers/'+id+'/stop?t=5');await api('DELETE','/containers/'+id);}
 }
}
