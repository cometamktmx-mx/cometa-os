import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const id = "11111111-1111-4111-8111-111111111111";
const checkoutFile = "src/app/comu/checkout/page.tsx";
const confirmationFile = "src/app/comu/account/orders/[id]/confirmation/page.tsx";
const detailFile = "src/app/comu/account/orders/[id]/page.tsx";
const statusFile = "src/app/api/comu/orders/[id]/payment-status/route.ts";
const source = async (file) => readFile(new URL(file, root), "utf8");
async function load(file, dependencies, globals = {}) {
  const output = ts.transpileModule(await source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: (name) => { assert.ok(name in dependencies, name); return dependencies[name]; }, console, ...globals });
  return exports;
}
const pending = () => ({ ok: true, order: { id, order_number: 42, status: "PAYMENT_PENDING", grand_total: 199, currency: "MXN", created_at: "2026-09-21T12:00:00Z", shipping_address: { recipient_name: "Buyer", line1: "Calle 1", city: "Ciudad", state: "Estado", postal_code: "12345" }, sellers: [{ id: "suborder", name: "Tienda local", total: 199 }], items: [{ id: "item", suborder_id: "suborder", title: "Camisa", variant: "M", quantity: 1, subtotal: 199 }] }, payment: { status: "REQUIRES_PAYMENT", updated_at: "2026-09-21T12:00:00Z", amount_cents: 19900, currency: "MXN" }, reservation: { status: "COMMITTED", expires_at: new Date(Date.now() + 900000).toISOString() }, canRetry: true });
const paid = () => { const value = pending(); value.order.status = "PAID"; value.payment.status = "SUCCEEDED"; value.canRetry = false; return value; };
const nodes = (tree, predicate) => Array.isArray(tree) ? tree.flatMap((node) => nodes(node, predicate)) : tree && typeof tree === "object" ? [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree && typeof tree === "object" ? text(tree.props?.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
const button = (tree, label) => nodes(tree, (node) => node.type === "button" && text(node) === label)[0];
const defer = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

async function harness({ file = checkoutFile, recovered = false, status = pending(), confirm = async () => ({}), submit = async () => ({}), href, environment } = {}) {
  const states = [], refs = [], effects = [];
  let cursor = 0, queue = [], tree, now = 0, timerId = 0, unmounted = false;
  const timers = new Map(), calls = [], redirects = [], stripeCalls = [], mounts = [], logs = [];
  const params = Promise.resolve({ id });
  let currentStatus = status, statusError = false, statusHang = false;
  const setTimeout = (fn, delay) => { const key = ++timerId; timers.set(key, { fn, time: now + delay }); return key; };
  const clearTimeout = (key) => timers.delete(key);
  const listeners = new Map();
  const addEventListener = (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); };
  const removeEventListener = (name, fn) => listeners.get(name)?.delete(fn);
  const emit = (name) => { for (const fn of listeners.get(name) || []) fn(); };
  const documentMock = { visibilityState: "visible", addEventListener, removeEventListener, createElement: () => ({ remove() {} }), head: { appendChild(script) { script.onload(); } } };
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value) => { if (!unmounted) states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return refs[index] ||= { current: initial }; },
    useEffect(fn, deps) { const index = cursor++; if (!effects[index] || deps.some((value, i) => value !== effects[index].deps[i])) { const previous = effects[index]; effects[index] = { deps }; queue.push(() => { previous?.cleanup?.(); effects[index].cleanup = fn(); }); } },
  };
  const location = { href: href || `http://localhost:3000/comu/checkout${recovered ? `?orderId=${id}` : ""}`, replace: (url) => redirects.push(url) };
  let stripeInstances = 0;
  const component = await load(file, { react: hooks, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, "next/link": { default: "a" } }, {
    setTimeout, clearTimeout, AbortController, AbortSignal, process: { env: { NEXT_PUBLIC_COMU_STRIPE_PUBLISHABLE_KEY: "pk_test_fixture", NODE_ENV: environment } }, crypto: { randomUUID: () => "fixture-idempotency" },
    console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    Date: class extends Date { static now() { return now; } },
    document: documentMock,
    window: { location, addEventListener, removeEventListener, history: { replaceState(_a, _b, url) { location.href = `http://localhost:3000${url}`; } }, Stripe() {
      stripeInstances++;
      const elements = { create: () => ({ mount: (selector) => mounts.push(selector), unmount: () => mounts.push("unmount") }), submit: async () => { stripeCalls.push("submit"); return submit(); } };
      return { elements: () => elements, confirmPayment: async (options) => { assert.equal(options.elements, elements, "same Stripe instance owns Elements"); assert.equal(options.redirect, "if_required"); assert.equal(options.confirmParams.return_url, location.href); stripeCalls.push("confirm"); return confirm(); } };
    } },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/payment-status")) {
        assert.equal(options.cache, "no-store");
        if (statusError) throw new Error("network fixture");
        if (statusHang) return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))));
        return Response.json(currentStatus);
      }
      if (url.endsWith("/addresses")) return Response.json({ ok: true, addresses: [{ id: "address", label: "Casa", is_default: true }] });
      if (url.endsWith("/cart")) return Response.json({ ok: true, items: [{ is_available: true }] });
      if (url.endsWith("/checkout")) return Response.json({ ok: true, order: { id, reservation_id: "reservation" } });
      if (url.endsWith("/intents")) return Response.json({ ok: true, clientSecret: "fixture-secret" });
      throw new Error(`unexpected ${url}`);
    },
  });
  function render() {
    cursor = 0; tree = component.default({ params });
    for (const dialog of nodes(tree, (node) => node.props?.role === "dialog")) {
      dialog.props.ref.current ||= { focused: false, focus() { this.focused = true; } };
    }
    return tree;
  }
  async function flush() { for (let i = 0; i < 8; i++) { render(); for (const effect of queue.splice(0)) effect(); await new Promise((done) => setImmediate(done)); } return render(); }
  async function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
      if (!next) break;
      now = next[1].time; timers.delete(next[0]); next[1].fn(); await flush();
    }
    now = end; return flush();
  }
  render(); await flush();
  return { render, flush, advance, calls, redirects, stripeCalls, mounts, timers, logs, listeners, focus() { emit("focus"); }, visibility(value) { documentMock.visibilityState = value; emit("visibilitychange"); }, get instances() { return stripeInstances; }, setStatus(value) { currentStatus = value; }, failStatus(value = true) { statusError = value; }, hangStatus() { statusHang = true; }, async prepare() { button(render(), "Continuar al pago").props.onClick(); await flush(); assert.deepEqual(mounts, ["#comu-payment-element"]); }, unmount() { unmounted = true; for (const effect of effects) effect?.cleanup?.(); } };
}
let count = 0;
async function check(name, run) { await run(); count++; console.log(`PASS ${name}`); }

