import Link from "next/link";
import { getPublicCatalog } from "@/lib/comu/public-catalog";
import { isComuFeatureEnabled } from "@/lib/comu/features";
import { ProductCard, type PublicListing } from "./components/public-ui";
import { HomeImage } from "./components/home-image";
import "./home.css";

const categories = [
  ["Moda", "moda", "ropa"], ["Accesorios", "accesorios", "accesorios"],
  ["Calzado", "calzado", "calzado"], ["Hogar", "hogar", "hogar"],
  ["Belleza", "belleza", "belleza"], ["Deportes", "deportes", "deportes"],
  ["Mascotas", "mascotas", "mascotas"], ["Lifestyle", "lifestyle", "lifestyle"],
];
const benefits = ["Envíos a todo México", "Pagos seguros", "Marcas verificadas", "Compra menudeo o mayoreo"];
const trust = [
  ["M3 6h11v12H3z M14 10h4l3 4v4h-7 M7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M17 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4", "Envíos a todo México", "Rápidos y confiables."],
  ["M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3", "Pagos seguros", "Tu información protegida."],
  ["M4 7h16v14H4z M8 7V5a4 4 0 0 1 8 0v2", "Compra menudeo o mayoreo", "Tú eliges cómo comprar."],
  ["M4 13v-1a8 8 0 0 1 16 0v1 M4 12H2v7h4v-7z M20 12h2v7h-4v-7z M20 19v2h-6", "Soporte personalizado", "Estamos para ayudarte."],
];
function Heading({ title, description, href }: { title: string; description: string; href?: string }) {
  return <div className="home-heading"><div><h2>{title}</h2><p>{description}</p></div>{href && <Link className="home-text-link" href={href}>Ver todo <span aria-hidden="true">↗</span></Link>}</div>;
}

