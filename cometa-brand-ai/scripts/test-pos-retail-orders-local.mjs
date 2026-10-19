// ELEVENTA: disposable local PostgreSQL only. No remote env or credentials.
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const socketPath = '\\\\.\\pipe\\dockerDesktopLinuxEngine';
const database = 'cometa_retail_orders_' + Date.now();
const api = (method, path, body) => new Promise((resolve, reject) => {
  const req = http.request({ socketPath, method, path, headers: body ? { 'Content-Type': Buffer.isBuffer(body) ? 'application/x-tar' : 'application/json' } : {} }, res => {
    const chunks = []; res.on('data', b => chunks.push(b)); res.on('end', () => {
      const b = Buffer.concat(chunks); if (res.statusCode >= 300) reject(new Error(b.toString())); else resolve(b);
    });
  }); req.on('error', reject); req.setTimeout(60000, () => req.destroy(new Error('Docker timeout')));
  req.end(Buffer.isBuffer(body) ? body : body ? JSON.stringify(body) : undefined);
});
let container;
async function destination() {
  const c = JSON.parse((await api('GET', '/containers/' + container + '/json')).toString());
  assert.ok(c.Name.startsWith('/supabase_db_'));
  assert.ok(c.NetworkSettings.Ports['5432/tcp'].some(p => p.HostPort === '54322'));
  assert.match(database, /^cometa_retail_orders_\d+$/);
}
async function exec(args, user = 'postgres') {
  await destination();
  const e = JSON.parse((await api('POST', '/containers/' + container + '/exec', { User: user, AttachStdout: true, AttachStderr: true, Cmd: args })).toString());
  const raw = await api('POST', '/exec/' + e.Id + '/start', { Detach: false, Tty: false });
  let out = '', err = ''; for (let i = 0; i < raw.length;) { const n = raw.readUInt32BE(i + 4); const b = raw.subarray(i + 8, i + 8 + n).toString(); if (raw[i] === 2) err += b; else out += b; i += n + 8; }
  const result = JSON.parse((await api('GET', '/exec/' + e.Id + '/json')).toString());
  if (result.ExitCode) throw new Error(err || out); return out.trim();
}
async function sql(q, dbUser = 'postgres') {
  assert.ok(['postgres','supabase_admin'].includes(dbUser));
  await destination();
  // Transfer literal UTF-8 bytes as a file, never interpolate SQL into shell code.
  const name = 'm0_' + randomUUID() + '.sql', data = Buffer.from(q), header = Buffer.alloc(512);
  header.write(name); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136); header.fill(32, 148, 156); header[156] = 48;
  const sum = header.reduce((a, b) => a + b, 0); header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  const tar = Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512 + 1024)]);
  await api('PUT', '/containers/' + container + '/archive?path=/tmp', tar);
  try { return await exec(['psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', dbUser, '-d', database, '-f', '/tmp/' + name]); }
  finally { await exec(['rm', '--', '/tmp/' + name], 'root'); }
}
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
const ids=Object.fromEntries(['owner','brand','location','register','session','customer','staff','productA','productB','v1','v2','v3','v4'].map(k=>[k,randomUUID()]));
const brand='synthetic-retail-orders';let created=false;
try{
 const list=JSON.parse((await api('GET','/containers/json')).toString()).filter(c=>c.Names.some(n=>n.startsWith('/supabase_db_')));
 assert.equal(list.length,1);container=list[0].Id;await destination();
 await exec(['createdb','-U','postgres','--template=template0',database]);created=true;
 await sql('create schema extensions;create extension pgcrypto with schema extensions;create extension "uuid-ossp" with schema extensions;create extension vector with schema extensions;create extension pg_stat_statements with schema extensions;create extension supabase_vault;');
 const dump=await exec(['pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--schema=public','--schema=auth','--schema=storage']);
 await sql('drop schema public;create schema public;alter extension vector set schema public;');
 await sql(dump.replace('CREATE SCHEMA public;','').replace(/^ALTER DEFAULT PRIVILEGES[^;]+;$/gm,''));
 await sql(fs.readFileSync('supabase/migrations/20261016090000_pos_retail_operators_v1.sql','utf8'));
 await sql(fs.readFileSync('supabase/migrations/20261017120000_pos_retail_orders_v1.sql','utf8'));
 await sql(fs.readFileSync('supabase/migrations/20261017180000_pos_per_piece_discount.sql','utf8'));
 await sql(fs.readFileSync('supabase/migrations/20261018120000_pos_order_workspace.sql','utf8'));
 await sql(fs.readFileSync('supabase/migrations/20261018180000_pos_retail_open_box.sql','utf8'));
 await sql(fs.readFileSync('supabase/migrations/20261019090000_pos_retail_v1_reporting.sql','utf8'));
 console.log('PASS both migrations on disposable schema copy');
 await sql(`begin;set local session_replication_role=replica;
 insert into auth.users(id,email) values('${ids.owner}','synthetic@example.test');
 insert into brands(id,slug,name) values('${ids.brand}','${brand}','SYNTHETIC');
 insert into pos_business_profiles(brand_id,brand_slug,profile_code) values('${ids.brand}','${brand}','retail');
 insert into pos_locations(id,brand_id,brand_slug,name,code,currency,prices_include_tax) values('${ids.location}','${ids.brand}','${brand}','SYNTHETIC','TEST','MXN',true);
 insert into pos_registers(id,brand_id,brand_slug,location_id,name,code) values('${ids.register}','${ids.brand}','${brand}','${ids.location}','SYNTHETIC','TEST');
 insert into pos_cash_sessions(id,brand_id,brand_slug,location_id,register_id) values('${ids.session}','${ids.brand}','${brand}','${ids.location}','${ids.register}');
 insert into pos_customers(id,brand_id,brand_slug,first_name) values('${ids.customer}','${ids.brand}','${brand}','SYNTHETIC');
 insert into pos_staff(id,brand_id,brand_slug,name,role,pin_hash) values('${ids.staff}','${ids.brand}','${brand}','SYNTHETIC','ADMIN','not-a-login');
 insert into pos_products(id,brand_id,brand_slug,name) values('${ids.productA}','${ids.brand}','${brand}','Same name'),('${ids.productB}','${ids.brand}','${brand}','Same name');
 insert into pos_product_variants(id,brand_id,brand_slug,product_id,name,price,variant_signature) values
 ('${ids.v1}','${ids.brand}','${brand}','${ids.productA}','Negro CH',100,'1'),('${ids.v2}','${ids.brand}','${brand}','${ids.productA}','Rosa M',100,'2'),('${ids.v3}','${ids.brand}','${brand}','${ids.productA}','Azul G',100,'3'),('${ids.v4}','${ids.brand}','${brand}','${ids.productB}','Negro CH',100,'4');
 insert into pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity) select '${ids.brand}','${brand}','${ids.location}',id,1000 from pos_product_variants;
 insert into pos_retail_rules(brand_slug,wholesale_enabled,orders_enabled) values('${brand}',true,true);
 insert into pos_factory_prices(brand_slug,product_id,price) values('${brand}','${ids.productA}',70),('${brand}','${ids.productB}',60);commit;`);
 const items=values=>values.map(([v,q])=>({variant_id:ids[v],quantity:q,discount_amount:0}));
 const q=async lines=>JSON.parse(await sql(`select pos_retail_quote_v1('${brand}','${ids.location}',${quote(JSON.stringify(lines))}::jsonb)`));
 for(const quantity of [49,50,51]){const result=await q(items([['v1',quantity]]));assert.equal(result.total,quantity*(quantity>=50?70:100));}
 assert.equal((await q(items([['v1',20],['v2',15],['v3',15]]))).total,3500);
 assert.equal((await q(items([['v1',25],['v4',25]]))).total,5000);
 await assert.rejects(q(items([['v1',-1]])));await assert.rejects(q(items([['v1',1],['v1',1]])));
 console.log('PASS 49/50/51, mixed sizes/colors same parent, different parents with identical names, invalid quantities');
 const call=async(id,action,body,key=randomUUID())=>JSON.parse(await sql(`set role service_role;select pos_retail_order_action_v1('${brand}','${ids.owner}','${ids.staff}','${id}',${quote(action)},'${key}',${quote(JSON.stringify(body))}::jsonb)`));
 const orderId=randomUUID();const draft={location_id:ids.location,customer_id:ids.customer,contact:'SYNTHETIC 000',items:items([['v1',20]])};
 let result=await call(orderId,'save',draft);let order=result.order;
 assert.equal(await sql(`select count(*) from pos_payments`),'0');assert.equal(await sql(`select sum(reserved_quantity) from pos_inventory`),'0.000');
 const rules=JSON.parse(await sql(`select to_jsonb(r) from pos_retail_rules r where brand_slug='${brand}'`));
 const payBody={revision:order.revision,expected_quote:order.quote,accepted_policy:rules,cash_session_id:ids.session,amount:500,tendered:500,method:'cash'};
 const key=randomUUID();const repeated=await Promise.all([call(orderId,'activate',payBody,key),call(orderId,'activate',payBody,key)]);assert.equal(repeated[0].payment_id,repeated[1].payment_id);order=repeated[0].order;
 assert.equal(order.paid,500);assert.equal(await sql(`select reserved_quantity from pos_inventory where variant_id='${ids.v1}'`),'20.000');
 const expires=order.expires_at;
 order=(await call(orderId,'pay',{revision:order.revision,expected_quote:order.quote,cash_session_id:ids.session,amount:200,method:'card'})).order;
 assert.equal(order.expires_at,expires);
 order=(await call(orderId,'save',{...draft,revision:order.revision,items:items([['v1',30],['v2',20]])})).order;
 assert.equal(order.total,3500);assert.equal(order.expires_at,expires);
 await sql(`update pos_retail_orders set expires_at=now()-interval '1 second' where id='${orderId}'`);
 const expired=await Promise.all([sql('select pos_retail_expire_v1()'),sql('select pos_retail_expire_v1()')]);assert.equal(expired.map(Number).reduce((a,b)=>a+b),1);
 const final=JSON.parse(await sql(`select to_jsonb(o) from pos_retail_orders o where id='${orderId}'`));assert.equal(final.state,'expired');assert.equal(final.retained,500);assert.equal(final.unresolved,200);assert.equal(final.paid,700);
 assert.equal(await sql('select sum(reserved_quantity) from pos_inventory'),'0.000');assert.equal(await sql('select sum(amount) from pos_cash_movements'),'500.00');assert.equal(await sql('select count(*) from pos_retail_order_payments'),'2');
 await assert.rejects(call(orderId,'pay',{revision:final.revision,amount:100,method:'cash'}));
 assert.equal(await sql(`select has_function_privilege('anon','pos_retail_order_action_v1(text,uuid,uuid,uuid,text,uuid,jsonb)','execute')`),'f');
 console.log('PASS note without payment/stock, concurrent activation idempotency, cash/card ledger, reservation edits, fixed deadline, once-only expiry, retention and unresolved additional payments');
 const settledId=randomUUID();order=(await call(settledId,'save',draft)).order;
 order=(await call(settledId,'activate',{...payBody,revision:order.revision,expected_quote:order.quote})).order;
 const settlement={revision:order.revision,expected_quote:order.quote,cash_session_id:ids.session,amount:1500,method:'cash'};const settlementKey=randomUUID();
 const settled=await Promise.all([call(settledId,'settle',settlement,settlementKey),call(settledId,'settle',settlement,settlementKey)]);
 assert.equal(settled[0].order.sale_id,settled[1].order.sale_id);assert.equal(settled[0].order.state,'settled');assert.equal(settled[0].order.delivered_at,null);
 assert.equal(await sql(`select quantity from pos_inventory where variant_id='${ids.v1}'`),'980.000');assert.equal(await sql('select sum(reserved_quantity) from pos_inventory'),'0.000');
 assert.equal(await sql('select count(*) from pos_sales'),'1');assert.equal(await sql("select count(*) from pos_payments where payment_method='cash'"),'0');
 assert.equal(await sql("select sum(amount) from pos_cash_movements"),'2500.00','cash received once, including prior expired deposit');
 await assert.rejects(call(settledId,'convert',settlement));
 const delivered=await call(settledId,'deliver',{revision:settled[0].order.revision});assert.ok(delivered.order.delivered_at);
 console.log('PASS settlement reuses canonical sale engine, one stock deduction, one cash entry per payment, no duplicate conversion, explicit delivery');
 const factoryId=randomUUID();order=(await call(factoryId,'save',{...draft,items:items([['v1',20],['v2',15],['v3',15]])})).order;
 const converted=await call(factoryId,'convert',{revision:order.revision,expected_quote:order.quote,cash_session_id:ids.session,amount:3500,method:'card'});
 assert.equal(converted.order.state,'settled');assert.equal(await sql(`select subtotal||':'||discount_total||':'||total from pos_sales where id='${converted.order.sale_id}'`),'3500.00:0.00:3500.00');
 assert.equal(await sql(`select count(*) from pos_sale_items where sale_id='${converted.order.sale_id}' and unit_price=70 and discount_amount=0`),'3');
 assert.equal(await sql(`select price from pos_product_variants where id='${ids.v1}'`),'100.00','catalog remains unchanged');
 await sql(`update pos_factory_prices set price=60 where brand_slug='${brand}' and product_id='${ids.productA}'`);
 assert.equal(await sql(`select total from pos_sales where id='${converted.order.sale_id}'`),'3500.00','historical sale does not reprice');
 console.log('PASS factory conversion stores applied prices without duplicate discount; historical sale and catalog preserved');
 // Falling below the threshold reprices all remaining pieces; missing prices
 // never borrow another model's configuration.
 assert.equal((await q(items([['v1',49]]))).total,4900);
 await sql(`delete from pos_factory_prices where product_id='${ids.productB}'`);
 const missing=await q(items([['v4',50]]));assert.equal(missing.total,5000);assert.equal(missing.items[0].factory_missing,true);
 const discounted=await q([{variant_id:ids.v1,quantity:50,discount_amount:100}]);assert.equal(discounted.total,2900);
 const discountId=randomUUID();order=(await call(discountId,'save',{...draft,items:[{variant_id:ids.v1,quantity:50,discount_amount:100}]})).order;
 const discountSale=await call(discountId,'convert',{revision:order.revision,expected_quote:order.quote,cash_session_id:ids.session,amount:2900,method:'transfer'});
 assert.equal(await sql(`select subtotal||':'||discount_total||':'||total from pos_sales where id='${discountSale.order.sale_id}'`),'3000.00:100.00:2900.00');
 console.log('PASS falling below minimum, missing factory configuration and explicit discount applied once');
 // Two reservations compete for the same remaining stock: exactly one wins.
 await sql(`update pos_inventory set quantity=30 where variant_id='${ids.v4}'`);
 const competitors=await Promise.all([randomUUID(),randomUUID()].map(async id=>({id,order:(await call(id,'save',{...draft,items:items([['v4',20]])})).order})));
 const competing=await Promise.allSettled(competitors.map(({id,order:o})=>call(id,'activate',{...payBody,revision:o.revision,expected_quote:o.quote})));
 assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.equal(await sql(`select reserved_quantity from pos_inventory where variant_id='${ids.v4}'`),'20.000');
 const winner=competing.find(r=>r.status==='fulfilled').value.order;
 await call(winner.id,'cancel',{revision:winner.revision,reason:'Synthetic cancellation'});
 console.log('PASS concurrent reservations prevent overselling; cancellation releases once');
 // Payment waits behind an open-turn lock until after expiry. The cron skips
 // its locked order, then payment itself releases the reservation without money.
 const raceId=randomUUID();order=(await call(raceId,'save',draft)).order;
 order=(await call(raceId,'activate',{...payBody,revision:order.revision,expected_quote:order.quote})).order;
 await sql(`update pos_retail_orders set expires_at=clock_timestamp()+interval '1 second' where id='${raceId}'`);
 const beforePayments=await sql('select count(*) from pos_retail_order_payments');
 const blocker=sql(`begin;select id from pos_cash_sessions where id='${ids.session}' for update;select pg_sleep(2);commit;`);
 await new Promise(resolve=>setTimeout(resolve,200));
 const racePayment=call(raceId,'pay',{revision:order.revision,expected_quote:order.quote,cash_session_id:ids.session,amount:100,method:'cash'});
 await new Promise(resolve=>setTimeout(resolve,1100));
 await sql('select pos_retail_expire_v1()');await blocker;
 assert.equal((await racePayment).expired,true);assert.equal(await sql('select count(*) from pos_retail_order_payments'),beforePayments);
 assert.equal(await sql(`select state from pos_retail_orders where id='${raceId}'`),'expired');
 assert.equal(await sql(`select count(*) from pos_retail_order_events where order_id='${raceId}' and action='expire'`),'1');
 assert.equal(await sql('select pos_retail_expire_v1()'),'0');
 console.log('PASS payment-versus-expiry race: no late payment, one release, preserved money');
 const editRaceId=randomUUID();order=(await call(editRaceId,'save',draft)).order;
 order=(await call(editRaceId,'activate',{...payBody,revision:order.revision,expected_quote:order.quote})).order;
 await sql(`update pos_retail_orders set expires_at=clock_timestamp()+interval '1 second' where id='${editRaceId}'`);
 const inventoryBlocker=sql(`begin;select variant_id from pos_inventory where variant_id='${ids.v1}' for update;select pg_sleep(2);commit;`);
 await new Promise(resolve=>setTimeout(resolve,200));
 const editRace=call(editRaceId,'save',{...draft,revision:order.revision,items:items([['v1',21]])});
 await inventoryBlocker;assert.equal((await editRace).expired,true);
 assert.equal(await sql(`select reserved_quantity from pos_inventory where variant_id='${ids.v1}'`),'0.000');
 assert.equal(await sql(`select count(*) from pos_retail_order_events where order_id='${editRaceId}' and action='expire'`),'1');
 assert.equal(await sql('select pos_retail_expire_v1()'),'0');
 console.log('PASS edit-versus-expiry race: reversed pending delta and released original reservation once');

 // New per-piece mode: no manual factory price required, history unchanged.
 const history=await sql("select md5(string_agg(to_jsonb(s)::text,'' order by id)) from pos_sales s");
 await sql(`update pos_retail_rules set pricing_mode='per_piece_discount',per_piece_discount=10 where brand_slug='${brand}';begin;set local session_replication_role=replica;update pos_product_variants set price=150 where brand_slug='${brand}';commit;`);
 for(const quantity of [49,50,51]){const result=await q(items([['v1',quantity]]));assert.equal(result.total,quantity*(quantity>=50?140:150));assert.equal(result.subtotal,quantity*150);assert.equal(result.discount_total,quantity>=50?quantity*10:0);assert.equal(result.items[0].factory_missing,false);}
 assert.equal((await q(items([['v1',20],['v2',15],['v3',15]]))).total,7000);
 assert.equal((await q(items([['v1',25],['v4',25]]))).total,7500);
 assert.equal((await q(items([['v4',50]]))).total,7000,'missing factory price irrelevant');
 await sql(`update pos_retail_rules set combine_variants=false where brand_slug='${brand}'`);
 assert.equal((await q(items([['v1',25],['v2',25]]))).total,7500);
 await sql(`update pos_retail_rules set combine_variants=true where brand_slug='${brand}'`);
 assert.equal((await q([{variant_id:ids.v1,quantity:50,discount_amount:100}])).total,6900);
 const bulkId=randomUUID();order=(await call(bulkId,'save',{...draft,items:items([['v1',50]])})).order;
 assert.equal(order.total,7000);
 order=(await call(bulkId,'save',{...draft,revision:order.revision,items:items([['v1',49]])})).order;assert.equal(order.total,7350);
 order=(await call(bulkId,'save',{...draft,revision:order.revision,items:items([['v1',50]])})).order;
 const bulkRules=JSON.parse(await sql(`select to_jsonb(r) from pos_retail_rules r where brand_slug='${brand}'`));
 order=(await call(bulkId,'activate',{...payBody,revision:order.revision,expected_quote:order.quote,accepted_policy:bulkRules})).order;
 const bulkExpiry=order.expires_at,policy=JSON.stringify(order.policy_snapshot);
 order=(await call(bulkId,'save',{...draft,revision:order.revision,items:items([['v1',51]])})).order;assert.equal(order.total,7140);assert.equal(order.expires_at,bulkExpiry);assert.equal(JSON.stringify(order.policy_snapshot),policy);
 const bulkKey=randomUUID(),bulkBody={revision:order.revision,expected_quote:order.quote,cash_session_id:ids.session,amount:6640,method:'card'};
 const bulkSettled=await Promise.all([call(bulkId,'settle',bulkBody,bulkKey),call(bulkId,'settle',bulkBody,bulkKey)]);assert.equal(bulkSettled[0].order.sale_id,bulkSettled[1].order.sale_id);
 const bulkSale=bulkSettled[0].order.sale_id;
 assert.equal(await sql(`select subtotal||':'||discount_total||':'||total from pos_sales where id='${bulkSale}'`),'7650.00:510.00:7140.00');
 assert.equal(await sql(`select unit_price||':'||discount_amount from pos_sale_items where sale_id='${bulkSale}'`),'150.00:510.00');
 assert.equal(await sql(`select md5(string_agg(to_jsonb(s)::text,'' order by id)) from pos_sales s where id<>'${bulkSale}'`),history);
 const excessId=randomUUID();order=(await call(excessId,'save',draft)).order;
 order=(await call(excessId,'activate',{...payBody,revision:order.revision,expected_quote:order.quote,accepted_policy:bulkRules})).order;
 order=(await call(excessId,'pay',{revision:order.revision,expected_quote:order.quote,cash_session_id:ids.session,amount:200,method:'card'})).order;
 const deadline=order.expires_at,paymentCount=await sql('select count(*) from pos_retail_order_payments');
 order=(await call(excessId,'save',{...draft,revision:order.revision,reason:'Customer reduces package',items:items([['v1',3]])})).order;
 assert.equal(order.paid,700);assert.equal(order.total,450);assert.equal(order.unresolved,250);assert.equal(order.expires_at,deadline);
 assert.equal(await sql(`select reserved_quantity from pos_inventory where variant_id='${ids.v1}'`),'3.000');
 const excessKey=randomUUID(),excessBody={revision:order.revision,expected_quote:order.quote,cash_session_id:ids.session,amount:0,tendered:0,method:'cash'};
 const excessSettled=await Promise.all([call(excessId,'settle',excessBody,excessKey),call(excessId,'settle',excessBody,excessKey)]);
 assert.equal(excessSettled[0].order.sale_id,excessSettled[1].order.sale_id);assert.equal(excessSettled[0].order.unresolved,250);assert.equal(await sql('select count(*) from pos_retail_order_payments'),paymentCount);
 assert.equal(await sql(`select reserved_quantity from pos_inventory where variant_id='${ids.v1}'`),'0.000');
 console.log('PASS overpayment preserved, difference-only release, zero-payment settlement without cash or duplicate payment');
 await sql(`update pos_customers set first_name='Ángela',last_name='Muñoz' where id='${ids.customer}';insert into pos_retail_orders(brand_slug,folio,location_id,customer_id,contact,items,quote,total,created_by,staff_id) select '${brand}','N-FIND-'||lpad(n::text,3,'0'),'${ids.location}','${ids.customer}','Synthetic',o.items,o.quote,o.total,'${ids.owner}','${ids.staff}' from pos_retail_orders o cross join generate_series(1,36) n where o.id='${bulkId}';`);
 const listOrders=async(search,page=1,filter='all',scope=brand)=>JSON.parse(await sql(`set role service_role;select pos_retail_orders_list_v1('${scope}','${ids.location}',${quote(search)},'${filter}','activity',${page},25)`));
 assert.equal((await listOrders('n-find-')).total,36);assert.equal((await listOrders('n-find-',2)).orders.length,11);assert.equal((await listOrders('n-find-036')).total,1);
 assert.ok((await listOrders('ANGELA MUNOZ')).total>=36);assert.equal((await listOrders('angela',1,'all','foreign-brand')).total,0);assert.equal((await listOrders('n-find',1,'active')).total,0);
 console.log('PASS server search across pages, partial folio, case/accent folding, filters and brand isolation');

 await sql(`update pos_retail_rules set open_box=true where brand_slug='${brand}';`);
 const openRules=JSON.parse(await sql(`select to_jsonb(r) from pos_retail_rules r where brand_slug='${brand}'`));
 const emptyId=randomUUID();let box=(await call(emptyId,'save',{...draft,items:[]})).order;
 const emptyKey=randomUUID(),deposit={...payBody,method:'transfer',amount:500,tendered:500,reference:'SYNTHETIC-TRANSFER',revision:box.revision,expected_quote:box.quote,accepted_policy:openRules};
 const opened=await Promise.all([call(emptyId,'activate',deposit,emptyKey),call(emptyId,'activate',deposit,emptyKey)]);assert.equal(opened[0].payment_id,opened[1].payment_id);box=opened[0].order;
 assert.equal(box.state,'active');assert.equal(box.total,0);assert.equal(box.paid,500);assert.equal(box.available_balance,500);assert.equal(box.amount_due,0);assert.equal(box.unresolved,0);
 const expiry=box.expires_at;
 await sql(`begin;set local session_replication_role=replica;update pos_product_variants set price=278 where id='${ids.v4}';commit;`);
 box=(await call(emptyId,'save',{...draft,revision:box.revision,items:items([['v4',1]])})).order;
 assert.equal(box.total,278);assert.equal(box.available_balance,222);assert.equal(box.amount_due,0);assert.equal(box.state,'active');assert.equal(box.expires_at,expiry);
 const lowId=randomUUID();let low=(await call(lowId,'save',{...draft,items:items([['v4',1]])})).order;
 low=(await call(lowId,'activate',{...deposit,revision:low.revision,expected_quote:low.quote})).order;assert.equal(low.available_balance,222);assert.equal(low.state,'active');
 await call(lowId,'cancel',{revision:low.revision,reason:'Synthetic cancellation',balance_resolution:'pending',resolution_reason:'Administrative pending'});
 box=(await call(emptyId,'save',{...draft,revision:box.revision,items:items([['v1',20]])})).order;
 assert.equal(box.total,3000);assert.equal(box.amount_due,2500);assert.equal(box.available_balance,0);
 const abonoKey=randomUUID(),abono={revision:box.revision,expected_quote:box.quote,cash_session_id:ids.session,method:'transfer',amount:3000,tendered:3000,reference:'SYNTHETIC-ABONO'};
 const duplicateAbono=await Promise.all([call(emptyId,'pay',abono,abonoKey),call(emptyId,'pay',abono,abonoKey)]);assert.equal(duplicateAbono[0].payment_id,duplicateAbono[1].payment_id);box=duplicateAbono[0].order;
 assert.equal(box.paid,3500);assert.equal(box.available_balance,500);assert.equal(box.state,'active');assert.equal(box.expires_at,expiry);
 box=(await call(emptyId,'save',{...draft,revision:box.revision,reason:'Reduce items',items:items([['v1',1]])})).order;
 assert.equal(box.available_balance,3350);assert.equal(box.unresolved,0);assert.equal(box.state,'active');
 const close={revision:box.revision,expected_quote:box.quote,cash_session_id:ids.session,amount:0,tendered:0,method:'transfer'};
 await assert.rejects(call(emptyId,'settle',close));
 box=(await call(emptyId,'settle',{...close,balance_resolution:'pending',resolution_reason:'Administrative resolution pending'})).order;
 assert.equal(box.state,'settled');assert.equal(box.unresolved,3350);assert.equal(box.paid,3500);
 await sql(`begin;set local session_replication_role=replica;update pos_business_profiles set profile_code='restaurant' where brand_slug='${brand}';commit`);
 await assert.rejects(call(randomUUID(),'save',draft));
 await sql(`begin;set local session_replication_role=replica;update pos_business_profiles set profile_code='retail' where brand_slug='${brand}';update pos_product_variants set price=150 where id='${ids.v4}';commit;`);
 console.log('PASS Retail open box: empty/278 with deposit500, available222, products3000 due2500, duplicate overpayment, reductions, fixed expiry, explicit administrative closure, FOOD rejection');
 const expiringBoxId=randomUUID();let expiringBox=(await call(expiringBoxId,'save',{...draft,items:[]})).order;
 expiringBox=(await call(expiringBoxId,'activate',{...deposit,revision:expiringBox.revision,expected_quote:expiringBox.quote})).order;
 expiringBox=(await call(expiringBoxId,'pay',{...abono,amount:200,tendered:200,revision:expiringBox.revision,expected_quote:expiringBox.quote})).order;
 await sql(`update pos_retail_orders set expires_at=clock_timestamp()-interval '1 second' where id='${expiringBoxId}'`);
 assert.equal(await sql('select pos_retail_expire_v1()'),'1');assert.equal(await sql('select pos_retail_expire_v1()'),'0');
 const expiredBox=JSON.parse(await sql(`select to_jsonb(o) from pos_retail_orders o where id='${expiringBoxId}'`));assert.equal(expiredBox.paid,700);assert.equal(expiredBox.retained,500);assert.equal(expiredBox.unresolved,200);
 await assert.rejects(call(randomUUID(),'save',{...draft,items:items([['v4',31]])}));
 await sql(`update pos_retail_rules set wholesale_enabled=false where brand_slug='${brand}'`);
 await assert.rejects(call(randomUUID(),'save',{...draft,items:items([['v1',1.5]])}));
 await sql(`update pos_retail_rules set wholesale_enabled=true where brand_slug='${brand}'`);

 const report=JSON.parse(await sql(`set role service_role;select pos_retail_report_v1('${brand}',current_date-1,current_date+1,'${ids.location}')`));
 assert.ok(report.sales.length>0);assert.ok(report.money.length>0);assert.ok(report.inventory.length>0);
 const recorded=Number(await sql(`select coalesce(sum(amount),0) from pos_retail_order_payments where brand_slug='${brand}'`));
 assert.equal(report.money.filter(m=>m.source==='order').reduce((s,m)=>s+m.amount,0),recorded);
 assert.ok(!report.money.some(m=>m.source==='sale'&&m.sale_id===box.sale_id));
 assert.equal(report.money.filter(m=>m.order_id===expiringBoxId).reduce((s,m)=>s+m.amount,0),700);
 assert.equal(report.orders.find(o=>o.id===expiringBoxId).retained,500);
 const transfer=report.money.find(m=>m.source==='order'&&m.method==='transfer'),verificationKey=randomUUID();
 const verify=`select pos_retail_verify_transfer_v1('${brand}','${ids.owner}','${ids.staff}','order','${transfer.id}',true,'BANK-TEST','Manual fixture','${verificationKey}')`;
 assert.equal(JSON.parse(await sql(verify)).id,JSON.parse(await sql(verify)).id);
 const report2=JSON.parse(await sql(`select pos_retail_report_v1('${brand}',current_date-1,current_date+1,'${ids.location}')`));
 assert.equal(report2.money.find(m=>m.id===transfer.id).verified,true);assert.equal(report2.money.length,report.money.length);
 assert.equal(report2.sessions[0].calculated_expected,report2.sessions[0].opening_amount+report2.sessions[0].movements.filter(m=>m.method==='cash').reduce((s,m)=>s+m.amount,0));
 const datedPayment=report.money.find(m=>m.order_id===emptyId&&m.concept==='initial_deposit');assert.ok(datedPayment);
 await sql(`begin;set local session_replication_role=replica;update pos_retail_order_payments set created_at=now()-interval '7 days' where id='${datedPayment.id}';commit;`);
 const oldPeriod=JSON.parse(await sql(`select pos_retail_report_v1('${brand}',current_date-8,current_date-6,'${ids.location}')`));
 const newPeriod=JSON.parse(await sql(`select pos_retail_report_v1('${brand}',current_date-1,current_date+1,'${ids.location}')`));
 assert.ok(oldPeriod.money.some(m=>m.id===datedPayment.id));assert.ok(!oldPeriod.sales.some(s=>s.id===box.sale_id));assert.ok(newPeriod.sales.some(s=>s.id===box.sale_id));assert.ok(!newPeriod.money.some(m=>m.id===datedPayment.id));
 assert.ok(report.money.some(m=>m.method==='cash'));assert.ok(report.money.some(m=>m.method==='card'));assert.ok(report.money.some(m=>m.method==='transfer'));
 console.log('PASS receipt and sale in different periods; actual cash/card/transfer amounts retained in source ledger');
 console.log('PASS reports reconcile source payments, exclude prepaid settlement and duplicate cash movements; retention is not income; manual transfer verification idempotent; physical cash excludes transfers');
 console.log('PASS empty-box expiry retains initial500 once, additional200 unresolved; note availability and integer garments enforced');
 await sql(`begin;set local session_replication_role=replica;update pos_product_variants set price=5 where id='${ids.v1}';commit;`);assert.equal((await q(items([['v1',50]]))).total,0);await assert.rejects(q([{variant_id:ids.v1,quantity:50,discount_amount:1}]));
 await assert.rejects(sql(`update pos_retail_rules set per_piece_discount=-10 where brand_slug='${brand}'`));

 const followKey=randomUUID(),followBody={action:'create',note:'Call after package review',responsible_id:ids.staff,due_at:new Date(Date.now()+86400000).toISOString()};
 const followSql=`select pos_retail_followup_v1('${brand}','${ids.owner}','${ids.staff}','${emptyId}',${quote(JSON.stringify(followBody))}::jsonb,'${followKey}')`;
 const follow=JSON.parse(await sql(followSql));assert.equal(JSON.parse(await sql(followSql)).id,follow.id);
 const doneBody={action:'complete',id:follow.id};const doneSql=`select pos_retail_followup_v1('${brand}','${ids.owner}','${ids.staff}','${emptyId}',${quote(JSON.stringify(doneBody))}::jsonb,'${randomUUID()}')`;
 assert.equal(JSON.parse(await sql(doneSql)).completed_at,JSON.parse(await sql(doneSql)).completed_at);
 const actorSession=randomUUID();await sql(`insert into pos_staff_sessions(id,token_hash,host_user_id,staff_id,brand_id,brand_slug,expires_at) values('${actorSession}',repeat('a',64),'${ids.owner}','${ids.staff}','${ids.brand}','${brand}',now()+interval '1 hour');`);
 const cashCommand=async(action,payload,key=randomUUID())=>JSON.parse(await sql(`select pos_retail_cash_command_v1('${brand}','${ids.owner}','${actorSession}','${action}',${quote(JSON.stringify(payload))}::jsonb,'${key}')`));
 const withdrawalKey=randomUUID(),withdrawal={sessionId:ids.session,movementType:'withdrawal',amount:100,reason:'Fixture withdrawal'};
 const withdrawals=await Promise.all([cashCommand('movement',withdrawal,withdrawalKey),cashCommand('movement',withdrawal,withdrawalKey)]);assert.equal(withdrawals[0].id,withdrawals[1].id);assert.equal(withdrawals[0].performed_by_staff_id,ids.staff);

 const reverseKey=randomUUID(),reverseSql=`select pos_retail_reverse_cash_v1('${brand}','${ids.owner}','${actorSession}','${withdrawals[0].id}','${ids.session}','Wrong withdrawal fixture','${reverseKey}')`;
 const reverse=JSON.parse(await sql(reverseSql));assert.equal(JSON.parse(await sql(reverseSql)).id,reverse.id);assert.equal(reverse.amount,100);assert.equal(reverse.movement_type,'income');assert.equal(reverse.reverses_movement_id,withdrawals[0].id);
 const totals=JSON.parse(await sql(`select pos_retail_cash_totals_v1('${brand}',array['${ids.session}'::uuid])`));
 const closingKey=randomUUID(),closing={sessionId:ids.session,countedCash:totals[0].expected-5,notes:'Fixture count difference'};
 const cuts=await Promise.all([cashCommand('close',closing,closingKey),cashCommand('close',closing,closingKey)]);assert.equal(cuts[0].closed_at,cuts[1].closed_at);assert.equal(cuts[0].difference,-5);assert.equal(cuts[0].expected_cash,totals[0].expected);
 await assert.rejects(cashCommand('movement',withdrawal));
 console.log('PASS followup creation/completion idempotent; attributed cash withdrawal once; concurrent close once with expected cash and difference; closed turn immutable');
 console.log('PASS per-piece 49/50/51, model identity, combination toggle, no factory price dependency, manual discount once, editable note/layaway, repeated settlement, original prices and historical preservation, zero floor');
 await (await import('./test-pos-product-discount.mjs')).testProductDiscount({sql,q,items,call,ids,brand,quote});
}catch(error){console.error('LOCAL RETAIL NOT CERTIFIED:',error.message);process.exitCode=1;}
finally{if(created){await destination();await exec(['dropdb','-U','postgres',database]);console.log('Removed disposable database',database);}}
