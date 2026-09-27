import Stripe from "stripe";
import { getAdminClient } from "@/lib/pos/server";
import { getStripeClient, getStripeRuntimeMode } from "@/lib/comu/stripe";
import { allocateStripeProcessingFee } from "@/lib/comu/marketplace-economics.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

async function reconcilePaymentEconomics(admin: ReturnType<typeof getAdminClient>, paymentIntentId: string) {
  const { data: payment, error: paymentError } = await admin.from("comu_payment_intents").select("id,order_id,stripe_processing_fee_cents,stripe_fee_finalized_at").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment || payment.stripe_fee_finalized_at) return { status: "FINALIZED" };
  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
  const charge = typeof intent.latest_charge === "string" ? await stripe.charges.retrieve(intent.latest_charge, { expand: ["balance_transaction"] }) : intent.latest_charge;
  if (!charge) return { status: "FINANCE_PENDING" };
  const balanceTransaction = typeof charge.balance_transaction === "string" ? await stripe.balanceTransactions.retrieve(charge.balance_transaction) : charge.balance_transaction;
  if (!balanceTransaction) return { status: "FINANCE_PENDING" };
  const { data: allocations, error: allocationError } = await admin.from("comu_payment_allocations").select("id,seller_id,gross_amount_cents").eq("payment_id", payment.id).order("id");
  if (allocationError) throw allocationError;
  const shares = allocateStripeProcessingFee({ totalFeeCents: balanceTransaction.fee, sellerAllocations: (allocations || []).map((allocation) => ({ sellerId: allocation.seller_id, suborderId: allocation.id, economicGrossCents: allocation.gross_amount_cents })) });
  const { error: finalizeError } = await admin.rpc("comu_finalize_payment_economics", {
    p_payment_id: payment.id,
    p_stripe_charge_id: charge.id,
    p_stripe_balance_transaction_id: balanceTransaction.id,
    p_processing_fee_cents: balanceTransaction.fee,
    p_transfer_group: `COMU_ORDER_${payment.order_id}`,
    p_allocations: shares.map((share) => ({ allocationId: share.suborderId, stripeProcessingFeeShareCents: share.stripeProcessingFeeShareCents })),
  });
  if (finalizeError) throw finalizeError;
  return { status: "FINALIZED", feeCents: balanceTransaction.fee };
}

type FinanceResult = { status: "PROCESSED" | "UNRESOLVED"; reason?: string };

