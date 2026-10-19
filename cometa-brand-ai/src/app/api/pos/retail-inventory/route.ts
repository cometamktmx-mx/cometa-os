import { requirePosOperationalAccess } from "@/lib/pos/access";
import { requirePosMutationAccess } from "@/lib/pos/mutation-access";
import { getPosMode, requireRetailPermission } from "@/lib/pos/staff-server";
import { PosApiError, getBrandSlugFromUrl, handlePosError, ok, readJsonBody, uuidValue } from "@/lib/pos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const messages: Record<string, string> = {
  POS_INVENTORY_CHANGED: "Hubo movimientos desde que abriste el conteo. Conservamos tu captura: actualiza las existencias y reconcilia las diferencias antes de confirmar.",
  POS_COUNT_BELOW_RESERVED: "El conteo es menor que las prendas reservadas. Resuelve el conflicto con un administrador; no se liberaron reservas.",
  POS_INVENTORY_UNAVAILABLE: "No hay suficientes prendas disponibles. Las reservadas no pueden salir.",
  POS_RETURN_EXCEEDS_PENDING: "La cantidad supera lo pendiente de regreso. Actualiza el folio.",
  POS_IDEMPOTENCY_CONFLICT: "Este intento corresponde a otros datos. Revisa los movimientos antes de iniciar otro lote.",
  POS_STAFF_PERMISSION_REQUIRED: "El operador no tiene permiso o su sesión venció. Ingresa su PIN nuevamente.",
  POS_WHOLE_PIECES_REQUIRED: "Captura piezas enteras.",
  POS_REASON_REQUIRED: "Describe el motivo (al menos tres caracteres).",
  POS_OUT_DETAILS_REQUIRED: "Indica responsable y una fecha futura de regreso.",
};
function check(error: { message: string } | null) {
  if (error) throw new PosApiError(409, "POS_WEB_CONFLICT", messages[error.message] || "No se guardó el lote. Revisa sucursal, productos y cantidades; tu captura se conserva.");
}
export async function GET(request: Request) {
  try {
    const c = await requirePosOperationalAccess({ brandSlug: getBrandSlugFromUrl(request), entitlement: "pos.inventory" });
    if (await getPosMode(c) !== "RETAIL") throw new PosApiError(403, "POS_PERMISSION_REQUIRED", "Disponible únicamente para Retail.");
    const staff = await requireRetailPermission(c, "PRODUCTS_READ");
    const url = new URL(request.url);
    const location = uuidValue(url.searchParams.get("locationId"), "locationId");
    if ((c.device && location !== c.device.locationId) || (staff?.locationId && location !== staff.locationId)) throw new PosApiError(403, "POS_PERMISSION_REQUIRED", "Sucursal no autorizada.");
    const loc = await c.admin.from("pos_locations").select("id").eq("brand_slug", c.brand.slug).eq("id", location).eq("active", true).maybeSingle();
    check(loc.error);
    if (!loc.data) throw new PosApiError(404, "POS_NOT_FOUND", "Sucursal no disponible.");
    const view = url.searchParams.get("view") || "stock";
    if (view === "outs") {
      const page = Number(url.searchParams.get("page") || 1), search = (url.searchParams.get("search") || "").trim();
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || search.length > 180) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Revisa búsqueda y página.");
      const r = await c.admin.rpc("pos_retail_stock_out_list_v1", { p_brand: c.brand.slug, p_location: location, p_search: search, p_page: page });
      check(r.error);
      const data = r.data as {total:number;outs:{items:{variant_id:string;variant:Record<string,unknown>}[]}[]};
      const ids = [...new Set(data.outs.flatMap(o => o.items.map(i => i.variant_id)))];
      if (ids.length) {
        const units = await c.admin.from("pos_product_variants").select("id,unit_code").eq("brand_slug", c.brand.slug).in("id", ids); check(units.error);
        const byId = new Map((units.data || []).map(v => [v.id, v.unit_code]));
        for (const out of data.outs) for (const item of out.items) item.variant.unit_code = byId.get(item.variant_id);
      }
      return ok(data);
    }
    if (view === "movements") {
      const page = Number(url.searchParams.get("page") || 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Página inválida.");
      const r = await c.admin.from("pos_inventory_movements").select("*,variant:pos_product_variants(name,sku,product:pos_products(name))", { count: "exact" }).eq("brand_slug", c.brand.slug).eq("location_id", location).order("created_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1);
      check(r.error); return ok({ movements: r.data, total: r.count });
    }
    const page = Number(url.searchParams.get("page") || 1), search = (url.searchParams.get("search") || "").trim(), filter = url.searchParams.get("filter") || "all";
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || search.length > 180 || !["all", "available", "empty", "reserved", "outside"].includes(filter)) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Revisa los filtros.");
    const r = await c.admin.rpc("pos_retail_inventory_catalog_v1", { p_brand: c.brand.slug, p_location: location, p_search: search, p_category: uuidValue(url.searchParams.get("categoryId"), "categoryId", false), p_filter: filter, p_page: page, p_product: uuidValue(url.searchParams.get("productId"), "productId", false) });
    check(r.error); return ok(r.data);
  } catch (error) { return handlePosError(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new PosApiError(403, "POS_PERMISSION_REQUIRED", "Origen no autorizado.");
    const body = await readJsonBody<Record<string, unknown>>(request);
    const c = await requirePosMutationAccess({ brandSlug: getBrandSlugFromUrl(request), operation: "inventory.write", locationId: body.locationId });
    if (await getPosMode(c) !== "RETAIL") throw new PosApiError(403, "POS_PERMISSION_REQUIRED", "Disponible únicamente para Retail.");
    const staff = await requireRetailPermission(c, "INVENTORY");
    if (!staff) throw new PosApiError(401, "POS_STAFF_SESSION_REQUIRED", "Selecciona un operador.");
    const location = uuidValue(body.locationId, "locationId");
    if (staff.locationId && staff.locationId !== location) throw new PosApiError(403, "POS_PERMISSION_REQUIRED", "Sucursal no autorizada.");
    if (body.action === "dispose") await requireRetailPermission(c, "SETTINGS");
    const r = await c.admin.rpc("pos_retail_inventory_batch_v1", { p_brand: c.brand.slug, p_actor: c.user.userId, p_session: staff.id, p_request: uuidValue(body.requestKey, "requestKey"), p_location: location, p_action: body.action, p_body: body.payload });
    check(r.error); return ok({ result: r.data });
  } catch (error) { return handlePosError(error); }
}
