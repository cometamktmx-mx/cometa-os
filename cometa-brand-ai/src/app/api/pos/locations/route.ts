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
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateLocationBody = {
  brandSlug?: unknown;
  name?: unknown;
  code?: unknown;
  phone?: unknown;
  email?: unknown;
  addressLine1?: unknown;
  addressLine2?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  country?: unknown;
  timezone?: unknown;
  currency?: unknown;
  taxName?: unknown;
  taxRate?: unknown;
  pricesIncludeTax?: unknown;
  active?: unknown;
};

async function getLocationPlanState(
  admin: any,
  brandSlug: string,
  effectivePlanCode: string
) {
  const [
    profileResult,
    locationCountResult,
  ] = await Promise.all([
    admin
      .from("pos_business_profiles")
      .select("profile_code,onboarding_status")
      .eq("brand_slug", brandSlug)
      .single(),

    admin
      .from("pos_locations")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("brand_slug", brandSlug),
  ]);

  assertDatabaseResult(
    profileResult.error,
    "No se pudo validar el perfil del negocio."
  );

  assertDatabaseResult(
    locationCountResult.error,
    "No se pudo validar el uso de sucursales."
  );

  const { data: limits, error: limitsError } =
    await admin
      .from("pos_plan_limits")
      .select("max_locations")
      .eq(
        "plan_code",
        effectivePlanCode
      )
      .single();

  assertDatabaseResult(
    limitsError,
    "No se pudieron cargar los límites del plan."
  );

  return {
    profile: profileResult.data,
    maxLocations: Number(
      limits?.max_locations ?? 1
    ),
    currentLocations:
      locationCountResult.count || 0,
  };
}

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const access =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.access" });
    const { admin, brand } = access;
    const effectivePlanCode = getEffectivePlanCode(access.effectiveCommercialAccess);

    const [locationsResult, planState] =
      await Promise.all([
        admin
          .from("pos_locations")
          .select("*")
          .eq("brand_slug", brand.slug)
          .order("active", {
            ascending: false,
          })
          .order("created_at", {
            ascending: true,
          }),

        getLocationPlanState(
          admin,
          brand.slug,
          effectivePlanCode
        ),
      ]);

    assertDatabaseResult(
      locationsResult.error,
      "No se pudieron cargar las sucursales."
    );

    return ok({
      brand,
      locations: locationsResult.data || [],
      usage: {
        current:
          planState.currentLocations,
        limit: planState.maxLocations,
        available: Math.max(
          0,
          planState.maxLocations -
            planState.currentLocations
        ),
      },
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body =
      await readJsonBody<CreateLocationBody>(
        request
      );

    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );

    const access =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.access" });
    const { admin, brand, user } = access;
    const effectivePlanCode = getEffectivePlanCode(access.effectiveCommercialAccess);

    const planState =
      await getLocationPlanState(
        admin,
        brand.slug,
        effectivePlanCode
      );

    if (
      planState.profile.profile_code ===
      "unconfigured"
    ) {
      return fail(
        "Primero configura el giro y las funciones del negocio.",
        409,
        "POS_PROFILE_REQUIRED"
      );
    }

    if (
      planState.currentLocations >=
      planState.maxLocations
    ) {
      return fail(
        `Tu plan incluye ${planState.maxLocations} sucursal. Para agregar otra necesitas ampliar el plan.`,
        409,
        "POS_LOCATION_LIMIT_REACHED"
      );
    }

    const name = requiredText(
      body.name,
      "name",
      120
    );

    const code =
      optionalText(body.code, 40) ||
      generateCode(name);

    const payload = {
      brand_id: brand.id,
      brand_slug: brand.slug,
      name,
      code: code.toUpperCase(),
      phone: optionalText(body.phone, 40),
      email: optionalText(body.email, 180),
      address_line1: optionalText(
        body.addressLine1,
        220
      ),
      address_line2: optionalText(
        body.addressLine2,
        220
      ),
      city: optionalText(body.city, 120),
      state: optionalText(body.state, 120),
      postal_code: optionalText(
        body.postalCode,
        20
      ),
      country: (
        optionalText(body.country, 2) || "MX"
      ).toUpperCase(),
      timezone:
        optionalText(body.timezone, 80) ||
        "America/Mexico_City",
      currency: (
        optionalText(body.currency, 3) || "MXN"
      ).toUpperCase(),
      tax_name:
        optionalText(body.taxName, 30) ||
        "IVA",
      tax_rate: numberValue(
        body.taxRate,
        "taxRate",
        {
          min: 0,
          max: 100,
          defaultValue: 0,
        }
      ),
      prices_include_tax: booleanValue(
        body.pricesIncludeTax,
        true
      ),
      active: booleanValue(
        body.active,
        true
      ),
      created_by: user.userId,
    };

    const { data, error } = await admin
      .from("pos_locations")
      .insert(payload)
      .select("*")
      .single();

    if (error?.code === "23505") {
      return fail(
        "Ya existe una sucursal con ese nombre o código.",
        409,
        "POS_LOCATION_DUPLICATED"
      );
    }

    assertDatabaseResult(
      error,
      "No se pudo crear la sucursal."
    );

    await admin
      .from("pos_business_profiles")
      .update({
        onboarding_status:
          "in_progress",
        onboarding_step: 4,
      })
      .eq("brand_slug", brand.slug)
      .neq(
        "onboarding_status",
        "completed"
      );

    return ok(
      {
        location: data,
        usage: {
          current:
            planState.currentLocations + 1,
          limit: planState.maxLocations,
          available: Math.max(
            0,
            planState.maxLocations -
              planState.currentLocations -
              1
          ),
        },
      },
      201
    );
  } catch (error) {
    return handlePosError(error);
  }
}

function generateCode(name: string) {
  const compact = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 6);

  return compact || "SUC";
}

function getEffectivePlanCode(value: {
  effective: { planCode: string | null };
}) {
  if (!value.effective.planCode) {
    throw new Error("El acceso comercial efectivo no resolvió un plan POS.");
  }

  return value.effective.planCode;
}
