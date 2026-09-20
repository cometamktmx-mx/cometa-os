import { getBrandSlugFromUrl, handlePosError, ok, readJsonBody, requiredText, uuidValue } from "@/lib/pos/server";
import { assertFoodResult, foodCommand, requireFoodAccess } from "@/lib/pos/food-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const locationId = uuidValue(new URL(request.url).searchParams.get("locationId"), "locationId", false);
    const { context, session } = await requireFoodAccess(getBrandSlugFromUrl(request), undefined, locationId);
    const { data, error } = await context.admin.rpc("pos_food_snapshot_v1", {
      p_brand_slug: context.brand.slug, p_host_user_id: context.user.userId,
      p_session_id: session.id, p_location_id: session.locationId || locationId,
    });
    assertFoodResult(error, data);
    // Images are optional presentation data: preserve the RPC's catalog and role filtering.
    const products = Array.isArray(data.products) ? data.products : [];
    const variantIds = products.flatMap((product: unknown) => product && typeof product === "object" && "id" in product && typeof product.id === "string" ? [product.id] : []);
    const images = new Map<string, string | null>();
    for (let offset = 0; offset < variantIds.length; offset += 200) {
      const { data: variants, error: imageError } = await context.admin.from("pos_product_variants")
        .select("id,image_url,product:pos_products!inner(image_url,brand_slug)")
        .eq("brand_slug", context.brand.slug).eq("product.brand_slug", context.brand.slug)
        .in("id", variantIds.slice(offset, offset + 200));
      if (imageError) {
        // A failed optional lookup must not block ordering; use the visual fallback.
        console.warn("[POS Food] Product image lookup failed", { code: imageError.code });
        continue;
      }
      for (const variant of variants || []) {
        const product = Array.isArray(variant.product) ? variant.product[0] : variant.product;
        images.set(variant.id, variant.image_url?.trim() || product?.image_url?.trim() || null);
      }
    }
    const catalog = products.map((product: unknown) => product && typeof product === "object" && "id" in product && typeof product.id === "string"
      ? { ...product, image_url: images.get(product.id) || null } : product);
    return ok({ snapshot: { ...data, operatorRoles: session.staff.roles, ...(Array.isArray(data.products) ? { products: catalog } : {}) } });
  } catch (error) { return handlePosError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const { action, payload, idempotencyKey } = foodCommand(body);
    const { context, session } = await requireFoodAccess(requiredText(body.brandSlug, "brandSlug", 120), action,
      typeof payload.locationId === "string" ? payload.locationId : null);
    const { data, error } = await context.admin.rpc("pos_food_command_v1", {
      p_brand_slug: context.brand.slug, p_host_user_id: context.user.userId, p_session_id: session.id,
      p_action: action, p_payload: payload, p_key: idempotencyKey,
    });
    assertFoodResult(error, data);
    return ok({ result: data });
  } catch (error) { return handlePosError(error); }
}
