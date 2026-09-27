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
const secret = String(env.COMU_STRIPE_SECRET_KEY || "");
if (!secret.startsWith("sk_test_")) throw new Error("STRIPE_TEST_SECRET_REQUIRED");
if (!env.COMU_STRIPE_WEBHOOK_SECRET || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("CERTIFICATION_ENV_MISSING");
const stripe = new Stripe(secret, { maxNetworkRetries: 1, timeout: 20000 });
const platform = await stripe.accounts.retrieve();
if (platform.livemode === true) throw new Error("STRIPE_LIVEMODE_REJECTED");
const admin = createClient(supabaseUrl.origin, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = `stripe-dispute-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const email = `${run}@example.test`;
const password = `Cert-${crypto.randomUUID()}-Aa1!`;
const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (user.error) throw user.error;
const userId = user.data.user.id;
let buyerId;
let addressId;
const base = "http://127.0.0.1:3001";
let child;

function data(result, label) { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; }
async function postJson(path, cookie, body) {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { Cookie: cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text}`);
  return parsed;
}
async function signedWebhook(event) {
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", env.COMU_STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest("hex");
  const response = await fetch(`${base}/api/comu/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` }, body: raw });
  return { response, body: await response.json() };
}
async function waitForServer() {
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  for (let i = 0; i < 60; i += 1) {
    try { const response = await fetch(`${base}/api/comu/catalog`); if (response.status < 500) return; } catch {}
    await delay(1000);
  }
  throw new Error(`LOCAL_APP_START_FAILED:${output.slice(-2000)}`);
}
function eventFor(type, object, suffix) {
  return { id: `evt_comu_dispute_${suffix}_${crypto.randomUUID().replaceAll("-", "")}`, object: "event", api_version: "2025-03-31.basil", created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, type, data: { object } };
}
async function waitForDispute(chargeId) {
  for (let i = 0; i < 30; i += 1) {
    const found = (await stripe.disputes.list({ limit: 100 })).data.find((item) => item.charge === chargeId);
    if (found) return found;
    await delay(1000);
  }
  throw new Error(`REAL_DISPUTE_NOT_CREATED:${chargeId}`);
}
async function createOrder(paymentMethod) {
  buyerId = crypto.randomUUID();
  addressId = crypto.randomUUID();
  const existingBuyer = data(await admin.from("comu_buyers").select("id").eq("user_id", userId).maybeSingle(), "buyer lookup");
  if (existingBuyer) buyerId = existingBuyer.id;
  else data(await admin.from("comu_buyers").insert({ id: buyerId, user_id: userId, display_name: `${run} buyer` }), "buyer");
  data(await admin.from("comu_buyer_addresses").insert({ id: addressId, buyer_id: buyerId, label: "QA", recipient_name: "QA Buyer", phone: "5555555555", line1: "QA 1", city: "Leon", state: "Guanajuato", postal_code: "37000", country: "MX", is_default: true }), "address");
  const seedListing = data(await admin.from("comu_product_listings").select("seller_id").eq("public_slug", "comu-dev-camiseta-smoke").maybeSingle(), "listing");
  if (!seedListing) throw new Error("SMOKE_FIXTURE_MISSING_RUN_seed_comu_stripe_smoke_local");
  const listing = { id: crypto.randomUUID(), seller_id: seedListing.seller_id, product_id: crypto.randomUUID() };
  const variant = { id: crypto.randomUUID() };
  const variantListing = { id: crypto.randomUUID(), variant_id: variant.id };
  const existingStorefront = data(await admin.from("comu_storefronts").select("id").eq("seller_id", listing.seller_id).limit(1).maybeSingle(), "storefront lookup");
  const storefront = existingStorefront?.id || crypto.randomUUID();
  const seller = data(await admin.from("comu_sellers").select("brand_id").eq("id", listing.seller_id).single(), "seller");
  const location = data(await admin.from("pos_locations").select("id").eq("brand_id", seller.brand_id).limit(1).single(), "location");
  const brand = data(await admin.from("comu_sellers").select("brand_id,brand_slug").eq("id", listing.seller_id).single(), "seller");
  data(await admin.from("pos_products").insert({ id: listing.product_id, brand_id: seller.brand_id, brand_slug: brand.brand_slug, name: `${run} Product`, product_type: "physical", track_inventory: true, inventory_mode: "direct", default_unit_code: "piece", tax_rate: 0, active: true, sellable: true, has_variants: true }), "product");
  data(await admin.from("pos_product_variants").insert({ id: variant.id, brand_id: seller.brand_id, brand_slug: brand.brand_slug, product_id: listing.product_id, name: "Variant", sku: `${run}-${crypto.randomUUID()}`, price: 199, cost: 0, unit_code: "piece", attributes: {}, active: true, is_default: true, variant_signature: {} }), "variant");
  if (!existingStorefront) data(await admin.from("comu_storefronts").insert({ id: storefront, seller_id: listing.seller_id, name: `${run} Store`, slug: `${run}-store`, status: "ACTIVE" }), "storefront");
  const listingSlug = `${run}-${paymentMethod}-${crypto.randomUUID()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  data(await admin.from("comu_product_listings").insert({ id: listing.id, seller_id: listing.seller_id, storefront_id: storefront, product_id: listing.product_id, public_slug: listingSlug, status: "PUBLISHED", title_override: `${run} Product`, retail_price_override: 199 }), "listing");
  data(await admin.from("comu_variant_listings").insert({ id: variantListing.id, listing_id: listing.id, variant_id: variant.id, enabled: true, price_override: 199 }), "variant listing");
  data(await admin.from("pos_inventory").insert({ id: crypto.randomUUID(), brand_id: seller.brand_id, brand_slug: brand.brand_slug, location_id: location.id, variant_id: variant.id, quantity: 20, reserved_quantity: 0, minimum_quantity: 0 }), "inventory fixture");
  const stock = data(await admin.from("pos_inventory").select("id,quantity,reserved_quantity").eq("variant_id", variantListing.variant_id).eq("location_id", location.id).single(), "inventory");
  const attemptKey = `${run}:${paymentMethod}:${crypto.randomUUID()}`;
  const reservation = data(await admin.rpc("comu_reserve_inventory", { p_buyer_id: buyerId, p_session_key: attemptKey, p_idempotency_key: attemptKey, p_items: [{ seller_id: listing.seller_id, listing_id: listing.id, variant_listing_id: variantListing.id, variant_id: variantListing.variant_id, location_id: location.id, quantity: 1, pricing_snapshot: null }] }), "reserve");
  const authJar = new Map();
  const auth = createServerClient(supabaseUrl.origin, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...authJar].map(([name, value]) => ({ name, value })), setAll: (cookies) => cookies.forEach(({ name, value }) => authJar.set(name, value)) } });
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const cookie = [...authJar].map(([name, value]) => `${name}=${value}`).join("; ");
  const checkout = await postJson("/api/comu/checkout", cookie, { reservationId: reservation.id, addressId, idempotencyKey: `${attemptKey}:checkout`, shippingMode: "STANDARD" });
  const paymentResult = await postJson("/api/comu/payments/intents", cookie, { orderId: checkout.order.id, idempotencyKey: `${attemptKey}:payment` });
  const payment = data(await admin.from("comu_payment_intents").select("id,order_id,stripe_payment_intent_id,amount_cents,currency").eq("id", paymentResult.paymentId).single(), "payment");
  const intent = await stripe.paymentIntents.confirm(payment.stripe_payment_intent_id, { payment_method: paymentMethod, return_url: `${base}/brand/connect-test-brand/comu/settings?payment=test` });
  assert.equal(intent.livemode, false); assert.equal(intent.status, "succeeded");
  const expanded = await stripe.paymentIntents.retrieve(intent.id, { expand: ["latest_charge.balance_transaction"] });
  const charge = typeof expanded.latest_charge === "string" ? await stripe.charges.retrieve(expanded.latest_charge) : expanded.latest_charge;
  assert.ok(charge && charge.livemode === false);
  let balance = typeof charge.balance_transaction === "string" ? await stripe.balanceTransactions.retrieve(charge.balance_transaction) : charge.balance_transaction;
  for (let attempt = 0; !balance && attempt < 10; attempt += 1) {
    await delay(1000);
    const refreshedCharge = await stripe.charges.retrieve(charge.id, { expand: ["balance_transaction"] });
    balance = typeof refreshedCharge.balance_transaction === "string" ? await stripe.balanceTransactions.retrieve(refreshedCharge.balance_transaction) : refreshedCharge.balance_transaction;
  }
  assert.ok(balance && balance.livemode !== true);
  const paymentEvent = eventFor("payment_intent.succeeded", { id: intent.id, object: "payment_intent", amount: intent.amount, amount_received: intent.amount_received, currency: intent.currency, livemode: false, metadata: intent.metadata, latest_charge: charge.id, status: "succeeded" }, paymentMethod);
  const paymentDelivery = await signedWebhook(paymentEvent); assert.equal(paymentDelivery.response.status, 200, JSON.stringify(paymentDelivery.body));
  const order = data(await admin.from("comu_orders").select("id,status").eq("id", checkout.order.id).single(), "order");
  const allocation = data(await admin.from("comu_payment_allocations").select("id,seller_id,suborder_id,gross_amount_cents").eq("payment_id", payment.id).single(), "allocation");
  return { payment, intent, charge, balance, order, allocation, stock, reservation };
}
async function ingestOpen(record, dispute) {
  const open = await signedWebhook(eventFor("charge.dispute.created", dispute, "open"));
  assert.equal(open.response.status, 200, JSON.stringify(open.body));
  const canonical = data(await admin.from("comu_disputes").select("id,status,amount_cents,actual_dispute_cost_cents").eq("stripe_dispute_id", dispute.id).single(), "canonical dispute");
  const allocation = data(await admin.from("comu_dispute_allocations").select("seller_id,exposed_principal_cents,permanent_liability_cents,hold_id,attribution_status").eq("dispute_id", canonical.id).single(), "dispute allocation");
  assert.equal(canonical.status, "OPEN"); assert.equal(allocation.permanent_liability_cents, 0); assert.ok(allocation.hold_id); assert.equal(allocation.attribution_status, "ATTRIBUTION_REQUIRED");
  return { canonical, allocation };
}
async function resolve(record, dispute, outcome) {
  if (outcome === "LOST") {
    const current = data(await admin.from("comu_dispute_allocations").select("id").eq("dispute_id", record.canonical.id).single(), "lost allocation");
    data(await admin.rpc("comu_set_financial_liability_owner", { p_dispute_allocation_id: current.id, p_liability_owner: "SELLER", p_reason_code: "ADMIN_CORRECTION", p_note: "Real Stripe Test loss attribution", p_actor_id: null, p_idempotency_key: `${run}:lost-owner` }), "seller attribution");
  }
  const submitted = await stripe.disputes.update(dispute.id, { evidence: { uncategorized_text: outcome === "WON" ? "winning_evidence" : "losing_evidence" } });
  assert.equal(submitted.livemode, false);
  let final = submitted;
  for (let i = 0; i < 30 && !["won", "lost"].includes(final.status); i += 1) { await delay(1000); final = await stripe.disputes.retrieve(dispute.id); }
  final = await stripe.disputes.retrieve(dispute.id, { expand: ["balance_transactions"] });
  assert.equal(final.status, outcome === "WON" ? "won" : "lost");
  const terminalEvent = eventFor("charge.dispute.updated", final, outcome.toLowerCase());
  const delivery = await signedWebhook(terminalEvent);
  assert.equal(delivery.response.status, 200, JSON.stringify(delivery.body));
  const duplicate = await signedWebhook(terminalEvent);
  assert.equal(duplicate.response.status, 200); assert.equal(duplicate.body.duplicate, true);
  const canonical = data(await admin.from("comu_disputes").select("id,status,outcome,actual_dispute_cost_cents").eq("id", record.canonical.id).single(), "resolved dispute");
  const allocation = data(await admin.from("comu_dispute_allocations").select("permanent_liability_cents,dispute_cost_share_cents,hold_id,attribution_status").eq("dispute_id", canonical.id).single(), "resolved allocation");
  assert.equal(canonical.status, outcome); assert.equal(canonical.outcome, outcome); assert.equal(allocation.permanent_liability_cents, outcome === "WON" ? 0 : record.allocation.exposed_principal_cents);
  const hold = data(await admin.from("comu_seller_fund_holds").select("status").eq("id", record.allocation.hold_id).single(), "hold");
  assert.equal(hold.status, "RELEASED");
  return { final, canonical, allocation, hold, duplicate: duplicate.body };
}

try {
  data(await admin.from("user_profiles").upsert({ user_id: userId, email, role: "client", status: "active" }, { onConflict: "user_id" }), "profile");
  child = spawn("npm.cmd", ["run", "dev", "--", "-p", "3001"], { cwd: process.cwd(), shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1" } });
  await waitForServer();
  const wonPayment = await createOrder("pm_card_createDisputeProductNotReceived");
  const wonDispute = await waitForDispute(wonPayment.charge.id);
  assert.equal(wonDispute.livemode, false);
  const wonOpen = await ingestOpen(wonPayment, wonDispute);
  const won = await resolve(wonOpen, wonDispute, "WON");
  const lostPayment = await createOrder("pm_card_createDisputeProductNotReceived");
  const lostDispute = await waitForDispute(lostPayment.charge.id);
  assert.equal(lostDispute.livemode, false);
  const lostOpen = await ingestOpen(lostPayment, lostDispute);
  const lost = await resolve(lostOpen, lostDispute, "LOST");
  const lostBalanceTransactions = await stripe.disputes.retrieve(lostDispute.id, { expand: ["balance_transactions"] });
  const wonBalanceTransactions = await stripe.disputes.retrieve(wonDispute.id, { expand: ["balance_transactions"] });
  const wonEvidence = data(await admin.from("comu_dispute_evidence_refs").select("evidence_type").eq("dispute_id", wonOpen.canonical.id), "won evidence");
  const lostLiability = data(await admin.from("comu_seller_liability_events").select("amount_cents,liability_owner,source_type").eq("source_type", "DISPUTE").eq("source_id", lostOpen.canonical.id.toString()), "lost liability");
  assert.ok(wonEvidence.length >= 2); assert.ok(lostLiability.some((row) => row.liability_owner === "SELLER"));
  console.log(JSON.stringify({ ok: true, localDb: true, stripeTest: true, paymentMethod: "pm_card_createDisputeProductNotReceived", won: { paymentIntentId: wonPayment.intent.id, chargeId: wonPayment.charge.id, disputeId: wonDispute.id, reason: wonDispute.reason, amountCents: wonDispute.amount, status: won.final.status, balanceTransactions: wonBalanceTransactions.balance_transactions, openHold: Boolean(wonOpen.allocation.hold_id), openPermanentLiabilityCents: 0, finalPermanentLiabilityCents: won.allocation.permanent_liability_cents, duplicateNoOp: Boolean(won.duplicate.duplicate) }, lost: { paymentIntentId: lostPayment.intent.id, chargeId: lostPayment.charge.id, disputeId: lostDispute.id, reason: lostDispute.reason, amountCents: lostDispute.amount, status: lost.final.status, balanceTransactions: lostBalanceTransactions.balance_transactions, openHold: Boolean(lostOpen.allocation.hold_id), finalPermanentLiabilityCents: lost.allocation.permanent_liability_cents, disputeCostCents: lost.allocation.dispute_cost_share_cents, duplicateNoOp: Boolean(lost.duplicate.duplicate) }, evidenceRefs: { won: wonEvidence.length }, actualStripeWebhookDelivery: "PARTIAL", payoutCalls: 0, transferCalls: 0, refundCalls: 0, reversalCalls: 0 }, null, 2));
} finally {
  if (child) child.kill("SIGTERM");
  await delay(500);
  await admin.auth.admin.deleteUser(userId).catch(() => {});
}