await check("processing immediately; double click and confirming remain locked; frontend alone cannot declare success", async () => {
  const gate = defer(); const h = await harness({ confirm: () => gate.promise }); await h.prepare();
  const pay = button(h.render(), "Pagar"); pay.props.onClick(); pay.props.onClick();
  assert.ok(text(h.render()).includes("Procesando tu pago")); await h.flush();
  assert.deepEqual(h.stripeCalls, ["submit", "confirm"]); assert.equal(h.instances, 1);
  assert.ok(nodes(h.render(), (node) => node.props?.role === "dialog")[0].props.ref.current.focused);
  assert.equal(nodes(h.render(), (node) => node.props?.inert === true).length, 1);
  let prevented = false;
  nodes(h.render(), (node) => node.props?.role === "dialog")[0].props.onKeyDown({ key: "Tab", currentTarget: { querySelectorAll: () => [] }, preventDefault() { prevented = true; } });
  assert.equal(prevented, true, "processing traps keyboard focus without a native top-layer dialog");
  gate.resolve({}); await h.flush(); assert.ok(text(h.render()).includes("Estamos confirmando tu compra."));
  assert.ok(!text(h.render()).includes("¡Pago confirmado!")); assert.equal(button(h.render(), "Pagar").props.disabled, true);
  pay.props.onClick(); await h.flush(); assert.equal(h.stripeCalls.length, 2); h.unmount();
});
await check("PAID alone is insufficient; PAID + SUCCEEDED shows success and redirects after 1.8 seconds", async () => {
  const h = await harness(); await h.prepare(); button(h.render(), "Pagar").props.onClick(); await h.flush();
  const partial = pending(); partial.order.status = "PAID"; partial.canRetry = false; h.setStatus(partial); await h.advance(2000);
  assert.ok(!text(h.render()).includes("¡Pago confirmado!"));
  h.setStatus(paid()); await h.advance(2000); assert.ok(text(h.render()).includes("¡Pago confirmado!"));
  assert.equal(h.redirects.length, 0); await h.advance(1799); assert.equal(h.redirects.length, 0); await h.advance(1);
  assert.deepEqual(h.redirects, [`/comu/account/orders/${id}/confirmation`]); h.unmount();
});
await check("refresh with paid order reads backend and never creates order, intent or Stripe instance", async () => {
  const h = await harness({ recovered: true, status: paid() }); await h.advance(1800);
  assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0); assert.equal(h.instances, 0);
  assert.deepEqual(h.redirects, [`/comu/account/orders/${id}/confirmation`]); assert.equal(button(h.render(), "Pagar"), undefined); h.unmount();
});
await check("failed card allows explicit retry only after fresh reservation validation", async () => {
  const h = await harness({ confirm: async () => ({ error: { type: "card_error", code: "card_declined", message: "private technical details" } }) }); await h.prepare(); button(h.render(), "Pagar").props.onClick(); await h.flush();
  assert.ok(text(h.render()).includes("Tu banco rechazó el pago")); assert.ok(!text(h.render()).includes("private technical details"));
  button(h.render(), "Intentar nuevamente").props.onClick(); await h.flush(); assert.equal(button(h.render(), "Pagar").props.disabled, false);
  button(h.render(), "Pagar").props.onClick(); await h.flush(); const expired = pending(); expired.order.status = "EXPIRED"; expired.canRetry = false; h.setStatus(expired);
  button(h.render(), "Intentar nuevamente").props.onClick(); await h.flush(); assert.equal(button(h.render(), "Intentar nuevamente"), undefined); assert.ok(text(h.render()).includes("Tu reserva expiró")); h.unmount();
});
await check("submit validation fails without confirmPayment and supports retry", async () => {
  const h = await harness({ submit: async () => ({ error: { type: "validation_error" } }) }); await h.prepare(); button(h.render(), "Pagar").props.onClick(); await h.flush();
  assert.deepEqual(h.stripeCalls, ["submit"]); assert.ok(button(h.render(), "Intentar nuevamente")); h.unmount();
});
await check("60 second timeout is pending, stops polling and never retries payment", async () => {
  const h = await harness(); await h.prepare(); button(h.render(), "Pagar").props.onClick(); await h.flush();
  await h.advance(60000); assert.ok(text(h.render()).includes("Tu pago está siendo confirmado.")); assert.ok(!text(h.render()).includes("No pudimos completar el pago."));
  const count = h.calls.length; await h.advance(60000); assert.equal(h.calls.length, count); assert.deepEqual(h.stripeCalls, ["submit", "confirm"]); h.unmount();
});
await check("hanging reads also time out and unmount cancels timers", async () => {
  const h = await harness({ recovered: true }); h.hangStatus(); await h.advance(2000); await h.advance(58000);
  assert.ok(text(h.render()).includes("Tu pago está siendo confirmado.")); h.unmount(); assert.equal(h.timers.size, 0);
});
await check("payment received after expiry overrides expired order and forbids retry", async () => {
  const late = pending(); late.order.status = "EXPIRED"; late.payment.status = "PAYMENT_RECEIVED_AFTER_EXPIRY"; late.canRetry = false;
  const h = await harness({ recovered: true, status: late }); assert.ok(text(h.render()).includes("No necesitas volver a pagar.")); assert.equal(button(h.render(), "Intentar nuevamente"), undefined); assert.equal(h.stripeCalls.length, 0); h.unmount();
});
await check("server FAILED offers retry; cancelled order and uncertain network never charge", async () => {
  const h = await harness(); await h.prepare(); button(h.render(), "Pagar").props.onClick(); await h.flush(); const failed = pending(); failed.payment.status = "FAILED"; h.setStatus(failed); await h.advance(2000); assert.ok(button(h.render(), "Intentar nuevamente")); h.unmount();
  const cancelled = pending(); cancelled.order.status = "CANCELLED"; cancelled.canRetry = false;
  const c = await harness({ recovered: true, status: cancelled }); assert.ok(text(c.render()).includes("Este pedido fue cancelado")); assert.equal(c.stripeCalls.length, 0); c.unmount();
  const n = await harness({ confirm: async () => { throw new Error("network uncertain"); } }); await n.prepare(); button(n.render(), "Pagar").props.onClick(); await n.flush(); n.failStatus(); await n.advance(60000); assert.ok(text(n.render()).includes("Tu pago está siendo confirmado.")); assert.equal(button(n.render(), "Intentar nuevamente"), undefined); n.unmount();
});
await check("confirmation renders buyer snapshot, stores, items, total and safe CTAs only after backend success", async () => {
  const h = await harness({ file: confirmationFile, status: paid() }); const content = text(h.render());
  for (const label of ["¡Gracias por tu compra!", "Pedido confirmado", "Calle 1", "Tienda local", "Camisa", "199.00", "Ver mi pedido", "Seguir explorando"]) assert.ok(content.includes(label), label);
  assert.ok(!content.includes("pi_") && !content.includes("SUCCEEDED")); h.unmount();
  const p = await harness({ file: confirmationFile }); assert.ok(!text(p.render()).includes("¡Gracias por tu compra!")); p.unmount();
});
await check("order detail refresh redirects PAID; confirmation CTA detail view avoids redirect loop", async () => {
  const h = await harness({ file: detailFile, status: paid() }); assert.deepEqual(h.redirects, [`/comu/account/orders/${id}/confirmation`]); h.unmount();
  const d = await harness({ file: detailFile, status: paid(), href: `http://localhost:3000/comu/account/orders/${id}?view=detail` }); assert.equal(d.redirects.length, 0); assert.ok(text(d.render()).includes("Pedido confirmado")); d.unmount();
});

