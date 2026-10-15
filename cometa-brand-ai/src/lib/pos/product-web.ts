import "server-only";
import { PosApiError, type PosRequestContext } from "./server";
import { getPosMode } from "./staff-server";
import { readProductChannels } from "./product-channels";
import { emptyWebContent, parseWebContent, webMediaPaths, type WebCatalog, type WebRecord } from "./product-web-contract";

export function assertWebAdministrator(context: PosRequestContext) {
  // Same canonical A1 authority; retain POS's authenticated transport/context.
  if (!context.user.isAdmin && !["owner", "admin"].includes(context.membership?.role ?? "")) {
    throw new PosApiError(403, "POS_WEB_DENIED", "Solo un administrador de esta marca puede preparar su ficha web.");
  }
}
export async function readProductWeb(context: PosRequestContext, id: string, locationId?: string | null) {
  assertWebAdministrator(context);
  if (await getPosMode(context) !== "RETAIL") throw new PosApiError(409, "POS_WEB_RETAIL_ONLY", "Ficha web disponible para Retail.");
  const { admin, brand } = context;
  const channels = await readProductChannels(context, id);
  const product = await admin.from("pos_products").select("id,name").eq("id", id).eq("brand_slug", brand.slug).maybeSingle();
  const record = await admin.from("pos_product_web_content").select("revision,draft,published,published_revision").eq("product_id", id).eq("brand_id", brand.id).maybeSingle();
  const variants = await admin.from("pos_product_variants").select("id,name,attributes,price,active").eq("product_id", id).eq("brand_slug", brand.slug).order("id");
  if (product.error || record.error || variants.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudo cargar la ficha web.");
  if (!product.data) throw new PosApiError(404, "POS_PRODUCT_NOT_FOUND", "Producto no disponible.");
  const inventory: { variant_id: string; quantity: number | string; reserved_quantity: number | string }[] = [];
  const variantIds = (variants.data ?? []).map(v => v.id);
  // Keep query URLs bounded and do not silently truncate multi-branch stock.
  for (let batch = 0; batch < variantIds.length; batch += 50) {
    for (let offset = 0; ; offset += 500) {
      let query = admin.from("pos_inventory").select("variant_id,quantity,reserved_quantity").eq("brand_slug", brand.slug).in("variant_id", variantIds.slice(batch, batch + 50)).order("id").range(offset, offset + 499);
      if (locationId) query = query.eq("location_id", locationId);
      const result = await query;
      if (result.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudo verificar la disponibilidad.");
      inventory.push(...(result.data ?? []));
      if ((result.data ?? []).length < 500) break;
    }
  }
  let locationsQuery = admin.from("pos_locations").select("id,currency").eq("brand_slug", brand.slug);
  if (locationId) locationsQuery = locationsQuery.eq("id", locationId);
  const locations = await locationsQuery;
  if (locations.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudo verificar precio y disponibilidad.");
  if (locationId && !locations.data?.length) throw new PosApiError(403, "POS_LOCATION_DENIED", "Sucursal no disponible en esta marca.");
  const currencies = [...new Set((locations.data ?? []).map(l => String(l.currency)))];
  const currency = currencies.length === 1 && /^[A-Z]{3}$/.test(currencies[0]) ? currencies[0] : null;
  const catalog: WebCatalog = { id, name: product.data.name, brandName: brand.name, currency, variants: (variants.data ?? []).map(v => ({
    id: v.id, name: v.name, attributes: v.attributes ?? {}, price: Number(v.price), active: v.active,
    available: inventory.filter(i => i.variant_id === v.id).reduce((n, i) => n + Math.max(0, Number(i.quantity) - Number(i.reserved_quantity)), 0),
  })) };
  const web: WebRecord = record.data ? { revision: record.data.revision, draft: parseWebContent(record.data.draft, brand.slug), published: record.data.published ? parseWebContent(record.data.published, brand.slug) : null, publishedRevision: record.data.published_revision } : { revision: 0, draft: emptyWebContent(), published: null, publishedRevision: null };
  const media = Object.fromEntries([...new Set([...webMediaPaths(web.draft), ...(web.published ? webMediaPaths(web.published) : [])])].map(path => [path, admin.storage.from("pos-products").getPublicUrl(path).data.publicUrl]));
  const relatedIds = [...new Set([...web.draft.relatedIds, ...(web.published?.relatedIds ?? [])])];
  const related = relatedIds.length ? await admin.from("pos_products").select("id,name").eq("brand_slug", brand.slug).in("id", relatedIds) : { data: [], error: null };
  if (related.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudieron verificar los complementos.");
  return { catalog, web, channels, media, related: related.data ?? [] };
}
