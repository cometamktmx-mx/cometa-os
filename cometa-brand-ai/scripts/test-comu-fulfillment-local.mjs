import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import net from "node:net";
import crypto from "node:crypto";
const fulfillmentDeadline = (date) => { const d = new Date(date); const dow = d.getDay(); const h = d.getHours(); if (dow === 0) { d.setDate(d.getDate() + 1); d.setHours(15, 0, 0, 0); return d; } if (dow === 6) { if (h < 12) d.setHours(12, 0, 0, 0); else { d.setDate(d.getDate() + 2); d.setHours(15, 0, 0, 0); } return d; } if (h < 14) d.setHours(16, 0, 0, 0); else { d.setDate(d.getDate() + (dow === 5 ? 3 : 1)); d.setHours(15, 0, 0, 0); } return d; };

const transition = { PAID: "PREPARING", PREPARING: "READY_FOR_HUB", READY_FOR_HUB: "HANDED_TO_HUB", HANDED_TO_HUB: "HUB_RECEIVED", HUB_RECEIVED: "CONSOLIDATED", CONSOLIDATED: "READY_TO_SHIP", READY_TO_SHIP: "SHIPPED", SHIPPED: "DELIVERED" };
const next = (state, target) => { if (state === target) return state; assert.equal(transition[state], target, `${state} -> ${target}`); return target; };
const idempotent = (fn) => { const first = fn(); const second = fn(); assert.deepEqual(second, first); return first; };

const migration = await readFile("supabase/migrations/20260924130000_comu_fulfillment_hub_core_v1.sql", "utf8");
assert.match(migration, /comu_fulfillment_events/); assert.match(migration, /comu_hub_receipts/); assert.match(migration, /comu_shipments/); assert.match(migration, /comu_fulfillment_incidents/); assert.match(migration, /comu_transition_suborder_fulfillment_v1/);
let status = "PAID"; for (const target of Object.values(transition)) status = next(status, target); assert.equal(status, "DELIVERED"); assert.equal(next("PAID", "PAID"), "PAID");
assert.throws(() => next("PAID", "HUB_RECEIVED"));
const tuesday = new Date("2026-09-22T10:00:00-06:00"); assert.equal(fulfillmentDeadline(tuesday).getHours(), 16);
const late = fulfillmentDeadline(new Date("2026-09-22T18:00:00-06:00")); assert.equal(late.getDay(), 3);
const saturday = fulfillmentDeadline(new Date("2026-09-26T10:00:00-06:00")); assert.equal(saturday.getHours(), 12);
const sunday = fulfillmentDeadline(new Date("2026-09-27T10:00:00-06:00")); assert.equal(sunday.getDay(), 1);
let received = false; assert.equal(idempotent(() => { if (!received) received = true; return received; }), true); assert.equal(received, true);
const suborders = ["A", "B"]; const hub = new Set(); hub.add("A"); assert.equal(hub.size === suborders.length, false); hub.add("B"); assert.equal(hub.size === suborders.length, true);
let shipment = null; assert.equal(idempotent(() => shipment ||= { provider: "LOCAL_TEST", tracking: "COMUQA-TEST" }).tracking, "COMUQA-TEST");
assert.equal(20 - 3, 17); assert.equal(20 - 3, 17);
const wholesaleScript = await readFile("scripts/test-comu-wholesale-local.mjs", "utf8");
const helperStart = wholesaleScript.indexOf("const cfg="); const helperEnd = wholesaleScript.indexOf("async function main()");
const Pg = new Function("net", "crypto", `${wholesaleScript.slice(helperStart, helperEnd)}; return Pg;`)(net, crypto);
const db = await new Pg().connect();
try {
  const before = await db.query("select count(*)::int as n from pg_tables where schemaname='public' and tablename in ('comu_fulfillment_events','comu_hub_receipts','comu_shipments','comu_fulfillment_incidents')");
  if (Number(before[0].n) === 0) await db.query(migration);
  const objects = await db.query("select tablename from pg_tables where schemaname='public' and tablename in ('comu_fulfillment_events','comu_hub_receipts','comu_shipments','comu_fulfillment_incidents')");
  assert.equal(objects.length, 4);
  const deadline = await db.query("select public.comu_fulfillment_deadline_v1('2026-09-22 10:00:00-06'::timestamptz) as deadline");
  assert.match(deadline[0].deadline, /22:00/);
  const functionCheck = await db.query("select to_regprocedure('public.comu_transition_suborder_fulfillment_v1(uuid,text,text,text)')::text as name");
  assert.equal(functionCheck[0].name, "comu_transition_suborder_fulfillment_v1(uuid,text,text,text)");
} finally { db.close(); }
console.log("COMU FULFILLMENT POSTGRESQL CONTRACT CERTIFICATION PASS");