await check("tracking maps pending, processing and paid to truthful stepper progress", async () => {
  for (const [status, active, completed, title] of [[pending(), "Pago recibido", 0, "Tu pago está pendiente."], [{ ...pending(), payment: { ...pending().payment, status: "PROCESSING" } }, "Confirmando compra", 1, "Estamos confirmando tu pago."], [paid(), "Preparando pedido", 3, "Pedido confirmado."]]) {
    const h = await harness({ file: detailFile, status, href: `http://localhost:3000/comu/account/orders/${id}?view=detail` });
    const stepper = nodes(h.render(), (node) => node.type === "ol")[0];
    assert.equal(nodes(stepper, (node) => node.type === "li").length, 4);
    assert.ok(text(nodes(stepper, (node) => node.props?.["aria-current"] === "step")[0]).includes(active));
    assert.equal(nodes(stepper, (node) => node.type === "p" && text(node) === "Completado").length, completed);
    assert.ok(text(h.render()).includes(title));
    for (const technical of ["PAYMENT_PENDING", "SUCCEEDED", "REQUIRES_PAYMENT", "PROCESSING"]) assert.ok(!text(h.render()).includes(technical));
    h.unmount();
  }
});
await check("tracking exceptions pause progress and late payment never offers another charge", async () => {
  for (const [orderStatus, paymentStatus, expected] of [["EXPIRED", "REQUIRES_PAYMENT", "Tu reserva expiró."], ["EXPIRED", "PAYMENT_RECEIVED_AFTER_EXPIRY", "Nuestro equipo revisará tu compra."], ["CANCELLED", "FAILED", "Pedido cancelado."]]) {
    const status = pending(); status.order.status = orderStatus; status.payment.status = paymentStatus; status.canRetry = false;
    const h = await harness({ file: detailFile, status });
    assert.ok(text(h.render()).includes(expected)); assert.equal(nodes(h.render(), (node) => node.props?.["aria-current"] === "step").length, 0);
    assert.equal(nodes(h.render(), (node) => node.props?.href?.startsWith("/comu/checkout")).length, 0); h.unmount();
  }
});
await check("tracking retry CTA requires server permission; details include snapshot, stores and actions", async () => {
  for (const canRetry of [true, false]) {
    const status = pending(); status.payment.status = "FAILED"; status.canRetry = canRetry;
    const h = await harness({ file: detailFile, status });
    assert.equal(nodes(h.render(), (node) => node.props?.href === `/comu/checkout?orderId=${id}`).length, canRetry ? 1 : 0);
    for (const label of ["Orden #42", "199.00", "Camisa", "Tienda local", "Calle 1", "septiembre", "Actualizar ahora", "Ver detalle del pedido", "Seguir explorando"]) assert.ok(text(h.render()).includes(label), label);
    assert.equal(nodes(h.render(), (node) => node.props?.href === "#detalle-pedido").length, 1);
    assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0); h.unmount();
  }
});
await check("tracking refresh reads updated status without charging", async () => {
  const h = await harness({ file: detailFile, href: `http://localhost:3000/comu/account/orders/${id}?view=detail` }); h.setStatus(paid()); button(h.render(), "Actualizar ahora").props.onClick(); await h.flush();
  assert.ok(text(h.render()).includes("El vendedor ya puede comenzar a preparar tus piezas.")); assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 0); h.unmount();
});

