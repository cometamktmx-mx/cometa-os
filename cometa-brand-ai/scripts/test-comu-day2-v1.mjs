import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
const root = new URL("..", import.meta.url);
const files = [
  "supabase/migrations/20260920110000_comu_buyers_cart.sql",
  "supabase/migrations/20260920111000_comu_inventory_reservations.sql",
  "supabase/migrations/20260920112000_comu_orders_events.sql",
  "supabase/migrations/20260920113000_comu_reservation_events_timeout.sql",
  "src/lib/comu/cart.ts",
  "src/lib/comu/reservations.ts",
  "src/lib/comu/orders.ts",
  "src/app/api/comu/cart/route.ts",
  "src/app/api/comu/reservations/route.ts",
  "src/app/api/comu/checkout/route.ts",
  "src/app/api/comu/orders/route.ts",
  "src/app/comu/cart/page.tsx",
  "src/app/comu/checkout/page.tsx",
  "src/app/comu/account/orders/page.tsx",
  "src/app/comu/seller/orders/page.tsx",
];
for (const file of files) await access(new URL(file, root));
const sql = await Promise.all(files.slice(0, 4).map((file) => readFile(new URL(file, root), "utf8"))).then((parts) => parts.join("\n"));
const checks = [
  ["cart does not reserve", !sql.split("create table if not exists public.comu_cart_items")[1]?.split("alter table")[0]?.includes("reservation")],
  ["reservation TTL", sql.includes("interval '15 minutes'")],
  ["reservation idempotency", sql.includes("idempotency_key text not null unique")],
  ["row lock", sql.includes("for update")],
  ["POS reserved quantity mirror", sql.includes("reserved_quantity = reserved_quantity + v_requested")],
  ["reservation release returns POS stock", sql.includes("reserved_quantity = greatest(0, reserved_quantity - v_item.quantity)")],
  ["expired reservations ignored", sql.includes("expires_at <= now()")],
  ["master orders", sql.includes("create table if not exists public.comu_orders")],
  ["seller suborders", sql.includes("create table if not exists public.comu_order_suborders")],
  ["immutable snapshots", sql.includes("comu_order_item_snapshots")],
  ["order events", sql.includes("comu_order_events")],
  ["reservation lifecycle events", sql.includes("RESERVATION_CREATED") && sql.includes("RESERVATION_EXPIRED")],
  ["payment pending expiry policy", sql.includes("status='EXPIRED'") && sql.includes("status='PAYMENT_PENDING'")],
  ["payment pending", sql.includes("PAYMENT_PENDING")],
  ["buyer RLS", sql.includes("comu_orders_buyer")],
  ["seller RLS", sql.includes("comu_suborders_buyer_seller")],
  ["no payment provider", !sql.includes("stripe") && !sql.includes("PaymentIntent")],
];
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`COMU Day 2 contract: ${checks.length}/${checks.length} PASS`);


