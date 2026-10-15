import { createClient } from "@/lib/supabase/server";
import { PosApiError } from "@/lib/pos/server";
import { requireSellerAccess } from "./seller-access";
import type { JsonValue, VariantAttributeDefinition } from "@/lib/pos/product-variants";

// V3B consumes these exact domain operations, never a second COMU generator.
export { generateCombinations, reconcileVariants, generateMissingSkus, variantSignature, normalizeProductCode, validateSku, COMU_VARIANT_LIMIT, SKU_MAX_LENGTH } from "@/lib/pos/product-variants";
export type CatalogAttributeDefinition = VariantAttributeDefinition & {
  id: string; name: string; input_type: string; options: JsonValue;
  required: boolean; use_in_variant_name: boolean; active: boolean;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type CatalogSnapshot = {
  products: Array<{ id: string; name: string; description: string | null; category_id: string | null; product_code: string | null; updated_at: string; product_type: string; inventory_mode: string }>;
  variants: Array<{ id: string; product_id: string; name: string; sku: string | null; price: number; attributes: Record<string, JsonValue>; active?: boolean; barcode?: string | null }>;
  // Optional until the separately authorized database rollout; absence is not an empty configuration.
  attributeDefinitions?: CatalogAttributeDefinition[];
  variantContract?: { version: number; skuMaxLength: number; maxVariants: number };
  inventory: Array<{ variant_id: string; location_id: string; quantity: number; reserved_quantity: number }>;
  categories: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  listings: Array<{ id: string; product_id: string; status: string }>;
  progress: { ok: boolean; reason?: string; publishedListings: number; minimumListings: number };
};

export function validateCatalogCommand(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PosApiError(400, "COMU_CATALOG_INVALID", "Solicitud inválida.");
  const body = value as Record<string, unknown>;
  if (typeof body.sellerId !== "string" || !uuid.test(body.sellerId) || typeof body.requestId !== "string" || !uuid.test(body.requestId) || !body.product || typeof body.product !== "object" || Array.isArray(body.product)) throw new PosApiError(400, "COMU_CATALOG_INVALID", "Solicitud inválida.");
  if (JSON.stringify(body.product).length > 65536) throw new PosApiError(400, "COMU_CATALOG_INVALID", "El producto excede el tamaño permitido.");
  return { sellerId: body.sellerId, requestId: body.requestId, product: body.product };
}
export async function readSellerCatalog(sellerId: string): Promise<CatalogSnapshot> {
  if (!uuid.test(sellerId)) throw new PosApiError(400, "COMU_CATALOG_INVALID", "Tienda inválida.");
  await requireSellerAccess(sellerId, ["OWNER", "ADMIN", "CATALOG_MANAGER"]);
  const auth = await createClient();
  const { data, error } = await auth.rpc("comu_catalog_read_v1", { p_seller: sellerId });
  if (error || !data) throw catalogError(error?.message);
  return data as CatalogSnapshot;
}
export async function saveSellerCatalog(value: unknown) {
  const body = validateCatalogCommand(value);
  await requireSellerAccess(body.sellerId, ["OWNER", "ADMIN", "CATALOG_MANAGER"]);
  const auth = await createClient();
  const { data, error } = await auth.rpc("comu_catalog_save_v1", { p_seller: body.sellerId, p_request: body.requestId, p_payload: body.product });
  if (error || !data) throw catalogError(error?.message);
  return data as { ok: true; productId: string; listingId: string };
}
function catalogError(message?: string) {
  if (message?.includes("COMU_SKU_MAX_80")) return new PosApiError(400, "COMU_SKU_MAX_80", "Los SKU nuevos o modificados admiten hasta 80 caracteres. Los existentes se conservan sin cambios.");
  if (message?.includes("COMU_ATTRIBUTE_UNDEFINED")) return new PosApiError(400, "COMU_ATTRIBUTE_UNDEFINED", "Configura la definición del atributo para esta marca antes de usarlo.");
  if (message?.includes("COMU_PRODUCT_CODE_INVALID")) return new PosApiError(400, "COMU_PRODUCT_CODE_INVALID", "Usa una clave de hasta 64 caracteres: letras, números, guion o guion bajo.");
  if (message?.includes("DENIED")) return new PosApiError(403, "COMU_CATALOG_DENIED", "No tienes acceso a este catálogo.");
  if (message?.includes("STALE")) return new PosApiError(409, "COMU_CATALOG_STALE", "El producto o stock cambió. Cierra el editor y vuelve a cargarlo antes de guardar.");
  if (message?.includes("RESERVED")) return new PosApiError(409, "COMU_STOCK_RESERVED", "La cantidad física no puede ser menor que la reservada.");
  if (message?.includes("SPECIALIZED")) return new PosApiError(409, "COMU_PRODUCT_SPECIALIZED", "Este tipo de producto requiere su editor especializado.");
  return new PosApiError(400, "COMU_CATALOG_SAVE_FAILED", "No se pudo guardar. Revisa variantes, SKU, precios, ubicación y cantidades; no se aplicaron cambios parciales.");
}
