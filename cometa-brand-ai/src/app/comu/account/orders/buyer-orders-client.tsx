"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { BuyerOrderDetail, BuyerOrderList } from "@/lib/comu/buyer-order-contract";
import { BuyerOrderCard, OrderDetailView, OrderIcon, orderDate, orderFolio } from "./buyer-orders-ui";

function useBuyerRead<T>(url: string) {
  const [state, setState] = useState<{ url: string; data?: T; error?: boolean }>({ url });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let disposed = false;
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("BUYER_READ_UNAVAILABLE");
      if (!disposed) setState({ url, data });
    }).catch(() => { if (!disposed) setState({ url, error: true }); }).finally(() => clearTimeout(timeout));
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [url, revision]);
  return { data: state.url === url ? state.data : undefined, error: state.url === url && state.error, retry: () => { setState({ url }); setRevision(value => value + 1); } };
}
function ReadState({ error, retry }: { error?: boolean; retry: () => void }) {
  return error ? <section className="b2-empty" role="alert"><OrderIcon kind="issue" /><h2>No pudimos consultar tus pedidos.</h2><p>Verifica tu sesión e inténtalo nuevamente.</p><button className="comu-button" onClick={retry}>Reintentar</button><Link className="b2-text-link" href="/comu/account">Ir a mi cuenta</Link></section> : <div className="b2-loading" role="status"><span className="b2-skeleton" /><span className="b2-skeleton" /><p>Consultando tus pedidos…</p></div>;
}
export function BuyerOrdersClient() {
  const [filter, setFilter] = useState("ALL"), [days, setDays] = useState("90"), [page, setPage] = useState(1), [search, setSearch] = useState("");
  const params = new URLSearchParams({ contract: "b1", status: filter, days, page: String(page), pageSize: "8", search });
  const { data, error, retry } = useBuyerRead<BuyerOrderList>(`/api/comu/orders?${params}`);
  function searchOrders(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSearch(String(new FormData(event.currentTarget).get("search") || "").trim()); setPage(1); }
  return <main className="b2-orders" data-b2="list"><Link href="/comu/account/buyer" className="b2-back">← Mi cuenta</Link><header className="b2-page-heading"><div><p className="b2-eyebrow">Tu espacio COMU</p><h1>Mis pedidos</h1><p>Sigue tus compras y revisa todo lo que has pedido en COMU.</p></div><span className="b2-heading-mark" aria-hidden="true"><OrderIcon /></span></header>
    <div className="b2-filters"><div className="b2-tabs" role="group" aria-label="Filtrar pedidos">{[["ALL", "Todos"], ["PREPARING", "En preparación"], ["IN_TRANSIT", "En camino"], ["DELIVERED", "Entregados"], ["ISSUE", "Con incidencia"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); }}>{label}</button>)}</div><form onSubmit={searchOrders} className="b2-search" role="search"><OrderIcon kind="search" /><input name="search" aria-label="Buscar por folio" placeholder="Buscar por folio" maxLength={80} /><button type="submit" aria-label="Buscar pedido">→</button></form><select aria-label="Periodo de pedidos" value={days} onChange={event => { setDays(event.target.value); setPage(1); }}><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option></select></div>
    {!data ? <ReadState error={error} retry={retry} /> : data.orders.length ? <><div className="b2-order-list">{data.orders.map(order => <BuyerOrderCard key={order.orderId} order={order} />)}</div><nav className="b2-pagination" aria-label="Páginas de pedidos"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)} aria-label="Página anterior">←</button><span>Página {data.pagination.page} de {Math.max(1, data.pagination.totalPages)}</span><button disabled={page >= data.pagination.totalPages} onClick={() => setPage(value => value + 1)} aria-label="Página siguiente">→</button></nav></> : <section className="b2-empty"><OrderIcon /><h2>{search || filter !== "ALL" || page > 1 ? "No encontramos pedidos con estos filtros." : "Aún no tienes pedidos."}</h2><p>{search || filter !== "ALL" ? "Prueba otro folio o cambia el periodo." : "Cuando encuentres tu próxima pieza, podrás seguirla aquí."}</p><Link href="/comu/search" className="comu-button">Explorar COMU</Link></section>}
    <BottomNavigation />
  </main>;
}
export function BuyerOrderDetailClient({ id, context }: { id: string; context: string }) {
  const { data, error, retry } = useBuyerRead<{ order: BuyerOrderDetail }>(`/api/comu/orders/${encodeURIComponent(id)}${context ? `?${context}` : ""}`);
  const order = data?.order.orderId === id.toLowerCase() ? data.order : undefined;
  useEffect(() => { if (order?.context.focusSuborderId) { const target = document.getElementById(`brand-${order.context.focusSuborderId}`); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "center", behavior: "instant" }); } }, [order]);
  return <main className="b2-orders b2-order-detail" data-b2="detail"><Link href="/comu/account/orders" className="b2-back">← Volver a mis pedidos</Link>{order ? <><header className="b2-page-heading"><div><p className="b2-eyebrow">Tu compra, paso a paso</p><h1>Pedido {orderFolio(order.orderNumber)}</h1><time dateTime={order.createdAt}>{orderDate(order.createdAt)}</time></div><button className="b2-refresh" onClick={retry}>Actualizar seguimiento ↻</button></header><OrderDetailView order={order} /></> : <ReadState error={error || Boolean(data)} retry={retry} />}<BottomNavigation /></main>;
}
function BottomNavigation() {
  return <nav className="b2-bottom-nav" aria-label="Navegación Buyer"><Link href="/comu">⌂<span>Inicio</span></Link><Link href="/comu/search"><OrderIcon kind="search" /><span>Explorar</span></Link><Link href="/comu/cart"><OrderIcon /><span>Carrito</span></Link><Link href="/comu/account/orders" aria-current="page"><OrderIcon kind="truck" /><span>Pedidos</span></Link><Link href="/comu/account">○<span>Cuenta</span></Link></nav>;
}
