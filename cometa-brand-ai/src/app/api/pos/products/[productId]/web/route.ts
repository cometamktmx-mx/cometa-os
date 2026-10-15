import { requirePosOperationalAccess } from "@/lib/pos/access";
import { requirePosMutationAccess } from "@/lib/pos/mutation-access";
import { getBrandSlugFromUrl, handlePosError, ok, PosApiError, uuidValue } from "@/lib/pos/server";
import { assertWebAdministrator, readProductWeb } from "@/lib/pos/product-web";
import { parseWebContent } from "@/lib/pos/product-web-contract";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ productId: string }> };
export async function GET(request: Request, route: Context) {
  try {
    const context = await requirePosOperationalAccess({ brandSlug: getBrandSlugFromUrl(request), entitlement: "pos.products" });
    assertWebAdministrator(context);
    const id = uuidValue((await route.params).productId, "productId");
    if (!id) throw new PosApiError(400, "POS_PRODUCT_ID_REQUIRED", "Selecciona un producto.");
    const url = new URL(request.url);
    if (url.searchParams.has("search")) {
      const search = (url.searchParams.get("search") ?? "").trim();
      if (search.length > 100) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Búsqueda demasiado larga.");
      const { data, error } = await context.admin.from("pos_products").select("id,name").eq("brand_slug", context.brand.slug).eq("active", true).ilike("name", `%${search.replace(/[%_]/g, "")}%`).order("name").order("id").limit(30);
      if (error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudieron buscar los productos.");
      return ok({ products: (data ?? []).filter(p => p.id !== id) });
    }
    return ok(await readProductWeb(context, id, uuidValue(url.searchParams.get("locationId"), "locationId")));
  } catch (e) { return handlePosError(e); }
}
export async function PATCH(request: Request, route: Context) {
  try {
    const context = await requirePosMutationAccess({ brandSlug: getBrandSlugFromUrl(request), operation: "products.write" });
    assertWebAdministrator(context);
    const id = uuidValue((await route.params).productId, "productId");
    if (!id) throw new PosApiError(400, "POS_PRODUCT_ID_REQUIRED", "Selecciona un producto.");
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Ficha inválida.");
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(k => !["revision", "document", "publish"].includes(k)) || !Number.isSafeInteger(input.revision) || Number(input.revision) < 0 || Number(input.revision) >= 2147483647 || typeof input.publish !== "boolean") throw new PosApiError(400, "POS_VALIDATION_ERROR", "Indica revisión, contenido y tipo de guardado.");
    let document;
    try { document = parseWebContent(input.document, context.brand.slug); } catch { throw new PosApiError(400, "POS_VALIDATION_ERROR", "Revisa límites, imágenes y referencias duplicadas de la ficha."); }
    const { data, error } = await context.admin.rpc("pos_save_product_web_m2", { p_brand_slug: context.brand.slug, p_product_id: id, p_actor: context.user.userId, p_revision: input.revision, p_document: document, p_publish: input.publish });
    if (error) {
      if (error.message.includes("CONFLICT")) throw new PosApiError(409, "POS_WEB_CONFLICT", "Otra persona cambió la ficha. Recarga antes de guardar.");
      if (error.message.includes("DENIED")) throw new PosApiError(403, "POS_WEB_DENIED", "No tienes permiso para editar esta ficha.");
      if (error.message.includes("SERVICE_DISABLED")) throw new PosApiError(409, "POS_WEB_SERVICE_DISABLED", "La tienda no está habilitada. Puedes conservar un borrador.");
      if (/INVALID|DUPLICATE|RETAIL_ONLY/.test(error.message)) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Verifica variantes, imágenes y productos de esta marca.");
      if (error.message.includes("NOT_FOUND")) throw new PosApiError(404, "POS_PRODUCT_NOT_FOUND", "Producto no disponible.");
      throw new PosApiError(503, "POS_WEB_SAVE_FAILED", "No se pudo confirmar el guardado. Recarga para verificar el estado.");
    }
    return ok({ web: data });
  } catch (e) { return handlePosError(e); }
}
