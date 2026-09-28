import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";

function load(path, imports) {
  const source = readFileSync(path, "utf8");
  const context = { exports: {}, URL, require(name) {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency ${name}`);
    return imports[name];
  }, window: { location: { assign(url) { redirects.push(url); } } } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
let authorized = true;
let brand = "brand-a";
let sellerStatus = "ACTIVE";
let account = null;
let queryError = null;
let calls = [];
let createError = false;
const actions = load("src/app/comu/seller/connect-settings-actions.ts", {
  "@/lib/comu/finance": {
    requireFinanceSeller: async () => {
      if (!authorized) throw new Error("UNAUTHORIZED");
      return { seller: { id: "seller-a", brand_slug: brand, status: sellerStatus }, admin: { from(table) {
        assert.equal(table, "comu_seller_payment_accounts");
        return { select(columns) { assert.equal(columns, "onboarding_status,financial_suspended"); return this; }, eq(column, id) { assert.equal(column, "seller_id"); assert.equal(id, "seller-a"); return this; }, maybeSingle: async () => ({ data: account, error: queryError }) };
      } } };
    },
    createSellerConnectAccount: async (...args) => { assert.equal(args.length, 0); calls.push("account"); if (createError) throw new Error("PERSISTENCE_FAILED"); return { onboarding_status: "PENDING" }; },
    createSellerOnboardingLink: async (...args) => { assert.equal(args.length, 0); calls.push("link"); return { url: "https://connect.stripe.com/synthetic-test-only" }; },
  },
});
assert.equal((await actions.getConnectSettingsState(brand)).status, "NOT_STARTED");
assert.equal(calls.length, 0, "Reading state must never initiate onboarding");
for (const status of ["NOT_STARTED", "PENDING", "COMPLETE", "REVIEW", "RESTRICTED"]) {
  account = { onboarding_status: status, financial_suspended: false };
  assert.equal((await actions.getConnectSettingsState(brand)).status, status);
  calls = [];
  const result = await actions.startConnectSettingsOnboarding(brand);
  const allowed = ["NOT_STARTED", "PENDING", "RESTRICTED"].includes(status);
  assert.equal(result.ok, allowed);
  assert.deepEqual(calls, allowed ? ["account", "link"] : []);
}
account = { onboarding_status: "PENDING", financial_suspended: true };
calls = [];
assert.equal((await actions.startConnectSettingsOnboarding(brand)).ok, false);
assert.deepEqual(calls, []);
account = null;
for (const scenario of ["unauthorized", "wrong-brand", "inactive", "query-error"]) {
  authorized = scenario !== "unauthorized";
  sellerStatus = scenario === "inactive" ? "SUSPENDED" : "ACTIVE";
  queryError = scenario === "query-error" ? new Error("DB_ERROR") : null;
  const input = scenario === "wrong-brand" ? "brand-b" : brand;
  assert.equal((await actions.getConnectSettingsState(input)).ok, false);
  assert.equal((await actions.startConnectSettingsOnboarding(input)).ok, false);
  assert.deepEqual(calls, []);
}
authorized = true; sellerStatus = "ACTIVE"; queryError = null; createError = true;
assert.equal((await actions.startConnectSettingsOnboarding(brand)).ok, false);
assert.deepEqual(calls, ["account"], "Never request a link or blindly retry after account failure");
createError = false;

let state;
let busy = false;
let hook = 0;
let starts = 0;
let reads = 0;
let redirects = [];
let effects = [];
const pending = { current: false };
const ui = load("src/app/comu/seller/seller-dashboard.tsx", {
  "react/jsx-runtime": jsx,
  react: { useState() { const i = hook++; return [i === 0 ? state : i === 1 ? busy : "", () => {}]; }, useRef: () => pending, useEffect: (effect) => effects.push(effect), useCallback: (f) => f },
  "next/link": { default: () => null },
  "./storefront-editor": {}, "./wholesale-manager": {}, "./shipping-settings": {}, "./products-manager": {},
  "./connect-settings-actions": {
    getConnectSettingsState: async (input) => { assert.equal(input, brand); reads++; return state; },
    startConnectSettingsOnboarding: async (...args) => { assert.deepEqual(args, [brand]); starts++; return { ok: true, url: "https://connect.stripe.com/synthetic-test-only" }; },
  },
});
function render(value, loading = false) {
  state = value; busy = loading; hook = 0; effects = []; pending.current = false;
  const tree = ui.PaymentConnection({ brandSlug: brand });
  return { tree, html: renderToStaticMarkup(tree) };
}
function buttons(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  return [...(node.type === "button" ? [node] : []), ...buttons(node.props?.children)];
}
for (const [status, badge, cta] of [["NOT_STARTED", "Pendiente", "Configurar pagos"], ["PENDING", "Configuración pendiente", "Continuar configuración"], ["COMPLETE", "Pagos configurados", null], ["REVIEW", "En revisión", null], ["RESTRICTED", "Requiere atención", "Resolver requisitos"]]) {
  const { tree, html } = render({ ok: true, status, suspended: false });
  assert.ok(html.includes(badge));
  const primary = buttons(tree).filter((button) => button.props.children !== "Actualizar estado");
  assert.equal(primary.length, cta ? 1 : 0);
  if (cta) { assert.equal(primary[0].props.children, cta); assert.equal(primary[0].props.disabled, false); }
  assert.ok(!html.includes("En preparación"));
}
assert.ok(render(null).html.includes("Consultando"));
assert.ok(render({ ok: false, error: "Acceso no autorizado" }).html.includes("Acceso no autorizado"));
assert.equal(buttons(render({ ok: true, status: "PENDING", suspended: true }).tree).length, 1);
assert.equal(buttons(render({ ok: true, status: "NOT_STARTED", suspended: false }, true).tree)[0].props.disabled, true);
const { tree } = render({ ok: true, status: "NOT_STARTED", suspended: false });
effects[0]();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(reads, 1);
assert.equal(starts, 0, "Mount must only read status");
const primary = buttons(tree)[0];
primary.props.onClick(); primary.props.onClick();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(starts, 1, "Double-click must not start two flows");
primary.props.onClick();
assert.equal(starts, 1, "Keep the button locked while leaving for hosted onboarding");
assert.deepEqual(redirects, ["https://connect.stripe.com/synthetic-test-only"]);
const source = readFileSync("src/app/comu/seller/connect-settings-actions.ts", "utf8");
assert.doesNotMatch(source, /new Stripe|accounts\.create|accountLinks\.create|COMU_STRIPE_SECRET_KEY/);
assert.ok(readFileSync("src/app/comu/seller/seller-dashboard.tsx", "utf8").includes('<PaymentConnection key={brandSlug} brandSlug={brandSlug} />'));
console.log("PASS Settings Connect: state rendering, loading/error, authenticated brand isolation, canonical-only actions, no client mode, no auto-create, double-click guard; all Stripe/DB calls mocked");
