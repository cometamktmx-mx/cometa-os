import {
  assertDatabaseResult,
  booleanValue,
  fail,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
  readJsonBody,
  requiredText,
  requirePosContext,
  type PosRequestContext,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";
import {
  isPosProfileFamily,
  type PosProfileFamily,
} from "@/lib/pos/capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileBody = {
  brandSlug?: unknown;
  profileCode?: unknown;
  operationMode?: unknown;
  capabilities?: unknown;
};

async function initializePosBrand(context: PosRequestContext) {
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
    "No se pudo inicializar la configuración del negocio."
  );

  return context;
}

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } =
      await initializePosBrand(await requirePosContext(brandSlug));

    const [
      profileResult,
      selectedCapabilitiesResult,
      profileCatalogResult,
      capabilityCatalogResult,
      defaultsResult,
    ] = await Promise.all([
      admin
        .from("pos_business_profiles")
        .select("*")
        .eq("brand_slug", brand.slug)
        .single(),

      admin
        .from("pos_business_capabilities")
        .select(
          "capability_code,enabled,source,created_at,updated_at"
        )
        .eq("brand_slug", brand.slug)
        .order("capability_code"),

      admin
        .from("pos_profile_catalog")
        .select(
          "code,name,description,icon_code,launch_status,sort_order"
        )
        .neq("launch_status", "internal")
        .order("sort_order"),

      admin
        .from("pos_capability_catalog")
        .select(
          "code,name,description,category,launch_status,sort_order"
        )
        .order("sort_order"),

      admin
        .from("pos_profile_capability_defaults")
        .select(
          "profile_code,capability_code,enabled"
        ),
    ]);

    assertDatabaseResult(
      profileResult.error,
      "No se pudo cargar el perfil del negocio."
    );

    assertDatabaseResult(
      selectedCapabilitiesResult.error,
      "No se pudieron cargar las capacidades del negocio."
    );

    assertDatabaseResult(
      profileCatalogResult.error,
      "No se pudo cargar el catálogo de giros."
    );

    assertDatabaseResult(
      capabilityCatalogResult.error,
      "No se pudo cargar el catálogo de funciones."
    );

    assertDatabaseResult(
      defaultsResult.error,
      "No se pudieron cargar las funciones recomendadas."
    );

    const profileCode = profileResult.data.profile_code;
    const profileFamilyResult = await admin.rpc(
      "pos_profile_family",
      { p_profile_code: profileCode }
    );

    assertDatabaseResult(
      profileFamilyResult.error,
      "No se pudo resolver la familia del perfil."
    );

    if (!isPosProfileFamily(profileFamilyResult.data)) {
      throw new Error("Respuesta inválida de pos_profile_family.");
    }

    const profileFamily: PosProfileFamily = profileFamilyResult.data;

    const selectedCapabilities = Object.fromEntries(
      (selectedCapabilitiesResult.data || []).map(
        (row) => [
          row.capability_code,
          Boolean(row.enabled),
        ]
      )
    );

    const liveCapabilityCodes = new Set(
      (capabilityCatalogResult.data || [])
        .filter((capability) => capability.launch_status === "live")
        .map((capability) => capability.code)
    );

    const effectiveCapabilities = (selectedCapabilitiesResult.data || [])
      .filter(
        (capability) =>
          Boolean(capability.enabled) &&
          liveCapabilityCodes.has(capability.capability_code)
      )
      .map((capability) => capability.capability_code);

    const defaultsByProfile = (
      defaultsResult.data || []
    ).reduce<
      Record<string, Record<string, boolean>>
    >((accumulator, row) => {
      if (!accumulator[row.profile_code]) {
        accumulator[row.profile_code] = {};
      }

      accumulator[row.profile_code][
        row.capability_code
      ] = Boolean(row.enabled);

      return accumulator;
    }, {});

    return ok({
      brand,
      profile: profileResult.data,
      selectedCapabilities,
      selectedCapabilityRows:
        selectedCapabilitiesResult.data || [],
      profileCode,
      profileFamily,
      effectiveCapabilities,
      profiles: profileCatalogResult.data || [],
      capabilities:
        capabilityCatalogResult.data || [],
      defaultsByProfile,
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body =
      await readJsonBody<ProfileBody>(request);

    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );

    const profileCode = requiredText(
      body.profileCode,
      "profileCode",
      50
    );

    const operationMode =
      String(body.operationMode ?? "single")
        .trim()
        .toLowerCase() === "mixed"
        ? "mixed"
        : "single";

    const requestedCapabilities =
      body.capabilities &&
      typeof body.capabilities === "object" &&
      !Array.isArray(body.capabilities)
        ? (body.capabilities as Record<
            string,
            unknown
          >)
        : {};

    const operationalContext = await requirePosOperationalAccess({
      brandSlug,
      entitlement: "pos.access",
    });
    const { admin, brand, user } =
      await initializePosBrand(operationalContext);

    const {
      data: profileCatalogItem,
      error: profileCatalogError,
    } = await admin
      .from("pos_profile_catalog")
      .select("code,launch_status")
      .eq("code", profileCode)
      .maybeSingle();

    assertDatabaseResult(
      profileCatalogError,
      "No se pudo validar el giro seleccionado."
    );

    if (!profileCatalogItem) {
      return fail(
        "El giro seleccionado no existe.",
        404,
        "POS_PROFILE_NOT_FOUND"
      );
    }

    if (
      profileCatalogItem.launch_status !== "live"
    ) {
      return fail(
        "Este giro todavía no está disponible para activación.",
        409,
        "POS_PROFILE_NOT_AVAILABLE"
      );
    }

    const {
      data: capabilityCatalog,
      error: capabilityCatalogError,
    } = await admin
      .from("pos_capability_catalog")
      .select("code")
      .order("sort_order");

    assertDatabaseResult(
      capabilityCatalogError,
      "No se pudieron validar las funciones seleccionadas."
    );

    const validCapabilityCodes = new Set(
      (capabilityCatalog || []).map(
        (capability) => capability.code
      )
    );

    const normalizedCapabilities =
      Object.fromEntries(
        Object.entries(requestedCapabilities)
          .filter(([code]) =>
            validCapabilityCodes.has(code)
          )
          .map(([code, value]) => [
            code,
            booleanValue(value, false),
          ])
      );

    const { data, error } = await admin.rpc(
      "pos_configure_business_profile",
      {
        p_brand_id: brand.id,
        p_brand_slug: brand.slug,
        p_profile_code: profileCode,
        p_operation_mode: operationMode,
        p_capabilities:
          normalizedCapabilities,
        p_user_id: user.userId,
      }
    );

    assertDatabaseResult(
      error,
      "No se pudo guardar el perfil operativo."
    );

    return ok({
      configuration: data,
    });
  } catch (error) {
    return handlePosError(error);
  }
}
