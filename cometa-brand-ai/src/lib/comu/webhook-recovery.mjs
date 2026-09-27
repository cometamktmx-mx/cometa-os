const DEFAULT_STALE_WEBHOOK_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

function staleBefore(now = Date.now(), thresholdMs = DEFAULT_STALE_WEBHOOK_MS) {
  const configured = Number(thresholdMs);
  const threshold = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_STALE_WEBHOOK_MS;
  return new Date(now - threshold).toISOString();
}

export async function scanStaleStripeFinanceEvents(admin, { now = Date.now(), thresholdMs = DEFAULT_STALE_WEBHOOK_MS } = {}) {
  const cutoff = staleBefore(now, thresholdMs);
  const { data, error } = await admin.from("stripe_webhook_events").select("stripe_event_id,event_type,livemode,status,received_at,processed_at,processing_started_at,attempt_count,manual_review_required,error_message,metadata").eq("status", "received").eq("manual_review_required", false).not("processed_at", "is", null).lt("processed_at", cutoff).order("processed_at", { ascending: true });
  if (error) throw error;
  return { cutoff, events: data || [] };
}

export async function recoverStaleStripeFinanceEvent(admin, eventId, { now = Date.now(), thresholdMs = DEFAULT_STALE_WEBHOOK_MS, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
  const cutoff = staleBefore(now, thresholdMs);
  const { data: current, error: readError } = await admin.from("stripe_webhook_events").select("attempt_count").eq("stripe_event_id", eventId).eq("status", "received").eq("manual_review_required", false).not("processed_at", "is", null).lt("processed_at", cutoff).maybeSingle();
  if (readError) throw readError;
  if (current && Number(current.attempt_count || 0) >= maxAttempts) {
    const { error } = await admin.from("stripe_webhook_events").update({ manual_review_required: true, manual_review_reason: "WEBHOOK_RETRY_EXHAUSTED", next_retry_at: null, processing_started_at: null }).eq("stripe_event_id", eventId).eq("status", "received");
    if (error) throw error;
    return { recovered: false, manualReview: true, event: null, cutoff };
  }
  const { data, error } = await admin.from("stripe_webhook_events").update({ processed_at: null, processing_started_at: null, next_retry_at: new Date(now).toISOString(), error_message: "WEBHOOK_STALE_PROCESSING" }).eq("stripe_event_id", eventId).eq("status", "received").eq("manual_review_required", false).not("processed_at", "is", null).lt("processed_at", cutoff).select("stripe_event_id,event_type,livemode,status,processed_at,attempt_count,error_message").maybeSingle();
  if (error) throw error;
  return { recovered: Boolean(data), event: data || null, cutoff };
}

export async function summarizeStripeFinanceEvents(admin, { now = Date.now(), thresholdMs = DEFAULT_STALE_WEBHOOK_MS } = {}) {
  const { data, error } = await admin.from("stripe_webhook_events").select("stripe_event_id,event_type,livemode,status,received_at,processed_at,processing_started_at,attempt_count,next_retry_at,manual_review_required,manual_review_reason,error_message,metadata").order("received_at", { ascending: false }).limit(500);
  if (error) throw error;
  const cutoff = staleBefore(now, thresholdMs);
  const rows = data || [];
  return {
    cutoff,
    counts: rows.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }), {}),
    processing: rows.filter((row) => row.status === "received" && row.processed_at),
    stale: rows.filter((row) => row.status === "received" && row.processed_at && row.processed_at < cutoff),
    failedRetryable: rows.filter((row) => row.status === "failed" && !row.manual_review_required),
    manualReview: rows.filter((row) => row.manual_review_required === true),
  };
}

export function classifyWebhookFailure({ attemptCount = 0, maxAttempts = DEFAULT_MAX_ATTEMPTS, reason = "WEBHOOK_FAILED" } = {}) {
  const exhausted = attemptCount >= maxAttempts;
  return { retryable: !exhausted, manualReview: exhausted, reason: exhausted ? "WEBHOOK_RETRY_EXHAUSTED" : reason };
}

