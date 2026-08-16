import {
  assertDatabaseResult,
  fail,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
  optionalText,
  readJsonBody,
  requiredText,
  uuidValue,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateRegisterBody = {
  brandSlug?: unknown;
  locationId?: unknown;
  name?: unknown;
  code?: unknown;
  printerName?: unknown;
};

async function getRegisterPlanState(
  admin: any,
  brandSlug: string,
  effectivePlanCode: string
) {
  const [
    profileResult,
    registerCountResult,
  ] = await Promise.all([
    admin
      .from("pos_business_profiles")
      .select("profile_code,onboarding_status")
      .eq("brand_slug", brandSlug)
      .single(),

    admin
      .from("pos_registers")
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
    registerCountResult.error,
    "No se pudo validar el uso de cajas."
  );

  const { data: limits, error: limitsError } =
    await admin
      .from("pos_plan_limits")
      .select("max_registers")
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
    maxRegisters: Number(
      limits?.max_registers ?? 1
    ),
    currentRegisters:
      registerCountResult.count || 0,
  };
}

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const access =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.cash" });
    const { admin, brand } = access;
    const effectivePlanCode = getEffectivePlanCode(access.effectiveCommercialAccess);

    const url = new URL(request.url);
    const locationId =
      url.searchParams.get("locationId");

    let query = admin
      .from("pos_registers")
      .select(
        `
          *,
          location:pos_locations(
            id,
            name,
            code,
            active
          ),
          open_session:pos_cash_sessions!pos_cash_sessions_register_id_fkey(
            id,
            status,
            opened_at,
            opening_amount
          )
        `
      )
      .eq("brand_slug", brand.slug)
      .order("created_at", {
        ascending: true,
      });

    if (locationId) {
      query = query.eq(
        "location_id",
        locationId
      );
    }

    const [registersResult, planState] =
      await Promise.all([
        query,
        getRegisterPlanState(
          admin,
          brand.slug,
          effectivePlanCode
        ),
      ]);

    assertDatabaseResult(
      registersResult.error,
      "No se pudieron cargar las cajas."
    );

    const registers = (
      registersResult.data || []
    ).map((register: any) => ({
      ...register,
      open_session: Array.isArray(
        register.open_session
      )
        ? register.open_session.find(
            (session: any) =>
              session.status === "open"
          ) || null
        : null,
    }));

    return ok({
      brand,
      registers,
      usage: {
        current:
          planState.currentRegisters,
        limit: planState.maxRegisters,
        available: Math.max(
          0,
          planState.maxRegisters -
            planState.currentRegisters
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
      await readJsonBody<CreateRegisterBody>(
        request
      );

    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );

    const access =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.cash" });
    const { admin, brand, user } = access;
    const effectivePlanCode = getEffectivePlanCode(access.effectiveCommercialAccess);

    const planState =
      await getRegisterPlanState(
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
      planState.currentRegisters >=
      planState.maxRegisters
    ) {
      return fail(
        `Tu plan incluye ${planState.maxRegisters} caja. Para agregar otra necesitas ampliar el plan.`,
        409,
        "POS_REGISTER_LIMIT_REACHED"
      );
    }

    const locationId = uuidValue(
      body.locationId,
      "locationId"
    ) as string;

    const name = requiredText(
      body.name,
      "name",
      100
    );

    const code =
      optionalText(body.code, 40) ||
      generateRegisterCode(name);

    const { data: location, error: locationError } =
      await admin
        .from("pos_locations")
        .select("id")
        .eq("id", locationId)
        .eq("brand_slug", brand.slug)
        .eq("active", true)
        .maybeSingle();

    assertDatabaseResult(
      locationError,
      "No se pudo validar la sucursal."
    );

    if (!location) {
      return fail(
        "La sucursal no existe, está desactivada o no pertenece a la marca.",
        404,
        "POS_LOCATION_NOT_FOUND"
      );
    }

    const { data, error } = await admin
      .from("pos_registers")
      .insert({
        brand_id: brand.id,
        brand_slug: brand.slug,
        location_id: locationId,
        name,
        code: code.toUpperCase(),
        printer_name: optionalText(
          body.printerName,
          120
        ),
        status: "available",
        created_by: user.userId,
      })
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
      .single();

    if (error?.code === "23505") {
      return fail(
        "Ya existe una caja con ese nombre o código en la sucursal.",
        409,
        "POS_REGISTER_DUPLICATED"
      );
    }

    assertDatabaseResult(
      error,
      "No se pudo crear la caja."
    );

    await admin
      .from("pos_business_profiles")
      .update({
        onboarding_status: "completed",
        onboarding_step: 4,
        onboarding_completed_at:
          new Date().toISOString(),
      })
      .eq("brand_slug", brand.slug);

    return ok(
      {
        register: data,
        usage: {
          current:
            planState.currentRegisters + 1,
          limit: planState.maxRegisters,
          available: Math.max(
            0,
            planState.maxRegisters -
              planState.currentRegisters -
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

function generateRegisterCode(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 8)
    .toUpperCase();

  return normalized || "CAJA01";
}

function getEffectivePlanCode(value: {
  effective: { planCode: string | null };
}) {
  if (!value.effective.planCode) {
    throw new Error("El acceso comercial efectivo no resolvió un plan POS.");
  }

  return value.effective.planCode;
}
