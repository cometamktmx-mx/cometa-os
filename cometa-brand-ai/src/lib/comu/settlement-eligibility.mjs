const TERMINAL_SETTLEMENT_STATUSES = new Set(["TRANSFERRED", "CANCELLED"]);

export const SETTLEMENT_BLOCKERS = Object.freeze({
  PAYMENT_NOT_FINAL: "PAYMENT_NOT_FINAL",
  FINANCE_NOT_READY: "FINANCE_NOT_READY",
  NOT_DELIVERED: "NOT_DELIVERED",
  GUARANTEE_ACTIVE: "GUARANTEE_ACTIVE",
  ACTIVE_HOLD: "ACTIVE_HOLD",
  DISPUTE_OPEN: "DISPUTE_OPEN",
  REFUND_PENDING: "REFUND_PENDING",
  SHIPPING_UNRESOLVED: "SHIPPING_UNRESOLVED",
  DISCOUNT_UNRESOLVED: "DISCOUNT_UNRESOLVED",
  CONNECT_NOT_READY: "CONNECT_NOT_READY",
  NEGATIVE_NET: "NEGATIVE_NET",
  ALREADY_SETTLED: "ALREADY_SETTLED",
});

function cents(value, name) {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n)) throw new Error(`${name}_MUST_BE_INTEGER_CENTS`);
  return n;
}

function hasPendingRefund(refunds = []) {
  return refunds.some((refund) => ["REQUESTED", "PROCESSING", "PENDING"].includes(refund.status));
}

function hasOpenDispute(disputes = []) {
  return disputes.some((dispute) => ["OPEN", "UNDER_REVIEW", "ATTRIBUTION_REQUIRED"].includes(dispute.status));
}

export function calculateSellerNet(input) {
  const gross = cents(input.sellerGrossCents ?? input.sellerNetAmountCents, "sellerGrossCents");
  const processingFee = cents(input.processingFeeCents, "processingFeeCents");
  const shipping = cents(input.sellerFundedShippingCents, "sellerFundedShippingCents");
  const discount = cents(input.sellerDiscountFundedCents, "sellerDiscountFundedCents");
  const refunds = cents(input.finalizedRefundLiabilityCents, "finalizedRefundLiabilityCents");
  const disputes = cents(input.finalizedDisputeLiabilityCents, "finalizedDisputeLiabilityCents");
  const recovery = cents(input.negativeBalanceRecoveryCents, "negativeBalanceRecoveryCents");
  const adjustments = cents(input.auditedAdjustmentsCents, "auditedAdjustmentsCents");
  return gross - processingFee - shipping - discount - refunds - disputes - recovery + adjustments;
}

