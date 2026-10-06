import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";

function load(path, imports = {}, globals = {}) {
  const context = { exports: {}, URL, Date, Set, Map, process: { env: {} }, ...globals, require(name) {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`); return imports[name];
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return context.exports;
}
class PosApiError extends Error { constructor(status, code, message) { super(message); Object.assign(this, { status, code }); } }
const response = { json(body, options) { return { body, status: options?.status || 200 }; } };
const domain = load("src/lib/comu/buyer-experience.ts");
const authNavigation = load("src/lib/comu/auth-navigation.ts");
const publicRoutes = load("src/lib/comu/public-routes.ts");
for (const route of ["/comu", "/comu/account", "/comu/sell", "/comu/cart", "/comu/products/real", "/comu/sellers/store", "/comu/legal/returns"]) assert.equal(publicRoutes.isPublicComuRoute(route), true);
for (const route of ["/comu/seller", "/comu/seller/finance", "/comu/account/buyer", "/comu/account/orders", "/comu/legal/unknown"]) assert.equal(publicRoutes.isPublicComuRoute(route), false);
assert.equal(domain.buyerOrderStatus("PAYMENT_PENDING"), "Pago pendiente");
assert.equal(domain.buyerOrderStatus("UNRECOGNIZED_ENUM"), "En seguimiento");
assert.equal(domain.buyerSection("Pedidos"), "Mis pedidos");
assert.equal(domain.buyerSection("Perfil"), "Mis datos");
assert.equal(domain.buyerSection("invalid"), "Resumen");
assert.equal(domain.buyerOrderPresentation({ status: "PAID", fulfillment_status: "SHIPPED" }).label, "En camino");
assert.equal(domain.buyerOrderPresentation({ status: "CANCELLED", fulfillment_status: "DELIVERED" }).group, "Cancelados");
assert.equal(domain.buyerOrderPresentation({ status: "PAID", fulfillment_status: "DELIVERED" }).group, "Entregados");
const product = { id: "a", seller_id: "one", public_category: "ropa" };
const groups = domain.recommendationGroups(product, [product, { id: "b", seller_id: "two", public_category: "ropa" }, { id: "c", seller_id: "one", public_category: "ropa" }]);
assert.equal(groups.length, 2); assert.equal(new Set(groups.flatMap(group => group.items.map(row => row.id))).size, 2);
assert.equal(domain.recommendationGroups(product, [product]).length, 0);
assert.equal(domain.sizeGuideFromTheme({ sizeGuide: "seller", sizeGuides: { a: "product" } }, "a"), "product");
assert.equal(domain.sizeGuideFromTheme({ sizeGuide: "seller" }, "b"), "seller");
assert.equal(domain.sizeGuideFromTheme(null, "a"), null);
const { comuPublicPlans } = load("src/lib/comu/commercial-presentation.ts");
assert.equal(comuPublicPlans[0].monthlyMxn, 399); assert.equal(comuPublicPlans[1].monthlyMxn, 599);
const { policies } = load("src/app/comu/legal/policies.ts");
assert.equal(Object.keys(policies).length, 5);
for (const key of Object.keys(policies)) { assert.equal(publicRoutes.isPublicComuRoute(`/comu/legal/${key}`), true); assert.ok(policies[key].sections.length); }
assert.ok(existsSync("src/app/comu/legal/[policy]/page.tsx"));
assert.match(policies.returns.sections.flat().join(" "), /4 días/);
assert.doesNotMatch(JSON.stringify(policies), /Skydrop|8%|comisión justa/);

let authenticated = true, calls = [], owned = true;
const buyerId = "buyer-authenticated";
const admin = { from(table) {
  const call = { table, filters: [], action: "read" }; calls.push(call);
  const q = { select() { return q; }, eq(key, value) { call.filters.push([key, value]); return q; }, order() { return q; }, maybeSingle() { return q; },
    update(value) { call.action = "update"; call.value = value; return q; }, delete() { call.action = "delete"; return q; }, upsert(value) { call.action = "upsert"; call.value = value; return q; },
    then(resolve) { return Promise.resolve({ data: table === "comu_buyer_addresses" ? owned ? { id: "11111111-1111-1111-1111-111111111111" } : null : [], error: null }).then(resolve); } };
  return q;
} };
const buyer = { requireComuBuyer: async () => { if (!authenticated) throw new PosApiError(401, "COMU_UNAUTHORIZED", "Login"); return { buyer: { id: buyerId, display_name: "" }, admin, user: { id: "user-authenticated", email: "fixture@example.test" } }; } };
buyer.readComuBuyerAccount = buyer.requireComuBuyer;
buyer.getBuyerAddresses = async () => ({ ...(await buyer.requireComuBuyer()), addresses: [] });
const env = {}; const experience = load("src/app/api/comu/buyer/experience/route.ts", { "next/server": { NextResponse: response }, "@/lib/comu/buyers": buyer, "@/lib/comu/auth-navigation": authNavigation, "@/lib/pos/server": { PosApiError } }, { process: { env } });
const post = body => ({ json: async () => body });
authenticated = false;
assert.equal((await experience.GET()).status, 401); assert.equal(calls.length, 0);
authenticated = true;
assert.equal((await experience.GET()).body.foundationReady, false);
assert.equal((await experience.POST(post({ action: "favorite", listingId: "11111111-1111-1111-1111-111111111111", saved: true }))).status, 503);
assert.equal(calls.length, 0, "Pending migration must never query new tables");
env.COMU_BUYER_FOUNDATION_ENABLED = "true";
assert.equal((await experience.POST(post({ action: "favorite", listingId: "11111111-1111-1111-1111-111111111111", saved: true, buyer_id: "victim" }))).status, 200);
assert.equal(calls.at(-1).value.buyer_id, buyerId);
await experience.POST(post({ action: "favorite", listingId: "11111111-1111-1111-1111-111111111111", saved: false }));
assert.ok(calls.at(-1).filters.some(([key, value]) => key === "buyer_id" && value === buyerId));
await experience.POST(post({ action: "profile", displayName: "Nombre", stripe_customer_id: "forbidden" }));
assert.equal(calls.at(-1).value.stripe_customer_id, undefined);
await experience.POST(post({ action: "profile", displayName: "Nombre", phone: "+52 5551234567", buyer_id: "victim" }));
assert.equal(calls.at(-1).value.phone, "+52 5551234567");
assert.ok(calls.at(-1).filters.some(([key, value]) => key === "id" && value === buyerId));
assert.equal((await experience.POST(post({ action: "profile", displayName: "Nombre", phone: "invalid" }))).status, 400);
await experience.POST(post({ action: "profile", displayName: "Nombre" }));
assert.equal(calls.at(-1).value.phone, undefined, "Existing name-only profile requests preserve phone");
assert.equal((await experience.POST(post({ action: "favorite", listingId: "bad", saved: true }))).status, 400);
const addressEnv = {}; const rpcCalls = []; let rpcError = null;
const addresses = load("src/app/api/comu/buyer/addresses/route.ts", { "next/server": { NextResponse: response }, "@/lib/comu/buyers": buyer, "@/lib/pos/server": { PosApiError }, "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: {}, error: rpcError ? { message: rpcError } : null }; } }) } }, { process: { env: addressEnv } });
assert.equal((await addresses.PATCH(post({ id: "11111111-1111-1111-1111-111111111111", action: "default" }))).status, 503);
assert.equal(rpcCalls.length, 0);
addressEnv.COMU_BUYER_FOUNDATION_ENABLED = 'true';
rpcError = 'COMU_ADDRESS_NOT_FOUND';
assert.equal((await addresses.PATCH(post({ id: "11111111-1111-1111-1111-111111111111", action: "default" }))).status, 404);
rpcError = null;
await addresses.DELETE({ url: "https://fixture.invalid/api?id=11111111-1111-1111-1111-111111111111" });
assert.equal(rpcCalls.at(-1).args.p_action, 'delete');
await addresses.POST(post({ isDefault: true, buyer_id: 'victim' }));
assert.equal(rpcCalls.at(-1).args.p_input.is_default, true);
assert.equal(rpcCalls.at(-1).args.p_input.buyer_id, undefined);
await addresses.PATCH(post({ id: '11111111-1111-1111-1111-111111111111', isDefault: false, buyer_id: 'victim' }));
assert.equal(rpcCalls.at(-1).args.p_input.is_default, false);
assert.equal(rpcCalls.at(-1).args.p_input.buyer_id, undefined);
assert.equal((await addresses.POST(post(null))).status, 400);
const previousRpcCount = rpcCalls.length;
authenticated = false;
assert.equal((await addresses.POST(post({}))).status, 401);
assert.equal((await addresses.PATCH(post({ id: '11111111-1111-1111-1111-111111111111', action: 'default' }))).status, 401);
assert.equal((await addresses.DELETE({ url: 'https://fixture.invalid/api?id=11111111-1111-1111-1111-111111111111' })).status, 401);
assert.equal(rpcCalls.length, previousRpcCount, 'Unauthenticated requests never invoke address RPCs');
authenticated = true;
assert.equal((await addresses.PATCH(post({ id: 'invalid', action: 'default' }))).status, 400);
assert.equal((await addresses.POST(post([]))).status, 400);
assert.equal(rpcCalls.length, previousRpcCount);
await addresses.PATCH(post({ id: '11111111-1111-1111-1111-111111111111', action: 'default', buyer_id: 'victim' }));
assert.equal(rpcCalls.at(-1).name, 'comu_set_default_address_v1');
assert.deepEqual(Object.keys(rpcCalls.at(-1).args), ['p_address_id']);
rpcError = 'COMU_ADDRESS_SELECT_REPLACEMENT';
assert.equal((await addresses.PATCH(post({ id: '11111111-1111-1111-1111-111111111111', isDefault: false }))).status, 400);
rpcError = 'private database diagnostic';
const addressFailure = await addresses.DELETE({ url: 'https://fixture.invalid/api?id=11111111-1111-1111-1111-111111111111' });
assert.equal(addressFailure.status, 500);
assert.doesNotMatch(JSON.stringify(addressFailure.body), /private database diagnostic/);
rpcError = null;

let applicationWrites = 0, applicationData;
const appEnv = {};
const applications = load("src/app/api/comu/seller-applications/route.ts", { "next/server": { NextResponse: response }, "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authenticated ? { id: "user-authenticated" } : null } }) }, from(table) { assert.equal(table, "comu_seller_applications"); return { async insert(data) { applicationWrites++; applicationData = data; return { error: null }; } }; } }) } }, { process: { env: appEnv } });
authenticated = false; assert.equal((await applications.POST(post({}))).status, 401);
authenticated = true; assert.equal((await applications.POST(post({}))).status, 503); assert.equal(applicationWrites, 0);
appEnv.COMU_BUYER_FOUNDATION_ENABLED = "true";
assert.equal((await applications.POST(post({}))).status, 400);
assert.equal((await applications.POST(post({ contact_name: "Fixture", business_name: "Fixture", email: "test@example.test", phone: "5551234567", city: "Fixture", business_type: "Taller", status: "APPROVED", user_id: "victim" }))).status, 201);
assert.equal(applicationData.user_id, "user-authenticated"); assert.equal(applicationData.status, undefined);
let accountUser = null;
const accountPage = load("src/app/comu/account/page.tsx", {
  "react/jsx-runtime": jsx,
  "next/image": { default: () => null },
  "./buyer/account-icon": { AccountIcon: () => null },
  "@/lib/comu/account-access": { resolveComuAccountAccess: async () => accountUser ? { userId: accountUser.id, hasBuyerAccount: true, isAdmin: false, stores: [{ id: "owned", brand_slug: "owned-store", public_name: "Owned", status: "ACTIVE" }] } : null },
  "next/link": { default: props => React.createElement("a", { href: props.href }, props.children) },
  "next/navigation": { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
  "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: accountUser } }) } }) },
  "@/lib/pos/server": { getAdminClient: () => ({ from(table) { const q = { select() { return q; }, eq() { return q; }, then(resolve) { return Promise.resolve({ error: null, data: table === "comu_seller_memberships" ? [{ comu_sellers: { brand_slug: "owned-store", public_name: "Owned" } }] : [] }).then(resolve); } }; return q; } }) },
});
assert.match(renderToStaticMarkup(await accountPage.default({ searchParams: Promise.resolve({}) })), /Explorar como comprador/);
accountUser = { id: "user-authenticated" };
await assert.rejects(() => accountPage.default({ searchParams: Promise.resolve({ context: "buyer" }) }), /REDIRECT:\/comu\/account\/buyer/);
await assert.rejects(() => accountPage.default({ searchParams: Promise.resolve({ context: "seller" }) }), /REDIRECT:\/comu\/seller\/owned-store\/summary/);
const orderPresentation = load("src/lib/comu/buyer-order-presentation.ts");
const shell = load("src/app/comu/account/buyer/buyer-account.tsx", {
  "react/jsx-runtime": jsx, react: { useState: initial => [typeof initial === "function" ? initial() : initial === true ? false : initial, () => {}], useRef: value => ({ current: value }), useEffect() {}, useCallback: fn => fn },
  "next/image": { default: () => null },
  "@/lib/supabase/client": { createClient() { assert.fail("No auth mutations during render"); } },
  "./account-icon": { AccountIcon: () => null },
  "next/link": { default: props => React.createElement("a", { href: props.href }, props.children) },
  "@/lib/comu/buyer-experience": domain,
  "@/lib/comu/buyer-order-presentation": orderPresentation,
  "../../components/commerce": { useCommerce: () => ({ favorites: [] }) },
  "../../components/public-ui": { EmptyState: props => React.createElement("p", null, props.title), ProductCard: () => null },
});
for (const section of domain.buyerSections) {
  const markup = renderToStaticMarkup(React.createElement(shell.default, { initialSection: section }));
  assert.ok(markup.includes(section)); assert.doesNotMatch(markup, /sk_live_|PaymentIntent|SUPABASE_SERVICE/);
}
const emptyOrders = renderToStaticMarkup(React.createElement(shell.OrderList, { orders: [] }));
assert.match(emptyOrders, /Aún no tienes pedidos/);
assert.match(emptyOrders, /href="\/comu\/search"/);
const realOrder = renderToStaticMarkup(React.createElement(shell.OrderList, { orders: [{ id: "fixture-order", order_number: "42", status: "PAID", fulfillment_status: "SHIPPED", created_at: "2026-09-01", grand_total: 800, currency: "MXN", comu_order_items: [{ id: "fixture-item", quantity: 2, comu_order_item_snapshots: [{ snapshot: { listingTitle: "Fixture" } }] }] }] }));
assert.match(realOrder, /En camino/); assert.match(realOrder, /2 productos/); assert.match(realOrder, /\/comu\/account\/orders\/fixture-order/);
assert.doesNotMatch(readFileSync("src/app/comu/account/buyer/buyer-account.tsx", "utf8"), /window\.(confirm|prompt)\(/);
const payments = load("src/lib/comu/saved-payments.ts", { "server-only": {} });
let deliveryOwned = false, shipmentReads = 0;
const delivery = load("src/app/api/comu/buyer/order-delivery/route.ts", { "next/server": { NextResponse: response }, "@/lib/pos/server": { PosApiError }, "@/lib/comu/buyers": { requireComuBuyerRead: async () => ({ buyer: { id: buyerId }, admin: { from(table) { if (table === "comu_shipments") shipmentReads++; const q = { select() { return q; }, eq(key, value) { if (key === "buyer_id") assert.equal(value, buyerId); return q; }, maybeSingle() { return q; }, then(resolve) { return Promise.resolve({ error: null, data: table === "comu_orders" ? deliveryOwned ? { id: "owned-order", subtotal: 800, shipping_total: 123.45 } : null : [{ tracking_number: "fixture", carrier: "Fixture" }] }).then(resolve); } }; return q; } } }) } });
const requestDelivery = { url: "https://fixture.invalid/api?orderId=11111111-1111-1111-1111-111111111111" };
assert.equal((await delivery.GET(requestDelivery)).status, 404); assert.equal(shipmentReads, 0);
deliveryOwned = true; assert.equal((await delivery.GET(requestDelivery)).body.shipping, 123.45); assert.equal(shipmentReads, 1);
assert.equal(payments.savedCardView({ type: "card", customer: "victim", card: {} }, "buyer", null), null);
const card = payments.savedCardView({ id: "pm_fixture", type: "card", customer: "buyer", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030, number: "never-expose" } }, "buyer", "pm_fixture");
assert.deepEqual(Object.keys(card).sort(), ["brand", "expMonth", "expYear", "id", "last4", "primary"].sort());

let value, refs = 0, animations = 0, appended = 0, opened = 0, reduced = false, removed = 0;
const hooks = { createContext: () => ({ Provider: props => { value = props.value; return props.children; } }), useContext: () => value,
  useCallback: fn => fn, useEffect() {}, useState: initial => [initial, () => {}], useRef(initial) { refs++; return { current: refs === 1 ? { showModal() { opened++; }, close() {} } : initial }; } };
const thumb = { style: {}, setAttribute() {}, remove() { removed++; }, animate() { animations++; return { finished: Promise.resolve() }; } };
const target = { animate() { animations++; }, getBoundingClientRect: () => ({ left: 200, top: 10 }) };
const commerce = load("src/app/comu/components/commerce.tsx", { react: hooks, "react/jsx-runtime": jsx, "next/image": { default: () => null }, "next/link": { default: props => React.createElement("a", { href: props.href }, props.children) }, "@/lib/comu/buyer-experience": domain }, { window: { matchMedia(query) { return { matches: query.includes("reduced-motion") ? reduced : true }; } }, document: { querySelector: () => target, createElement: () => thumb, body: { append() { appended++; } } }, setTimeout: fn => { fn(); return 1; }, clearTimeout() {}, fetch() { assert.fail("No network from test"); } });
renderToStaticMarkup(React.createElement(commerce.CommerceProvider, null, React.createElement("span", null, "Fixture")));
value.accepted([], "https://fixture.invalid/image", { getBoundingClientRect: () => ({ left: 10, top: 100 }) });
await Promise.resolve(); await Promise.resolve();
assert.equal(animations, 2); assert.equal(appended, 1); assert.equal(opened, 1); assert.equal(removed, 1);
reduced = true; value.accepted([], "https://fixture.invalid/image", target);
assert.equal(animations, 2, "Reduced motion suppresses flight and pulse");
assert.equal(opened, 2, "Accessible cart remains available");
const migration = readFileSync("supabase/migrations/20260928180000_comu_buyer_experience_v1.sql", "utf8");
assert.doesNotMatch(migration, /drop table|truncate|comu_financial|comu_settlement/i);
for (const table of ["comu_buyer_favorites", "comu_buyer_reviews", "comu_buyer_points", "comu_seller_applications"]) assert.ok(migration.includes(`alter table public.${table} enable row level security`));
assert.match(migration, /interval '12 months'/); assert.match(migration, /on conflict\(review_id\) do nothing/);
// SQL contract checks only; actual PostgreSQL concurrency/RLS requires a local DB.
assert.match(migration, /create unique index comu_addresses_one_primary[^;]+where is_default/);
assert.match(migration, /deferrable initially deferred/);
assert.match(migration, /v_count>0 and v_primary<>1/);
assert.match(migration, /where user_id=auth.uid\(\) for update/);
assert.match(migration, /where id=p_address_id and buyer_id=v_buyer/);
assert.match(migration, /revoke insert, update, delete on public.comu_buyer_addresses from authenticated, anon/);
assert.match(migration, /p_action='create' and not exists\(select 1 from public.comu_buyer_addresses where buyer_id=v_buyer\)/);
assert.match(migration, /COMU_ADDRESS_SELECT_REPLACEMENT/);
assert.match(migration, /order by updated_at desc,created_at desc,id limit 1/);
console.log("PASS: public/auth boundaries, buyer ownership, pending migrations, application validation, safe payment projection, recommendations, legal routes, cart feedback and reduced motion. Real network/Stripe/DB calls: 0.");
