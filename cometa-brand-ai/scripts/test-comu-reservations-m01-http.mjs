import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as integers from '../src/lib/comu/pricing-integers.mjs';

// Real HTTP + real SQL/RPC. Only authentication, Supabase transport, cart price
// hydration and shipping transport are injected; no stock/lifecycle RPC mocks.
export async function certify({ sql, ids, quote }) {
  const json = async q => JSON.parse(await sql(q));
  const value = v => v === null ? 'null' : typeof v === 'object' ? quote(JSON.stringify(v)) + '::jsonb' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : quote(v);
  const ident = v => { assert.match(v, /^[a-z_][a-z_0-9]*$/); return v; };
  const context = new AsyncLocalStorage();
  class PosApiError extends Error { constructor(status, code, message) { super(message); Object.assign(this, { status, code }); } }
  const admin = {
    from(table) {
      ident(table); let fields = '*', filters = [], sort = '', action = 'select', payload, single = false;
      const q = {
        select(f = '*') { assert.match(f, /^[a-z_0-9,*]+$/); fields = f; return q; },
        eq(k, v) { filters.push(`${ident(k)}=${value(v)}`); return q; },
        is(k, v) { assert.equal(v, null); filters.push(`${ident(k)} is null`); return q; },
        order(k, o) { sort = ` order by ${ident(k)} ${o?.ascending === false ? 'desc' : 'asc'}`; return q; },
        maybeSingle() { single = true; return q; }, single() { single = true; return q; },
        insert(p) { action = 'insert'; payload = p; return q; }, update(p) { action = 'update'; payload = p; return q; },
        delete() { action = 'delete'; return q; },
        async then(resolve, reject) {
          try {
            const where = filters.length ? ' where ' + filters.join(' and ') : '';
            let statement = `select ${fields} from public.${table}${where}${sort}`;
            if (action === 'insert') statement = `insert into public.${table}(${Object.keys(payload).map(ident).join(',')}) values(${Object.values(payload).map(value).join(',')}) returning ${fields}`;
            if (action === 'update') statement = `update public.${table} set ${Object.entries(payload).map(([k,v]) => `${ident(k)}=${value(v)}`).join(',')}${where} returning ${fields}`;
            if (action === 'delete') statement = `delete from public.${table}${where} returning ${fields}`;
            const rows = await json(`with result as (${statement}) select coalesce(jsonb_agg(to_jsonb(result)),'[]') from result`);
            resolve({ data: single ? rows[0] || null : rows, error: null });
          } catch (e) { resolve({ data: null, error: { message: e.message } }); }
          return Promise.resolve().catch(reject);
        },
      }; return q;
    },
    async rpc(name, args) {
      assert.ok(['comu_reserve_inventory','comu_create_order_from_reservation'].includes(name));
      try { return { data: await json(`select to_jsonb(public.${name}(${Object.entries(args).map(([k,v]) => `${ident(k)}=>${value(v)}`).join(',')}))`), error: null }; }
      catch (e) { return { data: null, error: { message: e.message.match(/COMU_[A-Z_]+/)?.[0] || 'SQL_ERROR' } }; }
    },
  };
  const auth = async () => {
    const user = context.getStore();
    if (!user) throw new PosApiError(401, 'COMU_UNAUTHORIZED', 'Unauthorized');
    const buyer = await json(`select to_jsonb(b) from public.comu_buyers b join public.user_profiles p on p.user_id=b.user_id where b.user_id=${quote(user)} and p.status='active'`);
    return { buyer, admin };
  };
  const cartId = randomUUID(), addressId = randomUUID();
  await sql(`delete from public.pos_inventory where location_id='${ids.location2}';
    insert into public.comu_carts(id,buyer_id) values('${cartId}','${ids.buyer}');
    insert into public.comu_cart_items(cart_id,seller_id,listing_id,variant_listing_id,quantity) values('${cartId}','${ids.seller}','${ids.listing}','${ids.vl}',20);
    insert into public.comu_buyer_addresses(id,buyer_id,label,recipient_name,phone,line1,city,state,postal_code,country,is_default) values('${addressId}','${ids.buyer}','M01','Fixture','0000000000','Original','City','State','00000','MX',true);`);
  let hydrationCalls = 0, providerCalls = 0;
  const getOrCreateCart = async () => {
    hydrationCalls++;
    const a = await auth();
    const items = await json(`select jsonb_agg(to_jsonb(i)||jsonb_build_object('comu_variant_listings',jsonb_build_object('variant_id',v.id,'enabled',true),'pricing_snapshot',jsonb_build_object('finalUnitPrice',v.price))) from public.comu_cart_items i join public.comu_carts c on c.id=i.cart_id join public.comu_variant_listings vl on vl.id=i.variant_listing_id join public.pos_product_variants v on v.id=vl.variant_id where c.buyer_id='${a.buyer.id}'`);
    return { ...a, items: items || [] };
  };
  function load(path, imports, baseline = false) {
    const source = baseline ? execFileSync('git', ['show', `HEAD:cometa-brand-ai/${path}`], { encoding: 'utf8' }) : fs.readFileSync(path, 'utf8');
    const box = { exports: {}, URLSearchParams, Response, process: { env: { COMU_PUBLIC_PURCHASES_ENABLED: 'true' } }, require(name) { assert.ok(name in imports, name); return imports[name]; } };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, box);
    return box.exports;
  }
  const errors = { PosApiError }, buyers = { requireComuBuyer: auth, requireComuBuyerRead: auth };
  const deps = { '@/lib/pos/server': errors, './cart': { getOrCreateCart }, './buyers': buyers, 'node:crypto': { randomUUID } };
  let reservations = load('src/lib/comu/reservations.ts', deps, true);
  const money = load('src/lib/comu/pricing-money.ts', { '@/lib/pos/server': errors, './pricing-integers.mjs': integers });
  const shipping = load('src/lib/comu/shipping-pricing.ts', { './pricing-integers.mjs': integers });
  const orders = load('src/lib/comu/orders.ts', { '@/lib/pos/server': errors, './buyers': buyers, './buyer-orders': {}, './stripe': {}, './pricing-money': money, './shipping-pricing': shipping,
    './shipping-provider': { LocalTestShippingProvider: class { async quote() { providerCalls++; return [{cost:10,etaDays:2,serviceCode:'STANDARD'}]; } } } });
  const routeDeps = { 'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } }, 'node:crypto': { randomUUID }, '@/lib/pos/server': errors,
    '@/lib/comu/purchase-access': load('src/lib/comu/purchase-access.ts', {}), // Explicitly open only this isolated lifecycle fixture.
    '@/lib/comu/features': { requireComuFeature() {} }, '@/lib/comu/buyers': buyers, '@/lib/comu/orders': orders,
    '@/lib/comu/reservations': { createReservation: (...args) => reservations.createReservation(...args) } };
  const routes = { '/reservations': load('src/app/api/comu/reservations/route.ts', routeDeps), '/checkout': load('src/app/api/comu/checkout/route.ts', routeDeps) };
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    await context.run(req.headers['x-fixture-user'] || null, async () => {
      try {
        const response = await routes[req.url].POST(new Request('http://localhost' + req.url, { method:'POST', body:Buffer.concat(chunks), headers:{'content-type':'application/json'} }));
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({testError:e.message})); }
    });
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const post = async (path, body, user = ids.user) => { const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method:'POST', headers: user ? {'x-fixture-user':user} : {}, body:JSON.stringify(body) }); return {status:r.status,body:await r.json()}; };
  const stock = () => json(`select to_jsonb(i) from public.pos_inventory i where location_id='${ids.location}'`);
  try {
    const first = await post('/reservations',{idempotencyKey:'baseline'}); assert.equal(first.status,200,JSON.stringify(first));
    assert.equal((await stock()).reserved_quantity,20);
    const broken = await post('/reservations',{idempotencyKey:'baseline'}); assert.equal(broken.status,409); assert.equal(broken.body.code,'COMU_INSUFFICIENT_STOCK');
    console.log('REPRODUCED HTTP: first reserves 20/20; identical retry returns 409 COMU_INSUFFICIENT_STOCK');
    await sql(`select public.comu_release_inventory_reservation('${first.body.reservation.id}')`);
    if (process.argv.includes('--reproduce')) return;
    reservations = load('src/lib/comu/reservations.ts', deps);
    const pair = await Promise.all([post('/reservations',{idempotencyKey:'concurrent'}),post('/reservations',{idempotencyKey:'concurrent'})]);
    assert.ok(pair.every(r=>r.status===200),JSON.stringify(pair)); assert.equal(pair[0].body.reservation.id,pair[1].body.reservation.id);
    const rid = pair[0].body.reservation.id;
    const count = hydrationCalls;
    await sql(`update public.pos_product_variants set price=999 where id='${ids.variant}'`);
    const retry = await post('/reservations',{idempotencyKey:'concurrent'}); assert.equal(retry.body.reservation.id,rid); assert.equal(hydrationCalls,count);
    assert.equal((await post('/reservations',{idempotencyKey:'new-no-stock'})).body.code,'COMU_INSUFFICIENT_STOCK');
    await sql(`update public.comu_cart_items set quantity=19 where cart_id='${cartId}'`);
    assert.equal((await post('/reservations',{idempotencyKey:'concurrent'})).body.code,'COMU_IDEMPOTENCY_CONFLICT');
    await sql(`update public.comu_cart_items set quantity=20 where cart_id='${cartId}'`);
    const foreign = await post('/reservations',{idempotencyKey:'concurrent'},ids.other); assert.equal(foreign.status,409); assert.ok(!JSON.stringify(foreign).includes(rid));
    assert.equal((await post('/reservations',{idempotencyKey:'concurrent'},null)).status,401);
    const checkout = {idempotencyKey:'checkout',reservationId:rid,addressId,shippingMode:'STANDARD'};
    const op = await Promise.all([post('/checkout',checkout),post('/checkout',checkout)]);
    assert.ok(op.every(r=>r.status===200),JSON.stringify(op)); assert.equal(op[0].body.order.id,op[1].body.order.id);
    const original = op[0].body.order; assert.equal(original.subtotal,200); assert.equal(original.grand_total,210);
    assert.equal(await json(`select count(*) from public.comu_shipping_quotes where order_id='${original.id}'`),1);
    await sql(`update public.comu_buyer_addresses set line1='Changed' where id='${addressId}'`);
    const quotes = providerCalls;
    const again = await post('/checkout',checkout); assert.equal(again.status,200,JSON.stringify(again)); assert.equal(again.body.order.shipping_address_snapshot.line1,'Original'); assert.equal(again.body.order.grand_total,210); assert.equal(providerCalls,quotes);
    assert.equal((await post('/checkout',{...checkout,shippingMode:'FAST'})).body.code,'COMU_IDEMPOTENCY_CONFLICT');
    assert.equal((await post('/checkout',checkout,ids.other)).status,409);
    await sql(`select public.comu_cancel_order('${original.id}')`);
    assert.equal((await post('/checkout',checkout)).body.order.status,'CANCELLED');
    assert.equal((await post('/reservations',{idempotencyKey:'concurrent'})).body.reservation.status,'CANCELLED');
    assert.equal((await stock()).reserved_quantity,0);
    const expiry = await post('/reservations',{idempotencyKey:'expire'});
    await sql(`update public.comu_inventory_reservations set expires_at=now()-interval '1 second' where id='${expiry.body.reservation.id}';select public.comu_expire_inventory_reservations()`);
    assert.equal((await post('/reservations',{idempotencyKey:'expire'})).body.reservation.status,'EXPIRED');
    assert.equal((await stock()).reserved_quantity,0);
    await sql(`update public.comu_cart_items set seller_id='${ids.sellerB}' where cart_id='${cartId}'`);
    const wrongBrand = await post('/reservations',{idempotencyKey:'expire'});
    assert.equal(wrongBrand.body.code,'COMU_IDEMPOTENCY_CONFLICT');
    assert.ok(!JSON.stringify(wrongBrand).includes(expiry.body.reservation.id));
    await sql(`update public.comu_cart_items set seller_id='${ids.seller}' where cart_id='${cartId}'`);
    // The immediate UI consumer loses the first response after persistence.
    // React hooks/rendering and payment transport are mocked; prepareOrder is
    // the actual component function and both checkout requests reach real SQL.
    const page = fs.readFileSync('src/app/comu/checkout/page.tsx','utf8');
    const method = page.slice(page.indexOf('  async function prepareOrder()'),page.indexOf('  async function pay()'));
    let lost = true, cartReads = 0; const attempts = [];
    const box = { exports:{},crypto:{randomUUID},busyRef:{current:false},paymentLockedRef:{current:false},checkoutAttemptRef:{current:null},recovering:false,orderId:null,cartState:'ready',loading:false,loadFailed:false,showForm:false,addresses:[{id:addressId}],addressId,shippingMode:'STANDARD',shippingQuotes:[{}],
      setBusy(){},setMessage(){},setCartState(){},setReservationId(){},setOrderId(v){box.orderId=v;},setClientSecret(){},window:{history:{replaceState(){}}},
      async loadCart(){cartReads++;assert.equal((await stock()).reserved_quantity,0);return 'ready';},
      async fetch(path,options){
        if(path==='/api/comu/payments/intents')return Response.json({ok:false},{status:503});
        assert.equal(path,'/api/comu/checkout');const body=JSON.parse(options.body);attempts.push(body);
        const result=await post('/checkout',body);assert.equal(result.status,200,JSON.stringify(result));
        if(lost){lost=false;throw Error('Simulated response lost after commit');}
        return Response.json(result.body,{status:result.status});
      },
    };
    vm.runInNewContext(ts.transpileModule(method+'\nexports.prepareOrder=prepareOrder;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,box);
    await box.exports.prepareOrder();assert.equal(box.orderId,null);assert.equal((await stock()).reserved_quantity,20);
    await sql(`update public.pos_product_variants set price=1 where id='${ids.variant}'`);
    await box.exports.prepareOrder();assert.equal(cartReads,1);assert.equal(attempts.length,2);assert.equal(attempts[0].idempotencyKey,attempts[1].idempotencyKey);assert.ok(box.orderId);
    assert.equal(await json(`select subtotal from public.comu_orders where id='${box.orderId}'`),19980);
    console.log('PASS checkout consumer: lost response, same key, skips own-stock precheck, original price preserved');
    assert.equal(await json(`select count(*) from public.comu_orders where idempotency_key='checkout:order'`),1);
    console.log('PASS M0.1 HTTP + PostgreSQL: zero-stock replay, concurrent reserve/order, payload/owner conflict, snapshots, terminal states, no new effects on replay');
  } finally { await new Promise(resolve=>server.close(resolve)); }
}
