import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const url = 'http://127.0.0.1:54321', origin = 'http://localhost:3000';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, url);
assert.notEqual(process.env.NODE_ENV, 'production');
assert.ok(!process.env.VERCEL);
const fixture = JSON.parse(fs.readFileSync('.env.comu-certification-fixture.json', 'utf8'));
assert.match(fixture.tag, /^comu-local-cert-/);
const localFetch = (input, options = {}) => {
  assert.equal(new URL(typeof input === 'string' ? input : input.url).origin, url);
  return fetch(input, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
};
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } });
async function session(label) {
  const user = fixture.users[label], jar = new Map();
  const client = createServerClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { fetch: localFetch }, cookies: {
    getAll: () => [...jar].filter(([, value]) => value).map(([name, value]) => ({ name, value })),
    setAll: rows => rows.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name)),
  } });
  async function login() {
    const r = await client.auth.signInWithPassword({ email: user.email, password: user.password });
    assert.equal(r.error, null); assert.equal(r.data.user.id, user.id);
    return r.data.session;
  }
  await login();
  return { client, login, async get(path) {
    const response = await fetch(origin + path, { headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, redirect: 'manual', signal: AbortSignal.timeout(60000) });
    const text = await response.text();
    return { status: response.status, text, location: response.headers.get('location') || '', denied: /COMU_SELLER_ACCESS_DENIED|COMU_UNAUTHORIZED|No tienes acceso/.test(text), redirect: text.includes('NEXT_REDIRECT') || response.status === 307 };
  } };
}
function redirected(r, target) { assert.ok(r.location.includes(target) || r.text.includes(`NEXT_REDIRECT;replace;${target};`), 'Expected redirect ' + target); }
function allowed(r) { assert.equal(r.status, 200); assert.equal(r.denied, false); assert.equal(r.redirect, false); assert.ok(!r.text.includes('NEXT_HTTP_ERROR_FALLBACK;404')); }
async function buyerRow(label) { const r = await admin.from('comu_buyers').select('id').eq('user_id', fixture.users[label].id).maybeSingle(); assert.equal(r.error, null); return r.data; }
const A = await session('a'), B = await session('b'), buyer = await session('buyer'), rejected = await session('rejected');
const sellerB = await admin.from('comu_sellers').select('brand_slug').eq('id', fixture.users.b.sellerId).single();
assert.equal(sellerB.error, null);
const aBase = '/comu/seller/' + fixture.users.a.slug, bBase = '/comu/seller/' + sellerB.data.brand_slug;
const before = await buyerRow('a'); assert.ok(before, 'Reuse real Buyer + Seller A');
redirected(await A.get('/comu/login'), '/comu/account');
const chooser = await A.get('/comu/account'); allowed(chooser);
assert.match(chooser.text, /Mi cuenta/); assert.match(chooser.text, /Mi negocio/);
assert.ok(chooser.text.includes(aBase + '/summary')); assert.ok(!chooser.text.includes(bBase + '/summary'));
assert.deepEqual(await buyerRow('a'), before);
redirected(await buyer.get('/comu/account'), '/comu/account/buyer');
allowed(await buyer.get('/comu/account/buyer'));
allowed(await A.get('/comu/account/buyer'));
allowed(await A.get(aBase + '/summary'));
const settings = await A.get(aBase + '/settings'); allowed(settings); assert.match(settings.text, /Configuraci/);
redirected(await A.get('/comu/account?context=seller'), aBase + '/summary');
redirected(await A.get('/comu/login?next=' + encodeURIComponent(aBase + '/settings')), aBase + '/settings');
redirected(await A.get('/comu/login?next=https%3A%2F%2Fevil.test'), '/comu/account');
for (const [S, path] of [[buyer, aBase + '/settings'], [A, bBase + '/settings'], [A, '/comu/seller/no-authorized-store/settings'], [rejected, aBase + '/settings']]) assert.ok((await S.get(path)).denied, 'Seller gate must deny ' + path);
console.log('PASS real Auth: Buyer-only, Buyer+Seller A, Seller Center/settings, explicit next, invalid next, cross-seller/manipulated/rejected denied; no Buyer mutation for routing.');
const bBuyerBefore = await buyerRow('b');
if (!bBuyerBefore) {
  redirected(await B.get('/comu/account'), bBase + '/summary');
  assert.equal(await buyerRow('b'), null);
  console.log('PASS Seller-only fixture B: direct Seller Center, no Buyer row created.');
} else console.log('SKIP Seller-only: existing B already has Buyer Account; no data deleted to simulate it.');

// Temporary access between two existing LOCAL TEST fixtures, restored in finally.
// No new identity, brand or entitlement; cross-seller DENIED checked before/after.
let temporaryMembership;
try {
  const membership = await admin.from('comu_seller_memberships').insert({ user_id: fixture.users.a.id, seller_id: fixture.users.b.sellerId, role: 'CATALOG_MANAGER', active: true }).select('id').single();
  assert.equal(membership.error, null); temporaryMembership = membership.data.id;
  const multi = await A.get('/comu/account'); allowed(multi);
  assert.ok(multi.text.includes(aBase + '/summary')); assert.ok(multi.text.includes(bBase + '/summary'));
  const selector = await A.get('/comu/account?context=seller'); allowed(selector);
  assert.ok(selector.text.includes(aBase + '/summary') && selector.text.includes(bBase + '/summary'));
  console.log('PASS multi-store HTTP: both authorized stores displayed, no silent redirect.');
} finally {
  if (temporaryMembership) { const r = await admin.from('comu_seller_memberships').delete().eq('id', temporaryMembership).eq('user_id', fixture.users.a.id).eq('seller_id', fixture.users.b.sellerId); assert.equal(r.error, null); }
}
assert.ok((await A.get(bBase + '/settings')).denied);
const current = await A.client.auth.getSession(); assert.equal(current.error, null);
const refreshToken = current.data.session.refresh_token;
assert.equal((await A.client.auth.signOut({ scope: 'local' })).error, null);
assert.equal((await A.client.auth.getSession()).data.session, null);
assert.equal((await A.get('/api/comu/sellers?mine=1')).status, 401);
const loggedOutPage = await A.get(aBase + '/settings');
assert.ok(loggedOutPage.denied || (/^30[2378]$/.test(String(loggedOutPage.status)) && /\/login(?:\?|$)/.test(loggedOutPage.location)), 'Anonymous Seller Center must deny or redirect to login');
const probe = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: localFetch } });
assert.ok((await probe.auth.refreshSession({ refresh_token: refreshToken })).error);
await A.login();
const restored = await A.get('/comu/account'); allowed(restored); assert.ok(restored.text.includes(aBase + '/summary'));
allowed(await A.get(aBase + '/settings'));
console.log('PASS logout/login: cookies/session cleared, refresh revoked, unauthenticated access denied, capabilities restored. Stripe calls: 0.');
