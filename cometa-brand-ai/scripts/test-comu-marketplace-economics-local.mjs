import assert from "node:assert/strict";
import {
  allocateStripeProcessingFee,
  calculateSellerNet,
  sourceTransactionForCharge,
  transferGroupForOrder,
  applyNegativeBalanceRecovery,
  planRefund,
  resolveDispute,
} from "../src/lib/comu/marketplace-economics.mjs";

const allocations = [
  { sellerId: "seller-a", suborderId: "sub-a", economicGrossCents: 7000 },
  { sellerId: "seller-b", suborderId: "sub-b", economicGrossCents: 3000 },
];
const first = allocateStripeProcessingFee({ totalFeeCents: 401, sellerAllocations: allocations });
const second = allocateStripeProcessingFee({ totalFeeCents: 401, sellerAllocations: allocations });
assert.deepEqual(first, second);
assert.equal(first.reduce((sum, row) => sum + row.stripeProcessingFeeShareCents, 0), 401);
assert.equal(allocateStripeProcessingFee({ totalFeeCents: 401, sellerAllocations: [{ sellerId: "a", suborderId: "1", economicGrossCents: 10000 }] })[0].stripeProcessingFeeShareCents, 401);
assert.deepEqual(allocateStripeProcessingFee({ totalFeeCents: 0, sellerAllocations: allocations }).map((row) => row.stripeProcessingFeeShareCents), [0, 0]);
assert.equal(calculateSellerNet({ grossCents: 10000, stripeProcessingFeeShareCents: 401 }).transferAmountCents, 9599);
assert.equal(calculateSellerNet({ grossCents: 18000, sellerFundedDiscountCents: 0 }).netEligibleCents, 18000);
assert.deepEqual(calculateSellerNet({ grossCents: 1000, disputeLiabilityCents: 5000 }), { netEligibleCents: -4000, transferAmountCents: 0, liabilityCreatedCents: 4000 });
assert.equal(transferGroupForOrder("order-123"), "COMU_ORDER_order-123");
assert.equal(sourceTransactionForCharge("ch_test123"), "ch_test123");
assert.deepEqual(applyNegativeBalanceRecovery(65000, 50000), { recoveredCents: 50000, transferAmountCents: 0, remainingBalanceDueCents: 15000 });
assert.deepEqual(applyNegativeBalanceRecovery(15000, 30000), { recoveredCents: 15000, transferAmountCents: 15000, remainingBalanceDueCents: 0 });
assert.deepEqual(planRefund({ amountCents: 4000, sellerTransferredCents: 0, reversibleTransferCents: 0 }), { settlementReductionCents: 4000, reversalRequiredCents: 0, liabilityCreatedCents: 4000 });
assert.deepEqual(planRefund({ amountCents: 4000, sellerTransferredCents: 4000, reversibleTransferCents: 2500 }), { settlementReductionCents: 0, reversalRequiredCents: 2500, liabilityCreatedCents: 1500 });
assert.deepEqual(resolveDispute({ outcome: "WON", liabilityOwner: "SELLER", exposedCents: 9000 }), { releaseHold: true, liabilityOwner: null, liabilityCents: 0 });
assert.deepEqual(resolveDispute({ outcome: "LOST", liabilityOwner: "SELLER", exposedCents: 7000, actualCostCents: 401 }), { releaseHold: false, liabilityOwner: "SELLER", liabilityCents: 7401 });
assert.deepEqual(resolveDispute({ outcome: "LOST", liabilityOwner: "COMETA", exposedCents: 7000 }), { releaseHold: false, liabilityOwner: "COMETA", liabilityCents: 7000 });

const localUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(localUrl)) throw new Error("LOCAL_DATABASE_GUARD_FAILED");
if (process.env.COMU_SKIP_SCHEMA_CERTIFICATION !== "1") {
  const fixtureModule = await import("./lib/comu-finance-fixtures.mjs");
  const fixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: true });
  try {
    const { error: paymentError } = await fixture.db.from("comu_payment_intents").update({ stripe_processing_fee_cents: 401, stripe_balance_transaction_id: `txn_finance_${fixture.ids.payment.slice(0, 8)}`, stripe_fee_finalized_at: new Date().toISOString() }).eq("id", fixture.ids.payment);
    if (paymentError) throw paymentError;
    const shipping = { providerShippingCostCents: 20000, buyerShippingPaidCents: 15000, sellerFundedShippingCents: 3000, cometaFundedShippingCents: 2000, shippingVarianceCents: 0, fundingStatus: "FINALIZED" };
    const discount = { discountTotalCents: 1500, sellerDiscountFundedCents: 700, cometaDiscountFundedCents: 800, embeddedPriceDiscountCents: 0, fundingStatus: "KNOWN" };
    const allocations = [{ allocationId: fixture.allocationA, sellerFundedShippingCents: 3000, sellerDiscountFundedCents: 700, embeddedPriceDiscountCents: 0 }, { allocationId: fixture.allocationB, sellerFundedShippingCents: 0, sellerDiscountFundedCents: 0, embeddedPriceDiscountCents: 0 }];
    const { error: economicsError } = await fixture.db.rpc("comu_finalize_shipping_discount_economics", { p_order_id: fixture.ids.order, p_payment_id: fixture.ids.payment, p_shipping: shipping, p_discount: discount, p_allocations: allocations });
    if (economicsError) throw economicsError;
    const { data: economics, error: economicsReadError } = await fixture.db.from("comu_payment_economics").select("allocation_id,economic_gross_cents,buyer_paid_shipping_cents,seller_funded_shipping_cents,cometa_funded_shipping_cents,seller_discount_liability_cents,cometa_funded_discount_cents,finance_ready").eq("payment_id", fixture.ids.payment).order("allocation_id");
    if (economicsReadError || !economics || economics.length !== 2) throw economicsReadError || new Error("Economics snapshot missing");
    const rowA = economics.find((row) => row.allocation_id === fixture.allocationA);
    const rowB = economics.find((row) => row.allocation_id === fixture.allocationB);
    if (!rowA || !rowB || Number(rowA.economic_gross_cents) !== 70000 || Number(rowA.buyer_paid_shipping_cents) !== 0 || Number(rowA.seller_funded_shipping_cents) !== 3000 || Number(rowA.cometa_funded_shipping_cents) !== 0 || Number(rowA.seller_discount_liability_cents) !== 700 || rowA.finance_ready !== true) throw new Error(`Seller shipping/discount economics were not finalized canonically: ${JSON.stringify({ rowA, rowB })}`);
    if (Number(rowB.seller_funded_shipping_cents) !== 0 || Number(rowB.seller_discount_liability_cents) !== 0 || rowB.finance_ready !== true) throw new Error("Unrelated seller economics changed");
    const { data: reconciliation, error: reconciliationError } = await fixture.db.from("comu_marketplace_money_conservation_v1").select("seller_gross_cents,buyer_shipping_paid_cents,provider_shipping_cost_cents,seller_funded_shipping_cents,cometa_funded_shipping_cents,shipping_variance_cents,discount_total_cents,seller_discount_funded_cents,cometa_discount_funded_cents,stripe_processing_fee_cents").eq("payment_id", fixture.ids.payment).single();
    if (reconciliationError || !reconciliation || Number(reconciliation.seller_gross_cents) !== 160000 || Number(reconciliation.buyer_shipping_paid_cents) !== 15000 || Number(reconciliation.provider_shipping_cost_cents) !== 20000 || Number(reconciliation.seller_funded_shipping_cents) !== 3000 || Number(reconciliation.cometa_funded_shipping_cents) !== 2000 || Number(reconciliation.shipping_variance_cents) !== 0 || Number(reconciliation.discount_total_cents) !== 1500 || Number(reconciliation.seller_discount_funded_cents) !== 700 || Number(reconciliation.cometa_discount_funded_cents) !== 800 || Number(reconciliation.stripe_processing_fee_cents) !== 401) throw new Error(`Money conservation view mismatch: ${JSON.stringify({ reconciliation, reconciliationError })}`);
    const concurrent = await Promise.all([1, 2].map(() => fixture.db.rpc("comu_finalize_shipping_discount_economics", { p_order_id: fixture.ids.order, p_payment_id: fixture.ids.payment, p_shipping: shipping, p_discount: discount, p_allocations: allocations })));
    if (concurrent.some((result) => result.error)) throw concurrent.find((result) => result.error)?.error;

    const directFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: false });
    try {
      await directFixture.db.from("comu_orders").update({ shipping_mode: "DIRECT" }).eq("id", directFixture.ids.order);
      await directFixture.db.from("comu_payment_intents").update({ stripe_processing_fee_cents: 0, stripe_fee_finalized_at: new Date().toISOString() }).eq("id", directFixture.ids.payment);
      const directPending = await directFixture.db.rpc("comu_finalize_shipping_discount_economics", { p_order_id: directFixture.ids.order, p_payment_id: directFixture.ids.payment, p_shipping: { providerShippingCostCents: 18000, buyerShippingPaidCents: 15000, sellerFundedShippingCents: 3000, cometaFundedShippingCents: 0, shippingVarianceCents: 0, fundingStatus: "PENDING" }, p_discount: { discountTotalCents: 0, sellerDiscountFundedCents: 0, cometaDiscountFundedCents: 0, embeddedPriceDiscountCents: 0, fundingStatus: "NOT_APPLICABLE" }, p_allocations: [{ allocationId: directFixture.allocationA, sellerFundedShippingCents: 3000, sellerDiscountFundedCents: 0, embeddedPriceDiscountCents: 0 }] });
      if (directPending.error) throw directPending.error;
      const directFinal = await directFixture.db.rpc("comu_finalize_shipping_discount_economics", { p_order_id: directFixture.ids.order, p_payment_id: directFixture.ids.payment, p_shipping: { providerShippingCostCents: 20000, buyerShippingPaidCents: 15000, sellerFundedShippingCents: 3000, cometaFundedShippingCents: 2000, shippingVarianceCents: 0, fundingStatus: "FINALIZED" }, p_discount: { discountTotalCents: 0, sellerDiscountFundedCents: 0, cometaDiscountFundedCents: 0, embeddedPriceDiscountCents: 0, fundingStatus: "NOT_APPLICABLE" }, p_allocations: [{ allocationId: directFixture.allocationA, sellerFundedShippingCents: 3000, sellerDiscountFundedCents: 0, embeddedPriceDiscountCents: 0 }] });
      if (directFinal.error) throw directFinal.error;
      const { data: directShipping } = await directFixture.db.from("comu_order_shipping_economics").select("funding_status,provider_shipping_cost_cents,seller_funded_shipping_cents,cometa_funded_shipping_cents").eq("order_id", directFixture.ids.order).single();
      if (!directShipping || directShipping.funding_status !== "FINALIZED" || Number(directShipping.provider_shipping_cost_cents) !== 20000 || Number(directShipping.seller_funded_shipping_cents) !== 3000 || Number(directShipping.cometa_funded_shipping_cents) !== 2000) throw new Error("DIRECT final provider-cost reconciliation failed");
    } finally {
      await fixtureModule.cleanupCanonicalFinanceFixtures(directFixture.ids);
    }

    const hubFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: true });
    try {
      await hubFixture.db.from("comu_orders").update({ shipping_mode: "HUB" }).eq("id", hubFixture.ids.order);
      await hubFixture.db.from("comu_payment_intents").update({ stripe_processing_fee_cents: 0, stripe_fee_finalized_at: new Date().toISOString() }).eq("id", hubFixture.ids.payment);
      const hubResult = await hubFixture.db.rpc("comu_finalize_shipping_discount_economics", { p_order_id: hubFixture.ids.order, p_payment_id: hubFixture.ids.payment, p_shipping: { providerShippingCostCents: 20000, buyerShippingPaidCents: 15000, sellerFundedShippingCents: 3000, cometaFundedShippingCents: 2000, shippingVarianceCents: 0, fundingStatus: "FINALIZED" }, p_discount: { discountTotalCents: 1500, sellerDiscountFundedCents: 700, cometaDiscountFundedCents: 800, embeddedPriceDiscountCents: 0, fundingStatus: "KNOWN" }, p_allocations: [{ allocationId: hubFixture.allocationA, sellerFundedShippingCents: 3000, sellerDiscountFundedCents: 700, embeddedPriceDiscountCents: 0 }, { allocationId: hubFixture.allocationB, sellerFundedShippingCents: 0, sellerDiscountFundedCents: 0, embeddedPriceDiscountCents: 0 }] });
      if (hubResult.error) throw hubResult.error;
      const { data: hubB } = await hubFixture.db.from("comu_payment_economics").select("seller_funded_shipping_cents,seller_discount_liability_cents").eq("allocation_id", hubFixture.allocationB).single();
      if (!hubB || Number(hubB.seller_funded_shipping_cents) !== 0 || Number(hubB.seller_discount_liability_cents) !== 0) throw new Error("HUB unrelated seller attribution changed");
    } finally {
      await fixtureModule.cleanupCanonicalFinanceFixtures(hubFixture.ids);
    }

    const unknownFixture = await fixtureModule.createCanonicalFinanceFixture({ multiSeller: false });
    try {
      const { error: unknownPaymentError } = await unknownFixture.db.from("comu_payment_intents").update({ stripe_processing_fee_cents: 0, stripe_fee_finalized_at: new Date().toISOString() }).eq("id", unknownFixture.ids.payment);
      if (unknownPaymentError) throw unknownPaymentError;
      const unknownResult = await unknownFixture.db.rpc("comu_finalize_shipping_discount_economics", { p_order_id: unknownFixture.ids.order, p_payment_id: unknownFixture.ids.payment, p_shipping: { providerShippingCostCents: 0, buyerShippingPaidCents: 0, sellerFundedShippingCents: 0, cometaFundedShippingCents: 0, shippingVarianceCents: 0, fundingStatus: "NOT_APPLICABLE" }, p_discount: { discountTotalCents: 1000, sellerDiscountFundedCents: 0, cometaDiscountFundedCents: 0, embeddedPriceDiscountCents: 0, fundingStatus: "UNKNOWN" }, p_allocations: [{ allocationId: unknownFixture.allocationA, sellerFundedShippingCents: 0, sellerDiscountFundedCents: 0, embeddedPriceDiscountCents: 0 }] });
      if (unknownResult.error) throw unknownResult.error;
      const { data: blocked } = await unknownFixture.db.from("comu_payment_economics").select("finance_ready,discount_finance_ready").eq("allocation_id", unknownFixture.allocationA).single();
      if (!blocked || blocked.finance_ready !== false || blocked.discount_finance_ready !== false) throw new Error("Unknown discount funding did not block finance readiness");
    } finally {
      await fixtureModule.cleanupCanonicalFinanceFixtures(unknownFixture.ids);
    }
  } finally {
    await fixtureModule.cleanupCanonicalFinanceFixtures(fixture.ids);
  }
}
console.log("COMU marketplace economics pure tests: PASS");
