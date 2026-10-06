import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

export async function certifyHTTP(f) {
  let source=fs.readFileSync('scripts/test-comu-buyer-orders-b2-http.mjs','utf8');
  const call='await browser({workspace,jar:users.buyer.jar,adminId:users.admin.id,hub,direct,issue,delivered,second,notificationId,sql,transition,request,make});';
  assert.ok(source.includes(call));
  source=`import {certifyBuyerBell} from ${JSON.stringify(pathToFileURL(path.resolve('scripts/test-comu-buyer-notifications-http.mjs')).href)};\n`+source.replace(call,"await request('/api/comu/notifications?audience=BUYER','buyer');\n"+call+'\n await certifyBuyerBell({workspace,users,hub,direct,issue,delivered,second,notificationId,sql,request,seller});');
  // Preserve approved, committed B2 evidence while running all B2 regressions again.
  source=source.replace("path.resolve('docs/evidence/comu-buyer-orders-b2')","path.join(workspace,'b2-regression-evidence')");
  // The isolated gateway stands in for Supabase Kong. Browser Auth now needs its
  // CORS preflight behavior too; this does not replace Auth responses or tokens.
  const gatewayStart='gateway=createServer(async(req,res)=>{try{';
  const cors=gatewayStart+`if(req.headers.origin==='http://127.0.0.1:3117'){res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3117');res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']||'authorization,apikey,content-type,x-client-info');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}}`;
  const read="let source=fs.readFileSync('scripts/test-comu-orders-o1-http-local.mjs','utf8');";
  const patch=read+`source=source.replace(${JSON.stringify(gatewayStart)},${JSON.stringify(cors)});`;
  source=source.replace("const harness=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));",`source=source.replace(${JSON.stringify(read)},${JSON.stringify(patch)});\n const harness=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));`);
  const harness=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  await harness.certifyHTTP(f);
}

export async function certifyBuyerBell({workspace,users,hub,direct,issue,delivered,second,notificationId,sql,request,seller}) {
  const uid=users.buyer.id;
  assert.equal(Number(sql(`select count(*) from public.comu_seller_memberships where seller_id='${seller}' and user_id='${uid}'`)),0,'dual identity fixture must start without a Seller membership');
  // Actual persisted order/fulfillment events; N1 owns copy, recipient and dedup.
  sql(`select public.comu_n1_emit('order',id,'ORDER_PAID',order_id,null,null,'${uid}','BUYER',false) from public.comu_order_events where order_id='${hub.o}' and event_type='ORDER_PAID';
    select public.comu_n1_emit('fulfillment',id,case event_type when 'SUBORDER_DELIVERED' then 'DELIVERED' when 'SUBORDER_SHIPPED' then 'IN_TRANSIT' else 'ISSUE' end,order_id,suborder_id,null,'${uid}','BUYER',false) from public.comu_fulfillment_events where (order_id='${delivered.o}' and event_type='SUBORDER_DELIVERED') or (order_id='${direct.o}' and event_type='SUBORDER_SHIPPED') or (order_id='${issue.o}' and event_type='INCIDENT_RECORDED');
    insert into public.comu_seller_memberships(seller_id,user_id,role,active) values('${seller}','${uid}','ORDER_MANAGER',true) on conflict(seller_id,user_id) do update set active=true;
    select public.comu_n1_emit('order',id,'ORDER_PAID',order_id,'${hub.s}','${seller}','${uid}','SELLER',false) from public.comu_order_events where order_id='${hub.o}' and event_type='ORDER_PAID'`);
  const endpoint='/api/comu/notifications?audience=BUYER&limit=10';
  const own=await request(endpoint,'buyer');assert.equal(own.status,200);assert.match(own.headers.get('cache-control'),/private.*no-store/);assert.ok(own.data.notifications.length>=4);
  assert.ok(own.data.notifications.every(n=>n.audience==='BUYER'));
  assert.ok((await request('/api/comu/notifications?audience=SELLER','buyer')).data.unreadCount>0);
  assert.equal((await request(endpoint,'anonymous')).status,401);
  assert.equal((await request(endpoint,'other')).data.notifications.length,0);
  assert.equal((await request('/api/comu/notifications','other',{audience:'BUYER',action:'read',id:notificationId})).status,404);
  assert.equal((await request('/api/comu/notifications','buyer',{audience:'SELLER',action:'read',id:notificationId})).status,404);
  for(const secret of ['DO_NOT_EXPOSE','PRIVATE_PHONE','hub_handoff','label_url','stripe','provider_payload','shipping_address'])assert.ok(!JSON.stringify(own.data).includes(secret));
  assert.equal((await request(`/api/comu/orders/${hub.o}?notificationId=${notificationId}`,'buyer')).data.order.context.focusSuborderId,second);
  assert.equal((await request(`/api/comu/orders/${hub.o}?notificationId=${notificationId}`,'other')).status,404);
  // Warm up auth and UI routes without changing their real timeout behavior.
  await request(endpoint,'buyer');await request('/comu/account/orders','buyer');
  try { await browser({workspace,users,hub,second,notificationId,sql,request,endpoint}); }
  finally {
    // Restore this test-created capability before the unchanged O1 suite checks
    // that its Buyer-only actor has no Seller access. Never alter real memberships.
    sql(`delete from public.comu_seller_memberships where seller_id='${seller}' and user_id='${uid}'`);
  }
  console.log('Buyer Notifications HTTP/Chromium PASS: N1 Buyer audience, dual identity, cross-user, privacy, badge, read/read-all, failure/retry, empty/loading, desktop/phone, deep-link + suborder focus, navigation preserves unread');
}

