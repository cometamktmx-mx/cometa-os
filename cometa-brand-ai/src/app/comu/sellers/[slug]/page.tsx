import { notFound } from "next/navigation";
import { getPublicCatalog } from "@/lib/comu/public-catalog";
import { isComuFeatureEnabled } from "@/lib/comu/features";
import { EmptyState, ProductCard, SectionHeading, type PublicListing } from "../../components/public-ui";

type StoreTheme = { whatsapp?: string; address?: string; showLocation?: boolean; accentColor?: string };

export default async function ComuSeller({ params }: { params: Promise<{ slug: string }> }) {
  if (!isComuFeatureEnabled("enabled") || !isComuFeatureEnabled("catalog")) notFound();
  const slug = (await params).slug;
  const listings = (await getPublicCatalog()).filter((item) => item.seller?.slug === slug) as PublicListing[];
  const seller = listings[0]?.seller;
  const storefront = listings[0]?.storefront;
  if (!seller) return <main className="mx-auto max-w-5xl px-5 py-28"><EmptyState title="Esta tienda todavía no está disponible." body="Estamos preparando esta selección para COMU." /></main>;
  const theme = (storefront?.theme_config || {}) as StoreTheme;
  const accent = /^#[0-9A-Fa-f]{6}$/.test(theme.accentColor || "") ? theme.accentColor as string : "#3f5b44";
  const logoUrl = storefront?.logo_url || seller.logo_url;
  const coverUrl = storefront?.cover_url || seller.cover_url;
  const location = theme.showLocation === false ? null : [seller.city, seller.state, theme.address].filter(Boolean).join(", ");
  const whatsapp = theme.whatsapp?.replace(/\D/g, "");
  const modes = ["Menudeo", ...(listings.some((listing) => listing.wholesale_enabled) ? ["Mayoreo"] : [])];
  return <main className="mx-auto max-w-7xl px-5 py-8 md:py-12"><section className="grid gap-8 rounded-[2rem] border border-[#d9cfc4] bg-[#fffdf9] p-6 md:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] md:p-10"><div><div className="flex items-center gap-4">{logoUrl ? <img src={logoUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#e2eadf] text-2xl font-black" style={{ color: accent }}>{seller.public_name.slice(0, 1)}</div>}<div><p className="text-[11px] font-black uppercase tracking-[.2em]" style={{ color: accent }}>Vendedor verificado ✓</p><h1 className="mt-1 text-4xl font-black tracking-[-.07em] text-[#19201c] md:text-5xl">{seller.public_name}</h1></div></div><p className="mt-7 max-w-2xl text-xl font-semibold leading-8 text-[#5b4a3e]">{storefront?.headline || "Una selección hecha con intención."}</p><p className="mt-3 max-w-2xl leading-7 text-[#776b61]">{storefront?.description || "Descubre piezas seleccionadas por este seller en COMU."}</p><div className="mt-5 flex flex-wrap gap-2">{modes.map((mode) => <span key={mode} className="rounded-full px-3 py-1.5 text-xs font-black" style={{ backgroundColor: `${accent}22`, color: accent }}>{mode}</span>)}{location ? <span className="rounded-full bg-[#f3eee7] px-3 py-1.5 text-xs font-semibold text-[#6d5b4e]">{location}</span> : null}</div><div className="mt-7 flex flex-wrap gap-3">{whatsapp ? <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="rounded-full px-5 py-3 text-sm font-black text-white" style={{ backgroundColor: accent }}>WhatsApp</a> : null}{theme.showLocation !== false && location ? <span className="rounded-full border px-5 py-3 text-sm font-black text-[#5b4a3e]" style={{ borderColor: `${accent}66` }}>Cómo llegar</span> : null}</div></div><div className="relative min-h-56 overflow-hidden rounded-[1.6rem] bg-[#252d28]">{coverUrl ? <img src={coverUrl} alt="" className="h-full w-full object-cover opacity-80" /> : <div className="h-full w-full bg-[linear-gradient(135deg,#38463e,#b08f72)]" />}<p className="absolute bottom-5 left-5 right-5 text-2xl font-black leading-none text-white">Moda real. Más tuya.</p></div></section><section className="py-14"><div className="flex flex-wrap items-end justify-between gap-4"><SectionHeading eyebrow="Productos" title={`${listings.length} piezas para descubrir`} /><div className="flex gap-4 text-sm font-bold text-[#6d5b4e]"><span>Productos</span>{modes.includes("Mayoreo") ? <span>Mayoreo</span> : null}<span>Información</span></div></div>{listings.length ? <div className="mt-8 grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">{listings.map((listing) => <ProductCard key={listing.id} listing={listing} />)}</div> : <div className="mt-8"><EmptyState title="Esta tienda está preparando su catálogo." body="Las primeras piezas aparecerán cuando la selección esté lista para COMU." /></div>}</section></main>;
}
