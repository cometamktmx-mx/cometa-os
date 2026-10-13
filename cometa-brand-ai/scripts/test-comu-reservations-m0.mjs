// M0: local Docker only; creates a new database, never applies SQL to postgres.
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const socketPath = '\\\\.\\pipe\\dockerDesktopLinuxEngine';
const database = 'comu_m0_' + Date.now();
const api = (method, path, body) => new Promise((resolve, reject) => {
  const req = http.request({ socketPath, method, path, headers: body ? { 'Content-Type': Buffer.isBuffer(body) ? 'application/x-tar' : 'application/json' } : {} }, res => {
    const chunks = []; res.on('data', b => chunks.push(b)); res.on('end', () => {
      const b = Buffer.concat(chunks); if (res.statusCode >= 300) reject(new Error(b.toString())); else resolve(b);
    });
  }); req.on('error', reject); req.setTimeout(120000, () => req.destroy(new Error('Docker timeout')));
  req.end(Buffer.isBuffer(body) ? body : body ? JSON.stringify(body) : undefined);
});
let container;
async function destination() {
  const c = JSON.parse((await api('GET', '/containers/' + container + '/json')).toString());
  assert.ok(c.Name.startsWith('/supabase_db_'));
  assert.ok(c.NetworkSettings.Ports['5432/tcp'].some(p => p.HostPort === '54322'));
  assert.match(database, /^comu_m0_\d+$/);
}
async function exec(args, user = 'postgres') {
  await destination();
  const e = JSON.parse((await api('POST', '/containers/' + container + '/exec', { User: user, AttachStdout: true, AttachStderr: true, Cmd: args })).toString());
  const raw = await api('POST', '/exec/' + e.Id + '/start', { Detach: false, Tty: false });
  let out = '', err = ''; for (let i = 0; i < raw.length;) { const n = raw.readUInt32BE(i + 4); const b = raw.subarray(i + 8, i + 8 + n).toString(); if (raw[i] === 2) err += b; else out += b; i += n + 8; }
  const result = JSON.parse((await api('GET', '/exec/' + e.Id + '/json')).toString());
  if (result.ExitCode) throw new Error(err || out); return out.trim();
}
async function sql(q) {
  await destination();
  // Transfer literal UTF-8 bytes as a file, never interpolate SQL into shell code.
  const name = 'm0_' + randomUUID() + '.sql', data = Buffer.from(q), header = Buffer.alloc(512);
  header.write(name); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136); header.fill(32, 148, 156); header[156] = 48;
  const sum = header.reduce((a, b) => a + b, 0); header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  const tar = Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512 + 1024)]);
  await api('PUT', '/containers/' + container + '/archive?path=/tmp', tar);
  try { return await exec(['psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, '-f', '/tmp/' + name]); }
  finally { await exec(['rm', '--', '/tmp/' + name], 'root'); }
}
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
const scalar = async q => JSON.parse(await sql('select to_jsonb(x) from (' + q + ') x'));
const migration = 'supabase/migrations/20261010120000_comu_reservation_lifecycle_m0.sql';
const id = randomUUID;
const ids = { brand: id(), brandB: id(), location: id(), location2: id(), foreignLocation: id(), product: id(), variant: id(), seller: id(), sellerB: id(), storefront: id(), listing: id(), vl: id(), user: id(), other: id(), buyer: id(), buyerB: id(), register: id(), cash: id() };
const as = (user, q) => sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub',${quote(user)},true); ${q}; commit;`);
async function denied(fn, pattern) { await assert.rejects(fn, pattern); }
let created = false;
try {
  const list = JSON.parse((await api('GET', '/containers/json')).toString()).filter(c => c.Names.some(n => n.startsWith('/supabase_db_')));
  assert.equal(list.length, 1); container = list[0].Id;
  await destination(); console.log('TARGET 127.0.0.1:54322 / NEW DATABASE', database);
  await exec(['createdb', '-U', 'postgres', '--template=template0', database]); created = true;
  await sql('create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions; create extension vector with schema extensions; create extension pg_stat_statements with schema extensions; create extension supabase_vault;');
  const dump = await exec(['pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--no-owner', '--schema=public', '--schema=auth', '--schema=storage']);
  await sql('drop schema public; create schema public; alter extension vector set schema public;');
  await sql(dump.replace('CREATE SCHEMA public;', '').replace(/^ALTER DEFAULT PRIVILEGES[^;]+;$/gm, ''));
  console.log('Schema-only baseline SHA256', createHash('sha256').update(dump).digest('hex'));
  console.log('Final installed definitions', await sql("select proname||':'||md5(pg_get_functiondef(oid)) from pg_proc where pronamespace='public'::regnamespace and proname in ('comu_reserve_inventory','comu_create_order_from_reservation','comu_cancel_order','comu_expire_inventory_reservations','comu_release_inventory_reservation','comu_mark_payment_succeeded','pos_complete_sale_v4') order by proname"));
  // Synthetic fixtures only, in the new database. C1 setup uses the same explicit
  // fixture-only guard bypass as existing O1 suites; production migrations don't.
  await sql(`begin; set local session_replication_role=replica; insert into public.pos_units(code,name,symbol,unit_type) values('piece','Pieza','pza','count');
    insert into public.comu_financial_settings(id) values(true);
    insert into auth.users(id,email) values('${ids.user}','m0-a@example.test'),('${ids.other}','m0-b@example.test');
    insert into public.user_profiles(user_id,email,role,status) values('${ids.user}','m0-a@example.test','client','active'),('${ids.other}','m0-b@example.test','client','active');
    insert into public.brands(id,slug,name) values('${ids.brand}','m0-fixture','M0');
    insert into public.brands(id,slug,name) values('${ids.brandB}','m0-other','M0 other');
    insert into public.pos_locations(id,brand_id,brand_slug,name,code) values('${ids.location}','${ids.brand}','m0-fixture','M0','M0');
    insert into public.pos_locations(id,brand_id,brand_slug,name,code) values('${ids.location2}','${ids.brand}','m0-fixture','M0 second','M02'),('${ids.foreignLocation}','${ids.brandB}','m0-other','Other','OTHER');
    insert into public.pos_products(id,brand_id,brand_slug,name,product_type,track_inventory,active,sellable,purchasable) values('${ids.product}','${ids.brand}','m0-fixture','M0','physical',true,true,true,true);
    insert into public.pos_product_variants(id,brand_id,brand_slug,product_id,name,price,active,variant_signature) values('${ids.variant}','${ids.brand}','m0-fixture','${ids.product}','M0',10,true,'m0');
    insert into public.pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity) values('${ids.brand}','m0-fixture','${ids.location}','${ids.variant}',20);
    insert into public.pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity) values('${ids.brand}','m0-fixture','${ids.location2}','${ids.variant}',3);
    insert into public.pos_registers(id,brand_id,brand_slug,location_id,name,code,status) values('${ids.register}','${ids.brand}','m0-fixture','${ids.location}','M0','M0','available');
    insert into public.pos_cash_sessions(id,brand_id,brand_slug,location_id,register_id,status,opening_amount) values('${ids.cash}','${ids.brand}','m0-fixture','${ids.location}','${ids.register}','open',0);
    alter table public.comu_sellers disable trigger comu_c1_seller_guard;
    insert into public.comu_sellers(id,brand_id,brand_slug,public_name,slug,status,verification_status,approval_origin) values('${ids.seller}','${ids.brand}','m0-fixture','M0','m0-fixture','ACTIVE','VERIFIED','LEGACY');
    insert into public.comu_sellers(id,brand_id,brand_slug,public_name,slug,status,verification_status,approval_origin) values('${ids.sellerB}','${ids.brandB}','m0-other','Other','m0-other','ACTIVE','VERIFIED','LEGACY');
    alter table public.comu_sellers enable trigger comu_c1_seller_guard;
    insert into public.comu_storefronts(id,seller_id,name,slug,status) values('${ids.storefront}','${ids.seller}','M0','m0-fixture','ACTIVE');
    insert into public.comu_product_listings(id,seller_id,storefront_id,product_id,public_slug,status) values('${ids.listing}','${ids.seller}','${ids.storefront}','${ids.product}','m0-fixture','PUBLISHED');
    insert into public.comu_variant_listings(id,listing_id,variant_id) values('${ids.vl}','${ids.listing}','${ids.variant}');
    insert into public.comu_buyers(id,user_id) values('${ids.buyer}','${ids.user}'),('${ids.buyerB}','${ids.other}'); commit;`);
  const items = [{ seller_id: ids.seller, listing_id: ids.listing, variant_listing_id: ids.vl, variant_id: ids.variant, location_id: ids.location, quantity: 1 }];
  const reserve = async (key = id(), buyer = ids.buyer, payload = items) => JSON.parse(await sql(`select to_jsonb(public.comu_reserve_inventory('${buyer}','session',${quote(key)},${quote(JSON.stringify(payload))}::jsonb))`));
  const order = async (r, key = id(), address = {}) => JSON.parse(await sql(`select to_jsonb(public.comu_create_order_from_reservation('${r.id}',${quote(key)},${quote(JSON.stringify(address))}::jsonb,'MXN'))`));
  const stock = () => scalar(`select quantity,reserved_quantity from public.pos_inventory where variant_id='${ids.variant}' and location_id='${ids.location}'`);
  const r = await reserve('collision'), o = await order(r, 'order-collision');
  await denied(() => sql(`select public.comu_cancel_order('${o.id}')`), /COMU_RESERVATION_ALREADY_COMMITTED/);
  await sql(`update public.comu_inventory_reservations set expires_at=now()-interval '1 second' where id='${r.id}';select public.comu_expire_inventory_reservations()`);
  assert.equal((await scalar(`select status from public.comu_orders where id='${o.id}'`)).status, 'PAYMENT_PENDING');
  assert.equal((await stock()).reserved_quantity, 1);
  assert.equal((await reserve('collision', ids.buyerB)).id, r.id);
  assert.equal((await reserve('collision', ids.buyer, [{ ...items[0], quantity: 2 }])).id, r.id);
  assert.equal((await order(r, 'order-collision', { changed: true })).id, o.id);
  console.log('REPRODUCED: pending cancellation rollback; committed timeout leak; owner/payload reservation collision; order payload collision');
  const bypass = await sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${ids.user}',true);update public.comu_inventory_reservations set status='CANCELLED' where id='${r.id}' returning status;rollback;`);
  assert.ok(bypass.includes('CANCELLED'));
  assert.equal((await stock()).reserved_quantity, 1);
  console.log('REPRODUCED: owner direct UPDATE bypasses lifecycle while stock remains reserved (rolled back)');
  if (process.argv.includes('--reproduce')) { console.log('Baseline reproduction only'); }
  else {
    await sql(fs.readFileSync(migration, 'utf8'));
    console.log('M0 applied ONLY to', database);
    // Post-migration assertions are below; no mocked database.
    await sql('select public.comu_expire_inventory_reservations()');
    assert.equal((await stock()).reserved_quantity, 0);
    assert.equal((await scalar(`select status from public.comu_orders where id='${o.id}'`)).status, 'EXPIRED');
    await denied(() => reserve('collision', ids.buyerB), /COMU_IDEMPOTENCY_CONFLICT/);
    await denied(() => reserve('collision', ids.buyer, [{ ...items[0], quantity: 2 }]), /COMU_IDEMPOTENCY_CONFLICT/);
    assert.equal((await reserve('collision')).id, r.id);
    await denied(() => order(r, 'order-collision', { changed: true }), /COMU_IDEMPOTENCY_CONFLICT/);
    const c = await reserve(), co = await order(c); await sql(`select public.comu_cancel_order('${co.id}');select public.comu_cancel_order('${co.id}')`);
    assert.equal((await stock()).reserved_quantity, 0);
    console.log('PASS baseline lifecycle/idempotency regressions');
    await denied(() => as(ids.user, `update public.comu_inventory_reservations set status='ACTIVE' where id='${r.id}'`), /permission denied/);
    assert.equal((await scalar("select has_table_privilege('authenticated','public.comu_inventory_reservations','UPDATE') allowed")).allowed, false);
    // Installed grants/RLS/triggers/constraints, not assumptions from file names.
    console.log('Schema audit', await sql(`select jsonb_build_object(
      'invariant',exists(select 1 from pg_constraint where conrelid='public.pos_inventory'::regclass and conname='pos_inventory_reserved_le_quantity_check'),
      'reservationRls',(select relrowsecurity from pg_class where oid='public.comu_inventory_reservations'::regclass),
      'paymentTrigger',exists(select 1 from pg_trigger where tgrelid='public.comu_orders'::regclass and tgname='comu_commit_paid_order_inventory_v1' and tgenabled='O'),
      'directReservationUpdate',has_table_privilege('authenticated','public.comu_inventory_reservations','UPDATE'),
      'policies',(select jsonb_agg(policyname) from pg_policies where tablename in ('comu_inventory_reservations','comu_inventory_reservation_items','pos_inventory')))`));
    for (const signature of ['comu_m0_reserve_impl(uuid,text,text,jsonb)', 'comu_m0_order_impl(uuid,text,jsonb,text)', 'comu_m0_payment_impl(text,bigint,text,text,jsonb)', 'comu_m0_release(uuid,text)']) {
      assert.equal((await scalar(`select has_function_privilege('authenticated','public.${signature}','EXECUTE') allowed`)).allowed, false);
      assert.equal((await scalar(`select has_function_privilege('service_role','public.${signature}','EXECUTE') allowed`)).allowed, false);
    }
    await denied(() => sql(`set role anon;select public.comu_expire_inventory_reservations()`), /permission denied/);
    const authReserve = (user, buyer, key, payload = items) => as(user, `select public.comu_reserve_inventory('${buyer}','nonce',${quote(key)},${quote(JSON.stringify(payload))}::jsonb)`);
    await denied(() => authReserve(ids.other, ids.buyerB, 'collision'), /COMU_IDEMPOTENCY_CONFLICT/);
    await denied(() => authReserve(ids.other, ids.buyer, id()), /COMU_UNAUTHORIZED/);
    await denied(() => as(ids.other, `select public.comu_create_order_from_reservation('${r.id}','order-collision','{}','MXN')`), /COMU_RESERVATION_NOT_FOUND/);
    await denied(() => as(ids.other, `select public.comu_cancel_order('${co.id}')`), /COMU_ORDER_NOT_FOUND/);
    await denied(() => as(ids.other, `select public.comu_release_inventory_reservation('${c.id}')`), /COMU_RESERVATION_NOT_FOUND/);
    const otherReservation = await reserve(id(), ids.buyerB);
    await denied(() => as(ids.other, `select public.comu_create_order_from_reservation('${otherReservation.id}','order-collision','{}','MXN')`), /COMU_IDEMPOTENCY_CONFLICT/);
    await as(ids.other, `select public.comu_release_inventory_reservation('${otherReservation.id}')`);
    // A seller id that doesn't own the listing cannot introduce a reservation.
    await denied(() => reserve(id(), ids.buyer, [{ ...items[0], seller_id: ids.sellerB }]), /COMU_LISTING_UNAVAILABLE/);
    await denied(() => reserve(id(), ids.buyer, [{ ...items[0], location_id: ids.foreignLocation }]), /COMU_INSUFFICIENT_STOCK|COMU_INVENTORY/);
    const branch = await reserve(id(), ids.buyer, [{ ...items[0], location_id: ids.location2 }]);
    const branchStock = () => scalar(`select quantity,reserved_quantity from public.pos_inventory where variant_id='${ids.variant}' and location_id='${ids.location2}'`);
    assert.deepEqual(await branchStock(), { quantity: 3, reserved_quantity: 1 });
    const main = await reserve(); await sql(`select public.comu_release_inventory_reservation('${main.id}')`);
    assert.deepEqual(await branchStock(), { quantity: 3, reserved_quantity: 1 });
    await as(ids.user, `select public.comu_release_inventory_reservation('${branch.id}')`);
    assert.deepEqual(await branchStock(), { quantity: 3, reserved_quantity: 0 });
    const parallelKey = id();
    const same = await Promise.all([reserve(parallelKey), reserve(parallelKey)]);
    assert.equal(same[0].id, same[1].id);
    await sql(`select public.comu_release_inventory_reservation('${same[0].id}')`);
    assert.equal((await stock()).reserved_quantity, 0);
    console.log('PASS concurrent replay, cross-buyer/brand, internal function grants');
    const ownerKey = id(), ownerOrderKey = id();
    await authReserve(ids.user, ids.buyer, ownerKey);
    const ownerReservation = await reserve(ownerKey);
    const ownerOrder = await order(ownerReservation, ownerOrderKey);
    assert.equal((await order(ownerReservation, ownerOrderKey)).id, ownerOrder.id);
    await denied(() => order(ownerReservation), /COMU_IDEMPOTENCY_CONFLICT/);
    await as(ids.user, `select public.comu_cancel_order('${ownerOrder.id}');select public.comu_cancel_order('${ownerOrder.id}')`);
    assert.equal((await stock()).reserved_quantity, 0);

    const payment = async orderRow => {
      const pi = 'pi_m0_' + id();
      await sql(`insert into public.comu_payment_intents(order_id,buyer_id,stripe_payment_intent_id,amount_cents,currency,status,idempotency_key) values('${orderRow.id}','${orderRow.buyer_id}',${quote(pi)},${Math.round(Number(orderRow.grand_total) * 100)},'MXN','REQUIRES_PAYMENT',${quote(id())})`);
      return pi;
    };
    const confirmation = pi => `select public.comu_mark_payment_succeeded(${quote(pi)},1000,'MXN',${quote('evt_' + pi)},'{}')`;
    const state = orderRow => scalar(`select status from public.comu_orders where id='${orderRow.id}'`);
    const pending = async () => { const reservation = await reserve(), purchase = await order(reservation); return { reservation, purchase, pi: await payment(purchase) }; };
    const beforePaid = await stock(), paid = await pending();
    await sql(`set role service_role;${confirmation(paid.pi)};${confirmation(paid.pi)}`);
    assert.equal((await state(paid.purchase)).status, 'PAID');
    assert.deepEqual(await stock(), { quantity: beforePaid.quantity - 1, reserved_quantity: 0 });
    await sql(`update public.comu_inventory_reservations set expires_at=now()-interval '1 day' where id='${paid.reservation.id}';select public.comu_expire_inventory_reservations();select public.comu_expire_inventory_reservations()`);
    assert.deepEqual(await stock(), { quantity: beforePaid.quantity - 1, reserved_quantity: 0 });
    await denied(() => sql(`select public.comu_cancel_order('${paid.purchase.id}')`), /COMU_ORDER_NOT_CANCELLABLE/);
    assert.equal((await scalar(`select count(*)::int n from public.comu_order_events where order_id='${paid.purchase.id}' and event_type='ORDER_PAID'`)).n, 1);
    assert.equal((await scalar(`select count(*)::int n from public.comu_inventory_commit_items where order_id='${paid.purchase.id}'`)).n, 1);
    console.log('PASS repeated confirmation, paid never expired/released, one paid event and inventory commit');

    // Real sessions race. The chosen winner holds the lifecycle lock while the
    // other command starts; pg_stat_activity is the synchronization barrier.
    async function orderedRace(first, second, reservation) {
      const tag = 'm0_' + id();
      const a = sql(`set application_name=${quote(tag)};begin;select pg_advisory_xact_lock(hashtextextended('comu:m0:reservation:${reservation.id}',0));select pg_sleep(3);${first};commit;`);
      let waiting = false;
      for (let n = 0; n < 15; n++) {
        waiting = (await scalar(`select exists(select 1 from pg_stat_activity where application_name=${quote(tag)} and wait_event='PgSleep') yes`)).yes;
        if (waiting) break;
      }
      assert.ok(waiting, 'Race barrier was not reached');
      return Promise.allSettled([a, sql(second)]);
    }
    const payFirst = await pending(), s1 = await stock();
    const pr = await orderedRace(confirmation(payFirst.pi), `select public.comu_cancel_order('${payFirst.purchase.id}')`, payFirst.reservation);
    assert.equal(pr[0].status, 'fulfilled'); assert.equal(pr[1].status, 'rejected');
    assert.equal((await state(payFirst.purchase)).status, 'PAID'); assert.equal((await stock()).quantity, s1.quantity - 1);
    const cancelFirst = await pending(), s2 = await stock();
    const cr = await orderedRace(`select public.comu_cancel_order('${cancelFirst.purchase.id}')`, confirmation(cancelFirst.pi), cancelFirst.reservation);
    assert.ok(cr.every(x => x.status === 'fulfilled'));
    assert.equal((await state(cancelFirst.purchase)).status, 'CANCELLED'); assert.equal((await stock()).quantity, s2.quantity);
    assert.equal((await scalar(`select status from public.comu_payment_intents where stripe_payment_intent_id=${quote(cancelFirst.pi)}`)).status, 'PAYMENT_RECEIVED_AFTER_EXPIRY');
    const timeout = await pending(), st = await stock();
    await sql(`update public.comu_inventory_reservations set expires_at=clock_timestamp()+interval '1 second' where id='${timeout.reservation.id}'`);
    const tr = await orderedRace(confirmation(timeout.pi), 'select public.comu_expire_inventory_reservations()', timeout.reservation);
    assert.ok(tr.every(x => x.status === 'fulfilled'));
    assert.equal((await state(timeout.purchase)).status, 'EXPIRED'); assert.equal((await stock()).quantity, st.quantity);
    const expireFirst = await pending(), se = await stock();
    await sql(`update public.comu_inventory_reservations set expires_at=clock_timestamp()-interval '1 second' where id='${expireFirst.reservation.id}'`);
    const er = await orderedRace('select public.comu_expire_inventory_reservations()', confirmation(expireFirst.pi), expireFirst.reservation);
    assert.ok(er.every(x => x.status === 'fulfilled'));
    assert.equal((await state(expireFirst.purchase)).status, 'EXPIRED');
    assert.equal((await stock()).quantity, se.quantity);
    const repeated = await pending(), sr = await stock();
    const rr = await orderedRace(confirmation(repeated.pi), confirmation(repeated.pi), repeated.reservation);
    assert.ok(rr.every(x => x.status === 'fulfilled'));
    assert.equal((await stock()).quantity, sr.quantity - 1);
    assert.equal((await scalar(`select count(*)::int n from public.comu_inventory_commit_items where order_id='${repeated.purchase.id}'`)).n, 1);
    console.log('PASS payment/cancel both lock orders; deadline checked after lock wait; concurrent expiry');

    // No manual stock edits: reserve all but one unit, then contest that unit.
    const available = (await stock()).quantity;
    const hold = await reserve(id(), ids.buyer, [{ ...items[0], quantity: available - 1 }]);
    const retail = `select public.pos_complete_sale_v4('m0-fixture','${ids.location}','${ids.register}','${ids.cash}',null,${quote(JSON.stringify([{ variant_id: ids.variant, quantity: 1, discount_amount: 0 }]))}::jsonb,'[{"method":"cash","amount":10,"tendered_amount":10}]'::jsonb,'M0 last unit',null,null,'${id()}',null)`;
    const contest = await Promise.allSettled([reserve(), sql(retail)]);
    assert.equal(contest.filter(x => x.status === 'fulfilled').length, 1, JSON.stringify(contest));
    if (contest[0].status === 'fulfilled') {
      assert.match(contest[1].reason.message, /Inventario insuficiente/);
      await sql(`select public.comu_release_inventory_reservation('${contest[0].value.id}')`);
    } else assert.match(contest[0].reason.message, /COMU_INSUFFICIENT_STOCK/);
    await sql(`select public.comu_release_inventory_reservation('${hold.id}')`);
    assert.equal((await stock()).reserved_quantity, 0);
    console.log('PASS Retail vs COMU last unit with actual sale RPC');

    const beforeLate = await stock();
    const held = await reserve(id(), ids.buyer, [{ ...items[0], quantity: beforeLate.quantity - 1 }]);
    const late = await pending();
    await sql(`update public.comu_inventory_reservations set expires_at=now()-interval '1 second' where id='${late.reservation.id}';select public.comu_expire_inventory_reservations()`);
    const replacement = await order(await reserve(id(), ids.buyerB)), replacementPi = await payment(replacement);
    await sql(confirmation(replacementPi)); const consumed = await stock();
    await sql(`${confirmation(late.pi)};${confirmation(late.pi)}`);
    assert.deepEqual(await stock(), consumed);
    assert.equal((await scalar(`select status from public.comu_payment_intents where stripe_payment_intent_id=${quote(late.pi)}`)).status, 'PAYMENT_RECEIVED_AFTER_EXPIRY');
    assert.equal((await scalar(`select count(*)::int n from public.comu_inventory_commit_items where order_id='${late.purchase.id}'`)).n, 0);
    assert.equal((await scalar(`select count(*)::int n from public.comu_refunds where master_order_id='${late.purchase.id}'`)).n, 0);
    await sql(`select public.comu_release_inventory_reservation('${held.id}')`);
    assert.equal((await stock()).reserved_quantity, 0);
    console.log('PASS late payment after other buyer consumes last unit: review, no second consumption, no invented refund');
  }
} finally {
  if (created) { await destination(); await exec(['dropdb', '-U', 'postgres', '--force', database]); console.log('Dropped only disposable', database); }
}
