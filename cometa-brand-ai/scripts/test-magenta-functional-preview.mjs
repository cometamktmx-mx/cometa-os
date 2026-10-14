// HTTP tests against the explicitly authorized synthetic backend and Ready Preview only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import Stripe from 'stripe';
const dir=path.resolve('.next/magenta-functional/ephmrsjnpkcgddulvckj');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json'),'utf8'));
const save=(name,value)=>fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(value),{mode:0o600});
const env=read('environment'),access=read('access'),origins=read('origins'),plan=JSON.parse(fs.readFileSync('config/magenta-preview-deployment.json','utf8'));
assert.equal(env.projectRef,'ephmrsjnpkcgddulvckj');assert.equal(env.url,'https://ephmrsjnpkcgddulvckj.supabase.co');assert.ok(env.stripeTest.startsWith('sk_test_'));
const vc=path.join(process.env.APPDATA,'npm/node_modules/vercel/dist/vc.js');
function cli(args,input){return execFileSync(process.execPath,[vc,...args,'--scope',plan.scope],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:20000000});}
const bypass={};
for(const app of ['admin','storefront']){
 const deployment=JSON.parse(cli(['inspect',origins[app],'--json']));assert.equal(deployment.target,'preview');assert.equal(deployment.readyState,'READY');assert.equal(deployment.name,plan[app].project);
 const name=app==='storefront'?'automation':'admin-automation';
 let record=fs.existsSync(path.join(dir,name+'.json'))?read(name):{secret:randomBytes(16).toString('hex'),installed:false};
 save(name,record);
 if(!record.installed){cli(['api','/v1/projects/'+plan[app].id+'/protection-bypass','--method','PATCH','--input','-','--silent'],JSON.stringify({generate:{secret:record.secret,note:'Magenta synthetic Preview HTTP tests'}}));record.installed=true;save(name,record);}
 bypass[app]=record.secret;
}
const jar=new Map();
const auth=createServerClient(env.url,env.anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}});
const signed=await auth.auth.signInWithPassword({email:access.email,password:access.password});assert.equal(signed.error,null);assert.equal(signed.data.user.id,access.actor);
let ownerCookie=fs.existsSync(path.join(dir,'buyer.json'))?read('buyer').cookie:'';
async function request(app,route,body,authenticated=true){
 const headers={'x-vercel-protection-bypass':bypass[app],origin:origins[app]};
 if(authenticated)headers.cookie=app==='admin'?[...jar].map(([n,v])=>n+'='+v).join('; '):ownerCookie;
 if(body)headers['content-type']='application/json';
 const response=await fetch(origins[app]+route,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(45000)});
 for(const cookie of response.headers.getSetCookie())if(app==='storefront'&&cookie.startsWith('store_checkout_owner=')){ownerCookie=cookie.split(';')[0];save('buyer',{cookie:ownerCookie});}
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={nonJson:true};}
 if(!response.ok){console.log(JSON.stringify({app,route,status:response.status,code:data.code,error:data.error}));throw Error('PREVIEW_HTTP_FAILED');}
 return data;
}
const db=createClient(env.url,env.service,{auth:{persistSession:false,autoRefreshToken:false}}),ids=env.fixture.ids;
async function stock(){const r=await db.from('pos_inventory').select('quantity,reserved_quantity').eq('variant_id',ids.variant).eq('location_id',ids.location).single();assert.equal(r.error,null);return r.data;}
const settings=await request('admin','/api/pos/online-store/operations?brandSlug=magenta-preview');
assert.equal(settings.payment.status,'TEST_CONFIGURED');assert.equal(settings.domain.url,origins.storefront);
console.log('PASS synthetic login, authorized POS settings, test Stripe configuration and shared backend');
if(process.argv.includes('--check')){
 for(const route of ['/','/catalogo','/productos/'+ids.product,'/bolsa','/checkout','/pedidos']){
  const response=await fetch(origins.storefront+route,{headers:{'x-vercel-protection-bypass':bypass.storefront},redirect:'manual'});assert.equal(response.status,200,route);
 }
 const denied=await fetch(origins.admin+'/api/pos/online-store/operations?brandSlug=magenta-preview',{headers:{'x-vercel-protection-bypass':bypass.admin},redirect:'manual'});assert.equal(denied.status,401);
 const wrongOrigin=await fetch(origins.storefront+'/api/checkout',{method:'POST',headers:{'x-vercel-protection-bypass':bypass.storefront,origin:'https://invalid.example'},body:JSON.stringify({action:'session'})});assert.equal(wrongOrigin.status,403);
 const forged=await fetch(origins.storefront+'/api/stripe/webhook',{method:'POST',headers:{'x-vercel-protection-bypass':bypass.storefront,'stripe-signature':'invalid'},body:'{}'});assert.equal(forged.status,400);
 const progress=read('chain');
 const own=await request('storefront','/api/checkout?order='+progress.order.id);assert.equal(own.order.id,progress.order.id);assert.equal(own.order.total_cents,30000);assert.equal(own.order.delivery_method,'PICKUP');assert.equal(own.order.items[0].quantity,3);
 assert.equal((await request('storefront','/api/checkout?order='+progress.order.id,undefined,false)).order,null);
 const detail=await request('admin','/api/pos/online-store/operations?brandSlug=magenta-preview&view=orders&order='+progress.order.id);assert.equal(detail.orders[0].id,progress.order.id);
 const notices=await request('admin','/api/pos/online-store/operations?brandSlug=magenta-preview&view=notifications');assert.ok(notices.notifications.some(n=>n.store_order_events.order_id===progress.order.id));assert.equal(new Set(notices.notifications.map(n=>n.event_id)).size,notices.notifications.length);
 const before=await stock();
 const resumed=await Promise.all([request('storefront','/api/checkout',{action:'resume',order:progress.order.id}),request('storefront','/api/checkout',{action:'resume',order:progress.order.id})]);
 assert.ok(resumed.every(r=>r.order.id===progress.order.id));assert.deepEqual(await stock(),before);
 save('http-proof',{verifiedAt:new Date().toISOString(),routes:6,unauthenticated:401,wrongOrigin:403,invalidWebhookSignature:400,ownerOnlyOrder:true,serverTotal:30000,delivery:'PICKUP',notificationCount:notices.count,concurrentResumeNoStockChange:true});
 console.log('PASS six storefront routes, anonymous POS 401, origin 403, webhook signature 400, owner-only buyer order/snapshots, persisted POS order/notices, concurrent resume without double reserve');
}
if(process.argv.includes('--purchase')){
 const cash=await request('admin','/api/pos/cash-sessions?brandSlug=magenta-preview&status=open&registerId='+ids.register);
 // Persist each mutation checkpoint so reruns never create another sale/payment attempt.
 let progress=fs.existsSync(path.join(dir,'chain.json'))?read('chain'):{};
 if(!progress.cash){
  const opened=cash.sessions.length?{session:cash.sessions[0]}:await request('admin','/api/pos/cash-sessions',{brandSlug:'magenta-preview',action:'open',registerId:ids.register,openingAmount:0});
  progress.cash=opened.session.id;save('chain',progress);
 }
 if(!progress.saleKey){progress.saleKey=randomUUID();save('chain',progress);}
 if(!progress.sale){
  const sale=await request('admin','/api/pos/sales',{brandSlug:'magenta-preview',locationId:ids.location,registerId:ids.register,cashSessionId:progress.cash,idempotencyKey:progress.saleKey,items:[{variantId:ids.variant,quantity:2,discountAmount:0}],payments:[{method:'cash',amount:200,tenderedAmount:200}],notes:'SYNTHETIC PREVIEW TEST'});
  progress.sale=sale;save('chain',progress);assert.deepEqual(await stock(),{quantity:8,reserved_quantity:0});
  console.log('PASS real Preview POS sale: same imported variant, 10 -> 8 units');
 }
 if(!progress.attempt){progress.attempt=randomUUID();save('chain',progress);}
 const contact={email:'buyer@example.test',name:'Synthetic buyer',phone:'5555555555',line1:'SYNTHETIC',line2:'',city:'TEST',state:'TEST',postalCode:'00000',country:'MX'};
 if(!progress.order){
  const checkout=await request('storefront','/api/checkout',{action:'pay',lines:[{productId:ids.product,variantId:ids.variant,quantity:3}],contact,delivery:'PICKUP',method:'STRIPE',attempt:progress.attempt});
  assert.ok(checkout.url?.startsWith('https://checkout.stripe.com/'));progress.order=checkout.order;progress.checkoutUrl=checkout.url;save('chain',progress);
  assert.deepEqual(await stock(),{quantity:8,reserved_quantity:3});console.log('PASS web order, pickup snapshot and Stripe TEST Checkout session; 3 units reserved. Payment still pending.');
 }
}
if(process.argv.includes('--verify-payment')){
 const progress=read('chain');assert.ok(progress.order?.id);
 const result=await db.from('store_orders').select('status,stripe_session_id,total_cents').eq('id',progress.order.id).single();assert.equal(result.error,null);
 const stripe=new Stripe(env.stripeTest),session=await stripe.checkout.sessions.retrieve(result.data.stripe_session_id,{expand:['payment_intent']});
 assert.equal(session.livemode,false);
 if(session.payment_status!=='paid'||session.status!=='complete'){console.log('PENDING: Stripe Checkout has not been completed; no full payment claimed.');process.exit(2);}
 assert.equal(session.payment_intent.status,'succeeded');assert.equal(result.data.status,'PAID');assert.deepEqual(await stock(),{quantity:5,reserved_quantity:0});
 const orders=await request('admin','/api/pos/online-store/operations?brandSlug=magenta-preview&view=orders&order='+progress.order.id);assert.equal(orders.orders[0].status,'PAID');
 const notices=await request('admin','/api/pos/online-store/operations?brandSlug=magenta-preview&view=notifications');assert.ok(notices.notifications.some(n=>n.store_order_events.order_id===progress.order.id));save('verified-payment',{order:progress.order.id,session:session.id,paymentStatus:session.payment_status,orders,notices,stock:await stock()});
 console.log('PASS Stripe provider test payment -> verified webhook -> PAID order in POS -> notifications queried -> inventory 5 / reserved 0');
}
fs.writeFileSync(path.join(dir,'ACCESO-PRUEBAS.txt'),`Acceso privado, solo pruebas. No publicar ni incluir en Git.\nAdministración: ${origins.admin}/login\nUsuario: ${access.email}\nContraseña: ${access.password}\nPOS: ${origins.admin}/brand/magenta-preview/pos\nTienda: ${origins.storefront}\nAtelier: /, /catalogo, /productos/${ids.product}, /bolsa, /checkout\nSi Vercel solicita acceso, iniciar sesión con tu cuenta del equipo.\n`+(fs.existsSync(path.join(dir,'chain.json'))?`Checkout de prueba pendiente: ${read('chain').checkoutUrl??'No creado'}\nUsar únicamente tarjeta test 4242 4242 4242 4242, fecha futura y CVC de prueba. Nunca tarjeta real.\n`:''),{mode:0o600});
console.log('Private access instructions saved locally; no credentials printed.');
if(fs.existsSync(path.join(dir,'chain.json'))){
 const progress=read('chain');
 fs.appendFileSync(path.join(dir,'ACCESO-PRUEBAS.txt'),`Vencimiento del pedido (UTC): ${progress.order?.expires_at??'consultar pedido'}.\nEste Checkout fue creado por el runner HTTP: la cookie privada del comprador permanece en el runner. Abrirlo en otro navegador no transfiere esa cookie. Tras pagar, confirma el pago en POS; el agente verificará también la consulta segura del comprador. Para probar todo el recorrido en tu navegador, inicia otra compra desde el catálogo de pruebas.\n`);
}
