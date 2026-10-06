import Link from "next/link";
import Image from "next/image";
import { AccountIcon } from "./buyer/account-icon";
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
          {[["Mis pedidos", "Mis pedidos"], ["Favoritos", "Favoritos"], ["Puntos", "Puntos y recompensas"], ["Perfil", "Mis datos"]].map(([label, section]) => <Link key={label} className="py-2 underline" href={"/comu/account/buyer?section=" + encodeURIComponent(section)}>{label}</Link>)}
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
  // Assign approved local lifestyle assets here when available; no stock URLs.
  const paths: Array<{ eyebrow: string; title: string; description: string; benefits: Array<[string, string]>; cta: string; href: string; image: string | null }> = [
    { eyebrow: "Quiero comprar", title: "Comprar", description: "Descubre productos, guarda tus favoritos, realiza pedidos y obtén beneficios por comprar.", benefits: [["Mis pedidos", "Productos únicos"], ["Favoritos", "Guarda tus favoritos"], ["Direcciones", "Envíos a toda la región"], ["Puntos y recompensas", "Puntos y recompensas"]], cta: "Explorar como comprador", href: user ? "/comu/account/buyer" : "/comu/login?next=%2Fcomu%2Faccount%2Fbuyer", image: null },
    { eyebrow: "Quiero vender", title: "Vender", description: "Crea tu tienda, publica tus productos y empieza a vender a nuevos clientes.", benefits: [["Resumen", "Tu propia tienda"], ["Mis pedidos", "Publica tus productos"], ["Puntos y recompensas", "Aumenta tus ventas"], ["Mis datos", "Llega a más clientes"]], cta: "Comenzar a vender", href: user ? "/comu/account?context=seller" : "/comu/login?next=%2Fcomu%2Faccount%3Fcontext%3Dseller", image: null },
  ];
  return <main className="mx-auto max-w-7xl px-5 pb-10 pt-10 md:px-8 md:pt-14">
    <header className="mx-auto max-w-3xl text-center">
      <p className="comu-eyebrow">Tu espacio en COMU</p>
      <h1 className="mt-5 font-serif text-[2.4rem] font-normal leading-[1.08] tracking-[-.035em] text-[#252d28] md:text-6xl">¿Cómo quieres ser parte de COMU?</h1>
      <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#72675e] md:text-base">Compra lo que te encanta o lleva tu negocio a una nueva forma de vender.</p>
    </header>
    <div className="mt-9 grid gap-5 md:mt-12 md:grid-cols-2 md:gap-7">
      {paths.map(({ eyebrow, title, description, benefits, cta, href, image }) => <section key={title} className="relative flex min-w-0 flex-col overflow-hidden rounded-[1.7rem] bg-[#eee6db] md:rounded-[2rem]">
        {image && <div className="relative aspect-[1.7] w-full md:absolute md:inset-y-0 md:right-0 md:aspect-auto md:w-[44%]"><Image src={image} alt="" fill sizes="(max-width: 767px) 90vw, 25vw" className="object-cover" /></div>}
        <div className={image ? "relative flex h-full flex-col p-7 md:w-[56%] md:p-9" : "relative flex h-full flex-col p-7 md:p-10 lg:p-12"}>
          <p className="comu-eyebrow">{eyebrow}</p>
          <h2 className="mt-6 font-serif text-5xl font-normal leading-[.98] tracking-[-.04em] md:text-[3.7rem]">{title}<br /><span className="text-[#756652]">en COMU</span></h2>
          <p className="mt-6 max-w-sm text-sm leading-7 text-[#625b52]">{description}</p>
          <ul className="mb-8 mt-7 grid grid-cols-2 gap-x-4 gap-y-5">{benefits.map(([icon, text]) => <li key={text} className="flex items-start gap-2.5 text-xs leading-5 text-[#625b52]"><span className="mt-0.5 shrink-0 text-[#8b7564]"><AccountIcon name={icon} /></span><span>{text}</span></li>)}</ul>
          <Link href={href} className="comu-button mt-auto min-h-12 w-full gap-3 md:w-fit">{cta}<span aria-hidden="true">→</span></Link>
        </div>
      </section>)}
    </div>
    <section className="mt-12 border-t border-[#d9cfc4]/70 pt-8 md:mt-14">
      <h2 className="text-center text-[10px] font-semibold uppercase tracking-[.2em] text-[#8b7564]">Una comunidad que impulsa tu estilo y tu negocio</h2>
      <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-9">
        {[
          ["Moda accesible", "Tendencias y productos de la región."],
          ["Comunidad local", "Hecho por y para nuestra comunidad."],
          ["Compras seguras", "Métodos de pago confiables y protección en tus pedidos."],
          ["Negocios que crecen", "Herramientas para impulsar negocios de la industria textil."],
        ].map(([title, description]) => <div key={title}><h3 className="font-serif text-lg">{title}</h3><p className="mt-2 text-xs leading-6 text-[#72675e]">{description}</p></div>)}
      </div>
    </section>
  </main>;
}
