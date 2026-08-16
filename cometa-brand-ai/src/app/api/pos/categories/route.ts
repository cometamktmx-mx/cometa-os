import {
  assertDatabaseResult,
  getBrandSlugFromUrl,
  fail,
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

type CategoryBody = {
  brandSlug?: unknown;
  name?: unknown;
  description?: unknown;
  parentId?: unknown;
};

export async function GET(request: Request) {
  try {
    const brandSlug = getBrandSlugFromUrl(request);
    const { admin, brand } = await requirePosOperationalAccess({ brandSlug, entitlement: "pos.products" });

    const { data, error } = await admin
      .from("pos_categories")
      .select("*")
      .eq("brand_slug", brand.slug)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    assertDatabaseResult(
      error,
      "No se pudieron cargar las categorías."
    );

    return ok({
      brand,
      categories: data || [],
    });
  } catch (error) {
    return handlePosError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<CategoryBody>(request);
    const brandSlug = requiredText(
      body.brandSlug,
      "brandSlug",
      120
    );
    const { admin, brand, user } =
      await requirePosOperationalAccess({ brandSlug, entitlement: "pos.products" });

    const { data, error } = await admin
      .from("pos_categories")
      .insert({
        brand_id: brand.id,
        brand_slug: brand.slug,
        name: requiredText(body.name, "name", 100),
        description: optionalText(body.description, 500),
        parent_id: uuidValue(
          body.parentId,
          "parentId",
          false
        ),
        created_by: user.userId,
      })
      .select("*")
      .single();

    if (error?.code === "23505") {
      return fail(
        "Ya existe una categoría con ese nombre.",
        409,
        "POS_CATEGORY_DUPLICATED"
      );
    }

    assertDatabaseResult(
      error,
      "No se pudo crear la categoría."
    );

    return ok(
      {
        category: data,
      },
      201
    );
  } catch (error) {
    return handlePosError(error);
  }
}
