import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const localUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(localUrl)) throw new Error("LOCAL_DATABASE_GUARD_FAILED");
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for local fixtures");
const db = createClient(localUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const baseIds = {
  sellerA: "b34a0000-0000-4000-8000-000000000001",
  sellerB: "b34a0000-0000-4000-8000-000000000002",
  buyer: "b34a0000-0000-4000-8000-000000000010",
  reservation: "b34a0000-0000-4000-8000-000000000020",
  order: "b34a0000-0000-4000-8000-000000000030",
  suborderA: "b34a0000-0000-4000-8000-000000000031",
  suborderB: "b34a0000-0000-4000-8000-000000000032",
  payment: "b34a0000-0000-4000-8000-000000000040",
  allocationA: "b34a0000-0000-4000-8000-000000000041",
  allocationB: "b34a0000-0000-4000-8000-000000000042",
};

function makeIds() {
  const u = () => crypto.randomUUID();
  return { sellerA: u(), sellerB: u(), buyer: u(), reservation: u(), order: u(), suborderA: u(), suborderB: u(), payment: u(), allocationA: u(), allocationB: u() };
}

async function insert(table, rows) {
  const { error } = await db.from(table).insert(rows);
  if (error) throw new Error(`${table}: ${error.message}`);
}

export async function cleanupCanonicalFinanceFixtures(fixtureIds = baseIds) {
  for (const [table, column, values] of [
    ["stripe_webhook_events", "stripe_event_id", [`evt_comu_fixture_dispute_open`, `evt_comu_fixture_dispute_won`, `evt_comu_fixture_dispute_lost`, `evt_comu_fixture_refund_success`, `evt_comu_fixture_refund_failed`]],
    ["comu_seller_fund_holds", "allocation_id", [fixtureIds.allocationA, fixtureIds.allocationB]],
    ["comu_financial_events", "allocation_id", [fixtureIds.allocationA, fixtureIds.allocationB]],
    ["comu_dispute_evidence_refs", "dispute_id", []],
    ["comu_transfer_reversals", "refund_id", []],
    ["comu_seller_settlement_items", "allocation_id", [fixtureIds.allocationA, fixtureIds.allocationB]],
    ["comu_seller_settlements", "id", fixtureIds.settlement ? [fixtureIds.settlement] : []],
    ["comu_disputes", "payment_id", [fixtureIds.payment]],
    ["comu_refunds", "payment_id", [fixtureIds.payment]],
    ["comu_payment_economics", "payment_id", [fixtureIds.payment]],
    ["comu_payment_transactions", "payment_id", [fixtureIds.payment]],
    ["comu_payment_allocations", "payment_id", [fixtureIds.payment]],
    ["comu_payment_intents", "id", [fixtureIds.payment]],
    ["comu_order_suborders", "id", [fixtureIds.suborderA, fixtureIds.suborderB]],
    ["comu_orders", "id", [fixtureIds.order]],
    ["comu_inventory_reservations", "id", [fixtureIds.reservation]],
    ["comu_buyers", "id", [fixtureIds.buyer]],
    ["comu_seller_memberships", "seller_id", [fixtureIds.sellerA, fixtureIds.sellerB]],
    ["comu_sellers", "id", [fixtureIds.sellerA, fixtureIds.sellerB]],
  ]) {
    if (!values.length) continue;
    const { error } = await db.from(table).delete().in(column, values);
    if (error && !/does not exist|COMU_FINANCIAL_APPEND_ONLY|violates foreign key constraint|comu_seller_liability_events/i.test(error.message)) throw new Error(`${table} cleanup: ${error.message}`);
  }
}

export async function createCanonicalFinanceFixture({ multiSeller = true, transferred = false, allocationCents = null } = {}) {
  const ids = makeIds();
  const suffix = ids.sellerA.slice(0, 8);
  await insert("comu_sellers", [
    { id: ids.sellerA, brand_id: `fixture-finance-a-${suffix}`, brand_slug: `fixture-finance-a-${suffix}`, public_name: "Fixture Seller A", slug: `fixture-finance-a-${suffix}`, status: "ACTIVE", verification_status: "VERIFIED" },
    ...(multiSeller ? [{ id: ids.sellerB, brand_id: `fixture-finance-b-${suffix}`, brand_slug: `fixture-finance-b-${suffix}`, public_name: "Fixture Seller B", slug: `fixture-finance-b-${suffix}`, status: "ACTIVE", verification_status: "VERIFIED" }] : []),
  ]);
  await insert("comu_seller_memberships", [{ seller_id: ids.sellerA, user_id: crypto.randomUUID(), role: "OWNER" }, ...(multiSeller ? [{ seller_id: ids.sellerB, user_id: crypto.randomUUID(), role: "OWNER" }] : [])]);
  await insert("comu_buyers", [{ id: ids.buyer, user_id: crypto.randomUUID(), display_name: "Fixture Buyer" }]);
  await insert("comu_inventory_reservations", [{ id: ids.reservation, buyer_id: ids.buyer, session_key: `fixture-finance-session-${suffix}`, expires_at: new Date(Date.now() + 86400000).toISOString(), idempotency_key: `fixture-finance-reservation-${suffix}` }]);
  const sellerACents = allocationCents ?? (multiSeller ? 70000 : 70000);
  const sellerBCents = multiSeller ? 90000 : 0;
  await insert("comu_orders", [{ id: ids.order, buyer_id: ids.buyer, status: "PAID", currency: "MXN", subtotal: (sellerACents + sellerBCents) / 100, grand_total: (sellerACents + sellerBCents) / 100, reservation_id: ids.reservation, idempotency_key: `fixture-finance-order-${suffix}` }]);
  await insert("comu_order_suborders", [
    { id: ids.suborderA, order_id: ids.order, seller_id: ids.sellerA, status: "DELIVERED", subtotal: sellerACents / 100, grand_total: sellerACents / 100 },
    ...(multiSeller ? [{ id: ids.suborderB, order_id: ids.order, seller_id: ids.sellerB, status: "DELIVERED", subtotal: sellerBCents / 100, grand_total: sellerBCents / 100 }] : []),
  ]);
  const paymentIntentId = `pi_comu_fixture_${suffix}`;
  const chargeId = `ch_comu_fixture_${suffix}`;
  await insert("comu_payment_intents", [{ id: ids.payment, order_id: ids.order, buyer_id: ids.buyer, stripe_payment_intent_id: paymentIntentId, stripe_charge_id: chargeId, amount_cents: sellerACents + sellerBCents, currency: "MXN", status: "SUCCEEDED", idempotency_key: `fixture-finance-payment-${suffix}` }]);
  const allocations = [{ id: ids.allocationA, payment_id: ids.payment, order_id: ids.order, suborder_id: ids.suborderA, seller_id: ids.sellerA, gross_amount_cents: sellerACents, platform_fee_cents: 0, seller_net_amount_cents: sellerACents, status: transferred ? "TRANSFERRED" : "HELD" }, ...(multiSeller ? [{ id: ids.allocationB, payment_id: ids.payment, order_id: ids.order, suborder_id: ids.suborderB, seller_id: ids.sellerB, gross_amount_cents: sellerBCents, platform_fee_cents: 0, seller_net_amount_cents: sellerBCents, status: "HELD" }] : [])];
  await insert("comu_payment_allocations", allocations);
  await insert("comu_payment_economics", allocations.map((a) => ({ payment_id: ids.payment, allocation_id: a.id, seller_id: a.seller_id, economic_gross_cents: a.gross_amount_cents })));
  if (transferred) {
    ids.settlement = crypto.randomUUID();
    await insert("comu_seller_settlements", [{ id: ids.settlement, seller_id: ids.sellerA, settlement_day: new Date().toISOString().slice(0, 10), currency: "MXN", amount_cents: sellerACents, stripe_account_id: "acct_fixture", stripe_transfer_id: `tr_fixture_${suffix}`, status: "TRANSFERRED", idempotency_key: crypto.randomUUID(), retryable: false }]);
    await insert("comu_seller_settlement_items", [{ settlement_id: ids.settlement, allocation_id: ids.allocationA, seller_id: ids.sellerA, amount_cents: sellerACents }]);
  }
  return { db, ids, sellerA: ids.sellerA, sellerB: multiSeller ? ids.sellerB : null, paymentIntentId, chargeId, allocationA: ids.allocationA, allocationB: multiSeller ? ids.allocationB : null };
}

export async function createRequestedRefund(fixture, amountCents = 70000, allocationId = fixture.allocationA, attemptKey = crypto.randomUUID()) {
  const { data: allocation, error: allocationError } = await fixture.db.from("comu_payment_allocations").select("gross_amount_cents").eq("id", allocationId).single();
  if (allocationError) throw allocationError;
  const { data: priorAllocations, error: priorError } = await fixture.db.from("comu_refund_allocations").select("refund_id,principal_cents").eq("payment_allocation_id", allocationId);
  if (priorError) throw priorError;
  let consumed = 0;
  for (const row of priorAllocations || []) {
    const { data: refund, error } = await fixture.db.from("comu_refunds").select("status").eq("id", row.refund_id).single();
    if (error) throw error;
    if (["SUCCEEDED", "REQUESTED", "PROCESSING"].includes(refund.status)) consumed += Number(row.principal_cents);
  }
  if (Number(amountCents) > Number(allocation.gross_amount_cents) - consumed) throw new Error("COMU_REFUND_REMAINING_AMOUNT_EXCEEDED");
  const { data, error } = await fixture.db.rpc("comu_request_refund", { p_payment_id: fixture.ids.payment, p_master_order_id: fixture.ids.order, p_amount_cents: amountCents, p_reason: "fixture", p_idempotency_key: `fixture-refund-${allocationId}-${attemptKey}`, p_allocations: [{ allocationId, principalCents: amountCents, shippingCents: 0 }] });
  if (error) throw new Error(`refund fixture: ${error.message}`);
  return data;
}

export async function getRefundAccounting(fixture, allocationId = fixture.allocationA) {
  const { data: allocation, error: allocationError } = await fixture.db.from("comu_payment_allocations").select("gross_amount_cents").eq("id", allocationId).single();
  if (allocationError) throw allocationError;
  const { data: links, error: linksError } = await fixture.db.from("comu_refund_allocations").select("refund_id,principal_cents").eq("payment_allocation_id", allocationId);
  if (linksError) throw linksError;
  const refundIds = (links || []).map((row) => row.refund_id);
  const refundQuery = refundIds.length ? await fixture.db.from("comu_refunds").select("id,status").in("id", refundIds) : { data: [], error: null };
  if (refundQuery.error) throw refundQuery.error;
  const refunds = refundQuery.data || [];
  const byId = new Map(refunds.map((row) => [row.id, row.status]));
  let successful = 0;
  let activeReserved = 0;
  let failed = 0;
  for (const link of links || []) {
    const amount = Number(link.principal_cents);
    const status = byId.get(link.refund_id);
    if (status === "SUCCEEDED") successful += amount;
    else if (status === "REQUESTED" || status === "PROCESSING") activeReserved += amount;
    else if (status === "FAILED" || status === "CANCELLED") failed += amount;
  }
  const original = Number(allocation.gross_amount_cents);
  return { originalRefundableCents: original, successfulRefundedCents: successful, activeReservedCents: activeReserved, failedAuditCents: failed, remainingRefundableCents: original - successful - activeReserved };
}

export { db, baseIds as ids };
