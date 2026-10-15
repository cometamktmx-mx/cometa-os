"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { paymentLabels, type SellerOrder } from "@/lib/comu/order-presentation";
import { incidentLabel, orderActionLabel, orderBadge, orderDate, orderDelivery, orderMoney, orderPrimaryAction, orderTimeline, snapshotImage, snapshotVariant, trackingLabel } from "./orders-view";

export function OrderBadge({ order }: { order: SellerOrder }) {
  const badge = orderBadge(order);
  return <span className={`orders-badge orders-badge--${badge.tone}`}>{badge.label}</span>;
}
export function OrderThumbnail({ item }: { item?: SellerOrder["items"][number] }) {
  const [failed, setFailed] = useState(false);
  const image = snapshotImage(item?.image || null);
  return <span className="orders-thumbnail">{image && !failed ? <Image src={image} alt={item?.title || "Producto"} width={56} height={64} unoptimized onError={() => setFailed(true)} /> : <span aria-label="Sin imagen">◇</span>}</span>;
}
type Props = {
  selectedId: string; order: SellerOrder | null; loading: boolean; error: string | null; pending: boolean;
  notice: { kind: "success" | "error"; text: string } | null;
  onClose: () => void; onRetry: () => void; onAdvance: (order: SellerOrder) => void;
};
export default function OrdersDetail({ selectedId, order, loading, error, pending, notice, onClose, onRetry, onAdvance }: Props) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, summary, [tabindex="0"]') || []).filter(el => el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [onClose, selectedId]);
  const action = order ? orderPrimaryAction(order) : undefined;
  return <div className="orders-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="orders-detail" ref={panel} role="dialog" aria-modal="true" aria-labelledby="orders-detail-title" aria-busy={loading || pending}>
      <header className="orders-detail-header"><div><span className="orders-eyebrow">Detalle de pedido</span><h2 id="orders-detail-title">{order ? `#COMU-${order.orderNumber}` : "Pedido"}</h2></div><button ref={close} onClick={onClose} className="orders-close" aria-label="Cerrar detalle">×</button></header>
      <div className="orders-detail-scroll">
        {loading && !order && <p className="orders-feedback" role="status">Cargando pedido…</p>}
        {error && <div className="orders-feedback orders-feedback--error" role="alert">{error}<button onClick={onRetry}>Reintentar</button></div>}
        {!loading && !error && !order && <p className="orders-feedback">No encontramos este pedido en esta tienda.</p>}
        {order && <>
          <div className="orders-detail-status"><OrderBadge order={order} /><time dateTime={order.createdAt}>{orderDate(order.createdAt, true)}</time></div>
          {(order.fulfillmentState === "ISSUE" || order.incidents.length > 0) && <section className="orders-issue" aria-label="Incidencias"><strong>Este pedido requiere atención</strong><p>Revisa las incidencias registradas antes de continuar.</p>{order.incidents.map(incident => <p key={incident.id}>{incidentLabel(incident.type)} · {orderDate(incident.createdAt, true)}</p>)}</section>}
          <section className="orders-section"><h3>Seguimiento del pedido</h3><ol className="orders-timeline">{orderTimeline(order).map(stage => <li key={stage.label} data-evidenced={Boolean(stage.event)}><span className="orders-timeline-dot" aria-hidden="true">{stage.event ? "✓" : ""}</span><strong>{stage.label}</strong>{stage.event ? <time dateTime={stage.event.at}>{orderDate(stage.event.at, true)}</time> : <small>Sin confirmación</small>}</li>)}</ol>{order.timeline.length > 0 && <details className="orders-event-history"><summary>Ver historial</summary><ol>{order.timeline.map(event => <li key={event.id}><span>{event.label}</span><time dateTime={event.at}>{orderDate(event.at, true)}</time></li>)}</ol></details>}</section>
          <section className="orders-section"><h3>Productos <span>{order.items.reduce((count, item) => count + item.quantity, 0)}</span></h3><div className="orders-detail-products">{order.items.map(item => <article key={item.id} className="orders-detail-product"><OrderThumbnail item={item} /><div><strong>{item.title || "Producto"}</strong>{snapshotVariant(item) && <p>{snapshotVariant(item)}</p>}{item.sku && <small>SKU: {item.sku}</small>}<p>{item.quantity} × {orderMoney(item.unitPrice, order.currency)}</p></div><b>{orderMoney(item.total, order.currency)}</b></article>)}{order.items.length === 0 && <p>Sin productos disponibles.</p>}</div></section>
          <div className="orders-detail-grid"><section className="orders-info-card"><h3>Destinatario</h3><p>{order.recipientName || "No disponible"}</p></section><section className="orders-info-card"><h3>Entrega</h3><strong>{orderDelivery(order)}</strong>{order.shippingMode === "FAST" && <p>Modalidad rápida</p>}{order.tracking.map((tracking, index) => <div className="orders-tracking" key={`${tracking.trackingNumber || index}-${tracking.status}`}><p>{trackingLabel(tracking.status)}</p>{tracking.carrier && <p>{tracking.carrier}</p>}{tracking.trackingNumber && <p>Guía: {tracking.trackingNumber}</p>}</div>)}</section></div>
          <section className="orders-payment"><div><h3>Pago</h3><span className={`orders-badge orders-badge--${order.paymentPresentation === "PAID" ? "paid" : "neutral"}`}>{paymentLabels[order.paymentPresentation]}</span></div><div><span>Total del pedido</span><strong>{orderMoney(order.total, order.currency)}</strong><small>{order.currency}</small></div></section>
        </>}
      </div>
      {order && <footer className={`orders-next ${action ? "orders-next--action" : ""}`}><span className="orders-eyebrow">Siguiente acción</span><h3>{action ? orderActionLabel(order) : order.nextAction.label}</h3>{order.route === "DIRECT" && order.fulfillmentState === "READY_TO_SHIP" && !order.shipmentPrepared && <p>El envío debe estar preparado para confirmar su salida.</p>}{notice && <p role={notice.kind === "error" ? "alert" : "status"} className={`orders-notice orders-notice--${notice.kind}`}>{notice.text}</p>}{action && <button className="orders-primary" disabled={pending || loading || Boolean(error)} onClick={() => onAdvance(order)}>{pending ? "Confirmando…" : orderActionLabel(order)}<span aria-hidden="true">→</span></button>}</footer>}
    </section>
  </div>;
}
