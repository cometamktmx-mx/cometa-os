import {
  assertDatabaseResult,
  fail,
  getBrandSlugFromUrl,
  handlePosError,
  ok,
  requiredText,
} from "@/lib/pos/server";
import { requirePosOperationalAccess } from "@/lib/pos/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScanMatchType = "barcode" | "sku";

const VARIANT_SELECT = `
  id,
  brand_slug,
  product_id,
  name,
  sku,
  barcode,
  price,
  cost,
  attributes,
  unit_code,
  is_default,
  image_url,
  active,
  product:pos_products(
    id,
    name,
    description,
    product_type,
    inventory_mode,
    default_unit_code,
    has_variants,
    sellable,
    tax_rate,
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
    const url = new URL(request.url);

    const code = requiredText(
      url.searchParams.get("code"),
      "code",
      160
    );

    const { admin, brand } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.products" });

    const normalizedCode = code.trim();

    let matchType: ScanMatchType | null = null;
    let variant: any = null;

    const barcodeResult = await admin
      .from("pos_product_variants")
      .select(VARIANT_SELECT)
      .eq("brand_slug", brand.slug)
      .eq("barcode", normalizedCode)
      .eq("active", true)
      .maybeSingle();

    assertDatabaseResult(
      barcodeResult.error,
      "No se pudo buscar el código de barras."
    );

    if (barcodeResult.data) {
      variant = barcodeResult.data;
      matchType = "barcode";
    }

    if (!variant) {
      const skuResult = await admin
        .from("pos_product_variants")
        .select(VARIANT_SELECT)
        .eq("brand_slug", brand.slug)
        .ilike("sku", normalizedCode)
        .eq("active", true)
        .maybeSingle();

      assertDatabaseResult(
        skuResult.error,
        "No se pudo buscar el SKU."
      );

      if (skuResult.data) {
        variant = skuResult.data;
        matchType = "sku";
      }
    }

    if (!variant) {
      return ok({
        found: false,
        code: normalizedCode,
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

    if (
      !variant.product ||
      !variant.product.active
    ) {
      return fail(
        "El código pertenece a un producto desactivado.",
        409,
        "POS_SCANNED_PRODUCT_INACTIVE"
      );
    }

    if (!variant.product.sellable) {
      return fail(
        "El producto existe, pero no está disponible para venta.",
        409,
        "POS_SCANNED_PRODUCT_NOT_SELLABLE"
      );
    }

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

    return ok({
      found: true,
      code: normalizedCode,
      matchType,
      variant: {
        ...variant,
        price: Number(variant.price || 0),
        cost: Number(variant.cost || 0),
        inventory,
        stock: {
          quantity: totalQuantity,
          reserved: totalReserved,
          available:
            totalQuantity - totalReserved,
        },
      },
    });
  } catch (error) {
    return handlePosError(error);
  }
}

function looksLikeBarcode(value: string) {
  return /^[0-9]{8,18}$/.test(value);
}