// Local behavioral checks: execute the real routes/component with in-memory auth, DB and HTTP.
// No credentials, network, database mutations or Stripe calls are used.
const { default: assert } = await import("node:assert/strict");
const { default: ts } = await import("typescript");
const { default: vm } = await import("node:vm");
const { randomUUID } = await import("node:crypto");
let behavioralChecks = 0;
async function check(name, action) {
  await action();
  behavioralChecks++;
  console.log(`PASS ${name}`);
}
async function loadModule(file, dependencies, globals = {}) {
  const source = await readFile(new URL(file, root), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    }, console, Error, ...globals,
  }, { filename: file });
  return exports;
}
class PosApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const buyerA = { id: "buyer-a", user_id: "user-a" };
const buyerB = { id: "buyer-b", user_id: "user-b" };
let buyer = buyerA;
let authenticated = true;
let dbError = false;
let rows = [];
let reservations = 0;
let snapshot;
let orderKey;
const admin = {
  from(table) {
    assert.equal(table, "comu_buyer_addresses");
    const filters = [];
    let inserted;
    const result = () => ({ data: rows.filter((row) => filters.every(([key, value]) => row[key] === value)).sort((a, b) => Number(b.is_default) - Number(a.is_default)), error: dbError ? new Error("private database detail") : null });
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      order() { return query; },
      insert(value) { inserted = value; return query; },
      async single() {
        if (dbError) return { data: null, error: new Error("private database detail") };
        const row = { id: randomUUID(), ...inserted };
        rows.push(row);
        return { data: row, error: null };
      },
      async maybeSingle() { const data = result(); return { data: data.data[0] || null, error: data.error }; },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return query;
  },
};
const requireComuBuyer = async () => {
  if (!authenticated) throw new PosApiError(401, "COMU_UNAUTHORIZED", "Inicia sesión para continuar.");
  return { buyer, admin };
};
// Use the real lookup body with an injected auth resolver.
const buyersSource = await readFile(new URL("src/lib/comu/buyers.ts", root), "utf8");
const lookupSource = buyersSource.slice(buyersSource.indexOf("export async function getBuyerAddresses"));
const lookupCompiled = ts.transpileModule(lookupSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const lookupExports = {};
vm.runInNewContext(lookupCompiled, { exports: lookupExports, requireComuBuyer, PosApiError });
const deps = {
  "next/server": { NextResponse: { json: (value, options) => Response.json(value, options) } },
  "@/lib/comu/buyers": { requireComuBuyer, getBuyerAddresses: lookupExports.getBuyerAddresses },
  "@/lib/pos/server": { PosApiError },
};
const addressesRoute = await loadModule("src/app/api/comu/buyer/addresses/route.ts", deps);
const checkoutRoute = await loadModule("src/app/api/comu/checkout/route.ts", {
  ...deps, "node:crypto": { randomUUID },
  "@/lib/comu/features": { requireComuFeature() {} },
  "@/lib/comu/reservations": { async createReservation() { reservations++; return { reservation: { id: randomUUID() } }; } },
  "@/lib/comu/orders": { async createOrderFromReservation(id, key, address) { snapshot = structuredClone(address); orderKey = key; return { id: randomUUID(), status: "PAYMENT_PENDING", shipping_address_snapshot: snapshot }; } },
});
const request = (body) => new Request("http://local.test", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const valid = { label: "Casa", recipientName: "Buyer", phone: "5551234567", line1: "Calle 1", city: "Ciudad", state: "Estado", postalCode: "01234", country: "MX", isDefault: true };
await check("A: buyer without addresses returns an empty list and no admin client", async () => {
  const response = await addressesRoute.GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.addresses, []);
  assert.equal("admin" in body, false);
});
await check("B/H: save resolves buyer from auth and ignores supplied buyer_id/id", async () => {
  const response = await addressesRoute.POST(request({ ...valid, buyer_id: buyerB.id, id: "foreign-id" }));
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.address.buyer_id, buyerA.id);
  assert.notEqual(body.address.id, "foreign-id");
});
await check("required fields, malformed JSON and postal code return human errors", async () => {
  for (const body of [{}, null, { ...valid, city: {} }]) {
    const response = await addressesRoute.POST(request(body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "Completa los campos obligatorios.");
  }
  const malformed = await addressesRoute.POST(new Request("http://local.test", { method: "POST", body: "{" }));
  assert.equal(malformed.status, 400);
  const response = await addressesRoute.POST(request({ ...valid, postalCode: "abcde" }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "Revisa tu código postal.");
});
await check("database failure is safe and does not leak technical errors", async () => {
  dbError = true;
  const response = await addressesRoute.POST(request(valid));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "No pudimos guardar la dirección. Inténtalo nuevamente.");
  dbError = false;
});
await check("H: buyers can only list their own addresses", async () => {
  buyer = buyerB;
  assert.deepEqual((await (await addressesRoute.GET()).json()).addresses, []);
  await addressesRoute.POST(request({ ...valid, label: "Otra" }));
  assert.equal(rows[0].buyer_id, buyerA.id);
  assert.equal(rows[0].label, "Casa");
  buyer = buyerA;
  const body = await (await addressesRoute.GET()).json();
  assert.equal(body.addresses.length, 1);
  assert.equal(body.addresses[0].buyer_id, buyerA.id);
});
await check("H: missing auth denies GET, POST and checkout", async () => {
  authenticated = false;
  assert.equal((await addressesRoute.GET()).status, 401);
  assert.equal((await addressesRoute.POST(request(valid))).status, 401);
  assert.equal((await checkoutRoute.POST(request({ addressId: rows[0].id }))).status, 401);
  authenticated = true;
});
await check("H: foreign/missing address is rejected before inventory reservation", async () => {
  const before = reservations;
  assert.equal((await checkoutRoute.POST(request({ addressId: rows[1].id }))).status, 404);
  assert.equal((await checkoutRoute.POST(request({ addressId: randomUUID() }))).status, 404);
  assert.equal((await checkoutRoute.POST(request({}))).status, 400);
  assert.equal(reservations, before);
});
await check("G: snapshot uses persisted address, ignores forged fields and survives later address changes", async () => {
  const response = await checkoutRoute.POST(request({ shippingAddress: { id: rows[0].id, line1: "Forged" }, idempotencyKey: "shared-key" }));
  assert.equal(response.status, 200);
  assert.equal(snapshot.line1, "Calle 1");
  assert.equal(orderKey, "shared-key:order");
  rows[0].line1 = "Changed later";
  assert.equal(snapshot.line1, "Calle 1");
  assert.ok(sql.includes("shipping_address_snapshot jsonb"));
  assert.ok(sql.includes("p_reservation_id,p_shipping_address_snapshot,p_idempotency_key"));
});

// Minimal hook harness executes actual JSX handlers and state transitions without a browser.
async function checkoutHarness(initialAddresses, initiallyFailLoad = false, checkoutResponse, initialItems = [{ is_available: true }], diagnostics = {}) {
  const states = [];
  const refs = [];
  const effectDeps = [];
  let cursor = 0;
  let pending = [];
  const calls = [];
  const mounts = [];
  const logs = [];
  const stripeCalls = [];
  let failSave = false;
  let failPayment = false;
  let failLoad = initiallyFailLoad;
  let cartItems = initialItems;
  let failCart = false;
  const jsx = (type, props) => ({ type, props: props || {} });
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return refs[index] ||= { current: initial }; },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!effectDeps[index] || dependencies.some((value, i) => value !== effectDeps[index][i])) { effectDeps[index] = dependencies; pending.push(effect); }
    },
  };
  const component = await loadModule("src/app/comu/checkout/page.tsx", {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": { default: "a" },
  }, {
    process: { env: { NEXT_PUBLIC_COMU_STRIPE_PUBLISHABLE_KEY: "pk_test_fixture", NODE_ENV: diagnostics.environment } }, crypto: { randomUUID },
    AbortSignal, AbortController,
    // This harness tests immediate outcomes; polling timers are covered by post-payment tests.
    setTimeout: () => 0, clearTimeout() {},
    console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    document: { createElement: () => ({ remove() {} }), head: { appendChild(script) { script.onload(); } } },
    window: { location: { href: "http://localhost:3000/comu/checkout" }, Stripe: (key) => { assert.equal(key, "pk_test_fixture"); return {
      elements: ({ clientSecret }) => { assert.equal(clientSecret, "sandbox-secret"); return {
        create: (type) => { assert.equal(type, "payment"); return { mount: (selector) => mounts.push(selector), unmount() {} }; },
        submit: async () => { stripeCalls.push("submit"); return diagnostics.submitted || {}; },
      }; },
      confirmPayment: async (options) => { stripeCalls.push("confirmPayment"); assert.equal(options.redirect, "if_required"); assert.equal(options.confirmParams.return_url, "http://localhost:3000/comu/checkout"); if (diagnostics.exception) throw diagnostics.exception; return diagnostics.result || {}; },
    }; } },
    FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key]; } },
    fetch: async (url, options) => {
      const body = options?.body ? JSON.parse(options.body) : undefined;
      calls.push({ url, body });
      if (url.endsWith("/payment-status")) return Response.json({ ok: true, order: { id: "created-order", status: "PAYMENT_PENDING" }, payment: { status: "REQUIRES_PAYMENT", updated_at: "2026-09-21T12:00:00Z" }, reservation: { status: "COMMITTED", expires_at: new Date(Date.now() + 900000).toISOString() }, canRetry: true });
      if (url.endsWith("/cart")) return Response.json({ ok: !failCart, items: cartItems }, { status: failCart ? 500 : 200 });
      if (url.endsWith("/addresses")) {
        if (!body) return Response.json({ ok: !failLoad, addresses: initialAddresses }, { status: failLoad ? 500 : 200 });
        if (failSave) throw new Error("network");
        return Response.json({ ok: true, address: { ...body, id: "saved-address", line1: body.line1, is_default: body.isDefault } }, { status: 201 });
      }
      if (url.endsWith("/checkout")) return checkoutResponse ? checkoutResponse() : Response.json({ ok: true, order: { id: "created-order", reservation_id: "created-reservation" } });
      if (url.endsWith("/intents")) return Response.json({ ok: !failPayment, clientSecret: failPayment ? null : "sandbox-secret" }, { status: failPayment ? 500 : 200 });
      throw new Error("Unexpected request");
    },
  });
  const render = () => { cursor = 0; return component.default(); };
  const flush = async () => {
    for (const effect of pending.splice(0)) effect();
    for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
    return render();
  };
  const loadingTree = render();
  const tree = await flush();
  return { tree, loadingTree, render, flush, calls, mounts, logs, stripeCalls, setCartItems(value) { cartItems = value; }, setFailCart(value) { failCart = value; }, setFailSave(value) { failSave = value; }, setFailPayment(value) { failPayment = value; }, setFailLoad(value) { failLoad = value; } };
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function textOf(tree) {
  if (Array.isArray(tree)) return tree.map(textOf).join("");
  if (tree && typeof tree === "object") return textOf(tree.props?.children);
  return typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
}
const button = (tree, label) => nodes(tree, (node) => node.type === "button" && textOf(node) === label)[0];
const submit = (tree, values) => nodes(tree, (node) => node.type === "form")[0].props.onSubmit({ preventDefault() {}, currentTarget: values });
await check("loading/error state does not masquerade as an empty address book; retry recovers", async () => {
  const h = await checkoutHarness([], true);
  assert.ok(textOf(h.loadingTree).includes("Revisando tu carrito"));
  assert.equal(nodes(h.tree, (node) => node.type === "form").length, 0);
  assert.equal(button(h.tree, "Continuar al pago").props.disabled, true);
  h.setFailLoad(false);
  button(h.tree, "Reintentar cargar direcciones").props.onClick();
  const tree = await h.flush();
  assert.equal(nodes(tree, (node) => node.type === "form").length, 1);
});
await check("A/B/C: inline form saves, selects new address and enables payment without reload", async () => {
  const h = await checkoutHarness([]);
  assert.equal(nodes(h.tree, (node) => node.type === "form").length, 1);
  assert.equal(button(h.tree, "Continuar al pago").props.disabled, true);
  submit(h.tree, {});
  let tree = await h.flush();
  assert.ok(textOf(tree).includes("Completa los campos obligatorios."));
  submit(tree, { ...valid, postalCode: "bad" });
  tree = await h.flush();
  assert.ok(textOf(tree).includes("Revisa tu código postal."));
  h.setFailSave(true);
  submit(tree, valid);
  tree = await h.flush();
  assert.ok(textOf(tree).includes("No pudimos guardar la dirección."));
  h.setFailSave(false);
  submit(tree, valid);
  tree = await h.flush();
  assert.equal(nodes(tree, (node) => node.type === "form").length, 0);
  assert.equal(nodes(tree, (node) => node.type === "select")[0].props.value, "saved-address");
  assert.equal(button(tree, "Continuar al pago").props.disabled, false);
  button(tree, "Continuar al pago").props.onClick();
  tree = await h.flush();
  assert.equal(h.calls.find((call) => call.url.endsWith("/checkout")).body.addressId, "saved-address");
  assert.ok(nodes(tree, (node) => node.props.id === "comu-payment-element").length);
});
const address = { id: "first", label: "Casa", line1: "Calle", city: "Ciudad" };
await check("D: one existing address is selected and can proceed", async () => {
  const h = await checkoutHarness([address]);
  assert.equal(nodes(h.tree, (node) => node.type === "select")[0].props.value, "first");
  assert.equal(button(h.tree, "Continuar al pago").props.disabled, false);
});
await check("E/F: default selection, switching and adding address stay inside checkout", async () => {
  const h = await checkoutHarness([address, { ...address, id: "default", is_default: true }]);
  assert.equal(nodes(h.tree, (node) => node.type === "select")[0].props.value, "default");
  nodes(h.tree, (node) => node.type === "select")[0].props.onChange({ target: { value: "first" } });
  let tree = h.render();
  assert.equal(nodes(tree, (node) => node.type === "select")[0].props.value, "first");
  button(tree, "Agregar nueva dirección").props.onClick();
  tree = h.render();
  assert.equal(button(tree, "Continuar al pago").props.disabled, true);
  submit(tree, valid);
  tree = await h.flush();
  assert.equal(nodes(tree, (node) => node.type === "select")[0].props.value, "saved-address");
});
await check("payment receives the created order and the existing idempotency key format", async () => {
  const h = await checkoutHarness([address]);
  button(h.tree, "Continuar al pago").props.onClick();
  const tree = await h.flush();
  assert.equal(nodes(tree, (node) => node.type === "select")[0].props.disabled, true);
  const checkout = h.calls.find((call) => call.url.endsWith("/checkout"));
  const payments = h.calls.filter((call) => call.url.endsWith("/intents"));
  assert.equal(payments.length, 1);
  assert.equal(payments[0].body.orderId, "created-order");
  assert.equal(payments[0].body.idempotencyKey, `${checkout.body.idempotencyKey}:payment`);
});
await check("F: payment uses the changed selection instead of the default", async () => {
  const h = await checkoutHarness([address, { ...address, id: "default", is_default: true }]);
  nodes(h.tree, (node) => node.type === "select")[0].props.onChange({ target: { value: "first" } });
  button(h.render(), "Continuar al pago").props.onClick();
  await h.flush();
  assert.equal(h.calls.find((call) => call.url.endsWith("/checkout")).body.addressId, "first");
});
console.log(`COMU checkout behavioral: ${behavioralChecks}/${behavioralChecks} PASS (local mocks; not live RLS/Stripe certification)`);

