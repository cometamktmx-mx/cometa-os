import Image from "next/image";
import Link from "next/link";
import type { BuyerOrderDetail, BuyerOrderSummary, BuyerPresentation, BuyerTimelineEvent, DeliveryEstimate } from "@/lib/comu/buyer-order-contract";
import { buyerPresentationLabels, formatOrderMoney } from "@/lib/comu/buyer-order-presentation";

export const orderFolio = (value: string | number) => `#COMU-${String(value).replace(/^#?COMU-/i, "")}`;
export function orderDate(value: string, time = false) {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : "America/Mexico_City" }).format(new Date(value));
}
export function orderHero(status: BuyerPresentation) {
  const titles: Partial<Record<BuyerPresentation, string>> = { CONFIRMED: "Tu pedido está confirmado.", PREPARING: "Estamos preparando tu pedido.", GATHERING_AT_HUB: "Estamos reuniendo tu pedido.", READY_TO_SHIP: "Tu pedido está listo para envío.", PARTIALLY_IN_TRANSIT: "Parte de tu pedido está en camino.", IN_TRANSIT: "Tu pedido está en camino.", OUT_FOR_DELIVERY: "Tu pedido está en reparto.", DELIVERED: "Tu pedido fue entregado.", ISSUE: "Hay una incidencia en tu pedido." };
  return titles[status] || buyerPresentationLabels[status];
}
export function OrderIcon({ kind = "box" }: { kind?: "box" | "truck" | "check" | "issue" | "search" | "pin" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === "truck" ? <><path d="M3 5h11v12H3zM14 9h4l3 4v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></> : kind === "check" ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></> : kind === "issue" ? <><path d="m12 3 10 18H2L12 3Z M12 9v5 M12 17h.01" /></> : kind === "search" ? <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></> : kind === "pin" ? <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></> : <><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z M3 7l9 4 9-4 M12 11v10 M7 5l10 4" /></>}</svg>;
}
export function SnapshotImage({ src, alt, logo = false }: { src: string | null; alt: string; logo?: boolean }) {
  return <span className={logo ? "b2-logo" : "b2-snapshot"}><OrderIcon /><span className="b2-placeholder-word" aria-hidden="true">COMU</span>{src && <Image unoptimized src={src} alt={alt} fill sizes={logo ? "48px" : "(max-width: 600px) 64px, 100px"} onError={event => { event.currentTarget.style.visibility = "hidden"; }} />}</span>;
}
export function StatusBadge({ label, status }: { label: string; status: string }) {
  const tone = /ISSUE|EXCEPTION|FAILED/.test(status) ? "issue" : /TRANSIT|SHIPPED|DELIVERED|CONFIRMED|OUT_FOR_DELIVERY|HUB_RECEIVED|HANDED_TO_HUB|CONSOLIDATED/.test(status) ? "green" : "warm";
  return <span className={`b2-badge b2-${tone}`}><OrderIcon kind={tone === "issue" ? "issue" : status === "DELIVERED" ? "check" : /TRANSIT|SHIPPED|OUT_FOR_DELIVERY/.test(status) ? "truck" : "box"} />{label}</span>;
}
export function DeliveryEstimateView({ estimate }: { estimate: DeliveryEstimate }) {
  if (!estimate) return null;
  return <div className="b2-estimate"><span>Entrega estimada</span><strong>{orderDate(estimate.from)}{estimate.to !== estimate.from ? ` – ${orderDate(estimate.to)}` : ""}</strong></div>;
}
export function BuyerOrderCard({ order }: { order: BuyerOrderSummary }) {
  return <Link href={`/comu/account/orders/${order.orderId}?view=detail`} className="b2-order-card" data-order-id={order.orderId}>
    <div className="b2-previews">{order.previewImages.length ? order.previewImages.slice(0, 3).map(src => <SnapshotImage key={src} src={src} alt="Producto de tu pedido" />) : <SnapshotImage src={null} alt="Pedido sin imagen" />}</div>
    <div className="b2-order-info"><h2>{orderFolio(order.orderNumber)}</h2><time dateTime={order.createdAt}>{orderDate(order.createdAt)}</time><p>{order.itemCount} {order.itemCount === 1 ? "producto" : "productos"} · {order.sellerCount} {order.sellerCount === 1 ? "marca" : "marcas"}</p><strong>{formatOrderMoney(order.total, order.currency)} {!formatOrderMoney(order.total, order.currency).includes(order.currency) && <small>{order.currency}</small>}</strong></div>
    <div className="b2-order-state"><StatusBadge status={order.presentationStatus} label={order.presentationLabel} /><p>{orderHero(order.presentationStatus)}</p>{order.latestVerifiedUpdate && <small>Actualizado {orderDate(order.latestVerifiedUpdate)}</small>}<DeliveryEstimateView estimate={order.deliveryEstimate} /></div>
    <span className="b2-card-cta">Ver seguimiento <span aria-hidden="true">→</span></span>
  </Link>;
}
export function EventList({ events }: { events: BuyerTimelineEvent[] }) {
  return <ol className="b2-events">{events.map(event => <li key={event.id}><span className="b2-event-dot" aria-hidden="true" /><div><time dateTime={event.recordedAt}>{orderDate(event.recordedAt, true)}</time><strong>{event.label}</strong>{event.sellerName && <span>{event.sellerName}</span>}</div></li>)}</ol>;
}
export function OrderDetailView({ order }: { order: BuyerOrderDetail }) {
  // Group only recorded labels, retaining brand scope and the first real timestamp.
  // A check denotes an observed event, never completion of every suborder.
  const groups = new Map<string, { event: BuyerTimelineEvent; brands: Set<string> }>();
  for (const event of order.timeline) {
    const group = groups.get(event.label) || { event, brands: new Set<string>() };
    if (event.sellerName) group.brands.add(event.sellerName);
    groups.set(event.label, group);
  }
  const milestones = [...groups.values()].map(({ event, brands }) => ({ ...event, sellerName: [...brands].join(", ") || null }));
  const address = order.shippingAddress;
  const economics = order.economics;
  const money = (value: number) => formatOrderMoney(value, order.currency);
  return <>
    <section className={`b2-hero ${order.hasIssue ? "b2-hero-issue" : ""}`} aria-labelledby="b2-hero-title"><div className="b2-hero-heading"><span className="b2-hero-icon"><OrderIcon kind={order.hasIssue ? "issue" : order.presentationStatus === "DELIVERED" ? "check" : "truck"} /></span><div><h2 id="b2-hero-title">{orderHero(order.presentationStatus)}</h2><p>{order.presentationLabel}</p></div><DeliveryEstimateView estimate={order.deliveryEstimate} /></div>
      {milestones.length > 0 && <ol className="b2-milestones" aria-label="Hitos registrados del pedido">{milestones.map(event => <li key={event.id}><span aria-hidden="true">✓</span><strong>{event.label}</strong>{event.sellerName && <small>{event.sellerName}</small>}<time dateTime={event.recordedAt}>{orderDate(event.recordedAt, true)}</time></li>)}</ol>}
    </section>
    {order.limitations.length > 0 && <div className="b2-attention" role="note"><OrderIcon kind="issue" /><p>Consulta el avance de cada marca. Este pedido tiene envíos independientes y no cuenta con un seguimiento conjunto completo.</p></div>}
    {order.issues.length > 0 && <section className="b2-issues" aria-label="Incidencias">{order.issues.map(issue => <div className="b2-attention" key={issue.id}><OrderIcon kind="issue" /><div><strong>{issue.message}</strong><p>{order.suborders.find(sub => sub.suborderId === issue.suborderId)?.sellerName}</p><time dateTime={issue.createdAt}>{orderDate(issue.createdAt)}</time></div></div>)}</section>}
    <div className="b2-detail-grid">
      {order.hubProgress.totalSellers > 0 && <section className="b2-panel b2-hub"><span className="b2-hub-icon"><OrderIcon /></span><div><p className="b2-eyebrow">HUB COMETA</p><h2>{order.hubProgress.consolidated && !order.limitations.length && !order.hasIssue ? "Ya reunimos todo tu pedido." : "Estamos reuniendo tu pedido"}</h2><p>{order.hubProgress.label}</p><progress aria-label="Tiendas recibidas en HUB" max={order.hubProgress.totalSellers} value={order.hubProgress.receivedSellers} /></div></section>}
      <section className="b2-panel b2-brands"><h2>Este pedido incluye productos de {order.sellerCount} {order.sellerCount === 1 ? "marca" : "marcas"}</h2>{order.suborders.map(sub => <article id={`brand-${sub.suborderId}`} tabIndex={-1} key={sub.suborderId} className={`b2-brand ${order.context.focusSuborderId === sub.suborderId ? "b2-brand-focused" : ""}`}><div className="b2-brand-heading"><SnapshotImage src={sub.sellerLogo} alt={sub.sellerName} logo /><div><h3>{sub.sellerName}</h3><p>{sub.itemCount} {sub.itemCount === 1 ? "producto" : "productos"} · {sub.route === "HUB" ? "HUB COMETA" : "Envío directo"}</p><StatusBadge status={sub.presentationState} label={sub.presentationLabel} /></div><div className="b2-brand-images">{sub.products.slice(0, 2).map(product => <SnapshotImage key={product.id} src={product.image} alt={product.title || "Producto"} />)}</div></div>{sub.progress.length > 0 && <details><summary>Ver progreso de esta marca</summary><EventList events={sub.progress} /></details>}</article>)}</section>
      <section className="b2-panel b2-products"><h2>Productos</h2>{order.suborders.flatMap(sub => sub.products.map(product => <article className="b2-product" key={product.id}><SnapshotImage src={product.image} alt={product.title || "Producto"} /><div><h3>{product.title}</h3><p>{product.sellerNameSnapshot || sub.sellerName}</p>{product.variant && <p>{product.variant}</p>}{Object.entries(product.attributes).map(([key, value]) => <small key={key}>{key}: {String(value)} </small>)}<strong>{money(product.unitPrice)}</strong></div><span>{product.quantity} {product.quantity === 1 ? "pieza" : "piezas"}</span></article>))}</section>
      {order.timeline.length > 0 && <section className="b2-panel b2-timeline"><h2>Seguimiento del pedido</h2><EventList events={[...order.timeline].reverse()} /></section>}
      {order.tracking.length > 0 && <section className="b2-panel b2-tracking"><h2>Paquetería</h2>{order.tracking.map(shipment => <article key={shipment.shipmentId}><div className="b2-tracking-heading"><OrderIcon kind="truck" /><div><h3>{shipment.carrier || "Envío de tu pedido"}</h3>{shipment.trackingNumber && <p>Guía: <span className="b2-tracking-number">{shipment.trackingNumber}</span></p>}</div></div><StatusBadge label={shipment.presentationLabel} status={shipment.presentationState} />{shipment.latestVerifiedUpdate && <p>Último registro: {orderDate(shipment.latestVerifiedUpdate, true)}</p>}<DeliveryEstimateView estimate={shipment.deliveryEstimate} />{shipment.publicTrackingUrl && <a href={shipment.publicTrackingUrl} target="_blank" rel="noopener noreferrer" className="b2-text-link">Ver en paquetería ↗</a>}{shipment.events.length > 0 && <details><summary>Eventos del envío</summary><EventList events={[...shipment.events].reverse()} /></details>}</article>)}</section>}
      {address && <section className="b2-panel b2-address"><h2><OrderIcon kind="pin" /> Entrega</h2><address><strong>{address.recipient}</strong>{[address.line1, address.line2, [address.city, address.state].filter(Boolean).join(", "), [address.postalCode, address.country].filter(Boolean).join(" · ")].filter(Boolean).map((line, index) => <span key={index}>{line}</span>)}{address.references && <p>Referencias: {address.references}</p>}</address></section>}
      <section className="b2-panel b2-summary"><h2>Resumen del pedido</h2><p>{order.itemCount} {order.itemCount === 1 ? "producto" : "productos"} · {order.currency}</p><dl><div><dt>Productos</dt><dd>{money(economics.subtotal)}</dd></div><div><dt>Envío</dt><dd>{money(economics.shipping)}</dd></div>{economics.discount > 0 && <div><dt>Descuento</dt><dd>−{money(economics.discount)}</dd></div>}{economics.pointsTotal > 0 && <div><dt>Puntos del pedido</dt><dd>{economics.pointsTotal}</dd></div>}<div className="b2-total"><dt>Total</dt><dd>{money(economics.total)}</dd></div>{economics.refunded > 0 && <><div><dt>Reembolso realizado</dt><dd>{money(economics.refunded)}</dd></div><div><dt>Total neto</dt><dd>{money(economics.net)}</dd></div></>}</dl><div className="b2-payment"><span>Pago</span><strong>{order.payment.label}</strong></div></section>
      <aside className="b2-thanks"><span aria-hidden="true">COMU.</span><div><h2>Gracias por ser parte de COMU.</h2><p>Personas. Marcas. Historias que conectan.</p></div></aside>
    </div>
  </>;
}