export async function ingestFinalProviderShippingCost(admin, { shipmentId, finalCostCents, source, idempotencyKey }) {
  if (!shipmentId || !Number.isInteger(finalCostCents) || finalCostCents < 0 || !source || !idempotencyKey) throw new Error("FINAL_PROVIDER_COST_INPUT_INVALID");
  const { data, error } = await admin.rpc("comu_ingest_final_provider_shipping_cost", {
    p_shipment_id: shipmentId,
    p_final_provider_cost_cents: finalCostCents,
    p_source: source,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return data;
}

export function buildReconciliationCandidate({ kind, stripeId, localId, status, reason }) {
  if (!kind || !stripeId || !localId) throw new Error("RECONCILIATION_KEYS_REQUIRED");
  return { kind, stripeId, localId, status: status || "REVIEW", reason: reason || "STRIPE_LOCAL_MISMATCH" };
}

export async function scanStripeLocalReconciliation(admin, stripe) {
  if (!stripe) throw new Error("STRIPE_CLIENT_REQUIRED");
  const [payments, settlements, refunds, reversals, disputes] = await Promise.all([
    admin.from("comu_payment_intents").select("id,stripe_payment_intent_id,stripe_charge_id,status,stripe_fee_finalized_at").not("stripe_payment_intent_id", "is", null),
    admin.from("comu_seller_settlements").select("id,stripe_transfer_id,status").not("stripe_transfer_id", "is", null),
    admin.from("comu_refunds").select("id,stripe_refund_id,status").not("stripe_refund_id", "is", null),
    admin.from("comu_transfer_reversals").select("id,stripe_transfer_id,stripe_transfer_reversal_id,status").not("stripe_transfer_reversal_id", "is", null),
    admin.from("comu_disputes").select("id,stripe_dispute_id,status").not("stripe_dispute_id", "is", null),
  ]);
  for (const result of [payments, settlements, refunds, reversals, disputes]) if (result.error) throw result.error;
  const candidates = [];
  for (const row of payments.data || []) {
    let intent;
    try { intent = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id); } catch { candidates.push(buildReconciliationCandidate({ kind: "payment", stripeId: row.stripe_payment_intent_id, localId: row.id, reason: "STRIPE_LOCAL_PAYMENT_MISMATCH" })); continue; }
    if (intent.livemode || (intent.status === "succeeded" && row.status !== "SUCCEEDED")) candidates.push(buildReconciliationCandidate({ kind: "payment", stripeId: intent.id, localId: row.id, reason: intent.livemode ? "TEST_LIVE_MODE_MISMATCH" : "STRIPE_LOCAL_PAYMENT_MISMATCH" }));
  }
  for (const row of settlements.data || []) {
    let transfer;
    try { transfer = await stripe.transfers.retrieve(row.stripe_transfer_id); } catch { candidates.push(buildReconciliationCandidate({ kind: "transfer", stripeId: row.stripe_transfer_id, localId: row.id, reason: "STRIPE_LOCAL_TRANSFER_MISMATCH" })); continue; }
    if (transfer.livemode || (transfer.id && row.status !== "TRANSFERRED")) candidates.push(buildReconciliationCandidate({ kind: "transfer", stripeId: transfer.id, localId: row.id, reason: transfer.livemode ? "TEST_LIVE_MODE_MISMATCH" : "STRIPE_LOCAL_TRANSFER_MISMATCH" }));
  }
  for (const row of refunds.data || []) {
    let refund;
    try { refund = await stripe.refunds.retrieve(row.stripe_refund_id); } catch { candidates.push(buildReconciliationCandidate({ kind: "refund", stripeId: row.stripe_refund_id, localId: row.id, reason: "STRIPE_LOCAL_REFUND_MISMATCH" })); continue; }
    if (refund.livemode || (refund.status === "succeeded" && row.status !== "SUCCEEDED")) candidates.push(buildReconciliationCandidate({ kind: "refund", stripeId: refund.id, localId: row.id, reason: refund.livemode ? "TEST_LIVE_MODE_MISMATCH" : "STRIPE_LOCAL_REFUND_MISMATCH" }));
  }
  for (const row of reversals.data || []) {
    let reversal;
    try { reversal = await stripe.transfers.retrieveReversal(row.stripe_transfer_id, row.stripe_transfer_reversal_id); } catch { candidates.push(buildReconciliationCandidate({ kind: "reversal", stripeId: row.stripe_transfer_reversal_id, localId: row.id, reason: "STRIPE_LOCAL_REVERSAL_MISMATCH" })); continue; }
    if (reversal.livemode || (reversal.id && row.status !== "SUCCEEDED")) candidates.push(buildReconciliationCandidate({ kind: "reversal", stripeId: reversal.id, localId: row.id, reason: reversal.livemode ? "TEST_LIVE_MODE_MISMATCH" : "STRIPE_LOCAL_REVERSAL_MISMATCH" }));
  }
  for (const row of disputes.data || []) {
    let dispute;
    try { dispute = await stripe.disputes.retrieve(row.stripe_dispute_id); } catch { candidates.push(buildReconciliationCandidate({ kind: "dispute", stripeId: row.stripe_dispute_id, localId: row.id, reason: "DISPUTE_REQUIRES_REVIEW" })); continue; }
    if (dispute.livemode || (["won", "lost"].includes(dispute.status) && !["WON", "LOST"].includes(row.status))) candidates.push(buildReconciliationCandidate({ kind: "dispute", stripeId: dispute.id, localId: row.id, reason: dispute.livemode ? "TEST_LIVE_MODE_MISMATCH" : "DISPUTE_REQUIRES_REVIEW" }));
  }
  return candidates;
}

export async function scanProviderCostReconciliation(admin) {
  const { data: shipments, error } = await admin.from("comu_shipments").select("id,master_order_id,status,final_provider_cost_cents,final_provider_cost_finalized_at,final_provider_cost_source,updated_at");
  if (error) return { status: "PARTIAL", reason: "FINAL_PROVIDER_COST_SOURCE_UNAVAILABLE", candidates: [] };
  return { status: "PASS", candidates: (shipments || []).map((shipment) => ({ shipmentId: shipment.id, orderId: shipment.master_order_id, finalProviderCost: shipment.final_provider_cost_cents, finalizedAt: shipment.final_provider_cost_finalized_at, source: shipment.final_provider_cost_source, reason: shipment.final_provider_cost_cents == null ? "SHIPPING_AWAITING_FINAL_COST" : "SHIPPING_READY_FOR_REEVALUATION" })) };
}

export async function scanSettlementReevaluationAfterShipping(admin) {
  const { data, error } = await admin.from("comu_payment_economics").select("allocation_id,payment_id,finance_ready,shipping_finance_ready,discount_finance_ready").eq("shipping_finance_ready", true);
  if (error) throw error;
  return (data || []).map((row) => ({ allocationId: row.allocation_id, paymentId: row.payment_id, financeReady: row.finance_ready, status: row.finance_ready ? "READY_FOR_SETTLEMENT_REEVALUATION" : "BLOCKED_FINANCE_NOT_READY" }));
}
