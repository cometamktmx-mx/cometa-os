import { StoreInformation } from '../lib/store-information';
import { createClient } from "@supabase/supabase-js";
import {AtelierStore as StoreHome} from '../lib/atelier-store';
import { parseAppearance, type ProductCard } from "../../../packages/own-storefront/contract";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function Page() {
  // Deployment binding is server-owned. Host headers/query parameters cannot switch tenant.
  const slug = process.env.STOREFRONT_BRAND_SLUG;
  const url = process.env.STOREFRONT_SUPABASE_URL;
  const key = process.env.STOREFRONT_SUPABASE_ANON_KEY;
  if (!slug || !url || !key) return <p>Esta tienda aún no está disponible.</p>;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
  const { data, error } = await client.rpc("brand_storefront_home_m3", { p_brand_slug: slug });
  if (error || !data) return <p>Esta tienda no está disponible por el momento.</p>;
  let appearance;
  try { appearance = parseAppearance(data.appearance, slug); } catch { return <p>Esta tienda no está disponible por el momento.</p>; }
  const products: ProductCard[] = Array.isArray(data.products) ? data.products : [];
  const mediaBase = client.storage.from("pos-products").getPublicUrl("").data.publicUrl.replace(/\/?$/, "/");
  return <StoreHome footerContent={<StoreInformation/>} appearance={appearance} products={products} mediaBase={mediaBase} />;
}
