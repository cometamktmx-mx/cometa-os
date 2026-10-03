// Regression for authenticated fulfillment RPC identity. No Stripe or stock writes.
// Requires running local Next/Supabase and the existing private certification users.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const url = 'http://127.0.0.1:54321', origin = 'http://localhost:3000';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, url);
assert.notEqual(process.env.NODE_ENV, 'production'); assert.ok(!process.env.VERCEL);
const fixture = JSON.parse(fs.readFileSync('.env.comu-certification-fixture.json', 'utf8'));
assert.match(fixture.tag, /^comu-local-cert-/);
const localFetch = (input, options = {}) => {
  assert.equal(new URL(typeof input === 'string' ? input : input.url).origin, url);
  return fetch(input, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
};
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } });
const checked = r => { assert.equal(r.error, null); return r.data; };
async function session(label) {
  const jar = new Map(), user = fixture.users[label];
  const auth = createServerClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { fetch: localFetch }, cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: rows => rows.forEach(r => jar.set(r.name, r.value)),
  } });
  checked(await auth.auth.signInWithPassword({ email: user.email, password: user.password }));
  return async (path, method = 'GET', body) => {
    const r = await fetch(origin + path, { method, redirect: 'error', headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    return { status: r.status, body: await r.json() };
  };
}
const A = await session('a'), B = await session('b');
const sellerId = fixture.users.a.sellerId;
const original = checked(await admin.from('comu_orders').select('id,buyer_id,reservation_id,status,fulfillment_status').eq('id', fixture.final.orderFixture.orderId).single());
const id = crypto.randomUUID(), subId = crypto.randomUUID(), key = 'LOCAL TEST fulfillment auth ' + id;
let created = false;
try {
  // Zero-value fulfillment-only fixture; no new reservation, charge, inventory or shipment.
  checked(await admin.from('comu_orders').insert({ id, buyer_id: original.buyer_id, reservation_id: original.reservation_id, idempotency_key: key, status: 'PAID' })); created = true;
  checked(await admin.from('comu_order_suborders').insert({ id: subId, order_id: id, seller_id: sellerId, fulfillment_status: 'PAID', fulfillment_route: 'HUB' }));
  const path = `/api/comu/seller/orders/${subId}/fulfillment`;
  assert.equal((await B(`/api/comu/seller/orders?sellerId=${sellerId}`)).status, 403);
  for (const claimedSeller of [sellerId, fixture.users.b.sellerId]) {
    assert.equal((await B(path, 'PATCH', { sellerId: claimedSeller, status: 'PREPARING' })).status, 403);
  }
  const visible = await A(`/api/comu/seller/orders?sellerId=${sellerId}`);
  assert.equal(visible.status, 200); assert.ok(visible.body.orders.some(row => row.id === subId));
  assert.equal((await A(path, 'PATCH', { sellerId, status: 'DELIVERED' })).status, 409);
  for (const status of ['PREPARING', 'READY_FOR_HUB']) {
    const r = await A(path, 'PATCH', { sellerId, status });
    assert.equal(r.status, 200, r.body.code || 'fulfillment failed');
    assert.equal(r.body.suborder.fulfillment_status, status);
  }
  const retry = await A(path, 'PATCH', { sellerId, status: 'READY_FOR_HUB' }); assert.equal(retry.status, 200);
  const events = checked(await admin.from('comu_fulfillment_events').select('from_status,to_status,actor_type,actor_id').eq('suborder_id', subId).order('created_at'));
  assert.deepEqual(events.map(e => [e.from_status, e.to_status]), [['PAID', 'PREPARING'], ['PREPARING', 'READY_FOR_HUB']]);
  assert.ok(events.every(e => e.actor_type === 'SELLER' && e.actor_id === fixture.users.a.id));
  console.log('PASS real HTTP: Seller A/B isolation; PAID -> PREPARING -> READY_FOR_HUB; SQL audit actor is authenticated Seller A; retry creates no duplicate events; invalid transition denied.');
} finally {
  if (created) {
    checked(await admin.from('comu_orders').delete().eq('id', id).eq('idempotency_key', key));
    const remaining = checked(await admin.from('comu_order_suborders').select('id').eq('id', subId)); assert.equal(remaining.length, 0);
    const events = checked(await admin.from('comu_fulfillment_events').select('id').eq('suborder_id', subId)); assert.equal(events.length, 0);
  }
  assert.deepEqual(checked(await admin.from('comu_orders').select('id,buyer_id,reservation_id,status,fulfillment_status').eq('id', original.id).single()), original);
  console.log('PASS cleanup: temporary order/events removed; certified order unchanged.');
}
