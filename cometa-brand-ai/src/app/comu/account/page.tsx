import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/pos/server";

export default async function Account({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const context = (await searchParams).context;
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  let stores: Array<{ brand_slug: string; public_name: string }> = [];
  let unavailable = false;
  if (user) {
    if (context === "buyer") redirect("/comu/account/buyer");
    const { data, error } = await getAdminClient().from("comu_seller_memberships").select("comu_sellers(brand_slug,public_name)").eq("user_id", user.id).eq("active", true);
    unavailable = Boolean(error);
    stores = (data || []).flatMap(row => row.comu_sellers ? [row.comu_sellers as unknown as { brand_slug: string; public_name: string }] : []);
    const admin = getAdminClient();
    const { data: brands, error: brandsError } = await admin.from("user_brand_access").select("brand_slug").eq("user_id", user.id).eq("status", "active");
    unavailable ||= Boolean(brandsError);
    if (brands?.length) {
      const { data: brandStores, error: storesError } = await admin.from("comu_sellers").select("brand_slug,public_name").in("brand_slug", brands.map(row => row.brand_slug));
      unavailable ||= Boolean(storesError);
      stores = [...new Map([...stores, ...(brandStores || [])].map(store => [store.brand_slug, store])).values()];
    }
    if (context === "seller" && !unavailable) {
      if (stores.length === 1) redirect(`/brand/${encodeURIComponent(stores[0].brand_slug)}/comu`);
      if (!stores.length) redirect("/comu/sell");
    }
  }
  return <main className="mx-auto max-w-5xl px-5 py-16 md:py-24"><p className="comu-eyebrow">Tu espacio en COMU</p><h1 className="comu-title mt-5 max-w-xl">¿Qué quieres hacer en COMU?</h1><p className="mt-6 max-w-lg leading-7 text-[#72675e]">Una misma cuenta, dos formas de ser parte de nuestra comunidad.</p><div className="mt-14 grid gap-8 md:grid-cols-2">{[
    ["Comprar en COMU", "Consulta tus pedidos, favoritos, direcciones, pagos y recompensas.", user ? "/comu/account/buyer" : "/login?next=%2Fcomu%2Faccount%3Fcontext%3Dbuyer"],
    ["Vender en COMU", "Administra tu tienda, productos, pedidos y pagos.", user ? "/comu/account?context=seller" : "/login?next=%2Fcomu%2Faccount%3Fcontext%3Dseller"],
  ].map(([title, copy, href]) => <section key={title} className="border-t border-[#d9cfc4] pt-7"><h2 className="text-3xl font-semibold tracking-tight">{title}</h2><p className="mt-4 max-w-sm leading-7 text-[#72675e]">{copy}</p><Link href={href} className="comu-button mt-7">{title} →</Link></section>)}</div>{unavailable && <p role="alert" className="mt-8">No pudimos consultar tus tiendas. Inténtalo nuevamente.</p>}{user && stores.length > 1 && <nav aria-label="Elegir tienda" className="mt-10 space-y-3">{stores.map(store => <Link className="block underline underline-offset-4" key={store.brand_slug} href={`/brand/${encodeURIComponent(store.brand_slug)}/comu`}>{store.public_name} →</Link>)}</nav>}</main>;
}