async function resolvePayment(admin: ReturnType<typeof getAdminClient>, paymentIntentId?: string | null, chargeId?: string | null) {
  let query = admin.from("comu_payment_intents").select("id,order_id,stripe_payment_intent_id,stripe_charge_id,amount_cents,currency");
  if (paymentIntentId) query = query.eq("stripe_payment_intent_id", paymentIntentId);
  else if (chargeId) query = query.eq("stripe_charge_id", chargeId);
  else return null;
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function ingestDispute(admin: ReturnType<typeof getAdminClient>, event: Stripe.Event, dispute: Stripe.Dispute): Promise<FinanceResult> {
  const paymentIntentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  const payment = await resolvePayment(admin, paymentIntentId, chargeId);
  if (!payment) return { status: "UNRESOLVED", reason: "PAYMENT_NOT_FOUND" };

  const { data: existing, error: existingError } = await admin.from("comu_disputes").select("*").eq("stripe_dispute_id", dispute.id).maybeSingle();
  if (existingError) throw existingError;
  let canonical = existing;
  let createdNow = false;
  if (!canonical) {
    const { data: allocations, error: allocationError } = await admin.from("comu_payment_allocations").select("id,suborder_id,gross_amount_cents").eq("payment_id", payment.id).order("id");
    if (allocationError) throw allocationError;
    const requestedAllocationId = typeof dispute.metadata?.comu_allocation_id === "string" ? dispute.metadata.comu_allocation_id : null;
    const selected = requestedAllocationId ? (allocations || []).filter((row) => row.id === requestedAllocationId) : (allocations || []);
    if (!selected.length) return { status: "UNRESOLVED", reason: "ALLOCATIONS_NOT_FOUND" };
    const { data, error } = await admin.rpc("comu_open_dispute", {
      p_stripe_dispute_id: dispute.id,
      p_payment_id: payment.id,
      p_stripe_charge_id: chargeId,
      p_amount_cents: dispute.amount,
      p_currency: dispute.currency,
      p_reason: dispute.reason || "stripe_dispute",
      p_allocation_exposure: selected.map((row) => ({ allocationId: row.id, exposedCents: row.gross_amount_cents })),
      p_idempotency_key: event.id,
      p_actor_id: SYSTEM_ACTOR_ID,
    });
    if (error) throw error;
    canonical = data;
    createdNow = true;
    const evidence = [
      { dispute_id: canonical.id, evidence_type: "MASTER_ORDER", source_table: "comu_orders", source_id: payment.order_id },
      ...selected.map((row) => ({ dispute_id: canonical.id, evidence_type: "SUBORDER", source_table: "comu_order_suborders", source_id: row.suborder_id })),
    ];
    const { error: evidenceError } = await admin.from("comu_dispute_evidence_refs").upsert(evidence, { onConflict: "dispute_id,evidence_type,source_table,source_id" });
    if (evidenceError) throw evidenceError;
  }

  const stripeStatus = dispute.status;
  if (["WON", "LOST", "CLOSED"].includes(canonical.status)) return { status: "PROCESSED", reason: "TERMINAL_STATE" };
  if (stripeStatus === "won") {
    const { error } = await admin.rpc("comu_resolve_dispute", { p_dispute_id: canonical.id, p_outcome: "WON", p_liability_owner: "SELLER", p_reason_code: "STRIPE_DISPUTE_WON", p_note: "Stripe dispute won", p_actual_cost_cents: 0, p_actor_id: SYSTEM_ACTOR_ID, p_idempotency_key: event.id });
    if (error) throw error;
  } else if (stripeStatus === "lost") {
    const { data: allocations, error } = await admin.from("comu_dispute_allocations").select("liability_owner,attribution_status").eq("dispute_id", canonical.id);
    if (error) throw error;
    const owners = (allocations || []).map((row) => row.attribution_status === "COMETA" || row.liability_owner === "COMETA" ? "COMETA" : row.attribution_status === "SELLER" ? "SELLER" : null);
    const owner = owners.length > 0 && owners.every((value) => value && value === owners[0]) ? owners[0] : null;
    if (!owner) {
      const { error: updateError } = await admin.from("comu_disputes").update({ status: "UNDER_REVIEW", outcome: "ATTRIBUTION_REQUIRED", updated_at: new Date().toISOString() }).eq("id", canonical.id);
      if (updateError) throw updateError;
      return { status: "PROCESSED", reason: "ATTRIBUTION_REQUIRED" };
    }
    const { error: resolveError } = await admin.rpc("comu_resolve_dispute", { p_dispute_id: canonical.id, p_outcome: "LOST", p_liability_owner: owner, p_reason_code: owner === "COMETA" ? "COMETA_SYSTEM_ERROR" : "STRIPE_DISPUTE_LOST", p_note: "Stripe dispute lost", p_actual_cost_cents: 0, p_actor_id: SYSTEM_ACTOR_ID, p_idempotency_key: event.id });
    if (resolveError) throw resolveError;
  } else if (!createdNow && (stripeStatus === "under_review" || stripeStatus === "needs_response" || stripeStatus === "warning_needs_response")) {
    const { error } = await admin.from("comu_disputes").update({ status: "UNDER_REVIEW", updated_at: new Date().toISOString() }).eq("id", canonical.id);
    if (error) throw error;
  }
  return { status: "PROCESSED" };
}

async function ingestRefund(admin: ReturnType<typeof getAdminClient>, event: Stripe.Event, refund: Stripe.Refund): Promise<FinanceResult> {
  const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : null;
  const chargeId = typeof refund.charge === "string" ? refund.charge : null;
  const payment = await resolvePayment(admin, paymentIntentId, chargeId);
  if (!payment) return { status: "UNRESOLVED", reason: "PAYMENT_NOT_FOUND" };
  const { data: byStripeId, error: byStripeError } = await admin.from("comu_refunds").select("*").eq("stripe_refund_id", refund.id).maybeSingle();
  if (byStripeError) throw byStripeError;
  let canonical = byStripeId;
  if (!canonical) {
    const { data, error } = await admin.from("comu_refunds").select("*").eq("payment_id", payment.id).eq("status", "REQUESTED").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw error;
    canonical = data;
  }
  if (!canonical) return { status: "UNRESOLVED", reason: "REFUND_ATTRIBUTION_REQUIRED" };
  if (!canonical.stripe_refund_id) {
    const { error } = await admin.from("comu_refunds").update({ stripe_refund_id: refund.id }).eq("id", canonical.id);
    if (error) throw error;
  }
  if (event.type === "refund.failed" || refund.status === "failed") {
    const { error } = await admin.rpc("comu_finalize_refund_failure", { p_refund_id: canonical.id, p_reason: refund.failure_reason || "Stripe refund failed", p_actor_id: null });
    if (error) throw error;
  } else if (refund.status === "succeeded") {
    const { error } = await admin.rpc("comu_finalize_refund_success", { p_refund_id: canonical.id, p_stripe_refund_id: refund.id, p_actor_id: null });
    if (error) throw error;
  } else {
    const { error } = await admin.from("comu_refunds").update({ status: "PROCESSING" }).eq("id", canonical.id).in("status", ["REQUESTED", "PROCESSING"]);
    if (error) throw error;
  }
  return { status: "PROCESSED" };
}

export async function POST(request: Request) {
  const secret = process.env.COMU_STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ ok: false, code: "STRIPE_ENV_MISSING" }, { status: 500 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ ok: false, code: "STRIPE_SIGNATURE_MISSING" }, { status: 400 });
  const rawBody = await request.text();
  let event: Stripe.Event;
  try { event = getStripeClient().webhooks.constructEvent(rawBody, signature, secret); } catch { return Response.json({ ok: false, code: "STRIPE_SIGNATURE_INVALID" }, { status: 400 }); }
  try { if (event.livemode !== getStripeRuntimeMode()) return Response.json({ ok: false, code: "COMU_STRIPE_MODE_MISMATCH" }, { status: 400 }); } catch { return Response.json({ ok: false, code: "STRIPE_RUNTIME_MODE_UNKNOWN" }, { status: 500 }); }
  const admin = getAdminClient();
  const claimAt = new Date().toISOString();
  const { error: insertError } = await admin.from("stripe_webhook_events").insert({ stripe_event_id: event.id, event_type: event.type, livemode: event.livemode, status: "received", metadata: { comu: true } });
  if (insertError && insertError.code !== "23505") return Response.json({ ok: false, code: "STRIPE_LEDGER_WRITE_FAILED" }, { status: 500 });

  // The legacy ledger does not have a PROCESSING enum value. We use the
  // nullable processed_at column as an atomic claim marker while status stays
  // `received`; only the claimant may later transition the row to processed or
  // failed. This avoids a check-then-act race without a schema change.
  let claim: "CLAIMED_NEW" | "CLAIMED_RETRY" | "ALREADY_PROCESSING" | "ALREADY_PROCESSED" | null = null;
  const { data: newClaim } = await admin.from("stripe_webhook_events").update({ processed_at: claimAt, error_message: null }).eq("stripe_event_id", event.id).eq("livemode", event.livemode).eq("status", "received").is("processed_at", null).select("status").maybeSingle();
  if (newClaim) {
    claim = insertError ? "CLAIMED_NEW" : "CLAIMED_NEW";
  } else {
    const { data: retryClaim } = await admin.from("stripe_webhook_events").update({ status: "received", processed_at: claimAt, error_message: null }).eq("stripe_event_id", event.id).eq("livemode", event.livemode).eq("status", "failed").select("status").maybeSingle();
    if (retryClaim) claim = "CLAIMED_RETRY";
    else {
      const { data: current, error: currentError } = await admin.from("stripe_webhook_events").select("status,processed_at").eq("stripe_event_id", event.id).eq("livemode", event.livemode).maybeSingle();
      if (currentError || !current) return Response.json({ ok: false, code: "STRIPE_LEDGER_READ_FAILED" }, { status: 500 });
      if (current.status === "processed") claim = "ALREADY_PROCESSED";
      else claim = "ALREADY_PROCESSING";
    }
  }
  if (claim === "ALREADY_PROCESSED") return Response.json({ ok: true, duplicate: true });
  if (claim === "ALREADY_PROCESSING") return Response.json({ ok: true, processing: true });
  try {
    const intent = event.data.object as Stripe.PaymentIntent;
    let financeResult: FinanceResult = { status: "PROCESSED" };
    if (event.type === "payment_intent.succeeded") {
      const { error } = await admin.rpc("comu_mark_payment_succeeded", { p_stripe_payment_intent_id: intent.id, p_amount_cents: intent.amount_received || intent.amount, p_currency: intent.currency.toUpperCase(), p_event_id: event.id, p_payload: { eventType: event.type } });
      if (error) throw error;
      await reconcilePaymentEconomics(admin, intent.id);
    } else if (event.type === "payment_intent.payment_failed") {
      const { error } = await admin.rpc("comu_mark_payment_failed", { p_stripe_payment_intent_id: intent.id, p_message: intent.last_payment_error?.message || "Payment failed", p_event_id: event.id, p_payload: { eventType: event.type } });
      if (error) throw error;
    } else if (event.type === "payment_intent.canceled") {
      const { error } = await admin.from("comu_payment_intents").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("stripe_payment_intent_id", intent.id).neq("status", "SUCCEEDED");
      if (error) throw error;
      const { data: payment } = await admin.from("comu_payment_intents").select("id,amount_cents,currency").eq("stripe_payment_intent_id", intent.id).maybeSingle();
      if (payment) await admin.from("comu_payment_transactions").upsert({ payment_id: payment.id, stripe_event_id: event.id, type: "PAYMENT_CANCELLED", status: "CANCELLED", amount_cents: payment.amount_cents, currency: payment.currency, payload: { eventType: event.type } }, { onConflict: "payment_id,type,stripe_event_id" });
    } else if (event.type === "charge.dispute.created" || event.type === "charge.dispute.updated" || event.type === "charge.dispute.closed" || event.type === "charge.dispute.funds_withdrawn" || event.type === "charge.dispute.funds_reinstated") {
      financeResult = await ingestDispute(admin, event, event.data.object as Stripe.Dispute);
    } else if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed" || event.type === "charge.refund.updated") {
      financeResult = await ingestRefund(admin, event, event.data.object as Stripe.Refund);
    }
    const { error } = await admin.from("stripe_webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), error_message: financeResult.status === "UNRESOLVED" ? financeResult.reason : null, metadata: { comu: true, financeStatus: financeResult.status, reason: financeResult.reason || null } }).eq("stripe_event_id", event.id).eq("livemode", event.livemode);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : (typeof error === "object" && error !== null ? JSON.stringify(error) : "COMU_STRIPE_WEBHOOK_FAILED");
    await admin.from("stripe_webhook_events").update({ status: "failed", error_message: message.slice(0, 240) }).eq("stripe_event_id", event.id).eq("livemode", event.livemode);
    return Response.json({ ok: false, code: "COMU_STRIPE_WEBHOOK_FAILED" }, { status: 500 });
  }
}
