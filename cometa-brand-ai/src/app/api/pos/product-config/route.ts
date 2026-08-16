import {
  assertDatabaseResult,
  fail,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
  readJsonBody,
  requiredText,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductConfigBody = {
  brandSlug?: unknown;
  action?: unknown;
};

const PRODUCT_TYPES = [
  {
    code: "physical",
    name: "Producto físico",
    description:
      "Producto que puede manejar variantes y existencia directa.",
    launchStatus: "live",
  },
  {
    code: "service",
    name: "Servicio",
    description:
      "Concepto vendible que no descuenta inventario.",
    launchStatus: "live",
  },
  {
    code: "combo",
    name: "Combo sencillo",
    description:
      "Agrupa productos o variantes y descuenta sus componentes.",
    launchStatus: "upcoming",
  },
  {
    code: "prepared",
    name: "Producto preparado",
    description:
      "Producto fabricado a partir de una receta o ingredientes.",
    launchStatus: "upcoming",
  },
  {
    code: "ingredient",
    name: "Ingrediente",
    description:
      "Insumo utilizado por productos preparados.",
    launchStatus: "upcoming",
  },
  {
    code: "batch_product",
    name: "Producto por lote",
    description:
      "Producto que requiere lote, caducidad y rotación especializada.",
    launchStatus: "upcoming",
  },
] as const;

const INVENTORY_MODES = [
  {
    code: "direct",
    name: "Inventario directo",
    description:
      "Descuenta la cantidad vendida de la variante.",
    launchStatus: "live",
  },
  {
    code: "none",
    name: "Sin inventario",
    description:
      "No genera movimientos de inventario al vender.",
    launchStatus: "live",
  },
  {
    code: "component",
    name: "Por componentes",
    description:
      "Descuenta los productos incluidos en un combo.",
    launchStatus: "upcoming",
  },
  {
    code: "recipe",
    name: "Por receta",
    description:
      "Descuenta ingredientes y cantidades de una receta.",
    launchStatus: "upcoming",
  },
  {
    code: "batch",
    name: "Por lote",
    description:
      "Descuenta existencias del lote correspondiente.",
    launchStatus: "upcoming",
  },
] as const;

async function initializeProductConfiguration(
  brandSlug: string
) {
  const context = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.products" });
  const { admin, brand, user } = context;

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
    "No se pudo inicializar la configuración de productos."
  );

  const { data: profile, error: profileError } =
    await admin
      .from("pos_business_profiles")
      .select(
        `
          profile_code,
          operation_mode,
          onboarding_status,
          profile:pos_profile_catalog(
            code,
            name,
            description,
            launch_status
          )
        `
      )
      .eq("brand_slug", brand.slug)
      .single();

  assertDatabaseResult(
    profileError,
    "No se pudo cargar el perfil del negocio."
  );

  if (
    !profile ||
    profile.profile_code === "unconfigured"
  ) {
    return {
      context,
      profile,
      configurationReady: false,
    };
  }

  const { error: syncError } = await admin.rpc(
    "pos_sync_product_attributes_from_profile",
    {
      p_brand_id: brand.id,
      p_brand_slug: brand.slug,
      p_profile_code: profile.profile_code,
      p_user_id: user.userId,
    }
  );

  assertDatabaseResult(
    syncError,
    "No se pudieron sincronizar los atributos recomendados."
  );

  return {
    context,
    profile,
    configurationReady: true,
  };
}

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);

    const {
      context,
      profile,
      configurationReady,
    } = await initializeProductConfiguration(
      brandSlug
    );

    const { admin, brand } = context;

    if (!configurationReady) {
      return ok({
        brand,
        profile,
        configurationReady: false,
        productTypes: PRODUCT_TYPES,
        inventoryModes: INVENTORY_MODES,
        units: [],
        attributes: [],
        capabilities: {},
      });
    }

    const [
      unitsResult,
      attributesResult,
      capabilitiesResult,
    ] = await Promise.all([
      admin
        .from("pos_units")
        .select(
          `
            code,
            name,
            symbol,
            unit_type,
            decimal_precision,
            sort_order
          `
        )
        .eq("active", true)
        .order("sort_order"),

      admin
        .from(
          "pos_product_attribute_definitions"
        )
        .select(
          `
            id,
            code,
            name,
            input_type,
            options,
            required,
            use_in_variant_name,
            source,
            source_profile_code,
            sort_order,
            active
          `
        )
        .eq("brand_slug", brand.slug)
        .eq("active", true)
        .order("sort_order")
        .order("created_at"),

      admin
        .from("pos_business_capabilities")
        .select("capability_code,enabled")
        .eq("brand_slug", brand.slug),
    ]);

    assertDatabaseResult(
      unitsResult.error,
      "No se pudieron cargar las unidades."
    );

    assertDatabaseResult(
      attributesResult.error,
      "No se pudieron cargar los atributos de productos."
    );

    assertDatabaseResult(
      capabilitiesResult.error,
      "No se pudieron cargar las capacidades del negocio."
    );

    const capabilities = Object.fromEntries(
      (capabilitiesResult.data || []).map(
        (row) => [
          row.capability_code,
          Boolean(row.enabled),
        ]
      )
    );

    return ok({
      brand,
      profile,
      configurationReady: true,
      productTypes: PRODUCT_TYPES,
      inventoryModes: INVENTORY_MODES,
      units: unitsResult.data || [],
      attributes: attributesResult.data || [],
      capabilities,
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body =
      await readJsonBody<ProductConfigBody>(
        request
      );

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

    if (action !== "sync_profile") {
      return fail(
        "Acción de configuración no reconocida.",
        400,
        "POS_PRODUCT_CONFIG_ACTION_INVALID"
      );
    }

    const {
      context,
      profile,
      configurationReady,
    } = await initializeProductConfiguration(
      brandSlug
    );

    if (!configurationReady) {
      return fail(
        "Primero configura el giro del negocio.",
        409,
        "POS_PROFILE_REQUIRED"
      );
    }

    const { admin, brand } = context;

    const { data: attributes, error } =
      await admin
        .from(
          "pos_product_attribute_definitions"
        )
        .select(
          `
            id,
            code,
            name,
            input_type,
            options,
            required,
            use_in_variant_name,
            source,
            source_profile_code,
            sort_order,
            active
          `
        )
        .eq("brand_slug", brand.slug)
        .eq("active", true)
        .order("sort_order")
        .order("created_at");

    assertDatabaseResult(
      error,
      "No se pudieron consultar los atributos sincronizados."
    );

    return ok({
      profile,
      attributes: attributes || [],
    });
  } catch (error) {
    return handlePosError(error);
  }
}
