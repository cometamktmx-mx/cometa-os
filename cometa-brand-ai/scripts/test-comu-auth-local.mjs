import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const sourcePrefix = execFileSync('git', ['rev-parse', '--show-prefix'], { encoding: 'utf8' }).trim();
function readSource(path) {
  // Test the checkpoint snapshot, never unrelated working-tree Auth/POS changes.
  return execFileSync('git', ['show', ':' + sourcePrefix + path], { encoding: 'utf8' });
}
function load(path, imports = {}, globals = {}) {
  const context = { exports: {}, URL, Date, console, process: { env: {} }, ...globals, require(name) { assert.ok(Object.hasOwn(imports, name), 'Unexpected import ' + name); return imports[name]; } };
  vm.runInNewContext(ts.transpileModule(readSource(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context.exports;
}
const navigation = load('src/lib/comu/auth-navigation.ts');
// Presentation-only contract: one local photo per route and stable fallback.
for (const variant of ['login', 'register']) {
  let failed = false;
  let loaded = false;
  let hook = 0;
  const visual = load('src/app/comu/components/auth-editorial.tsx', {
    'react/jsx-runtime': jsx,
    react: { useState: () => hook++ === 0 ? [failed, value => { failed = value; }] : [loaded, value => { loaded = value; }] },
    'next/image': { default: () => null },
    '../account/buyer/account-icon': { AccountIcon: () => null },
  });
  const tree = visual.ComuAuthEditorial({ variant });
  const photo = tree.props.children[0];
  assert.equal(photo.props.src, `/comu/auth/buyer-${variant}.jpg`);
  assert.equal(photo.props.fill, true);
  assert.ok(photo.props.sizes);
  photo.props.onError();
  hook = 0;
  const fallback = visual.ComuAuthEditorial({ variant });
  assert.equal(fallback.props.children[0], false);
  assert.match(renderToStaticMarkup(fallback), /Marcas locales/);
}
for (const next of ['/comu', '/comu/cart', '/comu/products/pieza', '/comu/search?q=ropa', '/comu/account?context=seller', '/comu/seller/store-a/settings', '/comu/account/buyer?section=Favoritos']) assert.equal(navigation.safeComuNext(next), next);
for (const next of ['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/comu/../../login', '/comu/%2f%2fevil.test', '/comu/%252f%252fevil.test', '/comu/account/buyer\n', '/comu/login', '/comu/register', '/comu/reset-password', '/comu/auth/confirm', '/workspace', '/brand/store/comu', '/comu/seller/finance', '/comu/seller/store-a/../../login', null]) assert.equal(navigation.safeComuNext(next), '/comu/account');
assert.equal(navigation.comuLoginHref('/comu/cart'), '/comu/login?next=%2Fcomu%2Fcart');
const publicRoutes = load('src/lib/comu/public-routes.ts');
for (const route of navigation.comuAuthPaths) assert.equal(publicRoutes.isPublicComuRoute(route), true);
assert.equal(navigation.isComuBuyerPrivatePath('/comu/account/orders/fixture'), true);
assert.equal(navigation.isComuBuyerPrivatePath('/comu/seller'), false);
assert.equal(navigation.isComuBuyerPrivatePath('/workspace'), false);

function formNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'form') return node;
  return React.Children.toArray(node.props?.children).map(formNode).find(Boolean);
}
async function flow(mode, input, options = {}) {
  const calls = [], destinations = [], states = []; let fetches = 0;
  const auth = {
    signInWithPassword: async args => { calls.push(['login', args]); return { data: { session: options.reject ? null : {} }, error: options.reject ? {} : null }; },
    signUp: async args => { calls.push(['register', args]); return { data: { session: options.session ? {} : null }, error: null }; },
    resetPasswordForEmail: async (...args) => { calls.push(['recovery', ...args]); return { error: null }; },
    exchangeCodeForSession: async code => { calls.push(['exchange', code]); return { error: options.reject ? {} : null }; },
    verifyOtp: async args => { calls.push(['verify', args]); return { error: null }; },
    getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }),
    updateUser: async args => { calls.push(['password', args]); return { error: null }; },
  };
  const component = load('src/app/comu/components/auth-form.tsx', {
    'react/jsx-runtime': jsx, react: { useRef: value => ({ current: value }), useState: value => [value, next => states.push(next)] },
    'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
    './auth-editorial': { ComuAuthEditorial: () => null },
      '@/lib/supabase/client': { createClient: () => ({ auth }) }, '@/lib/comu/auth-navigation': navigation,
  }, { FormData: class { constructor(data) { this.data = data; } get(key) { return this.data[key] ?? null; } },
    window: { location: { origin: 'https://fixture.invalid', assign: path => destinations.push(path) }, history: { replaceState() {} } },
    fetch: async url => { assert.equal(url, '/api/comu/buyer/experience'); fetches++; return { ok: true, json: async () => ({ ok: true }) }; },
  });
  const tree = component.ComuAuthForm({ mode, next: options.next || '/comu/cart', code: options.code, tokenHash: options.tokenHash });
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /COMETA|Business Operating|Tu negocio\. Un solo/);
  assert.equal(calls.length, 0, 'Rendering never sends auth requests or consumes tokens');
  await formNode(tree).props.onSubmit({ preventDefault() {}, currentTarget: input });
  return { calls, destinations, states, fetches };
}
const login = await flow('login', { email: ' Buyer@Example.test ', password: 'fixture-password' });
assert.equal(login.calls[0][0], 'login'); assert.equal(login.calls[0][1].email, 'buyer@example.test');
assert.deepEqual(login.destinations, ['/comu/cart']); assert.equal(login.fetches, 0);
const rejected = await flow('login', { email: 'buyer@example.test', password: 'wrong' }, { reject: true });
assert.equal(rejected.destinations.length, 0); assert.equal(rejected.fetches, 0);
const registration = { fullName: 'Fixture Buyer', email: ' BUYER@example.test ', phone: '+52 5551234567', password: 'fixture-password', confirmation: 'fixture-password', terms: 'on' };
const pending = await flow('register', registration);
assert.equal(pending.calls[0][0], 'register'); assert.equal(pending.fetches, 0); assert.equal(pending.destinations.length, 0); assert.ok(pending.states.includes(true));
assert.equal(pending.calls[0][1].options.data.full_name, 'Fixture Buyer');
assert.equal(pending.calls[0][1].options.data.password, undefined);
assert.match(pending.calls[0][1].options.emailRedirectTo, /^https:\/\/fixture.invalid\/comu\/auth\/confirm\?next=/);
const immediate = await flow('register', registration, { session: true, next: 'https://evil.test' });
assert.deepEqual(immediate.destinations, ['/comu/account']); assert.equal(immediate.fetches, 1);
for (const invalid of [{ ...registration, terms: null }, { ...registration, confirmation: 'different' }, { ...registration, phone: 'invalid' }]) assert.equal((await flow('register', invalid)).calls.length, 0);
const recovery = await flow('recovery', { email: 'buyer@example.test' });
assert.equal(recovery.calls[0][0], 'recovery'); assert.match(recovery.calls[0][2].redirectTo, /\/comu\/reset-password\?next=/);
const confirmation = await flow('confirm', {}, { code: 'fixture-code' });
assert.equal(confirmation.calls[0][0], 'exchange'); assert.equal(confirmation.fetches, 0);
const invalidConfirmation = await flow('confirm', {}, { code: 'expired', reject: true }); assert.equal(invalidConfirmation.fetches, 0);
const reset = await flow('reset', { password: 'new-fixture-password', confirmation: 'new-fixture-password' }, { tokenHash: 'fixture-hash' });
assert.equal(reset.calls[0][1].type, 'recovery'); assert.equal(reset.calls[1][0], 'password');

