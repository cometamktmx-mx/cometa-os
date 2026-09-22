import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const normalized = value => value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
function compile(file, deps = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => Object.hasOwn(deps, name) ? deps[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const shared = compile("src/lib/pos/food-shared.ts");
const staffShared = compile("src/lib/pos/staff-shared.ts");
const numericInput = compile("src/lib/pos/numeric-input.ts");
const modalUi = compile("src/app/brand/[brandSlug]/components/pos-ui/pos-modal.tsx");
const drawerUi = compile("src/app/brand/[brandSlug]/components/pos-ui/pos-drawer.tsx");
const modifierUi = compile("src/app/brand/[brandSlug]/components/pos-food-modifiers.tsx", {"@/lib/pos/food-shared":shared,"./pos-ui/pos-modal":modalUi});
const receiptSocialsUi = compile("src/app/brand/[brandSlug]/components/pos-receipt-socials.tsx");
const receiptUi = compile("src/app/brand/[brandSlug]/components/pos-food-receipt.tsx", {"@/lib/pos/food-shared":shared,"./pos-food-modifiers":modifierUi,"./pos-receipt-socials":receiptSocialsUi});
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
class PosApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
function fixture(role = "ADMIN") {
  const calls = [], commercial = [];
  const state = { role, mode: "RESTAURANT", session: true, allowed: true, location: null, rpcError: null, rpcData: {}, profileError: false };
  const context = { brand: { slug: "test-food", id: "resolved-brand" }, user: { userId: id(1) }, admin: { rpc: async (name, args) => { calls.push({ name, args }); return { data: state.rpcData, error: state.rpcError }; } } };
  const server = {
    PosApiError,
    uuidValue(value, name, required = true) {
      if (!value && !required) return null;
      if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new PosApiError(400, "POS_VALIDATION_ERROR", name);
      return value;
    },
    requiredText: value => value, getBrandSlugFromUrl: request => new URL(request.url).searchParams.get("brandSlug"), readJsonBody: request => request.json(),
    ok: body => ({ status: 200, body }), handlePosError: error => ({ status: error.status || 500, body: { error: error.message, code: error.code } }),
  };
  const access = {
    requirePosOperationalAccess: async ({ brandSlug, entitlement }) => {
      if (brandSlug !== "test-food" || !state.allowed) throw new PosApiError(403, "POS_BRAND_FORBIDDEN", "Forbidden");
      commercial.push(entitlement); return context;
    },
    requirePosCommercialAccess: async (_, entitlement) => { commercial.push(entitlement); return context; },
  };
  const staff = {
    getPosMode: async () => { if (state.profileError) throw new PosApiError(503, "POS_PROFILE_READ_FAILED", "Failed"); return state.mode; },
    requireStaffSession: async (_, permission, location) => {
      if (!state.session) throw new PosApiError(401, "POS_STAFF_SESSION_REQUIRED", "Missing PIN session");
      if (!staffShared.POS_STAFF_ROLE_PERMISSIONS[state.role].includes(permission)) throw new PosApiError(403, "POS_STAFF_PERMISSION_REQUIRED", "Forbidden");
      if (state.location && location && location !== state.location) throw new PosApiError(403, "POS_STAFF_LOCATION_FORBIDDEN", "Forbidden");
      return { id: id(2), staff: { id: id(3), role: state.role }, locationId: state.location };
    },
  };
  const domain = compile("src/lib/pos/food-server.ts", { "server-only": {}, "./access": access, "./staff-server": staff, "./server": server, "./food-shared": shared });
  const route = compile("src/app/api/pos/food/route.ts", { "@/lib/pos/server": server, "@/lib/pos/food-server": domain });
  const post = body => route.POST(new Request("http://local/api/pos/food", { method: "POST", body: JSON.stringify({ brandSlug: "test-food", idempotencyKey: id(4), ...body }) }));
  return { state, context, calls, commercial, domain, route, post };
}
const payloads = {
  table_create: { locationId: id(5), name: "Mesa 4" }, open: { tableId: id(6), guests: 2 },
  item_add: { checkId: id(7), variantId: id(8), quantity: 2, notes: "sin hielo" },
  item_update: { checkId: id(7), itemId: id(9), quantity: 1, notes: "sin cebolla", version: 1 },
  send: { checkId: id(7), version: 2 }, prepare: { checkId: id(7), ticketId: id(10) },
  ready: { checkId: id(7), ticketId: id(10) }, serve: { checkId: id(7), ticketId: id(10) },
  request_payment: { checkId: id(7), version: 3 }, resume: { checkId: id(7), version: 4 },
  pay: { checkId: id(7), cashSessionId: id(11), method: "cash", version: 5 },
};
test("production endpoint authorizes every action by physical operator role before RPC", async () => {
  for (const role of staffShared.POS_STAFF_ROLES) {
    const f = fixture(role);
    for (const [action, payload] of Object.entries(payloads)) {
      const before = f.calls.length;
      const result = await f.post({ action, ...payload });
      const allowed = staffShared.POS_STAFF_ROLE_PERMISSIONS[role].includes(shared.FOOD_ACTION_PERMISSIONS[action]);
      assert.equal(result.status, allowed ? 200 : 403, `${role}: ${action}`);
      assert.equal(f.calls.length - before, allowed ? 1 : 0);
    }
  }
});
test("host, normalized brand and PIN session are server sourced; injected operator/price ignored", async () => {
  const f = fixture("WAITER");
  const result = await f.post({ action: "item_add", ...payloads.item_add, operatorId: id(90), sessionId: id(91), hostUserId: id(92), unitPrice: 0.01, brandId: "other" });
  assert.equal(result.status, 200);
  const args = f.calls[0].args;
  assert.equal(args.p_host_user_id, id(1)); assert.equal(args.p_session_id, id(2)); assert.equal(args.p_brand_slug, "test-food");
  assert.deepEqual(args.p_payload, payloads.item_add);
  assert.equal((await f.post({ action: "open", ...payloads.open, brandSlug: "another-brand" })).status, 403);
  assert.equal(f.calls.length, 1);
});
test("missing PIN, failed profile, Retail and foreign location fail closed", async () => {
  const f = fixture();
  f.state.session = false;
  assert.equal((await f.post({ action: "send", ...payloads.send })).status, 401);
  f.state.session = true; f.state.profileError = true;
  assert.equal((await f.post({ action: "send", ...payloads.send })).status, 503);
  f.state.profileError = false; f.state.mode = "RETAIL";
  assert.equal((await f.post({ action: "send", ...payloads.send })).status, 403);
  f.state.mode = "CAFE"; f.state.location = id(44);
  assert.equal((await f.post({ action: "table_create", ...payloads.table_create })).status, 403);
  assert.equal((await f.route.GET(new Request(`http://local/?brandSlug=test-food&locationId=${id(45)}`))).status, 403);
  assert.equal(f.calls.length, 0);
});
test("snapshot uses operator location and tenant context; restaurant and coffee shop supported", async () => {
  for (const mode of ["RESTAURANT", "CAFE"]) {
    const f = fixture("KITCHEN"); f.state.mode = mode; f.state.location = id(5);
    assert.equal((await f.route.GET(new Request("http://local/?brandSlug=test-food"))).status, 200);
    assert.deepEqual(f.calls[0], { name: "pos_food_snapshot_v1", args: { p_brand_slug: "test-food", p_host_user_id: id(1), p_session_id: id(2), p_location_id: id(5) } });
  }
});
test("pay requires canonical sales and cash entitlements and preserves request idempotency", async () => {
  const f = fixture("CASHIER");
  await f.post({ action: "pay", ...payloads.pay }); await f.post({ action: "pay", ...payloads.pay });
  assert.deepEqual(f.commercial, ["pos.access", "pos.sales", "pos.cash", "pos.access", "pos.sales", "pos.cash"]);
  assert.equal(f.calls[0].args.p_key, f.calls[1].args.p_key);
  assert.equal(f.calls[0].name, "pos_food_command_v1");
});
test("untrusted malformed command fields are rejected before authorization/mutation", async () => {
  for (const body of [null, [], "open", 1]) {
    const f = fixture();
    assert.equal((await f.route.POST(new Request("http://local/api/pos/food", { method: "POST", body: JSON.stringify(body) }))).status, 400);
    assert.equal(f.calls.length, 0);
  }
  for (const body of [
    { action: "__proto__" }, { action: "constructor" }, { action: "open", ...payloads.open, guests: 0 },
    { action: "open", ...payloads.open, guests: 1.5 }, { action: "open", ...payloads.open, tableId: "bad" },
    { action: "item_add", ...payloads.item_add, quantity: -1 }, { action: "item_add", ...payloads.item_add, notes: "x".repeat(501) },
    { action: "send", checkId: id(7) }, { action: "pay", ...payloads.pay, method: "wire" },
    { action: "send", ...payloads.send, idempotencyKey: null },
  ]) { const f = fixture(); assert.equal((await f.post(body)).status, 400, JSON.stringify(body)); assert.equal(f.calls.length, 0); }
});
test("safe HTTP errors distinguish conflict, unavailable schema, session, access and absent resource", async () => {
  const f = fixture();
  for (const [message, status] of [["POS_FOOD_CONFLICT", 409], ["POS_FOOD_TABLE_OCCUPIED", 409], ["POS_FOOD_FORBIDDEN", 403], ["POS_FOOD_SESSION_REQUIRED", 401], ["POS_FOOD_NOT_FOUND", 404], ["private database credentials example", 503]]) {
    f.state.rpcError = { message };
    const result = await f.post({ action: "open", ...payloads.open });
    assert.equal(result.status, status); assert.ok(!result.body.error.includes("private database"));
  }
  f.state.rpcError = null; f.state.rpcData = null;
  assert.equal((await f.post({ action: "open", ...payloads.open })).status, 503);
});
test("table presentation accounts for multiple rounds, delivery and closed accounts", () => {
  const account = { id: "check", status: "OPEN" };
  const first = { check_id: "check", status: "READY", served_at: null };
  const second = { check_id: "check", status: "PENDING", served_at: null };
  assert.equal(shared.foodTableState(undefined, []), "AVAILABLE");
  assert.equal(shared.foodTableState(account, []), "OCCUPIED");
  assert.equal(shared.foodTableState(account, [first, second]), "READY");
  assert.equal(shared.foodTableState(account, [{ ...first, served_at: "now" }, second]), "ORDER_SENT");
  assert.equal(shared.foodTableState(account, [{ ...first, served_at: "now" }]), "OCCUPIED");
  assert.equal(shared.foodTableState({ ...account, status: "PAYMENT_PENDING" }, [first]), "PAYMENT_PENDING");
  assert.equal(shared.foodTableState({ ...account, status: "CLOSED" }, [first]), "AVAILABLE");
  assert.equal(shared.foodTableState(account, [{ ...first, check_id: "other" }]), "OCCUPIED");
});
test("KDS renders notes, elapsed urgency and state-appropriate actions without CRUD tables", () => {
  const ui = compile("src/app/brand/[brandSlug]/components/pos-food-operations.tsx", { "@/lib/pos/staff-shared": staffShared, "@/lib/pos/numeric-input": numericInput, "@/lib/pos/food-shared": shared, "./pos-ui/pos-modal": modalUi, "./pos-ui/pos-drawer": drawerUi, "./pos-food-modifiers":modifierUi, "./pos-food-receipt":receiptUi });
  const props = { ticket: { sequence: 2, status: "PENDING", sent_at: "2026-09-14T10:00:00Z" }, items: [{ id: "item", quantity: 2, product_name: "Cappuccino", variant_name: "Grande", notes: "Sin hielo" }], table: "Mesa 4", sender: "Ana", now: Date.parse("2026-09-14T10:20:00Z"), busy: false, onAction() {} };
  for (const [status, label] of [["PENDING", "Iniciar preparaci"], ["PREPARING", "Marcar listo"], ["READY", "Listo"]]) {
    const html = renderToStaticMarkup(React.createElement(ui.KitchenTicket, { ...props, ticket: { ...props.ticket, status } }));
    for (const text of ["Mesa 4", "Ana", "20 min", "Sin hielo", "Cappuccino", label]) assert.ok(normalized(html).includes(normalized(text)));
    assert.doesNotMatch(html, /<table/);
    if (status !== "READY") assert.match(html, /border-rose-400/);
  }
});
test("migration contract: service-only RPCs, account locks, immutable rounds and canonical atomic checkout", () => {
  const sql = readFileSync("supabase/migrations/20260914120000_pos_food_operations_v1.sql", "utf8");
  for (const table of ["tables", "checks", "items", "tickets", "events"]) {
    assert.ok(sql.includes(`alter table public.pos_food_${table} enable row level security`));
  }
  assert.match(sql, /pos_food_one_open_check[\s\S]*?where status <> 'CLOSED'/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /request_key=p_key/);
  assert.match(sql, /v_old\.payload<>p_payload/);
  assert.match(sql, /v_old\.actor_id<>v_actor\.id/);
  assert.match(sql, /where id=\(p_payload->>'checkId'\)::uuid and brand_slug=p_brand_slug for update/);
  assert.match(sql, /where check_id=v_check\.id and ticket_id is null and voided_at is null/);
  assert.match(sql, /foreign key\(ticket_id, check_id, brand_slug\)/);
  assert.match(sql, /served_at=v_time,served_by=v_actor.id/);
  assert.match(sql, /closed_by=v_actor.id,cashier_id=v_actor.id/);
  assert.match(sql, /pos_complete_sale_with_staff_v1\(/);
  assert.match(sql, /'Food check ' \|\| v_check.id::text,p_host_user_id,null,v_check.id/);
  assert.doesNotMatch(sql, /insert into public\.pos_(sales|payments|sale_items)\b/i);
  assert.doesNotMatch(sql, /delete from public\.pos_food/i);
  assert.doesNotMatch(sql, /grant execute[^;]*to (anon|authenticated)/i);
  assert.match(sql, /v_item.version is distinct from/);
  assert.match(sql, /v_check.version is distinct from/);
});

test("Food stock is consumed only by canonical checkout; SEND is availability-only", () => {
  const sql = readFileSync("supabase/migrations/20260914120000_pos_food_operations_v1.sql", "utf8");
  const send = sql.split("elsif p_action='send' then")[1].split("elsif p_action in ('prepare','ready','serve')")[0];
  assert.match(send, /quantity-v_inventory.reserved_quantity<v_stock.quantity/);
  assert.doesNotMatch(send, /update public\.pos_inventory\b|insert into public\.pos_inventory_movements\b/i);
  assert.doesNotMatch(send, /inventory_committed_at\s*=/);
  const pay = sql.split("elsif p_action='pay' then")[1].split("if v_check.id is not null")[0];
  assert.match(pay, /pos_complete_sale_with_staff_v1/);
  assert.match(pay, /set inventory_committed_at=clock_timestamp\(\)[\s\S]*track_inventory/);
  assert.doesNotMatch(pay, /update public\.pos_inventory\b|insert into public\.pos_inventory_movements\b/i);
});

function uiFixture({ role = "WAITER", selected = null, snapshot } = {}) {
  const empty = { locations: [{ id: id(5), name: "Sucursal", currency: "MXN", prices_include_tax: true }], location: { id: id(5), name: "Sucursal", currency: "MXN", prices_include_tax: true }, tables: [{ id: id(6), name: "Mesa 4" }], checks: [], tickets: [], items: [], staff: [], products: [], cash_sessions: [] };
  const initialSnapshot = snapshot || empty;
  const slots = [], requests = [], responses = [];
  let cursor = 0;
  const hooks = { ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = index === 1 ? initialSnapshot : index === 3 ? selected : typeof initial === "function" ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback(fn) { return fn; }, useEffect() {},
  };
  const ui = compile("src/app/brand/[brandSlug]/components/pos-food-operations.tsx", { "@/lib/pos/staff-shared": staffShared, "@/lib/pos/numeric-input": numericInput, "@/lib/pos/food-shared": shared, "./pos-ui/pos-modal": modalUi, "./pos-ui/pos-drawer": drawerUi, "./pos-food-modifiers":modifierUi, "./pos-food-receipt":receiptUi, react: hooks });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); const response = responses.shift(); if (response instanceof Error) throw response; return { ok: response?.ok !== false, status: response?.status || 200, json: async () => response?.body || (options?.method === "POST" ? { result: {} } : { snapshot: initialSnapshot }) }; };
  function render() { cursor = 0; return ui.PosFoodOperations({ operator: { id: id(3), name: "Ana", role }, brandSlug: "test-food" }); }
  return { render, requests, responses, empty, setSnapshot(value) { slots[1] = value; }, close() { globalThis.fetch = oldFetch; }, async settle() { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); } };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
function buttonWith(tree, label) {
  return nodes(tree).find(node => node.type === "button" && nodesText(node.props.children).includes(label));
}
function nodesText(tree) {
  if (Array.isArray(tree)) return tree.map(nodesText).join("");
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return nodesText(tree.props?.children);
}
test("UI open table suppresses double submission and uses a stable key after ambiguous network failure", async () => {
  const f = uiFixture();
  try {
    buttonWith(f.render(), "Mesa 4").props.onClick();
    let tree = f.render();
    const form = nodes(tree).find(node => node.type === "form");
    f.responses.push(new Error("Connection lost"));
    form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
    await f.settle();
    assert.equal(f.requests.filter(request => request.options?.method === "POST").length, 1);
    tree = f.render();
    nodes(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); await f.settle();
    const posts = f.requests.filter(request => request.options?.method === "POST").map(request => JSON.parse(request.options.body));
    assert.equal(posts.length, 2); assert.equal(posts[0].idempotencyKey, posts[1].idempotencyKey);
    assert.equal(posts[0].guests, 2); assert.equal(posts[0].tableId, id(6)); assert.equal(posts[0].operatorId, undefined);
  } finally { f.close(); }
});

test("opening dialog keeps the floor grid, cancels without commands and confirms the existing open payload", async () => {
  const f = uiFixture();
  const cards = tree => nodes(tree).filter(node => node.type === "button" && node.props.className?.includes("group overflow-hidden"));
  const modal = tree => nodes(tree).find(node => node.type === modalUi.PosModal);
  try {
    const initialCards = cards(f.render()).map(node => ({ key: node.key, className: node.props.className }));
    buttonWith(f.render(), "Mesa 4").props.onClick();
    let tree = f.render();
    assert.equal(modal(tree).props.title, "Abrir Mesa 4");
    assert.equal(modal(tree).props.size, "small");
    assert.equal(modal(tree).props.dismissible, true);
    assert.deepEqual(cards(tree).map(node => ({ key: node.key, className: node.props.className })), initialCards);
    buttonWith(tree, "Cancelar").props.onClick();
    assert.equal(modal(f.render()), undefined);
    assert.equal(f.requests.length, 0);

    buttonWith(f.render(), "Mesa 4").props.onClick();
    modal(f.render()).props.onClose();
    assert.equal(modal(f.render()), undefined);
    assert.equal(f.requests.length, 0);

    buttonWith(f.render(), "Mesa 4").props.onClick();
    tree = f.render();
    const fields = nodes(tree).filter(node => node.type === "input");
    fields.find(node => node.props.type === "number").props.onChange({ target: { value: "4" } });
    fields.find(node => node.props.maxLength === 120).props.onChange({ target: { value: "Cliente Demo" } });
    f.responses.push({ body: { result: { checkId: id(7) } } }, { body: { snapshot: { ...f.empty, checks: [{ id: id(7), table_id: id(6), status: "OPEN", guests: 4, opened_by: id(3), opened_at: new Date().toISOString(), version: 0 }] } } });
    nodes(f.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
    tree = f.render();
    assert.equal(modal(tree).props.dismissible, false);
    assert.equal(buttonWith(tree, "Cancelar").props.disabled, true);
    modal(tree).props.onClose();
    assert.ok(modal(f.render()), "pending command cannot dismiss the dialog");
    await f.settle();
    assert.equal(modal(f.render()), undefined);
    const posts = f.requests.filter(request => request.options?.method === "POST");
    assert.equal(posts.length, 1);
    const payload = JSON.parse(posts[0].options.body);
    assert.equal(payload.action, "open");
    assert.equal(payload.tableId, id(6));
    assert.equal(payload.guests, 4);
    assert.equal(payload.customerName, "Cliente Demo");
    assert.ok(payload.idempotencyKey);
  } finally { f.close(); }
});
test("UI unsaved item notes prevent sending, and drafts remain separate from earlier tickets", () => {
  const snapshot = {
    locations: [], location: { id: id(5), currency: "MXN" }, tables: [{ id: id(6), name: "Mesa 4" }],
    checks: [{ id: id(7), table_id: id(6), status: "OPEN", guests: 2, opened_by: id(3), opened_at: "2026-09-14T10:00:00Z", version: 5 }],
    tickets: [{ id: id(10), check_id: id(7), sequence: 1, status: "READY", sent_by: id(3), sent_at: "2026-09-14T10:00:00Z", served_at: "2026-09-14T10:20:00Z", served_by: id(12) }],
    items: [{ id: id(9), check_id: id(7), ticket_id: id(10), quantity: 2, product_name: "Cappuccino", unit_price: 50, line_total: 100, subtotal: 100, tax_amount: 0 }, { id: id(14), check_id: id(7), ticket_id: null, quantity: 1, product_name: "Cheesecake", version: 0, unit_price: 70, line_total: 70, subtotal: 70, tax_amount: 0 }],
    staff: [], products: [], cash_sessions: [],
  };
  const f = uiFixture({ snapshot, selected: id(7) });
  try {
    let tree = f.render();
    const editors = nodes(tree).filter(node => typeof node.type === "function" && node.type.name === "DraftItem");
    assert.equal(editors.length, 2); assert.ok(editors.every(editor => editor.props.item.product_name === "Cheesecake"));
    assert.equal(buttonWith(tree, "Enviar a cocina").props.disabled, false);
    editors[0].props.onDirty(true); tree = f.render();
    assert.equal(buttonWith(tree, "Enviar a cocina").props.disabled, true);
    assert.ok(nodesText(tree).includes("Envío 1"));
    assert.equal(buttonWith(tree, "Solicitar cobro").props.disabled, true);
  } finally { f.close(); }
});
test("UI renders no-data/loading/error recovery and role-specific operation areas", () => {
  for (const role of ["WAITER", "CASHIER", "KITCHEN", "ADMIN"]) {
    const f = uiFixture({ role });
    try {
      let tree = f.render();
      const nav = nodes(tree).find(node => node.type === "nav");
      assert.equal(nodes(nav).filter(node => node.type === "button").length, role === "ADMIN" ? 3 : 1);
      f.setSnapshot(null); tree = f.render();
      assert.ok(nodesText(tree).includes("Cargando mesas y comandas"));
      f.setSnapshot({ ...f.empty, tables: [] }); tree = f.render();
      assert.ok(nodesText(tree).includes(role === "KITCHEN" ? "Sin comandas pendientes" : role === "CASHIER" ? "Sin cuentas pendientes" : "Configura las mesas"));
    } finally { f.close(); }
  }
});