await check("tracking polls every 2 seconds and updates paid stepper in place without a click or mutation", async () => {
  const h = await harness({ file: detailFile });
  assert.equal(h.calls.length, 1);
  await h.advance(1999); assert.equal(h.calls.length, 1);
  await h.advance(1); assert.equal(h.calls.length, 2);
  h.setStatus(paid()); await h.advance(2000);
  assert.ok(text(h.render()).includes("Pedido confirmado."));
  assert.ok(text(nodes(h.render(), (node) => node.props?.["aria-current"] === "step")[0]).includes("Preparando pedido"));
  assert.equal(nodes(h.render(), (node) => node.type === "p" && text(node) === "Completado").length, 3);
  assert.equal(h.redirects.length, 0);
  const count = h.calls.length; await h.advance(60000); assert.equal(h.calls.length, count);
  assert.ok(h.calls.every((call) => call.url.endsWith("/payment-status") && (!call.options.method || call.options.method === "GET")));
  assert.equal(h.instances, 0); h.unmount();
});
await check("tracking stops for all terminal order/payment states", async () => {
  for (const field of ["order", "payment"]) for (const state of ["EXPIRED", "CANCELLED", "FAILED", "PAYMENT_RECEIVED_AFTER_EXPIRY", "COMPLETED", "PARTIALLY_FULFILLED", "REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"]) {
    if (field === "payment" && ["EXPIRED", "COMPLETED", "PARTIALLY_FULFILLED"].includes(state)) continue;
    const status = pending(); status[field].status = state;
    const h = await harness({ file: detailFile, status }); await h.advance(60000); assert.equal(h.calls.length, 1, `${field}:${state}`); h.unmount();
  }
});
await check("visibility pauses tracking; visibility plus focus coalesce into one immediate read", async () => {
  const h = await harness({ file: detailFile }); h.visibility("hidden"); await h.advance(10000); assert.equal(h.calls.length, 1);
  h.visibility("visible"); h.focus(); h.focus(); await h.advance(100); assert.equal(h.calls.length, 2);
  await h.advance(1900); assert.equal(h.calls.length, 2); await h.advance(100); assert.equal(h.calls.length, 3);
  h.focus(); await h.advance(100); assert.equal(h.calls.length, 4);
  h.unmount(); assert.equal(h.timers.size, 0); assert.ok([...h.listeners.values()].every((listeners) => listeners.size === 0));
  await h.advance(10000); assert.equal(h.calls.length, 4);
});
await check("slow requests cannot overlap across polling, focus and repeated manual clicks", async () => {
  const h = await harness({ file: detailFile }); h.hangStatus(); await h.advance(2000); assert.equal(h.calls.length, 2);
  assert.ok(text(h.render()).includes("Actualizando estado…"));
  for (let i = 0; i < 10; i++) { h.focus(); button(h.render(), "Actualizar ahora").props.onClick(); }
  await h.advance(2000); assert.equal(h.calls.length, 2);
  h.unmount(); assert.ok(h.calls[1].options.signal.aborted); assert.equal(h.timers.size, 0);
});
await check("tracking slows after two minutes and stops automatic reads at fifteen minutes", async () => {
  const h = await harness({ file: detailFile }); await h.advance(120000);
  assert.ok(text(h.render()).includes("Seguimos consultando automáticamente."));
  const count = h.calls.length; await h.advance(14999); assert.equal(h.calls.length, count); await h.advance(1); assert.equal(h.calls.length, count + 1);
  await h.advance(765000); const finalCount = h.calls.length;
  assert.ok(text(h.render()).includes("Volveremos a consultar al regresar a esta pestaña."));
  await h.advance(60000); assert.equal(h.calls.length, finalCount);
  h.setStatus(paid()); h.focus(); await h.advance(100); assert.equal(h.calls.length, finalCount + 1); assert.ok(text(h.render()).includes("Pedido confirmado.")); h.unmount();
});
await check("network failures retain order details and recover through automatic polling", async () => {
  const h = await harness({ file: detailFile }); h.failStatus(); await h.advance(2000);
  assert.ok(text(h.render()).includes("Conservamos el último estado consultado.")); assert.ok(text(h.render()).includes("Camisa"));
  h.failStatus(false); h.setStatus(paid()); await h.advance(2000); assert.ok(text(h.render()).includes("Pedido confirmado.")); h.unmount();
});