let user = { id: 'auth-user', user_metadata: { comu_registration: true, full_name: 'Initial', comu_phone: '5551234567', role: 'admin' } }, buyerRow;
class PosApiError extends Error { constructor(status) { super(); this.status = status; } }
const buyers = load('src/lib/comu/buyers.ts', {
  '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) },
  './auth-navigation': navigation,
  './seller-access': { requireComuActor: async () => { throw new Error('Read path must be tested separately'); } },
  '@/lib/pos/server': { PosApiError, getAdminClient: () => ({ from(table) { assert.equal(table, 'comu_buyers'); return {
    upsert: async (row, options) => { assert.equal(options.onConflict, 'user_id'); assert.equal(options.ignoreDuplicates, true); buyerRow ||= { id: 'buyer-id', ...row }; return { error: null }; },
    select: () => ({ eq: (key, value) => { assert.equal(key, 'user_id'); assert.equal(value, user.id); return { single: async () => ({ data: buyerRow, error: null }) }; } }),
  }; } }) },
});
await buyers.requireComuBuyer(); assert.equal(buyerRow.display_name, 'Initial'); assert.equal(buyerRow.role, undefined);
buyerRow.display_name = 'Edited'; await buyers.requireComuBuyer(); assert.equal(buyerRow.display_name, 'Edited');
user = null; await assert.rejects(() => buyers.requireComuBuyer(), error => error.status === 401);
let sessionUser = null;
const entry = load('src/app/comu/components/auth-entry.tsx', { 'react/jsx-runtime': jsx, 'next/navigation': { redirect(path) { throw new Error('REDIRECT:' + path); } }, '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }) }, '@/lib/comu/auth-navigation': navigation, './auth-form': { ComuAuthForm: () => null } });
assert.ok(await entry.ComuAuthEntry({ mode: 'login', searchParams: Promise.resolve({}) }));
sessionUser = { id: 'fixture' };
for (const mode of ['login', 'register']) await assert.rejects(() => entry.ComuAuthEntry({ mode, searchParams: Promise.resolve({ next: '/comu/cart' }) }), /REDIRECT:\/comu\/cart/);

let proxyUser = null, corporateCalls = 0;
const response = () => ({ headers: new Headers(), cookies: { getAll: () => [], set() {} } });
const proxy = load('src/proxy.ts', {
  'next/server': { NextResponse: { next: response, redirect: url => ({ ...response(), destination: String(url) }) } },
  '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: proxyUser }, error: null }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) },
  './lib/supabase/middleware': { copySupabaseCookies: (source, target) => target, updateSession: async () => { corporateCalls++; return { corporate: true }; } },
  './lib/auth/safe-next': { safeInternalNext: () => '/workspace' },
  './lib/pos/navigation': { posReturnTo: () => '' },
  './lib/pos/admin-access': { requirePosPageAccess() { assert.fail('Not a POS test'); } },
  './lib/pos/server': { PosApiError }, './lib/comu/public-routes': publicRoutes, './lib/comu/auth-navigation': navigation,
}, { Headers, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture' } }, console: { log() {}, warn() {} } });
const request = path => ({ url: 'https://fixture.invalid' + path, nextUrl: new URL('https://fixture.invalid' + path), cookies: { getAll: () => [], set() {} } });
assert.equal((await proxy.proxy(request('/comu/account/buyer?section=Favoritos'))).destination, 'https://fixture.invalid/comu/login?next=%2Fcomu%2Faccount%2Fbuyer%3Fsection%3DFavoritos');
assert.equal(corporateCalls, 0);
proxyUser = { id: 'fixture' }; assert.equal((await proxy.proxy(request('/comu/account/buyer'))).headers.get('Cache-Control'), 'private, no-store');
assert.equal((await proxy.proxy(request('/login'))).corporate, true);
assert.equal((await proxy.proxy(request('/workspace'))).corporate, true);
assert.equal((await proxy.proxy(request('/comu/seller'))).corporate, true);
assert.equal(corporateCalls, 3);

let authPath = '/comu/login';
const boundary = load('src/app/comu/components/auth-boundary.tsx', { 'react/jsx-runtime': jsx, 'next/navigation': { usePathname: () => authPath }, '@/lib/comu/auth-navigation': navigation });
assert.doesNotMatch(renderToStaticMarkup(boundary.ComuAuthBoundary({ children: 'Powered by COMETA', authContent: 'COMU login' })), /COMETA/);
authPath = '/comu'; assert.equal(boundary.ComuAuthBoundary({ children: 'Existing marketplace', authContent: 'COMU login' }), 'Existing marketplace');

const prefix = execFileSync('git', ['rev-parse', '--show-prefix'], { encoding: 'utf8' }).trim();
for (const path of ['src/app/login/page.tsx', 'src/app/signup/page.tsx', 'src/app/forgot-password/page.tsx', 'src/app/reset-password/page.tsx', 'src/app/auth/confirm/route.ts', 'src/app/auth/callback/route.ts', 'src/lib/supabase/middleware.ts', 'src/app/comu/sell/application-form.tsx']) {
  assert.equal(readSource(path).replaceAll('\r\n', '\n'), execFileSync('git', ['show', 'HEAD:' + prefix + path], { encoding: 'utf8' }).replaceAll('\r\n', '\n'), 'Corporate/seller path unchanged: ' + path);
}
for (const path of ['src/app/comu/cart/page.tsx', 'src/app/comu/components/commerce.tsx', 'src/app/comu/products/[slug]/add-to-cart.tsx', 'src/app/comu/account/buyer/buyer-account.tsx']) assert.doesNotMatch(readSource(path), /["\x60]\/login\?next=/);
assert.equal(navigation.safeComuNext(), '/comu/account');
const chooser = readSource('src/app/comu/account/page.tsx');
assert.match(chooser, /\/comu\/login\?next=%2Fcomu%2Faccount(?:%2Fbuyer|%3Fcontext%3Dbuyer)/);
assert.match(chooser, /resolveComuAccountAccess/);
assert.doesNotMatch(chooser, /\/brand\/\$\{/);
assert.doesNotMatch(readSource('src/app/comu/components/auth-form.tsx'), /localStorage|sessionStorage|\.from\(/);
console.log('PASS COMU auth: safe next, provider login/signup/recovery, confirmation vs immediate session, idempotent Buyer identity, no parallel passwords, COMU Buyer entries, existing-session redirect and unchanged corporate/seller auth. External calls: 0.');

// B1 read identity remains separate from explicit provisioning. Read-only adapter:
// no upsert/insert/update method exists, so accidental provisioning fails this test.
let readUser = { id: 'owner' }, actorId = 'owner', readRow = null, lookupError = null;
const readAdmin = { from(table) { assert.equal(table, 'comu_buyers'); return { select(columns) {
  assert.equal(columns, 'id,user_id,display_name,phone'); return { eq(key, value) {
    assert.equal(key, 'user_id'); assert.equal(value, actorId);
    return { maybeSingle: async () => ({ data: readRow, error: lookupError }) };
  } };
} }; } };
const readOnlyBuyers = load('src/lib/comu/buyers.ts', {
  '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: readUser }, error: null }) } }) },
  '@/lib/pos/server': { PosApiError, getAdminClient() { assert.fail('Read must use authorized actor'); } },
  './auth-navigation': navigation,
  './seller-access': { requireComuActor: async () => ({ userId: actorId, admin: readAdmin }) },
});
assert.equal((await readOnlyBuyers.readComuBuyerAccount()).buyer, null);
await assert.rejects(() => readOnlyBuyers.requireComuBuyerRead(), e => e.status === 404);
readRow = { id: 'buyer', user_id: 'owner', display_name: 'Preserved' };
assert.equal((await readOnlyBuyers.requireComuBuyerRead()).userId, 'owner');
lookupError = {}; await assert.rejects(() => readOnlyBuyers.readComuBuyerAccount(), e => e.status === 503); lookupError = null;
actorId = 'another'; await assert.rejects(() => readOnlyBuyers.readComuBuyerAccount(), e => e.status === 401); actorId = 'owner';
readUser = null; await assert.rejects(() => readOnlyBuyers.readComuBuyerAccount(), e => e.status === 401);
let capabilities;
const account = load('src/app/comu/account/page.tsx', {
  'react/jsx-runtime': jsx,
  'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
  'next/navigation': { redirect(path) { throw new Error('REDIRECT:' + path); } },
  '@/lib/comu/account-access': { resolveComuAccountAccess: async () => capabilities },
});
const accountPage = context => account.default({ searchParams: Promise.resolve({ context }) });
capabilities = { userId: 'buyer', hasBuyerAccount: true, isAdmin: false, stores: [] };
await assert.rejects(() => accountPage(), /REDIRECT:\/comu\/account\/buyer/);
const store = { id: 's1', brand_slug: 'authorized', public_name: 'Authorized', status: 'ACTIVE' };
capabilities = { ...capabilities, hasBuyerAccount: false, stores: [store] };
await assert.rejects(() => accountPage(), /REDIRECT:\/comu\/seller\/authorized\/summary/);
capabilities.hasBuyerAccount = true;
assert.match(renderToStaticMarkup(await accountPage()), /Mi negocio/);
await assert.rejects(() => accountPage('buyer'), /REDIRECT:\/comu\/account\/buyer/);
await assert.rejects(() => accountPage('seller'), /REDIRECT:\/comu\/seller\/authorized\/summary/);
capabilities.stores.push({ ...store, id: 's2', brand_slug: 'second' });
const multi = renderToStaticMarkup(await accountPage('seller'));
assert.match(multi, /\/comu\/seller\/authorized\/summary/); assert.match(multi, /\/comu\/seller\/second\/summary/);
assert.equal(navigation.safeComuNext('/comu/seller/authorized/orders'), '/comu/account');
assert.equal(navigation.safeComuNext('/comu/account/orders'), '/comu/account/orders');
console.log('PASS B1 read separation, identity mismatch/anonymous denied, lookup errors, CP1 Buyer/Seller/dual/multistore routing (memory only).');
