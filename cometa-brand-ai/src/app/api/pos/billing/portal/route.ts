import { getAppOrigin, getStripeClient } from "@/lib/stripe/server";
import { assertDatabaseResult, handlePosError, ok, requiredText, readJsonBody, requirePosContext } from "@/lib/pos/server";
import { requirePosPermission } from "@/lib/pos/rbac";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{ brandSlug?: unknown }>(request);
    const brandSlug = requiredText(body.brandSlug, "brandSlug", 120);
    const context = await requirePosContext(brandSlug);
    requirePosPermission(context, "pos.subscription.manage");
    const { admin, brand } = context;
    const { data: subscription, error } = await admin
      .from("pos_subscriptions")
      .select("stripe_customer_id")
      .eq("brand_slug", brand.slug)
      .maybeSingle();
    assertDatabaseResult(error, "No se pudo cargar la facturación.");
    if (!subscription?.stripe_customer_id) {
      return Response.json({ ok: false, code: "POS_STRIPE_CUSTOMER_REQUIRED", error: "Aún no existe un cliente de Stripe para esta empresa." }, { status: 409 });
    }
    const portal = await getStripeClient().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${getAppOrigin()}/brand/${encodeURIComponent(brand.slug)}/pos/subscription`,
    });
    return ok({ portalUrl: portal.url });
  } catch (error) {
    return handlePosError(error);
  }
}