export function evaluateSettlementEligibility(input, now = new Date()) {
  const evaluatedAt = new Date(now);
  if (Number.isNaN(evaluatedAt.getTime())) throw new Error("INVALID_EVALUATION_TIME");
  const payment = input.payment || {};
  const suborder = input.suborder || {};
  const economics = input.economics || {};
  const account = input.connectAccount || {};
  const settlement = input.settlement || null;
  const net = calculateSellerNet({ ...input, sellerGrossCents: input.sellerGrossCents ?? input.allocation?.seller_net_amount_cents });
  const reasons = [];

  if (payment.status !== "SUCCEEDED" || !payment.stripe_charge_id || payment.stripe_fee_finalized_at == null) reasons.push(SETTLEMENT_BLOCKERS.PAYMENT_NOT_FINAL);
  if (input.allocation?.status && !["AVAILABLE", "PENDING_TRANSFER"].includes(input.allocation.status)) reasons.push(SETTLEMENT_BLOCKERS.FINANCE_NOT_READY);
  if (input.financeReady !== true) reasons.push(SETTLEMENT_BLOCKERS.FINANCE_NOT_READY);
  if (economics.shippingStatus === "PENDING" || economics.shippingStatus === "UNKNOWN") reasons.push(SETTLEMENT_BLOCKERS.SHIPPING_UNRESOLVED);
  if (economics.discountStatus === "UNKNOWN" || economics.discountStatus === "PENDING") reasons.push(SETTLEMENT_BLOCKERS.DISCOUNT_UNRESOLVED);
  if (!suborder.delivered_at) reasons.push(SETTLEMENT_BLOCKERS.NOT_DELIVERED);
  else if (!suborder.guarantee_expires_at || new Date(suborder.guarantee_expires_at) > evaluatedAt) reasons.push(SETTLEMENT_BLOCKERS.GUARANTEE_ACTIVE);
  if (input.activeHold === true) reasons.push(SETTLEMENT_BLOCKERS.ACTIVE_HOLD);
  if (hasOpenDispute(input.disputes)) reasons.push(SETTLEMENT_BLOCKERS.DISPUTE_OPEN);
  if (hasPendingRefund(input.refunds)) reasons.push(SETTLEMENT_BLOCKERS.REFUND_PENDING);
  if (settlement && TERMINAL_SETTLEMENT_STATUSES.has(settlement.status)) reasons.push(SETTLEMENT_BLOCKERS.ALREADY_SETTLED);
  if (net <= 0) reasons.push(SETTLEMENT_BLOCKERS.NEGATIVE_NET);

  const financiallyCalculated = !reasons.some((reason) => [SETTLEMENT_BLOCKERS.PAYMENT_NOT_FINAL, SETTLEMENT_BLOCKERS.FINANCE_NOT_READY, SETTLEMENT_BLOCKERS.SHIPPING_UNRESOLVED, SETTLEMENT_BLOCKERS.DISCOUNT_UNRESOLVED, SETTLEMENT_BLOCKERS.NOT_DELIVERED, SETTLEMENT_BLOCKERS.GUARANTEE_ACTIVE, SETTLEMENT_BLOCKERS.ACTIVE_HOLD, SETTLEMENT_BLOCKERS.DISPUTE_OPEN, SETTLEMENT_BLOCKERS.REFUND_PENDING, SETTLEMENT_BLOCKERS.ALREADY_SETTLED].includes(reason));
  const connectReady = account.onboarding_status === "COMPLETE" && account.transfers_enabled === true && account.financial_suspended !== true && typeof account.stripe_account_id === "string" && account.stripe_account_id.length > 0;
  if (financiallyCalculated && net > 0 && !connectReady) reasons.push(SETTLEMENT_BLOCKERS.CONNECT_NOT_READY);
  const blocked = reasons.length > 0;
  const eligible = !blocked;
  const candidate = eligible ? {
    sellerConnectedAccountId: account.stripe_account_id,
    amountCents: net,
    currency: payment.currency || "MXN",
    sourceTransaction: payment.stripe_charge_id,
    transferGroup: payment.transfer_group,
    settlementId: settlement?.id ?? `allocation_${input.allocation?.id ?? "unknown"}`,
    idempotencyKey: `comu_settlement_${settlement?.id ?? input.allocation?.id ?? "unknown"}`,
  } : null;
  return { eligible, financiallyCalculated, transferExecutable: eligible, netCents: net, transferCandidateCents: eligible ? net : 0, reasons: [...new Set(reasons)], evaluatedAt: evaluatedAt.toISOString(), candidate };
}

export function findSettlementCandidates(rows, now = new Date()) {
  return rows.map((row) => ({ allocationId: row.allocation?.id ?? row.allocationId, sellerId: row.sellerId ?? row.allocation?.seller_id, ...evaluateSettlementEligibility(row, now) }));
}

export function runSettlementEligibilityWorker(rows, now = new Date()) {
  const evaluations = findSettlementCandidates(rows, now);
  const seen = new Set();
  return evaluations.map((evaluation) => {
    const key = evaluation.allocationId;
    if (seen.has(key)) return { ...evaluation, duplicate: true };
    seen.add(key);
    return { ...evaluation, duplicate: false };
  });
}
