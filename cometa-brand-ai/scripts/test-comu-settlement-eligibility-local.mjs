import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { calculateSellerNet, evaluateSettlementEligibility, findSettlementCandidates, runSettlementEligibilityWorker, SETTLEMENT_BLOCKERS } from "../src/lib/comu/settlement-eligibility.mjs";

const fileEnv = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const env = { ...fileEnv, ...process.env };
const localUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "");
if (localUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(localUrl.hostname) || localUrl.port !== "54321") throw new Error("LOCAL_DB_GUARD_FAILED");
if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("LOCAL_SERVICE_KEY_REQUIRED");
const admin = createClient(localUrl.origin, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const observed = await admin.from("comu_payment_allocations").select("id,seller_id,status,seller_net_amount_cents").limit(100);
if (observed.error) throw observed.error;

const future = "2026-10-10T00:00:00.000Z";
const base = {
  sellerId: "seller-a", allocation: { id: "allocation-a", seller_id: "seller-a", status: "AVAILABLE", seller_net_amount_cents: 50000 },
  payment: { status: "SUCCEEDED", currency: "MXN", stripe_charge_id: "ch_test_3b2", stripe_fee_finalized_at: "2026-09-26T00:00:00Z", transfer_group: "COMU_ORDER_test" },
  suborder: { delivered_at: "2026-09-01T00:00:00Z", guarantee_expires_at: "2026-09-05T00:00:00Z" },
  economics: { shippingStatus: "FINALIZED", discountStatus: "KNOWN" }, financeReady: true,
  connectAccount: { stripe_account_id: "acct_test", onboarding_status: "COMPLETE", transfers_enabled: true, financial_suspended: false },
  sellerGrossCents: 50000, processingFeeCents: 2156, sellerFundedShippingCents: 0, sellerDiscountFundedCents: 0,
  finalizedRefundLiabilityCents: 0, finalizedDisputeLiabilityCents: 0, negativeBalanceRecoveryCents: 0, auditedAdjustmentsCents: 0,
  refunds: [], disputes: [], activeHold: false,
};

const eligible = evaluateSettlementEligibility(base, future);
assert.equal(eligible.eligible, true); assert.equal(eligible.netCents, 47844); assert.equal(eligible.candidate.sourceTransaction, "ch_test_3b2");
assert.equal(eligible.candidate.idempotencyKey, "comu_settlement_allocation-a");
assert.ok(evaluateSettlementEligibility({ ...base, suborder: { ...base.suborder, delivered_at: null } }, future).reasons.includes(SETTLEMENT_BLOCKERS.NOT_DELIVERED));
assert.ok(evaluateSettlementEligibility({ ...base, suborder: { ...base.suborder, guarantee_expires_at: future } }, "2026-10-09T23:59:59Z").reasons.includes(SETTLEMENT_BLOCKERS.GUARANTEE_ACTIVE));
assert.ok(evaluateSettlementEligibility({ ...base, financeReady: false }, future).reasons.includes(SETTLEMENT_BLOCKERS.FINANCE_NOT_READY));
assert.ok(evaluateSettlementEligibility({ ...base, activeHold: true }, future).reasons.includes(SETTLEMENT_BLOCKERS.ACTIVE_HOLD));
assert.ok(evaluateSettlementEligibility({ ...base, disputes: [{ status: "OPEN" }] }, future).reasons.includes(SETTLEMENT_BLOCKERS.DISPUTE_OPEN));
assert.ok(evaluateSettlementEligibility({ ...base, refunds: [{ status: "PROCESSING" }] }, future).reasons.includes(SETTLEMENT_BLOCKERS.REFUND_PENDING));
const connectBlocked = evaluateSettlementEligibility({ ...base, connectAccount: { stripe_account_id: null, onboarding_status: "PENDING", transfers_enabled: false } }, future);
assert.equal(connectBlocked.financiallyCalculated, true); assert.deepEqual(connectBlocked.reasons, [SETTLEMENT_BLOCKERS.CONNECT_NOT_READY]);
const negative = evaluateSettlementEligibility({ ...base, sellerGrossCents: 1000, processingFeeCents: 0, negativeBalanceRecoveryCents: 1000 }, future);
assert.equal(negative.eligible, false); assert.ok(negative.reasons.includes(SETTLEMENT_BLOCKERS.NEGATIVE_NET)); assert.equal(negative.netCents, 0); assert.equal(negative.transferCandidateCents, 0);
const sellerB = { ...base, sellerId: "seller-b", allocation: { ...base.allocation, id: "allocation-b", seller_id: "seller-b" }, suborder: { delivered_at: null, guarantee_expires_at: null } };
const independent = findSettlementCandidates([base, sellerB], future); assert.equal(independent[0].eligible, true); assert.ok(independent[1].reasons.includes(SETTLEMENT_BLOCKERS.NOT_DELIVERED));
const held = findSettlementCandidates([{ ...base, sellerId: "seller-a", activeHold: true }, { ...base, sellerId: "seller-b", allocation: { ...base.allocation, id: "allocation-b" } }], future); assert.equal(held[0].eligible, false); assert.equal(held[1].eligible, true);
const failed = evaluateSettlementEligibility({ ...base, payment: { ...base.payment, status: "FAILED", stripe_charge_id: null, stripe_fee_finalized_at: null }, financeReady: false }, future); assert.ok(failed.reasons.includes(SETTLEMENT_BLOCKERS.PAYMENT_NOT_FINAL));
const worker1 = runSettlementEligibilityWorker([base, base], future); const worker2 = runSettlementEligibilityWorker([base, base], future); assert.equal(worker1.filter((x) => !x.duplicate).length, 1); assert.deepEqual(worker1, worker2);
assert.equal(calculateSellerNet({ sellerGrossCents: 50000, processingFeeCents: 2156, sellerFundedShippingCents: 3000, sellerDiscountFundedCents: 700, finalizedRefundLiabilityCents: 2000, finalizedDisputeLiabilityCents: 1000, negativeBalanceRecoveryCents: 1500, auditedAdjustmentsCents: 0 }), 39644);
console.log(JSON.stringify({ ok: true, local: true, observedAllocations: observed.data.length, checks: ["happy path", "reason codes", "connect calculation gate", "negative net", "multi-seller independence", "failed payment exclusion", "idempotent worker", "exact cents"], transferCalls: 0 }, null, 2));