export default async function ComuHome({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  const enabled = isComuFeatureEnabled("enabled") && isComuFeatureEnabled("catalog");
  const publicRows = enabled ? await getPublicCatalog() : [];
  const catalog: PublicListing[] = publicRows;
  const listings = catalog.filter(row => mode !== "wholesale" || row.wholesale_enabled);
  const sellers = [...new Map(catalog.flatMap(row => row.seller ? [[row.seller.slug, row.seller] as const] : [])).values()];
  const fashion = "/comu/auth/buyer-login.jpg";
  const textile = "/comu/auth/buyer-register.jpg";
  return <main className="comu-home">
    <section className="home-hero" aria-labelledby="home-title">
      <HomeImage name="hero" fallback={fashion} priority />
      <div className="home-hero-shade" />
      <div className="home-hero-copy"><p className="home-kicker">MODA MEXICANA, TALENTO REAL</p>
        <h1 id="home-title">Lo nuevo,<br />lo que te hace <em>tú.</em></h1>
        <p className="home-lead">Descubre marcas independientes, piezas únicas<br className="home-desktop-break" /> y moda hecha en México.</p>
        <div className="home-actions"><Link className="home-button home-button-light" href="/comu/search">Explorar productos <span aria-hidden="true">→</span></Link><Link className="home-button home-button-outline" href="/comu/search?mode=wholesale">Para tu negocio</Link></div>
        <ul className="home-benefits">{benefits.map(text => <li key={text}><span aria-hidden="true">✓</span>{text}</li>)}</ul>
      </div>
      <span className="home-hero-caption" aria-hidden="true">COMU / UNA FORMA MÁS TUYA</span>
    </section>

    <nav className="home-categories home-container" aria-label="Explorar categorías">{categories.map(([label, slug, query], i) => <Link href={`/comu/search?q=${encodeURIComponent(query)}`} key={slug} className="home-category"><div className="home-category-image"><span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><HomeImage name={`category-${slug}`} /></div><span>{label}<span aria-hidden="true">↗</span></span></Link>)}</nav>

    <section className="home-container home-section" aria-label="Nuevos lanzamientos"><Heading title="Nuevos lanzamientos" description="Descubre lo más reciente de nuestras marcas." href="/comu/search" />
      {listings.length ? <div className="home-products">{listings.slice(0, 8).map(listing => <ProductCard key={listing.id} listing={listing} />)}</div> : <div className="home-empty"><span className="home-kicker">EL PRÓXIMO DESCUBRIMIENTO</span><h3>Nuevas piezas están por llegar.</h3><Link className="home-text-link" href="/comu/search">Explorar COMU <span aria-hidden="true">→</span></Link></div>}
    </section>

    <section className="home-container home-duo home-section" aria-label="Descubre COMU">
      <article className="home-banner home-wholesale"><HomeImage name="mayoreo" fallback={textile} /><div className="home-banner-shade" /><div className="home-banner-copy"><p className="home-kicker">PARA TU NEGOCIO</p><h2>Mayoreo<br />en COMU</h2><p>Mejores precios, más oportunidades.<br />Conecta directo con fabricantes locales.</p><Link className="home-button home-button-light" href="/comu/search?mode=wholesale">Explorar mayoreo →</Link></div></article>
      <article className="home-banner home-verified"><HomeImage name="verified" fallback={fashion} /><div className="home-banner-shade" /><div className="home-banner-copy"><p className="home-kicker">TALENTO CON IDENTIDAD</p><h2>Marcas<br />verificadas</h2><p>Compra con confianza. Todas nuestras marcas pasan por un proceso de verificación.</p><Link className="home-button home-button-light" href="#comu-brands">Conoce más →</Link></div></article>
    </section>

    <section className="home-container home-bestsellers home-section" aria-label="Favoritos y oportunidades"><div><Heading title="Lo más vendido" description="Las piezas favoritas de nuestra comunidad." /><div className="home-empty home-empty-best"><span className="home-kicker">LO QUE VAS A QUERER DESCUBRIR</span><h3>Los próximos favoritos<br />se encuentran aquí.</h3><p>Pronto conocerás las piezas más elegidas.</p><Link className="home-text-link" href="/comu/search">Descubre el catálogo →</Link></div></div>
      <aside className="home-offers" id="comu-offers"><HomeImage name="offers" /><div className="home-banner-shade" /><div className="home-banner-copy"><p className="home-kicker">ALGO BUENO POR DESCUBRIR</p><h2>Ofertas<br /><em>COMU</em></h2><p>Descubre promociones y oportunidades especiales.</p><details><summary className="home-text-link">Ver ofertas →</summary><p>Las próximas promociones aparecerán aquí. Por ahora, no hay ofertas anunciadas.</p><Link className="home-text-link" href="/comu/search">Explorar productos →</Link></details></div></aside>
    </section>

    <section className="home-trust" aria-label="Compra con confianza"><div className="home-container">{trust.map(([path, title, detail]) => <div key={title}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg><div><h3>{title}</h3><p>{detail}</p></div></div>)}</div></section>

    <section className="home-container home-section"><Heading title="Historias que inspiran" description="Conoce a las personas detrás de las marcas mexicanas." /><div className="home-stories"><article className="home-story"><div className="home-story-image"><HomeImage name="story-marcas" fallback={textile} /></div><div><p className="home-kicker">DETRÁS DE CADA PIEZA</p><h3>Ideas que toman forma.</h3><p>Pronto, historias de las marcas que dan vida a COMU.</p><span className="home-coming">Historias próximamente</span></div></article><article className="home-story"><div className="home-story-image"><HomeImage name="story-personas" fallback={fashion} /></div><div><p className="home-kicker">UNA MIRADA MÁS CERCANA</p><h3>El talento tiene muchas formas.</h3><p>Un espacio para descubrir a las personas detrás de lo que eliges.</p><span className="home-coming">Historias próximamente</span></div></article></div></section>

    <section className="home-container home-section"><div className="home-seller"><HomeImage name="seller-cta" fallback={textile} /><div className="home-banner-shade" /><div className="home-banner-copy"><p className="home-kicker">CREZCAMOS JUNTOS</p><h2>¿Tienes una marca?</h2><p>Únete a COMU y lleva tu negocio más lejos.<br />Publica tus productos, conecta con nuevos clientes y forma parte de una comunidad que impulsa el talento mexicano.</p><Link className="home-button home-button-light" href="/comu/sell">Comienza a vender →</Link></div></div></section>

    <section id="comu-brands" className="home-container home-brands"><h2>Marcas que ya son parte de COMU</h2>{sellers.length ? <div>{sellers.map(seller => <Link href={`/comu/sellers/${seller.slug}`} key={seller.slug}>{seller.public_name}</Link>)}</div> : <p>Un espacio para marcas independientes y nuevos descubrimientos.</p>}</section>
  </main>;
}
