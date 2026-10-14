"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type KeyboardEvent } from "react";
import { webPhotos } from "../../src/lib/pos/product-web-contract";
import { mediaUrl } from "./contract";
import { defaultProduct, initialProductSelection, productHref, type ProductConfig, type PublicProduct } from "./product-contract";
import { addToBag, readBag } from "./bag";

function modalKeyboard(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')];
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && event.currentTarget.ownerDocument.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && event.currentTarget.ownerDocument.activeElement === last) { event.preventDefault(); first.focus(); }
}
export function ProductDetail({ product: p, config = defaultProduct(), mediaBase, initialVariant = "", initialColor = "", preview = false }: { product: PublicProduct; config?: ProductConfig; mediaBase: string; initialVariant?: string; initialColor?: string; preview?: boolean }) {
  const [selection, setSelection] = useState(() => initialProductSelection(p, initialVariant, initialColor));
  const [photoIndex, setPhoto] = useState(0), [quantity, setQuantity] = useState(1), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [count, setCount] = useState(0);
  const guide = useRef<HTMLDialogElement>(null), zoom = useRef<HTMLDialogElement>(null), pending = useRef(false);
  const color = p.content.colors.find(c => c.id === selection.colorId);
  const variants = p.variants.filter(v => !color || color.variantIds.includes(v.id));
  const variant = variants.find(v => v.id === selection.variantId);
  const photos = color ? webPhotos(p.content, color.id) : [], photo = photos[photoIndex] ?? photos[0];
  const money = (price: number) => p.currency ? new Intl.NumberFormat("es-MX", { style: "currency", currency: p.currency }).format(price) : "Precio no disponible";
  const price = variant ? money(variant.price) : variants.length ? `${new Set(variants.map(v => v.price)).size > 1 ? "Desde " : ""}${money(Math.min(...variants.map(v => v.price)))}` : "";
  const canBuy = !!variant?.available && !!p.currency && !busy && Number.isInteger(quantity) && quantity > 0 && quantity <= 99;
  const select = (next: typeof selection) => { setSelection(next); setPhoto(0); setMessage(""); if (!preview) history.replaceState(history.state, "", productHref(p.id, next.colorId, next.variantId)); };
  useEffect(() => {
    if (preview) return;
    const sync = () => setCount(readBag(p.brandId).reduce((n, l) => n + l.quantity, 0)); sync();
    const back = () => { const q = new URLSearchParams(location.search); setSelection(initialProductSelection(p, q.get("variant") ?? "", q.get("color") ?? "")); setPhoto(0); };
    window.addEventListener("storage", sync); window.addEventListener("magenta-bag", sync); window.addEventListener("popstate", back);
    // Remove invalid external identifiers; they never select another product's variant.
    const valid = initialProductSelection(p, initialVariant, initialColor);
    history.replaceState(history.state, "", productHref(p.id, valid.colorId, valid.variantId));
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("magenta-bag", sync); window.removeEventListener("popstate", back); };
  }, [p, initialColor, initialVariant, preview]);
  const add = async () => {
    if (preview) { setMessage("Vista previa: no se modifica la bolsa ni se generan pedidos."); return; }
    if (!canBuy || !variant || pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    try { const result = await addToBag(p.brandId, p.id, variant.id, quantity); setCount(result.count); window.dispatchEvent(new CustomEvent("atelier-open-bag")); setMessage(result.persisted ? "Agregado a tu bolsa. Puedes seguir explorando." : "Agregado solo en esta pestaña. El navegador no permite guardar la bolsa al recargar."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo agregar. Intenta de nuevo."); }
    finally { pending.current = false; setBusy(false); }
  };
  const buy = <button className="mp-buy" disabled={!canBuy} onClick={add}>{busy ? "Validando…" : variant && !variant.available ? "Agotado" : config.buyText} <span aria-hidden="true">→</span></button>;
  const g = p.content.guide, hasGuide = !!(g.content || g.imagePath || g.rows.length);
  const image = (path: string, alt: string) => <img src={mediaUrl(mediaBase, path)} alt={alt} />;
  const blocks: Record<ProductConfig["blocks"][number]["kind"], ReactNode> = {
    heading: <><small className="mp-eyebrow">LA COLECCIÓN</small><h1>{p.name}</h1></>,
    price: <div className="mp-price" aria-live="polite">{price}</div>,
    selection: <>
      {!!p.content.colors.length && <fieldset><legend>Color{color ? ` · ${color.name}` : ""}</legend><div className="mp-colors">{p.content.colors.map(c => <button key={c.id} aria-label={`Color ${c.name}`} aria-pressed={c.id === color?.id} title={c.hex || c.swatchPath ? c.name : `${c.name}: tono sin configurar`} onClick={() => select({ colorId: c.id, variantId: c.id === selection.colorId ? selection.variantId : "" })} style={{ backgroundColor: c.hex || undefined }}>{c.swatchPath ? image(c.swatchPath, "") : !c.hex ? <span>?</span> : null}</button>)}</div></fieldset>}
      <fieldset><legend>Talla / opciones</legend><div className="mp-options">{variants.map(v => <button key={v.id} aria-pressed={v.id === variant?.id} onClick={() => select({ ...selection, variantId: v.id })}>{Object.entries(v.options).filter(([k]) => !["color", "colour"].includes(k.toLowerCase())).map(([, v]) => v).join(" · ") || v.name}{!v.available && <small>Agotado</small>}</button>)}</div></fieldset>
      <p className="mp-muted" aria-live="polite">{!variant ? "Selecciona una talla o variante para continuar." : variant.available ? "Disponible al consultar" : "Esta variante está agotada"}</p>
    </>,
    guide: hasGuide ? <button className="mp-link" onClick={() => guide.current?.showModal()}>{config.guideText} ↗</button> : null,
    benefits: p.content.benefits.some(b => b.enabled && b.title) ? <div className="mp-benefits">{p.content.benefits.filter(b => b.enabled && b.title).map(b => <div key={b.id}><span aria-hidden="true">{({ spark: "✧", layers: "▱", heart: "♡", feather: "❧", shield: "◇", ruler: "↔" })[b.icon]}</span><strong>{b.title}</strong><small>{b.description}</small></div>)}</div> : null,
    buy: <><label className="mp-quantity">Cantidad <input aria-label="Cantidad" type="number" min="1" max="99" step="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>{buy}<small className="mp-muted">Tu bolsa no reserva existencias. Se volverán a comprobar antes de una compra.</small></>,
    details: <>{p.content.details.filter(d => d.enabled && d.title && d.content).map(d => <details key={d.id} open={d.open || undefined}><summary>{d.title}</summary><p className="mp-prose">{d.content}</p></details>)}</>,
    wholesale: p.content.wholesale.enabled && p.content.wholesale.content ? <aside className="mp-wholesale"><h2>{p.content.wholesale.title}</h2><p className="mp-prose">{p.content.wholesale.content}</p></aside> : null,
    related: p.related.length ? <section className="mp-related"><h2>{config.relatedText}</h2><div>{p.related.map(r => <a key={r.id} href={productHref(r.id)}>{r.image ? image(r.image, r.name) : <span className="mp-no-photo">Sin fotografía</span>}<h3>{r.name}</h3>{r.price !== null && r.currency && <p>{new Intl.NumberFormat("es-MX", { style: "currency", currency: r.currency }).format(r.price)}</p>}</a>)}</div></section> : null,
  };
  return <article className="mp-product" style={{ "--mp-gap": config.gap + "px", "--mp-fit": config.fit } as CSSProperties}>
    <div className="mp-top"><nav aria-label="Ruta del producto"><Link href="/">Inicio</Link> / <a href="/catalogo">Catálogo</a></nav><a href="/bolsa" aria-label={`Bolsa: ${count} unidades`}>Mi bolsa · {count}</a></div>
    <div className="mp-layout"><section className="mp-gallery" aria-label="Fotografías del producto">
      <div className="mp-stage" key={color?.id ?? "none"}>{photo ? <>{image(photo.path, photo.alt || p.name)}<button className="mp-zoom" aria-label="Ampliar fotografía" onClick={() => zoom.current?.showModal()}>＋</button></> : <div className="mp-no-photo">Fotografía no disponible para este color</div>}</div>
      {photos.length > 1 && <><div className="mp-gallery-nav"><button aria-label="Foto anterior" onClick={() => setPhoto((photoIndex + photos.length - 1) % photos.length)}>←</button><span>{photoIndex + 1} / {photos.length}</span><button aria-label="Foto siguiente" onClick={() => setPhoto((photoIndex + 1) % photos.length)}>→</button></div><div className={"mp-thumbs " + (config.gallery === "grid" ? "mp-grid" : "")}>{photos.map((f, i) => <button key={f.path} aria-label={`Ver foto ${i + 1}`} aria-pressed={i === photoIndex} onClick={() => setPhoto(i)}>{image(f.path, f.alt)}</button>)}</div></>}
    </section><div className="mp-info">{config.blocks.filter(b => b.enabled).map(b => blocks[b.kind] ? <section className={"mp-block mp-block-" + b.kind} key={b.kind}>{blocks[b.kind]}</section> : null)}
    <p className="mp-status" role="status" aria-live="polite">{message}</p></div></div>
    {config.sticky && config.blocks.some(b => b.kind === "buy" && b.enabled) && <div className="mp-sticky"><div><strong>{p.name}</strong><small>{variant?.name ?? "Selecciona una variante"} · {price}</small></div>{buy}</div>}
    <dialog onKeyDown={modalKeyboard} ref={guide} className="mp-modal" aria-labelledby="mp-guide-title"><button autoFocus onClick={() => guide.current?.close()}>Cerrar ×</button><h2 id="mp-guide-title">{config.guideText}</h2><p className="mp-prose">{g.content}</p>{g.imagePath && image(g.imagePath, config.guideText)}{g.rows.length > 0 && <div className="mp-table"><table><thead><tr>{g.columns.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr></thead><tbody>{g.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}</dialog>
    <dialog onKeyDown={modalKeyboard} ref={zoom} className="mp-modal mp-lightbox" aria-label="Fotografía ampliada"><button autoFocus onClick={() => zoom.current?.close()}>Cerrar ×</button>{photo && image(photo.path, photo.alt || p.name)}</dialog>
  </article>;
}
