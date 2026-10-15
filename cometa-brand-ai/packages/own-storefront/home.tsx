import { sectionId, sectionRegistry } from './section-registry';
import { productHref } from "./product-contract";
import { AppearanceDesign } from "./design";
import { defaultFooterDesign } from "./design-contract";
import type { CSSProperties, ReactNode } from "react";
import { mediaUrl, safeLink, type HomeData, type ProductCard, type Section } from "./contract";

export function StoreHome({ appearance: a, products, mediaBase, children, editor, editorSelection, footerContent }: HomeData & { children?: ReactNode; footerContent?: ReactNode; editor?: boolean; editorSelection?: string }) {
  const header = a.headerDesign ?? {identity:a.logo?"logo":"text",centered:false,logoWidth:170,mobileLogoWidth:145,showAnnouncement:true,showNavigation:true};
  const footer = a.footerDesign ?? defaultFooterDesign();
  const product = (id: string) => products.find(p => p.id === id);
  const renderPhoto = (path: string, alt: string, className = "", layouts = a.mediaLayout) => {
    if (!path) return null;
    const layout = layouts?.[path];
    const hero=className==='mag-hero-image';
    if (!layout) return <img className={className} src={mediaUrl(mediaBase, path)} alt={alt} loading={hero?'eager':'lazy'} fetchPriority={hero?'high':undefined} />;
    return <><img className={className + " mag-photo-desktop"} src={mediaUrl(mediaBase, path)} style={{objectPosition: layout.x + "% " + layout.y + "%"}} alt={alt} loading={hero?'eager':'lazy'} /><img className={className + " mag-photo-mobile"} src={mediaUrl(mediaBase, layout.mobileImage || path)} style={{objectPosition: layout.mobileX + "% " + layout.mobileY + "%"}} alt={alt} loading={hero?'eager':'lazy'} /></>;
  };
  const visible = a.sections.map(s => ({ ...s, entries: s.entries.filter(e => s.kind === "videos" ? e.url.startsWith("https://") && safeLink(e.url) : !!(e.title || e.text || e.image || e.productId)) })).filter(s => {
    if (!s.enabled) return false;
    if (s.kind === "featured" || s.kind === "look") return s.entries.some(e => product(e.productId));
    if (s.kind === "newsletter") return !!s.url;
    if (s.kind === "marquee") return !!s.text;
    if (["categories", "videos", "testimonials", "benefits", "faq"].includes(s.kind)) return s.entries.length > 0;
    return !!(s.title || s.text || s.image);
  });
  const link = (url: string) => !!url && safeLink(url) && (!url.startsWith("#") || visible.some(s => "#" + sectionId(s) === url));
  const card = (p: ProductCard) => <article className="mag-product" key={p.id}>
    <a href={productHref(p.id)} className="mag-product-image">{p.image ? renderPhoto(p.image, p.name) : <span>{a.name || "Producto"}</span>}{p.soldOut && <small>Agotado</small>}</a>
    <h3><a href={productHref(p.id)}>{p.name}</a></h3>{p.price !== null && p.currency && <p>{new Intl.NumberFormat("es-MX", { style: "currency", currency: p.currency }).format(p.price)}</p>}
  </article>;
  const render = (s: Section) => {
    const photo = (path:string,alt:string,className='') => renderPhoto(path,alt,className,s.mediaLayout ?? a.mediaLayout);
    if (editor && !visible.some(v => sectionId(v) === sectionId(s))) return <section id={sectionId(s)} key={sectionId(s)} className="mag-editor-empty"><h3>{sectionRegistry[s.kind].label}</h3><p>{s.enabled ? "Contenido pendiente" : "Sección oculta en la tienda"}</p><button data-editor-part={s.kind==="hero"?"image":["marquee","wholesale","newsletter"].includes(s.kind)?"text":"products"}>{["featured","look"].includes(s.kind) ? "Seleccionar productos" : "Preparar esta sección"}</button></section>;
    const heading = <div className="mag-heading"><h2>{s.title}</h2>{s.text && <p>{s.text}</p>}</div>;
    if (s.kind === "hero") return <section id={sectionId(s)} className={"mag-hero" + (!s.image ? " mag-hero-no-image" : "")} key={sectionId(s)}>{photo(s.image, "", "mag-hero-image")}{editor && !s.image && <button className="mag-editor-photo" data-editor-part="image">＋ Agregar imagen de portada</button>}<div className="mag-hero-copy"><h1 data-editor-part="title">{s.title}</h1>{s.text && <p data-editor-part="description">{s.text}</p>}{link(s.url) && <a data-editor-part="button" className="mag-button" href={s.url}>{s.buttonLabel ?? a.buttonLabels?.hero ?? "Explorar →"}</a>}</div></section>;
    if (s.kind === "marquee") return s.text ? <div id={sectionId(s)} key={sectionId(s)} className="mag-marquee"><p>{s.text}</p></div> : null;
    if (s.kind === "featured" || s.kind === "look") return <section id={sectionId(s)} key={sectionId(s)} className={"mag-section mag-" + s.kind}>{heading}<div className="mag-look-layout">{s.kind === "look" && photo(s.image, s.title, "mag-look-image")}<div className="mag-products">{s.entries.map(e => product(e.productId)).filter((p): p is ProductCard => !!p).map(card)}</div></div></section>;
    if (s.kind === "faq") return s.entries.length ? <section id={sectionId(s)} key={sectionId(s)} className="mag-section mag-faq">{heading}<div>{s.entries.map((e, i) => <details key={i}><summary>{e.title}<span>+</span></summary><p>{e.text}</p></details>)}</div></section> : null;
    if (s.kind === "newsletter" || s.kind === "wholesale") return <section id={sectionId(s)} key={sectionId(s)} className={"mag-section mag-" + s.kind}>{photo(s.image, "")}{heading}{link(s.url) && <a className="mag-button" href={s.url} rel="noopener noreferrer">{s.buttonLabel ?? a.buttonLabels?.[s.kind] ?? (s.kind === "newsletter" ? "Suscribirme en el servicio externo ↗" : "Conocer más ↗")}</a>}</section>;
    return s.entries.length ? <section id={sectionId(s)} key={sectionId(s)} className={"mag-section mag-" + s.kind}>{heading}<div className="mag-entries">{s.entries.map((e, i) => <article key={i} data-editor-entry={i}>
      {s.kind === "videos" ? (e.url.startsWith("https://") && safeLink(e.url) ? <video controls playsInline preload="none" poster={mediaUrl(mediaBase, e.image)} src={e.url} /> : null) : photo(e.image, e.title)}
      {s.kind === "benefits" && <span className="mag-benefit-mark" aria-hidden="true">◇</span>}
      <h3>{e.title}</h3><p>{e.text}</p>{s.kind === "categories" && link(e.url) && <a href={e.url}>Explorar ↗</a>}
    </article>)}</div></section> : null;
  };
  return <main className={"mag-home " + (a.motion ? "mag-motion" : "") + " mag-font-" + a.font} style={{ "--mag-paper": a.paper, "--mag-ink": a.ink, "--mag-accent": a.accent, "--mag-soft": a.soft, "--mag-space": a.spacing + "px" } as CSSProperties}>
    {a.entrance && a.motion && <div className="mag-entrance" aria-hidden="true">{a.entranceText ?? a.name.trim().slice(0,1)}</div>}
    {header.showAnnouncement && a.announcement && <div className="mag-announcement">{a.announcement}</div>}
    <header className={"mag-header"+(header.centered?" mag-header-centered":"")} style={{"--logo-width":header.logoWidth+"px","--logo-mobile":header.mobileLogoWidth+"px"} as CSSProperties}><a href={children ? "/" : "#mag-top"} className="mag-logo">{header.identity!=="text" && a.logo && renderPhoto(a.logo, a.name)}{header.identity!=="logo" && <span>{a.name}</span>}</a>{header.showNavigation && <nav aria-label="Tienda">{a.navigation.filter(n => link(n.url)).map((n, i) => <a key={i} href={children && n.url.startsWith("#") ? "/" + n.url : n.url}>{n.title}</a>)}</nav>}<div className="mag-header-actions"><a href="/bolsa" aria-label="Mi bolsa">Bolsa</a><a href="/pedidos">Mis pedidos</a></div></header>
    <div id="mag-top">{children ?? (editor ? a.sections.filter(s=>s.enabled || sectionId(s)===editorSelection) : visible).map(render)}</div>
    <footer className="mag-footer"><div>{["logo","both"].includes(footer.identity) && a.logo && renderPhoto(a.logo, a.name, "mag-footer-logo")}{["text","both"].includes(footer.identity) && <h2>{a.name}</h2>}<p>{a.footer}</p>{footer.contact && <p>{footer.contact}</p>}</div>{footer.columns.length ? footer.columns.map((column,i) => <nav key={i} aria-label={column.title}><h3>{column.title}</h3>{column.links.filter(n=>link(n.url)).map((n,j)=><a key={j} href={n.url}>{n.title}</a>)}</nav>) : <nav>{a.navigation.filter(n => link(n.url)).map((n, i) => <a key={i} href={children && n.url.startsWith("#") ? "/" + n.url : n.url}>{n.title}</a>)}</nav>}{footer.social.length > 0 && <nav aria-label="Redes sociales">{footer.social.filter(n=>link(n.url)).map((n,i)=><a key={i} href={n.url} rel="noopener noreferrer">{n.title}</a>)}</nav>}{footerContent}{footer.wordmark && <p className="mag-wordmark" style={{"--wordmark-size":footer.wordmarkSize+"px","--wordmark-mobile":footer.mobileWordmarkSize+"px"} as CSSProperties}>{footer.wordmarkText || a.name}</p>}</footer>
    <AppearanceDesign appearance={a}/>
  </main>;
}
