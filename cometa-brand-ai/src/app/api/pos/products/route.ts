import {
  assertDatabaseResult,
  booleanValue,
  fail,
  getBrandSlugFromUrl,
  getPagination,
  handlePosError,
  numberValue,
  ok,
  optionalText,
  readJsonBody,
  requiredText,
  uuidValue,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductVariantInput = {
  id?: unknown;
  name?: unknown;
  sku?: unknown;
  barcode?: unknown;
  price?: unknown;
  cost?: unknown;
  initialQuantity?: unknown;
  minimumQuantity?: unknown;
  attributes?: unknown;
  unitCode?: unknown;
  imageUrl?: unknown;
  sortOrder?: unknown;
  configuration?: unknown;
  active?: unknown;
};

type ProductBody = {
  action?: unknown;
  productId?: unknown;
  active?: unknown;
  brandSlug?: unknown;
  locationId?: unknown;
  categoryId?: unknown;
  name?: unknown;
  description?: unknown;
  productType?: unknown;
  inventoryMode?: unknown;
  defaultUnitCode?: unknown;
  hasVariants?: unknown;
  sellable?: unknown;
  purchasable?: unknown;
  taxRate?: unknown;
  imageUrl?: unknown;
  configuration?: unknown;
  variants?: unknown;
};

const LIVE_PRODUCT_TYPES = new Set([
  "physical",
  "service",
]);

const LIVE_INVENTORY_MODES = new Set([
  "direct",
  "none",
]);

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.products" });

    const { page, pageSize, from, to } =
      getPagination(request);

    const url = new URL(request.url);

    const search = String(
      url.searchParams.get("search") || ""
    ).trim();

    const categoryId =
      url.searchParams.get("categoryId");

    const productType =
      url.searchParams.get("productType");

    const inventoryMode =
      url.searchParams.get("inventoryMode");

    const active =
      url.searchParams.get("active");

    let query = admin
      .from("pos_products")
      .select(
        `
          *,
          category:pos_categories(
            id,
            name
          ),
          variants:pos_product_variants(
            *,
            inventory:pos_inventory(
              id,
              location_id,
              quantity,
              reserved_quantity,
              minimum_quantity,
              location:pos_locations(
                id,
                name,
                code
              )
            )
          )
        `,
        {
          count: "exact",
        }
      )
      .eq("brand_slug", brand.slug)
      .order("created_at", {
        ascending: false,
      })
      .range(from, to);

    if (search) {
      query = query.ilike(
        "name",
        `%${search}%`
      );
    }

    if (categoryId) {
      query = query.eq(
        "category_id",
        categoryId
      );
    }

    if (
      productType &&
      LIVE_PRODUCT_TYPES.has(productType)
    ) {
      query = query.eq(
        "product_type",
        productType
      );
    }

    if (
      inventoryMode &&
      LIVE_INVENTORY_MODES.has(inventoryMode)
    ) {
      query = query.eq(
        "inventory_mode",
        inventoryMode
      );
    }

    if (
      active === "true" ||
      active === "false"
    ) {
      query = query.eq(
        "active",
        active === "true"
      );
    }

    const {
      data,
      error,
      count,
    } = await query;

    assertDatabaseResult(
      error,
      "No se pudieron cargar los productos."
    );

    const products = (data || []).map(
      (product: any) => {
        const variants = (
          product.variants || []
        )
          .map((variant: any) => {
            const inventory = (
              variant.inventory || []
            ).map((record: any) => {
              const quantity = Number(
                record.quantity || 0
              );

              const reservedQuantity = Number(
                record.reserved_quantity || 0
              );

              return {
                ...record,
                quantity,
                reserved_quantity:
                  reservedQuantity,
                minimum_quantity: Number(
                  record.minimum_quantity || 0
                ),
                available_quantity:
                  quantity -
                  reservedQuantity,
              };
            });

            const totalQuantity =
              inventory.reduce(
                (
                  total: number,
                  record: any
                ) =>
                  total +
                  Number(record.quantity || 0),
                0
              );

            const totalReserved =
              inventory.reduce(
                (
                  total: number,
                  record: any
                ) =>
                  total +
                  Number(
                    record.reserved_quantity || 0
                  ),
                0
              );

            return {
              ...variant,
              price: Number(
                variant.price || 0
              ),
              cost: Number(
                variant.cost || 0
              ),
              inventory,
              stock: {
                quantity: totalQuantity,
                reserved: totalReserved,
                available:
                  totalQuantity -
                  totalReserved,
              },
            };
          })
          .sort(
            (left: any, right: any) =>
              Number(left.sort_order || 0) -
              Number(right.sort_order || 0)
          );

        const totalStock = variants.reduce(
          (
            total: number,
            variant: any
          ) =>
            total +
            Number(
              variant.stock?.quantity || 0
            ),
          0
        );

        const availableStock =
          variants.reduce(
            (
              total: number,
              variant: any
            ) =>
              total +
              Number(
                variant.stock?.available || 0
              ),
            0
          );

        const minimumPrice =
          variants.length > 0
            ? Math.min(
                ...variants.map(
                  (variant: any) =>
                    Number(
                      variant.price || 0
                    )
                )
              )
            : 0;

        const maximumPrice =
          variants.length > 0
            ? Math.max(
                ...variants.map(
                  (variant: any) =>
                    Number(
                      variant.price || 0
                    )
                )
              )
            : 0;

        return {
          ...product,
          tax_rate: Number(
            product.tax_rate || 0
          ),
          variants,
          summary: {
            variantCount: variants.length,
            totalStock,
            availableStock,
            minimumPrice,
            maximumPrice,
          },
        };
      }
    );

    return ok({
      brand,
      products,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil(
          (count || 0) / pageSize
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
      await readJsonBody<ProductBody>(
        request
      );

    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );

    const { admin, brand, user } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.products" });

    const profileResult = await admin
      .from("pos_business_profiles")
      .select("profile_code,onboarding_status")
      .eq("brand_slug", brand.slug)
      .single();

    assertDatabaseResult(
      profileResult.error,
      "No se pudo validar el perfil del negocio."
    );

    const profile = profileResult.data;

    if (!profile) {
      return fail(
        "No existe la configuración del perfil del negocio.",
        404,
        "POS_PROFILE_NOT_FOUND"
      );
    }

    if (
      profile.profile_code ===
      "unconfigured"
    ) {
      return fail(
        "Primero configura el giro del negocio.",
        409,
        "POS_PROFILE_REQUIRED"
      );
    }

    const productType = (
      optionalText(
        body.productType,
        30
      ) || "physical"
    ).toLowerCase();

    if (
      !LIVE_PRODUCT_TYPES.has(
        productType
      )
    ) {
      return fail(
        "Este tipo de producto todavía no está disponible.",
        409,
        "POS_PRODUCT_TYPE_NOT_AVAILABLE"
      );
    }

    const inventoryMode = (
      optionalText(
        body.inventoryMode,
        30
      ) ||
      (
        productType === "service"
          ? "none"
          : "direct"
      )
    ).toLowerCase();

    if (
      !LIVE_INVENTORY_MODES.has(
        inventoryMode
      )
    ) {
      return fail(
        "Este modo de inventario todavía no está disponible.",
        409,
        "POS_INVENTORY_MODE_NOT_AVAILABLE"
      );
    }

    const normalizedInventoryMode =
      productType === "service"
        ? "none"
        : inventoryMode;

    const locationId = uuidValue(
      body.locationId,
      "locationId",
      false
    );

    if (
      normalizedInventoryMode ===
        "direct" &&
      !locationId
    ) {
      return fail(
        "Selecciona una sucursal para registrar el inventario.",
        400,
        "POS_PRODUCT_LOCATION_REQUIRED"
      );
    }

    const categoryId = uuidValue(
      body.categoryId,
      "categoryId",
      false
    );

    const defaultUnitCode = (
      optionalText(
        body.defaultUnitCode,
        40
      ) ||
      (
        productType === "service"
          ? "service"
          : "piece"
      )
    ).toLowerCase();

    const hasVariants =
      productType === "service"
        ? false
        : booleanValue(
            body.hasVariants,
            false
          );

    const {
      data: attributeDefinitions,
      error: attributeError,
    } = await admin
      .from(
        "pos_product_attribute_definitions"
      )
      .select(
        "code,name,required,active"
      )
      .eq("brand_slug", brand.slug)
      .eq("active", true)
      .order("sort_order");

    assertDatabaseResult(
      attributeError,
      "No se pudieron cargar los atributos del producto."
    );

    const validAttributeCodes = new Set(
      (attributeDefinitions || []).map(
        (attribute) => attribute.code
      )
    );

    const variantsRaw =
      Array.isArray(body.variants)
        ? (
            body.variants as
              ProductVariantInput[]
          )
        : [];

    const normalizedVariants =
      variantsRaw.length > 0
        ? variantsRaw.map(
            (variant, index) => {
              const attributesInput =
                variant.attributes &&
                typeof variant.attributes ===
                  "object" &&
                !Array.isArray(
                  variant.attributes
                )
                  ? (
                      variant.attributes as
                        Record<
                          string,
                          unknown
                        >
                    )
                  : {};

              const attributes =
                Object.fromEntries(
                  Object.entries(
                    attributesInput
                  )
                    .filter(([code]) =>
                      validAttributeCodes.has(
                        code
                      )
                    )
                    .map(
                      ([code, value]) => [
                        code,
                        String(
                          value ?? ""
                        ).trim(),
                      ]
                    )
                    .filter(
                      ([, value]) =>
                        Boolean(value)
                    )
                );

              const configuration =
                variant.configuration &&
                typeof
                  variant.configuration ===
                  "object" &&
                !Array.isArray(
                  variant.configuration
                )
                  ? variant.configuration
                  : {};

              return {
                name:
                  optionalText(
                    variant.name,
                    140
                  ) ||
                  (
                    hasVariants
                      ? `Variante ${index + 1}`
                      : "Única"
                  ),

                sku: optionalText(
                  variant.sku,
                  80
                ),

                barcode: optionalText(
                  variant.barcode,
                  120
                ),

                price: numberValue(
                  variant.price,
                  `variants[${index}].price`,
                  {
                    min: 0,
                    defaultValue: 0,
                  }
                ),

                cost: numberValue(
                  variant.cost,
                  `variants[${index}].cost`,
                  {
                    min: 0,
                    defaultValue: 0,
                  }
                ),

                initial_quantity:
                  normalizedInventoryMode ===
                  "direct"
                    ? numberValue(
                        variant.initialQuantity,
                        `variants[${index}].initialQuantity`,
                        {
                          min: 0,
                          defaultValue: 0,
                        }
                      )
                    : 0,

                minimum_quantity:
                  normalizedInventoryMode ===
                  "direct"
                    ? numberValue(
                        variant.minimumQuantity,
                        `variants[${index}].minimumQuantity`,
                        {
                          min: 0,
                          defaultValue: 0,
                        }
                      )
                    : 0,

                attributes,

                unit_code: (
                  optionalText(
                    variant.unitCode,
                    40
                  ) ||
                  defaultUnitCode
                ).toLowerCase(),

                image_url:
                  optionalText(
                    variant.imageUrl,
                    1000
                  ),

                sort_order: Math.floor(
                  numberValue(
                    variant.sortOrder,
                    `variants[${index}].sortOrder`,
                    {
                      min: 0,
                      defaultValue: index,
                    }
                  )
                ),

                configuration,
              };
            }
          )
        : [
            {
              name: "Única",
              sku: null,
              barcode: null,
              price: 0,
              cost: 0,
              initial_quantity: 0,
              minimum_quantity: 0,
              attributes: {},
              unit_code:
                defaultUnitCode,
              image_url: null,
              sort_order: 0,
              configuration: {},
            },
          ];

    if (
      !hasVariants &&
      normalizedVariants.length > 1
    ) {
      return fail(
        "Un producto sin variantes solo puede contener una presentación.",
        400,
        "POS_PRODUCT_VARIANTS_INVALID"
      );
    }

    const productConfiguration =
      body.configuration &&
      typeof body.configuration ===
        "object" &&
      !Array.isArray(
        body.configuration
      )
        ? body.configuration
        : {};

    const { error: syncError } =
      await admin.rpc(
        "pos_sync_product_attributes_from_profile",
        {
          p_brand_id: brand.id,
          p_brand_slug: brand.slug,
          p_profile_code:
            profile.profile_code,
          p_user_id: user.userId,
        }
      );

    assertDatabaseResult(
      syncError,
      "No se pudieron sincronizar los atributos del perfil."
    );

    const {
      data,
      error,
    } = await admin.rpc(
      "pos_create_product_v2",
      {
        p_brand_id: brand.id,
        p_brand_slug: brand.slug,
        p_location_id: locationId,
        p_category_id: categoryId,
        p_name: requiredText(
          body.name,
          "name",
          180
        ),
        p_description:
          optionalText(
            body.description,
            1500
          ),
        p_product_type:
          productType,
        p_inventory_mode:
          normalizedInventoryMode,
        p_default_unit_code:
          defaultUnitCode,
        p_has_variants:
          hasVariants,
        p_sellable:
          booleanValue(
            body.sellable,
            true
          ),
        p_purchasable:
          booleanValue(
            body.purchasable,
            true
          ),
        p_tax_rate:
          numberValue(
            body.taxRate,
            "taxRate",
            {
              min: 0,
              max: 100,
              defaultValue: 0,
            }
          ),
        p_image_url:
          optionalText(
            body.imageUrl,
            1000
          ),
        p_configuration:
          productConfiguration,
        p_variants:
          normalizedVariants,
        p_user_id:
          user.userId,
      }
    );

    if (error) {
      const message =
        error.message || "";

      if (
        message.includes(
          "Ya existe una variante con ese SKU"
        )
      ) {
        return fail(
          "Ya existe una variante con ese SKU.",
          409,
          "POS_PRODUCT_SKU_DUPLICATED"
        );
      }

      if (
        message.includes(
          "Ya existe una variante con ese código de barras"
        )
      ) {
        return fail(
          "Ya existe una variante con ese código de barras.",
          409,
          "POS_PRODUCT_BARCODE_DUPLICATED"
        );
      }

      if (
        message.includes(
          "requiere el atributo"
        ) ||
        message.includes(
          "Selecciona una sucursal"
        ) ||
        message.includes(
          "no está disponible"
        ) ||
        message.includes(
          "no existe"
        )
      ) {
        return fail(
          message,
          400,
          "POS_PRODUCT_VALIDATION_ERROR"
        );
      }
    }

    assertDatabaseResult(
      error,
      "No se pudo crear el producto."
    );

    return ok(
      {
        product: data,
      },
      201
    );
  } catch (error) {
    return handlePosError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await readJsonBody<ProductBody>(request);
    const brandSlug = requiredText(body.brandSlug, "brandSlug", 120);
    const action = requiredText(body.action, "action", 40);
    const productId = uuidValue(body.productId, "productId");
    const { admin, brand, user } = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.products" });

    if (!productId) {
      return fail(
        "Se requiere productId.",
        400,
        "POS_PRODUCT_ID_REQUIRED"
      );
    }

    const productResult = await admin
      .from("pos_products")
      .select("id,configuration")
      .eq("id", productId)
      .eq("brand_slug", brand.slug)
      .maybeSingle();

    assertDatabaseResult(
      productResult.error,
      "No se pudo validar el producto."
    );

    if (!productResult.data) {
      return fail(
        "El producto no existe o pertenece a otra marca.",
        404,
        "POS_PRODUCT_NOT_FOUND"
      );
    }

    if (action === "set_active") {
      if (typeof body.active !== "boolean") {
        return fail(
          "active debe ser boolean.",
          400,
          "POS_PRODUCT_ACTIVE_INVALID"
        );
      }

      const { data, error } = await admin.rpc(
        "pos_set_product_active",
        {
          p_brand_id: brand.id,
          p_brand_slug: brand.slug,
          p_product_id: productId,
          p_active: body.active,
          p_user_id: user.userId,
        }
      );

      assertDatabaseResult(
        error,
        "No se pudo cambiar el estado del producto."
      );

      return ok({ product: data });
    }

    if (action !== "update_product") {
      return fail(
        "Acción de producto no permitida.",
        400,
        "POS_PRODUCT_ACTION_INVALID"
      );
    }

    const productType = (
      optionalText(body.productType, 30) || "physical"
    ).toLowerCase();

    if (!LIVE_PRODUCT_TYPES.has(productType)) {
      return fail(
        "Este tipo de producto todavía no está disponible.",
        409,
        "POS_PRODUCT_TYPE_NOT_AVAILABLE"
      );
    }

    const inventoryMode = (
      optionalText(body.inventoryMode, 30) ||
      (productType === "service" ? "none" : "direct")
    ).toLowerCase();
    const normalizedInventoryMode =
      productType === "service" ? "none" : inventoryMode;

    if (!LIVE_INVENTORY_MODES.has(normalizedInventoryMode)) {
      return fail(
        "Este modo de inventario todavía no está disponible.",
        409,
        "POS_INVENTORY_MODE_NOT_AVAILABLE"
      );
    }

    const categoryId = uuidValue(body.categoryId, "categoryId", false);
    const defaultUnitCode = (
      optionalText(body.defaultUnitCode, 40) ||
      (productType === "service" ? "service" : "piece")
    ).toLowerCase();
    const hasVariants =
      productType === "service"
        ? false
        : booleanValue(body.hasVariants, false);
    const variantsRaw = Array.isArray(body.variants)
      ? (body.variants as ProductVariantInput[])
      : [];

    if (variantsRaw.length === 0) {
      return fail(
        "El producto debe contener al menos una variante.",
        400,
        "POS_PRODUCT_VARIANTS_INVALID"
      );
    }

    const activeVariantCount = variantsRaw.filter(
      (variant) => variant.active !== false
    ).length;

    if (activeVariantCount === 0) {
      return fail(
        "El producto debe conservar al menos una variante activa.",
        400,
        "POS_PRODUCT_VARIANTS_INVALID"
      );
    }

    if (!hasVariants && activeVariantCount > 1) {
      return fail(
        "Un producto sin variantes solo puede contener una presentación.",
        400,
        "POS_PRODUCT_VARIANTS_INVALID"
      );
    }

    const { data: attributeDefinitions, error: attributeError } = await admin
      .from("pos_product_attribute_definitions")
      .select("code")
      .eq("brand_slug", brand.slug)
      .eq("active", true);

    assertDatabaseResult(
      attributeError,
      "No se pudieron validar los atributos del producto."
    );

    const validAttributeCodes = new Set(
      (attributeDefinitions || []).map((attribute) => attribute.code)
    );
    const normalizedVariants = variantsRaw.map((variant, index) => {
      const variantId = uuidValue(variant.id, `variants[${index}].id`, false);
      const attributesInput =
        variant.attributes &&
        typeof variant.attributes === "object" &&
        !Array.isArray(variant.attributes)
          ? (variant.attributes as Record<string, unknown>)
          : {};
      const configuration =
        variant.configuration &&
        typeof variant.configuration === "object" &&
        !Array.isArray(variant.configuration)
          ? variant.configuration
          : {};

      return {
        id: variantId,
        name:
          optionalText(variant.name, 140) ||
          (hasVariants ? `Variante ${index + 1}` : "Única"),
        sku: optionalText(variant.sku, 80),
        barcode: optionalText(variant.barcode, 120),
        price: numberValue(variant.price, `variants[${index}].price`, {
          min: 0,
          defaultValue: 0,
        }),
        cost: numberValue(variant.cost, `variants[${index}].cost`, {
          min: 0,
          defaultValue: 0,
        }),
        attributes: Object.fromEntries(
          Object.entries(attributesInput)
            .filter(([code]) => validAttributeCodes.has(code))
            .map(([code, value]) => [code, String(value ?? "").trim()])
            .filter(([, value]) => Boolean(value))
        ),
        unit_code: (
          optionalText(variant.unitCode, 40) || defaultUnitCode
        ).toLowerCase(),
        image_url: optionalText(variant.imageUrl, 1000),
        active:
          typeof variant.active === "boolean" ? variant.active : true,
        sort_order: Math.floor(
          numberValue(variant.sortOrder, `variants[${index}].sortOrder`, {
            min: 0,
            defaultValue: index,
          })
        ),
        configuration,
      };
    });

    const configuration =
      body.configuration &&
      typeof body.configuration === "object" &&
      !Array.isArray(body.configuration)
        ? body.configuration
        : productResult.data.configuration || {};

    const { data, error } = await admin.rpc("pos_update_product_v2", {
      p_brand_id: brand.id,
      p_brand_slug: brand.slug,
      p_product_id: productId,
      p_category_id: categoryId,
      p_name: requiredText(body.name, "name", 180),
      p_description: optionalText(body.description, 1500),
      p_product_type: productType,
      p_inventory_mode: normalizedInventoryMode,
      p_default_unit_code: defaultUnitCode,
      p_has_variants: hasVariants,
      p_sellable: booleanValue(body.sellable, true),
      p_purchasable: booleanValue(body.purchasable, true),
      p_tax_rate: numberValue(body.taxRate, "taxRate", {
        min: 0,
        max: 100,
        defaultValue: 0,
      }),
      p_image_url: optionalText(body.imageUrl, 1000),
      p_configuration: configuration,
      p_variants: normalizedVariants,
      p_user_id: user.userId,
    });

    if (error) {
      const message = error.message || "";
      console.error("pos_update_product_v2 failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        productId,
        brandSlug: brand.slug,
      });

      if (message.includes("Ya existe una variante con ese SKU")) {
        return fail(
          "Ya existe una variante con ese SKU.",
          409,
          "POS_PRODUCT_SKU_DUPLICATED"
        );
      }

      if (message.includes("Ya existe una variante con ese código de barras")) {
        return fail(
          "Ya existe una variante con ese código de barras.",
          409,
          "POS_PRODUCT_BARCODE_DUPLICATED"
        );
      }

      if (
        message.includes("El producto no existe") ||
        message.includes("Una variante no existe")
      ) {
        return fail(message, 404, "POS_PRODUCT_NOT_FOUND");
      }

      if (message.includes("modo de inventario")) {
        return fail(message, 409, "POS_PRODUCT_INVENTORY_MODE_CONFLICT");
      }

      if (
        message.includes("debe contener") ||
        message.includes("debe conservar") ||
        message.includes("necesita un nombre") ||
        message.includes("no es válido") ||
        message.includes("no puede ser negativo") ||
        message.includes("payload contiene variantes duplicadas") ||
        message.toLowerCase().includes("categoría")
      ) {
        return fail(message, 400, "POS_PRODUCT_VALIDATION_ERROR");
      }
    }

    assertDatabaseResult(error, "No se pudo actualizar el producto.");

    return ok({ product: data });
  } catch (error) {
    return handlePosError(error);
  }
}
