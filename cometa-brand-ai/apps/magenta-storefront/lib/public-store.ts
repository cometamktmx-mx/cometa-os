import { createClient } from "@supabase/supabase-js";
export function publicStore() {
  const slug = process.env.STOREFRONT_BRAND_SLUG, url = process.env.STOREFRONT_SUPABASE_URL, key = process.env.STOREFRONT_SUPABASE_ANON_KEY;
  if (!slug || !url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
  return { slug, client, mediaBase: client.storage.from("pos-products").getPublicUrl("").data.publicUrl.replace(/\/?$/, "/") };
}
