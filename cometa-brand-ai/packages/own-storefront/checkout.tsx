"use client";
import { useEffect, useRef, useState } from "react";
import { readBag, editBag, type BagLine } from "./bag";
import { emptyContact, money, type CartQuote, type Contact } from "./checkout-contract";
import type { Appearance } from "./contract";
import {orderStatusLabels,type StoreSettings} from './operations-contract';
type Order = { id: string; status: string; total_cents: number; subtotal_cents: number; shipping_cents: number; currency: string; expires_at: string;payment_method?:string;delivery_method?:string;preparation_status?:string;delivery_status?:string;tracking?:string;refund_required?:boolean;items?:{quantity:number;unit_cents:number;snapshot:{name:string;variantName:string}}[];delivery_snapshot?:{pickup?:{address?:string;hours?:string;instructions?:string}} };
const states: Record<string, string> = { PENDING: "Pago pendiente", PAID: "Pago confirmado", EXPIRED: "Intento vencido", CANCELLED: "Intento cancelado", PAYMENT_REVIEW: "Pago recibido en revisión" };
async function post(body: unknown, signal?: AbortSignal) {
  const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal });
  const data = await r.json();if (!r.ok) throw Error(data.error || "No se pudo consultar tu compra.");return data;
}
export function Checkout({ brandId, orderId = "", bagOnly = false, presentation, preview = false }: { brandId: string; orderId?: string; bagOnly?: boolean; presentation?: Appearance["bag"]; preview?: boolean }) {
  const [lines, setLines] = useState<BagLine[]>([]), [quote, setQuote] = useState<CartQuote | null>(null), [contact, setContact] = useState(emptyContact), [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(!preview), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const sequence = useRef(0), busyRef = useRef(false);
  const [payment,setPayment]=useState<{mode:string;ready:boolean;message:string}>({mode:'',ready:false,message:'Comprobando disponibilidad de tarjeta.'});
  const [settings,setSettings]=useState<StoreSettings|null>(null),[delivery,setDelivery]=useState('SHIPPING'),[method,setMethod]=useState('STRIPE');
  useEffect(() => {
    if (preview) return;
    const abort = new AbortController();
    const init = async () => {
      try {
        await post({ action: "session" }, abort.signal);
        const saved = readBag(brandId);setLines(saved);
        const response = await fetch("/api/checkout" + (orderId ? "?order=" + encodeURIComponent(orderId) : ""), { cache: "no-store", signal: abort.signal });
        const data = await response.json();if (!response.ok) throw Error(data.error);
        setOrder(data.order);
        const configuration=await fetch('/api/store-settings',{cache:'no-store',signal:abort.signal});const config=await configuration.json();if(configuration.ok&&config.settings){setSettings(config.settings);setPayment(config.payment??{mode:"",ready:false,message:"Pago con tarjeta no disponible."});setDelivery(config.settings.shipping.enabled?'SHIPPING':'PICKUP');setMethod(config.settings.payments.stripe&&config.payment?.ready?'STRIPE':config.settings.payments.whatsapp?'WHATSAPP':'STRIPE');}
        if (orderId && !data.order) throw Error("No se puede acceder a este pedido desde esta sesión.");
        if (!orderId && saved.length) setQuote(await post({ action: "quote", lines: saved }, abort.signal));
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "No se pudo recuperar tu compra."); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    };void init();return () => abort.abort();
  }, [brandId, orderId, preview]);
  const change = async (variant: string, quantity: number) => {
    const version = ++sequence.current;setQuote(null);setError("");
    try { const next = await editBag(brandId, variant, quantity);if (version !== sequence.current) return;setLines(next);if (!next.length) return;const q = await post({ action: "quote", lines: next });if (version === sequence.current) setQuote(q); }
    catch (e) { if (version === sequence.current) setError(e instanceof Error ? e.message : "No se pudo actualizar la bolsa."); }
  };
  const action = async (kind: "quote" | "pay" | "resume" | "cancel") => {
    if (busyRef.current) return;busyRef.current = true;setBusy(true);setError("");setNotice("");
    const version = ++sequence.current;
    try {
      let attempt: string | undefined;
      if (kind === "pay") {
        const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ lines, contact,delivery,method }))))].map(x => x.toString(16).padStart(2, "0")).join("");
        const key = "store.attempt.v1." + brandId;let saved: { digest?: string; id?: string } = {};
        try { saved = JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { /* corrupt attempt is not an order */ }
        attempt = saved.digest === digest && typeof saved.id === "string" ? saved.id : crypto.randomUUID();
        // If persistence is unavailable, refuse creating an unrecoverable provider attempt.
        localStorage.setItem(key, JSON.stringify({ digest, id: attempt }));
      }
      const result = await post(kind === "resume" || kind === "cancel" ? { action: kind, order: order?.id } : { action: kind, lines, contact,delivery,method, ...(attempt ? { attempt } : {}) });
      if (version !== sequence.current) return;
      if (kind === "quote") setQuote(result);
      if (result.order) setOrder(result.order);
      if (result.url) { const url = new URL(result.url);if (url.protocol !== "https:" || !['checkout.stripe.com','wa.me'].includes(url.hostname)) throw Error("No se pudo abrir el destino seguro.");window.location.assign(url.href); }
      else if (result.order?.status === "PAID") window.location.assign("/pedido/" + result.order.id);
      else if (result.recover) setNotice("Ya existe un intento pendiente. Reanúdalo o cancélalo antes de crear otro.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar la acción. Tu bolsa se conserva."); }
    finally { busyRef.current = false;setBusy(false); }
  };
  const refresh = async () => {
    if (!order) return;setBusy(true);
    try { const r = await fetch("/api/checkout?order=" + order.id, { cache: "no-store" });const d = await r.json();if (!r.ok || !d.order) throw Error("No se pudo actualizar el pedido.");setOrder(d.order); }
    catch (e) { setError(e instanceof Error ? e.message : "Intenta nuevamente."); }finally { setBusy(false); }
  };
  const labels: Record<keyof Contact, string> = { name: "Nombre completo", email: "Correo electrónico", phone: "Teléfono de entrega", line1: "Calle y número", line2: "Departamento / referencias (opcional)", city: "Ciudad", state: "Estado", postalCode: "Código postal", country: "País · código de dos letras" };
  const price = (n: number | null | undefined) => n == null ? "Por determinar" : money(n, quote?.currency ?? order?.currency ?? "MXN");
  return <section className="m6-checkout"><nav><a href="/catalogo">← Seguir explorando</a><span>01 Bolsa · 02 Entrega · 03 Pago</span></nav>
    <header><small>TU SELECCIÓN</small><h1>{orderId ? "Tu pedido" : bagOnly ? (presentation?.title || "Mi bolsa") : "Un paso más cerca"}</h1><p>{orderId ? "El estado se confirma con el proveedor, nunca por el enlace de regreso." : (presentation?.description || "Revisaremos tu selección y el envío antes de abrir el pago seguro.")}</p></header>
    {loading && <p role="status">Recuperando tu selección…</p>}{error && <div className="m6-message" role="alert">{error}</div>}{notice && <p role="status">{notice}</p>}
    {order && <section className="m6-order"><small>FOLIO {order.id.slice(0, 8).toUpperCase()}</small><h2>{states[order.status] ?? "Estado por verificar"}</h2><p>{money(order.total_cents, order.currency)}</p>
      <p>{orderStatusLabels[order.delivery_method??'']} · Preparación: {orderStatusLabels[order.preparation_status??'NEW']} · Entrega: {orderStatusLabels[order.delivery_status??'PENDING']}</p>{order.tracking&&<p>Guía: {order.tracking}</p>}{order.refund_required&&<p>Pedido cancelado. El reembolso está pendiente de gestión; no se ha confirmado una devolución de dinero.</p>}
      {order.items?.map((item,i)=><p key={i}>{item.snapshot.name} ? {item.snapshot.variantName} ? {item.quantity} ? {money(item.unit_cents,order.currency)}</p>)}{order.delivery_snapshot?.pickup&&<p>{order.delivery_snapshot.pickup.address} ? {order.delivery_snapshot.pickup.hours} ? {order.delivery_snapshot.pickup.instructions}</p>}
      {order.status === "PAYMENT_REVIEW" && <p>No se confirmó una venta con inventario disponible. No se ha emitido un reembolso automático.</p>}
      {order.status === "PENDING" && <><p>Tu compra todavía no está pagada. Puedes recuperar el intento sin duplicarlo. Reserva hasta {new Date(order.expires_at).toLocaleString()}.</p><button disabled={busy} onClick={() => action("resume")}>{order.payment_method==='WHATSAPP'?'Abrir WhatsApp con folio':'Reanudar pago'}</button><button className="m6-secondary" disabled={busy} onClick={() => action("cancel")}>Cancelar intento pendiente</button></>}
      <button className="m6-secondary" disabled={busy} onClick={refresh}>Actualizar estado</button><a href={"/pedido/" + order.id}>Ver confirmación</a>
    </section>}
    {!loading && !orderId && (!lines.length ? <section className="m6-empty"><h2>{presentation?.emptyText || "Tu bolsa está esperando una nueva historia."}</h2><a href="/catalogo">Explorar la colección →</a></section> : <div className="m6-columns"><div>
      <section className="m6-card"><h2>Tu selección</h2>{lines.map(l => { const item = quote?.items.find(i => i.variantId === l.variantId);return <article className="m6-line" key={l.variantId}><div><a href={"/productos/" + l.productId + "?variant=" + l.variantId}>{item?.name ?? "Producto por revisar"}</a><small>{item?.variantName ?? "Validando variante"}</small>{item && quote && <span>{money(item.unitCents, quote.currency)} por unidad</span>}{item && !item.available && <small>Sin existencias suficientes</small>}</div><label>Cantidad<input aria-label={"Cantidad " + (item?.name ?? "producto")} type="number" min="1" max="99" value={l.quantity} disabled={busy} onChange={e => { const n = Number(e.target.value);if (Number.isInteger(n) && n >= 1 && n <= 99) void change(l.variantId, n); }} /></label><button disabled={busy} className="m6-remove" aria-label={"Eliminar " + (item?.name ?? "producto")} onClick={() => change(l.variantId, 0)}>Eliminar</button></article>;})}</section>
      {!bagOnly && <form className="m6-card" onSubmit={e => { e.preventDefault();void action("quote"); }}><h2>Entrega y pago</h2><label>Entrega<select value={delivery} disabled={busy} onChange={e=>{++sequence.current;setQuote(null);setDelivery(e.target.value);}}>{settings?.shipping.enabled&&<option value="SHIPPING">Envío · {settings.shipping.minDays}–{settings.shipping.maxDays} días</option>}{settings?.pickup.enabled&&<option value="PICKUP">Recolección</option>}</select></label>{delivery==='PICKUP'&&settings&&<p>{settings.pickup.address} · {settings.pickup.hours}<br/>{settings.pickup.instructions}</p>}<label>Método<select value={method} disabled={busy} onChange={e=>{++sequence.current;setQuote(null);setMethod(e.target.value);}}>{settings?.payments.stripe&&<option value="STRIPE" disabled={!payment.ready}>Tarjeta{payment.mode==='test'?' · Stripe test':''}</option>}{settings?.payments.whatsapp&&<option value="WHATSAPP">Coordinar por WhatsApp</option>}</select></label>{settings?.payments.stripe&&!payment.ready&&<p role="status">{payment.message}</p>}<p>Confirma tus datos de contacto y dirección. Se conservarán en tu pedido.</p><div className="m6-fields">{(Object.keys(labels) as (keyof Contact)[]).map(k => <label key={k}>{labels[k]}<input required={k !== "line2"} maxLength={k === "country" ? 2 : 200} type={k === "email" ? "email" : k === "phone" ? "tel" : "text"} value={contact[k]} disabled={busy} onChange={e => { ++sequence.current;setQuote(null);setContact({ ...contact, [k]: k === "country" ? e.target.value.toUpperCase() : e.target.value }); }} /></label>)}</div><button disabled={busy}>{busy ? "Consultando…" : "Revisar precios y entrega"}</button></form>}
    </div><aside className="m6-card m6-summary"><small>EL RESUMEN</small><h2>{presentation?.summaryTitle || "Tu próxima selección"}</h2><dl><div><dt>Productos</dt><dd>{price(quote ? quote.subtotalCents + (quote.discountCents ?? 0) : null)}</dd></div><div><dt>Descuentos</dt><dd>{price(quote?.discountCents)}</dd></div><div><dt>Envío</dt><dd>{price(quote?.shippingCents)}</dd></div><div className="m6-total"><dt>Total</dt><dd>{price(quote?.totalCents)}</dd></div></dl>
      {quote?.blockers.map(b => <p className="m6-blocker" key={b}>{b}</p>)}
      {bagOnly ? <a className="m6-button" href="/checkout">{presentation?.continueText || "Continuar con entrega →"}</a> : <button disabled={busy || (method==='STRIPE'&&!payment.ready) || !quote?.ready || !!order && order.status === "PENDING"} onClick={() => action("pay")}>{busy ? "Preparando…" : method==='WHATSAPP'?'Crear pedido pendiente y abrir WhatsApp':payment.mode==='test'?'Ir al pago de prueba →':'Ir al pago seguro →'}</button>}
      <p className="m6-fine">Los precios y existencias se validan en servidor. No se cobrará un envío indeterminado.</p>
    </aside></div>)}
  </section>;
}