// Regression: a server-only client must never cross the cart JSON boundary.
const circularAdmin = { auth: { mfa: { webauthn: {} } } };
circularAdmin.auth.mfa.webauthn.client = circularAdmin.auth;
const cartContext = { buyer: buyerA, admin: circularAdmin, cart: { id: "cart-a", buyer_id: buyerA.id }, items: [] };
assert.throws(() => JSON.stringify({ ok: true, ...cartContext }), /circular/i);
let cartFailure;
const cartResult = async () => { if (cartFailure) throw cartFailure; return cartContext; };
const features = await loadModule("src/lib/comu/features.ts", {}, { process: { env: { COMU_CATALOG_ENABLED: "true" } } });
const cartRoute = await loadModule("src/app/api/comu/cart/route.ts", {
  ...deps,
  "@/lib/comu/features": features,
  "@/lib/comu/cart": { getOrCreateCart: cartResult, addCartItem: cartResult, updateCartItem: cartResult, removeCartItem: cartResult },
}, { URL });
await check("cart: catalog enabled, all four methods exclude a circular admin client", async () => {
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    const response = await cartRoute[method](request({ listingId: "listing", variantListingId: "variant", itemId: "item", quantity: 1 }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, buyer: buyerA, cart: cartContext.cart, items: [] });
  }
});
const safeCartError = "No pudimos cargar tu carrito. Inténtalo nuevamente.";
await check("cart: unexpected errors are safe; auth and domain status are preserved", async () => {
  for (const [error, status] of [[new Error("Converting circular structure to JSON: private detail"), 500], [new PosApiError(500, "COMU_CART_ITEMS_FAILED", "private detail"), 500], [new PosApiError(401, "COMU_UNAUTHORIZED", "Inicia sesión para continuar."), 401], [new PosApiError(403, "COMU_FORBIDDEN", "Sin acceso."), 403], [new PosApiError(400, "COMU_INVALID_QUANTITY", "La cantidad debe ser mayor a cero."), 400]]) {
    cartFailure = error;
    const response = await cartRoute.GET();
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error, status >= 500 ? safeCartError : error.message);
    assert.equal(JSON.stringify(body).includes("private detail"), false);
  }
  cartFailure = undefined;
});
async function cartHarness(fetcher) {
  const states = [];
  let cursor = 0;
  let effect;
  const jsx = (type, props) => ({ type, props });
  const component = await loadModule("src/app/comu/cart/page.tsx", {
    "next/link": { default: "a" },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value) => { states[index] = value; }]; },
      useEffect(callback) { effect ||= callback; },
    },
  }, { fetch: fetcher });
  const render = () => { cursor = 0; return component.default(); };
  const loadingTree = render();
  effect();
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
  return { loadingTree, tree: render() };
}
await check("cart UI: loading then human empty state, no checkout or payment request", async () => {
  const calls = [];
  const h = await cartHarness(async (url) => { calls.push(url); return cartRoute.GET(); });
  assert.ok(textOf(h.loadingTree).includes("Cargando tu carrito"));
  assert.equal(textOf(h.loadingTree).includes("Tu carrito está vacío."), false);
  assert.ok(textOf(h.tree).includes("Tu carrito está vacío."));
  assert.equal(nodes(h.tree, (node) => node.props?.href === "/comu/checkout").length, 0);
  assert.deepEqual(calls, ["/api/comu/cart"]);
});
await check("cart UI: raw HTTP, network and invalid JSON errors never reach buyer", async () => {
  for (const fetcher of [async () => Response.json({ error: "SupabaseAuthClient private detail" }, { status: 500 }), async () => { throw new Error("private detail"); }, async () => new Response("invalid JSON")]) {
    const h = await cartHarness(fetcher);
    assert.ok(textOf(h.tree).includes(safeCartError));
    assert.equal(textOf(h.tree).includes("private detail"), false);
    assert.equal(textOf(h.tree).includes("Tu carrito está vacío."), false);
  }
});
await check("cart UI: populated cart retains product, total and checkout", async () => {
  const h = await cartHarness(async () => Response.json({ ok: true, items: [{ id: "item", quantity: 2, effective_price: 25, product_name: "Producto de prueba" }] }));
  assert.ok(textOf(h.tree).includes("Producto de prueba"));
  assert.ok(textOf(h.tree).includes("50.00"));
  assert.equal(nodes(h.tree, (node) => node.props?.href === "/comu/checkout").length, 1);
});
await check("empty checkout: real reservation guard blocks order and PaymentIntent", async () => {
  const reservationModule = await loadModule("src/lib/comu/reservations.ts", {
    "node:crypto": { randomUUID }, "@/lib/pos/server": { PosApiError }, "./cart": { getOrCreateCart: cartResult },
  });
  const emptyCheckout = await loadModule("src/app/api/comu/checkout/route.ts", {
    ...deps, "node:crypto": { randomUUID }, "@/lib/comu/features": features,
    "@/lib/comu/reservations": reservationModule,
    "@/lib/comu/orders": { createOrderFromReservation() { assert.fail("Empty cart must not create order"); } },
  });
  const response = await emptyCheckout.POST(request({ addressId: rows[0].id }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "COMU_CART_EMPTY");
  const h = await checkoutHarness([{ ...address, id: rows[0].id }], false, () => emptyCheckout.POST(request({ addressId: rows[0].id })));
  button(h.tree, "Continuar al pago").props.onClick();
  await h.flush();
  assert.ok(h.calls.some((call) => call.url.endsWith("/checkout")));
  assert.equal(h.calls.some((call) => call.url.endsWith("/intents")), false);
});
console.log(`COMU behavioral total: ${behavioralChecks}/${behavioralChecks} PASS (local mocks)`);

// Execute the real reservation helper and route with an in-memory RPC boundary.
const reservationRpcCalls = [];
const reservationRows = new Map();
let reservationRpcError = null;
const reservationAdmin = {
  ...circularAdmin,
  from(table) {
    assert.equal(table, "pos_inventory");
    const query = {
      select() { return query; },
      eq(key, value) { assert.equal(key, "variant_id"); assert.equal(value, "variant-a"); return query; },
      async order() { return { data: [{ location_id: "location-a", quantity: 5, reserved_quantity: 0 }], error: null }; },
    };
    return query;
  },
  async rpc(name, input) {
    assert.equal(name, "comu_reserve_inventory");
    reservationRpcCalls.push(structuredClone(input));
    if (reservationRpcError) return { data: null, error: reservationRpcError };
    if (!reservationRows.has(input.p_idempotency_key)) reservationRows.set(input.p_idempotency_key, {
      id: randomUUID(), buyer_id: input.p_buyer_id, session_key: input.p_session_key,
      idempotency_key: input.p_idempotency_key, status: "ACTIVE",
      created_at: "2026-09-20T12:00:00.000Z", expires_at: "2026-09-20T12:15:00.000Z",
    });
    return { data: reservationRows.get(input.p_idempotency_key), error: null };
  },
};
const validReservationItem = { seller_id: "seller-a", listing_id: "listing-a", variant_listing_id: "variant-listing-a", quantity: 2, comu_variant_listings: { variant_id: "variant-a", enabled: true } };
let reservationItems = [validReservationItem];
let reservationAuthError;
const reservationHelper = await loadModule("src/lib/comu/reservations.ts", {
  "node:crypto": { randomUUID }, "@/lib/pos/server": { PosApiError },
  "./cart": { async getOrCreateCart() {
    if (reservationAuthError) throw reservationAuthError;
    return { buyer: buyerA, admin: reservationAdmin, items: reservationItems };
  } },
});
const reservationRouteDeps = { ...deps, "@/lib/comu/features": features, "@/lib/comu/reservations": reservationHelper };
const reservationRoute = await loadModule("src/app/api/comu/reservations/route.ts", reservationRouteDeps);
let publicReservation;
await check("reservations: valid catalog cart returns serializable reservation, excludes circular clients and buyer context", async () => {
  const response = await reservationRoute.POST(request({ idempotencyKey: "reservation-valid", buyer_id: buyerB.id }));
  assert.equal(response.status, 200);
  const body = await response.json();
  publicReservation = body.reservation;
  assert.deepEqual(Object.keys(body).sort(), ["ok", "reservation"]);
  assert.equal(body.ok, true);
  assert.deepEqual(body.reservation, reservationRows.get("reservation-valid"));
  assert.deepEqual(JSON.parse(JSON.stringify(body)), body);
  const input = reservationRpcCalls.at(-1);
  assert.equal(input.p_buyer_id, buyerA.id);
  assert.deepEqual(input.p_items, [{ seller_id: "seller-a", listing_id: "listing-a", variant_listing_id: "variant-listing-a", variant_id: "variant-a", location_id: "location-a", quantity: 2 }]);
  assert.throws(() => JSON.stringify(reservationAdmin), /circular/i);
});
await check("reservations: retries preserve RPC idempotency key, reservation ID and expiration", async () => {
  const bodies = await Promise.all([1, 2].map(async () => (await reservationRoute.POST(request({ idempotencyKey: "reservation-valid" }))).json()));
  for (const body of bodies) assert.deepEqual(body.reservation, publicReservation);
  for (const input of reservationRpcCalls) assert.equal(input.p_idempotency_key, "reservation-valid");
  assert.equal(reservationRows.size, 1);
  assert.equal(Date.parse(publicReservation.expires_at) - Date.parse(publicReservation.created_at), 15 * 60 * 1000);
  const row = reservationRows.get("reservation-valid");
  row.status = "EXPIRED";
  const expired = await (await reservationRoute.POST(request({ idempotencyKey: "reservation-valid" }))).json();
  assert.equal(expired.reservation.status, "EXPIRED");
  assert.equal(expired.reservation.expires_at, publicReservation.expires_at);
  row.status = "ACTIVE";
});
await check("reservations: empty cart and missing key fail without calling reservation RPC", async () => {
  const before = reservationRpcCalls.length;
  reservationItems = [];
  const empty = await reservationRoute.POST(request({ idempotencyKey: "empty" }));
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).code, "COMU_CART_EMPTY");
  const missing = await reservationRoute.POST(request({}));
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).code, "COMU_IDEMPOTENCY_KEY_REQUIRED");
  assert.equal(reservationRpcCalls.length, before);
  reservationItems = [validReservationItem];
});
const safeReservationError = "No pudimos reservar tus piezas. Inténtalo nuevamente.";
await check("reservations: RPC errors, exceptions and circular error details stay private", async () => {
  reservationRpcError = { message: "private SQL detail", client: reservationAdmin };
  const failed = await reservationRoute.POST(request({ idempotencyKey: "failed" }));
  assert.equal(failed.status, 409);
  assert.deepEqual(await failed.json(), { ok: false, code: "COMU_RESERVATION_FAILED", error: safeReservationError });
  reservationRpcError = null;
  const unexpected = await loadModule("src/app/api/comu/reservations/route.ts", {
    ...reservationRouteDeps,
    "@/lib/comu/reservations": { async createReservation() { throw Object.assign(new Error("Converting circular structure to JSON: private detail"), { admin: reservationAdmin }); } },
  });
  const response = await unexpected.POST(request({ idempotencyKey: "unexpected" }));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, code: "COMU_RESERVATION_FAILED", error: safeReservationError });
});
await check("reservations: auth denial and disabled catalog preserve status without leaking technical messages", async () => {
  const before = reservationRpcCalls.length;
  for (const status of [401, 403]) {
    reservationAuthError = new PosApiError(status, "COMU_UNAUTHORIZED", "Inicia sesión para continuar.");
    assert.equal((await reservationRoute.POST(request({ idempotencyKey: "denied" }))).status, status);
  }
  reservationAuthError = undefined;
  const disabledFeatures = await loadModule("src/lib/comu/features.ts", {}, { process: { env: {} } });
  const disabledRoute = await loadModule("src/app/api/comu/reservations/route.ts", { ...reservationRouteDeps, "@/lib/comu/features": disabledFeatures });
  const response = await disabledRoute.POST(request({ idempotencyKey: "disabled" }));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, code: "COMU_FEATURE_DISABLED", error: safeReservationError });
  assert.equal(reservationRpcCalls.length, before);
});
await check("checkout: consumes public reservation ID and keeps helper creation path compatible", async () => {
  const orderCalls = [];
  const route = await loadModule("src/app/api/comu/checkout/route.ts", {
    ...reservationRouteDeps, "node:crypto": { randomUUID },
    "@/lib/comu/orders": { async createOrderFromReservation(id, key) { orderCalls.push({ id, key }); return { id: "order-a" }; } },
  });
  const before = reservationRpcCalls.length;
  const response = await route.POST(request({ reservationId: publicReservation.id, addressId: rows[0].id, idempotencyKey: "checkout-public" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, order: { id: "order-a" } });
  assert.deepEqual(orderCalls[0], { id: publicReservation.id, key: "checkout-public:order" });
  assert.equal(reservationRpcCalls.length, before);
  assert.equal((await route.POST(request({ addressId: rows[0].id, idempotencyKey: "checkout-helper" }))).status, 200);
  assert.equal(reservationRpcCalls.at(-1).p_idempotency_key, "checkout-helper:reservation");
  assert.equal(orderCalls[1].id, reservationRows.get("checkout-helper:reservation").id);
});
console.log(`COMU behavioral with reservations: ${behavioralChecks}/${behavioralChecks} PASS (local mocks; expiry/idempotency forwarding, not DB concurrency certification)`);

await check("checkout empty: clear CTA and zero reservation/order/payment requests", async () => {
  const h = await checkoutHarness([address], false, undefined, []);
  assert.ok(textOf(h.tree).includes("Tu carrito está vacío."));
  assert.ok(textOf(h.tree).includes("Agrega algunas piezas antes de continuar."));
  assert.ok(textOf(h.tree).includes("Explorar productos"));
  assert.equal(button(h.tree, "Continuar al pago"), undefined);
  assert.equal(h.calls.some((call) => /checkout|reservations|intents/.test(call.url)), false);
});
await check("checkout unavailable item: specific message and return to cart, no mutations", async () => {
  const h = await checkoutHarness([address], false, undefined, [{ is_available: false }]);
  assert.ok(textOf(h.tree).includes("Algunos productos de tu carrito ya no están disponibles."));
  assert.equal(nodes(h.tree, (node) => node.props?.href === "/comu/cart").length, 1);
  assert.equal(h.calls.some((call) => /checkout|reservations|intents/.test(call.url)), false);
});
await check("checkout rechecks stale cart before reservation, order or intent", async () => {
  for (const items of [[], [{ is_available: false }]]) {
    const h = await checkoutHarness([address]);
    h.setCartItems(items);
    button(h.tree, "Continuar al pago").props.onClick();
    const tree = await h.flush();
    assert.equal(button(tree, "Continuar al pago"), undefined);
    assert.equal(h.calls.some((call) => /checkout|reservations|intents/.test(call.url)), false);
  }
  const h = await checkoutHarness([address]);
  h.setFailCart(true);
  button(h.tree, "Continuar al pago").props.onClick();
  const tree = await h.flush();
  assert.ok(textOf(tree).includes("No pudimos cargar tu carrito."));
  assert.equal(h.calls.some((call) => /checkout|reservations|intents/.test(call.url)), false);
});
await check("checkout racing server invalidation gives specific error and no intent", async () => {
  for (const code of ["COMU_CART_EMPTY", "COMU_VARIANT_UNAVAILABLE", "COMU_INSUFFICIENT_STOCK"]) {
    const h = await checkoutHarness([address], false, () => Response.json({ ok: false, code }, { status: 409 }));
    button(h.tree, "Continuar al pago").props.onClick();
    const tree = await h.flush();
    assert.ok(textOf(tree).includes(code === "COMU_CART_EMPTY" ? "Tu carrito está vacío." : "Algunos productos de tu carrito ya no están disponibles."));
    assert.equal(h.calls.some((call) => call.url.endsWith("/intents")), false);
  }
});
await check("empty cart page hides zero total and links to catalog", async () => {
  const h = await cartHarness(async () => Response.json({ ok: true, items: [] }));
  assert.equal(textOf(h.tree).includes("0.00"), false);
  assert.equal(nodes(h.tree, (node) => node.props?.href === "/comu/search").length, 1);
});

await check("COMU Stripe uses only its secret, without generic Stripe fallback", async () => {
  let usedKey;
  const stripeEnv = { COMU_STRIPE_SECRET_KEY: "sk_test_comu_fixture", STRIPE_SECRET_KEY: "sk_test_pos_fixture" };
  const helper = await loadModule("src/lib/comu/stripe.ts", {
    "server-only": {}, stripe: { default: class { constructor(key) { usedKey = key; } } },
  }, { process: { env: stripeEnv } });
  helper.getStripeClient();
  assert.equal(usedKey, stripeEnv.COMU_STRIPE_SECRET_KEY);
  assert.equal(helper.getStripeRuntimeMode(), false);
  delete stripeEnv.COMU_STRIPE_SECRET_KEY;
  assert.throws(() => helper.getStripeClient(), /COMU_STRIPE_ENV_MISSING/);
  const webhook = await readFile(new URL("src/app/api/comu/stripe/webhook/route.ts", root), "utf8");
  assert.ok(webhook.includes("process.env.COMU_STRIPE_WEBHOOK_SECRET"));
  assert.equal(webhook.includes("process.env.STRIPE_WEBHOOK_SECRET"), false);
});
console.log(`COMU checkout smoke guards: ${behavioralChecks}/${behavioralChecks} PASS`);

await check("valid checkout mounts Payment Element after successful order and intent", async () => {
  const h = await checkoutHarness([address]);
  button(h.tree, "Continuar al pago").props.onClick();
  await h.flush();
  const tree = await h.flush();
  assert.deepEqual(h.mounts, ["#comu-payment-element"]);
  assert.equal(button(tree, "Pagar").props.disabled, false);
  assert.ok(h.calls.findIndex((call) => call.url.endsWith("/checkout")) < h.calls.findIndex((call) => call.url.endsWith("/intents")));
});
await check("cart availability: valid data, missing/deactivated listings, price, stock and lookup errors", async () => {
  const base = {
    comu_carts: { id: "cart-a" },
    comu_cart_items: [{ id: "item-a", listing_id: "listing-a", quantity: 1, comu_product_listings: { product_id: "product-a", status: "PUBLISHED", comu_sellers: { status: "ACTIVE", verification_status: "VERIFIED" }, comu_storefronts: { status: "ACTIVE" } }, comu_variant_listings: { listing_id: "listing-a", variant_id: "variant-a", enabled: true } }],
    pos_products: [{ id: "product-a", name: "Camiseta", active: true, sellable: true }],
    pos_product_variants: [{ id: "variant-a", product_id: "product-a", active: true, price: 199 }],
    pos_inventory: [{ variant_id: "variant-a", quantity: 20, reserved_quantity: 0 }],
  };
  let fixture = structuredClone(base);
  let lookupError = false;
  const db = { from(table) {
    const result = () => ({ data: fixture[table], error: lookupError && table === "pos_inventory" ? { message: "private database error" } : null });
    const query = { upsert() { return query; }, select() { return query; }, eq() { return query; }, in() { return query; }, single() { return result(); }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
    return query;
  } };
  const testedModule = await loadModule("src/lib/comu/cart.ts", { "@/lib/pos/server": { PosApiError }, "./buyers": { requireComuBuyer: async () => ({ buyer: buyerA, admin: db }) } });
  assert.equal((await testedModule.getOrCreateCart()).items[0].is_available, true);
  for (const invalidate of [
    (f) => { f.comu_cart_items[0].comu_product_listings = null; },
    (f) => { f.comu_cart_items[0].comu_product_listings.status = "HIDDEN"; },
    (f) => { f.comu_cart_items[0].comu_product_listings.comu_sellers.status = "PAUSED"; },
    (f) => { f.comu_cart_items[0].comu_product_listings.comu_storefronts.status = "SUSPENDED"; },
    (f) => { f.comu_cart_items[0].comu_variant_listings.enabled = false; },
    (f) => { f.pos_products[0].sellable = false; },
    (f) => { f.pos_product_variants[0].active = false; },
    (f) => { f.pos_product_variants[0].price = 0; },
    (f) => { f.pos_inventory[0].reserved_quantity = 20; },
    (f) => { f.comu_cart_items[0].quantity = 21; },
  ]) {
    fixture = structuredClone(base); invalidate(fixture);
    assert.equal((await testedModule.getOrCreateCart()).items[0].is_available, false);
  }
  lookupError = true;
  await assert.rejects(testedModule.getOrCreateCart(), (error) => error.code === "COMU_CART_ITEMS_FAILED");
});
await check("add to cart selects available variant, rejects quantity < 1 and sends only cart request", async () => {
  const states = []; const refs = []; const calls = []; let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const testedModule = await loadModule("src/app/comu/products/[slug]/add-to-cart.tsx", {
    "next/link": { default: "a" }, "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = value; }]; },
      useRef(initial) { const i = cursor++; return refs[i] ||= { current: initial }; },
    },
  }, { fetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return Response.json({ ok: true }); } });
  const render = () => { cursor = 0; return testedModule.default({ listingId: "listing-a", variants: [{ id: "disabled", name: "Agotada", available: false }, { id: "valid", name: "M", available: true }] }); };
  let tree = render();
  assert.equal(nodes(tree, (node) => node.type === "select")[0].props.value, "valid");
  nodes(tree, (node) => node.type === "input")[0].props.onChange({ target: { value: "0" } });
  button(render(), "Agregar al carrito").props.onClick();
  assert.equal(calls.length, 0);
  tree = render();
  assert.ok(textOf(tree).includes("Elige al menos una pieza."));
  nodes(tree, (node) => node.type === "input")[0].props.onChange({ target: { value: "1" } });
  button(render(), "Agregar al carrito").props.onClick();
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [{ url: "/api/comu/cart", body: { listingId: "listing-a", variantListingId: "valid", quantity: 1 } }]);
  assert.ok(textOf(render()).includes("Agregado al carrito."));
  assert.equal(nodes(render(), (node) => node.props?.href === "/comu/cart").length, 1);
});
console.log(`COMU final behavioral: ${behavioralChecks}/${behavioralChecks} PASS`);

