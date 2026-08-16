import {
  assertDatabaseResult,
  booleanValue,
  fail,
  getBrandSlugFromUrl,
  handlePosError,
  numberValue,
  ok,
  optionalText,
  readJsonBody,
  requiredText,
  requirePosContext,
} from "@/lib/pos/server";
import {
  isSubscriptionLifecycle,
  type SubscriptionLifecycle,
} from "@/lib/pos/lifecycle";
import {
  isEffectiveEntitlementsResponse,
  type EffectiveEntitlementsResponse,
} from "@/lib/pos/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscriptionBody = {
  brandSlug?: unknown;
  action?: unknown;
  contractedPrice?: unknown;
  promotionCode?: unknown;
  priceLocked?: unknown;
  status?: unknown;
  reason?: unknown;
};

const VALID_STATUSES = new Set([
  "trial",
  "active",
  "past_due",
  "grace_period",
  "suspended",
  "cancelled",
]);

async function initializePosSubscription(
  brandSlug: string
) {
  const context = await requirePosContext(brandSlug);
  const { admin, brand, user } = context;

  const { error } = await admin.rpc(
    "pos_initialize_brand_setup",
    {
      p_brand_id: brand.id,
      p_brand_slug: brand.slug,
      p_brand_name: brand.name,
      p_user_id: user.userId,
    }
  );

  assertDatabaseResult(
    error,
    "No se pudo inicializar la suscripción de Cometa POS."
  );

  return context;
}

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);

    const { admin, brand } =
      await initializePosSubscription(brandSlug);

    const [subscriptionResult, lifecycleResult, entitlementsResult] =
      await Promise.all([
        admin
          .from("pos_subscriptions")
          .select(
        `
          *,
          plan:pos_plans(
            code,
            name,
            description,
            list_price,
            currency,
            billing_interval,
            active,
            limits:pos_plan_limits(
              max_locations,
              max_registers,
              max_users,
              max_products,
              max_customers,
              includes_loyalty,
              includes_digital_card,
              includes_basic_insights
            )
          )
        `
          )
          .eq("brand_slug", brand.slug)
          .single(),
        admin.rpc("pos_get_subscription_lifecycle", {
          p_brand_slug: brand.slug,
        }),
        admin.rpc("pos_get_brand_entitlements", {
          p_brand_slug: brand.slug,
        }),
      ]);

    assertDatabaseResult(
      subscriptionResult.error,
      "No se pudo cargar la suscripción."
    );
    assertDatabaseResult(
      lifecycleResult.error,
      "No se pudo resolver el ciclo de vida de la suscripción."
    );
    assertDatabaseResult(
      entitlementsResult.error,
      "No se pudieron resolver los derechos comerciales."
    );

    if (!isSubscriptionLifecycle(lifecycleResult.data)) {
      throw new Error("Respuesta inválida de pos_get_subscription_lifecycle.");
    }
    if (!isEffectiveEntitlementsResponse(entitlementsResult.data)) {
      throw new Error("Respuesta inválida de pos_get_brand_entitlements.");
    }

    const lifecycle: SubscriptionLifecycle = lifecycleResult.data;
    const effectiveEntitlements: EffectiveEntitlementsResponse =
      entitlementsResult.data;

    return ok({
      brand,
      subscription: subscriptionResult.data,
      lifecycle,
      effectiveEntitlements,
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body =
      await readJsonBody<SubscriptionBody>(request);

    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );

    const action = requiredText(
      body.action,
      "action",
      40
    );

    const { admin, brand, user } =
      await initializePosSubscription(brandSlug);

    if (action === "initialize") {
      const [subscriptionResult, lifecycleResult] = await Promise.all([
        admin
          .from("pos_subscriptions")
          .select(
          `
            *,
            plan:pos_plans(
              code,
              name,
              description,
              list_price,
              currency,
              billing_interval,
              active,
              limits:pos_plan_limits(
                max_locations,
                max_registers,
                max_users,
                max_products,
                max_customers,
                includes_loyalty,
                includes_digital_card,
                includes_basic_insights
              )
            )
          `
          )
          .eq("brand_slug", brand.slug)
          .single(),
        admin.rpc("pos_get_subscription_lifecycle", {
          p_brand_slug: brand.slug,
        }),
      ]);

      assertDatabaseResult(
        subscriptionResult.error,
        "No se pudo cargar la suscripción."
      );
      assertDatabaseResult(
        lifecycleResult.error,
        "No se pudo resolver el ciclo de vida de la suscripción."
      );

      if (!isSubscriptionLifecycle(lifecycleResult.data)) {
        throw new Error("Respuesta inválida de pos_get_subscription_lifecycle.");
      }

      return ok({
        subscription: subscriptionResult.data,
        lifecycle: lifecycleResult.data,
      });
    }

    if (
      action !== "set_offer" &&
      action !== "change_status" &&
      action !== "transition_status" &&
      action !== "reconcile_lifecycle"
    ) {
      return fail(
        "Acción de suscripción no reconocida.",
        400,
        "POS_SUBSCRIPTION_ACTION_INVALID"
      );
    }

    if (!user.isAdmin) {
      return fail(
        "Solo un administrador de Cometa puede modificar el precio o estado de una suscripción.",
        403,
        "POS_SUBSCRIPTION_ADMIN_REQUIRED"
      );
    }

    if (action === "reconcile_lifecycle") {
      const { data, error } = await admin.rpc(
        "pos_reconcile_subscription_lifecycle",
        {
          p_brand_slug: brand.slug,
        }
      );

      assertDatabaseResult(
        error,
        "No se pudo reconciliar el ciclo de vida de la suscripción."
      );

      if (!isSubscriptionLifecycle(data)) {
        throw new Error("Respuesta inválida de pos_reconcile_subscription_lifecycle.");
      }

      return ok({ lifecycle: data });
    }

    if (action === "transition_status") {
      const requestedStatus = requiredText(
        body.status,
        "status",
        30
      ).toLowerCase();

      if (!VALID_STATUSES.has(requestedStatus)) {
        return fail(
          "El estado de suscripción no es válido.",
          400,
          "POS_SUBSCRIPTION_STATUS_INVALID"
        );
      }

      const { data, error } = await admin.rpc(
        "pos_transition_subscription_status",
        {
          p_brand_slug: brand.slug,
          p_new_status: requestedStatus,
          p_reason: optionalText(body.reason, 500),
          p_user_id: user.userId,
        }
      );

      if (error?.message?.includes("POS_SUBSCRIPTION_TRANSITION_INVALID")) {
        return fail(
          "La transición solicitada no está permitida para el estado actual.",
          409,
          "POS_SUBSCRIPTION_TRANSITION_INVALID"
        );
      }

      assertDatabaseResult(
        error,
        "No se pudo cambiar el estado de la suscripción."
      );

      const subscription = Array.isArray(data) ? data[0] : data;
      const lifecycleResult = await admin.rpc(
        "pos_get_subscription_lifecycle",
        { p_brand_slug: brand.slug }
      );

      assertDatabaseResult(
        lifecycleResult.error,
        "No se pudo resolver el ciclo de vida actualizado."
      );

      if (!isSubscriptionLifecycle(lifecycleResult.data)) {
        throw new Error("Respuesta inválida de pos_get_subscription_lifecycle.");
      }

      return ok({
        subscription,
        lifecycle: lifecycleResult.data,
      });
    }

    const contractedPrice = numberValue(
      body.contractedPrice,
      "contractedPrice",
      {
        min: 0,
      }
    );

    const requestedStatus = (
      optionalText(body.status, 30) || "active"
    )
      .trim()
      .toLowerCase();

    if (!VALID_STATUSES.has(requestedStatus)) {
      return fail(
        "El estado de suscripción no es válido.",
        400,
        "POS_SUBSCRIPTION_STATUS_INVALID"
      );
    }

    const { data, error } = await admin.rpc(
      "pos_set_subscription_offer",
      {
        p_brand_slug: brand.slug,
        p_contract_price: contractedPrice,
        p_promotion_code: optionalText(
          body.promotionCode,
          100
        ),
        p_price_locked: booleanValue(
          body.priceLocked,
          false
        ),
        p_status: requestedStatus,
        p_user_id: user.userId,
      }
    );

    assertDatabaseResult(
      error,
      "No se pudo modificar la oferta contratada."
    );

    const subscription = Array.isArray(data)
      ? data[0]
      : data;

    return ok({
      subscription,
    });
  } catch (error) {
    return handlePosError(error);
  }
}
