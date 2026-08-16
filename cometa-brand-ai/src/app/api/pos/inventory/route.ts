import {
  assertDatabaseResult,
  getBrandSlugFromUrl,
  fail,
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

type InventoryBody = {
  brandSlug?: unknown;
  locationId?: unknown;
  variantId?: unknown;
  movementType?: unknown;
  quantity?: unknown;
  mode?: unknown;
  notes?: unknown;
};

const allowedMovementTypes = new Set([
  "initial",
  "receipt",
  "return",
  "adjustment",
  "transfer_in",
  "transfer_out",
  "loss",
]);

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.inventory" });
    const { page, pageSize, from, to } =
      getPagination(request);

    const url = new URL(request.url);
    const locationId = url.searchParams.get("locationId");
    const criticalOnly =
      url.searchParams.get("criticalOnly") === "true";

    let query = admin
      .from("pos_inventory")
      .select(
        `
        *,
        location:pos_locations(id,name,code),
        variant:pos_product_variants(
          id,
          name,
          sku,
          barcode,
          price,
          product:pos_products(
            id,
            name,
            image_url,
            active,
            track_inventory
          )
        )
        `,
        { count: "exact" }
      )
      .eq("brand_slug", brand.slug)
      .order("updated_at", { ascending: false });

    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    if (!criticalOnly) {
      query = query.range(from, to);
    }

    const { data, error, count } = await query;

    assertDatabaseResult(
      error,
      "No se pudo cargar el inventario."
    );

    const filteredInventory = criticalOnly
      ? (data || []).filter(
          (row: any) =>
            Number(row.quantity || 0) <=
            Number(row.minimum_quantity || 0)
        )
      : data || [];

    const paginatedInventory = criticalOnly
      ? filteredInventory.slice(from, to + 1)
      : filteredInventory;

    const total = criticalOnly
      ? filteredInventory.length
      : count || 0;

    return ok({
      brand,
      inventory: paginatedInventory,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<InventoryBody>(request);
    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );
    const { admin, brand, user } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.inventory" });

    const movementType = requiredText(
      body.movementType,
      "movementType",
      30
    );

    if (!allowedMovementTypes.has(movementType)) {
      return fail(
        "Tipo de movimiento de inventario no permitido.",
        400,
        "POS_INVENTORY_MOVEMENT_INVALID"
      );
    }

    const mode =
      optionalText(body.mode, 20) || "delta";

    const { data, error } = await admin.rpc(
      "pos_adjust_inventory",
      {
        p_brand_slug: brand.slug,
        p_location_id: uuidValue(
          body.locationId,
          "locationId"
        ),
        p_variant_id: uuidValue(
          body.variantId,
          "variantId"
        ),
        p_quantity: numberValue(
          body.quantity,
          "quantity",
          {
            min: mode === "absolute" ? 0 : undefined,
          }
        ),
        p_movement_type: movementType,
        p_notes: optionalText(body.notes, 1000),
        p_user_id: user.userId,
        p_set_absolute: mode === "absolute",
      }
    );

    assertDatabaseResult(
      error,
      "No se pudo actualizar el inventario."
    );

    return ok({
      inventory: Array.isArray(data) ? data[0] : data,
    });
  } catch (error) {
    return handlePosError(error);
  }
}
