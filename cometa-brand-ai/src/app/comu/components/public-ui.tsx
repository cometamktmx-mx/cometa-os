import Link from "next/link";

export type PublicListing = {
  id: string;
  public_slug: string;
  title_override: string | null;
  description_override?: string | null;
  wholesale_enabled: boolean;
  retail_price_override?: number | null;
  seller?: { slug: string; public_name: string; logo_url?: string | null; cover_url?: string | null; city?: string | null; state?: string | null };
  product?: { name: string; description?: string | null; image_url?: string | null };
  media?: Array<{ public_url: string; is_primary?: boolean }>;
  variants?: Array<{ productVariant?: { price?: number | null } }>;
};

export function SectionHeading({ eyebrow, title, href, link = "Ver selección" }: { eyebrow: string; title: string; href?: string; link?: string }) {
  return <div className="flex items-end justify-between gap-5"><div><p className="text-[11px] font-black uppercase tracking-[.24em] text-[#8b7564]">{eyebrow}</p><h2 className="mt-3 text-3xl font-black tracking-[-.06em] text-[#19201c] md:text-4xl">{title}</h2></div>{href ? <Link href={href} className="shrink-0 text-sm font-bold text-[#5b4a3e] underline decoration-[#c7a98c] underline-offset-4">{link}</Link> : null}</div>;
}

export function ProductCard({ listing, featured = false }: { listing: PublicListing; featured?: boolean }) {
  const image = listing.media?.find((item) => item.is_primary)?.public_url || listing.product?.image_url;
  const price = listing.retail_price_override ?? listing.variants?.[0]?.productVariant?.price;
  return <Link href={`/comu/products/${listing.public_slug}`} className={`group block ${featured ? "md:col-span-2" : ""}`}><div className={`relative overflow-hidden rounded-[1.6rem] bg-[#ebe7e1] ${featured ? "aspect-[1.35/1]" : "aspect-[.82/1]"}`}>{image ? <img src={image} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" /> : <div className="flex h-full items-end bg-[linear-gradient(145deg,#ded6cb,#f3eee7)] p-5"><span className="max-w-[10rem] text-2xl font-black leading-none text-[#625449]">Una pieza para descubrir.</span></div>}{listing.wholesale_enabled ? <span className="absolute left-4 top-4 rounded-full bg-[#f6f0e7]/95 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.14em] text-[#5f4938]">Mayoreo</span> : null}<span aria-label="Guardar en favoritos" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-[#fffdf9]/90 text-lg text-[#5f4938] transition group-hover:scale-110">♡</span></div><div className="px-1 pt-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#8b7564]">{listing.seller?.public_name || "Selección COMU"}</p><h3 className="mt-1 font-black tracking-[-.02em] text-[#19201c]">{listing.title_override || listing.product?.name || "Producto COMU"}</h3></div>{price !== null && price !== undefined ? <p className="shrink-0 text-sm font-black text-[#5b4a3e]">${Number(price).toFixed(2)}</p> : null}</div><p className="mt-2 text-xs text-[#8a827a]">{listing.seller?.city || "Vendedor verificado"}</p></div></Link>;
}

export function SellerCard({ seller }: { seller: NonNullable<PublicListing["seller"]> }) {
  return <Link href={`/comu/sellers/${seller.slug}`} className="group relative overflow-hidden rounded-[1.7rem] bg-[#252d28] p-6 text-[#f5f0e9] transition hover:-translate-y-1"><div className="absolute inset-0 opacity-40 transition duration-500 group-hover:scale-105 group-hover:opacity-55">{seller.cover_url ? <img src={seller.cover_url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-[linear-gradient(135deg,#38463e,#b08f72)]" />}</div><div className="relative flex min-h-56 flex-col justify-between"><div className="flex items-center justify-between"><span className="rounded-full border border-white/25 bg-black/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em]">Verificada</span><span className="text-xl">↗</span></div><div><h3 className="text-2xl font-black tracking-[-.04em]">{seller.public_name}</h3><p className="mt-1 text-sm text-white/70">{seller.city || seller.state || "Comunidad COMU"}</p></div></div></Link>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="rounded-[1.8rem] border border-dashed border-[#cfc4b8] bg-[#f5f0e9] px-6 py-14 text-center"><p className="text-xl font-black tracking-[-.03em] text-[#3b3028]">{title}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#81766c]">{body}</p></div>;
}

export function ModeSwitch({ mode }: { mode?: string }) {
  return <div className="inline-flex rounded-full border border-[#d9cfc4] bg-[#fffdf9] p-1 shadow-sm"><Link href="/comu?mode=retail" className={`rounded-full px-4 py-2 text-sm font-bold transition ${mode === "wholesale" ? "text-[#776b61]" : "bg-[#252d28] text-white shadow-sm"}`}>Comprar para mí</Link><Link href="/comu?mode=wholesale" className={`rounded-full px-4 py-2 text-sm font-bold transition ${mode === "wholesale" ? "bg-[#252d28] text-white shadow-sm" : "text-[#776b61]"}`}>Para mi negocio</Link></div>;
}

export function PlaceholderProduct({ name, tone, detail }: { name: string; tone: "sand" | "olive" | "clay" | "ink"; detail: string }) {
  const tones = { sand: "bg-[#d8c5b1] text-[#58463a]", olive: "bg-[#dfe4d9] text-[#3e5545]", clay: "bg-[#cda99a] text-[#593d37]", ink: "bg-[#2d3731] text-[#f5eee4]" };
  return <Link href="/comu/search" className="group block"><div className={`relative aspect-[.82/1] overflow-hidden rounded-[1.6rem] ${tones[tone]}`}><div className="absolute -right-8 top-8 h-40 w-28 rotate-12 rounded-[5rem] border border-current/20 transition duration-700 group-hover:rotate-6 group-hover:scale-110" /><div className="absolute bottom-5 left-5 right-5"><p className="text-[10px] font-black uppercase tracking-[.18em] opacity-65">Selección en preparación</p><p className="mt-3 text-2xl font-black leading-none tracking-[-.05em]">{name}</p></div></div><p className="mt-3 text-xs font-bold uppercase tracking-[.12em] text-[#8b7564]">{detail}</p></Link>;
}

export function EditorialCard({ eyebrow, title, tone, href = "/comu/search" }: { eyebrow: string; title: string; tone: "sand" | "olive" | "clay"; href?: string }) {
  const tones = { sand: "bg-[#d8c5b1] text-[#58463a]", olive: "bg-[#dfe4d9] text-[#3e5545]", clay: "bg-[#cda99a] text-[#593d37]" };
  return <Link href={href} className={`group relative min-h-64 overflow-hidden rounded-[1.7rem] p-6 ${tones[tone]}`}><div className="absolute -right-10 -top-8 h-48 w-36 rotate-12 rounded-[6rem] border border-current/20 transition duration-700 group-hover:rotate-3 group-hover:scale-110" /><div className="relative flex h-full flex-col justify-between"><p className="text-[10px] font-black uppercase tracking-[.2em] opacity-65">{eyebrow}</p><div><h3 className="max-w-xs text-2xl font-black leading-[.95] tracking-[-.05em]">{title}</h3><span className="mt-5 inline-flex text-sm font-bold">Leer historia ↗</span></div></div></Link>;
}
