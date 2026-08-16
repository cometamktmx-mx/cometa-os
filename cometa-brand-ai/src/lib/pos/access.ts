import "server-only";

import {
  PosApiError,
  assertDatabaseResult,
  requirePosContext,
  type PosRequestContext,
} from "@/lib/pos/server";
import {
  hasEntitlement,
  isEffectiveEntitlementsResponse,
  type EffectiveEntitlementsResponse,
  type ProductEntitlementCode,
} from "@/lib/pos/entitlements";
import {
  isEffectiveCommercialAccess,
  isSubscriptionLifecycle,
  type EffectiveCommercialAccess,
  type SubscriptionLifecycle,
} from "@/lib/pos/lifecycle";

export type PosOperationalAccessContext = PosRequestContext & {
  lifecycle: SubscriptionLifecycle;
  effectiveCommercialAccess: EffectiveCommercialAccess;
  effectiveEntitlements: EffectiveEntitlementsResponse;
};

export type PassivePosProductAvailability = {
  state: "active" | "preparation" | "unavailable";
  available: boolean;
  planCode: string | null;
  lifecycleStatus: string | null;
  reason:
    | "subscription_not_configured"
    | "lifecycle_access_denied"
    | "pos_access_not_entitled"
    | "commercial_access_lookup_failed"
    | "commercial_access_response_invalid"
    | null;
};

/**
 * Resolves only persisted POS commercial state for product presentation.
 * It deliberately never calls pos_initialize_brand_setup or a route that can
 * create a subscription, location, register, or other POS setup records.
 */
export async function getPassivePosProductAvailability(
  brandSlug: string
): Promise<PassivePosProductAvailability> {
  try {
    const context = await requirePosContext(brandSlug);
    const { admin, brand } = context;
    const [effectiveAccessResult, subscriptionResult, lifecycleResult] = await Promise.all([
      admin.rpc("pos_get_effective_commercial_access", {
        p_brand_slug: brand.slug,
      }),
      admin
        .from("pos_subscriptions")
        .select("plan_code")
        .eq("brand_slug", brand.slug)
        .maybeSingle(),
      admin.rpc("pos_get_subscription_lifecycle", {
        p_brand_slug: brand.slug,
      }),
    ]);

    if (effectiveAccessResult.error || subscriptionResult.error) {
      return unavailablePosProduct("commercial_access_lookup_failed");
    }

    if (!isEffectiveCommercialAccess(effectiveAccessResult.data)) {
      return unavailablePosProduct("commercial_access_response_invalid");
    }

    const effectiveCommercialAccess = effectiveAccessResult.data;
    const effectivePlanCode = effectiveCommercialAccess.effective.planCode;
    const nativeLifecycle = effectiveCommercialAccess.subscriptionLifecycle;

    if (!subscriptionResult.data && !effectiveCommercialAccess.effective.accessAllowed) {
      return {
        state: "preparation",
        available: false,
        planCode: null,
        lifecycleStatus: null,
        reason: "subscription_not_configured",
      };
    }

    if (subscriptionResult.data && lifecycleResult.error) {
      return unavailablePosProduct(
        "commercial_access_lookup_failed",
        effectivePlanCode
      );
    }

    if (subscriptionResult.data && !isSubscriptionLifecycle(lifecycleResult.data)) {
      return unavailablePosProduct(
        "commercial_access_response_invalid",
        effectivePlanCode
      );
    }

    const lifecycle = isSubscriptionLifecycle(lifecycleResult.data)
      ? lifecycleResult.data
      : nativeLifecycle;

    const entitlementsResult = await admin.rpc("pos_get_brand_entitlements", {
      p_brand_slug: brand.slug,
    });

    if (entitlementsResult.error) {
      return unavailablePosProduct(
        "commercial_access_lookup_failed",
        effectivePlanCode
      );
    }

    if (!isEffectiveEntitlementsResponse(entitlementsResult.data)) {
      return unavailablePosProduct(
        "commercial_access_response_invalid",
        effectivePlanCode
      );
    }

    const effectiveEntitlements = entitlementsResult.data;

    if (lifecycle) {
      if (!lifecycle.accessAllowed) {
        if (!effectiveCommercialAccess.effective.accessAllowed) {
          return {
            state: "unavailable",
            available: false,
            planCode: effectivePlanCode,
            lifecycleStatus: lifecycle.effectiveStatus,
            reason: "lifecycle_access_denied",
          };
        }
      }
    }

    if (!effectiveCommercialAccess.effective.accessAllowed) {
      return {
        state: "unavailable",
        available: false,
        planCode: effectivePlanCode,
        lifecycleStatus: nativeLifecycle?.effectiveStatus || null,
        reason: "lifecycle_access_denied",
      };
    }

    if (!hasEntitlement(effectiveEntitlements, "pos.access")) {
      return {
        state: "unavailable",
        available: false,
        planCode: effectivePlanCode,
        lifecycleStatus: nativeLifecycle?.effectiveStatus || null,
        reason: "pos_access_not_entitled",
      };
    }

    return {
      state: "active",
      available: true,
      planCode: effectivePlanCode,
      lifecycleStatus: nativeLifecycle?.effectiveStatus || null,
      reason: null,
    };
  } catch {
    return unavailablePosProduct("commercial_access_lookup_failed");
  }
}

