import { getAppOrigin, getStripeBillingLink, getStripeClient, getStripeRuntimeMode } from "@/lib/stripe/server";
import { handlePosError, ok, requiredText, readJsonBody, requirePosContext } from "@/lib/pos/server";
import { requirePosPermission } from "@/lib/pos/rbac";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{ brandSlug?: unknown }>(request);
    const brandSlug = requiredText(body.brandSlug, "brandSlug", 120);
    const context = await requirePosContext(brandSlug);
    requirePosPermission(context, "pos.subscription.manage");
    const { admin, brand } = context;
    const link = await getStripeBillingLink(admin, brand.slug, getStripeRuntimeMode());
    if (!link?.stripe_customer_id) {
      return Response.json({ ok: false, code: "POS_STRIPE_CUSTOMER_NOT_CONFIGURED_FOR_ENV", error: "No existe un cliente de Stripe configurado para este entorno." }, { status: 409 });
    }
    const portal = await getStripeClient().billingPortal.sessions.create({
      customer: link.stripe_customer_id,
      return_url: `${getAppOrigin()}/brand/${encodeURIComponent(brand.slug)}/pos/subscription`,
    });
    return ok({ portalUrl: portal.url });
  } catch (error) {
    return handlePosError(error);
  }
}
