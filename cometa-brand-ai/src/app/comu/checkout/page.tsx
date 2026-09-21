"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PaymentStatus } from "@/app/api/comu/orders/[id]/payment-status/route";

type Address = { id: string; label: string; recipient_name: string; line1: string; city: string; state: string; postal_code: string; is_default?: boolean };
type StripeElement = { mount: (selector: string) => void; unmount: () => void };
type StripeError = { type?: string; code?: string; decline_code?: string; message?: string; payment_intent?: { id?: string } };
type StripeElements = { create: (type: "payment") => StripeElement; submit: () => Promise<{ error?: StripeError }> };
type StripeClient = { elements: (options: { clientSecret: string }) => StripeElements; confirmPayment: (options: { elements: StripeElements; confirmParams: { return_url: string }; redirect: "if_required" }) => Promise<{ error?: StripeError }> };
declare global { interface Window { Stripe?: (key: string) => StripeClient } }

const fields = [
  { name: "label", label: "Nombre de la dirección", autoComplete: "off", required: true },
  { name: "recipientName", label: "Nombre de quien recibe", autoComplete: "shipping name", required: true },
  { name: "phone", label: "Teléfono", autoComplete: "shipping tel", required: true },
  { name: "line1", label: "Calle y número", autoComplete: "shipping address-line1", required: true },
  { name: "line2", label: "Colonia, interior u otros detalles (opcional)", autoComplete: "shipping address-line2", required: false },
  { name: "city", label: "Ciudad", autoComplete: "shipping address-level2", required: true },
  { name: "state", label: "Estado", autoComplete: "shipping address-level1", required: true },
  { name: "postalCode", label: "Código postal", autoComplete: "shipping postal-code", required: true },
  { name: "references", label: "Referencias de entrega (opcional)", autoComplete: "off", required: false },
] as const;
const inputClass = "mt-2 min-h-12 w-full rounded-xl border border-black/15 bg-white px-4 font-normal focus:outline-emerald-600";

