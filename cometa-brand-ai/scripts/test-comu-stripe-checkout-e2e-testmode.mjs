import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const fileEnv = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const env = { ...fileEnv, ...process.env };
const supabaseUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "");
if (env.NODE_ENV === "production" || env.VERCEL || supabaseUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(supabaseUrl.hostname) || supabaseUrl.port !== "54321") throw new Error("LOCAL_DB_GUARD_FAILED");
const stripeSecret = String(env.COMU_STRIPE_SECRET_KEY || "");
if (!stripeSecret.startsWith("sk_test_")) throw new Error("STRIPE_TEST_SECRET_REQUIRED");
const stripe = new Stripe(stripeSecret, { maxNetworkRetries: 1, timeout: 20000 });
const platform = await stripe.accounts.retrieve();
if (platform.livemode === true) throw new Error("STRIPE_LIVEMODE_REJECTED");
const admin = createClient(supabaseUrl.origin, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = `stripe-e2e-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const email = `${run}@example.test`;
const password = `Cert-${crypto.randomUUID()}-Aa1!`;
const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (user.error) throw user.error;
const userId = user.data.user.id;
const buyerId = crypto.randomUUID();
const addressId = crypto.randomUUID();
const port = 3001;
const base = `http://127.0.0.1:${port}`;
let child;
const createdOrders = [];
const createdReservations = [];
const inventoryBefore = new Map();

function ok(result, label) { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; }
async function waitForServer() {
  let output = "";
  child?.stdout?.on("data", (chunk) => { output += String(chunk); });
  child?.stderr?.on("data", (chunk) => { output += String(chunk); });
  for (let i = 0; i < 60; i += 1) {
    try { const response = await fetch(`${base}/api/comu/catalog`); if (response.status < 500) return; } catch {}
    await delay(1000);
  }
  throw new Error(`LOCAL_APP_START_FAILED:${output.slice(-2000)}`);
}
async function signedWebhook(event) {
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", env.COMU_STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest("hex");
  const response = await fetch(`${base}/api/comu/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` }, body: raw });
  return { response, body: await response.json() };
}
async function reserve(buyer, items) {
  const data = ok(await admin.rpc("comu_reserve_inventory", { p_buyer_id: buyer, p_session_key: run, p_idempotency_key: `${run}:${crypto.randomUUID()}`, p_items: items }), "reserve");
  createdReservations.push(data.id);
  return data;
}
async function postJson(path, cookie, body) {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { Cookie: cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text}`);
  return parsed;
}
async function reconcileEconomics(orderId, paymentId) {
  const order = ok(await admin.from("comu_orders").select("id,grand_total,shipping_snapshot,shipping_quote_id").eq("id", orderId).single(), "order");
  const allocations = ok(await admin.from("comu_payment_allocations").select("id,seller_id,gross_amount_cents").eq("payment_id", paymentId).order("id"), "allocations");
  const snapshot = order.shipping_snapshot || {};
  const provider = Number(snapshot.estimated_provider_cost ?? snapshot.provider_cost ?? snapshot.buyer_shipping_charge ?? 0);
  const buyerShipping = Number(snapshot.buyer_shipping_charge || 0);
  const sellerShipping = Number(snapshot.seller_shipping_subsidy || 0);
  const cometaShipping = Number(snapshot.cometa_shipping_subsidy || 0);
  const variance = provider - buyerShipping - sellerShipping - cometaShipping;
  const result = ok(await admin.rpc("comu_finalize_shipping_discount_economics", {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_shipping: { providerShippingCostCents: Math.round(provider * 100), buyerShippingPaidCents: Math.round(buyerShipping * 100), sellerFundedShippingCents: Math.round(sellerShipping * 100), cometaFundedShippingCents: Math.round(cometaShipping * 100), shippingVarianceCents: Math.round(variance * 100), fundingStatus: "FINALIZED", sourceQuoteId: order.shipping_quote_id },
    p_discount: { discountTotalCents: 0, sellerDiscountFundedCents: 0, cometaDiscountFundedCents: 0, embeddedPriceDiscountCents: 0, fundingStatus: "NOT_APPLICABLE" },
    p_allocations: allocations.map((row) => ({ allocationId: row.id, sellerFundedShippingCents: allocations.length === 1 ? Math.round(sellerShipping * 100) : 0, cometaFundedShippingCents: allocations.length === 1 ? Math.round(cometaShipping * 100) : 0, sellerDiscountFundedCents: 0, embeddedPriceDiscountCents: 0 })),
  }), "economics");
  return { order, allocations, result };
}

try {
  ok(await admin.from("user_profiles").upsert({ user_id: userId, email, role: "client", status: "active" }, { onConflict: "user_id" }), "profile");
  ok(await admin.from("comu_buyers").insert({ id: buyerId, user_id: userId, display_name: `${run} buyer` }), "buyer");
  ok(await admin.from("comu_buyer_addresses").insert({ id: addressId, buyer_id: buyerId, label: "QA", recipient_name: "QA Buyer", phone: "5555555555", line1: "QA 1", city: "Leon", state: "Guanajuato", postal_code: "37000", country: "MX", is_default: true }), "address");
  const listing = ok(await admin.from("comu_product_listings").select("id,seller_id,product_id").eq("public_slug", "comu-dev-camiseta-smoke").maybeSingle(), "listing");
  if (!listing) throw new Error("SMOKE_FIXTURE_MISSING_RUN_seed_comu_stripe_smoke_local");
  const variantListing = ok(await admin.from("comu_variant_listings").select("id,variant_id").eq("listing_id", listing.id).maybeSingle(), "variant listing");
  const brand = ok(await admin.from("comu_sellers").select("brand_id").eq("id", listing.seller_id).single(), "seller brand");
  const location = ok(await admin.from("pos_locations").select("id").eq("brand_id", brand.brand_id).limit(1).maybeSingle(), "location");
  const stock = ok(await admin.from("pos_inventory").select("id,quantity,reserved_quantity").eq("variant_id", variantListing.variant_id).eq("location_id", location.id).single(), "inventory");
  inventoryBefore.set(variantListing.variant_id, stock);
  const authJar = new Map();
  const auth = createServerClient(supabaseUrl.origin, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...authJar].map(([name, value]) => ({ name, value })), setAll: (cookies) => cookies.forEach(({ name, value }) => authJar.set(name, value)) } });
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const cookie = [...authJar].map(([name, value]) => `${name}=${value}`).join("; ");
  child = spawn("npm.cmd", ["run", "dev", "--", "-p", String(port)], { cwd: process.cwd(), shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1" } });
  await waitForServer();
  const item = { seller_id: listing.seller_id, listing_id: listing.id, variant_listing_id: variantListing.id, variant_id: variantListing.variant_id, location_id: location.id, quantity: 1, pricing_snapshot: null };
  const reservation = await reserve(buyerId, [item]);
  const reserved = ok(await admin.from("pos_inventory").select("quantity,reserved_quantity").eq("id", stock.id).single(), "reserved inventory");
  assert.equal(Number(reserved.reserved_quantity), Number(stock.reserved_quantity) + 1);
  const checkout = await postJson("/api/comu/checkout", cookie, { reservationId: reservation.id, addressId, idempotencyKey: `${run}:checkout`, shippingMode: "STANDARD" });
  const orderId = checkout.order.id; createdOrders.push(orderId);
  const order = ok(await admin.from("comu_orders").select("id,grand_total,subtotal,shipping_total,currency,status").eq("id", orderId).single(), "created order");
  const paymentResponse = await postJson("/api/comu/payments/intents", cookie, { orderId, idempotencyKey: `${run}:payment` });
  const payment = ok(await admin.from("comu_payment_intents").select("id,stripe_payment_intent_id,amount_cents,currency,status").eq("id", paymentResponse.paymentId).single(), "payment");
  assert.equal(payment.amount_cents, Math.round(Number(order.grand_total) * 100));
  const intentBeforeConfirm = await postJson("/api/comu/payments/intents", cookie, { orderId, idempotencyKey: `${run}:payment` }); assert.equal(intentBeforeConfirm.paymentId, paymentResponse.paymentId);
  const intent = await stripe.paymentIntents.confirm(payment.stripe_payment_intent_id, { payment_method: "pm_card_visa", return_url: `${base}/brand/connect-test-brand/comu/settings?payment=test` });
  if (intent.livemode !== false || intent.status !== "succeeded") throw new Error(`PAYMENT_CONFIRMATION_FAILED:${intent.status}`);
  const expanded = await stripe.paymentIntents.retrieve(intent.id, { expand: ["latest_charge.balance_transaction"] });
  const charge = typeof expanded.latest_charge === "string" ? await stripe.charges.retrieve(expanded.latest_charge, { expand: ["balance_transaction"] }) : expanded.latest_charge;
  if (!charge || charge.livemode) throw new Error("REAL_TEST_CHARGE_REQUIRED");
  let balance = typeof charge.balance_transaction === "string" ? await stripe.balanceTransactions.retrieve(charge.balance_transaction) : charge.balance_transaction;
  for (let attempt = 0; !balance && attempt < 5; attempt += 1) {
    await delay(1000);
    const refreshedCharge = await stripe.charges.retrieve(charge.id, { expand: ["balance_transaction"] });
    balance = typeof refreshedCharge.balance_transaction === "string" ? await stripe.balanceTransactions.retrieve(refreshedCharge.balance_transaction) : refreshedCharge.balance_transaction;
  }
  if (!balance || balance.livemode === true) throw new Error("REAL_TEST_BALANCE_TRANSACTION_REQUIRED");
  const event = { id: `evt_comu_real_payment_${crypto.randomUUID().replaceAll("-", "")}`, object: "event", api_version: "2025-03-31.basil", created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, type: "payment_intent.succeeded", data: { object: { id: expanded.id, object: "payment_intent", amount: expanded.amount, amount_received: expanded.amount_received, currency: expanded.currency, livemode: false, metadata: expanded.metadata, latest_charge: charge.id, status: "succeeded" } } };
  const first = await signedWebhook(event); assert.equal(first.response.status, 200, JSON.stringify(first.body));
  const second = await signedWebhook(event); assert.equal(second.response.status, 200); assert.equal(second.body.duplicate, true);
  const reconciled = ok(await admin.from("comu_payment_intents").select("status,stripe_charge_id,stripe_balance_transaction_id,stripe_processing_fee_cents,stripe_fee_finalized_at,transfer_group").eq("id", payment.id).single(), "reconciled payment");
  assert.equal(reconciled.status, "SUCCEEDED"); assert.equal(reconciled.stripe_charge_id, charge.id); assert.equal(reconciled.stripe_balance_transaction_id, balance.id); assert.equal(reconciled.stripe_processing_fee_cents, balance.fee); assert.equal(reconciled.transfer_group, `COMU_ORDER_${orderId}`);
  const economics = await reconcileEconomics(orderId, payment.id);
  const finance = ok(await admin.from("comu_payment_economics").select("economic_gross_cents,stripe_processing_fee_share_cents,finance_ready,seller_shipping_liability_cents,seller_discount_liability_cents").eq("payment_id", payment.id), "finance economics");
  assert.equal(finance.length, 1); assert.equal(finance[0].finance_ready, true); assert.equal(finance[0].stripe_processing_fee_share_cents, balance.fee);
  const paidStock = ok(await admin.from("pos_inventory").select("quantity,reserved_quantity").eq("id", stock.id).single(), "paid inventory");
  const orderItems = ok(await admin.from("comu_order_items").select("id").eq("order_id", orderId), "order items");
  const movements = ok(await admin.from("pos_inventory_movements").select("id").eq("variant_id", variantListing.variant_id).eq("reference_type", "comu_order_item").in("reference_id", orderItems.map((row) => row.id)), "inventory movement");
  const reservationState = ok(await admin.from("comu_inventory_reservations").select("status").eq("id", reservation.id).single(), "reservation state");
  assert.ok(Number(paidStock.quantity) <= Number(stock.quantity) - 1); assert.ok(movements.length >= 1);
  assert.equal(reservationState.status, "COMMITTED");
  const allocation = ok(await admin.from("comu_payment_allocations").select("id,gross_amount_cents,seller_id").eq("payment_id", payment.id), "allocation");
  assert.equal(allocation.length, 1); assert.equal(Number(allocation[0].gross_amount_cents) + Number(order.shipping_total) * 100, payment.amount_cents);
  console.log(JSON.stringify({ localDb: true, stripeTest: true, platformAccountId: platform.id, paymentIntentId: intent.id, chargeId: charge.id, balanceTransactionId: balance.id, actualFeeCents: balance.fee, paymentIntentAmountCents: expanded.amount, orderId, paymentId: payment.id, financeReady: finance[0].finance_ready, allocationGrossCents: allocation[0].gross_amount_cents, transferGroup: reconciled.transfer_group, sourceTransaction: charge.id, transferCount: 0, actualStripeWebhookDelivery: "PARTIAL", duplicateWebhookNoOp: Boolean(second.body.duplicate), inventoryMovementCount: movements.length, economics: economics.result }, null, 2));
} finally {
  if (child) child.kill("SIGTERM");
  await delay(500);
  await admin.auth.admin.deleteUser(userId).catch(() => {});
}
