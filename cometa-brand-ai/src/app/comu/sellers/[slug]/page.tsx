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
  const accent = safeAccent(theme.accentColor);
  const accentText = contrastText(accent);
  const logoUrl = storefront?.logo_url || seller.logo_url;
  const coverUrl = storefront?.cover_url || seller.cover_url;
  const location = theme.showLocation === false ? null : [seller.city, seller.state, theme.address].filter(Boolean).join(" · ");
  const whatsapp = theme.whatsapp?.replace(/\D/g, "");
  const mapQuery = location ? encodeURIComponent(location) : "";
  const modes = ["Menudeo", ...(listings.some((listing) => listing.wholesale_enabled) ? ["Mayoreo"] : [])];

  return <main className="mx-auto max-w-7xl px-5 py-8 md:py-12">
    <section className="overflow-hidden rounded-[2rem] border border-[#d9cfc4] bg-[#fffdf9] shadow-[0_24px_70px_rgba(72,55,40,.08)]">
      <div className="grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_minmax(19rem,.82fr)] md:p-10">
        <div className="flex min-w-0 flex-col justify-center">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#e2eadf] text-2xl font-black" style={{ color: accent }}>
              {logoUrl ? <img src={logoUrl} alt={`Logo de ${seller.public_name}`} className="h-full w-full object-contain p-2" /> : seller.public_name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[.2em]" style={{ color: accent }}>Vendedor verificado ✓</p><h1 className="mt-1 truncate text-4xl font-black tracking-[-.07em] text-[#19201c] md:text-5xl">{seller.public_name}</h1></div>
          </div>
          <p className="mt-7 max-w-2xl text-xl font-semibold leading-8 text-[#5b4a3e]">{storefront?.headline || "Una selección hecha con intención."}</p>
          <p className="mt-3 max-w-2xl leading-7 text-[#776b61]">{storefront?.description || "Descubre piezas seleccionadas por este seller en COMU."}</p>
          <div className="mt-5 flex flex-wrap gap-2">{modes.map((mode) => <span key={mode} className="rounded-full px-3 py-1.5 text-xs font-black" style={{ backgroundColor: `${accent}20`, color: accent }}>{mode}</span>)}{location ? <span className="rounded-full bg-[#f3eee7] px-3 py-1.5 text-xs font-semibold text-[#6d5b4e]">{location}</span> : null}</div>
          <div className="mt-7 flex flex-wrap gap-3">{whatsapp ? <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="rounded-full px-5 py-3 text-sm font-black transition hover:opacity-90" style={{ backgroundColor: accent, color: accentText }}>WhatsApp</a> : null}{mapQuery ? <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer" className="rounded-full border px-5 py-3 text-sm font-black text-[#5b4a3e] transition hover:bg-[#f3eee7]" style={{ borderColor: `${accent}66` }}>Cómo llegar</a> : null}</div>
        </div>
        <div className="relative aspect-[16/10] overflow-hidden rounded-[1.6rem] bg-[#252d28] md:aspect-[16/7] md:min-h-0">{coverUrl ? <img src={coverUrl} alt={`Portada de ${seller.public_name}`} className="absolute inset-0 h-full w-full object-cover object-center" /> : <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_18%,rgba(160,225,179,.32),transparent_34%),linear-gradient(135deg,#38463e,#b08f72)]" />}<div className="absolute inset-0 bg-gradient-to-t from-[#19201c]/55 via-transparent to-white/5" /></div>
      </div>
    </section>
    <section className="py-14"><div className="border-b border-[#d9cfc4] pb-4"><div className="flex flex-wrap items-end justify-between gap-4"><SectionHeading eyebrow="Productos" title={pieceLabel(listings.length)} /><nav className="flex items-center gap-5 text-sm font-bold text-[#6d5b4e]" aria-label="Secciones de la tienda"><a href="#productos" className="border-b-2 pb-2" style={{ borderColor: accent, color: accent }}>Productos</a>{modes.includes("Mayoreo") ? <a href="#mayoreo" className="pb-2 transition hover:text-[#3f5b44]">Mayoreo</a> : null}<a href="#informacion" className="pb-2 transition hover:text-[#3f5b44]">Información</a></nav></div></div>{listings.length ? <div id="productos" className="mt-8 grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">{listings.map((listing) => <ProductCard key={listing.id} listing={listing} />)}</div> : <div className="mt-8"><EmptyState title="Esta tienda está preparando su catálogo." body="Las primeras piezas aparecerán cuando la selección esté lista para COMU." /></div>}</section>
  </main>;
}

function safeAccent(value?: string) { return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : "#3F5B44"; }
function contrastText(hex: string) { const value = hex.slice(1); const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255); const luminance = [r, g, b].map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4); return .2126 * luminance[0] + .7152 * luminance[1] + .0722 * luminance[2] > .45 ? "#142019" : "#FFFFFF"; }
function pieceLabel(count: number) { return count === 0 ? "Productos por descubrir" : `${count} ${count === 1 ? "pieza" : "piezas"} para descubrir`; }
