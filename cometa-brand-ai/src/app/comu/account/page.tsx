import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveComuAccountAccess } from "@/lib/comu/account-access";

export default async function Account({ searchParams }: { searchParams: Promise<{ context?: string }> }) {
  const context = (await searchParams).context;
  const access = await resolveComuAccountAccess();
  const user = access?.userId;
  if (access) {
    if (context === "buyer") redirect("/comu/account/buyer");
    if (context === "seller" && access.stores.length === 1) redirect("/comu/seller/" + encodeURIComponent(access.stores[0].brand_slug) + "/summary");
    if (!access.stores.length && !access.isAdmin && context !== "seller") redirect("/comu/account/buyer");
    if (!access.hasBuyerAccount && access.stores.length === 1 && !access.isAdmin && !context) redirect("/comu/seller/" + encodeURIComponent(access.stores[0].brand_slug) + "/summary");
    return <main className="mx-auto max-w-5xl space-y-8 px-5 py-10">
      <h1 className="text-3xl font-semibold">Tu cuenta COMU</h1>
      <section aria-labelledby="buyer-access"><h2 id="buyer-access" className="text-xl font-semibold">Mi cuenta</h2>
        <nav aria-label="Mi cuenta" className="mt-4 flex flex-wrap gap-5">
          {[["Mis pedidos", "Mis pedidos"], ["Favoritos", "Favoritos"], ["Puntos", "Puntos y recompensas"], ["Perfil", "Perfil"]].map(([label, section]) => <Link key={label} className="py-2 underline" href={"/comu/account/buyer?section=" + encodeURIComponent(section)}>{label}</Link>)}
        </nav>
      </section>
      <section aria-labelledby="seller-access"><h2 id="seller-access" className="text-xl font-semibold">Mi negocio</h2>
        <ul className="mt-4 space-y-5">{access.stores.map(store => <li key={store.id}>
          <p className="font-semibold">{store.public_name}</p><p className="text-sm">{store.status === "PREPARING" ? "Tu tienda está en preparación." : store.status}</p>
          <Link className="inline-block py-3 underline" href={"/comu/seller/" + encodeURIComponent(store.brand_slug) + "/summary"}>Administrar tienda →</Link>
        </li>)}</ul>
        {!access.stores.length && <p className="mt-3">No tienes tiendas autorizadas. <Link className="underline" href="/comu/sell">Solicitar acceso seller</Link></p>}
      </section>
      {access.isAdmin && <Link className="inline-block py-3 underline" href="/brand/admin/comu">Administrar COMU</Link>}
    </main>;
  }
  return <main className="mx-auto max-w-5xl px-5 py-16 md:py-24"><p className="comu-eyebrow">Tu espacio en COMU</p><h1 className="comu-title mt-5 max-w-xl">¿Qué quieres hacer en COMU?</h1><p className="mt-6 max-w-lg leading-7 text-[#72675e]">Una misma cuenta, dos formas de ser parte de nuestra comunidad.</p><div className="mt-14 grid gap-8 md:grid-cols-2">{[
    ["Comprar en COMU", "Consulta tus pedidos, favoritos, direcciones, pagos y recompensas.", user ? "/comu/account/buyer" : "/comu/login?next=%2Fcomu%2Faccount%3Fcontext%3Dbuyer"],
    ["Vender en COMU", "Administra tu tienda, productos, pedidos y pagos.", user ? "/comu/account?context=seller" : "/comu/login?next=%2Fcomu%2Faccount%3Fcontext%3Dseller"],
  ].map(([title, copy, href]) => <section key={title} className="border-t border-[#d9cfc4] pt-7"><h2 className="text-3xl font-semibold tracking-tight">{title}</h2><p className="mt-4 max-w-sm leading-7 text-[#72675e]">{copy}</p><Link href={href} className="comu-button mt-7">{title} →</Link></section>)}</div></main>;
}
