"use client";
import { useEffect, useState } from "react";
import { formatMxn } from "@/lib/comu/buyer-experience";
type Delivery = { subtotal: number; shipping: number; shipments: Array<{ tracking_number: string; carrier: string | null }> };
export default function DeliveryDetail({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Delivery | null>(null), [error, setError] = useState(false);
  useEffect(() => { let active = true; void fetch(`/api/comu/buyer/order-delivery?orderId=${encodeURIComponent(orderId)}`).then(async response => { if (!response.ok) throw new Error(); const result = await response.json(); if (active) setData(result); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [orderId]);
  return <section className="rounded-3xl border border-[#d9cfc4] bg-[#fffdf9] p-6"><h2 className="text-lg font-bold">Envío y seguimiento</h2>{error ? <p className="mt-3 text-sm">No pudimos consultar el envío en este momento.</p> : !data ? <p role="status" className="mt-3 text-sm">Consultando entrega…</p> : <><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt>Productos</dt><dd>{formatMxn(data.subtotal)}</dd></div><div className="flex justify-between gap-3"><dt>Envío registrado</dt><dd>{formatMxn(data.shipping)}</dd></div></dl>{data.shipments.length ? data.shipments.map(row => <p key={row.tracking_number} className="mt-5 break-all text-sm">{row.carrier && !/skydrop|local_test|cometa test/i.test(row.carrier) ? row.carrier : "Envío"}<br /><span className="font-semibold">Guía: {row.tracking_number}</span></p>) : <p className="mt-5 text-xs leading-6 text-[#72675e]">La guía aparecerá cuando esté disponible.</p>}</>}</section>;
}
