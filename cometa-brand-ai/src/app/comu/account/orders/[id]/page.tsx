"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PaymentStatus } from "@/app/api/comu/orders/[id]/payment-status/route";
type FulfillmentView = { status?: string };

export default function BuyerOrder({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tracking, setTracking] = useState<"live" | "delayed" | "paused" | "stable">("live");
  const [fulfillment, setFulfillment] = useState<FulfillmentView | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let loaded = false;
    let transient = true;
    let controller: AbortController | undefined;
    let next: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let wake: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    function schedule() {
      if (disposed) return;
      clearTimeout(next);
      const elapsed = Date.now() - startedAt;
      setTracking(!transient ? "stable" : elapsed >= 900000 ? "paused" : elapsed >= 120000 ? "delayed" : "live");
      if (!transient || document.visibilityState === "hidden" || elapsed >= 900000) return;
      next = setTimeout(() => void refresh(), Math.min(elapsed >= 120000 ? 15000 : 2000, 900000 - elapsed));
    }

    async function refresh() {
      if (disposed || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      clearTimeout(next);
      setRefreshing(true);
      controller = new AbortController();
      timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const { id } = await params;
        if (disposed) return;
        const response = await fetch('/api/comu/orders/' + encodeURIComponent(id) + '/payment-status', { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (disposed) return;
        if ([401, 403, 404].includes(response.status)) transient = false;
        if (!response.ok || !result.ok || result.order?.id !== id) throw new Error("order unavailable");
        const paid = result.order.status === "PAID" && result.payment?.status === "SUCCEEDED";
        const stoppedOrder = ["EXPIRED", "CANCELLED", "FAILED", "PAYMENT_RECEIVED_AFTER_EXPIRY", "COMPLETED", "PARTIALLY_FULFILLED", "REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"].includes(result.order.status);
        const stoppedPayment = ["FAILED", "CANCELLED", "PAYMENT_RECEIVED_AFTER_EXPIRY", "REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"].includes(result.payment?.status);
        transient = !paid && !stoppedOrder && !stoppedPayment && (["PAYMENT_PENDING", "PAID", "PROCESSING", "CONFIRMING"].includes(result.order.status) || ["PROCESSING", "CONFIRMING", "REQUIRES_PAYMENT"].includes(result.payment?.status));
        // Preserve direct-entry confirmation; an open tracking page updates in place.
        if (!loaded && paid && !window.location.href.includes("view=detail")) window.location.replace('/comu/account/orders/' + encodeURIComponent(id) + '/confirmation');
        loaded = true;
        setData(result);
        const fulfillmentResponse = await fetch('/api/comu/orders/' + encodeURIComponent(id) + '/fulfillment', { cache: "no-store", signal: controller.signal });
        if (fulfillmentResponse.ok) { const fulfillmentData = await fulfillmentResponse.json() as { fulfillment?: FulfillmentView }; setFulfillment(fulfillmentData.fulfillment || null); }
        setError(false);
      } catch {
        if (!disposed) setError(true); // Keep the last valid snapshot during network outages.
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        if (!disposed) { setRefreshing(false); schedule(); }
      }
    }

    function resume() {
      clearTimeout(next);
      clearTimeout(wake);
      if (document.visibilityState === "hidden" || disposed) return;
      // Coalesce visibility + focus events from the same tab activation.
      wake = setTimeout(() => void refresh(), 100);
    }
    refreshRef.current = () => { clearTimeout(wake); void refresh(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    void refresh();
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(next); clearTimeout(timeout); clearTimeout(wake);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      refreshRef.current = () => {};
    };
  }, [params]);
  if (error && !data) return <main className="mx-auto max-w-5xl px-5 py-20"><section className="rounded-3xl border border-[#d9cfc4] bg-[#fffdf9] p-8"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#72675e]">Tu pedido</p><h1 className="mt-4 text-3xl font-bold">No pudimos consultar tu pedido.</h1><p className="mt-3 text-[#72675e]">Verifica tu sesión e inténtalo nuevamente. Esto no significa que tu pago haya fallado.</p><button disabled={refreshing} className="mt-6 rounded-full bg-[#252d28] px-6 py-3 font-bold text-white disabled:opacity-50" onClick={() => refreshRef.current()}>Reintentar</button></section></main>;
  if (!data) return <main className="mx-auto max-w-5xl px-5 py-20"><div role="status" className="rounded-3xl border border-[#d9cfc4] bg-[#fffdf9] p-8"><span aria-hidden="true" className="mb-4 block h-7 w-7 animate-spin rounded-full border-2 border-[#d9cfc4] border-t-emerald-800 motion-reduce:animate-none" />Consultando el estado de tu pedido…</div></main>;
  const { order, payment } = data;
  const late = payment?.status === "PAYMENT_RECEIVED_AFTER_EXPIRY" || order.status === "PAYMENT_RECEIVED_AFTER_EXPIRY";
  const confirmed = order.status === "PAID" && payment?.status === "SUCCEEDED";
  const expired = order.status === "EXPIRED";
  const cancelled = order.status === "CANCELLED";
  const failed = payment?.status === "FAILED";
  const validating = payment?.status === "PROCESSING" || payment?.status === "SUCCEEDED";
  const laterStates: Record<string, { title: string; copy: string }> = {
    PARTIALLY_FULFILLED: { title: "Tus piezas están avanzando.", copy: "Parte de tu pedido ya avanzó. Consulta aquí las piezas incluidas en tu compra." },
    COMPLETED: { title: "Pedido completado.", copy: "Gracias por comprar en COMU. Puedes consultar los detalles de tu compra aquí." },
    REFUNDED: { title: "Pedido reembolsado.", copy: "Se registró un reembolso de tu compra. El tiempo para verlo reflejado depende de tu banco." },
    PARTIALLY_REFUNDED: { title: "Reembolso parcial registrado.", copy: "Se registró un reembolso por una parte de tu compra." },
    DISPUTED: { title: "Tu compra está en revisión.", copy: "Hay una revisión abierta sobre tu compra. No realices otro pago para este pedido." },
  };
  const later = laterStates[order.status];
  const fulfillmentCopy = fulfillment?.status === "DELIVERED" ? { title: "Entregado.", copy: "Tu compra fue entregada." } : fulfillment?.status === "SHIPPED" ? { title: "En camino.", copy: "Tu compra ya está en tránsito." } : fulfillment?.status === "READY_TO_SHIP" || fulfillment?.status === "CONSOLIDATED" ? { title: "Listo para envío.", copy: "Tu compra está lista para salir." } : fulfillment?.status === "READY_FOR_CONSOLIDATION" ? { title: "Estamos reuniendo tu compra.", copy: "Tus paquetes están llegando al HUB para reunirlos." } : fulfillment?.status === "PREPARING" || fulfillment?.status === "WAITING_FOR_SELLERS" ? { title: "Preparando tu pedido.", copy: "Las tiendas están preparando tus piezas." } : undefined;
  const special = late || expired || cancelled || failed || Boolean(later);
  const title = late ? "Tu compra está en revisión." : expired ? "Tu reserva expiró." : cancelled ? "Pedido cancelado." : fulfillmentCopy?.title || (confirmed ? "Pedido confirmado." : failed ? "No pudimos completar el pago." : later?.title || "Tu pago está pendiente.");
  const copy = late ? "Recibimos tu pago, pero tu reserva expiró antes de confirmarse. Nuestro equipo revisará tu compra." : expired ? "El tiempo para confirmar tu reserva terminó." : cancelled ? "Este pedido ya no está activo." : fulfillmentCopy?.copy || (confirmed ? "El vendedor ya puede comenzar a preparar tus piezas." : failed ? "El pago no pudo completarse." : later?.copy || "Estamos validando la información de tu compra.");
  const reassurance = late || confirmed || validating ? "No necesitas volver a pagar." : !special ? "Si ya pagaste, no necesitas volver a pagar." : null;
  const steps = ["Pago recibido", "Confirmando compra", "Pedido confirmado", "Preparando pedido"];
  const completedSteps = order.status === "COMPLETED" && payment?.status === "SUCCEEDED" ? 4 : confirmed ? 3 : !special && validating ? 1 : 0;
  const activeStep = confirmed ? 3 : special ? -1 : validating ? 1 : 0;
  const address = order.shipping_address;
  const addressLines = [address.recipient_name, address.line1, address.line2, [address.city, address.state, address.postal_code].filter(Boolean).join(", "), address.country, address.references].filter(Boolean);
  const money = (amount: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: order.currency }).format(amount);
  return <main className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.24em] text-[#72675e]">Tu compra, paso a paso</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Orden #{order.order_number}</h1></div><time dateTime={order.created_at} className="text-sm text-[#72675e]">{new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(new Date(order.created_at))}</time></header>
    <p className="mt-4 flex items-center gap-2 text-xs text-[#72675e]" aria-live="off">{refreshing && <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border border-[#d9cfc4] border-t-emerald-800 motion-reduce:animate-none" />}{refreshing ? "Actualizando estado…" : error ? "No pudimos actualizar. Conservamos el último estado consultado." : tracking === "paused" ? "La confirmación está tardando más de lo esperado. Volveremos a consultar al regresar a esta pestaña." : tracking === "delayed" ? "La confirmación está tardando. Seguimos consultando automáticamente." : tracking === "stable" ? "Estado actualizado" : "Seguimiento automático"}</p>
    <section aria-labelledby="order-status-title" className="mt-8 overflow-hidden rounded-[2rem] border border-[#d9cfc4] bg-[#fffdf9]">
      <div key={`${order.status}:${payment?.status}`} className="bg-[#252d28] px-6 py-8 text-[#f8f5f0] motion-safe:animate-[pulse_0.45s_ease-out_1] sm:p-10" role="status" aria-live="polite"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#d6b796]">Estado actual · {late || expired || cancelled || failed || order.status === "DISPUTED" ? "Requiere tu atención" : confirmed ? "Compra confirmada" : "En seguimiento"}</p><h2 id="order-status-title" className="mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2><p className="mt-4 max-w-2xl leading-7 text-[#eee7dd]">{copy}</p>{reassurance && <p className="mt-4 text-sm font-bold text-[#d6b796]">{reassurance}</p>}</div>
      <div className="px-6 py-8 sm:p-10"><h3 className="sr-only">Avance de tu pedido</h3>
        <ol aria-label="Avance de tu pedido" className="grid gap-6 sm:grid-cols-4 sm:gap-3">{steps.map((step, index) => {
          const done = index < completedSteps;
          const active = index === activeStep;
          return <li key={step} aria-current={active ? "step" : undefined} className="relative flex items-center gap-4 sm:block">
            <span aria-hidden="true" className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border text-sm font-bold transition-colors duration-500 motion-reduce:transition-none ${done ? "border-emerald-900 bg-emerald-900 text-white" : active ? "border-emerald-900 bg-[#e5eee6] text-emerald-950 ring-4 ring-[#e5eee6]/60" : "border-[#d9cfc4] bg-[#fffdf9] text-[#8b8178]"}`}>{done ? "✓" : index + 1}</span>
            {index < steps.length - 1 && <span aria-hidden="true" className={`absolute left-5 top-10 h-6 w-px sm:left-10 sm:top-5 sm:h-px sm:w-[calc(100%-1.75rem)] ${done ? "bg-emerald-800" : "bg-[#d9cfc4]"}`} />}
            <div className="sm:mt-4"><p className={`text-sm font-bold ${done || active ? "text-[#252d28]" : "text-[#72675e]"}`}>{step}</p><p className="mt-1 text-xs text-[#72675e]">{done ? "Completado" : active ? index === 0 ? "Esperando confirmación del pago" : index === 3 ? "En preparación" : "En curso" : special ? "Sin avance confirmado" : "Próximamente"}</p></div>
          </li>;
        })}</ol>
        <div className="mt-8 border-t border-[#d9cfc4] pt-6"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#72675e]">Qué sigue</p><p className="mt-2 text-sm leading-6">{late ? "Nuestro equipo revisará tu compra. Puedes actualizar el estado aquí sin realizar otro pago." : confirmed ? "La siguiente etapa es la preparación de tus piezas por cada tienda. Vuelve aquí para consultar tu pedido." : failed ? data.canRetry && !expired && !cancelled ? "Puedes volver al checkout para revisar las opciones de pago. La disponibilidad del reintento se valida nuevamente allí." : "Consulta el estado de tu pedido antes de intentar otra compra. No hay un reintento disponible para este pedido." : special ? "Revisa los detalles de tu compra y actualiza el estado para consultar la información más reciente." : "El estado se actualiza automáticamente. No repitas un pago que todavía esté en proceso."}</p>
          {failed && data.canRetry && !late && !expired && !cancelled && <Link href={`/comu/checkout?orderId=${encodeURIComponent(order.id)}`} className="mt-4 inline-flex rounded-full bg-[#252d28] px-5 py-3 text-sm font-bold text-white">Volver al checkout para reintentar</Link>}
        </div>
      </div>
    </section>
    <nav aria-label="Acciones del pedido" className="my-8 flex flex-wrap items-center gap-3"><button disabled={refreshing} className="px-3 py-2 text-xs font-semibold text-[#72675e] underline underline-offset-4 disabled:opacity-50" onClick={() => refreshRef.current()}>Actualizar ahora</button><a href="#detalle-pedido" className="rounded-full border border-[#d9cfc4] px-6 py-3 text-sm font-bold transition hover:bg-[#eee7dd]">Ver detalle del pedido</a><Link href="/comu/search" className="px-3 py-3 text-sm font-bold text-emerald-900 underline underline-offset-4">Seguir explorando</Link></nav>
    <div id="detalle-pedido" className="grid scroll-mt-24 gap-5 lg:grid-cols-[1.5fr_1fr]">
      <section aria-labelledby="items-title" className="rounded-3xl border border-[#d9cfc4] bg-[#fffdf9] p-6 sm:p-8"><h2 id="items-title" className="text-xl font-bold">Tus piezas</h2><p className="mt-2 text-sm text-[#72675e]">{order.items.reduce((quantity, item) => quantity + item.quantity, 0)} piezas · {order.sellers.length} {order.sellers.length === 1 ? "tienda" : "tiendas"}</p><ul className="mt-4 divide-y divide-[#d9cfc4]">{order.items.map((item) => <li key={item.id} className="flex justify-between gap-4 py-5"><div><p className="font-bold">{item.title}</p>{item.variant && <p className="mt-1 text-sm text-[#72675e]">{item.variant}</p>}<p className="mt-1 text-sm text-[#72675e]">Cantidad: {item.quantity} · {order.sellers.find((seller) => seller.id === item.suborder_id)?.name || "Tienda"}</p></div><span className="shrink-0 text-sm font-bold">{money(item.subtotal)}</span></li>)}</ul><div className="mt-3 flex justify-between gap-4 border-t border-[#d9cfc4] pt-5 text-xl font-bold"><span>Total del pedido</span><span>{money(order.grand_total)}</span></div></section>
      <aside className="space-y-5"><section className="rounded-3xl border border-[#d9cfc4] bg-[#fffdf9] p-6"><h2 className="text-lg font-bold">Entrega en</h2><address className="mt-4 space-y-1 text-sm not-italic leading-6 text-[#72675e]">{addressLines.length ? addressLines.map((line, index) => <p key={index}>{line}</p>) : <p>No hay una dirección disponible para mostrar.</p>}</address><p className="mt-4 border-t border-[#d9cfc4] pt-4 text-xs text-[#72675e]">Dirección registrada al realizar tu pedido.</p></section><section className="rounded-3xl border border-[#d9cfc4] bg-[#fffdf9] p-6"><h2 className="text-lg font-bold">Tiendas de tu compra</h2><ul className="mt-3 divide-y divide-[#d9cfc4]">{order.sellers.map((seller) => <li key={seller.id} className="flex justify-between gap-3 py-3 text-sm"><span className="font-bold">{seller.name}</span><span>{money(seller.total)}</span></li>)}</ul></section></aside>
    </div>
  </main>;
}
