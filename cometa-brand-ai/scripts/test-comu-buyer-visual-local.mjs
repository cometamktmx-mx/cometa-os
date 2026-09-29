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
const publicRoutes = load("src/lib/comu/public-routes.ts");
for (const route of ["/comu", "/comu/account", "/comu/sell", "/comu/cart", "/comu/products/real", "/comu/sellers/store", "/comu/legal/returns"]) assert.equal(publicRoutes.isPublicComuRoute(route), true);
for (const route of ["/comu/seller", "/comu/seller/finance", "/comu/account/buyer", "/comu/account/orders", "/comu/legal/unknown"]) assert.equal(publicRoutes.isPublicComuRoute(route), false);
assert.equal(domain.buyerOrderStatus("PAYMENT_PENDING"), "Pago pendiente");
assert.equal(domain.buyerOrderStatus("UNRECOGNIZED_ENUM"), "En seguimiento");
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
const env = {}; const experience = load("src/app/api/comu/buyer/experience/route.ts", { "next/server": { NextResponse: response }, "@/lib/comu/buyers": buyer, "@/lib/pos/server": { PosApiError } }, { process: { env } });
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
assert.equal((await experience.POST(post({ action: "favorite", listingId: "bad", saved: true }))).status, 400);
const addresses = load("src/app/api/comu/buyer/addresses/route.ts", { "next/server": { NextResponse: response }, "@/lib/comu/buyers": buyer, "@/lib/pos/server": { PosApiError }, "@/lib/supabase/server": { createClient() { assert.fail("Disabled RPC must not run"); } } });
owned = false;
assert.equal((await addresses.PATCH(post({ id: "11111111-1111-1111-1111-111111111111", action: "default" }))).status, 404);
owned = true;
assert.equal((await addresses.PATCH(post({ id: "11111111-1111-1111-1111-111111111111", action: "default" }))).status, 503);
await addresses.DELETE({ url: "https://fixture.invalid/api?id=11111111-1111-1111-1111-111111111111" });
assert.ok(calls.at(-1).filters.some(([key, value]) => key === "buyer_id" && value === buyerId));

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
  "next/link": { default: props => React.createElement("a", { href: props.href }, props.children) },
  "next/navigation": { redirect(path) { throw new Error(`REDIRECT:${path}`); } },
  "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: accountUser } }) } }) },
  "@/lib/pos/server": { getAdminClient: () => ({ from(table) { const q = { select() { return q; }, eq() { return q; }, then(resolve) { return Promise.resolve({ error: null, data: table === "comu_seller_memberships" ? [{ comu_sellers: { brand_slug: "owned-store", public_name: "Owned" } }] : [] }).then(resolve); } }; return q; } }) },
});
assert.match(renderToStaticMarkup(await accountPage.default({ searchParams: Promise.resolve({}) })), /Comprar en COMU/);
accountUser = { id: "user-authenticated" };
await assert.rejects(() => accountPage.default({ searchParams: Promise.resolve({ context: "buyer" }) }), /REDIRECT:\/comu\/account\/buyer/);
await assert.rejects(() => accountPage.default({ searchParams: Promise.resolve({ context: "seller" }) }), /REDIRECT:\/brand\/owned-store\/comu/);
const shell = load("src/app/comu/account/buyer/buyer-account.tsx", {
  "react/jsx-runtime": jsx, react: { useState: initial => [initial === true ? false : initial, () => {}], useRef: value => ({ current: value }), useEffect() {}, useCallback: fn => fn },
  "next/link": { default: props => React.createElement("a", { href: props.href }, props.children) },
  "@/lib/comu/buyer-experience": domain,
  "../../components/commerce": { useCommerce: () => ({ favorites: [] }) },
  "../../components/public-ui": { EmptyState: props => React.createElement("p", null, props.title), ProductCard: () => null },
});
for (const section of domain.buyerSections) {
  const markup = renderToStaticMarkup(React.createElement(shell.default, { initialSection: section }));
  assert.ok(markup.includes(section)); assert.doesNotMatch(markup, /sk_live_|PaymentIntent|SUPABASE_SERVICE/);
}
const payments = load("src/lib/comu/saved-payments.ts", { "server-only": {} });
let deliveryOwned = false, shipmentReads = 0;
const delivery = load("src/app/api/comu/buyer/order-delivery/route.ts", { "next/server": { NextResponse: response }, "@/lib/pos/server": { PosApiError }, "@/lib/comu/buyers": { requireComuBuyer: async () => ({ buyer: { id: buyerId }, admin: { from(table) { if (table === "comu_shipments") shipmentReads++; const q = { select() { return q; }, eq(key, value) { if (key === "buyer_id") assert.equal(value, buyerId); return q; }, maybeSingle() { return q; }, then(resolve) { return Promise.resolve({ error: null, data: table === "comu_orders" ? deliveryOwned ? { id: "owned-order", subtotal: 800, shipping_total: 123.45 } : null : [{ tracking_number: "fixture", carrier: "Fixture" }] }).then(resolve); } }; return q; } } }) } });
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
console.log("PASS: public/auth boundaries, buyer ownership, pending migrations, application validation, safe payment projection, recommendations, legal routes, cart feedback and reduced motion. Real network/Stripe/DB calls: 0.");
