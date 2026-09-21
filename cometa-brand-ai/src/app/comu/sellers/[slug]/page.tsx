import Link from "next/link";
import { getPublicCatalog } from "@/lib/comu/public-catalog";
import { isComuFeatureEnabled } from "@/lib/comu/features";
import { EmptyState, ProductCard, SectionHeading, type PublicListing } from "../../components/public-ui";
import { notFound } from "next/navigation";

export default async function ComuSeller({ params }: { params: Promise<{ slug: string }> }) {
  if (!isComuFeatureEnabled("enabled") || !isComuFeatureEnabled("catalog")) notFound();
  const slug = (await params).slug; const listings = (await getPublicCatalog()).filter((item) => item.seller?.slug === slug) as PublicListing[]; const seller = listings[0]?.seller;
  if (!seller) return <main className="mx-auto max-w-5xl px-5 py-28"><EmptyState title="Esta tienda todavía no está disponible." body="Estamos verificando la selección de COMU. Vuelve pronto para descubrir nuevas piezas." /></main>;
  return <main><section className="mx-auto max-w-7xl px-5 pt-10"><div className="relative overflow-hidden rounded-[2.3rem] bg-[#252d28] p-8 text-white md:min-h-[25rem] md:p-14">{seller.cover_url ? <img src={seller.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" /> : <div className="absolute inset-0 bg-[linear-gradient(125deg,#252d28,#8b6d55)] opacity-90" />}<div className="relative flex h-full min-h-[18rem] flex-col justify-between"><div><Link href="/comu/search" className="text-sm font-bold text-white/65 hover:text-white">← Volver a explorar</Link><p className="mt-14 text-[11px] font-black uppercase tracking-[.24em] text-[#e2c7a9]">Seller verificado</p></div><div><h1 className="mt-4 max-w-2xl text-5xl font-black tracking-[-.08em] md:text-7xl">{seller.public_name}</h1><p className="mt-3 text-white/70">{seller.city || seller.state || "Parte de la comunidad COMU"}</p></div></div></div></section><section className="mx-auto max-w-7xl px-5 py-20"><SectionHeading eyebrow="Su selección" title={`${listings.length} piezas para descubrir`} />{listings.length ? <div className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">{listings.map((listing) => <ProductCard key={listing.id} listing={listing} />)}</div> : <div className="mt-8"><EmptyState title="Esta tienda está preparando su catálogo." body="Las primeras piezas aparecerán cuando la selección esté lista para COMU." /></div>}</section></main>;
}
