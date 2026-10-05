"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SellerOrder } from "@/lib/comu/order-presentation";
import OrdersDetail, { OrderBadge, OrderThumbnail } from "./orders-detail";
import { orderDate, orderDelivery, orderFilters, orderMetrics, orderMoney, orderPrimaryAction } from "./orders-view";
import "./orders-v4.css";

type OrdersPage = { orders: SellerOrder[]; selected: SellerOrder | null; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
const emptyPage: OrdersPage = { orders: [], selected: null, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
type Props = { sellerId: string; brandSlug?: string };
export default function SellerOrdersManager(props: Props) { return <OrdersWorkspace key={props.sellerId} {...props} />; }

function OrdersWorkspace({ sellerId }: Props) {
  const params = useSearchParams();
  const query = params.toString();
  const search = params.get("search") || "";
  const status = params.get("status") || "ALL";
  const days = params.get("days") === "90" ? "90" : "30";
  const selectedId = params.get("selected");
  const [data, setData] = useState<OrdersPage>(emptyPage);
  const [fetching, setLoading] = useState(true);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const loading = fetching || loadedQuery !== query;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ orderId: string; kind: "success" | "error"; text: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const mutationLock = useRef(false);
  const sequence = useRef(0);
  const changeQuery = useCallback((values: Record<string, string | null>) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  const closeDetail = useCallback(() => changeQuery({ selected: null }), [changeQuery]);
  const refresh = useCallback(() => { setLoading(true); setRevision(value => value + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++sequence.current;
    const timer = setTimeout(async () => {
      setLoading(true); setError(null);
      const request = new URLSearchParams(query);
      request.set("contract", "o1"); request.set("sellerId", sellerId); request.set("pageSize", "20");
      if (!request.has("days")) request.set("days", "30");
      try {
        const response = await fetch("/api/comu/seller/orders?" + request, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.message || "No se pudieron cargar los pedidos.");
        if (requestId === sequence.current) setData(result);
      } catch (failure) {
        if (!controller.signal.aborted && requestId === sequence.current) { setData(emptyPage); setError(failure instanceof Error ? failure.message : "No se pudieron cargar los pedidos."); }
      } finally { if (!controller.signal.aborted && requestId === sequence.current) { setLoadedQuery(query); setLoading(false); } }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, sellerId, revision]);
  const openDetail = (id: string) => { setNotice(null); changeQuery({ selected: id }); };
  const selected = selectedId ? data.selected?.suborderId === selectedId ? data.selected : data.orders.find(order => order.suborderId === selectedId) || null : null;
  async function advance(order: SellerOrder) {
    const action = orderPrimaryAction(order);
    if (!action || mutationLock.current || loading) return;
    mutationLock.current = true; setPending(true); setNotice(null);
    try {
      const response = await fetch(`/api/comu/seller/orders/${encodeURIComponent(order.suborderId)}/fulfillment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerId, status: action.target }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "No se pudo confirmar la acción. Puedes reintentar.");
      if (result.suborder) setData(current => ({ ...current, selected: current.selected?.suborderId === order.suborderId ? result.suborder : current.selected, orders: current.orders.map(row => row.suborderId === order.suborderId ? result.suborder : row) }));
      setNotice({ orderId: order.suborderId, kind: "success", text: "Pedido actualizado correctamente." });
    } catch (failure) { setNotice({ orderId: order.suborderId, kind: "error", text: failure instanceof Error ? failure.message : "No se pudo confirmar la acción. Puedes reintentar." }); }
    finally { setPending(false); mutationLock.current = false; refresh(); }
  }
  const filtered = Boolean(search.trim()) || status !== "ALL";
  return <main className="orders-v4" aria-label="Pedidos Seller">
    <header className="orders-header"><div><span className="orders-eyebrow">Tu operación, al día</span><h1>Pedidos</h1><p>Gestiona cada venta desde que se confirma hasta que llega al cliente.</p></div><label className="orders-search"><span aria-hidden="true">⌕</span><input aria-label="Buscar por folio, producto o SKU" placeholder="Buscar por folio, producto o SKU" value={search} onChange={event => changeQuery({ search: event.target.value || null, page: null })} /></label></header>
    <section className="orders-metrics" aria-label="Estados de los pedidos de esta página">{orderMetrics(data.orders).map(metric => <button key={metric.key} className={`orders-metric orders-metric--${metric.key.toLowerCase()}`} aria-pressed={status === metric.key} onClick={() => changeQuery({ status: status === metric.key ? null : metric.key, page: null })}><span>{metric.label}</span><strong>{loading ? "—" : metric.count}</strong><span className="orders-metric-arrow" aria-hidden="true">↗</span></button>)}</section>
    <p className="orders-count-note">Conteos de los pedidos de esta página{!loading && ` · ${data.orders.length} de ${data.pagination.total} resultados`}</p>
    <section className="orders-list-panel" aria-busy={loading}>
      <div className="orders-toolbar"><div className="orders-filters" aria-label="Filtrar por estado">{orderFilters.map(([key, label]) => <button key={key} aria-pressed={status === key} onClick={() => changeQuery({ status: key === "ALL" ? null : key, page: null })}>{label}</button>)}</div><label className="orders-period"><span>Periodo</span><select aria-label="Periodo" value={days} onChange={event => changeQuery({ days: event.target.value, page: null })}><option value="30">30 días</option><option value="90">90 días</option></select></label></div>
      <div className="orders-list-caption"><strong>Tus pedidos</strong><span>Más recientes primero</span></div>
      {error ? <div className="orders-feedback orders-feedback--error" role="alert"><p>{error}</p><button onClick={refresh}>Reintentar</button></div> : loading && !data.orders.length ? <p className="orders-feedback" role="status">Cargando pedidos…</p> : data.orders.length === 0 ? <div className="orders-empty"><span aria-hidden="true">◇</span><h2>{filtered ? "No encontramos pedidos con estos filtros." : "Aún no tienes pedidos."}</h2><p>{filtered ? "Prueba otra búsqueda o cambia el estado." : "Cuando recibas una venta, podrás acompañarla en cada paso desde aquí."}</p>{filtered && <button onClick={() => changeQuery({ search: null, status: null, page: null })}>Limpiar filtros</button>}</div> : <>
        <div className="orders-table-wrap"><table className="orders-table"><thead><tr>{["Pedido", "Destinatario", "Productos", "Total", "Entrega", "Estado", "Fecha", "Acción"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{data.orders.map(order => <tr key={order.suborderId} data-order-id={order.suborderId}><td><button className="orders-folio" onClick={() => openDetail(order.suborderId)}>#COMU-{order.orderNumber}</button></td><td>{order.recipientName || "No disponible"}</td><td><div className="orders-product-summary"><OrderThumbnail item={order.items[0]} /><div><strong>{order.items[0]?.title || "Productos del pedido"}</strong><small>{order.items.reduce((count, item) => count + item.quantity, 0)} productos</small></div></div></td><td className="orders-total">{orderMoney(order.total, order.currency)}</td><td>{orderDelivery(order)}</td><td><OrderBadge order={order} /></td><td><time dateTime={order.createdAt}>{orderDate(order.createdAt)}</time></td><td><button className="orders-open" aria-label={`Ver pedido #COMU-${order.orderNumber}`} onClick={() => openDetail(order.suborderId)}>Ver pedido <span aria-hidden="true">›</span></button></td></tr>)}</tbody></table></div>
        <div className="orders-cards">{data.orders.map(order => <article className="orders-card" key={order.suborderId} data-order-id={order.suborderId}><header><button className="orders-folio" onClick={() => openDetail(order.suborderId)}>#COMU-{order.orderNumber}</button><OrderBadge order={order} /></header><div className="orders-product-summary"><OrderThumbnail item={order.items[0]} /><div><strong>{order.items[0]?.title || "Productos del pedido"}</strong><small>{order.items.reduce((count, item) => count + item.quantity, 0)} productos · {order.recipientName || "Destinatario no disponible"}</small></div></div><div className="orders-card-meta"><span>{orderDelivery(order)}</span><strong>{orderMoney(order.total, order.currency)}</strong></div><footer><time dateTime={order.createdAt}>{orderDate(order.createdAt)}</time><button className="orders-open" onClick={() => openDetail(order.suborderId)}>Ver pedido <span aria-hidden="true">›</span></button></footer></article>)}</div>
      </>}
      {data.pagination.total > 0 && <footer className="orders-pagination"><span>Página {data.pagination.page} de {Math.max(1, data.pagination.totalPages)} · {data.pagination.total} pedidos</span><div><button disabled={loading || data.pagination.page <= 1} onClick={() => changeQuery({ page: String(data.pagination.page - 1) })}>Anterior</button><button disabled={loading || data.pagination.page >= data.pagination.totalPages} onClick={() => changeQuery({ page: String(data.pagination.page + 1) })}>Siguiente</button></div></footer>}
    </section>
    {selectedId && <OrdersDetail selectedId={selectedId} order={selected} loading={loading} error={error} pending={pending} notice={notice?.orderId === selectedId ? notice : null} onClose={closeDetail} onRetry={refresh} onAdvance={advance} />}
  </main>;
}
