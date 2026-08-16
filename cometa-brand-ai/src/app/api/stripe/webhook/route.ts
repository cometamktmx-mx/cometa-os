import Stripe from "stripe";

import {
  getStripeClient,
  mapStripeSubscriptionStatus,
  planCodeFromStripePrice,
  safeStripeMetadata,
} from "@/lib/stripe/server";
import { getAdminClient } from "@/lib/pos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscriptionLike = Stripe.Subscription & { livemode?: boolean };

function stringId(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function subscriptionPriceId(subscription: SubscriptionLike) {
  return subscription.items.data[0]?.price?.id ?? null;
}

function subscriptionPeriod(subscription: SubscriptionLike) {
  const items = subscription.items?.data ?? [];
  if (items.length > 1) throw new Error("POS_STRIPE_PERIOD_AMBIGUOUS");

  const topLevel = subscription as unknown as Record<string, unknown>;
  const item = items[0] as unknown as Record<string, unknown> | undefined;
  const itemStart = typeof item?.current_period_start === "number" ? item.current_period_start : null;
  const itemEnd = typeof item?.current_period_end === "number" ? item.current_period_end : null;
  const legacyStart = typeof topLevel.current_period_start === "number" ? topLevel.current_period_start : null;
  const legacyEnd = typeof topLevel.current_period_end === "number" ? topLevel.current_period_end : null;

  return {
    start: itemStart ?? legacyStart,
    end: itemEnd ?? legacyEnd,
  };
}

async function findSubscription(admin: ReturnType<typeof getAdminClient>, values: { brandSlug?: string | null; customerId?: string | null; subscriptionId?: string | null }) {
  if (values.subscriptionId) {
    const bySubscription = await admin.from("pos_subscriptions").select("id,brand_slug,stripe_customer_id,stripe_subscription_id").eq("stripe_subscription_id", values.subscriptionId).maybeSingle();
    if (bySubscription.error) throw bySubscription.error;
    if (bySubscription.data) return bySubscription.data;
  }
  if (values.customerId) {
    const byCustomer = await admin.from("pos_subscriptions").select("id,brand_slug,stripe_customer_id,stripe_subscription_id").eq("stripe_customer_id", values.customerId).maybeSingle();
    if (byCustomer.error) throw byCustomer.error;
    if (byCustomer.data) return byCustomer.data;
  }
  if (values.brandSlug) {
    const byBrand = await admin.from("pos_subscriptions").select("id,brand_slug,stripe_customer_id,stripe_subscription_id").eq("brand_slug", values.brandSlug).maybeSingle();
    if (byBrand.error) throw byBrand.error;
    return byBrand.data;
  }
  return null;
}

async function reconcileSubscription(admin: ReturnType<typeof getAdminClient>, subscription: SubscriptionLike) {
  const customerId = stringId(subscription.customer);
  const metadata = safeStripeMetadata(subscription.metadata);
  const brandSlug = typeof metadata.brand_slug === "string" ? metadata.brand_slug : null;
  const local = await findSubscription(admin, { subscriptionId: subscription.id, customerId, brandSlug });
  if (!local) throw new Error("POS_STRIPE_BRAND_MAPPING_NOT_FOUND");

  const status = mapStripeSubscriptionStatus(subscription.status);
  if (!status) throw new Error("POS_STRIPE_STATUS_UNSUPPORTED");
  const priceId = subscriptionPriceId(subscription);
  const planCode = priceId ? planCodeFromStripePrice(priceId) : null;
  if (!planCode) throw new Error("POS_STRIPE_PRICE_UNMAPPED");

  const period = subscriptionPeriod(subscription);
  const update = {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    stripe_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    stripe_livemode: Boolean(subscription.livemode),
    plan_code: planCode,
    status,
    current_period_start: period.start ? new Date(period.start * 1000).toISOString() : null,
    current_period_end: period.end ? new Date(period.end * 1000).toISOString() : null,
    cancelled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
  };
  const { error } = await admin.from("pos_subscriptions").update(update).eq("id", local.id);
  if (error) throw error;
}

async function reconcileCheckoutSession(admin: ReturnType<typeof getAdminClient>, session: Stripe.Checkout.Session) {
  const metadata = safeStripeMetadata(session.metadata);
  const brandSlug = typeof metadata.brand_slug === "string" ? metadata.brand_slug : null;
  const customerId = stringId(session.customer);
  const subscriptionId = stringId(session.subscription);
  if (!brandSlug || !customerId || !subscriptionId) return;
  const local = await findSubscription(admin, { brandSlug, customerId, subscriptionId });
  if (!local) throw new Error("POS_STRIPE_BRAND_MAPPING_NOT_FOUND");
  if (local.stripe_customer_id && local.stripe_customer_id !== customerId) throw new Error("POS_STRIPE_CUSTOMER_MISMATCH");
  if (local.stripe_subscription_id && local.stripe_subscription_id !== subscriptionId) throw new Error("POS_STRIPE_SUBSCRIPTION_MISMATCH");
  const { error } = await admin.from("pos_subscriptions").update({ stripe_customer_id: customerId, stripe_subscription_id: subscriptionId, stripe_livemode: Boolean(session.livemode) }).eq("id", local.id);
  if (error) throw error;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ ok: false, code: "STRIPE_ENV_MISSING" }, { status: 500 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ ok: false, code: "STRIPE_SIGNATURE_MISSING" }, { status: 400 });

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return Response.json({ ok: false, code: "STRIPE_SIGNATURE_INVALID" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: existing, error: existingError } = await admin.from("stripe_webhook_events").select("status").eq("stripe_event_id", event.id).maybeSingle();
  if (existingError) return Response.json({ ok: false, code: "STRIPE_LEDGER_READ_FAILED" }, { status: 500 });
  if (existing?.status === "processed") return Response.json({ ok: true, duplicate: true });
  if (!existing) {
    const { error } = await admin.from("stripe_webhook_events").insert({ stripe_event_id: event.id, event_type: event.type, livemode: event.livemode, status: "received", metadata: {} });
    if (error && error.code !== "23505") return Response.json({ ok: false, code: "STRIPE_LEDGER_WRITE_FAILED" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await reconcileCheckoutSession(admin, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await reconcileSubscription(admin, event.data.object as SubscriptionLike);
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as unknown as Record<string, unknown>;
        const subscriptionId = stringId(invoice.subscription);
        if (subscriptionId) {
          const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
          await reconcileSubscription(admin, subscription as SubscriptionLike);
        }
        break;
      }
      default:
        break;
    }
    const { error } = await admin.from("stripe_webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), error_message: null }).eq("stripe_event_id", event.id);
    if (error) return Response.json({ ok: false, code: "STRIPE_LEDGER_WRITE_FAILED" }, { status: 500 });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STRIPE_WEBHOOK_PROCESSING_FAILED";
    await admin.from("stripe_webhook_events").update({ status: "failed", error_message: message.slice(0, 240) }).eq("stripe_event_id", event.id);
    return Response.json({ ok: false, code: "STRIPE_WEBHOOK_PROCESSING_FAILED" }, { status: 500 });
  }
}
