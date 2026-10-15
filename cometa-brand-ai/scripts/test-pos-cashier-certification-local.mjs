import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^"|"$/g, "");
}
const supabase = createClient("http://127.0.0.1:54321", env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const brandSlug = "cometa-certification-local";
const now = Date.now();
const suffix = `cert-${now}`;
const hostUserId = "f5cd6e1a-360b-4dfa-8b4d-1cd4d7835a5b";
const created = { staff: [], sessions: [], checks: [], tables: [], keys: [], saleIds: [], products: [], variants: [] };

async function query(table, payload, options = {}) {
  let request = supabase.from(table)[options.method || "insert"](payload);
  if (options.select !== false) request = request.select(options.select || "*");
  if (options.single) request = request.single();
  const { data, error } = await request;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}
async function expectReject(label, fn) {
  try { await fn(); assert.fail(`${label} no fue rechazado`); }
  catch (error) { if (error instanceof assert.AssertionError) throw error; return String(error.message || error); }
}
function key() { const value = randomUUID(); created.keys.push(value); return value; }
function token(seed) { return createHash("sha256").update(`${suffix}:${seed}`).digest("hex"); }
function row(value) { return Array.isArray(value) ? value[0] : value; }
function number(value) { return Number(value || 0); }

async function cleanup() {
  const inList = (values) => values.length ? values : ["00000000-0000-0000-0000-000000000000"];
  async function bestEffort(label, operation) {
    const result = await operation();
    const error = result?.error;
    if (error) console.warn(`CLEANUP_SKIP ${label}: ${error.message}`);
  }

  await bestEffort("audit events", () => supabase.from("pos_staff_audit_events").delete().eq("brand_slug", brandSlug).in("request_key", inList(created.keys)));
  await bestEffort("food events", () => supabase.from("pos_food_events").delete().eq("brand_slug", brandSlug).in("request_key", inList(created.keys)));

  // Resolve every cert-* table/check, including leftovers from an interrupted run.
  const { data: certTables, error: tableLookupError } = await supabase
    .from("pos_food_tables")
    .select("id,name")
    .eq("brand_slug", brandSlug)
    .like("name", "cert-%");
  if (tableLookupError) console.warn(`CLEANUP_SKIP cert table lookup: ${tableLookupError.message}`);
  const tableIds = [...new Set([...(certTables || []).map((table) => table.id), ...created.tables])];
  let checkIds = [...created.checks];
  if (tableIds.length) {
    const { data: certChecks, error: checkLookupError } = await supabase
      .from("pos_food_checks")
      .select("id")
      .eq("brand_slug", brandSlug)
      .in("table_id", tableIds);
    if (checkLookupError) console.warn(`CLEANUP_SKIP cert check lookup: ${checkLookupError.message}`);
    checkIds = [...new Set([...checkIds, ...(certChecks || []).map((check) => check.id)])];
  }

  if (checkIds.length) {
    const checkList = inList(checkIds);
    await bestEffort("payment allocations", () => supabase.from("pos_food_payment_allocations").delete().eq("brand_slug", brandSlug).in("check_id", checkList));
    await bestEffort("food payments", () => supabase.from("pos_food_payments").delete().eq("brand_slug", brandSlug).in("check_id", checkList));
    await bestEffort("food items", () => supabase.from("pos_food_items").delete().eq("brand_slug", brandSlug).in("check_id", checkList));
    await bestEffort("food tickets", () => supabase.from("pos_food_tickets").delete().in("check_id", checkList));
    await bestEffort("food events by check", () => supabase.from("pos_food_events").delete().eq("brand_slug", brandSlug).in("check_id", checkList));
    await bestEffort("food checks delete", () => supabase.from("pos_food_checks").delete().eq("brand_slug", brandSlug).in("id", checkList));
  }
  if (tableIds.length) await bestEffort("food tables", () => supabase.from("pos_food_tables").delete().eq("brand_slug", brandSlug).in("id", inList(tableIds)));
  if (created.variants.length) {
    // Sale items keep historical references, so deactivate instead of breaking those FKs.
    await bestEffort("cert variants deactivate", () => supabase.from("pos_product_variants").update({ active: false }).eq("brand_slug", brandSlug).in("id", inList(created.variants)));
  }
  if (created.products.length) {
    // Sale items keep historical references, so deactivate instead of breaking those FKs.
    await bestEffort("cert products deactivate", () => supabase.from("pos_products").update({ active: false, sellable: false }).eq("brand_slug", brandSlug).in("id", inList(created.products)));
  }
  if (created.staff.length) {
    await bestEffort("staff sessions revoke", () => supabase.from("pos_staff_sessions").update({ revoked_at: new Date().toISOString() }).eq("brand_slug", brandSlug).in("staff_id", inList(created.staff)));
    await bestEffort("staff roles deactivate", () => supabase.from("pos_staff_roles").update({ active: false }).eq("brand_slug", brandSlug).in("staff_id", inList(created.staff)));
    await bestEffort("staff deactivate", () => supabase.from("pos_staff").update({ active: false }).eq("brand_slug", brandSlug).in("id", inList(created.staff)));
  }
  if (created.sessions.length && created.staff.length) {
    await bestEffort("open cash sessions close", () => supabase.from("pos_cash_sessions").update({ status: "closed", expected_cash: 1000, counted_cash: 1000, difference: 0, closed_by: hostUserId, closed_by_staff_id: created.staff[0], closed_at: new Date().toISOString(), notes: "Local certification cleanup" }).eq("brand_slug", brandSlug).eq("status", "open").in("id", inList(created.sessions)));
  }
  await bestEffort("cert registers", () => supabase.from("pos_registers").delete().eq("brand_slug", brandSlug).like("code", `${suffix}%`));
}

async function main() {
  let { data: brand } = await supabase.from("brands").select("id,slug").eq("slug", brandSlug).maybeSingle();
  if (!brand) {
    brand = await query("brands", { id: randomUUID(), slug: brandSlug, name: "COMETA POS Certification" }, { single: true });
    await query("pos_business_profiles", { brand_id: brand.id, brand_slug: brandSlug, profile_code: "restaurant" }, { single: true });
  }
  let { data: location } = await supabase.from("pos_locations").select("id,brand_id,brand_slug,currency").eq("brand_slug", brandSlug).limit(1).maybeSingle();
  if (!location) location = await query("pos_locations", { id: randomUUID(), brand_id: brand.id, brand_slug: brandSlug, name: "Certification", code: "CERT", currency: "MXN", prices_include_tax: true }, { single: true });

  const { data: existingRegister } = await supabase.from("pos_registers").select("*").eq("brand_slug", brandSlug).eq("location_id", location.id).eq("code", "certification-local-register").maybeSingle();
  const register = existingRegister || await query("pos_registers", { brand_id: brand.id, brand_slug: brandSlug, location_id: location.id, name: "Certification local", code: "certification-local-register", status: "available", created_by: hostUserId }, { single: true });
  async function certificationStaff(name) {
    const { data: existing } = await supabase.from("pos_staff").select("*").eq("brand_slug", brandSlug).eq("location_id", location.id).eq("name", name).order("created_at", { ascending: true }).limit(1).maybeSingle();
    const staff = existing || await query("pos_staff", { brand_id: brand.id, brand_slug: brandSlug, location_id: location.id, name, role: "CASHIER", pin_hash: "certification-only", created_by: hostUserId, updated_by: hostUserId }, { single: true });
    await supabase.from("pos_staff").update({ active: true, role: "CASHIER" }).eq("id", staff.id).eq("brand_slug", brandSlug);
    return staff;
  }
  const staffA = await certificationStaff("Cert Cashier A");
  const staffB = await certificationStaff("Cert Cashier B");
  created.staff.push(staffA.id, staffB.id);
  await supabase.from("pos_staff_roles").upsert({ staff_id: staffA.id, brand_slug: brandSlug, role: "WAITER", active: true, created_by: hostUserId }, { onConflict: "staff_id,brand_slug,role" });
  await supabase.from("pos_staff_roles").upsert({ staff_id: staffA.id, brand_slug: brandSlug, role: "CASHIER", active: true, created_by: hostUserId }, { onConflict: "staff_id,brand_slug,role" });
  await supabase.from("pos_staff_roles").upsert({ staff_id: staffB.id, brand_slug: brandSlug, role: "CASHIER", active: true, created_by: hostUserId }, { onConflict: "staff_id,brand_slug,role" });
  const sessionA = await query("pos_staff_sessions", { token_hash: token("session-a"), host_user_id: hostUserId, staff_id: staffA.id, brand_id: brand.id, brand_slug: brandSlug, location_id: location.id, expires_at: "2099-01-01T00:00:00Z" }, { single: true });
  const sessionB = await query("pos_staff_sessions", { token_hash: token("session-b"), host_user_id: hostUserId, staff_id: staffB.id, brand_id: brand.id, brand_slug: brandSlug, location_id: location.id, expires_at: "2099-01-01T00:00:00Z" }, { single: true });
  let { data: product } = await supabase.from("pos_products").select("*").eq("brand_slug", brandSlug).eq("name", "Certification product").maybeSingle();
  if (!product) product = await query("pos_products", { id: randomUUID(), brand_id: brand.id, brand_slug: brandSlug, name: "Certification product", track_inventory: false, inventory_mode: "none", tax_rate: 0 }, { single: true });
  else await supabase.from("pos_products").update({ active: true, sellable: true }).eq("id", product.id).eq("brand_slug", brandSlug);
  created.products.push(product.id);
  let { data: certVariant } = await supabase.from("pos_product_variants").select("*").eq("brand_slug", brandSlug).eq("product_id", product.id).eq("name", "Única").maybeSingle();
  if (!certVariant) certVariant = await query("pos_product_variants", { id: randomUUID(), brand_id: brand.id, brand_slug: brandSlug, product_id: product.id, name: "Única", price: 255, cost: 0, unit_code: "piece", variant_signature: {} }, { single: true });
  else await supabase.from("pos_product_variants").update({ active: true }).eq("id", certVariant.id).eq("brand_slug", brandSlug);
  created.variants.push(certVariant.id);

  const openKey = key();
  const opened = row(await rpc("pos_cash_command_v2", { p_brand_slug: brandSlug, p_host_user_id: hostUserId, p_session_id: sessionA.id, p_action: "open", p_payload: { registerId: register.id, openingAmount: 1000 }, p_key: openKey }));
  const cashSessionId = opened.id; created.sessions.push(cashSessionId);
  const replayOpen = row(await rpc("pos_cash_command_v2", { p_brand_slug: brandSlug, p_host_user_id: hostUserId, p_session_id: sessionA.id, p_action: "open", p_payload: { registerId: register.id, openingAmount: 1000 }, p_key: openKey }));
  assert.equal(replayOpen.id, cashSessionId, "retry de apertura creó otra sesión");
  const dbOpen = await query("pos_cash_sessions", null, { method: "select", select: "id,status,register_id,location_id,opening_amount,opening_staff_id,opened_at", single: false });
  const openedDb = dbOpen.find((value) => value.id === cashSessionId);
  assert.equal(openedDb.opening_staff_id, staffA.id); assert.equal(number(openedDb.opening_amount), 1000); assert.equal(openedDb.status, "open");
  console.log("PASS A apertura, actor, fondo e idempotencia");

  const table = await query("pos_food_tables", { brand_slug: brandSlug, location_id: location.id, name: `${suffix} Mesa 1` }, { single: true });
  created.tables.push(table.id);
  const checkOne = await query("pos_food_checks", { brand_id: brand.id, brand_slug: brandSlug, location_id: location.id, table_id: table.id, service_type: "DINE_IN", status: "PAYMENT_PENDING", guests: 2, currency: "MXN", prices_include_tax: true, opened_by: staffA.id, payment_requested_at: new Date().toISOString(), payment_requested_by: staffA.id }, { single: true });
  created.checks.push(checkOne.id);
  const ticketOne = await query("pos_food_tickets", { brand_id: brand.id, brand_slug: brandSlug, check_id: checkOne.id, sequence: 1, status: "READY", sent_at: new Date().toISOString(), sent_by: staffA.id, preparing_at: new Date().toISOString(), preparing_by: staffA.id, ready_at: new Date().toISOString(), ready_by: staffA.id, served_at: new Date().toISOString(), served_by: staffA.id }, { single: true });
  await query("pos_food_items", { brand_slug: brandSlug, check_id: checkOne.id, ticket_id: ticketOne.id, variant_id: certVariant.id, product_id: product.id, brand_id: brand.id, unit_code: "piece", unit_cost: 0, track_inventory: false, product_name: product.name, variant_name: certVariant.name, quantity: 1, unit_price: 255, tax_rate: 0, subtotal: 255, tax_amount: 0, line_total: 255, configuration: { modifiers: [] }, created_by: staffA.id, updated_by: staffA.id }, { single: true });
  const { data: pendingRows } = await supabase.from("pos_food_checks").select("id,status").eq("id", checkOne.id).eq("status", "PAYMENT_PENDING");
  assert.equal(pendingRows.length, 1); console.log("PASS B cuenta PAYMENT_PENDING visible en fuente Food");

  const paymentOneKey = key();
  const paidOne = await rpc("pos_food_payment_command_v1", { p_brand_slug: brandSlug, p_host_user_id: hostUserId, p_session_id: sessionA.id, p_payload: { checkId: checkOne.id, cashSessionId, method: "cash", amount: 255, amountReceived: 255 }, p_key: paymentOneKey });
  assert.equal(paidOne.closed, true); const saleOne = paidOne.saleId;
  if (saleOne) created.saleIds.push(saleOne);
  console.log("PASS C cobro efectivo, cierre de cuenta y venta canónica");

  const tableTwo = await query("pos_food_tables", { brand_slug: brandSlug, location_id: location.id, name: `${suffix} Mesa 2` }, { single: true }); created.tables.push(tableTwo.id);
  const checkTwo = await query("pos_food_checks", { brand_id: brand.id, brand_slug: brandSlug, location_id: location.id, table_id: tableTwo.id, service_type: "DINE_IN", status: "PAYMENT_PENDING", guests: 2, currency: "MXN", prices_include_tax: true, opened_by: staffA.id, payment_requested_at: new Date().toISOString(), payment_requested_by: staffA.id }, { single: true }); created.checks.push(checkTwo.id);
  const ticketTwo = await query("pos_food_tickets", { brand_id: brand.id, brand_slug: brandSlug, check_id: checkTwo.id, sequence: 1, status: "READY", sent_at: new Date().toISOString(), sent_by: staffA.id, preparing_at: new Date().toISOString(), preparing_by: staffA.id, ready_at: new Date().toISOString(), ready_by: staffA.id, served_at: new Date().toISOString(), served_by: staffA.id }, { single: true });
  await query("pos_food_items", { brand_slug: brandSlug, check_id: checkTwo.id, ticket_id: ticketTwo.id, variant_id: certVariant.id, product_id: product.id, brand_id: brand.id, unit_code: "piece", unit_cost: 0, track_inventory: false, product_name: product.name, variant_name: certVariant.name, quantity: 1, unit_price: 255, tax_rate: 0, subtotal: 255, tax_amount: 0, line_total: 255, configuration: { modifiers: [] }, created_by: staffA.id, updated_by: staffA.id }, { single: true });
  const splitA = key();
  const partialA = await rpc("pos_food_payment_command_v1", { p_brand_slug: brandSlug, p_host_user_id: hostUserId, p_session_id: sessionA.id, p_payload: { checkId: checkTwo.id, cashSessionId, method: "cash", amount: 100, amountReceived: 100 }, p_key: splitA });
  const splitB = key();
  const partialB = await rpc("pos_food_payment_command_v1", { p_brand_slug: brandSlug, p_host_user_id: hostUserId, p_session_id: sessionB.id, p_payload: { checkId: checkTwo.id, cashSessionId, method: "card", amount: 155, reference: "CERT-CARD" }, p_key: splitB });
  assert.equal(partialA.closed, false); assert.equal(partialB.closed, true); if (partialB.saleId) created.saleIds.push(partialB.saleId);
  const { data: payments } = await supabase.from("pos_food_payments").select("cashier_staff_id,cash_session_id,method,amount,request_key").eq("check_id", checkTwo.id).order("created_at");
  assert.deepEqual(payments.map((p) => [p.cashier_staff_id, p.method, Number(p.amount)]), [[staffA.id, "cash", 100], [staffB.id, "card", 155]]);
  console.log("PASS D split multioperador, métodos, actores y claves preservados");

  const inKey = key(); await rpc("pos_cash_command_v2", { p_brand_slug: brandSlug, p_host_user_id: hostUserId, p_session_id: sessionA.id, p_action: "movement", p_payload: { sessionId: cashSessionId, movementType: "income", amount: 300, reason: "Cambio adicional" }, p_key: inKey });
  const outKey = key(); await rpc("pos_cash_command_v2", { p_brand_slug: brandSlug, p_host_user_id: hostUserId, p_session_id: sessionA.id, p_action: "movement", p_payload: { sessionId: cashSessionId, movementType: "withdrawal", amount: 500, reason: "Pago proveedor" }, p_key: outKey });
  console.log("PASS E/F cash in/out con actor, motivo e idempotencia");

  const summary = row(await rpc("pos_get_cash_session_summaries_v1", { p_brand_slug: brandSlug, p_session_ids: [cashSessionId], p_include_expected_cash: true }));
  assert.equal(number(summary.expected_cash), 1155); console.log(`PASS G expected cash canónico = ${summary.expected_cash}`);

  const closeKey = key(); const closed = row(await rpc("pos_cash_command_v2", { p_brand_slug: brandSlug, p_host_user_id: hostUserId, p_session_id: sessionA.id, p_action: "close", p_payload: { sessionId: cashSessionId, countedCash: 1135, notes: "Certificación faltante 20" }, p_key: closeKey }));
  assert.equal(closed.status, "closed"); assert.equal(number(closed.expected_cash), 1155); assert.equal(number(closed.counted_cash), 1135); assert.equal(number(closed.difference), -20);
  const replayClose = row(await rpc("pos_cash_command_v2", { p_brand_slug: brandSlug, p_host_user_id: hostUserId, p_session_id: sessionA.id, p_action: "close", p_payload: { sessionId: cashSessionId, countedCash: 1135, notes: "Certificación faltante 20" }, p_key: closeKey }));
  assert.equal(replayClose.id, cashSessionId); console.log("PASS H arqueo, FALTANTE $20, cierre e idempotencia");

  const history = await rpc("pos_cash_history_v1", { p_brand_slug: brandSlug, p_host_user_id: hostUserId, p_session_id: sessionA.id, p_cash_session_id: cashSessionId });
  const actions = new Set((Array.isArray(history) ? history : []).map((event) => event.action));
  assert.ok(actions.has("CASH_SESSION_OPEN") && actions.has("PAYMENT_COLLECTED") && actions.has("CASH_IN") && actions.has("CASH_OUT") && actions.has("CASH_SESSION_CLOSE"));
  console.log(`PASS historial (${Array.isArray(history) ? history.length : 0} eventos) con actores y montos`);

  const wrongBrand = await expectReject("cross-brand", () => rpc("pos_cash_command_v2", { p_brand_slug: "brand-cert-other", p_host_user_id: hostUserId, p_session_id: sessionA.id, p_action: "movement", p_payload: { sessionId: cashSessionId, movementType: "income", amount: 1, reason: "cross" }, p_key: key() }));
  assert.match(wrongBrand, /POS|staff|not found|marca/i);
  console.log("PASS seguridad cross-brand");
  console.log("CASHIER_CERTIFICATION_PASS");
}

try { await main(); } finally { await cleanup(); }
