import Stripe from "stripe";
import { getAdminClient } from "@/lib/pos/server";
import { getStripeClient, getStripeRuntimeMode } from "@/lib/comu/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const { data: existing, error: existingError } = await admin.from("stripe_webhook_events").select("status").eq("stripe_event_id", event.id).eq("livemode", event.livemode).maybeSingle();
  if (existingError) return Response.json({ ok: false, code: "STRIPE_LEDGER_READ_FAILED" }, { status: 500 });
  if (existing?.status === "processed") return Response.json({ ok: true, duplicate: true });
  if (!existing) {
    const { error } = await admin.from("stripe_webhook_events").insert({ stripe_event_id: event.id, event_type: event.type, livemode: event.livemode, status: "received", metadata: { comu: true } });
    if (error && error.code !== "23505") return Response.json({ ok: false, code: "STRIPE_LEDGER_WRITE_FAILED" }, { status: 500 });
  }
  try {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (event.type === "payment_intent.succeeded") {
      const { error } = await admin.rpc("comu_mark_payment_succeeded", { p_stripe_payment_intent_id: intent.id, p_amount_cents: intent.amount_received || intent.amount, p_currency: intent.currency.toUpperCase(), p_event_id: event.id, p_payload: { eventType: event.type } });
      if (error) throw error;
    } else if (event.type === "payment_intent.payment_failed") {
      const { error } = await admin.rpc("comu_mark_payment_failed", { p_stripe_payment_intent_id: intent.id, p_message: intent.last_payment_error?.message || "Payment failed", p_event_id: event.id, p_payload: { eventType: event.type } });
      if (error) throw error;
    } else if (event.type === "payment_intent.canceled") {
      const { error } = await admin.from("comu_payment_intents").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("stripe_payment_intent_id", intent.id).neq("status", "SUCCEEDED");
      if (error) throw error;
      const { data: payment } = await admin.from("comu_payment_intents").select("id,amount_cents,currency").eq("stripe_payment_intent_id", intent.id).maybeSingle();
      if (payment) await admin.from("comu_payment_transactions").upsert({ payment_id: payment.id, stripe_event_id: event.id, type: "PAYMENT_CANCELLED", status: "CANCELLED", amount_cents: payment.amount_cents, currency: payment.currency, payload: { eventType: event.type } }, { onConflict: "payment_id,type,stripe_event_id" });
    }
    const { error } = await admin.from("stripe_webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), error_message: null }).eq("stripe_event_id", event.id).eq("livemode", event.livemode);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "COMU_STRIPE_WEBHOOK_FAILED";
    await admin.from("stripe_webhook_events").update({ status: "failed", error_message: message.slice(0, 240) }).eq("stripe_event_id", event.id).eq("livemode", event.livemode);
    return Response.json({ ok: false, code: "COMU_STRIPE_WEBHOOK_FAILED" }, { status: 500 });
  }
}