export default function ComuCheckoutPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [paymentReady, setPaymentReady] = useState(false);
  const stripeRef = useRef<StripeClient | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentRef = useRef<StripeElement | null>(null);
  const busyRef = useRef(false);
  const paymentLockedRef = useRef(false);
  const previousFailureRef = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [recovering, setRecovering] = useState(true);
  const [paymentView, setPaymentView] = useState<{ phase: "IDLE" | "PROCESSING" | "CONFIRMING" | "SUCCESS" | "FAILED" | "PENDING_REVIEW"; text?: string; retry?: boolean; received?: boolean }>({ phase: "IDLE" });
  const [confirmedOrder, setConfirmedOrder] = useState<PaymentStatus["order"] | null>(null);
  const [cartState, setCartState] = useState<"loading" | "empty" | "unavailable" | "ready" | "error">("loading");

  async function readPaymentStatus(id: string, signal?: AbortSignal): Promise<PaymentStatus> {
    const response = await fetch(`/api/comu/orders/${encodeURIComponent(id)}/payment-status`, { cache: "no-store", signal: signal || AbortSignal.timeout(8000) });
    const data = await response.json();
    if (!response.ok || !data.ok || data.order?.id !== id) throw new Error("payment status unavailable");
    return data as PaymentStatus;
  }

  function observePayment(data: PaymentStatus) {
    if (data.payment?.status === "PAYMENT_RECEIVED_AFTER_EXPIRY" || data.order.status === "PAYMENT_RECEIVED_AFTER_EXPIRY") {
      setPaymentView({ phase: "PENDING_REVIEW", text: "Recibimos tu pago, pero tu reserva expiró antes de confirmarse. No necesitas volver a pagar. Nuestro equipo revisará tu compra." });
    } else if (data.order.status === "PAID" && data.payment?.status === "SUCCEEDED") {
      setConfirmedOrder(data.order);
      setPaymentView({ phase: "SUCCESS" });
    } else if (["EXPIRED", "CANCELLED"].includes(data.order.status)) {
      setPaymentView({ phase: "FAILED", text: data.order.status === "EXPIRED" ? "Tu reserva expiró. Consulta el estado del pedido antes de intentar otra compra." : "Este pedido fue cancelado. Consulta su estado antes de intentar otra compra." });
    } else if (data.payment?.status === "FAILED") {
      // A retry can be accepted by Stripe before its webhook replaces the previous failure.
      if (previousFailureRef.current === data.payment.updated_at) return false;
      setPaymentView({ phase: "FAILED", text: "No pudimos completar el pago. Revisa tus datos o utiliza otra tarjeta.", retry: data.canRetry });
    } else return false;
    return true;
  }

  useEffect(() => {
    let disposed = false;
    // Read browser navigation after hydration; never restore payment credentials.
    void Promise.resolve().then(() => {
      if (disposed) return;
      const recoveredId = window.location.href.match(/[?&]orderId=([a-zA-Z0-9-]+)/)?.[1];
      if (recoveredId) {
        paymentLockedRef.current = true;
        setOrderId(recoveredId);
        setPaymentView({ phase: "CONFIRMING" });
      }
      setRecovering(false);
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (paymentView.phase !== "IDLE") dialogRef.current?.focus();
  }, [paymentView.phase]);

  useEffect(() => {
    if (paymentView.phase !== "CONFIRMING" || !orderId) return;
    const currentOrderId = orderId;
    let disposed = false;
    const controller = new AbortController();
    let next: ReturnType<typeof setTimeout>;
    const deadline = setTimeout(() => {
      disposed = true;
      controller.abort();
      clearTimeout(next);
      setPaymentView({ phase: "PENDING_REVIEW", text: "Tu pago está siendo confirmado. Esto puede tardar unos segundos." });
    }, 60000);
    async function poll() {
      try {
        const data = await readPaymentStatus(currentOrderId, controller.signal);
        if (disposed) return;
        if (observePayment(data)) { clearTimeout(deadline); return; }
      } catch { /* Network failures are not evidence of a failed payment. */ }
      if (!disposed) next = setTimeout(() => void poll(), 2000);
    }
    void poll();
    return () => { disposed = true; controller.abort(); clearTimeout(next); clearTimeout(deadline); };
  }, [paymentView.phase, orderId]);

  useEffect(() => {
    if (paymentView.phase !== "SUCCESS" || !orderId) return;
    const timer = setTimeout(() => window.location.replace(`/comu/account/orders/${encodeURIComponent(orderId)}/confirmation`), 1800);
    return () => clearTimeout(timer);
  }, [paymentView.phase, orderId]);

  async function retryPayment() {
    if (busyRef.current || !orderId) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const data = await readPaymentStatus(orderId);
      if (data.canRetry && clientSecret) {
        paymentLockedRef.current = false;
        setPaymentView({ phase: "IDLE" });
      } else if (!observePayment(data)) setPaymentView({ phase: "PENDING_REVIEW", text: "Consulta el estado de tu pedido antes de continuar. No necesitas volver a pagar mientras lo confirmamos." });
    } catch { setPaymentView({ phase: "PENDING_REVIEW", text: "No pudimos consultar el estado de tu pago. Revisa tu pedido antes de intentarlo nuevamente." }); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function loadCart() {
    return fetch("/api/comu/cart", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { ok?: boolean; items?: Array<{ is_available?: boolean }> };
      if (!response.ok || !data.ok || !Array.isArray(data.items)) throw new Error("cart");
      const state = !data.items.length ? "empty" : data.items.some((item) => item.is_available !== true) ? "unavailable" : "ready";
      setCartState(state);
      return state;
    }).catch(() => { setCartState("error"); return "error" as const; });
  }

  function loadAddresses() {
    return fetch("/api/comu/buyer/addresses", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { ok?: boolean; addresses?: Address[] };
      if (!response.ok || !data.ok || !Array.isArray(data.addresses)) throw new Error("addresses");
      setAddresses(data.addresses);
      setAddressId((data.addresses.find((address) => address.is_default) || data.addresses[0])?.id || "");
      setShowForm(data.addresses.length === 0);
    }).catch(() => {
      setLoadFailed(true);
      setMessage("No se pudieron cargar tus direcciones. Inténtalo nuevamente.");
    }).finally(() => {
      setLoading(false);
    });
  }

  useEffect(() => { void loadAddresses(); void loadCart(); }, []);
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_COMU_STRIPE_PUBLISHABLE_KEY;
    if (!clientSecret) return;
    if (!key) return;
    let disposed = false;
    let payment: StripeElement | null = null;
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.onload = () => {
      if (disposed || paymentRef.current || !window.Stripe) return;
      try {
        const stripe = window.Stripe(key);
        stripeRef.current = stripe;
        const elements = stripe.elements({ clientSecret });
        elementsRef.current = elements;
        payment = elements.create("payment");
        paymentRef.current = payment;
        payment.mount("#comu-payment-element");
        setPaymentReady(true);
      } catch { setMessage("No se pudo cargar el formulario de pago. Inténtalo nuevamente."); }
    };
    script.onerror = () => { if (!disposed) setMessage("No se pudo cargar el formulario de pago. Revisa tu conexión."); };
    document.head.appendChild(script);
    return () => {
      disposed = true;
      payment?.unmount();
      paymentRef.current = null;
      elementsRef.current = null;
      stripeRef.current = null;
      setPaymentReady(false);
      script.remove();
    };
  }, [clientSecret]);

  async function saveAddress(form: HTMLFormElement) {
    if (busyRef.current) return;
    const values = new FormData(form);
    const input = Object.fromEntries(fields.map((field) => [field.name, String(values.get(field.name) || "").trim()]));
    if (fields.some((field) => field.required && !input[field.name])) { setMessage("Completa los campos obligatorios."); return; }
    if (!/^\d{5}$/.test(input.postalCode)) { setMessage("Revisa tu código postal."); return; }
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/comu/buyer/addresses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, country: "MX", isDefault: addresses.length === 0 }),
      });
      const data = await response.json() as { ok?: boolean; address?: Address; error?: string };
      if (!response.ok || !data.ok || !data.address?.id) {
        const safeMessages = ["Completa los campos obligatorios.", "Revisa tu código postal.", "Inicia sesión para continuar."];
        setMessage(safeMessages.includes(data.error || "") ? data.error || "" : "No pudimos guardar la dirección. Inténtalo nuevamente.");
        return;
      }
      const saved = data.address;
      setAddresses((current) => [...current, saved]);
      setAddressId(saved.id);
      setShowForm(false);
      setMessage("Dirección guardada. Ya puedes continuar al pago.");
    } catch {
      setMessage("No pudimos guardar la dirección. Inténtalo nuevamente.");
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function prepareOrder() {
    if (busyRef.current || paymentLockedRef.current || recovering || orderId || cartState !== "ready" || loading || loadFailed || showForm || !addresses.some((address) => address.id === addressId)) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    const key = crypto.randomUUID();
    try {
      // Recheck immediately before reserving: another tab may have changed the cart.
      if (await loadCart() !== "ready") return;
      const response = await fetch("/api/comu/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key, addressId }),
      });
      const data = await response.json() as { ok?: boolean; code?: string; order?: { id: string; reservation_id?: string } };
      if (!response.ok || !data.ok || !data.order?.id) {
        if (data.code === "COMU_CART_EMPTY") { setCartState("empty"); return; }
        if (["COMU_LISTING_UNAVAILABLE", "COMU_VARIANT_UNAVAILABLE", "COMU_INSUFFICIENT_STOCK"].includes(data.code || "")) { setCartState("unavailable"); return; }
        if (data.code === "COMU_RESERVATION_FAILED" && await loadCart() !== "ready") return;
        setMessage("No se pudo preparar la orden. Revisa tu dirección y carrito e inténtalo nuevamente.");
        return;
      }
      setOrderId(data.order.id);
      window.history?.replaceState(null, "", `/comu/checkout?orderId=${encodeURIComponent(data.order.id)}`);
      setReservationId(data.order.reservation_id || null);
      const paymentResponse = await fetch("/api/comu/payments/intents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: data.order.id, idempotencyKey: `${key}:payment` }),
      });
      const payment = await paymentResponse.json() as { ok?: boolean; clientSecret?: string };
      if (!paymentResponse.ok || !payment.ok || !payment.clientSecret) {
        setMessage("No se pudo iniciar el pago. Inténtalo nuevamente.");
        return;
      }
      setClientSecret(payment.clientSecret);
      setMessage("Tus piezas están reservadas durante 15 minutos.");
    } catch { setMessage("No se pudo completar la solicitud. Revisa tu conexión e inténtalo nuevamente."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function pay() {
    if (busyRef.current || paymentLockedRef.current) return;
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements || !clientSecret) {
      setMessage("No se pudo cargar el formulario de pago. Inténtalo nuevamente.");
      return;
    }
    busyRef.current = true;
    paymentLockedRef.current = true;
    setPaymentView({ phase: "PROCESSING" });
    setBusy(true);
    setMessage("");
    // Never log complete Stripe errors: they may contain an expanded intent/secret.
    const diagnosticError = (error: unknown) => {
      const detail = error && typeof error === "object" ? error as Record<string, unknown> : {};
      const safeText = (value: unknown) => typeof value === "string" ? value
        .replaceAll(clientSecret, "[REDACTED]")
        .replace(/(?:pi|seti)_[A-Za-z0-9]+_secret_[A-Za-z0-9]+|(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/g, "[REDACTED]")
        .replace(/\b(?:\d[ -]?){12,18}\d\b/g, "[REDACTED]") : undefined;
      const intent = detail.payment_intent;
      return {
        name: safeText(detail.name), type: safeText(detail.type), code: safeText(detail.code),
        decline_code: safeText(detail.decline_code), message: safeText(detail.message ?? (typeof error === "string" ? error : undefined)),
        payment_intent: intent && typeof intent === "object" && "id" in intent ? safeText(intent.id) : undefined,
      };
    };
    try {
      if (!orderId) throw new Error("missing order");
      const status = await readPaymentStatus(orderId);
      if (stripeRef.current !== stripe || elementsRef.current !== elements) return;
      if (observePayment(status) && !status.canRetry) return;
      if (!status.canRetry) { setPaymentView({ phase: "CONFIRMING" }); return; }
      previousFailureRef.current = status.payment?.status === "FAILED" ? status.payment.updated_at : null;
      setPaymentView({ phase: "PROCESSING" });
      const submitted = await elements.submit();
      if (stripeRef.current !== stripe || elementsRef.current !== elements) return;
      if (submitted.error) {
        if (process.env.NODE_ENV === "development") console.error("COMU_STRIPE_SUBMIT_ERROR", diagnosticError(submitted.error));
        setPaymentView({ phase: "FAILED", text: "Revisa los datos de pago.", retry: true }); return;
      }
      if (process.env.NODE_ENV === "development") console.log("COMU_STRIPE_CONFIRM_CONTEXT", {
        hasClientSecret: Boolean(clientSecret), hasStripe: Boolean(window.Stripe), hasElements: Boolean(elementsRef.current), orderId, reservationId,
      });
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" });
      if (process.env.NODE_ENV === "development" && result.error) {
        const detail = diagnosticError(result.error);
        console.error("COMU_STRIPE_RESULT_ERROR", { type: detail.type, code: detail.code, decline_code: detail.decline_code, message: detail.message, payment_intent: detail.payment_intent });
      }
      if (result.error) {
        const messages: Record<string, string> = { card_declined: "Tu banco rechazó el pago. Prueba con otra tarjeta o contacta a tu banco.", expired_card: "Tu tarjeta está vencida. Utiliza otra tarjeta.", incorrect_cvc: "Revisa el código de seguridad de tu tarjeta.", incomplete_number: "Completa el número de tu tarjeta.", insufficient_funds: "Tu tarjeta no tiene fondos suficientes. Utiliza otra tarjeta." };
        const knownFailure = result.error.type === "card_error" || result.error.type === "validation_error";
        setPaymentView(knownFailure ? { phase: "FAILED", text: messages[result.error.decline_code || ""] || messages[result.error.code || ""] || "Revisa los datos de pago o utiliza otra tarjeta.", retry: true } : { phase: "CONFIRMING" });
      } else setPaymentView({ phase: "CONFIRMING", received: true });
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("COMU_STRIPE_CONFIRM_EXCEPTION", diagnosticError(error));
      setPaymentView({ phase: "CONFIRMING" });
    }
    finally { busyRef.current = false; setBusy(false); }
  }

  const addressLocked = busy || Boolean(clientSecret);
  if (recovering) return <main className="mx-auto max-w-3xl px-5 py-16"><p role="status">Revisando tu carrito y el estado de tu compra…</p></main>;
  if (!orderId && !clientSecret && cartState !== "ready") return <main className="mx-auto max-w-3xl px-5 py-16">
    <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">Checkout</p>
    <section className="mt-6 rounded-3xl border border-black/10 bg-white p-8" aria-live="polite">
      {cartState === "loading" ? <p role="status">Revisando tu carrito…</p> : cartState === "empty" ? <>
        <h1 className="text-3xl font-black">Tu carrito está vacío.</h1>
        <p className="mt-3 text-slate-600">Agrega algunas piezas antes de continuar.</p>
        <Link href="/comu/search" className="mt-6 inline-flex rounded-full bg-emerald-800 px-6 py-3 font-bold text-white">Explorar productos</Link>
      </> : cartState === "unavailable" ? <>
        <h1 className="text-2xl font-black">Algunos productos de tu carrito ya no están disponibles.</h1>
        <Link href="/comu/cart" className="mt-6 inline-flex font-bold text-emerald-800 underline">Volver al carrito</Link>
      </> : <>
        <p>No pudimos cargar tu carrito. Inténtalo nuevamente.</p>
        <button onClick={() => { setCartState("loading"); void loadCart(); }} className="mt-4 font-bold text-emerald-800 underline">Reintentar</button>
      </>}
    </section>
  </main>;
  return <main className="mx-auto max-w-3xl px-5 py-16">
    <div inert={paymentView.phase !== "IDLE"}>
    <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-700">Checkout</p>
    <h1 className="mt-3 text-5xl font-black tracking-[-.07em]">Revisa y paga tus piezas.</h1>
    <p className="mt-5 text-slate-600">Al continuar al pago, reservaremos tus piezas durante 15 minutos.</p>
    <section className="mt-8 rounded-3xl border border-black/10 bg-white p-6" aria-label="Dirección de entrega">
      {loading ? <p role="status">Cargando tus direcciones…</p> : loadFailed ? <button onClick={() => { setLoading(true); setLoadFailed(false); setMessage(""); void loadAddresses(); }} className="font-bold text-emerald-800 underline">Reintentar cargar direcciones</button> : <>
        {addresses.length > 0 && <label className="block text-sm font-bold">Enviar a
          <select value={addressId} disabled={addressLocked} onChange={(event) => { setAddressId(event.target.value); setMessage(""); }} className={inputClass}>
            {addresses.map((address) => <option key={address.id} value={address.id}>{address.label}{address.is_default ? " · Predeterminada" : ""} · {address.recipient_name} · {address.line1}, {address.city}, {address.state} · {address.postal_code}</option>)}
          </select>
        </label>}
        {!showForm && !addressLocked && <button onClick={() => { setShowForm(true); setMessage(""); }} className="mt-4 text-sm font-bold text-emerald-800 underline">Agregar nueva dirección</button>}
        {showForm && <form noValidate onSubmit={(event) => { event.preventDefault(); void saveAddress(event.currentTarget); }}>
          <h2 className="text-xl font-bold">{addresses.length ? "Agregar nueva dirección" : "¿Dónde entregamos tus piezas?"}</h2>
          <p className="mt-2 text-sm text-slate-600">Guarda tu dirección aquí para continuar. Envíos a México.</p>
          <fieldset disabled={busy} className="mt-5 grid gap-4 sm:grid-cols-2">
            {fields.map((field) => <label key={field.name} className="block text-sm font-bold">{field.label}{field.required ? " *" : ""}
              <input name={field.name} required={field.required} autoComplete={field.autoComplete} type={field.name === "phone" ? "tel" : "text"} inputMode={field.name === "postalCode" ? "numeric" : undefined} maxLength={field.name === "postalCode" ? 5 : 250} defaultValue={field.name === "label" ? "Casa" : ""} className={inputClass} />
            </label>)}
          </fieldset>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button disabled={busy} type="submit" className="rounded-full bg-emerald-800 px-6 py-3 font-bold text-white disabled:opacity-50">{busy ? "Guardando…" : "Guardar dirección"}</button>
            {addresses.length > 0 && <button disabled={busy} type="button" onClick={() => { setShowForm(false); setMessage(""); }} className="text-sm font-bold">Cancelar</button>}
          </div>
        </form>}
        {clientSecret && <p className="mt-3 text-sm text-slate-600">Esta dirección se conservará en tu orden.</p>}
      </>}
    </section>
    {!clientSecret ? <button disabled={busy || Boolean(orderId) || loading || loadFailed || showForm || !addressId} onClick={() => void prepareOrder()} className="mt-8 rounded-full bg-[#17201d] px-6 py-3 font-bold text-white disabled:opacity-50">{busy ? "Procesando…" : "Continuar al pago"}</button> :
      <section className="mt-8 rounded-3xl border border-black/10 bg-white p-5">
        <div id="comu-payment-element" />
        {!process.env.NEXT_PUBLIC_COMU_STRIPE_PUBLISHABLE_KEY && <p role="status">El pago no está disponible en este momento. Inténtalo más tarde.</p>}
        <button disabled={busy || !paymentReady || paymentView.phase !== "IDLE"} onClick={() => void pay()} className="mt-6 min-h-12 w-full rounded-full bg-[#17201d] px-6 py-3 font-bold text-white disabled:opacity-50">{busy ? "Procesando…" : "Pagar"}</button>
        <p className="mt-3 text-xs text-slate-500">Orden {orderId?.slice(0, 8)}</p>
      </section>}
    {message && <p role="status" aria-live="polite" className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm">{message}</p>}
    {orderId && !clientSecret && paymentView.phase === "IDLE" && <Link href={`/comu/account/orders/${encodeURIComponent(orderId)}`} className="mt-5 inline-block font-bold text-emerald-900 underline">Ver estado del pedido</Link>}
    </div>
    {paymentView.phase !== "IDLE" && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#17201d]/60 p-4 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="payment-title" aria-describedby="payment-description" onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const targets = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]');
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus(); }
      }} className="my-auto w-full max-w-md rounded-[2rem] border border-[#d9cfc4] bg-[#f8f5f0] p-8 text-center text-[#19201c] shadow-2xl outline-none">
      <div aria-live="polite" aria-atomic="true">
        {["PROCESSING", "CONFIRMING"].includes(paymentView.phase) ? <div aria-hidden="true" className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-[#d9cfc4] border-t-emerald-800 motion-reduce:animate-none" /> : <div aria-hidden="true" className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-900 motion-safe:animate-[pulse_0.6s_ease-out_1]">{paymentView.phase === "SUCCESS" ? "✓" : "!"}</div>}
        <h2 id="payment-title" className="text-2xl font-bold">{({ PROCESSING: "Procesando tu pago", CONFIRMING: paymentView.received ? "Pago recibido" : "Consultando tu pago", SUCCESS: "¡Pago confirmado!", FAILED: "No pudimos completar el pago.", PENDING_REVIEW: "Tu pago está siendo confirmado." })[paymentView.phase]}</h2>
        <p id="payment-description" className="mt-4 leading-7 text-[#72675e]">{paymentView.text || ({ PROCESSING: "Estamos validando tu información con el banco.", CONFIRMING: "Estamos confirmando tu compra.", SUCCESS: "Tu compra está lista. Estamos preparando tu pedido.", FAILED: "Revisa los datos de pago.", PENDING_REVIEW: "Esto puede tardar unos segundos." })[paymentView.phase]}</p>
        {paymentView.phase === "PROCESSING" && <p className="mt-4 text-xs font-bold">No cierres esta ventana.</p>}
        {paymentView.phase === "SUCCESS" && confirmedOrder && <p className="mt-5 text-sm">Orden #{confirmedOrder.order_number} · {new Intl.NumberFormat("es-MX", { style: "currency", currency: confirmedOrder.currency }).format(confirmedOrder.grand_total)} · {confirmedOrder.sellers.length} tienda(s)</p>}
      </div>
      {paymentView.phase === "FAILED" && paymentView.retry && clientSecret && <button disabled={busy} onClick={() => void retryPayment()} className="mt-6 rounded-full bg-[#17201d] px-6 py-3 font-bold text-white disabled:opacity-50">Intentar nuevamente</button>}
      {orderId && ["SUCCESS", "FAILED", "PENDING_REVIEW"].includes(paymentView.phase) && <Link href={`/comu/account/orders/${encodeURIComponent(orderId)}${paymentView.phase === "SUCCESS" ? "/confirmation" : ""}`} className="mt-6 block font-bold text-emerald-900 underline">{paymentView.phase === "SUCCESS" ? "Ver mi pedido" : "Ver estado del pedido"}</Link>}
      </div>
    </div>}
  </main>;
}
