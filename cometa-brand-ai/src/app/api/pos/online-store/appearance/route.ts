import { requirePosOperationalAccess } from "@/lib/pos/access";
import { requirePosMutationAccess } from "@/lib/pos/mutation-access";
import { getBrandSlugFromUrl, handlePosError, ok as baseOk, PosApiError } from "@/lib/pos/server";
import { assertWebAdministrator } from "@/lib/pos/product-web";
import { getPosMode } from "@/lib/pos/staff-server";
import { readOnlineStoreService } from "@/lib/workspace/online-store-access";
import { emptyAppearance, parseAppearance } from "../../../../../../packages/own-storefront/contract";
export const dynamic = "force-dynamic";
function privateResponse<T extends Response>(response: T): T { response.headers.set("Cache-Control", "private, no-store"); return response; }
function ok(...args: Parameters<typeof baseOk>) { return privateResponse(baseOk(...args)); }
export async function GET(request: Request) {
  try {
    const c = await requirePosOperationalAccess({ brandSlug: getBrandSlugFromUrl(request), entitlement: "pos.products" });
    assertWebAdministrator(c);
    if (await getPosMode(c) !== "RETAIL") throw new PosApiError(409, "POS_WEB_RETAIL_ONLY", "Apariencia disponible para Retail.");
    const query = new URL(request.url).searchParams;
    if (query.get("media") === "1") {
      const folders = await c.admin.storage.from("pos-products").list(c.brand.slug + "/web", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      if (folders.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudieron cargar los archivos.");
      const paths: string[] = [];
      const legacy = await c.admin.storage.from("pos-products").list(c.brand.slug, { limit: 100 });
      if (legacy.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudieron cargar los archivos del catálogo.");
      for (const folder of legacy.data ?? []) {
        if (folder.id || !/^[0-9a-f-]{36}$/i.test(folder.name)) continue;
        const files = await c.admin.storage.from("pos-products").list(c.brand.slug + "/" + folder.name, { limit: 100 });
        if (files.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudieron cargar los archivos del catálogo.");
        paths.push(...(files.data ?? []).filter(f => f.id && /\.(jpg|jpeg|png|webp)$/i.test(f.name)).map(f => c.brand.slug + "/" + folder.name + "/" + f.name));
      }
      for (const folder of folders.data ?? []) {
        if (folder.id) continue;
        const files = await c.admin.storage.from("pos-products").list(c.brand.slug + "/web/" + folder.name, { limit: 100 });
        if (files.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudieron cargar los archivos.");
        paths.push(...(files.data ?? []).filter(f => f.id && /\.(jpg|jpeg|png|webp)$/i.test(f.name)).map(f => c.brand.slug + "/web/" + folder.name + "/" + f.name));
      }
      return ok({ media: paths });
    }
    if (query.get("preview") === "catalog") {
      const result = await c.admin.rpc("brand_storefront_catalog_m4", { p_brand_slug: c.brand.slug, p_query: {} });
      if (result.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudo cargar el catálogo.");
      return ok({ preview: result.data });
    }
    if (query.get("preview") === "product") {
      const id = query.get("product") ?? "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Selecciona un producto.");
      const result = await c.admin.rpc("brand_storefront_product_m5", { p_brand_slug: c.brand.slug, p_product: id });
      if (result.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudo cargar el producto.");
      return ok({ preview: result.data });
    }
    const record = await c.admin.from("brand_storefront_appearance").select("revision,draft,published,published_revision").eq("brand_id", c.brand.id).maybeSingle();
    const search = (new URL(request.url).searchParams.get("search") ?? "").trim();
    if (search.length > 100) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Búsqueda demasiado larga.");
    const candidates = await c.admin.from("pos_products").select("id,name,active,image_url").eq("brand_slug", c.brand.slug).ilike("name", `%${search.replace(/[%_]/g, "")}%`).order("name").order("id").limit(100);
    if (record.error || candidates.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudo cargar Apariencia.");
    const draft = record.data ? parseAppearance(record.data.draft, c.brand.slug) : { ...emptyAppearance(), name: c.brand.name };
    const selected = draft.sections.flatMap(s => s.entries.map(e => e.productId)).filter(Boolean);
    const cards = await c.admin.rpc("brand_storefront_cards_m3", { p_brand_slug: c.brand.slug, p_ids: [...new Set([...selected, ...(candidates.data ?? []).map(p => p.id)])] });
    if (cards.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudieron verificar los productos publicados.");
    const service = await readOnlineStoreService(c.admin, c.brand.id);
    const mediaBase = c.admin.storage.from("pos-products").getPublicUrl("").data.publicUrl.replace(/\/?$/, "/");
    const ids = (candidates.data ?? []).map(p=>p.id);
    const [channels, contents] = ids.length ? await Promise.all([
      c.admin.from("pos_product_sales_channels").select("product_id,online_requested").in("product_id",ids),
      c.admin.from("pos_product_web_content").select("product_id,published_revision").eq("brand_id",c.brand.id).in("product_id",ids),
    ]) : [{data:[],error:null},{data:[],error:null}];
    if (channels.error || contents.error) throw new PosApiError(503,"POS_WEB_LOOKUP_FAILED","No se pudo comprobar la preparación de los productos.");
    const preparation = (candidates.data ?? []).map(p => ({ id:p.id, name:p.name, image:typeof p.image_url === "string" && p.image_url.startsWith(mediaBase+c.brand.slug+"/") ? p.image_url : null, reasons: [!p.active ? "Producto inactivo" : "", !channels.data?.some(v=>v.product_id===p.id&&v.online_requested) ? "Selecciona Tienda online en Canales de venta" : "", !contents.data?.some(v=>v.product_id===p.id&&v.published_revision!==null) ? "Prepara y publica su Ficha web" : "", service.status!=="enabled" ? "Servicio de tienda no habilitado" : ""].filter(Boolean) }));
    let storeUrl: string | null = null;
    try { const urls: unknown = JSON.parse(process.env.OWN_STOREFRONT_URLS || "{}"); if (urls && typeof urls === "object") { const value = (urls as Record<string, unknown>)[c.brand.slug]; if (typeof value === "string") { const url = new URL(value); if (url.protocol === "https:" && !url.username && !url.password) storeUrl = url.origin; } } } catch { /* Unconfigured public URL is not a working connection. */ }
    return ok({ storeUrl, revision: record.data?.revision ?? 0, draft, publishedRevision: record.data?.published_revision ?? null, products: cards.data ?? [], preparation, service: service.status, mediaBase });
  } catch (e) { return privateResponse(handlePosError(e)); }
}
// Selecting a legacy catalog photograph creates an immutable web copy. It never
// moves or changes the original product image and cannot cross brand boundaries.
export async function POST(request: Request) {
  try {
    const c = await requirePosMutationAccess({ brandSlug: getBrandSlugFromUrl(request), operation: "products.write" });
    assertWebAdministrator(c);
    if (await getPosMode(c) !== "RETAIL") throw new PosApiError(409, "POS_WEB_RETAIL_ONLY", "Disponible para Retail.");
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k=>k!=="source")) throw new PosApiError(400,"POS_VALIDATION_ERROR","Imagen inválida.");
    const source = (input as Record<string,unknown>).source;
    if (typeof source !== "string" || !source.startsWith(c.brand.slug + "/") || !/^[a-zA-Z0-9_-]+\/[0-9a-f-]{36}\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(source)) throw new PosApiError(400,"POS_VALIDATION_ERROR","Selecciona una imagen de esta marca.");
    const target = `${c.brand.slug}/web/${crypto.randomUUID()}/${crypto.randomUUID()}.${source.split(".").at(-1)?.toLowerCase()}`;
    const copied = await c.admin.storage.from("pos-products").copy(source,target);
    if (copied.error) throw new PosApiError(503,"POS_WEB_SAVE_FAILED","No se pudo preparar la imagen. El original se conserva.");
    return ok({storagePath:target});
  } catch(e) { return privateResponse(handlePosError(e)); }
}
export async function PATCH(request: Request) {
  try {
    const c = await requirePosMutationAccess({ brandSlug: getBrandSlugFromUrl(request), operation: "products.write" });
    assertWebAdministrator(c);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Contenido inválido.");
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(k => !["revision", "document", "publish"].includes(k)) || !Number.isSafeInteger(input.revision) || Number(input.revision) < 0 || Number(input.revision) >= 2147483647 || typeof input.publish !== "boolean") throw new PosApiError(400, "POS_VALIDATION_ERROR", "Revisión inválida.");
    let document;
    try { document = parseAppearance(input.document, c.brand.slug); } catch { throw new PosApiError(400, "POS_VALIDATION_ERROR", "Revisa textos, enlaces HTTPS, imágenes y productos duplicados."); }
    // Additional responsive media references remain immutable and brand-owned.
    for (const path of [...new Set(Object.entries(document.mediaLayout ?? {}).flatMap(([path, layout]) => [path, layout.mobileImage]).filter(Boolean))]) {
      const parts = path.split("/"), name = parts.pop();
      const files = await c.admin.storage.from("pos-products").list(parts.join("/"), { search: name, limit: 100 });
      if (files.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudo verificar la imagen.");
      if (!files.data?.some(f => f.name === name && f.id)) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Selecciona una imagen existente de esta marca.");
    }
    // Avoid invoking a known stale revision (the RPC remains the concurrent authority).
    const latest = await c.admin.from("brand_storefront_appearance").select("revision").eq("brand_id", c.brand.id).maybeSingle();
    if (latest.error) throw new PosApiError(503, "POS_WEB_LOOKUP_FAILED", "No se pudo comprobar la versión.");
    if ((latest.data?.revision ?? 0) !== input.revision) throw new PosApiError(409, "POS_WEB_CONFLICT", "Otra persona cambió Apariencia. Recupera tus cambios antes de guardar.");
    const result = await c.admin.rpc("brand_storefront_save_m3", { p_brand_slug: c.brand.slug, p_actor: c.user.userId, p_revision: input.revision, p_document: document, p_publish: input.publish });
    if (result.error) {
      if (/CONFLICT/.test(result.error.message)) throw new PosApiError(409, "POS_WEB_CONFLICT", "Otra persona cambió Apariencia. Recarga antes de guardar.");
      if (/DENIED/.test(result.error.message)) throw new PosApiError(403, "POS_WEB_DENIED", "No tienes permiso en esta marca.");
      if (/SERVICE_DISABLED/.test(result.error.message)) throw new PosApiError(409, "POS_WEB_SERVICE_DISABLED", "La tienda está deshabilitada o suspendida. Conserva un borrador.");
      if (/INVALID|RETAIL_ONLY/.test(result.error.message)) throw new PosApiError(400, "POS_VALIDATION_ERROR", "Revisa imágenes y productos de esta marca.");
      throw new PosApiError(503, "POS_WEB_SAVE_FAILED", "No se pudo confirmar el guardado. Recarga para verificar.");
    }
    return ok({ appearance: result.data });
  } catch (e) { return privateResponse(handlePosError(e)); }
}
