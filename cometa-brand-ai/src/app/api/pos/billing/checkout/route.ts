import { randomUUID } from "node:crypto";

import {
  getAppOrigin,
  getStripeClient,
  getStripeBillingLink,
  getStripeRuntimeMode,
  getStripePriceId,
} from "@/lib/stripe/server";
import {
  assertDatabaseResult,
  handlePosError,
  ok,
  readJsonBody,
  requiredText,
  requirePosContext,
} from "@/lib/pos/server";
import { hasPosPermission, requirePosPermission } from "@/lib/pos/rbac";
import { isEffectiveCommercialAccess } from "@/lib/pos/lifecycle";

export const runtime = "nodejs";

type CheckoutBody = { brandSlug?: unknown; planCode?: unknown };

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CheckoutBody>(request);
    const brandSlug = requiredText(body.brandSlug, "brandSlug", 120);
    const planCode = requiredText(body.planCode, "planCode", 20).toLowerCase();
    const context = await requirePosContext(brandSlug);
    requirePosPermission(context, "pos.subscription.manage");

    const { admin, brand, membership } = context;
    if (!membership || !hasPosPermission(membership, "pos.subscription.manage")) {
      throw Object.assign(new Error("POS_PERMISSION_REQUIRED"), { status: 403 });
    }

    const { data: plan, error: planError } = await admin
      .from("pos_plans")
      .select("code,active")
      .eq("code", planCode)
      .maybeSingle();
    assertDatabaseResult(planError, "No se pudo validar el plan.");
    if (!plan?.active || !["start", "pro", "multi"].includes(plan.code)) {
      return Response.json({ ok: false, code: "POS_PLAN_INVALID", error: "El plan seleccionado no está disponible." }, { status: 400 });
    }

    const { data: effectiveData, error: effectiveError } = await admin.rpc(
      "pos_get_effective_commercial_access",
      { p_brand_slug: brand.slug }
    );
    assertDatabaseResult(effectiveError, "No se pudo validar el acceso comercial.");
    if (isEffectiveCommercialAccess(effectiveData) && effectiveData.grant.active) {
      return Response.json({ ok: false, code: "POS_BILLING_GRANT_ACTIVE", error: "Tu acceso está cubierto por un beneficio comercial activo." }, { status: 409 });
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from("pos_subscriptions")
      .select("id")
      .eq("brand_slug", brand.slug)
      .maybeSingle();
    assertDatabaseResult(subscriptionError, "No se pudo validar la suscripción.");
    if (!subscription) {
      return Response.json({ ok: false, code: "POS_SUBSCRIPTION_NOT_FOUND", error: "No existe una suscripción POS para esta empresa." }, { status: 409 });
    }
    const livemode = getStripeRuntimeMode();
    let link = await getStripeBillingLink(admin, brand.slug, livemode);
    if (!link) {
      const { data: createdLink, error: linkError } = await admin
        .from("pos_stripe_billing_links")
        .insert({ brand_slug: brand.slug, livemode })
        .select("id,brand_slug,livemode,stripe_customer_id,stripe_subscription_id,stripe_price_id,stripe_cancel_at_period_end")
        .single();
      if (linkError?.code === "23505") {
        link = await getStripeBillingLink(admin, brand.slug, livemode);
      } else {
        assertDatabaseResult(linkError, "No se pudo preparar la identidad de Stripe.");
        link = createdLink;
      }
    }
    if (!link) return Response.json({ ok: false, code: "POS_STRIPE_LINK_NOT_CONFIGURED", error: "No se pudo resolver la identidad de Stripe para este entorno." }, { status: 409 });

    const stripe = getStripeClient();
    if (link.stripe_subscription_id) {
      let previousSubscription;
      try {
        previousSubscription = await stripe.subscriptions.retrieve(link.stripe_subscription_id);
      } catch (cause) {
        const stripeError = cause as { code?: string; statusCode?: number };
        if (stripeError.code === "resource_missing" || stripeError.statusCode === 404) {
          return Response.json({ ok: false, code: "POS_STRIPE_SUBSCRIPTION_LOOKUP_FAILED", error: "No se pudo verificar la suscripción histórica de Stripe para esta empresa." }, { status: 409 });
        }
        throw cause;
      }

      const terminalStatuses = new Set(["canceled", "incomplete_expired"]);
      if (!terminalStatuses.has(previousSubscription.status)) {
        return Response.json({ ok: false, code: "POS_STRIPE_SUBSCRIPTION_EXISTS", error: "Ya existe una suscripción de Stripe vigente para esta empresa." }, { status: 409 });
      }
    }

    let customerId = link.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { name: brand.name, metadata: { brand_slug: brand.slug, pos_subscription_id: subscription.id } },
        { idempotencyKey: `cometa-customer-${brand.slug}` }
      );
      customerId = customer.id;
      const { error } = await admin.from("pos_stripe_billing_links").update({ stripe_customer_id: customerId }).eq("id", link.id);
      assertDatabaseResult(error, "No se pudo asociar el cliente de Stripe.");
    }

    const priceId = getStripePriceId(plan.code);
    const checkoutAttemptId = randomUUID();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${getAppOrigin()}/brand/${encodeURIComponent(brand.slug)}/pos/subscription?checkout=success`,
        cancel_url: `${getAppOrigin()}/brand/${encodeURIComponent(brand.slug)}/pos/subscription?checkout=cancelled`,
        client_reference_id: subscription.id,
        metadata: { brand_slug: brand.slug, plan_code: plan.code, pos_subscription_id: subscription.id, livemode: String(livemode) },
        subscription_data: { metadata: { brand_slug: brand.slug, plan_code: plan.code, pos_subscription_id: subscription.id, livemode: String(livemode) } },
      },
      { idempotencyKey: `cometa-checkout-${subscription.id}-${checkoutAttemptId}` }
    );

    return ok({ checkoutUrl: session.url });
  } catch (error) {
    return handlePosError(error);
  }
}
