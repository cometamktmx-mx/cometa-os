import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const env = { ...parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8")), ...process.env };
const dbUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "");
if (dbUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(dbUrl.hostname) || dbUrl.port !== "54321") throw new Error("LOCAL_DB_GUARD_FAILED");
const secret = String(env.COMU_STRIPE_SECRET_KEY || "");
if (!secret.startsWith("sk_test_")) throw new Error("STRIPE_TEST_SECRET_REQUIRED");
const stripe = new Stripe(secret, { maxNetworkRetries: 1, timeout: 20000 });
const platform = await stripe.accounts.retrieve();
if (platform.livemode === true || platform.id !== "acct_1Ln7pKIc6kd9zbVo") throw new Error("STRIPE_PLATFORM_TEST_GUARD_FAILED");
const admin = createClient(dbUrl.origin, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const connectedAccountId = "acct_1UK2cPEYRWi47uGU";
const actorId = "00000000-0000-0000-0000-0000000000c1";
const now = new Date();
const past = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
function ok(result, label) { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; }

const payment = ok(await admin.from("comu_payment_intents").select("id,order_id,status,currency,stripe_charge_id,stripe_fee_finalized_at,transfer_group").eq("status", "SUCCEEDED").not("stripe_charge_id", "is", null).not("stripe_fee_finalized_at", "is", null).order("created_at", { ascending: false }).limit(1).single(), "real payment");
const allocation = ok(await admin.from("comu_payment_allocations").select("id,seller_id,suborder_id,seller_net_amount_cents,status").eq("payment_id", payment.id).eq("status", "HELD").order("id").limit(1).single(), "ready allocation");
const seller = ok(await admin.from("comu_sellers").select("id,status").eq("id", allocation.seller_id).single(), "seller");
assert.equal(seller.status, "ACTIVE");
const previousOwner = ok(await admin.from("comu_seller_payment_accounts").select("seller_id,stripe_account_id,onboarding_status,details_submitted,charges_enabled,payouts_enabled,transfers_enabled,financial_suspended,requirements_due").eq("stripe_account_id", connectedAccountId).maybeSingle(), "connected account owner");
const targetAccountBefore = ok(await admin.from("comu_seller_payment_accounts").select("seller_id,stripe_account_id,onboarding_status,details_submitted,charges_enabled,payouts_enabled,transfers_enabled,financial_suspended,requirements_due").eq("seller_id", allocation.seller_id).maybeSingle(), "target account");
if (previousOwner && previousOwner.seller_id !== allocation.seller_id) ok(await admin.from("comu_seller_payment_accounts").update({ stripe_account_id: null }).eq("seller_id", previousOwner.seller_id), "local account fixture move");
const account = ok(await admin.from("comu_seller_payment_accounts").upsert({ seller_id: allocation.seller_id, stripe_account_id: connectedAccountId, onboarding_status: "COMPLETE", details_submitted: true, charges_enabled: true, payouts_enabled: true, transfers_enabled: true, financial_suspended: false, requirements_due: [] }, { onConflict: "seller_id" }).select("seller_id,stripe_account_id,onboarding_status,transfers_enabled,payouts_enabled,financial_suspended").single(), "connect account");
assert.equal(account.stripe_account_id, connectedAccountId);

const suborder = ok(await admin.from("comu_order_suborders").select("id,status,delivered_at,guarantee_expires_at").eq("id", allocation.suborder_id).single(), "suborder");
if (suborder.status !== "DELIVERED") {
  ok(await admin.from("comu_order_suborders").update({ delivered_at: past.toISOString(), guarantee_expires_at: new Date(past.getTime() + 4 * 86400000).toISOString(), status: "PREPARING" }).eq("id", allocation.suborder_id), "local delivery fixture");
  ok(await admin.rpc("comu_admin_deliver_suborder", { p_suborder_id: allocation.suborder_id, p_actor_id: actorId }), "deliver suborder");
}
const delivered = ok(await admin.from("comu_order_suborders").select("status,delivered_at,guarantee_expires_at").eq("id", allocation.suborder_id).single(), "delivered suborder");
assert.equal(delivered.status, "DELIVERED");
assert.ok(Date.parse(delivered.guarantee_expires_at) < Date.now());
ok(await admin.rpc("comu_release_eligible_seller_funds", { p_seller_id: allocation.seller_id }), "release eligible funds");
const settlement = ok(await admin.rpc("comu_create_daily_settlements", { p_seller_id: allocation.seller_id }), "create settlement");
if (!settlement) throw new Error("READY_SETTLEMENT_NOT_CREATED");
assert.equal(settlement.amount_cents, allocation.seller_net_amount_cents);
assert.equal(settlement.status, "PENDING");
const transferKey = `comu-transfer:${settlement.idempotency_key}`;
const before = await stripe.transfers.list({ limit: 100 });
const existingTransfer = before.data.find((transfer) => transfer.metadata?.comu_settlement_id === settlement.id);
if (existingTransfer) throw new Error("SETTLEMENT_ALREADY_HAS_TRANSFER_USE_FRESH_LOCAL_FIXTURE");
const claimed = ok(await admin.rpc("comu_claim_transfer", { p_settlement_id: settlement.id }), "claim transfer");
assert.equal(claimed.status, "PROCESSING");
const transferGroup = payment.transfer_group || `COMU_ORDER_${payment.order_id}`;
const transfer = await stripe.transfers.create({ amount: settlement.amount_cents, currency: settlement.currency.toLowerCase(), destination: account.stripe_account_id, source_transaction: payment.stripe_charge_id, transfer_group: transferGroup, metadata: { comu_settlement_id: settlement.id, comu_seller_id: settlement.seller_id, comu_order_id: payment.order_id, comu_suborder_id: allocation.suborder_id } }, { idempotencyKey: transferKey });
assert.equal(transfer.livemode, false); assert.equal(transfer.amount, settlement.amount_cents); assert.equal(transfer.destination, connectedAccountId); assert.equal(transfer.source_transaction, payment.stripe_charge_id); assert.equal(transfer.transfer_group, transferGroup); assert.equal(transfer.reversed, false); assert.equal(transfer.amount_reversed, 0);
const finished = ok(await admin.rpc("comu_finish_transfer", { p_settlement_id: settlement.id, p_transfer_id: transfer.id, p_amount_cents: transfer.amount, p_currency: transfer.currency.toUpperCase(), p_destination: connectedAccountId }), "finish transfer");
assert.equal(finished.status, "TRANSFERRED");
const duplicate = ok(await admin.rpc("comu_claim_transfer", { p_settlement_id: settlement.id }), "duplicate execution");
assert.equal(duplicate.status, "TRANSFERRED");
const after = await stripe.transfers.list({ limit: 100 });
assert.equal(after.data.filter((item) => item.metadata?.comu_settlement_id === settlement.id).length, 1);
const concurrent = await Promise.all([admin.rpc("comu_claim_transfer", { p_settlement_id: settlement.id }), admin.rpc("comu_claim_transfer", { p_settlement_id: settlement.id })]);
assert.ok(concurrent.every((result) => !result.error && result.data?.status === "TRANSFERRED"));
const persisted = ok(await admin.from("comu_seller_settlements").select("status,stripe_transfer_id,amount_cents,stripe_account_id").eq("id", settlement.id).single(), "persisted settlement");
assert.equal(persisted.status, "TRANSFERRED"); assert.equal(persisted.stripe_transfer_id, transfer.id); assert.equal(persisted.amount_cents, transfer.amount); assert.equal(persisted.stripe_account_id, connectedAccountId);
if (targetAccountBefore) ok(await admin.from("comu_seller_payment_accounts").update(targetAccountBefore).eq("seller_id", allocation.seller_id), "restore target account");
else ok(await admin.from("comu_seller_payment_accounts").delete().eq("seller_id", allocation.seller_id), "remove local target account");
if (previousOwner && previousOwner.seller_id !== allocation.seller_id) ok(await admin.from("comu_seller_payment_accounts").update(previousOwner).eq("seller_id", previousOwner.seller_id), "restore connected account owner");
const blocked = await admin.rpc("comu_claim_transfer", { p_settlement_id: crypto.randomUUID() }); assert.ok(blocked.error);
console.log(JSON.stringify({ ok: true, local: true, stripeTest: true, transferId: transfer.id, amountCents: transfer.amount, currency: transfer.currency, destination: transfer.destination, sourceTransaction: transfer.source_transaction, transferGroup: transfer.transfer_group, balanceTransactionId: typeof transfer.balance_transaction === "string" ? transfer.balance_transaction : null, destinationPaymentId: typeof transfer.destination_payment === "string" ? transfer.destination_payment : null, idempotencyKey: transferKey, duplicateCount: after.data.filter((item) => item.metadata?.comu_settlement_id === settlement.id).length, localSettlementStatus: persisted.status, payoutCalls: 0, refundCalls: 0, reversalCalls: 0 }, null, 2));
