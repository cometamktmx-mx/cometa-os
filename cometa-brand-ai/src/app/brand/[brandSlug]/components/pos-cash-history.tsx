"use client";
import { useEffect, useState } from "react";
import { usePosContext } from "./pos-shell";

type Event = { id: string; created_at: string; action: string; actor_name: string; authorized_name: string | null; amount: number | string | null; reason: string | null; register_name: string | null; sale_number: string | null; method: string | null; currency?: string };
const labels: Record<string, string> = {
  INVENTORY_ADJUSTMENT: "Ajuste de inventario",
  CASH_SESSION_OPEN: "Apertura de caja", CASH_SESSION_CLOSE: "Cierre de caja", CASH_IN: "Entrada", CASH_OUT: "Retiro / salida", CASH_ADJUSTMENT: "Ajuste de caja", CASH_COUNTED: "Efectivo contado", CASH_DIFFERENCE: "Diferencia de cierre",
  SALE_CHARGE: "Cobro", PAYMENT_COLLECTED: "Cobro", PARTIAL_PAYMENT_COLLECTED: "Pago parcial", CHECK_OPENED: "Cuenta abierta", ORDER_SENT: "Pedido enviado", ORDER_PREPARATION_STARTED: "Preparación iniciada", ORDER_READY: "Pedido listo", ORDER_SERVED: "Pedido entregado", PAYMENT_REQUESTED: "Cobro solicitado", CUSTOMER_CHANGED: "Cliente cambiado", LOYALTY_REDEMPTION: "Recompensa utilizada", FOOD_RECIPES_CONFIG: "Operación de inventario / recetas", SUPERVISOR_AUTHORIZE: "Autorización de encargado", STAFF_LOGIN: "Ingreso del operador", STAFF_LOGOUT: "Salida del operador", STAFF_SWITCH: "Cambio de operador", STAFF_LOCK: "Terminal bloqueada", STAFF_CREATE: "Operador creado", STAFF_UPDATE: "Operador actualizado", STAFF_PIN_RESET: "PIN actualizado",
};
export function PosCashHistory({ cashSessionId, currency = "MXN", revision = "" }: { cashSessionId?: string; currency?: string; revision?: string }) {
  const { brand } = usePosContext();
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/pos/cash-audit?brandSlug=${encodeURIComponent(brand.slug)}${cashSessionId ? `&cashSessionId=${encodeURIComponent(cashSessionId)}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo cargar el historial."); if (!controller.signal.aborted) { setEvents(body.events || []); setError(null); setLoaded(true); } })
      .catch(e => { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : "No se pudo cargar el historial."); setLoaded(true); } });
    return () => controller.abort();
  }, [brand.slug, cashSessionId, revision]);
  return <section className="mt-5 rounded-2xl border border-[var(--pos-line)] bg-[var(--pos-panel)] p-4"><h3 className="font-semibold text-[var(--pos-text-primary)]">{cashSessionId ? "Historial del turno" : "Actividad del equipo"}</h3><p className="mt-1 text-xs text-[var(--pos-text-muted)]">Últimos 300 eventos · orden cronológico</p>
    {!loaded ? <p role="status" className="py-4 text-[var(--pos-text-muted)]">Cargando historial…</p> : error ? <p role="alert" className="py-4 text-[var(--pos-danger)]">{error}</p> : !events.length ? <p className="py-4 text-[var(--pos-text-muted)]">Sin eventos registrados.</p> : <ol className="mt-4 divide-y divide-[var(--pos-line-subtle)]">{events.map(event => <li key={event.id} className="flex flex-wrap justify-between gap-3 py-3">
      <div><time className="text-xs text-[var(--pos-text-muted)]">{new Date(event.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time><p className="font-medium text-[var(--pos-text-primary)]">{labels[event.action] || "Acción operacional"}{event.sale_number ? ` · Venta ${event.sale_number}` : ""}</p><p className="text-sm text-[var(--pos-text-secondary)]">{event.action.includes("PAYMENT") || event.action === "SALE_CHARGE" ? "Cobró" : "Realizó"}: {event.actor_name}</p>{event.authorized_name ? <p className="text-sm text-[var(--pos-primary-text)]">Autorizó: {event.authorized_name}</p> : null}{event.reason ? <p className="mt-1 text-sm text-[var(--pos-text-muted)]">{event.reason}</p> : null}</div>
      <div className="text-right">{event.amount !== null ? <p className="font-semibold tabular-nums text-[var(--pos-text-primary)]">{new Intl.NumberFormat("es-MX", { style: "currency", currency: event.currency || currency }).format(Number(event.amount))}</p> : null}<p className="text-xs text-[var(--pos-text-muted)]">{event.method === "cash" ? "Efectivo" : event.method === "card" ? "Tarjeta" : event.method ? "Otro" : ""}</p><p className="text-xs text-[var(--pos-text-muted)]">{event.register_name}</p></div>
    </li>)}</ol>}
  </section>;
}
