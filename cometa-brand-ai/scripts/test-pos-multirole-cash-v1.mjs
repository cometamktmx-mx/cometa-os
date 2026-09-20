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
const roles = load("src/lib/pos/staff-shared.ts");
const { foodRoleViews } = load("src/lib/pos/food-shared.ts");
const { canAccessFoodPage } = load("src/lib/pos/surface-policy.ts");

test("A–E: single-role areas, union without implicit ADMIN and explicit empty assignments", () => {
  assert.deepEqual(foodRoleViews(["WAITER"]), ["salon"]);
  assert.deepEqual(foodRoleViews(["KITCHEN"]), ["kitchen"]);
  assert.deepEqual(foodRoleViews(["CASHIER"]), ["cash"]);
  const operator = { role: "WAITER", roles: ["WAITER", "KITCHEN", "CASHIER"] };
  assert.deepEqual(foodRoleViews(roles.staffRoles(operator)), ["salon", "kitchen", "cash"]);
  assert.equal(canAccessFoodPage("admin", operator.roles, true), false);
  assert.equal(canAccessFoodPage("admin", ["MANAGER"], true), false);
  assert.equal(canAccessFoodPage("admin", ["WAITER", "ADMIN"], true), true);
  assert.deepEqual(roles.staffRoles({ role: "ADMIN", roles: [] }), []);
  assert.deepEqual(roles.staffRoles({ role: "CASHIER" }), ["CASHIER"]);
});

test("F: changing Food area keeps the operator and does not invoke login/logout", () => {
  let slots = [], cursor = 0;
  const hooks = { ...React, useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; }, useEffect() {}, useCallback(fn) { return fn; }, useRef(value) { return { current: value }; } };
  const ui = loader({ react: hooks })("src/app/brand/[brandSlug]/components/pos-food-operations.tsx");
  const operator = { id: "one-person", name: "Juan", role: "WAITER", roles: ["WAITER", "KITCHEN", "CASHIER"], locationId: null };
  function render() { cursor = 0; return ui.PosFoodOperations({ operator, brandSlug: "local" }); }
  function elements(node) { if (!React.isValidElement(node)) return []; return [node, ...React.Children.toArray(node.props.children).flatMap(elements)]; }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Area switch must not login or revoke the PIN session"); };
  try {
    let tree = render();
    assert.match(renderToStaticMarkup(tree), /aria-label="Área de operación"/);
    assert.ok(["Salón", "Cocina", "Caja"].every(label => elements(tree).some(node => node.type === "button" && React.Children.toArray(node.props.children).includes(label))));
    for (const label of ["Salón", "Cocina", "Caja"]) {
      const button = elements(tree).find(node => node.type === "button" && React.Children.toArray(node.props.children).includes(label));
      assert.ok(button); button.props.onClick(); tree = render();
      assert.ok(elements(tree).some(node => node.type === "button" && node.props["aria-pressed"] === true && React.Children.toArray(node.props.children).includes(label)));
    }
    assert.equal(operator.id, "one-person");
  } finally { globalThis.fetch = originalFetch; }
});

test("O/P/Q: server rereads active roles for a live session, isolates brand, Retail remains legacy", async () => {
  const { createHash } = await import("node:crypto");
  const state = { mode: "restaurant", roles: [{ staff_id: "juan", brand_slug: "a", role: "WAITER", active: true }, { staff_id: "juan", brand_slug: "a", role: "CASHIER", active: true }, { staff_id: "juan", brand_slug: "b", role: "ADMIN", active: true }] };
  const session = { id: "same-session", token_hash: createHash("sha256").update("local-token").digest("hex"), host_user_id: "host", brand_slug: "a", location_id: "loc", revoked_at: null, expires_at: "2099-01-01", staff: { id: "juan", name: "Juan", role: "WAITER", active: true, location_id: "loc" } };
  const context = { brand: { slug: "a" }, user: { userId: "host" }, admin: { from(table) {
    let filters = [];
    const result = () => {
      if (table === "pos_business_profiles") return { data: { profile_code: state.mode }, error: null };
      const rows = table === "pos_staff_roles" ? state.roles : [session];
      return { data: rows.filter(row => filters.every(([key, value]) => row[key] === value)), error: null };
    };
    const chain = { select() { return chain; }, update() { return chain; }, eq(key, value) { filters.push([key, value]); return chain; }, is(key, value) { filters.push([key, value]); return chain; }, gt() { return chain; }, async single() { return result(); }, async maybeSingle() { const r = result(); return { ...r, data: r.data[0] || null }; }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
    return chain;
  } } };
  class PosApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  const server = loader({ "@/lib/pos/server": { PosApiError }, "next/headers": { cookies: async () => ({ get: () => ({ value: "local-token" }) }) } })("src/lib/pos/staff-server.ts");
  assert.equal((await server.requireStaffSession(context, "SALE_CHARGE", "loc")).id, "same-session");
  await assert.rejects(server.requireStaffSession(context, "STAFF_MANAGE"), error => error.code === "POS_STAFF_PERMISSION_REQUIRED");
  state.roles[1].active = false;
  await assert.rejects(server.requireStaffSession(context, "SALE_CHARGE"), error => error.code === "POS_STAFF_PERMISSION_REQUIRED");
  assert.equal((await server.requireStaffSession(context, "ORDER_SEND", "loc")).id, "same-session");
  state.roles[0].active = false;
  await assert.rejects(server.requireStaffSession(context, "ORDER_SEND"), error => error.code === "POS_STAFF_PERMISSION_REQUIRED");
  state.mode = "retail";
  assert.equal((await server.requireStaffSession(context, "ORDER_SEND", "loc")).id, "same-session");
  await assert.rejects(server.requireStaffSession(context, "ORDER_SEND", "other"), error => error.code === "POS_STAFF_LOCATION_FORBIDDEN");
});