await check("payment diagnostics distinguish submit/result/exception without exposing secrets or changing confirm options", async () => {
  const error = { type: "card_error", code: "card_declined", decline_code: "generic_decline", message: "fixture sandbox-secret sk_test_private whsec_private 4242 4242 4242 4242", payment_intent: { id: "pi_fixture", client_secret: "pi_fixture_secret_private" }, card: { number: "4242424242424242" } };
  for (const diagnostic of [{ submitted: { error } }, { result: { error } }, { exception: Object.assign(new Error(error.message), { payment_intent: error.payment_intent }) }]) {
    const h = await checkoutHarness([address], false, undefined, [{ is_available: true }], { environment: "development", ...diagnostic });
    button(h.tree, "Continuar al pago").props.onClick();
    await h.flush();
    const tree = await h.flush();
    button(tree, "Pagar").props.onClick();
    await h.flush();
    const labels = h.logs.map(([label]) => label);
    const expectedLabel = diagnostic.submitted ? "COMU_STRIPE_SUBMIT_ERROR" : diagnostic.result ? "COMU_STRIPE_RESULT_ERROR" : "COMU_STRIPE_CONFIRM_EXCEPTION";
    assert.ok(labels.includes(expectedLabel));
    assert.deepEqual(h.stripeCalls, diagnostic.submitted ? ["submit"] : ["submit", "confirmPayment"]);
    if (!diagnostic.submitted) {
      const context = h.logs.find(([label]) => label === "COMU_STRIPE_CONFIRM_CONTEXT")[1];
      assert.deepEqual(JSON.parse(JSON.stringify(context)), { hasClientSecret: true, hasStripe: true, hasElements: true, orderId: "created-order", reservationId: "created-reservation" });
    }
    if (diagnostic.result) {
      const detail = h.logs.find(([label]) => label === expectedLabel)[1];
      assert.equal(detail.type, error.type); assert.equal(detail.code, error.code); assert.equal(detail.decline_code, error.decline_code); assert.equal(detail.payment_intent, "pi_fixture");
    }
    const output = JSON.stringify(h.logs);
    for (const secret of ["sandbox-secret", "sk_test_private", "whsec_private", "pi_fixture_secret_private", "4242424242424242", "4242 4242 4242 4242"]) assert.equal(output.includes(secret), false);
  }
  const h = await checkoutHarness([address], false, undefined, [{ is_available: true }], { environment: "production", exception: new Error("private") });
  button(h.tree, "Continuar al pago").props.onClick(); await h.flush(); const tree = await h.flush();
  button(tree, "Pagar").props.onClick(); await h.flush();
  assert.deepEqual(h.logs, []);
});
await check("server intent diagnostics log only metadata in development for creation and reuse", async () => {
  for (const environment of ["development", "production"]) for (const reuse of [false, true]) {
    const logs = [];
    const order = { id: "order", status: "PAYMENT_PENDING", reservation_id: "reservation", grand_total: 199, currency: "MXN" };
    const reservation = { id: "reservation", status: "COMMITTED", expires_at: new Date(Date.now() + 900000).toISOString() };
    const existing = { id: "payment", stripe_payment_intent_id: "pi_fixture", status: "REQUIRES_PAYMENT", amount_cents: 19900, currency: "MXN" };
    const intent = { id: "pi_fixture", status: "requires_payment_method", amount: 19900, currency: "mxn", client_secret: "private-client-secret" };
    const db = { from(table) { const row = table === "comu_orders" ? order : table === "comu_inventory_reservations" ? reservation : reuse ? existing : null; const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ data: row, error: null }), insert() { return query; }, single: async () => ({ data: existing, error: null }) }; return query; } };
    const payments = await loadModule("src/lib/comu/payments.ts", { "@/lib/pos/server": { PosApiError }, "./buyers": { requireComuBuyer: async () => ({ buyer: buyerA, admin: db }) }, "./stripe": { getStripeClient: () => ({ paymentIntents: { create: async () => intent, retrieve: async () => intent } }) } }, { process: { env: { NODE_ENV: environment } }, console: { log: (...args) => logs.push(args) } });
    await payments.createComuPaymentIntent(order.id, "key");
    if (environment === "development") {
      assert.ok(logs.some(([label, data]) => label === "COMU_STRIPE_RESERVATION_CONTEXT" && data.reservation_expires_at === reservation.expires_at));
      assert.ok(logs.some(([label, data]) => label === "COMU_STRIPE_PAYMENT_INTENT" && data.status === "requires_payment_method" && data.amount === 19900 && data.order_id === "order"));
      assert.equal(JSON.stringify(logs).includes(intent.client_secret), false);
    } else assert.deepEqual(logs, []);
  }
});
console.log(`COMU payment diagnostics: ${behavioralChecks}/${behavioralChecks} PASS (simulated failures, no real confirmation attempted)`);
