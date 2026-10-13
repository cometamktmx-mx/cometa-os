import { notFound } from "next/navigation";
import { publicStore } from "../../../lib/public-store";
import { StoreHome } from "../../../../../packages/own-storefront/home";
import { parseAppearance } from "../../../../../packages/own-storefront/contract";
import { ProductDetail } from "../../../../../packages/own-storefront/product";
import { uuidPattern, type PublicProduct } from "../../../../../packages/own-storefront/product-contract";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function Page({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { productId } = await params;
  if (!uuidPattern.test(productId)) notFound();
  const store = publicStore();
  if (!store) throw Error("La tienda no está disponible por el momento.");
  const { data, error } = await store.client.rpc("brand_storefront_product_m5", { p_brand_slug: store.slug, p_product: productId });
  if (error) throw Error("No se pudo consultar el producto.");
  if (!data) notFound();
  const appearance = parseAppearance(data.appearance, store.slug), product: PublicProduct = data.product, query = await searchParams;
  const fromColor = typeof query.color === "string" ? product.content.colors.find(c => c.id === query.color) : undefined;
  const fromCatalog = !query.variant && fromColor ? product.variants.find(v => fromColor.variantIds.includes(v.id) && (typeof query.size !== "string" || (v.options.size ?? v.options.talla ?? "").toLowerCase() === query.size.toLowerCase()))?.id ?? "" : "";
  return <StoreHome appearance={appearance} products={[]} mediaBase={store.mediaBase}><ProductDetail key={product.id} product={product} config={appearance.product} mediaBase={store.mediaBase} initialVariant={typeof query.variant === "string" ? query.variant : fromCatalog} initialColor={typeof query.color === "string" ? query.color : ""} /></StoreHome>;
}
