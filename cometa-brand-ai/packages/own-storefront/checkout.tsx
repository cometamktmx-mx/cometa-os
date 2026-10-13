"use client";
import { useEffect, useRef, useState } from "react";
import { readBag, editBag, type BagLine } from "./bag";
import { emptyContact, money, type CartQuote, type Contact } from "./checkout-contract";
import type { Appearance } from "./contract";
type Order = { id: string; status: string; total_cents: number; subtotal_cents: number; shipping_cents: number; currency: string; expires_at: string };
const states: Record<string, string> = { PENDING: "Pago pendiente", PAID: "Pago confirmado", EXPIRED: "Intento vencido", CANCELLED: "Intento cancelado", PAYMENT_REVIEW: "Pago recibido en revisión" };
async function post(body: unknown, signal?: AbortSignal) {
  const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal });
  const data = await r.json();if (!r.ok) throw Error(data.error || "No se pudo consultar tu compra.");return data;
}
export function Checkout({ brandId, orderId = "", bagOnly = false, presentation, preview = false }: { brandId: string; orderId?: string; bagOnly?: boolean; presentation?: Appearance["bag"]; preview?: boolean }) {
  const [lines, setLines] = useState<BagLine[]>([]), [quote, setQuote] = useState<CartQuote | null>(null), [contact, setContact] = useState(emptyContact), [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(!preview), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const sequence = useRef(0), busyRef = useRef(false);
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
        const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ lines, contact }))))].map(x => x.toString(16).padStart(2, "0")).join("");
        const key = "store.attempt.v1." + brandId;let saved: { digest?: string; id?: string } = {};
        try { saved = JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { /* corrupt attempt is not an order */ }
        attempt = saved.digest === digest && typeof saved.id === "string" ? saved.id : crypto.randomUUID();
        // If persistence is unavailable, refuse creating an unrecoverable provider attempt.
        localStorage.setItem(key, JSON.stringify({ digest, id: attempt }));
      }
      const result = await post(kind === "resume" || kind === "cancel" ? { action: kind, order: order?.id } : { action: kind, lines, contact, ...(attempt ? { attempt } : {}) });
      if (version !== sequence.current) return;
      if (kind === "quote") setQuote(result);
      if (result.order) setOrder(result.order);
      if (result.url) { const url = new URL(result.url);if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw Error("No se pudo abrir el pago seguro.");window.location.assign(url.href); }
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
      {order.status === "PAYMENT_REVIEW" && <p>No se confirmó una venta con inventario disponible. No se ha emitido un reembolso automático.</p>}
      {order.status === "PENDING" && <><p>Tu compra todavía no está pagada. Puedes recuperar el intento sin duplicarlo.</p><button disabled={busy} onClick={() => action("resume")}>Reanudar pago de prueba</button><button className="m6-secondary" disabled={busy} onClick={() => action("cancel")}>Cancelar intento pendiente</button></>}
      <button className="m6-secondary" disabled={busy} onClick={refresh}>Actualizar estado</button><a href={"/pedido/" + order.id}>Ver confirmación</a>
    </section>}
    {!loading && !orderId && (!lines.length ? <section className="m6-empty"><h2>{presentation?.emptyText || "Tu bolsa está esperando una nueva historia."}</h2><a href="/catalogo">Explorar la colección →</a></section> : <div className="m6-columns"><div>
      <section className="m6-card"><h2>Tu selección</h2>{lines.map(l => { const item = quote?.items.find(i => i.variantId === l.variantId);return <article className="m6-line" key={l.variantId}><div><a href={"/productos/" + l.productId + "?variant=" + l.variantId}>{item?.name ?? "Producto por revisar"}</a><small>{item?.variantName ?? "Validando variante"}</small>{item && quote && <span>{money(item.unitCents, quote.currency)} por unidad</span>}{item && !item.available && <small>Sin existencias suficientes</small>}</div><label>Cantidad<input aria-label={"Cantidad " + (item?.name ?? "producto")} type="number" min="1" max="99" value={l.quantity} disabled={busy} onChange={e => { const n = Number(e.target.value);if (Number.isInteger(n) && n >= 1 && n <= 99) void change(l.variantId, n); }} /></label><button disabled={busy} className="m6-remove" aria-label={"Eliminar " + (item?.name ?? "producto")} onClick={() => change(l.variantId, 0)}>Eliminar</button></article>;})}</section>
      {!bagOnly && <form className="m6-card" onSubmit={e => { e.preventDefault();void action("quote"); }}><h2>¿A dónde lo enviamos?</h2><div className="m6-fields">{(Object.keys(labels) as (keyof Contact)[]).map(k => <label key={k}>{labels[k]}<input required={k !== "line2"} maxLength={k === "country" ? 2 : 200} type={k === "email" ? "email" : k === "phone" ? "tel" : "text"} value={contact[k]} disabled={busy} onChange={e => { ++sequence.current;setQuote(null);setContact({ ...contact, [k]: k === "country" ? e.target.value.toUpperCase() : e.target.value }); }} /></label>)}</div><button disabled={busy}>{busy ? "Consultando…" : "Revisar precios y envío"}</button></form>}
    </div><aside className="m6-card m6-summary"><small>EL RESUMEN</small><h2>{presentation?.summaryTitle || "Tu próxima selección"}</h2><dl><div><dt>Productos</dt><dd>{price(quote?.subtotalCents)}</dd></div><div><dt>Descuentos</dt><dd>{price(quote?.discountCents)}</dd></div><div><dt>Envío</dt><dd>{price(quote?.shippingCents)}</dd></div><div className="m6-total"><dt>Total</dt><dd>{price(quote?.totalCents)}</dd></div></dl>
      {quote?.blockers.map(b => <p className="m6-blocker" key={b}>{b}</p>)}
      {bagOnly ? <a className="m6-button" href="/checkout">{presentation?.continueText || "Continuar con entrega →"}</a> : <button disabled={busy || !quote?.ready || !!order && order.status === "PENDING"} onClick={() => action("pay")}>{busy ? "Preparando…" : "Ir al pago de prueba →"}</button>}
      <p className="m6-fine">Los precios y existencias se validan en servidor. No se cobrará un envío indeterminado.</p>
    </aside></div>)}
  </section>;
}
