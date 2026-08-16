import { assertDatabaseResult, getBrandSlugFromUrl, handlePosError, ok, requirePosContext } from "@/lib/pos/server";
import { hasPosPermission, requirePosPermission } from "@/lib/pos/rbac";
import { isEffectiveCommercialAccess } from "@/lib/pos/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requirePosContext(getBrandSlugFromUrl(request));
    requirePosPermission(context, "pos.subscription.view");
    const { admin, brand, membership } = context;
    const [subscriptionResult, accessResult] = await Promise.all([
      admin.from("pos_subscriptions").select("plan_code,status,list_price,contracted_price,currency,billing_interval,trial_ends_at,current_period_start,current_period_end,stripe_cancel_at_period_end,stripe_customer_id,stripe_subscription_id,plan:pos_plans(name)").eq("brand_slug", brand.slug).maybeSingle(),
      admin.rpc("pos_get_effective_commercial_access", { p_brand_slug: brand.slug }),
    ]);
    assertDatabaseResult(subscriptionResult.error, "No se pudo cargar la suscripción.");
    assertDatabaseResult(accessResult.error, "No se pudo resolver el acceso comercial.");
    const access = isEffectiveCommercialAccess(accessResult.data) ? accessResult.data : null;
    const grant = access?.grant ?? { active: false, planCode: null, type: null, startsAt: null, endsAt: null };
    const daysRemaining = grant.endsAt ? Math.max(0, Math.ceil((new Date(grant.endsAt).getTime() - Date.now()) / 86400000)) : null;
    const subscription = subscriptionResult.data as (Record<string, unknown> & { plan?: { name?: string } | Array<{ name?: string }> | null }) | null;
    return ok({
      canManage: hasPosPermission(membership, "pos.subscription.manage"),
      subscription: subscription ? {
        planCode: subscription.plan_code,
        status: subscription.status,
        listPrice: subscription.list_price,
        contractedPrice: subscription.contracted_price,
        currency: subscription.currency,
        billingInterval: subscription.billing_interval,
        trialEndsAt: subscription.trial_ends_at,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: Boolean(subscription.stripe_cancel_at_period_end),
        planName: Array.isArray(subscription.plan) ? subscription.plan[0]?.name ?? null : subscription.plan?.name ?? null,
      } : null,
      effectiveCommercialAccess: access ? {
        accessAllowed: access.effective.accessAllowed,
        accessSource: access.effective.accessSource,
        planCode: access.effective.planCode,
        planSource: access.effective.planSource,
      } : null,
      grant: { active: grant.active, code: grant.active ? "COMETA-AGENCY-6M" : null, type: grant.type, startsAt: grant.startsAt, endsAt: grant.endsAt, daysRemaining },
      stripe: { connected: Boolean(subscription?.stripe_customer_id), subscriptionConnected: Boolean(subscription?.stripe_subscription_id) },
    });
  } catch (error) {
    return handlePosError(error);
  }
}
