import {
  assertDatabaseResult,
  booleanValue,
  fail,
  getBrandSlugFromUrl,
  handlePosError,
  numberValue,
  ok,
  optionalText,
  PosApiError,
  readJsonBody,
  requiredText,
  uuidValue,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QuantityMode =
  | "direct"
  | "fixed_package"
  | "variable_quantity";

type ReceiptItemInput = {
  variantId?: unknown;
  purchasePresentationId?: unknown;
  scannedCode?: unknown;
  quantityMode?: unknown;
  inputQuantity?: unknown;
  inputUnitCode?: unknown;
  conversionFactor?: unknown;
  totalCost?: unknown;
};

type InventoryReceivingBody = {
  brandSlug?: unknown;
  action?: unknown;
  idempotencyKey?: unknown;

  locationId?: unknown;
  supplierName?: unknown;
  supplierReference?: unknown;
  notes?: unknown;
  items?: unknown;

  variantId?: unknown;
  name?: unknown;
  barcode?: unknown;
  supplierSku?: unknown;
  quantityMode?: unknown;
  inputUnitCode?: unknown;
  baseUnitCode?: unknown;
  conversionFactor?: unknown;
  defaultInputQuantity?: unknown;
  promptLabel?: unknown;
  allowFraction?: unknown;
};

type UnitRow = {
  code: string;
  name: string;
  symbol: string;
  unit_type: string;
  decimal_precision: number;
};

type ConversionRow = {
  from_unit_code: string;
  to_unit_code: string;
  multiplier: number | string;
};

type PurchasePresentationRow = {
  id: string;
  brand_id: string;
  brand_slug: string;
  variant_id: string;
  name: string;
  barcode: string | null;
  supplier_sku: string | null;
  quantity_mode: QuantityMode;
  input_unit_code: string;
  base_unit_code: string;
  conversion_factor: number | string;
  default_input_quantity: number | string;
  prompt_label: string | null;
  allow_fraction: boolean;
  active: boolean;
};

const VALID_QUANTITY_MODES = new Set<QuantityMode>([
  "direct",
  "fixed_package",
  "variable_quantity",
]);

const VARIANT_SELECT = `
  id,
  brand_id,
  brand_slug,
  product_id,
  name,
  sku,
  barcode,
  price,
  cost,
  attributes,
  unit_code,
  image_url,
  active,
  product:pos_products(
    id,
    name,
    description,
    product_type,
    inventory_mode,
    track_inventory,
    image_url,
    active,
    category:pos_categories(
      id,
      name
    )
  ),
  inventory:pos_inventory(
    id,
    location_id,
    quantity,
    reserved_quantity,
    minimum_quantity,
    location:pos_locations(
      id,
      name,
      code,
      active
    )
  )
`;

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.inventory" });

    const url = new URL(request.url);
    const mode = String(
      url.searchParams.get("mode") || "scan"
    )
      .trim()
      .toLowerCase();

    if (mode === "history") {
      const { data, error } = await admin
        .from("pos_inventory_receipts")
        .select(
          `
            *,
            location:pos_locations(
              id,
              name,
              code
            ),
            items:pos_inventory_receipt_items(
              id,
              variant_id,
              scanned_code,
              quantity_mode,
              input_quantity,
              input_unit_code,
              conversion_factor,
              base_quantity,
              base_unit_code,
              total_cost,
              base_unit_cost,
              quantity_before,
              quantity_after,
              variant:pos_product_variants(
                id,
                name,
                sku,
                barcode,
                product:pos_products(
                  id,
                  name,
                  image_url
                )
              )
            )
          `
        )
        .eq("brand_slug", brand.slug)
        .order("received_at", {
          ascending: false,
        })
        .limit(25);

      assertDatabaseResult(
        error,
        "No se pudo cargar el historial de recepciones."
      );

      return ok({
        brand,
        receipts: data || [],
      });
    }

    if (mode !== "scan") {
      return fail(
        "Modo de consulta no reconocido.",
        400,
        "POS_RECEIVING_MODE_INVALID"
      );
    }

    const code = requiredText(
      url.searchParams.get("code"),
      "code",
      180
    );

    const locationId = uuidValue(
      url.searchParams.get("locationId"),
      "locationId",
      false
    );

    if (locationId) {
      const { data: location, error } = await admin
        .from("pos_locations")
        .select("id")
        .eq("id", locationId)
        .eq("brand_slug", brand.slug)
        .eq("active", true)
        .maybeSingle();

      assertDatabaseResult(
        error,
        "No se pudo validar la sucursal."
      );

      if (!location) {
        return fail(
          "La sucursal no existe, está desactivada o pertenece a otra marca.",
          404,
          "POS_RECEIVING_LOCATION_NOT_FOUND"
        );
      }
    }

    const normalizedCode = code.trim();

    const match = await findReceivingMatch(
      admin,
      brand.slug,
      normalizedCode
    );

    if (!match) {
      return ok({
        found: false,
        code: normalizedCode,
        canCreateProduct: true,
        suggestedField:
          looksLikeBarcode(normalizedCode)
            ? "barcode"
            : "sku",
        prefill: {
          sku: looksLikeBarcode(normalizedCode)
            ? null
            : normalizedCode.toUpperCase(),
          barcode: looksLikeBarcode(normalizedCode)
            ? normalizedCode
            : null,
        },
      });
    }

    const variant = await loadVariant(
      admin,
      brand.slug,
      match.variantId
    );

    if (
      !variant.product ||
      !variant.product.active ||
      !variant.active
    ) {
      return fail(
        "El código pertenece a un producto desactivado.",
        409,
        "POS_RECEIVING_PRODUCT_INACTIVE"
      );
    }

    const canReceive =
      variant.product.inventory_mode === "direct" &&
      Boolean(variant.product.track_inventory);

    if (!canReceive) {
      return ok({
        found: true,
        code: normalizedCode,
        source: match.source,
        matchType: match.matchType,
        canReceive: false,
        reason:
          "El producto existe, pero no utiliza inventario directo.",
        variant: normalizeVariant(
          variant,
          locationId
        ),
        matchedPresentation:
          match.presentation || null,
        receivingOptions: [],
        defaultOptionKey: null,
      });
    }

    const [
      unitsResult,
      conversionsResult,
      presentationsResult,
    ] = await Promise.all([
      admin
        .from("pos_units")
        .select(
          "code,name,symbol,unit_type,decimal_precision"
        )
        .eq("active", true)
        .order("sort_order"),

      admin
        .from("pos_unit_conversions")
        .select(
          "from_unit_code,to_unit_code,multiplier"
        )
        .eq("to_unit_code", variant.unit_code)
        .eq("active", true),

      admin
        .from(
          "pos_variant_purchase_presentations"
        )
        .select("*")
        .eq("brand_slug", brand.slug)
        .eq("variant_id", variant.id)
        .eq("active", true)
        .order("created_at", {
          ascending: true,
        }),
    ]);

    assertDatabaseResult(
      unitsResult.error,
      "No se pudieron cargar las unidades."
    );

    assertDatabaseResult(
      conversionsResult.error,
      "No se pudieron cargar las conversiones."
    );

    assertDatabaseResult(
      presentationsResult.error,
      "No se pudieron cargar las presentaciones de compra."
    );

    const units = (unitsResult.data || []) as UnitRow[];
    const conversions = (
      conversionsResult.data || []
    ) as ConversionRow[];
    const presentations = (
      presentationsResult.data || []
    ) as PurchasePresentationRow[];

    const receivingOptions = buildReceivingOptions({
      variant,
      units,
      conversions,
      presentations,
      matchedPresentation:
        match.presentation || null,
    });

    const defaultOption =
      match.presentation
        ? receivingOptions.find(
            (option) =>
              option.presentationId ===
              match.presentation?.id
          )
        : receivingOptions[0];

    return ok({
      found: true,
      code: normalizedCode,
      source: match.source,
      matchType: match.matchType,
      canReceive: true,
      variant: normalizeVariant(
        variant,
        locationId
      ),
      matchedPresentation:
        match.presentation || null,
      receivingOptions,
      defaultOptionKey:
        defaultOption?.key || null,
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body =
      await readJsonBody<InventoryReceivingBody>(
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
      50
    )
      .trim()
      .toLowerCase();

    const { admin, brand, user } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.inventory" });

    if (action === "save_presentation") {
      const variantId = uuidValue(
        body.variantId,
        "variantId"
      ) as string;

      const variant = await loadVariant(
        admin,
        brand.slug,
        variantId
      );

      if (
        !variant.product ||
        variant.product.inventory_mode !==
          "direct" ||
        !variant.product.track_inventory
      ) {
        return fail(
          "Solo puedes crear presentaciones para productos con inventario directo.",
          409,
          "POS_RECEIVING_PRESENTATION_NOT_ALLOWED"
        );
      }

      const quantityMode =
        normalizeQuantityMode(
          body.quantityMode
        );

      const inputUnitCode = requiredText(
        body.inputUnitCode,
        "inputUnitCode",
        40
      ).toLowerCase();

      const baseUnitCode = (
        optionalText(
          body.baseUnitCode,
          40
        ) || variant.unit_code
      ).toLowerCase();

      if (
        baseUnitCode !==
        String(variant.unit_code).toLowerCase()
      ) {
        return fail(
          "La unidad base debe coincidir con la unidad de inventario de la variante.",
          400,
          "POS_RECEIVING_BASE_UNIT_MISMATCH"
        );
      }

      const [
        inputUnitResult,
        baseUnitResult,
      ] = await Promise.all([
        admin
          .from("pos_units")
          .select("code")
          .eq("code", inputUnitCode)
          .eq("active", true)
          .maybeSingle(),

        admin
          .from("pos_units")
          .select("code")
          .eq("code", baseUnitCode)
          .eq("active", true)
          .maybeSingle(),
      ]);

      assertDatabaseResult(
        inputUnitResult.error,
        "No se pudo validar la unidad de entrada."
      );

      assertDatabaseResult(
        baseUnitResult.error,
        "No se pudo validar la unidad base."
      );

      if (!inputUnitResult.data) {
        return fail(
          "La unidad de entrada no existe o está desactivada.",
          400,
          "POS_RECEIVING_INPUT_UNIT_INVALID"
        );
      }

      if (!baseUnitResult.data) {
        return fail(
          "La unidad base no existe o está desactivada.",
          400,
          "POS_RECEIVING_BASE_UNIT_INVALID"
        );
      }

      const conversionFactor =
        await resolveConversionFactor({
          admin,
          inputUnitCode,
          baseUnitCode,
          suppliedFactor:
            body.conversionFactor,
        });

      const barcode = optionalText(
        body.barcode,
        180
      );

      const supplierSku = optionalText(
        body.supplierSku,
        120
      );

      if (!barcode && !supplierSku) {
        return fail(
          "Agrega un código de barras o SKU del proveedor para reconocer la presentación.",
          400,
          "POS_RECEIVING_PRESENTATION_CODE_REQUIRED"
        );
      }

      const { data, error } = await admin
        .from(
          "pos_variant_purchase_presentations"
        )
        .insert({
          brand_id: brand.id,
          brand_slug: brand.slug,
          variant_id: variant.id,
          name: requiredText(
            body.name,
            "name",
            160
          ),
          barcode,
          supplier_sku: supplierSku,
          quantity_mode: quantityMode,
          input_unit_code: inputUnitCode,
          base_unit_code: baseUnitCode,
          conversion_factor:
            conversionFactor,
          default_input_quantity:
            numberValue(
              body.defaultInputQuantity,
              "defaultInputQuantity",
              {
                min: 0.001,
                defaultValue: 1,
              }
            ),
          prompt_label: optionalText(
            body.promptLabel,
            220
          ),
          allow_fraction:
            booleanValue(
              body.allowFraction,
              quantityMode ===
                "variable_quantity"
            ),
          active: true,
          created_by: user.userId,
        })
        .select("*")
        .single();

      if (error?.code === "23505") {
        return fail(
          "Ese código ya está asignado a otra presentación de compra.",
          409,
          "POS_RECEIVING_PRESENTATION_DUPLICATED"
        );
      }

      assertDatabaseResult(
        error,
        "No se pudo guardar la presentación de compra."
      );

      return ok(
        {
          presentation: data,
        },
        201
      );
    }

    if (action === "complete_receipt") {
      const rawIdempotencyKey = String(
        body.idempotencyKey ?? ""
      ).trim();

      if (!rawIdempotencyKey) {
        return fail(
          "La recepción requiere una clave de operación.",
          400,
          "POS_INVENTORY_IDEMPOTENCY_KEY_REQUIRED"
        );
      }

      let idempotencyKey: string;

      try {
        idempotencyKey = uuidValue(
          rawIdempotencyKey,
          "idempotencyKey"
        ) as string;
      } catch {
        return fail(
          "La clave de operación de la recepción no es válida.",
          400,
          "POS_INVENTORY_IDEMPOTENCY_KEY_INVALID"
        );
      }

      const profileResult = await admin
        .from("pos_business_profiles")
        .select("profile_code")
        .eq("brand_slug", brand.slug)
        .single();

      assertDatabaseResult(
        profileResult.error,
        "No se pudo validar el perfil del negocio."
      );

      const profile =
        profileResult.data;

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

      const locationId = uuidValue(
        body.locationId,
        "locationId"
      ) as string;

      const { data: location, error } = await admin
        .from("pos_locations")
        .select("id")
        .eq("id", locationId)
        .eq("brand_slug", brand.slug)
        .eq("active", true)
        .maybeSingle();

      assertDatabaseResult(
        error,
        "No se pudo validar la sucursal."
      );

      if (!location) {
        return fail(
          "La sucursal no existe, está desactivada o pertenece a otra marca.",
          404,
          "POS_RECEIVING_LOCATION_NOT_FOUND"
        );
      }

      const rawItems = Array.isArray(body.items)
        ? (body.items as ReceiptItemInput[])
        : [];

      if (rawItems.length === 0) {
        return fail(
          "Agrega al menos una partida a la recepción.",
          400,
          "POS_RECEIVING_ITEMS_REQUIRED"
        );
      }

      if (rawItems.length > 500) {
        return fail(
          "Una recepción no puede contener más de 500 partidas.",
          400,
          "POS_RECEIVING_ITEMS_LIMIT"
        );
      }

      const items = rawItems.map(
        (item, index) => {
          const presentationId = uuidValue(
            item.purchasePresentationId,
            `items[${index}].purchasePresentationId`,
            false
          );

          const quantityMode =
            presentationId
              ? optionalText(
                  item.quantityMode,
                  40
                ) || "direct"
              : normalizeQuantityMode(
                  item.quantityMode
                );

          return {
            variant_id: uuidValue(
              item.variantId,
              `items[${index}].variantId`
            ),
            purchase_presentation_id:
              presentationId,
            scanned_code: optionalText(
              item.scannedCode,
              180
            ),
            quantity_mode: quantityMode,
            input_quantity: numberValue(
              item.inputQuantity,
              `items[${index}].inputQuantity`,
              {
                min: 0.001,
              }
            ),
            input_unit_code:
              presentationId
                ? optionalText(
                    item.inputUnitCode,
                    40
                  )
                : requiredText(
                    item.inputUnitCode,
                    `items[${index}].inputUnitCode`,
                    40
                  ).toLowerCase(),
            conversion_factor:
              presentationId
                ? item.conversionFactor ?? null
                : numberValue(
                    item.conversionFactor,
                    `items[${index}].conversionFactor`,
                    {
                      min: 0.000001,
                      defaultValue: 1,
                    }
                  ),
            total_cost: numberValue(
              item.totalCost,
              `items[${index}].totalCost`,
              {
                min: 0,
                defaultValue: 0,
              }
            ),
          };
        }
      );

      const { data, error: receiptError } =
        await admin.rpc(
          "pos_complete_inventory_receipt_v2",
          {
            p_brand_id: brand.id,
            p_brand_slug: brand.slug,
            p_location_id: locationId,
            p_supplier_name:
              optionalText(
                body.supplierName,
                180
              ),
            p_supplier_reference:
              optionalText(
                body.supplierReference,
                180
              ),
            p_notes: optionalText(
              body.notes,
              1500
            ),
            p_items: items,
            p_user_id: user.userId,
            p_idempotency_key:
              idempotencyKey,
          }
        );

      if (receiptError) {
        const message =
          receiptError.message || "";

        if (
          message.includes(
            "POS_INVENTORY_IDEMPOTENCY_CONFLICT"
          )
        ) {
          return fail(
            "La clave de operación ya fue utilizada con una recepción diferente.",
            409,
            "POS_INVENTORY_IDEMPOTENCY_CONFLICT"
          );
        }

        const validationFragments = [
          "no existe",
          "no corresponde",
          "no utiliza inventario directo",
          "no es válida",
          "no es válido",
          "debe ser mayor",
          "no coincide",
          "No existe conversión",
          "Agrega al menos",
        ];

        if (
          validationFragments.some(
            (fragment) =>
              message.includes(fragment)
          )
        ) {
          return fail(
            message,
            400,
            "POS_RECEIVING_VALIDATION_ERROR"
          );
        }
      }

      assertDatabaseResult(
        receiptError,
        "No se pudo completar la recepción de inventario."
      );

      return ok(
        {
          receipt: data,
        },
        201
      );
    }

    return fail(
      "Acción de recepción no reconocida.",
      400,
      "POS_RECEIVING_ACTION_INVALID"
    );
  } catch (error) {
    return handlePosError(error);
  }
}

async function findReceivingMatch(
  admin: any,
  brandSlug: string,
  code: string
): Promise<
  | {
      source:
        | "purchase_presentation"
        | "variant";
      matchType:
        | "presentation_barcode"
        | "presentation_supplier_sku"
        | "variant_barcode"
        | "variant_sku";
      variantId: string;
      presentation:
        | PurchasePresentationRow
        | null;
    }
  | null
> {
  const presentationBarcodeResult =
    await admin
      .from(
        "pos_variant_purchase_presentations"
      )
      .select("*")
      .eq("brand_slug", brandSlug)
      .eq("barcode", code)
      .eq("active", true)
      .maybeSingle();

  assertDatabaseResult(
    presentationBarcodeResult.error,
    "No se pudo buscar el código de la presentación."
  );

  if (presentationBarcodeResult.data) {
    return {
      source: "purchase_presentation",
      matchType:
        "presentation_barcode",
      variantId:
        presentationBarcodeResult.data
          .variant_id,
      presentation:
        presentationBarcodeResult.data,
    };
  }

  const presentationSkuResult =
    await admin
      .from(
        "pos_variant_purchase_presentations"
      )
      .select("*")
      .eq("brand_slug", brandSlug)
      .ilike("supplier_sku", code)
      .eq("active", true)
      .maybeSingle();

  assertDatabaseResult(
    presentationSkuResult.error,
    "No se pudo buscar el SKU del proveedor."
  );

  if (presentationSkuResult.data) {
    return {
      source: "purchase_presentation",
      matchType:
        "presentation_supplier_sku",
      variantId:
        presentationSkuResult.data
          .variant_id,
      presentation:
        presentationSkuResult.data,
    };
  }

  const variantBarcodeResult = await admin
    .from("pos_product_variants")
    .select("id")
    .eq("brand_slug", brandSlug)
    .eq("barcode", code)
    .eq("active", true)
    .maybeSingle();

  assertDatabaseResult(
    variantBarcodeResult.error,
    "No se pudo buscar el código de barras."
  );

  if (variantBarcodeResult.data) {
    return {
      source: "variant",
      matchType: "variant_barcode",
      variantId:
        variantBarcodeResult.data.id,
      presentation: null,
    };
  }

  const variantSkuResult = await admin
    .from("pos_product_variants")
    .select("id")
    .eq("brand_slug", brandSlug)
    .ilike("sku", code)
    .eq("active", true)
    .maybeSingle();

  assertDatabaseResult(
    variantSkuResult.error,
    "No se pudo buscar el SKU."
  );

  if (variantSkuResult.data) {
    return {
      source: "variant",
      matchType: "variant_sku",
      variantId:
        variantSkuResult.data.id,
      presentation: null,
    };
  }

  return null;
}

async function loadVariant(
  admin: any,
  brandSlug: string,
  variantId: string
) {
  const { data, error } = await admin
    .from("pos_product_variants")
    .select(VARIANT_SELECT)
    .eq("brand_slug", brandSlug)
    .eq("id", variantId)
    .maybeSingle();

  assertDatabaseResult(
    error,
    "No se pudo cargar la variante."
  );

  if (!data) {
    throw new PosApiError(
      404,
      "POS_RECEIVING_VARIANT_NOT_FOUND",
      "La variante no existe o pertenece a otra marca."
    );
  }

  return data as any;
}

function normalizeVariant(
  variant: any,
  locationId: string | null
) {
  const inventory = (
    variant.inventory || []
  ).map((record: any) => {
    const quantity = Number(
      record.quantity || 0
    );

    const reserved = Number(
      record.reserved_quantity || 0
    );

    return {
      ...record,
      quantity,
      reserved_quantity: reserved,
      minimum_quantity: Number(
        record.minimum_quantity || 0
      ),
      available_quantity:
        quantity - reserved,
    };
  });

  const selectedInventory =
    locationId
      ? inventory.find(
          (record: any) =>
            record.location_id === locationId
        ) || null
      : null;

  const totalQuantity = inventory.reduce(
    (total: number, record: any) =>
      total + record.quantity,
    0
  );

  const totalReserved = inventory.reduce(
    (total: number, record: any) =>
      total + record.reserved_quantity,
    0
  );

  return {
    ...variant,
    price: Number(variant.price || 0),
    cost: Number(variant.cost || 0),
    inventory,
    selectedLocationStock:
      selectedInventory
        ? {
            quantity:
              selectedInventory.quantity,
            reserved:
              selectedInventory
                .reserved_quantity,
            available:
              selectedInventory
                .available_quantity,
            minimum:
              selectedInventory
                .minimum_quantity,
          }
        : null,
    stock: {
      quantity: totalQuantity,
      reserved: totalReserved,
      available:
        totalQuantity - totalReserved,
    },
  };
}

function buildReceivingOptions({
  variant,
  units,
  conversions,
  presentations,
  matchedPresentation,
}: {
  variant: any;
  units: UnitRow[];
  conversions: ConversionRow[];
  presentations: PurchasePresentationRow[];
  matchedPresentation:
    | PurchasePresentationRow
    | null;
}) {
  const unitMap = new Map(
    units.map((unit) => [
      unit.code,
      unit,
    ])
  );

  const baseUnit =
    unitMap.get(variant.unit_code);

  const options: Array<
    Record<string, unknown>
  > = [];

  for (const presentation of presentations) {
    const inputUnit =
      unitMap.get(
        presentation.input_unit_code
      );

    const option = {
      key: `presentation:${presentation.id}`,
      presentationId: presentation.id,
      name: presentation.name,
      source: "saved_presentation",
      quantityMode:
        presentation.quantity_mode,
      inputUnitCode:
        presentation.input_unit_code,
      inputUnitName:
        inputUnit?.name ||
        presentation.input_unit_code,
      inputUnitSymbol:
        inputUnit?.symbol ||
        presentation.input_unit_code,
      baseUnitCode:
        presentation.base_unit_code,
      baseUnitName:
        baseUnit?.name ||
        presentation.base_unit_code,
      baseUnitSymbol:
        baseUnit?.symbol ||
        presentation.base_unit_code,
      conversionFactor: Number(
        presentation.conversion_factor
      ),
      defaultInputQuantity: Number(
        presentation.default_input_quantity
      ),
      allowFraction:
        presentation.allow_fraction,
      promptLabel:
        presentation.prompt_label ||
        buildPromptLabel({
          quantityMode:
            presentation.quantity_mode,
          presentationName:
            presentation.name,
          inputUnitName:
            inputUnit?.name ||
            presentation.input_unit_code,
        }),
      example: buildConversionExample({
        inputQuantity: Number(
          presentation.default_input_quantity
        ),
        inputUnitSymbol:
          inputUnit?.symbol ||
          presentation.input_unit_code,
        conversionFactor: Number(
          presentation.conversion_factor
        ),
        baseUnitSymbol:
          baseUnit?.symbol ||
          presentation.base_unit_code,
      }),
      matched:
        matchedPresentation?.id ===
        presentation.id,
    };

    options.push(option);
  }

  options.push({
    key: `direct:${variant.unit_code}`,
    presentationId: null,
    name: `Entrada en ${
      baseUnit?.name ||
      variant.unit_code
    }`,
    source: "unit_conversion",
    quantityMode: "direct",
    inputUnitCode: variant.unit_code,
    inputUnitName:
      baseUnit?.name ||
      variant.unit_code,
    inputUnitSymbol:
      baseUnit?.symbol ||
      variant.unit_code,
    baseUnitCode: variant.unit_code,
    baseUnitName:
      baseUnit?.name ||
      variant.unit_code,
    baseUnitSymbol:
      baseUnit?.symbol ||
      variant.unit_code,
    conversionFactor: 1,
    defaultInputQuantity: 1,
    allowFraction:
      Number(
        baseUnit?.decimal_precision || 0
      ) > 0,
    promptLabel: `Captura la cantidad recibida en ${
      (
        baseUnit?.name ||
        variant.unit_code
      ).toLowerCase()
    }.`,
    example: buildConversionExample({
      inputQuantity: 1,
      inputUnitSymbol:
        baseUnit?.symbol ||
        variant.unit_code,
      conversionFactor: 1,
      baseUnitSymbol:
        baseUnit?.symbol ||
        variant.unit_code,
    }),
    matched: false,
  });

  for (const conversion of conversions) {
    const inputUnit =
      unitMap.get(
        conversion.from_unit_code
      );

    const factor = Number(
      conversion.multiplier
    );

    options.push({
      key: `conversion:${conversion.from_unit_code}:${variant.unit_code}`,
      presentationId: null,
      name: `Recibir en ${
        inputUnit?.name ||
        conversion.from_unit_code
      }`,
      source: "unit_conversion",
      quantityMode:
        "variable_quantity",
      inputUnitCode:
        conversion.from_unit_code,
      inputUnitName:
        inputUnit?.name ||
        conversion.from_unit_code,
      inputUnitSymbol:
        inputUnit?.symbol ||
        conversion.from_unit_code,
      baseUnitCode:
        variant.unit_code,
      baseUnitName:
        baseUnit?.name ||
        variant.unit_code,
      baseUnitSymbol:
        baseUnit?.symbol ||
        variant.unit_code,
      conversionFactor: factor,
      defaultInputQuantity: 1,
      allowFraction: true,
      promptLabel: `Captura la cantidad real recibida en ${
        (
          inputUnit?.name ||
          conversion.from_unit_code
        ).toLowerCase()
      }.`,
      example: buildConversionExample({
        inputQuantity: 1,
        inputUnitSymbol:
          inputUnit?.symbol ||
          conversion.from_unit_code,
        conversionFactor: factor,
        baseUnitSymbol:
          baseUnit?.symbol ||
          variant.unit_code,
      }),
      matched: false,
    });
  }

  return options.sort(
    (left: any, right: any) => {
      if (left.matched) return -1;
      if (right.matched) return 1;

      if (
        left.source ===
          "saved_presentation" &&
        right.source !==
          "saved_presentation"
      ) {
        return -1;
      }

      if (
        right.source ===
          "saved_presentation" &&
        left.source !==
          "saved_presentation"
      ) {
        return 1;
      }

      return String(left.name).localeCompare(
        String(right.name),
        "es"
      );
    }
  );
}

function normalizeQuantityMode(
  value: unknown
): QuantityMode {
  const quantityMode = requiredText(
    value,
    "quantityMode",
    40
  )
    .trim()
    .toLowerCase() as QuantityMode;

  if (
    !VALID_QUANTITY_MODES.has(
      quantityMode
    )
  ) {
    throw new PosApiError(
      400,
      "POS_RECEIVING_QUANTITY_MODE_INVALID",
      "El modo de recepción no es válido."
    );
  }

  return quantityMode;
}

async function resolveConversionFactor({
  admin,
  inputUnitCode,
  baseUnitCode,
  suppliedFactor,
}: {
  admin: any;
  inputUnitCode: string;
  baseUnitCode: string;
  suppliedFactor: unknown;
}) {
  if (inputUnitCode === baseUnitCode) {
    return 1;
  }

  if (
    suppliedFactor !== undefined &&
    suppliedFactor !== null &&
    suppliedFactor !== ""
  ) {
    return numberValue(
      suppliedFactor,
      "conversionFactor",
      {
        min: 0.000001,
      }
    );
  }

  const { data, error } = await admin
    .from("pos_unit_conversions")
    .select("multiplier")
    .eq("from_unit_code", inputUnitCode)
    .eq("to_unit_code", baseUnitCode)
    .eq("active", true)
    .maybeSingle();

  assertDatabaseResult(
    error,
    "No se pudo consultar la conversión de unidades."
  );

  if (!data) {
    throw new PosApiError(
      400,
      "POS_RECEIVING_CONVERSION_NOT_FOUND",
      `No existe conversión de ${inputUnitCode} a ${baseUnitCode}.`
    );
  }

  return Number(data.multiplier);
}

function buildPromptLabel({
  quantityMode,
  presentationName,
  inputUnitName,
}: {
  quantityMode: QuantityMode;
  presentationName: string;
  inputUnitName: string;
}) {
  if (
    quantityMode ===
    "fixed_package"
  ) {
    return `¿Cuántos “${presentationName}” recibiste?`;
  }

  if (
    quantityMode ===
    "variable_quantity"
  ) {
    return `Captura la cantidad real recibida en ${inputUnitName.toLowerCase()}.`;
  }

  return `Captura la cantidad recibida en ${inputUnitName.toLowerCase()}.`;
}

function buildConversionExample({
  inputQuantity,
  inputUnitSymbol,
  conversionFactor,
  baseUnitSymbol,
}: {
  inputQuantity: number;
  inputUnitSymbol: string;
  conversionFactor: number;
  baseUnitSymbol: string;
}) {
  const result =
    inputQuantity *
    conversionFactor;

  return `${formatQuantity(
    inputQuantity
  )} ${inputUnitSymbol} = ${formatQuantity(
    result
  )} ${baseUnitSymbol}`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 3,
  }).format(Number(value || 0));
}

function looksLikeBarcode(value: string) {
  return /^[0-9]{8,18}$/.test(value);
}
