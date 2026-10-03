"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CatalogSnapshot } from "@/lib/comu/seller-catalog";
import { getConnectSettingsState } from "./connect-settings-actions";
import { SellerEmptyState, SellerIcon, SellerMetric, SellerOrderStatus, SellerPanel } from "./seller-ui";

type Storefront = { name: string; description?: string; slug?: string };
type Seller = { id: string; public_name: string; brand_slug: string; slug: string; status: string; verification_status: string; comu_storefronts?: Storefront | Storefront[] };
type Order = { id: string; grand_total: number; fulfillment_status: string; comu_orders: { order_number: number; status: string; created_at: string; shipping_address_snapshot?: { recipient_name?: string } }; comu_order_items: Array<{ quantity: number }> };
type Data = { seller: Seller; storefront: Storefront | null; catalog: CatalogSnapshot; orders: Order[]; payments: Awaited<ReturnType<typeof getConnectSettingsState>> };
const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
export default function SellerOverview({ brandSlug }: { brandSlug: string }) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState("");
  useEffect(() => { let live = true; async function read(path: string) { const response = await fetch(path, { cache: "no-store" }); if (!response.ok) throw new Error("No pudimos consultar el resumen. Actualiza para reintentar."); return response.json(); }
    async function load() { try {
      const sellers: { sellers: Seller[] } = await read("/api/comu/sellers?mine=1"); const seller = sellers.sellers.find(s => s.brand_slug === brandSlug); if (!seller) throw new Error("No tienes acceso a esta tienda.");
      const [catalog, orders, payments, store] = await Promise.all([read(`/api/comu/seller/catalog?sellerId=${seller.id}`), read(`/api/comu/seller/orders?sellerId=${seller.id}`), getConnectSettingsState(brandSlug), read(`/api/comu/storefronts?sellerId=${seller.id}`)]);
      if (live) setData({ seller, storefront: store.storefront, catalog, orders: orders.orders, payments });
    } catch (e) { if (live) setError(e instanceof Error ? e.message : "No pudimos cargar el resumen."); } } void load(); return () => { live = false; }; }, [brandSlug]);
  if (error) return <div className="seller-panel" role="alert">{error}</div>;
  if (!data) return <div className="seller-panel" role="status">Cargando el resumen de tu tienda…</div>;
  const { seller, storefront, catalog, orders, payments } = data, preparing = seller.status === "PREPARING";
  const base = `/comu/seller/${encodeURIComponent(brandSlug)}`, publicHref = `/comu/sellers/${encodeURIComponent(seller.slug)}`;
  const today = new Date(); const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const paid = orders.filter(o => ["PAID", "PARTIALLY_FULFILLED", "COMPLETED"].includes(o.comu_orders?.status));
  const todayPaid = paid.filter(o => dayKey(new Date(o.comu_orders.created_at)) === dayKey(today));
  const total = todayPaid.reduce((sum, o) => sum + Number(o.grand_total), 0);
  const series = Array.from({ length: 7 }, (_, i) => { const date = new Date(today); date.setDate(date.getDate() - 6 + i); const rows = paid.filter(o => dayKey(new Date(o.comu_orders.created_at)) === dayKey(date)); return { date, orders: rows.length, sales: rows.reduce((s, o) => s + Number(o.grand_total), 0) }; });
  const hasSeries = series.filter(d => d.orders > 0).length >= 2;
  const soldOut = catalog.products.filter(p => { const variants = catalog.variants.filter(v => v.product_id === p.id); const rows = catalog.inventory.filter(i => variants.some(v => v.id === i.variant_id)); return rows.length > 0 && rows.reduce((s, i) => s + Number(i.quantity) - Number(i.reserved_quantity), 0) <= 0; });
  const steps = [
    { label: "Marca aprobada por COMETA", done: seller.verification_status === "VERIFIED", href: "" },
    { label: "Información de tu tienda", done: Boolean(storefront?.name && storefront?.description), href: `${base}/store` },
    { label: `${catalog.progress.publishedListings} / ${catalog.progress.minimumListings} productos elegibles`, done: catalog.progress.publishedListings >= catalog.progress.minimumListings, href: `${base}/products` },
    { label: payments.ok ? payments.status === "COMPLETE" && !payments.suspended ? "Pagos configurados" : "Configurar pagos" : "Pagos: estado no disponible", done: payments.ok && payments.status === "COMPLETE" && !payments.suspended, href: `${base}/settings` },
    { label: "Activación final de COMETA", done: !preparing && seller.status === "ACTIVE", href: "" },
  ];
  const next = steps.find(s => !s.done && s.href);
  return <div className="seller-overview" data-seller-state={seller.status}>
    <div className="seller-main-column">
      <header className="seller-page-header"><div><h1>{preparing ? "Tu tienda está casi lista." : `Buenos días, ${seller.public_name}`}</h1><p>{preparing ? "Completa estos pasos y COMETA hará la revisión final." : "Aquí tienes un resumen de tu tienda en COMU."}</p></div><div className="seller-hero-aside"><time>{today.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</time><p>Sigamos haciendo crecer tu negocio.</p><Link className="seller-button" href={preparing ? next?.href || `${base}/settings` : publicHref}>{preparing ? next ? "Continuar preparación" : "Revisar preparación" : "Ver mi tienda"} <SellerIcon name="arrow" size={16} /></Link></div></header>
      {preparing && <SellerPanel title="Prepara tu tienda"><div className="seller-preparation"><progress max={steps.length} value={steps.filter(s => s.done).length} aria-label="Progreso de preparación" /><ul>{steps.map(s => <li key={s.label}><span className={s.done ? "done" : ""}>{s.done ? "✓" : "○"}</span>{s.href ? <Link href={s.href}>{s.label}</Link> : s.label}</li>)}</ul><p>Llegar a 10 productos no activa tu tienda automáticamente. COMETA conserva la revisión final.</p><p>Los envíos se coordinan con la operación COMU.</p>{catalog.progress.reason && <small>Requisito pendiente: {catalog.progress.reason === "COMU_CONNECT_REQUIRED" ? "completar pagos" : catalog.progress.reason === "MINIMUM_LISTINGS_REQUIRED" ? "completar catálogo" : catalog.progress.reason === "STOREFRONT_REQUIRED" ? "información de tienda" : "revisión COMETA"}.</small>}</div></SellerPanel>}
      <div className="seller-metrics"><SellerMetric label="Ventas hoy" value={money(total)} icon="bag" detail="Productos · sin envío" /><SellerMetric label="Pedidos" value={String(todayPaid.length)} icon="bag" detail="Pagados hoy" /><SellerMetric label="Ticket promedio" value={money(todayPaid.length ? total / todayPaid.length : 0)} icon="chart" detail="Pedidos pagados hoy" /><SellerMetric label="Productos activos" value={String(catalog.progress.publishedListings)} icon="box" detail="Publicaciones elegibles" /></div>
      <SellerPanel title="Ventas y pedidos" className="seller-performance" action={<div className="seller-chart-key"><span>● Ventas</span><span>● Pedidos</span><span className="seller-period">Últimos 7 días⌄</span></div>}>
        {hasSeries ? <div className="seller-real-chart" aria-label="Ventas y pedidos de los últimos siete días">{series.map(day => <div key={day.date.toISOString()}><span>{money(day.sales)}</span><div className="seller-bar-track"><i style={{ height: `${day.sales / Math.max(...series.map(d => d.sales), 1) * 100}%` }} /></div><small>{day.orders} pedidos</small><small>{day.date.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</small></div>)}</div> : <SellerEmptyState>Aún no hay suficiente actividad para mostrar tu rendimiento.</SellerEmptyState>}
      </SellerPanel>
      <SellerPanel title="Pedidos recientes" action={<Link href="/comu/seller/orders">Ver todos →</Link>} className="seller-recent">
        {orders.length ? <div className="seller-orders-table"><table><thead><tr>{["#", "Cliente", "Productos", "Total", "Estado", "Fecha", ""].map((label, i) => <th key={i}>{label}</th>)}</tr></thead><tbody>{orders.slice(0, 4).map(order => <tr key={order.id}><td>#{order.comu_orders.order_number}</td><td>{order.comu_orders.shipping_address_snapshot?.recipient_name || "Comprador COMU"}</td><td>{order.comu_order_items.reduce((s, i) => s + Number(i.quantity), 0)} piezas</td><td>{money(Number(order.grand_total))}</td><td><SellerOrderStatus status={order.fulfillment_status} /></td><td>{new Date(order.comu_orders.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</td><td><Link aria-label={`Ver pedido ${order.comu_orders.order_number}`} href={`/comu/seller/orders?selected=${order.id}`}>→</Link></td></tr>)}</tbody></table></div> : <SellerEmptyState>Tus pedidos aparecerán aquí cuando recibas tu primera venta.</SellerEmptyState>}
      </SellerPanel>
      <section className="seller-growth"><div><h2>Haz crecer tu negocio con COMETA.</h2><p>Estrategia, contenido y campañas para llevar tu marca más lejos.</p><button className="seller-button" disabled title="Destino COMETA pendiente de confirmación">Conocer COMETA →</button></div><div className="seller-growth-art" aria-hidden="true" /></section>
    </div>
    <aside className="seller-right-column"><section className={`seller-state ${preparing ? "preparing" : ""}`}><span className="seller-state-icon"><SellerIcon name={preparing ? "stock" : "check"} size={27} /></span><div><h2>{preparing ? "Tu tienda está en preparación" : "Tu tienda está activa"}</h2><p>{preparing ? "Prepara tu catálogo. COMETA hará la revisión final." : "Todo en orden. Tu tienda ya está visible en COMU."}</p><Link className="seller-button outline" href={preparing ? next?.href || `${base}/settings` : publicHref}>{preparing ? "Continuar preparación" : "Ver tienda pública"} →</Link></div></section>
      <SellerPanel title="Tareas rápidas"><nav className="seller-quick-actions">{[["plus", "Agregar un producto", `${base}/products`], ["bag", "Revisar pedidos", "/comu/seller/orders"], ["tag", "Configurar mayoreo", `${base}/wholesale`], ["edit", "Editar información de tienda", `${base}/store`]].map(([icon, label, href]) => <Link href={href} key={label}><SellerIcon name={icon} />{label}</Link>)}<span aria-disabled="true"><SellerIcon name="truck" />Configurar envíos <small>No disponible</small></span></nav></SellerPanel>
      <SellerPanel title="Productos que necesitan atención">{soldOut.length ? <ul className="seller-attention">{soldOut.slice(0, 3).map(p => <li key={p.id}><SellerIcon name="box" /><div><strong>{p.name}</strong><small>Sin stock disponible</small></div><Link href={`${base}/products`} aria-label={`Revisar ${p.name}`}>→</Link></li>)}</ul> : <SellerEmptyState>No hay productos sin stock registrado.</SellerEmptyState>}<Link className="seller-text-link" href={`${base}/products`}>Ver todos los productos →</Link></SellerPanel>
      <section className="seller-panel seller-support" id="seller-help"><span className="seller-metric-icon"><SellerIcon name="headset" size={29} /></span><div><h2>¿Necesitas ayuda?</h2><p>Nuestro equipo está listo para apoyarte.</p><button className="seller-button outline" disabled title="Canal de soporte pendiente de confirmación">Contactar soporte →</button></div></section>
    </aside>
  </div>;
}
