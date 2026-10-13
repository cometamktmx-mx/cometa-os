import { checkoutStore, stripeTest } from "../../../../lib/checkout-server";
import type Stripe from "stripe";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const secret = process.env.STOREFRONT_STRIPE_TEST_WEBHOOK_SECRET, signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Webhook unavailable", { status: 400 });
  let event: Stripe.Event;
  try { const raw = await request.text();if (raw.length > 1000000) throw Error();event = stripeTest().webhooks.constructEvent(raw, signature, secret); } catch { return new Response("Invalid signature", { status: 400 }); }
  if (event.livemode) return new Response("Test mode only", { status: 400 });
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) return Response.json({ received: true });
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.livemode) return new Response("Test mode only", { status: 400 });
  if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && session.payment_status !== "paid") return Response.json({ received: true });
  try {
    const { slug, db } = checkoutStore();
    const brand = await db.from("brands").select("id").eq("slug", slug).maybeSingle();
    if (brand.error || !brand.data) throw Error();
    const result = await db.from("store_orders").select("id,stripe_session_id").eq("id", session.metadata?.store_order_id ?? "").eq("brand_id", brand.data.id).maybeSingle();
    if (result.error || !result.data || session.metadata?.store_brand_id !== brand.data.id || session.client_reference_id !== result.data.id || session.id !== result.data.stripe_session_id) throw Error();
    const action = event.type === "checkout.session.expired" ? "EXPIRED" : event.type === "checkout.session.async_payment_failed" ? "FAILED" : "PAID";
    const applied = await db.rpc("store_order_resolve_m6", { p_order: result.data.id, p_action: action, p_event: event.id, p_session: session.id, p_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null, p_amount: session.amount_total, p_currency: session.currency });
    if (applied.error) throw Error();return Response.json({ received: true });
  } catch { return new Response("Retry required", { status: 503 }); }
}
