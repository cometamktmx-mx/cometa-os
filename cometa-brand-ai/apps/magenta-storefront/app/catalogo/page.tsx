import { StoreInformation } from '../../lib/store-information';
import { createClient } from "@supabase/supabase-js";
import {AtelierStore as StoreHome} from '../../lib/atelier-store';
import { parseAppearance } from "../../../../packages/own-storefront/contract";
import { Catalog } from "../../../../packages/own-storefront/catalog";
import { catalogQuery, defaultCatalog, type CatalogResult } from "../../../../packages/own-storefront/catalog-contract";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  const slug = process.env.STOREFRONT_BRAND_SLUG, url = process.env.STOREFRONT_SUPABASE_URL, key = process.env.STOREFRONT_SUPABASE_ANON_KEY;
  if (!slug || !url || !key) return <p>El catálogo no está disponible por el momento.</p>;
  const params = new URLSearchParams();
  for (const [k,v] of Object.entries(await searchParams)) if (typeof v === "string") params.set(k,v);
  const query = catalogQuery(params);
  const client = createClient(url,key,{ auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:"no-store"})} });
  const result = await client.rpc("brand_storefront_catalog_m4", { p_brand_slug: slug, p_query: {...query,sort:params.has("sort") ? query.sort : null} });
  if (result.error) throw Error("No se pudo consultar el catálogo. Intenta de nuevo.");
  if (!result.data) return <p>El catálogo no está disponible por el momento.</p>;
  const appearance = parseAppearance(result.data.appearance,slug), config = appearance.catalog ?? defaultCatalog();
  const data: CatalogResult = result.data;
  const mediaBase = client.storage.from("pos-products").getPublicUrl("").data.publicUrl.replace(/\/?$/, "/");
  return <StoreHome footerContent={<StoreInformation/>} appearance={appearance} products={[]} mediaBase={mediaBase}><Catalog mediaLayout={appearance.mediaLayout} data={data} query={catalogQuery(params,config.sort)} config={config} mediaBase={mediaBase} /></StoreHome>;
}
