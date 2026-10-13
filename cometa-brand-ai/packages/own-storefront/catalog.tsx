"use client";
import { useRef, useState, type CSSProperties } from "react";
import { productHref } from "./product-contract";
import { mediaUrl, type Appearance } from "./contract";
import { catalogHref, type CatalogConfig, type CatalogProduct, type CatalogQuery, type CatalogResult, type Facet } from "./catalog-contract";

export function CatalogCard({ product: p, config, mediaBase, initialColor = "", initialSize = "" }: { product: CatalogProduct; config: CatalogConfig; mediaBase: string; initialColor?: string; initialSize?: string }) {
  const [selected, setSelected] = useState(p.colors.find(c => c.name.toLowerCase() === initialColor.toLowerCase())?.id ?? p.colors[0]?.id ?? "");
  const color = p.colors.find(c => c.id === selected);
  const min = color?.min ?? p.min, max = color?.max ?? p.max, available = color?.available ?? p.available;
  const price = p.currency && /^[A-Z]{3}$/.test(p.currency) ? new Intl.NumberFormat("es-MX", { style: "currency", currency: p.currency }).format(min) : null;
  return <article className="mc-card"><a href={productHref(p.id, color?.id, "", initialSize)} key={color?.id ?? "no-color"} className={"mc-photo mc-ratio-" + config.ratio}>
    {color?.photos[0] ? <><img src={mediaUrl(mediaBase,color.photos[0].path)} alt={color.photos[0].alt || p.name} loading="lazy" />{config.secondImage && color.photos[1] && <img className="mc-second" src={mediaUrl(mediaBase,color.photos[1].path)} alt={color.photos[1].alt || p.name} loading="lazy" />}</> : <div className="mc-placeholder"><span>◇</span><p>Fotografía no disponible{color ? ` en ${color.name}` : ""}</p></div>}
    {!available && <small className="mc-soldout">Agotado</small>}
  </a><h2><a href={productHref(p.id, color?.id, "", initialSize)}>{p.name}</a></h2>{price && <p className="mc-price">{min !== max ? "Desde " : ""}{price}</p>}
    {config.swatches && p.colors.length > 0 && <div className="mc-swatches" aria-label={"Colores de " + p.name}>{p.colors.map(c => <button type="button" key={c.id} aria-label={c.name} aria-pressed={c.id === selected} title={c.hex || c.swatch ? c.name : c.name + " · tono sin configurar"} onClick={() => setSelected(c.id)}><span style={{ backgroundColor: /^#[a-f0-9]{6}$/i.test(c.hex) ? c.hex : undefined }} className={!c.hex && !c.swatch ? "mc-neutral" : ""}>{c.swatch && <img src={mediaUrl(mediaBase,c.swatch)} alt="" />}</span></button>)}</div>}
    {color && <small className="mc-color-name" aria-live="polite">{color.name}</small>}
  </article>;
}
export function Catalog({ data, query, config, mediaBase, mediaLayout }: { data: CatalogResult; query: CatalogQuery; config: CatalogConfig; mediaBase: string; mediaLayout?: Appearance["mediaLayout"] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const bannerLayout = mediaLayout?.[config.banner];
  const input = (name: string, value: string) => <input type="hidden" name={name} value={value} key={name} />;
  const options = (name: "category" | "color" | "size", label: string, values: Facet[]) => <label>{label}<select name={name} defaultValue={query[name]}><option value="">Todas</option>{query[name] && !values.some(v => v.value === query[name]) && <option value={query[name]}>Selección sin resultados</option>}{values.map(v => <option value={v.value} key={v.value}>{v.label} ({v.count})</option>)}</select></label>;
  const form = <form action="/catalogo" method="get" className="mc-filter-form">
    {input("q",query.q)}{input("sort",query.sort)}
    {config.filters.includes("category") ? options("category","Categoría",data.categories) : input("category",query.category)}
    {config.filters.includes("color") ? options("color","Color",data.colors) : input("color",query.color)}
    {config.filters.includes("size") ? options("size","Talla",data.sizes) : input("size",query.size)}
    {config.filters.includes("price") ? <fieldset><legend>Precio</legend><label>Desde<input name="min" type="number" min="0" step="0.01" defaultValue={query.min} /></label><label>Hasta<input name="max" type="number" min="0" step="0.01" defaultValue={query.max} /></label></fieldset> : <>{input("min",query.min)}{input("max",query.max)}</>}
    {config.filters.includes("available") ? <label className="mc-check"><input type="checkbox" name="available" value="1" defaultChecked={query.available} />Solo disponibles</label> : query.available && input("available","1")}
    <button className="mag-button" type="submit">Aplicar filtros</button><a href="/catalogo">Limpiar filtros</a>
  </form>;
  const chips: { key: keyof CatalogQuery; label: string }[] = [];
  for (const key of ["q","category","color","size","min","max"] as const) if (query[key]) chips.push({key,label:key === "category" ? data.categories.find(v => v.value === query.category)?.label ?? "Categoría seleccionada" : ({q:"Búsqueda",color:"Color",size:"Talla",min:"Desde",max:"Hasta"}[key] + ": " + query[key])});
  if (query.available) chips.push({key:"available",label:"Solo disponibles"});
  return <div className="mc-catalog" style={{ "--mc-columns": config.columns } as CSSProperties}>
    <section className="mc-banner"><p className="mc-eyebrow">THE EDIT</p><h1>{config.title}</h1>{config.description && <p>{config.description}</p>}{config.banner && (bannerLayout ? <><img className="mag-photo-desktop" style={{objectPosition:bannerLayout.x+"% "+bannerLayout.y+"%"}} src={mediaUrl(mediaBase,config.banner)} alt=""/><img className="mag-photo-mobile" style={{objectPosition:bannerLayout.mobileX+"% "+bannerLayout.mobileY+"%"}} src={mediaUrl(mediaBase,bannerLayout.mobileImage||config.banner)} alt=""/></> : <img src={mediaUrl(mediaBase,config.banner)} alt=""/>)}</section>
    <nav className="mc-categories" aria-label="Categorías"><a href={catalogHref(query,{category:"",page:1})} aria-current={!query.category ? "page" : undefined}>Todas</a>{data.categories.map(c => <a href={catalogHref(query,{category:c.value,page:1})} key={c.value} aria-current={query.category === c.value ? "page" : undefined}>{c.label}</a>)}</nav>
    <form className="mc-search" action="/catalogo" method="get"><label>Buscar en el catálogo<input type="search" name="q" defaultValue={query.q} placeholder="Nombre o descripción" maxLength={150} /></label>{["category","color","size","min","max","sort"].map(k => input(k,String(query[k as keyof CatalogQuery])))}{query.available && input("available","1")}<button type="submit">Buscar</button></form>
    <div className="mc-toolbar"><p role="status">{data.total} {data.total === 1 ? "producto" : "productos"}</p><button className="mc-open-filters" onClick={() => dialog.current?.showModal()}>Filtrar y ordenar</button><form action="/catalogo" method="get" className="mc-sort">{["q","category","color","size","min","max"].map(k => input(k,String(query[k as keyof CatalogQuery])))}{query.available && input("available","1")}<label>Ordenar<select name="sort" defaultValue={query.sort}><option value="newest">Novedades</option><option value="price_asc">Precio: menor a mayor</option><option value="price_desc">Precio: mayor a menor</option><option value="name">Nombre</option></select></label><button type="submit">Ordenar</button></form></div>
    <div className="mc-layout"><aside className="mc-sidebar"><h2>Filtrar</h2>{form}</aside><section aria-label="Resultados"><div className="mc-active">{chips.map(c => <a key={c.key} href={catalogHref(query,{[c.key]:c.key === "available" ? false : "",page:1})} aria-label={"Quitar " + c.label}>{c.label} ×</a>)}{chips.length > 0 && <a href="/catalogo">Limpiar todo</a>}</div>
      {data.products.length ? <div className="mc-grid">{data.products.map(p => <CatalogCard key={p.id + query.color} product={p} config={config} mediaBase={mediaBase} initialColor={query.color} initialSize={query.size} />)}</div> : <div className="mc-empty"><h2>No hay productos con estos filtros.</h2><p>Prueba otra combinación o vuelve a ver todo el catálogo.</p><a href="/catalogo">Limpiar filtros →</a></div>}
      <nav className="mc-pagination" aria-label="Paginación">{data.page > 1 && <a href={catalogHref(query,{page:data.page-1})}>← Anterior</a>}<span>Página {data.page} de {Math.max(1,Math.ceil(data.total/data.perPage))}</span>{data.page * data.perPage < data.total && <a href={catalogHref(query,{page:data.page+1})}>Siguiente →</a>}</nav>
    </section></div>
    <dialog ref={dialog} className="mc-dialog" aria-label="Filtros del catálogo"><div className="mc-dialog-top"><h2>Filtrar</h2><button aria-label="Cerrar filtros" onClick={() => dialog.current?.close()}>Cerrar ×</button></div>{form}</dialog>
  </div>;
}
