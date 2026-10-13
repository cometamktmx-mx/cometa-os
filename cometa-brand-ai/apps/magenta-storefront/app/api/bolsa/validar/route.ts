import { publicStore } from "../../../../lib/public-store";
import { uuidPattern } from "../../../../../../packages/own-storefront/product-contract";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 1024) return reply({ error: "Selección inválida" }, 400);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Selección inválida" }, 400);
    const b = body as Record<string, unknown>;
    if (Object.keys(b).some(k => !["productId", "variantId", "quantity"].includes(k)) || typeof b.productId !== "string" || !uuidPattern.test(b.productId) || typeof b.variantId !== "string" || !uuidPattern.test(b.variantId) || !Number.isInteger(b.quantity) || Number(b.quantity) < 1 || Number(b.quantity) > 99) return reply({ error: "Selección inválida" }, 400);
    const store = publicStore();
    if (!store) return reply({ error: "No disponible" }, 503);
    const { data, error } = await store.client.rpc("brand_storefront_bag_validate_m5", { p_brand_slug: store.slug, p_product: b.productId, p_variant: b.variantId, p_quantity: b.quantity });
    if (error) return reply({ error: "No disponible" }, 503);
    if (!data) return reply({ error: "Producto o cantidad no disponible" }, 409);
    return reply(data);
  } catch { return reply({ error: "No se pudo validar la selección" }, 400); }
}
