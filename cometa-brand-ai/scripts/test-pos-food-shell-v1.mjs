import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const loaded = { exports: {} }; cache.set(absolute, loaded);
    const localRequire = (name) => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === "server-only") return {};
      if (name === "next/link") return { default: ({ children, ...props }) => { const linkProps = { ...props }; delete linkProps.prefetch; return React.createElement("a", linkProps, children); }, __esModule: true };
      if (name === "next/navigation") return { useRouter: () => ({ replace() {}, refresh() {} }) };
      if (name.startsWith("@/") || name.startsWith(".")) {
        const root = name.startsWith("@/") ? path.resolve("src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
        for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
          try { readFileSync(root + suffix); return load(root + suffix); } catch (error) { if (error.code !== "ENOENT") throw error; }
        }
      }
      return require(name);
    };
    const code = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function("require", "module", "exports", code)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}
const load = loader();
const policy = load("src/lib/pos/surface-policy.ts");
const componentPath = "src/app/brand/[brandSlug]/components/";
const gate = load(componentPath + "pos-operator-gate.tsx");
const { PosTopbar } = load(componentPath + "pos-topbar.tsx");
const { FoodOperationalSurface, PosFoodAccess } = load(componentPath + "pos-food-access.tsx");
const brand = { slug: "sample", name: "Café de prueba", industry: "Café", brandId: "sample", brandExists: true };
const operator = { id: "a", name: "Ana", role: "ADMIN", locationId: null };
const data = { mode: "CAFE", gateRequired: true, firstRun: false, canConfigure: true, branding: null, staff: [operator], locations: [], session: null };
const noop = () => {};
const surfaceProps = { data, fallbackName: brand.name, selected: operator, pin: "", error: null, busy: false, firstName: "", firstLocation: "", onSelect: noop, onPinChange: noop, onFirstNameChange: noop, onFirstLocationChange: noop, onCreateFirst: noop, onLogin: noop };
const html = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("state machine distinguishes all six states, independent of permanent gate requirement", () => {
  const initial = { loaded: false, error: false, firstRun: false, authenticated: false, adminMode: false };
  assert.equal(policy.getFoodAccessState(initial), "loading");
  assert.equal(policy.getFoodAccessState({ ...initial, error: true }), "error");
  assert.equal(policy.getFoodAccessState({ ...initial, loaded: true, firstRun: true }), "first-run");
  assert.equal(policy.getFoodAccessState({ ...initial, loaded: true }), "locked");
  assert.equal(policy.getFoodAccessState({ ...initial, loaded: true, authenticated: true }), "authenticated-operational");
  assert.equal(policy.getFoodAccessState({ ...initial, loaded: true, authenticated: true, adminMode: true }), "authenticated-admin");
});
test("route authorization matrix denies typed admin URLs without current ADMIN and explicit mode", () => {
  for (const suffix of ["admin", "products", "settings/personalization", "customers", "staff", "team", "inventory", "reports/print", "onboarding"]) {
    const kind = policy.getFoodPageKind(`/brand/sample/pos/${suffix}`, "sample");
    assert.equal(kind, "admin");
    for (const role of [null, "WAITER", "CASHIER", "KITCHEN", "MANAGER"]) assert.equal(policy.canAccessFoodPage(kind, role, true), false);
    assert.equal(policy.canAccessFoodPage(kind, "ADMIN", false), false);
    assert.equal(policy.canAccessFoodPage(kind, "ADMIN", true), true);
  }
  for (const suffix of ["cash", "register"]) {
    const kind = policy.getFoodPageKind(`/brand/sample/pos/${suffix}`, "sample");
    for (const role of ["ADMIN", "MANAGER", "CASHIER"]) assert.equal(policy.canAccessFoodPage(kind, role, false), true);
    for (const role of [null, "WAITER", "KITCHEN"]) assert.equal(policy.canAccessFoodPage(kind, role, false), false);
  }
});
test("Retail profiles and existing commercial/recovery decisions remain unchanged", () => {
  for (const profile of ["retail", "fashion", "unconfigured"]) assert.equal(policy.isFoodProfile(profile), false);
  for (const profile of ["restaurant", "coffee_shop"]) assert.equal(policy.isFoodProfile(profile), true);
  const input = { pathname: "/brand/sample/pos", brandSlug: "sample", ready: true, commercialAccessAllowed: true, entitlements: ["pos.access"] };
  assert.equal(policy.getPosSurfaceState(input), "operation");
  assert.equal(policy.getPosSurfaceState({ ...input, commercialAccessAllowed: false }), "blocked");
  assert.equal(policy.getPosSurfaceState({ ...input, pathname: "/brand/sample/pos/subscription", ready: false }), "recovery");
});
test("lockout remains active until expiry and releases at exact expiry", () => {
  const until = "2026-09-13T12:05:00Z", at = Date.parse(until);
  assert.equal(policy.isStaffLocked(until, at - 1), true);
  assert.equal(policy.isStaffLocked(until, at), false);
  assert.equal(policy.isStaffLocked(until, at + 1), false);
});
test("rendered login button: 0–3 disabled, 4–8 enabled, busy disabled with spinner", () => {
  for (let length = 0; length <= 8; length++) {
    const output = html(gate.PosOperatorGateSurface, { ...surfaceProps, pin: "1".repeat(length) });
    const button = output.match(/<button[^>]*><span>Ingresar<\/span><\/button>/)?.[0];
    assert.ok(button); assert.equal(button.includes('disabled=""'), length < 4);
    assert.ok(button.includes("bg-[var(--pos-primary)]"));
  }
  assert.match(html(gate.PosOperatorGateSurface, { ...surfaceProps, pin: "1234", busy: true }), /aria-busy="true"/);
});
test("first-run renders ADMIN form and errors are visible", () => {
  assert.match(html(gate.PosOperatorGateSurface, { ...surfaceProps, data: { ...data, firstRun: true } }), /Crear primer operador/);
  assert.match(html(gate.PosOperatorGateSurface, { ...surfaceProps, error: "PIN incorrecto" }), /role="alert"[^>]*>PIN incorrecto/);
});
test("Food wrapper supplies token scope before gate renders; no operational children while loading", () => {
  const output = html(PosFoodAccess, { brand, user: null, pathname: "/brand/sample/pos", entitlements: [], onOperatorChange: noop, children: "ADMIN SECRET DASHBOARD" });
  assert.match(output, /class="cometa-pos /); assert.doesNotMatch(output, /ADMIN SECRET DASHBOARD/);
});
test("Food topbar renders operator actions without responsive hiding; admin only by explicit permission", () => {
  const props = { brand, user: null, pathname: "/brand/sample/pos", isLoading: false, operator, operatorGateRequired: true, foodOperational: true, onOpenNavigation: noop, onOperatorAction: noop, onAdminAction: noop };
  const output = html(PosTopbar, { ...props, showAdminAction: true });
  for (const label of ["Ana", "Administrador", "Cambiar operador", "Bloquear", "Administrar POS"]) assert.ok(output.includes(label));
  // Essential operator identity/actions stay visible at every breakpoint.
  // Decorative aria-hidden icons, the xl-only status/location and the mobile
  // navigation button may be hidden; they are not operator session controls.
  function assertVisiblePath(node, label, ancestors = []) {
    if (!React.isValidElement(node)) return false;
    const chain = [...ancestors, node];
    const children = React.Children.toArray(node.props.children);
    if (children.some(child => typeof child === "string" && child.includes(label))) {
      for (const element of chain) {
        assert.ok(!element.props.hidden, `${label}: hidden attribute on ancestor`);
        assert.ok(![true, "true"].includes(element.props["aria-hidden"]), `${label}: aria-hidden on ancestor`);
        assert.doesNotMatch(element.props.className || "", /(?:^|\s)(?:\S+:)?(?:hidden|invisible|collapse|opacity-0)(?:\s|$)/, `${label}: hidden at a breakpoint`);
        assert.notEqual(element.props.style?.display, "none", `${label}: display:none`);
        assert.notEqual(element.props.style?.visibility, "hidden", `${label}: visibility:hidden`);
      }
      return true;
    }
    return children.some(child => assertVisiblePath(child, label, chain));
  }
  for (const showFoodNavigation of [false, true]) {
    const tree = PosTopbar({ ...props, showAdminAction: true, showFoodNavigation });
    for (const label of ["Ana", "Administrador", "Cambiar operador", "Bloquear", "Administrar POS"]) {
      assert.ok(assertVisiblePath(tree, label), `${label}: essential control/identity missing`);
    }
  }
  assert.doesNotMatch(html(PosTopbar, { ...props, operator: { ...operator, role: "MANAGER" }, showAdminAction: false }), /Administrar POS/);
});
test("role surfaces render Salon/Caja/Cocina without technical placeholder language", () => {
  for (const [role, title] of [["ADMIN", "Salón"], ["MANAGER", "Salón"], ["WAITER", "Salón"], ["CASHIER", "Caja"], ["KITCHEN", "Cocina"]]) {
    const output = html(FoodOperationalSurface, { operator: { ...operator, role }, base: "/brand/sample/pos", entitlements: ["pos.cash", "pos.sales"] });
    assert.ok(output.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").includes(title.normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""))); assert.doesNotMatch(output, /placeholder|siguiente módulo|coming soon/i);
    assert.equal(output.includes("Venta directa"), role === "CASHIER");
  }
});

// Deterministic hook adapter: executes the production gate and its event handlers.
// No browser, real cookies, network, or database mutations.
function controller(initialData = data) {
  let slots = [], cursor = 0, timers = [], responses = [], observed = [], requests = [], completions = [];
  const hooks = {
    ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn) { return fn; }, useMemo(fn) { return fn(); },
    useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; fn(); } },
  };
  const fakeWindow = { setTimeout(fn) { timers.push(fn); return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} };
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
  globalThis.window = fakeWindow;
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); const response = responses.shift(); if (response instanceof Error) throw response; return { ok: response?.ok !== false, json: async () => response?.body ?? initialData }; };
  const { PosOperatorGate } = loader({ react: hooks })(componentPath + "pos-operator-gate.tsx");
  const props = { brandSlug: "sample", fallbackName: "Sample", requireFood: true, children: () => null, onOperatorChange: (value) => observed.push(value), onActionComplete: (action) => completions.push(action) };
  function render() { cursor = 0; return PosOperatorGate(props); }
  async function settle() { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); }
  return { render, async start() { render(); timers.splice(0).forEach(fn => fn()); await settle(); return render(); }, settle, responses, requests, observed, completions,
    close() { globalThis.window = oldWindow; globalThis.fetch = oldFetch; slots = []; } };
}
test("gate transition: first ADMIN creation selects persisted operator without auto-login", async () => {
  const c = controller({ ...data, firstRun: true, staff: [] });
  try {
    let tree = await c.start();
    c.responses.push({ body: { staff: operator } }, { body: data });
    await tree.props.children.props.onCreateFirst({ preventDefault() {} });
    tree = c.render();
    assert.equal(tree.props["data-food-state"], "locked");
    assert.equal(tree.props.children.props.selected.id, operator.id);
    assert.equal(tree.props.children.props.pin, "");
  } finally { c.close(); }
});
test("gate transition: PIN error then successful login exits fullscreen; lock hides data immediately", async () => {
  const c = controller();
  try {
    let tree = await c.start();
    tree.props.children.props.onSelect(operator); tree = c.render();
    tree.props.children.props.onPinChange("1234"); tree = c.render();
    c.responses.push({ ok: false, body: { error: "PIN incorrecto" } }, { body: data });
    tree.props.children.props.onLogin(); await c.settle(); tree = c.render();
    assert.equal(tree.props.children.props.error, "PIN incorrecto");
    tree.props.children.props.onPinChange("4321"); tree = c.render();
    c.responses.push({ body: { session: { staff: operator } } }, { body: { ...data, session: { staff: operator } } });
    tree.props.children.props.onLogin(); await c.settle(); tree = c.render();
    assert.equal(tree.props.children.props.data.session.staff.id, operator.id);
    c.responses.push({ body: { session: null } }, { body: data });
    const pending = tree.props.children.props.action("lock");
    assert.equal(c.render().props["data-food-state"], "loading");
    await pending;
    assert.equal(c.render().props["data-food-state"], "locked");
    assert.equal(c.observed.at(-1), null);
  } finally { c.close(); }
});
test("load failure exposes retry and refuses unexpected RETAIL response for Food", async () => {
  const c = controller();
  try {
    c.responses.push(new Error("Sin conexión"));
    let tree = await c.start(); assert.equal(tree.props["data-food-state"], "error");
    c.responses.push({ body: { ...data, mode: "RETAIL", gateRequired: false } });
    tree.props.children[2].props.onClick(); await c.settle();
    tree = c.render(); assert.equal(tree.props["data-food-state"], "error");
    c.responses.push({ body: data }); tree.props.children[2].props.onClick(); await c.settle();
    assert.equal(c.render().props["data-food-state"], "locked");
  } finally { c.close(); }
});
test("failed revocation stays covered; retry repeats revoke before loading", async () => {
  const c = controller({ ...data, session: { staff: operator } });
  try {
    let tree = await c.start(); c.responses.push({ ok: false, body: { error: "No se pudo bloquear" } });
    await assert.rejects(tree.props.children.props.action("switch"));
    tree = c.render(); assert.equal(tree.props["data-food-state"], "error");
    c.responses.push({ body: { session: null } }, { body: data });
    tree.props.children[2].props.onClick(); await c.settle();
    assert.equal(c.render().props["data-food-state"], "locked");
    assert.equal(JSON.parse(c.requests.at(-2).options.body).action, "switch");
    assert.deepEqual(c.completions, ["switch"]);
  } finally { c.close(); }
});

test("brand navigation remounts the shell with a distinct React key", async () => {
  const { default: Layout } = loader({
    "../components/pos-shell": { __esModule: true, default: () => null },
    "../components/pos-ui/pos-tokens.css": {},
    "@/lib/pos/access": { requirePosSurfaceAccess: async () => ({}) },
    "@/lib/pos/server": { PosApiError: class extends Error {} },
  })("src/app/brand/[brandSlug]/pos/layout.tsx");
  const first = await Layout({ params: Promise.resolve({ brandSlug: "a" }), children: null });
  const second = await Layout({ params: Promise.resolve({ brandSlug: "b" }), children: null });
  assert.equal(first.key, "a"); assert.equal(second.key, "b"); assert.notEqual(first.key, second.key);
});

