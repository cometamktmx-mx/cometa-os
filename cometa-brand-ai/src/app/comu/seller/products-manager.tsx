"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { CatalogSnapshot } from "@/lib/comu/seller-catalog";
import ProductEditor from "./product-editor";
import { SellerIcon } from "./seller-ui";
import "./seller-products.css";

export type ProductManagerProduct = { id: string; name: string; description?: string | null; image_url?: string | null; category_id?: string | null; sku?: string | null; price?: number | null; available_quantity?: number };
export type ProductManagerListing = { id: string; product_id: string; status: string; public_slug: string; wholesale_enabled?: boolean };
type Props = { brandSlug: string; sellerStatus?: string; products: ProductManagerProduct[]; listings: ProductManagerListing[]; publish: (id: string) => Promise<void>; changeStatus: (id: string, status: string) => Promise<void>; uploadMedia: (id: string, file: File) => Promise<void>; refresh: () => Promise<void>; sellerId: string };
type Filter = "ALL" | "PUBLISHED" | "DRAFT" | "OUT" | "LOW";
const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);

export default function ProductsManager({ sellerStatus, products, listings, publish, changeStatus, uploadMedia, refresh, sellerId }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [category, setCategory] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetch(`/api/comu/seller/catalog?sellerId=${encodeURIComponent(sellerId)}`, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("No se pudo consultar el catálogo.");
      const data: CatalogSnapshot = await response.json();
      if (active) { setCatalog(data); setError(""); }
    }).catch(() => { if (active) setError("No se pudo consultar el catálogo. Actualiza para reintentar."); });
    return () => { active = false; };
  }, [sellerId, products, listings]);
  const rows = useMemo(() => (catalog?.products || []).map(product => {
    const source = products.find(p => p.id === product.id);
    const listing = listings.find(l => l.product_id === product.id);
    const variants = catalog?.variants.filter(v => v.product_id === product.id) || [];
    const available = variants.map(v => (catalog?.inventory.filter(i => i.variant_id === v.id) || []).reduce((total, i) => total + Number(i.quantity) - Number(i.reserved_quantity), 0));
    const stock = available.reduce((total, n) => total + n, 0);
    // COMU's existing availability convention: 1–3 available units per variant.
    const low = stock > 0 && available.some(n => n > 0 && n <= 3);
    const prices = variants.map(v => Number(v.price)).filter(Number.isFinite);
    const categoryName = catalog?.categories.find(c => c.id === product.category_id)?.name || "Sin categoría";
    const published = listing?.status === "PUBLISHED";
    const draft = !listing || listing.status === "DRAFT";
    return { product, listing, variants, stock, low, categoryName, published, draft, image: source?.image_url, sku: variants.map(v => v.sku).filter(Boolean).join(" · ") || product.product_code || "Sin SKU", prices };
  }), [catalog, products, listings]);
  const counts = { ALL: rows.length, PUBLISHED: rows.filter(r => r.published).length, DRAFT: rows.filter(r => r.draft).length, OUT: rows.filter(r => r.stock <= 0).length, LOW: rows.filter(r => r.low).length };
  const categories = catalog?.categories.filter(c => rows.some(r => r.product.category_id === c.id)) || [];
  const filtered = rows.filter(r => (category === "ALL" || r.product.category_id === category) && `${r.product.name} ${r.sku} ${r.categoryName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (filter === "ALL" || (filter === "PUBLISHED" && r.published) || (filter === "DRAFT" && r.draft) || (filter === "OUT" && r.stock <= 0) || (filter === "LOW" && r.low)));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  async function action(id: string, run: () => Promise<void>) {
    if (busy) return;
    setBusy(id); setError("");
    try { await run(); } catch { setError("No se pudo completar la acción. Reintenta."); } finally { setBusy(null); }
  }
  function edit(id: string) { setEditing(id); requestAnimationFrame(() => document.getElementById("seller-existing-editor")?.scrollIntoView({ block: "start", behavior: "smooth" })); }
  function toggle(id: string) { setSelected(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]); }
  const metrics = [ ["box", "Productos publicados", counts.PUBLISHED, "Visibles en tu catálogo"], ["stock", "Borradores", counts.DRAFT, "Pendientes de publicación"], ["help", "Requieren atención", counts.OUT + counts.LOW, "Sin stock o stock bajo"], ["tag", "Categorías", categories.length, "En tu catálogo"] ] as const;
  return <section className="seller-products" data-products-state={sellerStatus} data-products-ready={!!catalog}>
    <header className="sp-header"><div><h1>Productos</h1><p>Administra todo lo que vendes en COMU.</p></div><div className="sp-catalog-state"><span className="sp-state-icon"><SellerIcon name="box" /></span><div><strong>Catálogo {catalog ? "listo" : "en consulta"}</strong><small>Todos tus productos, en un solo lugar.</small></div><button className="sp-primary" onClick={() => edit("")}>＋ Agregar producto</button></div></header>
    {sellerStatus === "PREPARING" && <p className="sp-progress" role="status">{catalog ? `${catalog.progress.publishedListings} / ${catalog.progress.minimumListings} productos listos` : "Consultando preparación…"} · La activación final está a cargo de COMETA.</p>}
    {error && <p className="sp-error" role="alert">{error} <button onClick={() => void refresh()}>Reintentar</button></p>}
    {editing !== null && <div id="seller-existing-editor" className="seller-legacy"><ProductEditor key={editing} sellerId={sellerId} productId={editing || undefined} done={refresh} cancel={() => setEditing(null)} /></div>}
    <div className="sp-metrics">{metrics.map(([icon, label, value, copy]) => <div className="sp-metric" key={label}><span><SellerIcon name={icon} /></span><div><strong>{catalog ? value : "—"}</strong><p>{label}</p><small>{copy}</small></div></div>)}</div>
    <div className="sp-toolbar"><div className="sp-tabs" role="group" aria-label="Filtrar productos">{([ ["ALL", "Todos"], ["PUBLISHED", "Publicados"], ["DRAFT", "Borradores"], ["OUT", "Sin stock"], ["LOW", "Stock bajo"] ] as const).map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(1); }}>{label} <span>{catalog ? counts[id] : "—"}</span></button>)}</div><label className="sp-search"><SellerIcon name="search" /><input aria-label="Buscar productos" placeholder="Buscar productos por nombre, SKU o categoría…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><select aria-label="Categoría" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="ALL">Todas las categorías</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    {selected.length > 0 && <p className="sp-selection">{selected.length} seleccionados <button onClick={() => setSelected([])}>Limpiar selección</button></p>}
    <div className="sp-table" role="table" aria-label="Productos"><div className="sp-table-head sp-row" role="row"><span role="columnheader"><input type="checkbox" aria-label="Seleccionar página" checked={visible.length > 0 && visible.every(r => selected.includes(r.product.id))} onChange={e => setSelected(e.target.checked ? [...new Set([...selected, ...visible.map(r => r.product.id)])] : selected.filter(id => !visible.some(r => r.product.id === id)))} /></span>{["Producto", "Categoría", "Variantes", "Precio", "Stock total", "Estado", "Actualizado", "Acciones"].map(label => <span key={label} role="columnheader">{label}</span>)}</div>
      {visible.map(row => {
        const { product, listing, prices } = row;
        const price = prices.length ? Math.min(...prices) === Math.max(...prices) ? money(prices[0]) : `${money(Math.min(...prices))} – ${money(Math.max(...prices))}` : "Sin precio";
        const status = !row.published ? row.draft ? "Borrador" : "Oculto" : row.stock <= 0 ? "Sin stock" : row.low ? "Stock bajo" : "Publicado";
        const tone = status === "Publicado" ? "published" : status === "Stock bajo" ? "low" : status === "Sin stock" ? "out" : "draft";
        return <article key={product.id} className="sp-row sp-product" role="row" data-product-id={product.id}>
          <span className="sp-check" role="cell"><input type="checkbox" aria-label={`Seleccionar ${product.name}`} checked={selected.includes(product.id)} onChange={() => toggle(product.id)} /></span>
          <button className="sp-product-name" role="cell" onClick={() => edit(product.id)}><span className="sp-thumb">{row.image ? <Image unoptimized width={64} height={72} src={row.image} alt={product.name} onError={e => { e.currentTarget.style.display = "none"; }} /> : <span aria-label="Sin imagen">COMU<span>.</span></span>}</span><span><strong>{product.name}</strong><small>SKU: {row.sku}</small></span></button>
          <span className="sp-category" role="cell">{row.categoryName}</span>
          <span className="sp-variants" role="cell">{row.variants.length} {row.variants.length === 1 ? "variante" : "variantes"}</span>
          <span className="sp-price" role="cell">{price}</span><span className="sp-stock" role="cell">{row.stock}<small> disponibles</small></span>
          <span className="sp-status-cell" role="cell"><span className={`sp-badge ${tone}`}>◆ {status}</span></span>
          <span className="sp-updated" role="cell">{product.updated_at ? new Date(product.updated_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "—"}</span>
          <details className="sp-actions" role="cell"><summary aria-label={`Acciones de ${product.name}`}>⋮</summary><div><button disabled={!!busy} onClick={() => edit(product.id)}>Editar</button>{row.published ? <button disabled={!!busy} onClick={() => listing && void action(product.id, () => changeStatus(listing.id, "HIDDEN"))}>Ocultar</button> : <button disabled={!!busy} onClick={() => void action(product.id, () => publish(product.id))}>Publicar</button>}{listing && <label>Subir imagen<input type="file" aria-label={`Subir imagen de ${product.name}`} accept="image/jpeg,image/png,image/webp" disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; if (file) void action(product.id, () => uploadMedia(listing.id, file)); e.currentTarget.value = ""; }} /></label>}{row.published && listing?.public_slug && <Link href={`/comu/products/${encodeURIComponent(listing.public_slug)}`}>Ver en tienda</Link>}</div></details>
        </article>;
      })}
      {!visible.length && <div className="sp-empty"><SellerIcon name="box" /><h2>{!catalog ? "Consultando tu catálogo" : rows.length ? "No encontramos productos" : "Tu catálogo empieza aquí"}</h2><p>{rows.length ? "Prueba otra búsqueda o cambia los filtros." : "Agrega tu primer producto y prepara todo para vender en COMU."}</p>{catalog && !rows.length && <button className="sp-primary" onClick={() => edit("")}>Agregar mi primer producto</button>}</div>}
    </div>
    <footer className="sp-pagination"><span>Mostrando {filtered.length ? (current - 1) * pageSize + 1 : 0} a {Math.min(current * pageSize, filtered.length)} de {filtered.length} productos</span><nav aria-label="Páginas de productos"><button aria-label="Página anterior" disabled={current === 1} onClick={() => setPage(current - 1)}>‹</button>{Array.from({ length: pages }, (_, i) => i + 1).filter(n => n === 1 || n === pages || Math.abs(n - current) <= 1).map((n, i, numbers) => <span key={n}>{i > 0 && n - numbers[i - 1] > 1 && <span>…</span>}<button aria-current={n === current ? "page" : undefined} onClick={() => setPage(n)}>{n}</button></span>)}<button aria-label="Página siguiente" disabled={current === pages} onClick={() => setPage(current + 1)}>›</button></nav><select aria-label="Productos por página" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[8, 16, 32].map(n => <option key={n} value={n}>{n} por página</option>)}</select></footer>
  </section>;
}
