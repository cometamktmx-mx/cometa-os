"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PaymentStatus } from "@/app/api/comu/orders/[id]/payment-status/route";

export default function OrderConfirmation({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    void params.then(async ({ id }) => {
      if (disposed) return;
      setError(false);
      const response = await fetch(`/api/comu/orders/${encodeURIComponent(id)}/payment-status`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.ok || result.order?.id !== id) throw new Error("order unavailable");
      if (!disposed) setData(result);
    }).catch(() => { if (!disposed) setError(true); }).finally(() => clearTimeout(timer));
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [params, attempt]);
  const frame = "mx-auto max-w-3xl px-5 py-16";
  if (error) return <main className={frame}><h1 className="text-2xl font-bold">No pudimos consultar tu pedido.</h1><p className="mt-3">Inicia sesión con la cuenta que realizó la compra e inténtalo nuevamente.</p><button onClick={() => setAttempt((value) => value + 1)} className="mt-6 font-bold underline">Reintentar</button></main>;
  if (!data) return <main className={frame}><p role="status">Consultando tu compra…</p></main>;
  const { order, payment } = data;
  const detailUrl = `/comu/account/orders/${encodeURIComponent(order.id)}?view=detail`;
  if (order.status !== "PAID" || payment?.status !== "SUCCEEDED") {
    const late = payment?.status === "PAYMENT_RECEIVED_AFTER_EXPIRY" || order.status === "PAYMENT_RECEIVED_AFTER_EXPIRY";
    return <main className={frame}><h1 className="text-3xl font-bold">{late ? "Tu compra está en revisión" : "Consulta el estado de tu pedido"}</h1><p className="mt-4">{late ? "Recibimos tu pago, pero tu reserva expiró antes de confirmarse. No necesitas volver a pagar. Nuestro equipo revisará tu compra." : "Todavía no podemos mostrar una confirmación de compra. Consulta el estado de tu pedido antes de intentar otro pago."}</p><Link href={detailUrl} className="mt-6 inline-block font-bold underline">Ver estado del pedido</Link></main>;
  }
  const money = (amount: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: order.currency }).format(amount);
  const address = order.shipping_address;
  return <main className={frame}>
    <div className="text-center"><div aria-hidden="true" className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-4xl text-emerald-900 motion-safe:animate-[pulse_0.6s_ease-out_1]">✓</div><p className="mt-5 text-xs font-bold uppercase tracking-[.2em] text-emerald-800">Pedido confirmado</p><h1 className="mt-3 text-4xl font-black tracking-tight">¡Gracias por tu compra!</h1><p className="mt-4 text-[#72675e]">Te avisaremos cuando tus piezas avancen.</p></div>
    <section className="mt-10 rounded-3xl border border-[#d9cfc4] bg-[#fffdf9] p-6"><h2 className="text-xl font-bold">Orden #{order.order_number}</h2><p className="mt-2 text-sm text-[#72675e]">{new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(new Date(order.created_at))}</p><p className="mt-4 text-2xl font-bold">Total pagado {money(payment.amount_cents / 100)}</p></section>
    <section className="mt-5 rounded-3xl border border-[#d9cfc4] bg-[#fffdf9] p-6"><h2 className="text-xl font-bold">Dirección de entrega</h2><address className="mt-4 space-y-1 not-italic text-[#72675e]">{[address.recipient_name, address.line1, address.line2, [address.city, address.state, address.postal_code].filter(Boolean).join(", "), address.country, address.references].filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}</address></section>
    <section className="mt-5 space-y-5" aria-label="Tus piezas y tiendas">{order.sellers.map((seller) => <article key={seller.id} className="rounded-3xl border border-[#d9cfc4] bg-[#fffdf9] p-6"><h2 className="text-xl font-bold">{seller.name}</h2><ul className="mt-4 divide-y divide-[#d9cfc4]">{order.items.filter((item) => item.suborder_id === seller.id).map((item) => <li key={item.id} className="flex justify-between gap-4 py-4"><div><p className="font-bold">{item.title}</p><p className="text-sm text-[#72675e]">{item.variant} · Cantidad: {item.quantity}</p></div><span>{money(item.subtotal)}</span></li>)}</ul><p className="mt-3 text-right font-bold">Total de la tienda {money(seller.total)}</p></article>)}</section>
    <nav className="mt-10 flex flex-wrap justify-center gap-4"><Link href={detailUrl} className="rounded-full bg-[#17201d] px-6 py-3 font-bold text-white">Ver mi pedido</Link><Link href="/comu/search" className="rounded-full border border-[#d9cfc4] px-6 py-3 font-bold">Seguir explorando</Link></nav>
  </main>;
}