await check("fresh status prevents confirming an already-paid order from a stale checkout", async () => {
  const h = await harness(); await h.prepare(); h.setStatus(paid()); button(h.render(), "Pagar").props.onClick(); await h.flush();
  assert.deepEqual(h.stripeCalls, []); assert.ok(text(h.render()).includes("¡Pago confirmado!")); h.unmount();
});
await check("an accepted retry ignores the prior FAILED snapshot until the webhook updates it", async () => {
  const failed = pending(); failed.payment.status = "FAILED"; failed.payment.updated_at = "2026-09-21T12:00:00Z";
  const h = await harness({ status: failed }); await h.prepare(); button(h.render(), "Pagar").props.onClick(); await h.flush(); await h.advance(2000);
  assert.ok(text(h.render()).includes("Estamos confirmando tu compra.")); assert.equal(button(h.render(), "Intentar nuevamente"), undefined);
  failed.payment.updated_at = "2026-09-21T12:01:00Z"; h.setStatus(failed); await h.advance(2000); assert.ok(button(h.render(), "Intentar nuevamente")); h.unmount();
});
await check("unmount during submit never confirms with disposed Elements", async () => {
  const gate = defer(); const h = await harness({ submit: () => gate.promise }); await h.prepare(); button(h.render(), "Pagar").props.onClick(); await h.flush(); h.unmount(); gate.resolve({}); await new Promise((done) => setImmediate(done)); assert.deepEqual(h.stripeCalls, ["submit"]);
});
await check("diagnostics retain submit/result/exception and redact secrets with authenticated status preflight", async () => {
  const error = { type: "card_error", code: "card_declined", message: "fixture-secret sk_test_private whsec_private 4242 4242 4242 4242", payment_intent: { id: "pi_fixture", client_secret: "pi_fixture_secret_private" } };
  for (const [label, options] of [
    ["COMU_STRIPE_SUBMIT_ERROR", { submit: async () => ({ error }) }],
    ["COMU_STRIPE_RESULT_ERROR", { confirm: async () => ({ error }) }],
    ["COMU_STRIPE_CONFIRM_EXCEPTION", { confirm: async () => { throw new Error(error.message); } }],
  ]) {
    const h = await harness({ environment: "development", ...options }); await h.prepare(); button(h.render(), "Pagar").props.onClick(); await h.flush(); assert.ok(h.logs.some(([name]) => name === label));
    const output = JSON.stringify(h.logs); for (const secret of ["fixture-secret", "sk_test_private", "whsec_private", "4242 4242 4242 4242", "pi_fixture_secret_private"]) assert.ok(!output.includes(secret)); h.unmount();
  }
  const h = await harness({ environment: "production", confirm: async () => ({ error }) }); await h.prepare(); button(h.render(), "Pagar").props.onClick(); await h.flush(); assert.deepEqual(h.logs, []); h.unmount();
});

class PosApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
async function api({ unauthorized = false, foreign = false, dbError = false, orderStatus = "PAYMENT_PENDING", paymentStatus = "FAILED", expired = false, requestedId = id } = {}) {
  const queries = [];
  const admin = { from(table) {
    const filters = []; queries.push({ table, filters });
    const query = { select(columns) { assert.ok(!columns.includes("*")); return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; }, limit() { return query; }, async maybeSingle() {
      if (dbError) return { data: null, error: new Error("private database error") };
      if (table === "comu_orders") { assert.ok(filters.some(([key, value]) => key === "buyer_id" && value === "buyer")); return { error: null, data: foreign ? null : { ...pending().order, status: orderStatus, reservation_id: "reservation", shipping_address_snapshot: { line1: "Calle 1", buyer_id: "private", secret: "private" }, comu_order_suborders: [{ id: "suborder", grand_total: 199, comu_sellers: { public_name: "Tienda" } }], comu_order_items: [{ id: "item", suborder_id: "suborder", quantity: 1, subtotal: 199, comu_order_item_snapshots: { snapshot: { productTitle: "Camisa" } } }] } }; }
      assert.ok(filters.some(([key, value]) => key === "buyer_id" && value === "buyer"));
      return { error: null, data: table === "comu_payment_intents" ? { status: paymentStatus, updated_at: "2026-09-21T12:00:00Z", amount_cents: 19900, currency: "MXN", stripe_payment_intent_id: "pi_private", client_secret: "secret" } : { status: "COMMITTED", expires_at: new Date(Date.now() + (expired ? -1 : 900000)).toISOString() } };
    } }; return query;
  } };
  admin.circular = admin;
  const route = await load(statusFile, { "next/server": { NextResponse: Response }, "@/lib/comu/buyers": { requireComuBuyer: async () => { if (unauthorized) throw new PosApiError(401, "AUTH", "private"); return { buyer: { id: "buyer" }, admin }; } }, "@/lib/pos/server": { PosApiError } });
  const response = await route.GET(new Request("http://localhost/status"), { params: Promise.resolve({ id: requestedId }) });
  return { response, body: await response.json(), queries };
}
await check("payment-status authenticates and scopes all reads; serializable public allowlist and no-store", async () => {
  const { response, body } = await api(); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(body.canRetry, true); assert.equal(body.order.items[0].title, "Camisa");
  const output = JSON.stringify(body); for (const privateValue of ["admin", "buyer_id", "client_secret", "stripe_payment_intent_id", "pi_private", "secret"]) assert.ok(!output.includes(privateValue));
  assert.equal((await api({ unauthorized: true })).response.status, 401); const foreign = await api({ foreign: true }); assert.equal(foreign.response.status, 404); assert.equal(foreign.queries.length, 1);
  assert.equal((await api({ requestedId: "invalid" })).response.status, 404); const failure = await api({ dbError: true }); assert.equal(failure.response.status, 500); assert.ok(!JSON.stringify(failure.body).includes("private database"));
});
await check("retry eligibility excludes paid, expired, processing and late payments", async () => {
  for (const scenario of [{ orderStatus: "PAID", paymentStatus: "SUCCEEDED" }, { expired: true }, { paymentStatus: "PROCESSING" }, { paymentStatus: "PAYMENT_RECEIVED_AFTER_EXPIRY" }, { orderStatus: "CANCELLED" }]) assert.equal((await api(scenario)).body.canRetry, false);
});
console.log(`COMU post-payment: ${count}/${count} PASS (local mocks; no external writes or payments)`);