export async function requirePosOperationalAccess({
  brandSlug,
  entitlement,
}: {
  brandSlug: string;
  entitlement: ProductEntitlementCode;
}): Promise<PosOperationalAccessContext> {
  const context = await requirePosContext(brandSlug);
  const { admin, brand } = context;

  const [lifecycleResult, effectiveAccessResult, entitlementsResult] = await Promise.all([
    admin.rpc("pos_get_subscription_lifecycle", {
      p_brand_slug: brand.slug,
    }),
    admin.rpc("pos_get_effective_commercial_access", {
      p_brand_slug: brand.slug,
    }),
    admin.rpc("pos_get_brand_entitlements", {
      p_brand_slug: brand.slug,
    }),
  ]);

  assertDatabaseResult(
    lifecycleResult.error,
    "No se pudo validar el acceso comercial de Cometa POS."
  );
  assertDatabaseResult(
    effectiveAccessResult.error,
    "No se pudo resolver el acceso comercial efectivo de Cometa POS."
  );
  assertDatabaseResult(
    entitlementsResult.error,
    "No se pudieron validar los derechos comerciales de Cometa POS."
  );

  if (!isSubscriptionLifecycle(lifecycleResult.data)) {
    throw new PosApiError(
      500,
      "POS_ACCESS_RESPONSE_INVALID",
      "El estado comercial de Cometa POS no es válido."
    );
  }
  if (!isEffectiveCommercialAccess(effectiveAccessResult.data)) {
    throw new PosApiError(
      500,
      "POS_ACCESS_RESPONSE_INVALID",
      "El acceso comercial efectivo de Cometa POS no es válido."
    );
  }
  if (!isEffectiveEntitlementsResponse(entitlementsResult.data)) {
    throw new PosApiError(
      500,
      "POS_ACCESS_RESPONSE_INVALID",
      "Los derechos comerciales de Cometa POS no son válidos."
    );
  }

  const lifecycle = lifecycleResult.data;
  const effectiveCommercialAccess = effectiveAccessResult.data;
  const effectiveEntitlements = entitlementsResult.data;

  if (!effectiveCommercialAccess.effective.accessAllowed) {
    throw new PosApiError(
      403,
      "POS_SUBSCRIPTION_ACCESS_DENIED",
      "La suscripción de Cometa POS no permite acceso operacional.",
      {
        effectiveStatus: lifecycle.effectiveStatus,
        requiresActivation: lifecycle.requiresActivation,
        accessSource: effectiveCommercialAccess.effective.accessSource,
      }
    );
  }

  if (!effectiveEntitlements.entitlements.includes(entitlement)) {
    throw new PosApiError(
      403,
      "POS_ENTITLEMENT_REQUIRED",
      "El plan de Cometa POS no incluye esta función.",
      { requiredEntitlement: entitlement }
    );
  }

  return {
    ...context,
    lifecycle,
    effectiveCommercialAccess,
    effectiveEntitlements,
  };
}

function unavailablePosProduct(
  reason: Extract<
    PassivePosProductAvailability["reason"],
    "commercial_access_lookup_failed" | "commercial_access_response_invalid"
  >,
  planCode: string | null = null
): PassivePosProductAvailability {
  return {
    state: "unavailable",
    available: false,
    planCode,
    lifecycleStatus: null,
    reason,
  };
}
