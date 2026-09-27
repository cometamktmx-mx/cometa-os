import crypto from "node:crypto";

const endpoint = process.env.COMU_WEBHOOK_URL || "http://127.0.0.1:3000/api/comu/stripe/webhook";
const secret = process.env.COMU_STRIPE_WEBHOOK_SECRET;
if (!secret || !secret.startsWith("whsec_")) throw new Error("COMU_STRIPE_WEBHOOK_SECRET must be a local TEST signing secret");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(endpoint)) throw new Error(`Refusing non-local webhook endpoint: ${endpoint}`);

function signedRequest(event, signingSecret = secret) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = `${timestamp}.${payload}`;
  const signature = crypto.createHmac("sha256", signingSecret).update(signed).digest("hex");
  return fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` }, body: payload });
}

const paymentIntent = process.env.COMU_TEST_PAYMENT_INTENT_ID || "pi_comu_webhook_unknown";
const charge = process.env.COMU_TEST_CHARGE_ID || "ch_comu_webhook_unknown";
const eventBase = { api_version: "2025-06-30.basil", created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, request: null };
const unknown = { ...eventBase, id: `evt_comu_unknown_${Date.now()}`, type: "charge.dispute.created", data: { object: { object: "dispute", id: `dp_comu_unknown_${Date.now()}`, amount: 100, currency: "mxn", charge, payment_intent: paymentIntent, reason: "fraudulent", status: "needs_response", metadata: {} } } };

const first = await signedRequest(unknown);
const firstBody = await first.json();
if (!first.ok || firstBody?.ok !== true) throw new Error(`Unknown payment safety request failed: ${first.status}`);

const duplicate = await signedRequest(unknown);
const duplicateBody = await duplicate.json();
if (!duplicate.ok || duplicateBody?.duplicate !== true) throw new Error("Duplicate webhook was not a no-op");

const refundEvent = { ...eventBase, id: `evt_comu_refund_unknown_${Date.now()}`, type: "refund.updated", data: { object: { object: "refund", id: `re_comu_unknown_${Date.now()}`, amount: 100, currency: "mxn", payment_intent: paymentIntent, charge, status: "succeeded", metadata: {} } } };
const refundResponse = await signedRequest(refundEvent);
const refundBody = await refundResponse.json();
if (!refundResponse.ok || refundBody?.ok !== true) throw new Error(`Unknown refund safety request failed: ${refundResponse.status}`);
const refundDuplicate = await signedRequest(refundEvent);
const refundDuplicateBody = await refundDuplicate.json();
if (!refundDuplicate.ok || refundDuplicateBody?.duplicate !== true) throw new Error("Duplicate refund webhook was not a no-op");

const badSignature = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=invalid" }, body: JSON.stringify(unknown) });
if (badSignature.status !== 400) throw new Error(`Invalid signature was not rejected: ${badSignature.status}`);

const live = { ...unknown, id: `${unknown.id}_live`, livemode: true };
const liveResponse = await signedRequest(live);
if (liveResponse.status !== 400) throw new Error(`Livemode event was not rejected: ${liveResponse.status}`);

let lifecycle = "NOT_CONFIGURED";
if (process.env.COMU_RUN_LIFECYCLE === "1") {
  const fixtureModule = await import("./lib/comu-finance-fixtures.mjs");
  const fixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: true, transferred: false });
  try {
  const disputeId = `dp_comu_lifecycle_${Date.now()}`;
  const dispute = { ...eventBase, id: `evt_comu_dispute_open_${Date.now()}`, type: "charge.dispute.created", data: { object: { object: "dispute", id: disputeId, amount: 100, currency: "mxn", charge: process.env.COMU_TEST_CHARGE_ID, payment_intent: process.env.COMU_TEST_PAYMENT_INTENT_ID, reason: "fraudulent", status: "needs_response", metadata: { comu_allocation_id: process.env.COMU_TEST_ALLOCATION_ID } } } };
  dispute.data.object.charge = fixture.chargeId;
  dispute.data.object.payment_intent = fixture.paymentIntentId;
  dispute.data.object.metadata.comu_allocation_id = fixture.allocationA;
  const opened = await signedRequest(dispute);
  if (!opened.ok) throw new Error(`Dispute open ingestion failed: ${opened.status} ${await opened.text()}`);
  const { data: openRow, error: openError } = await fixture.db.from("comu_disputes").select("id,status").eq("stripe_dispute_id", disputeId).maybeSingle();
  if (openError || !openRow || openRow.status !== "OPEN") throw new Error(`Canonical dispute was not opened: ${JSON.stringify({ openError, openRow, disputeId })}`);
  const { data: openHold, error: holdError } = await fixture.db.from("comu_seller_fund_holds").select("id,status").eq("allocation_id", fixture.allocationA).eq("status", "ACTIVE").maybeSingle();
  if (holdError || !openHold) throw new Error("Dispute hold was not created");
  const { data: evidenceRows } = await fixture.db.from("comu_dispute_evidence_refs").select("evidence_type,source_table").eq("dispute_id", openRow.id);
  if (!evidenceRows?.some((row) => row.evidence_type === "MASTER_ORDER" && row.source_table === "comu_orders") || !evidenceRows.some((row) => row.evidence_type === "SUBORDER")) throw new Error("Dispute evidence references were not linked");
  const won = { ...dispute, id: `evt_comu_dispute_won_${Date.now()}`, type: "charge.dispute.closed", data: { object: { ...dispute.data.object, status: "won" } } };
  const resolved = await signedRequest(won);
  if (!resolved.ok) throw new Error(`Dispute won ingestion failed: ${resolved.status}`);
  const { data: wonRow } = await fixture.db.from("comu_disputes").select("status").eq("stripe_dispute_id", disputeId).maybeSingle();
  if (!wonRow || wonRow.status !== "WON") throw new Error("Canonical dispute was not resolved WON");
  const stale = { ...dispute, id: `evt_comu_dispute_stale_${Date.now()}`, type: "charge.dispute.updated", created: eventBase.created - 10, data: { object: { ...dispute.data.object, status: "needs_response" } } };
  if (!(await signedRequest(stale)).ok) throw new Error("Stale dispute event failed");
  const { data: terminalRow } = await fixture.db.from("comu_disputes").select("status").eq("stripe_dispute_id", disputeId).maybeSingle();
  if (!terminalRow || terminalRow.status !== "WON") throw new Error("WON state regressed on stale update");
  const duplicateWon = await signedRequest(won);
  const duplicateWonBody = await duplicateWon.json();
  if (!duplicateWon.ok || duplicateWonBody?.duplicate !== true) throw new Error("Duplicate dispute event was not a no-op");
  const refund = await fixtureModule.createRequestedRefund(fixture);
  const { data: sellerBEconomicsBefore } = await fixture.db.from("comu_payment_economics").select("refund_liability_cents").eq("allocation_id", fixture.allocationB).maybeSingle();
  const refundEvent = { ...eventBase, id: `evt_comu_refund_success_${Date.now()}`, type: "refund.updated", data: { object: { object: "refund", id: "re_comu_fixture_001", amount: refund.amount_cents, currency: "mxn", payment_intent: fixture.paymentIntentId, charge: fixture.chargeId, status: "succeeded", metadata: {} } } };
  const refundResponse = await signedRequest(refundEvent);
  if (!refundResponse.ok) throw new Error(`Refund ingestion failed: ${refundResponse.status}`);
  const { data: refundRow } = await fixture.db.from("comu_refunds").select("status,stripe_refund_id").eq("id", refund.id).maybeSingle();
  if (!refundRow || refundRow.status !== "SUCCEEDED" || refundRow.stripe_refund_id !== "re_comu_fixture_001") throw new Error("Canonical refund was not finalized");
  const duplicateRefund = await signedRequest(refundEvent);
  const duplicateRefundBody = await duplicateRefund.json();
  if (!duplicateRefund.ok || duplicateRefundBody?.duplicate !== true) throw new Error("Duplicate final refund was not a no-op");
  const { data: sellerBEconomicsAfter } = await fixture.db.from("comu_payment_economics").select("refund_liability_cents").eq("allocation_id", fixture.allocationB).maybeSingle();
  if (!sellerBEconomicsBefore || !sellerBEconomicsAfter || Number(sellerBEconomicsBefore.refund_liability_cents) !== Number(sellerBEconomicsAfter.refund_liability_cents)) throw new Error("Unrelated seller refund economics changed");

  const boundsFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: false, allocationCents: 10000 });
  let remaining = 10000;
  for (const cents of [3000, 4000, 3000]) {
    const requested = await fixtureModule.createRequestedRefund(boundsFixture, cents, boundsFixture.allocationA);
    const boundedEvent = { ...eventBase, id: `evt_comu_bounds_${crypto.randomUUID()}`, type: "refund.updated", data: { object: { object: "refund", id: `re_bounds_${crypto.randomUUID()}`, amount: cents, currency: "mxn", payment_intent: boundsFixture.paymentIntentId, charge: boundsFixture.chargeId, status: "succeeded", metadata: {} } } };
    if (!(await signedRequest(boundedEvent)).ok) throw new Error("Bounded refund failed");
    remaining -= cents;
    if (remaining < 0) throw new Error("Refund capacity became negative");
  }
  let overRefundRejected = false;
  try { await fixtureModule.createRequestedRefund(boundsFixture, 1, boundsFixture.allocationA); } catch (error) { overRefundRejected = error instanceof Error && error.message === "COMU_REFUND_REMAINING_AMOUNT_EXCEEDED"; }
  if (!overRefundRejected || remaining !== 0) throw new Error("Cumulative refund bound failed");

  const retryFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: false, transferred: true });
  const retryDisputeId = `dp_comu_retry_${Date.now()}`;
  const retryEvent = { ...eventBase, id: `evt_comu_retry_${crypto.randomUUID()}`, type: "charge.dispute.created", data: { object: { object: "dispute", id: retryDisputeId, amount: 70000, currency: "mxn", charge: retryFixture.chargeId, payment_intent: retryFixture.paymentIntentId, reason: "fraudulent", status: "needs_response", metadata: { comu_allocation_id: retryFixture.allocationA } } } };
  const failedAttempt = await signedRequest(retryEvent);
  if (failedAttempt.ok) throw new Error("Controlled RPC failure unexpectedly succeeded");
  const { data: failedLedger } = await retryFixture.db.from("stripe_webhook_events").select("status").eq("stripe_event_id", retryEvent.id).maybeSingle();
  if (!failedLedger || failedLedger.status !== "failed") throw new Error("Failed webhook was not auditable");
  await retryFixture.db.from("comu_payment_allocations").update({ status: "HELD" }).eq("id", retryFixture.allocationA);
  const retried = await signedRequest(retryEvent);
  if (!retried.ok) throw new Error("Failed webhook did not retry after repair");
  const third = await signedRequest(retryEvent);
  const thirdBody = await third.json();
  if (!third.ok || thirdBody?.duplicate !== true) throw new Error("Retried webhook was not deduplicated");
  const { data: retryDispute } = await retryFixture.db.from("comu_disputes").select("id").eq("stripe_dispute_id", retryDisputeId).maybeSingle();
  if (!retryDispute) throw new Error("Retried webhook did not commit exactly once");

  const failedRefundFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: false });
  const failedRefund = await fixtureModule.createRequestedRefund(failedRefundFixture, 4000, failedRefundFixture.allocationA);
  const failedRefundEvent = { ...eventBase, id: `evt_comu_failed_refund_${crypto.randomUUID()}`, type: "refund.updated", data: { object: { object: "refund", id: `re_failed_${crypto.randomUUID()}`, amount: 4000, currency: "mxn", payment_intent: failedRefundFixture.paymentIntentId, charge: failedRefundFixture.chargeId, status: "failed", failure_reason: "expired_card", metadata: {} } } };
  if (!(await signedRequest(failedRefundEvent)).ok) throw new Error("Failed refund webhook rejected");
  const { data: failedRefundRow } = await failedRefundFixture.db.from("comu_refunds").select("status").eq("id", failedRefund.id).maybeSingle();
  if (!failedRefundRow || failedRefundRow.status !== "FAILED") throw new Error("Failed refund was not reconciled");
  const { data: failedReversals } = await failedRefundFixture.db.from("comu_transfer_reversals").select("id").eq("refund_id", failedRefund.id);
  if (failedReversals?.length) throw new Error("Failed refund created a reversal");

  const mixedFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: false, allocationCents: 10000 });
  const mixedA = await fixtureModule.createRequestedRefund(mixedFixture, 3000, mixedFixture.allocationA);
  const mixedAEvent = { ...eventBase, id: `evt_comu_mixed_a_${crypto.randomUUID()}`, type: "refund.updated", data: { object: { object: "refund", id: `re_mixed_a_${crypto.randomUUID()}`, amount: 3000, currency: "mxn", payment_intent: mixedFixture.paymentIntentId, charge: mixedFixture.chargeId, status: "succeeded", metadata: {} } } };
  if (!(await signedRequest(mixedAEvent)).ok) throw new Error("Mixed successful refund failed");
  const mixedB = await fixtureModule.createRequestedRefund(mixedFixture, 4000, mixedFixture.allocationA);
  const mixedBEvent = { ...eventBase, id: `evt_comu_mixed_b_${crypto.randomUUID()}`, type: "refund.updated", data: { object: { object: "refund", id: `re_mixed_b_${crypto.randomUUID()}`, amount: 4000, currency: "mxn", payment_intent: mixedFixture.paymentIntentId, charge: mixedFixture.chargeId, status: "failed", failure_reason: "expired_card", metadata: {} } } };
  if (!(await signedRequest(mixedBEvent)).ok) throw new Error("Mixed failed refund rejected");
  const mixedAccounting = await fixtureModule.getRefundAccounting(mixedFixture, mixedFixture.allocationA);
  if (mixedA.id === mixedB.id || mixedAccounting.successfulRefundedCents !== 3000 || mixedAccounting.activeReservedCents !== 0 || mixedAccounting.failedAuditCents !== 4000 || mixedAccounting.remainingRefundableCents !== 7000) throw new Error(`Mixed refund accounting failed: ${JSON.stringify(mixedAccounting)}`);

  const mixedTransferFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: false, transferred: true, allocationCents: 10000 });
  const mixedTransferA = await fixtureModule.createRequestedRefund(mixedTransferFixture, 2000, mixedTransferFixture.allocationA);
  const mixedTransferAEvent = { ...eventBase, id: `evt_comu_mixed_transfer_a_${crypto.randomUUID()}`, type: "refund.updated", data: { object: { object: "refund", id: `re_mixed_transfer_a_${crypto.randomUUID()}`, amount: 2000, currency: "mxn", payment_intent: mixedTransferFixture.paymentIntentId, charge: mixedTransferFixture.chargeId, status: "succeeded", metadata: {} } } };
  if (!(await signedRequest(mixedTransferAEvent)).ok) throw new Error("Transferred mixed success failed");
  const mixedTransferB = await fixtureModule.createRequestedRefund(mixedTransferFixture, 3000, mixedTransferFixture.allocationA);
  const mixedTransferBEvent = { ...eventBase, id: `evt_comu_mixed_transfer_b_${crypto.randomUUID()}`, type: "refund.updated", data: { object: { object: "refund", id: `re_mixed_transfer_b_${crypto.randomUUID()}`, amount: 3000, currency: "mxn", payment_intent: mixedTransferFixture.paymentIntentId, charge: mixedTransferFixture.chargeId, status: "failed", failure_reason: "expired_card", metadata: {} } } };
  if (!(await signedRequest(mixedTransferBEvent)).ok) throw new Error("Transferred mixed failed refund rejected");
  const { data: mixedReversals } = await mixedTransferFixture.db.from("comu_transfer_reversals").select("amount_cents").eq("refund_id", mixedTransferA.id);
  if (!mixedReversals?.length || mixedReversals.reduce((sum, row) => sum + Number(row.amount_cents), 0) !== 2000) throw new Error("Failed refund changed reversal amount");

  const claimFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: false, transferred: false });
  const claimId = `dp_comu_claim_${crypto.randomUUID()}`;
  const claimEvent = { ...eventBase, id: `evt_comu_claim_${crypto.randomUUID()}`, type: "charge.dispute.created", data: { object: { object: "dispute", id: claimId, amount: 70000, currency: "mxn", charge: claimFixture.chargeId, payment_intent: claimFixture.paymentIntentId, reason: "fraudulent", status: "needs_response", metadata: { comu_allocation_id: claimFixture.allocationA } } } };
  const claimResponses = await Promise.all([signedRequest(claimEvent), signedRequest(claimEvent)]);
  const claimBodies = await Promise.all(claimResponses.map((response) => response.json()));
  if (claimResponses.some((response) => !response.ok) || !claimBodies.some((body) => body.processing === true || body.ok === true)) throw new Error(`Concurrent claim failed: ${JSON.stringify(claimBodies)}`);
  const { data: claimDisputes } = await claimFixture.db.from("comu_disputes").select("id").eq("stripe_dispute_id", claimId);
  if (!claimDisputes || claimDisputes.length !== 1) throw new Error("Concurrent claim created duplicate business effects");
  const { data: claimLedger } = await claimFixture.db.from("stripe_webhook_events").select("status").eq("stripe_event_id", claimEvent.id).maybeSingle();
  if (!claimLedger || claimLedger.status !== "processed") throw new Error("Concurrent claim did not finish processed");

  const retryClaimFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: false, transferred: true });
  const retryClaimId = `dp_comu_retry_claim_${crypto.randomUUID()}`;
  const retryClaimEvent = { ...eventBase, id: `evt_comu_retry_claim_${crypto.randomUUID()}`, type: "charge.dispute.created", data: { object: { object: "dispute", id: retryClaimId, amount: 70000, currency: "mxn", charge: retryClaimFixture.chargeId, payment_intent: retryClaimFixture.paymentIntentId, reason: "fraudulent", status: "needs_response", metadata: { comu_allocation_id: retryClaimFixture.allocationA } } } };
  if ((await signedRequest(retryClaimEvent)).ok) throw new Error("Retry claim setup unexpectedly succeeded");
  await retryClaimFixture.db.from("comu_payment_allocations").update({ status: "HELD" }).eq("id", retryClaimFixture.allocationA);
  const retryClaims = await Promise.all([signedRequest(retryClaimEvent), signedRequest(retryClaimEvent)]);
  const retryClaimBodies = await Promise.all(retryClaims.map((response) => response.json()));
  if (retryClaims.some((response) => !response.ok) || !retryClaimBodies.some((body) => body.processing === true || body.ok === true)) throw new Error(`Concurrent failed retry did not serialize: ${JSON.stringify(retryClaimBodies)}`);
  const { data: retryClaimDisputes } = await retryClaimFixture.db.from("comu_disputes").select("id").eq("stripe_dispute_id", retryClaimId);
  if (!retryClaimDisputes || retryClaimDisputes.length !== 1) throw new Error("Concurrent failed retry duplicated business effect");
  const { data: retryClaimLedger } = await retryClaimFixture.db.from("stripe_webhook_events").select("status").eq("stripe_event_id", retryClaimEvent.id).maybeSingle();
  if (!retryClaimLedger || retryClaimLedger.status !== "processed") throw new Error("Concurrent failed retry did not finish processed");

  const lostFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: true, transferred: false });
  const lostId = `dp_comu_lost_${Date.now()}`;
  const lostOpen = { ...eventBase, id: `evt_comu_lost_open_${Date.now()}`, type: "charge.dispute.created", data: { object: { object: "dispute", id: lostId, amount: 70000, currency: "mxn", charge: lostFixture.chargeId, payment_intent: lostFixture.paymentIntentId, reason: "fraudulent", status: "needs_response", metadata: { comu_allocation_id: lostFixture.allocationA } } } };
  if (!(await signedRequest(lostOpen)).ok) throw new Error("Lost dispute open failed");
  const { data: lostDispute } = await lostFixture.db.from("comu_disputes").select("id").eq("stripe_dispute_id", lostId).maybeSingle();
  await lostFixture.db.from("comu_dispute_allocations").update({ attribution_status: "SELLER", liability_owner: "SELLER" }).eq("dispute_id", lostDispute.id);
  const lostEvent = { ...lostOpen, id: `evt_comu_lost_closed_${Date.now()}`, type: "charge.dispute.closed", data: { object: { ...lostOpen.data.object, status: "lost" } } };
  if (!(await signedRequest(lostEvent)).ok) throw new Error("Lost dispute resolution failed");
  const { data: lostLiability } = await lostFixture.db.from("comu_seller_liability_events").select("amount_cents").eq("seller_id", lostFixture.sellerA).eq("source_id", lostDispute.id);
  if (!lostLiability?.length) throw new Error("Seller liability was not created");
  const { data: sellerBEvents } = await lostFixture.db.from("comu_seller_liability_events").select("id").eq("seller_id", lostFixture.sellerB).eq("source_id", lostDispute.id);
  if (sellerBEvents?.length) throw new Error("Unrelated seller received dispute liability");
  const duplicateLost = await signedRequest(lostEvent);
  const duplicateLostBody = await duplicateLost.json();
  if (!duplicateLost.ok || duplicateLostBody?.duplicate !== true) throw new Error("Duplicate final LOST dispute was not a no-op");
  const staleLost = { ...lostOpen, id: `evt_comu_lost_stale_${Date.now()}`, type: "charge.dispute.updated", created: eventBase.created - 20, data: { object: { ...lostOpen.data.object, status: "needs_response" } } };
  if (!(await signedRequest(staleLost)).ok) throw new Error("Stale LOST event failed");
  const { data: lostTerminal } = await lostFixture.db.from("comu_disputes").select("status").eq("stripe_dispute_id", lostId).maybeSingle();
  if (!lostTerminal || lostTerminal.status !== "LOST") throw new Error("LOST state regressed on stale update");

  const wholeFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: true, transferred: false });
  const wholeId = `dp_comu_whole_${Date.now()}`;
  const wholeOpen = { ...eventBase, id: `evt_comu_whole_open_${Date.now()}`, type: "charge.dispute.created", data: { object: { object: "dispute", id: wholeId, amount: 160000, currency: "mxn", charge: wholeFixture.chargeId, payment_intent: wholeFixture.paymentIntentId, reason: "fraudulent", status: "needs_response", metadata: {} } } };
  if (!(await signedRequest(wholeOpen)).ok) throw new Error("Whole-master dispute open failed");
  const wholeLost = { ...wholeOpen, id: `evt_comu_whole_lost_${Date.now()}`, type: "charge.dispute.closed", data: { object: { ...wholeOpen.data.object, status: "lost" } } };
  if (!(await signedRequest(wholeLost)).ok) throw new Error("Whole-master LOST failed");
  const { data: wholeDispute } = await wholeFixture.db.from("comu_disputes").select("id,status,outcome").eq("stripe_dispute_id", wholeId).maybeSingle();
  const { data: wholeAllocations } = await wholeFixture.db.from("comu_dispute_allocations").select("permanent_liability_cents,attribution_status").eq("dispute_id", wholeDispute.id);
  if (!wholeDispute || wholeDispute.status !== "UNDER_REVIEW" || wholeDispute.outcome !== "ATTRIBUTION_REQUIRED" || wholeAllocations?.some((row) => Number(row.permanent_liability_cents) !== 0 || row.attribution_status !== "ATTRIBUTION_REQUIRED")) throw new Error("Whole-master attribution safety failed");

  const cometaFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: false, transferred: false });
  const cometaId = `dp_comu_cometa_${Date.now()}`;
  const cometaOpen = { ...eventBase, id: `evt_comu_cometa_open_${Date.now()}`, type: "charge.dispute.created", data: { object: { object: "dispute", id: cometaId, amount: 70000, currency: "mxn", charge: cometaFixture.chargeId, payment_intent: cometaFixture.paymentIntentId, reason: "fraudulent", status: "needs_response", metadata: { comu_allocation_id: cometaFixture.allocationA } } } };
  if (!(await signedRequest(cometaOpen)).ok) throw new Error("COMETA dispute open failed");
  const { data: cometaDispute } = await cometaFixture.db.from("comu_disputes").select("id").eq("stripe_dispute_id", cometaId).maybeSingle();
  const { data: cometaAllocation } = await cometaFixture.db.from("comu_dispute_allocations").select("id").eq("dispute_id", cometaDispute.id).maybeSingle();
  await cometaFixture.db.from("comu_dispute_allocations").update({ attribution_status: "COMETA", liability_owner: "COMETA" }).eq("id", cometaAllocation.id);
  const cometaLost = { ...cometaOpen, id: `evt_comu_cometa_lost_${Date.now()}`, type: "charge.dispute.closed", data: { object: { ...cometaOpen.data.object, status: "lost" } } };
  if (!(await signedRequest(cometaLost)).ok) throw new Error("COMETA dispute resolution failed");
  const { data: cometaSellerDebt } = await cometaFixture.db.from("comu_seller_liability_events").select("id").eq("seller_id", cometaFixture.sellerA).eq("source_id", cometaDispute.id);
  if (cometaSellerDebt?.length) throw new Error("COMETA override was overwritten");
  const transferredFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: false, transferred: true });
  const transferredRefund = await fixtureModule.createRequestedRefund(transferredFixture);
  const transferredRefundEvent = { ...eventBase, id: `evt_comu_refund_transferred_${crypto.randomUUID()}`, type: "refund.updated", data: { object: { object: "refund", id: `re_comu_fixture_transferred_${crypto.randomUUID()}`, amount: transferredRefund.amount_cents, currency: "mxn", payment_intent: transferredFixture.paymentIntentId, charge: transferredFixture.chargeId, status: "succeeded", metadata: {} } } };
  if (!(await signedRequest(transferredRefundEvent)).ok) throw new Error("Transferred refund ingestion failed");
  const { data: reversal } = await transferredFixture.db.from("comu_transfer_reversals").select("amount_cents,status").eq("refund_id", transferredRefund.id).maybeSingle();
  if (!reversal || Number(reversal.amount_cents) !== Number(transferredRefund.amount_cents) || reversal.status !== "REQUESTED") throw new Error(`Reversal-required state missing: ${JSON.stringify({ reversal, refund: transferredRefund })}`);
    lifecycle = "PASS";
  } finally {
    await fixtureModule.cleanupCanonicalFinanceFixtures(fixture.ids);
  }
}

console.log(JSON.stringify({
  endpoint,
  unknownPayment: "PASS",
  unknownRefund: "PASS",
  duplicate: "PASS",
  badSignature: "PASS",
  livemodeRejection: "PASS",
  lifecycle,
}, null, 2));