async function browser({workspace,users,hub,second,notificationId,sql,request,endpoint}) {
  const evidence=path.resolve('docs/evidence/comu-buyer-notifications');fs.mkdirSync(evidence,{recursive:true});
  const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9239','--remote-debugging-address=127.0.0.1','--user-data-dir='+path.join(workspace,'buyer-notifications-browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket,seq=0;const pending=new Map();
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const wait=async expression=>{for(let n=0;n<250;n++){if(await evaluate(expression))return;await sleep(200);}throw Error('Buyer bell condition: '+expression);};
  const capture=async name=>{await sleep(300);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'horizontal overflow');const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,name+'.png'),Buffer.from(r.data,'base64'));};
  const navigate=async url=>{await send('Page.navigate',{url:'http://127.0.0.1:3117'+url});await wait('document.readyState==="complete"');};
  const panel=async()=>{await wait('document.querySelector(".buyer-notifications-trigger")!==null');await evaluate('document.querySelector(".buyer-notifications-trigger").click()');await wait('document.querySelector(".buyer-notifications-panel") && document.querySelector(".buyer-notifications-panel").getAttribute("aria-busy")==="false"');};
  try {
    let tabs;for(let n=0;n<60;n++){try{tabs=await(await fetch('http://127.0.0.1:9239/json/list')).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await sleep(250);}
    assert.ok(tabs?.length);socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.loadingFailed')console.log('Synthetic browser network',m.params.errorText,m.params.corsErrorStatus?.corsError||'');if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}});
    await send('Page.enable');await send('Network.enable');await send('Network.setCookies',{cookies:[...users.buyer.jar].map(([name,value])=>({name,value,url:'http://127.0.0.1:3117',path:'/',sameSite:'Lax'}))});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await navigate('/comu/account/orders');await wait('document.querySelector(".b2-order-card")!==null');await panel();await wait('document.querySelectorAll(".buyer-notifications-list li").length>=4');
    assert.ok((await evaluate('document.querySelector(".buyer-notifications-panel").innerText')).includes('Una parte de tu pedido fue entregada'));
    assert.ok(!(await evaluate('document.querySelector(".buyer-notifications-panel").innerText')).includes('Nuevo pedido'));
    await capture('buyer-notifications-desktop');
    const initial=(await request(endpoint,'buyer')).data.unreadCount;
    // Opening a link does not mark read: a failed navigation cannot consume unread.
    await evaluate(`document.querySelector('[data-notification-id="${notificationId}"] a').click()`);await wait(`document.activeElement.id==='brand-${second}'`);assert.equal((await request(endpoint,'buyer')).data.unreadCount,initial);await capture('buyer-notifications-deep-link');
    await panel();await evaluate(`document.querySelector('[data-notification-id="${notificationId}"] button').click()`);await wait(`document.querySelector('[data-notification-id="${notificationId}"]')?.classList.contains('is-read')`);assert.equal((await request(endpoint,'buyer')).data.unreadCount,initial-1);
    // Failed PATCH keeps the existing unread count and offers a retry.
    await evaluate(`window.__notificationFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0])==='/api/comu/notifications' && args[1]?.method==='PATCH')throw Error('LOCAL_FAILURE');return window.__notificationFetch(...args);};document.querySelector('.buyer-notifications-toolbar button').click()`);await wait('document.querySelector(".buyer-notifications-error")!==null');assert.equal((await request(endpoint,'buyer')).data.unreadCount,initial-1);await evaluate('window.fetch=window.__notificationFetch');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await navigate('/comu/account/orders');await panel();await capture('buyer-notifications-phone');
    assert.ok(await evaluate('document.querySelector(".buyer-notifications-panel").getBoundingClientRect().right<=innerWidth'));
    await evaluate('document.querySelector(".buyer-notifications-toolbar button").click()');await wait('document.querySelector(".buyer-notifications-trigger").getAttribute("aria-label").includes("0 sin leer")');assert.equal((await request(endpoint,'buyer')).data.unreadCount,0);assert.ok((await request('/api/comu/notifications?audience=SELLER','buyer')).data.unreadCount>0);
    // Slow and failed reads are local network simulations, never fixture API payloads.
    await evaluate('document.querySelector(".buyer-notifications-heading>button").click()');await evaluate(`window.__notificationFetch=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).startsWith('/api/comu/notifications?'))await new Promise(r=>setTimeout(r,1800));return window.__notificationFetch(...args);};document.querySelector('.buyer-notifications-trigger').click()`);await wait('document.querySelector(".buyer-notifications-panel").innerText.includes("Cargando")');await wait('document.querySelector(".buyer-notifications-panel").getAttribute("aria-busy")==="false"');await evaluate('window.fetch=window.__notificationFetch');
    await evaluate(`window.fetch=async()=>{throw Error('LOCAL_FAILURE')};document.querySelector('.buyer-notifications-trigger').click()`);await wait('document.querySelector(".buyer-notifications-panel")===null');await evaluate('document.querySelector(".buyer-notifications-trigger").click()');await wait('document.querySelector(".buyer-notifications-error")!==null');await evaluate('window.fetch=window.__notificationFetch;document.querySelector(".buyer-notifications-error button").click()');await wait('document.querySelector(".buyer-notifications-error")===null');
    // Empty is genuine N1 visibility, not client-side fake data.
    sql(`update public.comu_notifications set visibility='HIDDEN' where recipient_user_id='${users.buyer.id}' and audience='BUYER'`);
    await navigate('/comu/account/orders');await panel();await wait('document.querySelector(".buyer-notifications-panel").innerText.includes("Todo tranquilo")');await capture('buyer-notifications-empty');
    sql(`update public.comu_notifications set visibility='VISIBLE' where recipient_user_id='${users.buyer.id}' and audience='BUYER'`);
    // Missing/foreign order links remain protected even after a notification opens.
    assert.equal((await request(`/api/comu/orders/${hub.o}?notificationId=${notificationId}`,'other')).status,404);
    await send('Network.clearBrowserCookies');await navigate('/comu/search');await sleep(2000);assert.equal(await evaluate('document.querySelector(".buyer-notifications-trigger")'),null);
    fs.writeFileSync(path.join(evidence,'certification.json'),JSON.stringify({status:'PASS',viewports:[1440,390],source:'real N1 + B1 APIs, disposable PostgreSQL, synthetic Auth',realEmails:0,automaticReadOnNavigate:false,dualIdentity:'BUYER inbox only; SELLER unread preserved'},null,2)+'\n');
  } catch(error) {
    console.error('Buyer bell synthetic diagnostic',await evaluate('({path:location.pathname,text:document.body.innerText.slice(0,2000)})').catch(()=>null));throw error;
  } finally {if(socket?.readyState===WebSocket.OPEN){await send('Browser.close').catch(()=>{});socket.close();}chrome.kill();}
}
