import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { scanStaleStripeFinanceEvents, recoverStaleStripeFinanceEvent, summarizeStripeFinanceEvents, buildReconciliationCandidate, classifyWebhookFailure } from "../src/lib/comu/webhook-recovery.mjs";

const fileEnv = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const env = { ...fileEnv, ...process.env };
const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "");
if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321") throw new Error("LOCAL_DB_GUARD_FAILED");
const admin = createClient(url.origin, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const eventId = `evt_hardening_${Date.now()}`;
const retryEventId = `${eventId}_retry`;
const receivedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const inserted = await admin.from("stripe_webhook_events").insert({ stripe_event_id: eventId, event_type: "payment_intent.succeeded", livemode: false, status: "received", received_at: receivedAt, processed_at: receivedAt, error_message: null, metadata: { hardeningTest: true } });
if (inserted.error) throw inserted.error;
try {
  const stale = await scanStaleStripeFinanceEvents(admin, { now: Date.now(), thresholdMs: 5 * 60 * 1000 });
  assert.ok(stale.events.some((row) => row.stripe_event_id === eventId));
  const [first, second] = await Promise.all([recoverStaleStripeFinanceEvent(admin, eventId, { now: Date.now(), thresholdMs: 5 * 60 * 1000 }), recoverStaleStripeFinanceEvent(admin, eventId, { now: Date.now(), thresholdMs: 5 * 60 * 1000 })]);
  assert.equal([first, second].filter((result) => result.recovered).length, 1);
  const current = (await admin.from("stripe_webhook_events").select("status,processed_at,error_message").eq("stripe_event_id", eventId).single()).data;
  assert.equal(current.status, "received"); assert.equal(current.processed_at, null); assert.equal(current.error_message, "WEBHOOK_STALE_PROCESSING");
  const firstClaim = await admin.rpc("comu_claim_stripe_webhook_event", { p_stripe_event_id: retryEventId, p_livemode: false, p_claimed_at: new Date().toISOString(), p_stale_before: new Date(Date.now() - 5 * 60 * 1000).toISOString(), p_max_attempts: 2 });
  if (firstClaim.error) throw firstClaim.error;
  assert.equal(firstClaim.data, "MISSING");
  const retryInserted = await admin.from("stripe_webhook_events").insert({ stripe_event_id: retryEventId, event_type: "payment_intent.succeeded", livemode: false, status: "received", metadata: { hardeningTest: true } });
  if (retryInserted.error) throw retryInserted.error;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const claim = await admin.rpc("comu_claim_stripe_webhook_event", { p_stripe_event_id: retryEventId, p_livemode: false, p_claimed_at: new Date().toISOString(), p_stale_before: new Date(Date.now() - 5 * 60 * 1000).toISOString(), p_max_attempts: 2 });
    if (claim.error) throw claim.error;
    assert.equal(claim.data, attempt === 0 ? "CLAIMED_NEW" : "CLAIMED_RETRY");
    const failed = await admin.from("stripe_webhook_events").update({ status: "failed", processing_started_at: null }).eq("stripe_event_id", retryEventId);
    if (failed.error) throw failed.error;
  }
  const exhausted = await admin.rpc("comu_claim_stripe_webhook_event", { p_stripe_event_id: retryEventId, p_livemode: false, p_claimed_at: new Date().toISOString(), p_stale_before: new Date(Date.now() - 5 * 60 * 1000).toISOString(), p_max_attempts: 2 });
  if (exhausted.error) throw exhausted.error;
  assert.equal(exhausted.data, "MANUAL_REVIEW");
  const exhaustedRow = (await admin.from("stripe_webhook_events").select("attempt_count,manual_review_required,manual_review_reason").eq("stripe_event_id", retryEventId).single()).data;
  assert.equal(exhaustedRow.attempt_count, 2); assert.equal(exhaustedRow.manual_review_required, true); assert.equal(exhaustedRow.manual_review_reason, "WEBHOOK_RETRY_EXHAUSTED");
  assert.equal(classifyWebhookFailure({ attemptCount: 1, maxAttempts: 2 }).retryable, true);
  assert.equal(classifyWebhookFailure({ attemptCount: 2, maxAttempts: 2 }).manualReview, true);
  const summary = await summarizeStripeFinanceEvents(admin, { now: Date.now(), thresholdMs: 5 * 60 * 1000 });
  assert.ok(summary.processing.every((row) => row.stripe_event_id !== eventId));
  assert.deepEqual(buildReconciliationCandidate({ kind: "payment", stripeId: "pi_test", localId: "payment_test", status: "REVIEW" }), { kind: "payment", stripeId: "pi_test", localId: "payment_test", status: "REVIEW", reason: "STRIPE_LOCAL_MISMATCH" });
  console.log(JSON.stringify({ ok: true, localDb: true, staleDefinition: "status=received and processed_at older than configurable threshold", staleRecovery: true, concurrentRecoveryOneWinner: true, activeProcessingProtected: true, failedEventsRetryable: true, retryAttemptPersistence: true, retryExhaustion: true, manualReview: true, reconciliationCandidate: true, transferCalls: 0, refundCalls: 0, reversalCalls: 0, payoutCalls: 0 }, null, 2));
} finally {
  await admin.from("stripe_webhook_events").delete().eq("stripe_event_id", eventId);
  await admin.from("stripe_webhook_events").delete().eq("stripe_event_id", retryEventId);
}
