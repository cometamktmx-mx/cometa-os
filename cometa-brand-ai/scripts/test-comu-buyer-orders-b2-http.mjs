import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

export async function certifyHTTP(f) {
 let source=fs.readFileSync('scripts/test-comu-buyer-orders-b1-http.mjs','utf8');
 source=source.replace('createRequire(import.meta.url)',`createRequire(${JSON.stringify(pathToFileURL(path.resolve('package.json')).href)})`);
 source=source.replace('await f.certifyBuyer({request,users,sql,createOrder,seller});','await f.certifyVisual({request,users,sql,createOrder,seller,sellerB,workspace});');
 const harness=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 try { await harness.certifyHTTP({...f,certifyVisual}); }
 catch(error) { if(error instanceof Error && error.stack) error.stack=error.stack.split('\n').filter(line=>!line.includes('data:text/javascript')).join('\n');throw error; }
}
async function certifyVisual({request,users,sql,createOrder,seller,sellerB,workspace}) {
 const q=value=>"'"+String(value).replaceAll("'","''")+"'";
 const make=(route='HUB')=>{const o=createOrder();sql(`update public.comu_orders set subtotal=100,created_at=now(),shipping_address_snapshot='{"recipient_name":"Persona de prueba","line1":"Calle de prueba 10","city":"Ciudad de México","state":"CDMX","postal_code":"01000","country":"MX","phone":"DO_NOT_EXPOSE"}' where id='${o.o}';update public.comu_order_suborders set fulfillment_route='${route}' where id='${o.s}';insert into public.comu_order_events(order_id,event_type,actor_type) values('${o.o}','ORDER_PAID','TEST')`);return {...o,folio:JSON.parse(sql(`select to_json(order_number) from public.comu_orders where id='${o.o}'`))};};
 const transition=(id,state,actor='SELLER')=>sql(`select set_config('request.jwt.claim.sub','${users.admin.id}',false);select public.comu_transition_suborder_fulfillment_v1('${id}','${state}','${actor}',null)`);
 const hub=make(),direct=make('DIRECT'),issue=make(),delivered=make('DIRECT');
 sql(`update public.comu_sellers set public_name='Taller del Sur' where id='${seller}';update public.comu_sellers set public_name='Casa Olivo' where id='${sellerB}'`);
 sql(`update public.comu_buyers set user_id='${users.buyer.id}' where id=(select buyer_id from public.comu_orders where id='${hub.o}')`);
 const second=randomUUID();sql(`insert into public.comu_order_suborders(id,order_id,seller_id,subtotal,grand_total) values('${second}','${hub.o}','${sellerB}',100,100);update public.comu_orders set subtotal=200,grand_total=200 where id='${hub.o}';update public.comu_payment_intents set amount_cents=20000 where order_id='${hub.o}'`);
 // Persist historical product snapshots, using existing synthetic C2 reference IDs.
 const refA=JSON.parse(sql("select to_jsonb(i)||jsonb_build_object('variantName',v.name) from public.comu_order_items i join public.pos_product_variants v on v.id=i.variant_id limit 1"));
 sql(`select set_config('request.jwt.claim.sub','${users.admin.id}',false);insert into public.comu_storefronts(seller_id,name,slug,status) select '${sellerB}','Casa Olivo','o1-b','PREPARING' where not exists(select 1 from public.comu_storefronts where seller_id='${sellerB}');select set_config('request.jwt.claim.sub','${users.other.id}',false);select public.comu_catalog_save_v1('${sellerB}','${randomUUID()}','{"name":"B2 synthetic second store item","variants":[{"name":"Natural / M","sku":"B2-FIXTURE","price":100,"attributes":{}}]}')`);
 const refB=JSON.parse(sql(`select jsonb_build_object('listing_id',l.id,'product_id',l.product_id,'variant_listing_id',v.id,'variant_id',v.variant_id,'variantName',pv.name) from public.comu_product_listings l join public.comu_variant_listings v on v.listing_id=l.id join public.pos_product_variants pv on pv.id=v.variant_id where l.seller_id='${sellerB}' limit 1`));
 const add=(o,s,store,title,image=null)=>{const ref=store===seller?refA:refB,id=randomUUID(),snapshot=JSON.stringify({listingTitle:title,sellerName:store===seller?'Taller del Sur':'Casa Olivo',variant:ref.variantName,attributes:{Material:'Lino'},image});sql(`insert into public.comu_order_items(id,order_id,suborder_id,seller_id,listing_id,variant_listing_id,product_id,variant_id,quantity,unit_price,subtotal) values('${id}','${o}','${s}','${store}','${ref.listing_id}','${ref.variant_listing_id}','${ref.product_id}','${ref.variant_id}',1,100,100);insert into public.comu_order_item_snapshots(order_item_id,snapshot) values('${id}',${q(snapshot)}::jsonb)`);};
 // Test-only image, persisted in snapshot; no current catalog lookup or production asset.
 fs.writeFileSync(path.join(workspace,'public','b2-snapshot.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="220" height="260" viewBox="0 0 220 260"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="#ded4c3"/><stop offset="1" stop-color="#f1e9dc"/></linearGradient></defs><rect width="220" height="260" fill="url(#b)"/><ellipse cx="110" cy="228" rx="67" ry="8" fill="#b3a58e" opacity=".3"/><path d="m67 51 23-12c8 15 32 15 40 0l23 12 32 56-30 17-9-17 7 111H67l7-111-9 17-30-17Z" fill="#faf7ef" stroke="#c6b99e" stroke-width="2"/><path d="M90 39q20 28 40 0M110 67v140" fill="none" stroke="#d2c7b4" stroke-width="2"/></svg>');
 for(const o of [hub,direct,issue,delivered])add(o.o,o.s,seller,'Camisa de lino', '/b2-snapshot.svg');add(hub.o,second,sellerB,'Pieza de archivo sin fotografía');
 transition(hub.s,'PREPARING');transition(second,'PREPARING');for(const [state,actor] of [['READY_FOR_HUB','SELLER'],['HANDED_TO_HUB','SELLER'],['HUB_RECEIVED','HUB']])transition(hub.s,state,actor);
 for(const o of [direct,delivered]) {transition(o.s,'PREPARING');transition(o.s,'READY_TO_SHIP');sql(`insert into public.comu_shipments(master_order_id,provider,provider_shipment_id,status,tracking_number,carrier) values('${o.o}','SKYDROPX','b2-${o.o}','CREATED','COMU-TEST-TRACK','Paquetería de prueba');set role service_role;select public.comu_process_tracking_event_v1('SKYDROPX','b2-transit-${o.o}','b2-${o.o}','IN_TRANSIT','COMU-TEST-TRACK');reset role`);}
 sql(`set role service_role;select public.comu_process_tracking_event_v1('SKYDROPX','b2-out','b2-${direct.o}','OUT_FOR_DELIVERY','COMU-TEST-TRACK');select public.comu_process_tracking_event_v1('SKYDROPX','b2-delivered','b2-${delivered.o}','DELIVERED','COMU-TEST-TRACK');reset role`);
 transition(issue.s,'PREPARING');sql(`select set_config('request.jwt.claim.sub','${users.admin.id}',false);select public.comu_record_fulfillment_incident_v1('${issue.s}','OTHER','${randomUUID()}','DO_NOT_EXPOSE_ADMIN_NOTE')`);
 sql(`insert into public.comu_refunds(payment_id,master_order_id,amount_cents,currency,status,idempotency_key) values('${delivered.payment}','${delivered.o}',2500,'MXN','SUCCEEDED','B2-refund');update public.comu_orders set currency='USD' where id='${direct.o}';update public.comu_payment_intents set currency='USD' where order_id='${direct.o}'`);
 // Only the visual synthetic sample is recent; existing regression fixtures remain intact.
 sql(`update public.comu_orders set created_at=now()-interval '100 days' where id not in ('${hub.o}','${direct.o}','${issue.o}','${delivered.o}')`);
 const list=await request('/api/comu/orders?contract=b1','buyer');assert.equal(list.data.orders.length,4);
 for(const user of ['owner','other','anonymous'])assert.equal((await request('/api/comu/orders/'+direct.o,user)).status,user==='anonymous'?401:404);
 const detail=await request('/api/comu/orders/'+direct.o,'buyer');assert.equal(detail.data.order.presentationStatus,'OUT_FOR_DELIVERY');
 const listPage=await request('/comu/account/orders','buyer');assert.equal(listPage.status,200);assert.ok(listPage.data.html.includes('Mis pedidos'));
 // Compile existing Marketplace-shell reads before timing client-side interaction.
 // This changes only the local test warmup, not the UI timeout or API behavior.
 await request('/api/comu/buyer/experience','buyer');await request('/api/comu/cart','buyer');
 assert.equal((await request(`/comu/account/orders/${hub.o}?view=detail`,'buyer')).status,200);
 sql(`select public.comu_n1_emit('fulfillment',id,'PREPARING',order_id,suborder_id,null,'${users.buyer.id}','BUYER',false) from public.comu_fulfillment_events where suborder_id='${second}' and event_type='SUBORDER_PREPARING'`);
 const notificationId=JSON.parse(sql(`select to_json(id) from public.comu_notifications where order_id='${hub.o}' and suborder_id='${second}' and audience='BUYER' limit 1`));
 await browser({workspace,jar:users.buyer.jar,adminId:users.admin.id,hub,direct,issue,delivered,second,notificationId,sql,transition,request,make});
 // Restore dates for the unchanged O1 HTTP suite that follows.
 sql(`update public.comu_orders set created_at=now()`);
 console.log('B2 HTTP/Chromium PASS: real B1 list/detail; filters/search/30-90/pagination; HUB/DIRECT/unequal/consolidation/issue/refund/currency; deep-link focus; no ETA/private URL; desktop/tablet/phone; loading/error/retry/ownership');
}
async function browser({workspace,jar,adminId,hub,direct,issue,delivered,second,notificationId,sql,transition,request,make}) {
 const evidence=path.resolve('docs/evidence/comu-buyer-orders-b2');fs.mkdirSync(evidence,{recursive:true});
 const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9238','--remote-debugging-address=127.0.0.1','--user-data-dir='+path.join(workspace,'b2-browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket,seq=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let n=0;n<400;n++){if(await evaluate(expression))return;await sleep(200);}throw Error('Browser condition failed: '+expression);};
 const capture=async name=>{await sleep(300);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'horizontal overflow');const metrics=await send('Page.getLayoutMetrics');const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssLayoutViewport.clientWidth,height:Math.min(metrics.cssContentSize.height,6500),scale:1}});fs.writeFileSync(path.join(evidence,name+'.png'),Buffer.from(r.data,'base64'));};
 const navigate=async url=>{await send('Page.navigate',{url:'http://127.0.0.1:3117'+url});await wait('document.readyState==="complete"');};
 const readyList=()=>wait('document.querySelectorAll(".b2-order-card").length>0');
 const detail=async(id,extra='')=>{await navigate(`/comu/account/orders/${id}?view=detail${extra}`);await wait('document.querySelector(".b2-hero")!==null');};
 try {
  let tabs;for(let n=0;n<60;n++){try{tabs=await(await fetch('http://127.0.0.1:9238/json/list')).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await sleep(250);}
  assert.ok(tabs?.length);socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
  await send('Page.enable');await send('Network.enable');await send('Network.setCookies',{cookies:[...jar].map(([name,value])=>({name,value,url:'http://127.0.0.1:3117',path:'/',sameSite:'Lax'}))});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/comu/account/orders');await readyList();assert.equal(await evaluate('document.querySelectorAll(".b2-order-card").length'),4);await capture('buyer-orders-desktop');
  await evaluate(`[...document.querySelectorAll('.b2-tabs button')].find(b=>b.textContent==='Entregados').click()`);await wait('document.querySelectorAll(".b2-order-card").length===1');
  await evaluate(`[...document.querySelectorAll('.b2-tabs button')].find(b=>b.textContent==='Todos').click()`);await wait('document.querySelectorAll(".b2-order-card").length===4');
  await evaluate(`document.querySelector('[name="search"]').value='${hub.folio}';document.querySelector('.b2-search').requestSubmit()`);await wait('document.querySelectorAll(".b2-order-card").length===1');
  await evaluate(`document.querySelector('[name="search"]').value='NOT-FOUND';document.querySelector('.b2-search').requestSubmit()`);await wait('document.querySelector(".b2-empty")!==null');
  await detail(hub.o);assert.ok((await evaluate('document.querySelector(".b2-hub").innerText')).includes('1 de 2'));await capture('buyer-order-detail-hub-desktop');await capture('buyer-order-unequal-progress');
  await detail(hub.o,'&notificationId='+notificationId);assert.equal(await evaluate('document.activeElement.id'),'brand-'+second);
  await detail(direct.o);assert.equal(await evaluate('document.querySelector(".b2-hub")'),null);assert.ok((await evaluate('document.querySelector(".b2-hero").innerText')).includes('reparto'));assert.equal(await evaluate('document.querySelectorAll(".b2-estimate,a[target=_blank]").length'),0);assert.ok((await evaluate('document.querySelector(".b2-summary").innerText')).includes('USD'));assert.ok(await evaluate('document.querySelector(".b2-thanks").getBoundingClientRect().top > document.querySelector(".b2-summary").getBoundingClientRect().bottom'));await capture('buyer-order-detail-direct-desktop');
  await detail(delivered.o);assert.ok((await evaluate('document.querySelector(".b2-summary").innerText')).includes('Reembolso realizado'));
  await detail(issue.o);assert.equal(await evaluate('document.querySelectorAll(".b2-issues").length'),1);assert.ok(!(await evaluate('document.body.innerText')).includes('DO_NOT_EXPOSE'));await capture('buyer-order-issue');
  await send('Emulation.setDeviceMetricsOverride',{width:820,height:1180,deviceScaleFactor:1,mobile:false});await detail(hub.o);await capture('buyer-order-tablet');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await navigate('/comu/account/orders');await readyList();await capture('buyer-orders-phone');await evaluate('document.querySelector(".b2-order-card").click()');await wait('document.querySelector(".b2-hero")!==null');await detail(hub.o);await capture('buyer-order-detail-phone');
  const original=await send('Page.addScriptToEvaluateOnNewDocument',{source:`const realFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).startsWith('/api/comu/orders')){await new Promise(r=>setTimeout(r,3000));}return realFetch(...args);};`});await navigate('/comu/account/orders');await wait('document.querySelector(".b2-loading")!==null');await readyList();await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:original.identifier});
  await evaluate(`window.__realFetch=window.fetch;window.fetch=async()=>{throw Error('LOCAL_NETWORK_TEST')};`);await evaluate(`[...document.querySelectorAll('.b2-tabs button')].find(b=>b.textContent==='Con incidencia').click()`);await wait('document.querySelector("[role=alert]")!==null');assert.equal(await evaluate('document.querySelectorAll(".b2-order-card").length'),0);await evaluate(`window.fetch=window.__realFetch;document.querySelector('.b2-empty button').click()`);await readyList();
  sql(`update public.comu_orders set created_at=now()-interval '60 days' where id='${delivered.o}'`);assert.equal((await request('/api/comu/orders?contract=b1&days=30','buyer')).data.orders.length,3);assert.equal((await request('/api/comu/orders?contract=b1&days=90&pageSize=2&page=2','buyer')).data.orders.length,2);
  for(let i=0;i<5;i++)make();
  await navigate('/comu/account/orders');await readyList();await wait('document.querySelectorAll(".b2-order-card").length===8');await evaluate('document.querySelectorAll(".b2-pagination button")[1].click()');await wait('document.querySelectorAll(".b2-order-card").length===1');await evaluate('document.querySelectorAll(".b2-pagination button")[0].click()');await wait('document.querySelectorAll(".b2-order-card").length===8');
  await evaluate('document.querySelector(".b2-filters select").value="30";document.querySelector(".b2-filters select").dispatchEvent(new Event("change",{bubbles:true}))');await wait('document.querySelector(".b2-filters select").value==="30" && document.querySelectorAll(".b2-order-card").length===8');
  for(const [state,actor] of [['READY_FOR_HUB','SELLER'],['HANDED_TO_HUB','SELLER'],['HUB_RECEIVED','HUB']])transition(second,state,actor);sql(`select set_config('request.jwt.claim.sub','${adminId}',false);select public.comu_consolidate_order_v1('${hub.o}')`);await detail(hub.o);assert.ok((await evaluate('document.querySelector(".b2-hub").innerText')).includes('Ya reunimos todo tu pedido.'));await capture('buyer-order-consolidated');
  await navigate('/comu/account/orders/00000000-0000-4000-8000-000000000001?view=detail');await wait('document.querySelector("[role=alert]")!==null');assert.equal(await evaluate('document.querySelector(".b2-hero")'),null);
  fs.writeFileSync(path.join(evidence,'certification.json'),JSON.stringify({status:'PASS',source:'B1 API backed by disposable local PostgreSQL and synthetic Auth',viewports:[1440,820,390],realEmails:0,eta:null,publicTrackingUrl:null,snapshotImage:'test-only SVG persisted in order snapshot; missing image fixture also covered'},null,2)+'\n');
 } catch(error) {
  console.error('B2 synthetic browser diagnostic',await evaluate('({path:location.pathname,text:document.body.innerText.slice(0,2400)})').catch(()=>null));
  const shot=await send('Page.captureScreenshot',{format:'png'}).catch(()=>null);if(shot)fs.writeFileSync(path.join(workspace,'b2-failure.png'),Buffer.from(shot.data,'base64'));
  throw error;
 } finally {if(socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}chrome.kill();}
}
