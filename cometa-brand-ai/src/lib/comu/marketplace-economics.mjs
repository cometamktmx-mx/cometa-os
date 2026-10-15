function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function stableKey(row) {
  return `${row.sellerId}\u0000${row.suborderId}`;
}

/**
 * Allocates the actual Stripe fee to sellers by economic gross, using
 * largest-remainder rounding. COMETA's marketplace share is always zero.
 */
export function allocateStripeProcessingFee({ totalFeeCents, sellerAllocations }) {
  const fee = integer(totalFeeCents, "totalFeeCents");
  if (!Array.isArray(sellerAllocations) || sellerAllocations.length === 0) return [];
  const rows = sellerAllocations.map((row) => ({
    sellerId: String(row.sellerId),
    suborderId: String(row.suborderId),
    economicGrossCents: integer(row.economicGrossCents, "economicGrossCents"),
  }));
  const totalGross = rows.reduce((sum, row) => sum + row.economicGrossCents, 0);
  if (fee > 0 && totalGross === 0) throw new Error("Cannot allocate a fee without economic gross");
  const base = rows.map((row) => {
    const numerator = fee * row.economicGrossCents;
    const share = totalGross === 0 ? 0 : Math.floor(numerator / totalGross);
    return { ...row, share, remainder: totalGross === 0 ? 0 : numerator % totalGross };
  });
  let residual = fee - base.reduce((sum, row) => sum + row.share, 0);
  base.sort((a, b) => b.remainder - a.remainder || stableKey(a).localeCompare(stableKey(b)));
  for (let index = 0; residual > 0; index += 1, residual -= 1) base[index % base.length].share += 1;
  return base
    .sort((a, b) => stableKey(a).localeCompare(stableKey(b)))
    .map(({ sellerId, suborderId, economicGrossCents, share }) => ({ sellerId, suborderId, economicGrossCents, stripeProcessingFeeShareCents: share }));
}

export function calculateSellerNet({ grossCents, stripeProcessingFeeShareCents = 0, sellerFundedShippingCents = 0, sellerFundedDiscountCents = 0, refundLiabilityCents = 0, disputeLiabilityCents = 0, negativeBalanceRecoveryCents = 0, adjustmentsCents = 0 }) {
  const values = { grossCents, stripeProcessingFeeShareCents, sellerFundedShippingCents, sellerFundedDiscountCents, refundLiabilityCents, disputeLiabilityCents, negativeBalanceRecoveryCents };
  for (const [label, value] of Object.entries(values)) integer(value, label);
  if (!Number.isSafeInteger(adjustmentsCents)) throw new Error("adjustmentsCents must be an integer");
  const netEligibleCents = grossCents - stripeProcessingFeeShareCents - sellerFundedShippingCents - sellerFundedDiscountCents - refundLiabilityCents - disputeLiabilityCents - negativeBalanceRecoveryCents + adjustmentsCents;
  return { netEligibleCents, transferAmountCents: Math.max(0, netEligibleCents), liabilityCreatedCents: Math.max(0, -netEligibleCents) };
}

export function transferGroupForOrder(masterOrderId) {
  const id = String(masterOrderId).trim();
  if (!id || /[\s]/.test(id)) throw new Error("masterOrderId must be a stable non-empty identifier");
  return `COMU_ORDER_${id}`;
}

export function sourceTransactionForCharge(chargeId) {
  const id = String(chargeId).trim();
  if (!/^ch_[A-Za-z0-9]+$/.test(id)) throw new Error("source_transaction requires a Stripe Charge id");
  return id;
}

export function applyNegativeBalanceRecovery(balanceDueCents, settlementCents) {
  integer(balanceDueCents, "balanceDueCents");
  integer(settlementCents, "settlementCents");
  const recoveredCents = Math.min(balanceDueCents, settlementCents);
  return { recoveredCents, transferAmountCents: settlementCents - recoveredCents, remainingBalanceDueCents: balanceDueCents - recoveredCents };
}

export function planRefund({ amountCents, sellerTransferredCents, reversibleTransferCents }) {
  integer(amountCents, "amountCents");
  integer(sellerTransferredCents, "sellerTransferredCents");
  integer(reversibleTransferCents, "reversibleTransferCents");
  if (amountCents === 0) return { settlementReductionCents: 0, reversalRequiredCents: 0, liabilityCreatedCents: 0 };
  const reversalRequiredCents = Math.min(amountCents, sellerTransferredCents, reversibleTransferCents);
  return { settlementReductionCents: sellerTransferredCents === 0 ? amountCents : 0, reversalRequiredCents, liabilityCreatedCents: amountCents - reversalRequiredCents };
}

export function resolveDispute({ outcome, liabilityOwner, exposedCents, actualCostCents = 0 }) {
  integer(exposedCents, "exposedCents");
  integer(actualCostCents, "actualCostCents");
  if (outcome === "WON") return { releaseHold: true, liabilityOwner: null, liabilityCents: 0 };
  if (outcome !== "LOST") return { releaseHold: false, liabilityOwner: null, liabilityCents: 0 };
  if (liabilityOwner !== "SELLER" && liabilityOwner !== "COMETA") throw new Error("A lost dispute needs an explicit liability owner");
  return { releaseHold: false, liabilityOwner, liabilityCents: exposedCents + actualCostCents };
}
