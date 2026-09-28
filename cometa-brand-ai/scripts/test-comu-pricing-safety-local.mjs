import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as integers from "../src/lib/comu/pricing-integers.mjs";
import { calculateSellerNet } from "../src/lib/comu/marketplace-economics.mjs";

class PosApiError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
function load(path, imports, env = { NODE_ENV: "test" }) {
  const context = { exports: {}, process: { env }, require(name) {
    assert.ok(Object.hasOwn(imports, name), `Forbidden dependency: ${name}`);
    return imports[name];
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const errors = { PosApiError };
const money = load("src/lib/comu/pricing-money.ts", { "@/lib/pos/server": errors, "./pricing-integers.mjs": integers });
let retail = 400, quantity = 2, policy = null, override = null, tiers = [];
let capturedReservation;
const listing = { id: "listing", product_id: "product", seller_id: "seller", storefront_id: "store", status: "PUBLISHED", retail_price_override: null,
  comu_sellers: { status: "ACTIVE", verification_status: "VERIFIED" }, comu_storefronts: { status: "ACTIVE" } };
const variantListing = { id: "vl", listing_id: "listing", variant_id: "variant", enabled: true, price_override: null };
const admin = {
  from(table) {
    const rows = {
      comu_carts: { id: "cart" },
      comu_cart_items: [{ id: "item", listing_id: "listing", seller_id: "seller", variant_listing_id: "vl", quantity, comu_product_listings: listing, comu_variant_listings: variantListing }],
      pos_products: [{ id: "product", active: true, sellable: true }],
      pos_product_variants: [{ id: "variant", product_id: "product", price: retail, active: true }],
      pos_inventory: [{ variant_id: "variant", location_id: "location", quantity: 100, reserved_quantity: 0 }],
      comu_product_listings: [listing], comu_storefront_wholesale_policies: policy ? [policy] : [],
      comu_product_wholesale_overrides: override ? [override] : [], comu_wholesale_tiers: tiers,
    };
    assert.ok(Object.hasOwn(rows, table), `Unexpected table ${table}`);
    const q = { select() { return q; }, upsert() { assert.equal(table, "comu_carts"); return q; }, eq() { return q; }, in() { return q; }, order() { return q; }, single() { return q; }, then(resolve) { return Promise.resolve({ data: rows[table], error: null }).then(resolve); } };
    return q;
  },
  async rpc(name, args) {
    assert.equal(name, "comu_reserve_inventory");
    capturedReservation = args.p_items;
    return { data: { id: "reservation" }, error: null };
  },
};
const buyer = { requireComuBuyer: async () => ({ buyer: { id: "buyer" }, admin }) };
const cart = load("src/lib/comu/cart.ts", { "@/lib/pos/server": errors, "./buyers": buyer, "./pricing-money": money });
const reservations = load("src/lib/comu/reservations.ts", { "@/lib/pos/server": errors, "./cart": cart, "node:crypto": { randomUUID: () => "fixture-only" } });
const price = async () => (await cart.getOrCreateCart()).items[0];
let item = await price();
assert.equal(item.effective_price, 400);
assert.equal(item.pricing_snapshot.retailUnitPrice, 400);
assert.equal(item.pricing_snapshot.finalUnitPrice, 400);
await reservations.createReservation("fixture-retail");
assert.equal(money.lineCents(money.moneyCents(capturedReservation[0].pricing_snapshot.finalUnitPrice), capturedReservation[0].quantity), 80000);
policy = { storefront_id: "store", enabled: true, minimum_quantity: 2, allow_product_mix: true };
tiers = [{ id: "store-tier", storefront_id: "store", product_id: null, min_quantity: 2, pricing_mode: "UNIT_PRICE", value: 350 }];
assert.equal((await price()).effective_price, 350);
override = { listing_id: "listing", mode: "CUSTOM" };
tiers.push({ id: "product-tier", storefront_id: "store", product_id: "product", min_quantity: 2, pricing_mode: "UNIT_PRICE", value: 320 });
assert.equal((await price()).effective_price, 320);
await reservations.createReservation("fixture-wholesale");
assert.equal(money.lineCents(money.moneyCents(capturedReservation[0].pricing_snapshot.finalUnitPrice), 2), 64000);
quantity = 1;
assert.equal((await price()).effective_price, 400);
quantity = 2; override = { listing_id: "listing", mode: "DISABLED" };
assert.equal((await price()).effective_price, 400);
override = null; policy = null; tiers = [];
for (const invalid of [null, undefined, 0, -1, NaN, Infinity, "", "no-price"]) {
  retail = invalid;
  await assert.rejects(price, error => error.code === "COMU_PRICE_UNAVAILABLE");
}
retail = 400;
variantListing.price_override = 390;
assert.equal((await price()).effective_price, 390);
variantListing.price_override = null;
listing.retail_price_override = 380;
assert.equal((await price()).effective_price, 380);
listing.retail_price_override = null;
retail = "0.29"; quantity = 3;
assert.equal(money.lineCents(money.moneyCents((await price()).effective_price), quantity), 87);
assert.equal(money.lineCents(1999, "1.125"), 2249);
retail = 19.99; quantity = 2;
policy = { storefront_id: "store", enabled: true, minimum_quantity: 2 };
tiers = [{ id: "pct", storefront_id: "store", product_id: null, min_quantity: 2, pricing_mode: "PERCENT_OFF", value: "12.50" }];
assert.equal((await price()).effective_price, 17.49);
tiers[0].pricing_mode = "AMOUNT_OFF"; tiers[0].value = "1.01";
assert.equal((await price()).effective_price, 18.98);
tiers[0].value = 19.99;
await assert.rejects(price, error => error.code === "COMU_PRICE_UNAVAILABLE");
for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "test", VERCEL_ENV: "production" }, { NODE_ENV: "production", VERCEL_ENV: "preview" }]) {
  const provider = load("src/lib/comu/shipping-provider.ts", {}, env);
  assert.throws(() => new provider.LocalTestShippingProvider(), error => error.code === "COMU_SHIPPING_PRODUCTION_QUOTE_REQUIRED");
}
const provider = load("src/lib/comu/shipping-provider.ts", {});
assert.ok((await new provider.LocalTestShippingProvider().quote({ packages: [{ weightKg: 1 }] })).length);
const shipping = load("src/lib/comu/shipping-pricing.ts", { "./pricing-integers.mjs": integers });
const fractionalAllocation = shipping.allocateShipping(0.03, 0.03, 400, { sellerSubsidyPercent: 50 });
assert.equal(money.moneyCents(fractionalAllocation.buyerShippingCharge) + money.moneyCents(fractionalAllocation.sellerShippingSubsidy), 3);
let authCalls = 0, orderWrites = 0, merchandise = 0, savedOrder = null;
const orderAdmin = {
  from(table) {
    let update;
    const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return q; }, single() { return q; },
      insert() { assert.equal(table, "comu_shipping_quotes"); orderWrites++; return q; },
      update(value) { assert.equal(table, "comu_orders"); update = value; orderWrites++; return q; },
      then(resolve) {
        const data = table === "comu_inventory_reservations" ? { id: "reservation" }
          : table === "comu_inventory_reservation_items" ? capturedReservation
          : table === "comu_order_items" ? [{ quantity: 2, subtotal: money.mxn(merchandise) }]
          : table === "comu_shipping_quotes" ? { id: "quote" }
          : table === "comu_orders" ? (update ? (savedOrder = update) : savedOrder || { shipping_snapshot: {} })
          : assert.fail(`Unexpected table ${table}`);
        return Promise.resolve({ data, error: null }).then(resolve);
      } };
    return q;
  },
  async rpc(name) {
    assert.equal(name, "comu_create_order_from_reservation");
    // Mock the existing SQL contract: frozen MXN snapshot wins, not a new price.
    merchandise = capturedReservation.reduce((sum, row) => sum + money.lineCents(money.moneyCents(row.pricing_snapshot.finalUnitPrice), row.quantity), 0);
    orderWrites++;
    return { data: { id: "order", subtotal: money.mxn(merchandise), grand_total: money.mxn(merchandise) }, error: null };
  },
};
function ordersFor(providerModule) {
  return load("src/lib/comu/orders.ts", {
    "@/lib/pos/server": errors, "./buyers": { requireComuBuyer: async () => { authCalls++; return { buyer: { id: "buyer" }, admin: orderAdmin }; } },
    "./stripe": { getStripeClient() { assert.fail("Stripe must never be called"); } },
    "./shipping-provider": providerModule, "./shipping-pricing": shipping, "./pricing-money": money,
  });
}
const fixtureProvider = { LocalTestShippingProvider: class { async quote() { return [{ cost: 123.45, etaDays: 5, serviceCode: "STANDARD" }]; } } };
const orders = ordersFor(fixtureProvider);
retail = 400; quantity = 2; policy = null; override = null; tiers = [];
await reservations.createReservation("retail-pipeline");
let order = await orders.createOrderFromReservation("reservation", "order-key", { city: "fixture" });
assert.equal(order.subtotal, 800);
assert.equal(order.shipping_total, 123.45);
assert.equal(order.grand_total, 923.45);
assert.equal(calculateSellerNet({ grossCents: merchandise }).netEligibleCents, 80000);
savedOrder = null;
policy = { storefront_id: "store", enabled: true, minimum_quantity: 2 };
tiers = [{ id: "wholesale", storefront_id: "store", product_id: null, min_quantity: 2, pricing_mode: "UNIT_PRICE", value: 350 }];
await reservations.createReservation("wholesale-pipeline");
order = await orders.createOrderFromReservation("reservation", "wholesale-order", {});
assert.equal(order.subtotal, 700);
assert.equal(order.grand_total, 823.45);
capturedReservation[0].pricing_snapshot.finalUnitPrice = 0;
orderWrites = 0;
await assert.rejects(() => orders.createOrderFromReservation("reservation", "legacy-zero", {}), error => error.code === "COMU_PRICE_UNAVAILABLE");
assert.equal(orderWrites, 0, "Legacy zero snapshot rejected before order RPC");
const productionOrders = ordersFor(load("src/lib/comu/shipping-provider.ts", {}, { NODE_ENV: "production" }));
authCalls = 0; orderWrites = 0;
await assert.rejects(() => productionOrders.createOrderFromReservation("reservation", "blocked", {}), error => error.code === "COMU_SHIPPING_PRODUCTION_QUOTE_REQUIRED");
assert.equal(authCalls, 0);
assert.equal(orderWrites, 0);
const response = { json(body, options) { return { body, status: options?.status || 200 }; } };
for (const path of ["src/app/api/comu/checkout/route.ts", "src/app/api/comu/shipping/quote/route.ts"]) {
  const api = load(path, { "next/server": { NextResponse: response }, "node:crypto": {},
    "@/lib/pos/server": errors, "@/lib/comu/orders": productionOrders,
    "@/lib/comu/features": { requireComuFeature() {} },
    "@/lib/comu/buyers": { requireComuBuyer() { assert.fail("Must block before any buyer write"); } },
    "@/lib/comu/reservations": { createReservation() { assert.fail("Must block before reservation"); } },
    "@/lib/comu/shipping-pricing": shipping,
  });
  const result = await api.POST({ json: async () => ({ provider: "LOCAL_TEST", subtotal: 0 }) });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "COMU_SHIPPING_PRODUCTION_QUOTE_REQUIRED");
}
console.log("PASS: retail/wholesale cart-reservation-order mocks; integer cents; immutable snapshot units; Finance conservation smoke; Production shipping fails before writes; browser cannot choose environment. External calls: 0.");
