import {
  assertDatabaseResult,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
  requirePosContext,
} from "@/lib/pos/server";
import {
  isEffectiveEntitlementsResponse,
  type EffectiveEntitlementsResponse,
} from "@/lib/pos/entitlements";
import {
  isEffectiveCommercialAccess,
  isSubscriptionLifecycle,
  type EffectiveCommercialAccess,
  type SubscriptionLifecycle,
} from "@/lib/pos/lifecycle";
import {
  isPosProfileFamily,
  type PosProfileFamily,
} from "@/lib/pos/capabilities";
import { resolvePosCommercialContext } from "@/lib/pos/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const context = await requirePosContext(brandSlug);
    const { admin, brand, user, membership } = context;

    const { error: initializeError } = await admin.rpc(
      "pos_initialize_brand_setup",
      {
        p_brand_id: brand.id,
        p_brand_slug: brand.slug,
        p_brand_name: brand.name,
        p_user_id: user.userId,
      }
    );

    assertDatabaseResult(
      initializeError,
      "No se pudo inicializar Cometa POS."
    );

    const [
      profileResult,
      capabilitiesResult,
      brandingResult,
      subscriptionResult,
      locationsResult,
      registersResult,
      openSessionsResult,
      productCountResult,
      variantCountResult,
      inventoryCountResult,
      customerCountResult,
      loyaltyProgramResult,
      entitlementsResult,
      lifecycleResult,
      effectiveCommercialAccessResult,
      membershipCountResult,
    ] = await Promise.all([
      admin
        .from("pos_business_profiles")
        .select("*")
        .eq("brand_slug", brand.slug)
        .single(),

      admin
        .from("pos_business_capabilities")
        .select(
          `
            capability_code,
            enabled,
            source,
            capability:pos_capability_catalog(
              code,
              name,
              description,
              category,
              launch_status,
              sort_order
            )
          `
        )
        .eq("brand_slug", brand.slug)
        .order("capability_code"),

      admin
        .from("pos_branding")
        .select("*")
        .eq("brand_slug", brand.slug)
        .single(),

      admin
        .from("pos_subscriptions")
        .select("*")
        .eq("brand_slug", brand.slug)
        .single(),

      admin
        .from("pos_locations")
        .select("*")
        .eq("brand_slug", brand.slug)
        .order("created_at", {
          ascending: true,
        }),

      admin
        .from("pos_registers")
        .select(
          `
            *,
            location:pos_locations(
              id,
              name,
              code
            )
          `
        )
        .eq("brand_slug", brand.slug)
        .order("created_at", {
          ascending: true,
        }),

      admin
        .from("pos_cash_sessions")
        .select(
          `
            *,
            register:pos_registers(
              id,
              name,
              code
            ),
            location:pos_locations(
              id,
              name,
              code
            )
          `
        )
        .eq("brand_slug", brand.slug)
        .eq("status", "open")
        .order("opened_at", {
          ascending: false,
        }),

      admin
        .from("pos_products")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("brand_slug", brand.slug)
        .eq("active", true),

      admin
        .from("pos_product_variants")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("brand_slug", brand.slug)
        .eq("active", true),

      admin
        .from("pos_inventory")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("brand_slug", brand.slug)
        .gt("quantity", 0),

      admin
        .from("pos_customers")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("brand_slug", brand.slug)
        .eq("active", true),

      admin
        .from("pos_loyalty_programs")
        .select("*")
        .eq("brand_slug", brand.slug)
        .maybeSingle(),

      admin.rpc("pos_get_brand_entitlements", {
        p_brand_slug: brand.slug,
      }),

      admin.rpc("pos_get_subscription_lifecycle", {
        p_brand_slug: brand.slug,
      }),

      admin.rpc("pos_get_effective_commercial_access", {
        p_brand_slug: brand.slug,
      }),

      admin
        .from("user_brand_access")
        .select("user_id", {
          count: "exact",
          head: true,
        })
        .eq("brand_slug", brand.slug)
        .eq("status", "active"),
    ]);

    assertDatabaseResult(
      profileResult.error,
      "No se pudo cargar el perfil del negocio."
    );

    assertDatabaseResult(
      capabilitiesResult.error,
      "No se pudieron cargar las capacidades."
    );

    assertDatabaseResult(
      brandingResult.error,
      "No se pudo cargar la identidad visual."
    );

    assertDatabaseResult(
      subscriptionResult.error,
      "No se pudo cargar la suscripción."
    );

    assertDatabaseResult(
      locationsResult.error,
      "No se pudieron cargar las sucursales."
    );

    assertDatabaseResult(
      registersResult.error,
      "No se pudieron cargar las cajas."
    );

    assertDatabaseResult(
      openSessionsResult.error,
      "No se pudieron cargar los turnos abiertos."
    );

    assertDatabaseResult(
      productCountResult.error,
      "No se pudo contar el catálogo."
    );

    assertDatabaseResult(
      variantCountResult.error,
      "No se pudieron contar las variantes."
    );

    assertDatabaseResult(
      inventoryCountResult.error,
      "No se pudo consultar el inventario."
    );

    assertDatabaseResult(
      customerCountResult.error,
      "No se pudieron contar los clientes."
    );

    assertDatabaseResult(
      loyaltyProgramResult.error,
      "No se pudo consultar el programa de fidelización."
    );

    assertDatabaseResult(
      entitlementsResult.error,
      "No se pudieron resolver los derechos comerciales."
    );

    assertDatabaseResult(
      lifecycleResult.error,
      "No se pudo resolver el ciclo de vida de la suscripción."
    );

    assertDatabaseResult(
      effectiveCommercialAccessResult.error,
      "No se pudo resolver el acceso comercial efectivo."
    );

    assertDatabaseResult(
      membershipCountResult.error,
      "No se pudo contar a los usuarios del negocio."
    );

    if (!isEffectiveEntitlementsResponse(entitlementsResult.data)) {
      throw new Error("Respuesta inválida de pos_get_brand_entitlements.");
    }

    const effectiveEntitlements: EffectiveEntitlementsResponse = entitlementsResult.data;

    if (!isSubscriptionLifecycle(lifecycleResult.data)) {
      throw new Error("Respuesta inválida de pos_get_subscription_lifecycle.");
    }

    const lifecycle: SubscriptionLifecycle = lifecycleResult.data;

    if (!isEffectiveCommercialAccess(effectiveCommercialAccessResult.data)) {
      throw new Error("Respuesta inválida de pos_get_effective_commercial_access.");
    }

    const effectiveCommercialAccess: EffectiveCommercialAccess =
      effectiveCommercialAccessResult.data;
    const effectivePlanCode = effectiveCommercialAccess.effective.planCode;

    if (!effectivePlanCode) {
      throw new Error("El acceso comercial efectivo no resolvió un plan POS.");
    }

    const subscription = subscriptionResult.data;

    const [
      subscriptionPlanResult,
      subscriptionPlanLimitsResult,
      effectivePlanResult,
      effectivePlanLimitsResult,
      profileCatalogResult,
      profileFamilyResult,
    ] = await Promise.all([
      admin
        .from("pos_plans")
        .select("*")
        .eq("code", subscription.plan_code)
        .single(),

      admin
        .from("pos_plan_limits")
        .select("*")
        .eq("plan_code", subscription.plan_code)
        .single(),

      admin
        .from("pos_plans")
        .select("*")
        .eq("code", effectivePlanCode)
        .single(),

      admin
        .from("pos_plan_limits")
        .select("*")
        .eq("plan_code", effectivePlanCode)
        .single(),

      admin
        .from("pos_profile_catalog")
        .select(
          `
            code,
            name,
            description,
            icon_code,
            launch_status,
            sort_order
          `
        )
        .eq("code", profileResult.data.profile_code)
        .single(),

      admin.rpc("pos_profile_family", {
        p_profile_code: profileResult.data.profile_code,
      }),
    ]);

    assertDatabaseResult(
      subscriptionPlanResult.error,
      "No se pudo cargar el plan contratado."
    );

    assertDatabaseResult(
      subscriptionPlanLimitsResult.error,
      "No se pudieron cargar los límites del plan."
    );

    assertDatabaseResult(
      effectivePlanResult.error,
      "No se pudo cargar el plan comercial efectivo."
    );

    assertDatabaseResult(
      effectivePlanLimitsResult.error,
      "No se pudieron cargar los límites comerciales efectivos."
    );

    assertDatabaseResult(
      profileCatalogResult.error,
      "No se pudo cargar la información del giro."
    );

    assertDatabaseResult(
      profileFamilyResult.error,
      "No se pudo resolver la familia del perfil."
    );

    if (!isPosProfileFamily(profileFamilyResult.data)) {
      throw new Error("Respuesta inválida de pos_profile_family.");
    }

    const profileFamily: PosProfileFamily = profileFamilyResult.data;

    const locations = locationsResult.data || [];
    const registers = registersResult.data || [];
    const openSessions =
      openSessionsResult.data || [];
    const profile = profileResult.data;
    const branding = brandingResult.data;

    const commercial = resolvePosCommercialContext({
      plan: effectivePlanResult.data,
      limits: effectivePlanLimitsResult.data,
      usage: {
        locations: locations.length,
        registers: registers.length,
        users: membershipCountResult.count || 0,
      },
    });

    const capabilities = Object.fromEntries(
      (capabilitiesResult.data || []).map(
        (row) => [
          row.capability_code,
          Boolean(row.enabled),
        ]
      )
    );

    const effectiveCapabilities = (capabilitiesResult.data || [])
      .filter((row) => {
        const relation = Array.isArray(row.capability)
          ? row.capability[0]
          : row.capability;

        return Boolean(row.enabled) && relation?.launch_status === "live";
      })
      .map((row) => row.capability_code);

    const readinessSteps = {
      profile:
        profile.profile_code !== "unconfigured",

      branding:
        profile.onboarding_step >= 3 &&
        Boolean(branding.display_name) &&
        Boolean(branding.loyalty_program_name),

      location: locations.length > 0,

      register: registers.length > 0,

      products:
        (productCountResult.count || 0) > 0,

      inventory:
        (inventoryCountResult.count || 0) > 0,

      loyalty:
        Boolean(
          loyaltyProgramResult.data?.active
        ),
    };

    const completedSteps = Object.values(
      readinessSteps
    ).filter(Boolean).length;

    const totalSteps =
      Object.keys(readinessSteps).length;

    return ok({
      user,
      brand,

      membership: membership
        ? {
            role: membership.role,
            effectiveRole: membership.effectiveRole,
            permissions: membership.permissions,
            legacy: membership.legacy,
          }
        : null,

      profile: {
        ...profile,
        profile: profileCatalogResult.data,
      },

      capabilities,
      capabilityRows:
        capabilitiesResult.data || [],

      profileCode: profile.profile_code,
      profileFamily,
      effectiveCapabilities,

      effectiveEntitlements,

      lifecycle,

      effectiveCommercialAccess,

      commercial,

      branding,

      subscription: {
        ...subscription,
        plan: {
          ...subscriptionPlanResult.data,
          limits: subscriptionPlanLimitsResult.data,
        },
      },

      onboardingRequired:
        profile.profile_code ===
          "unconfigured" ||
        profile.onboarding_status ===
          "not_started",

      setup: {
        steps: readinessSteps,
        completedSteps,
        totalSteps,
        percentage: Math.round(
          (completedSteps / totalSteps) * 100
        ),
      },

      locations,
      registers,
      openSessions,

      counts: {
        products:
          productCountResult.count || 0,

        variants:
          variantCountResult.count || 0,

        inventoryWithStock:
          inventoryCountResult.count || 0,

        customers:
          customerCountResult.count || 0,
      },

      loyaltyProgram:
        loyaltyProgramResult.data || null,
    });
  } catch (error) {
    return handlePosError(error);
  }
}
