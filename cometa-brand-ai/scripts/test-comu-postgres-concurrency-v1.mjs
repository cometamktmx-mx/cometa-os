import net from "node:net";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const cfg = { host: process.env.COMU_PG_HOST || "127.0.0.1", port: Number(process.env.COMU_PG_PORT || 54322), user: process.env.COMU_PG_USER || "postgres", password: process.env.COMU_PG_PASSWORD || "postgres", database: process.env.COMU_PG_DATABASE || "postgres" };
const z = String.fromCharCode(0);
function packet(type, body) { const b = Buffer.isBuffer(body) ? body : Buffer.from(body); const out = Buffer.alloc(5 + b.length); out[0] = type.charCodeAt(0); out.writeInt32BE(4 + b.length, 1); b.copy(out, 5); return out; }
function startup() { const p = Buffer.from(`user${z}${cfg.user}${z}database${z}${cfg.database}${z}${z}`); const b = Buffer.alloc(4 + p.length); b.writeInt32BE(196608, 0); p.copy(b, 4); const out = Buffer.alloc(4 + b.length); out.writeInt32BE(out.length); b.copy(out, 4); return out; }

class PgWire {
  constructor() { this.socket = null; this.buffer = Buffer.alloc(0); this.waiters = []; this.messages = []; }
  async connect() {
    this.socket = net.createConnection({ host: cfg.host, port: cfg.port });
    this.socket.on("data", (chunk) => { this.buffer = Buffer.concat([this.buffer, chunk]); this.drain(); });
    await new Promise((resolve, reject) => { this.socket.once("connect", resolve); this.socket.once("error", reject); });
    this.socket.write(startup());
    let nonce; let firstBare; let expectedSignature;
    while (true) {
      const m = await this.next();
      if (m.type === "R") {
        const code = m.body.readInt32BE(0);
        if (code === 10) {
          nonce = crypto.randomBytes(18).toString("base64"); firstBare = `n=,r=${nonce}`; const initial = `n,,${firstBare}`; const mech = Buffer.from(`SCRAM-SHA-256${z}`); const first = Buffer.from(initial); const body = Buffer.alloc(mech.length + 4 + first.length); mech.copy(body); body.writeInt32BE(first.length, mech.length); first.copy(body, mech.length + 4); this.socket.write(packet("p", body));
        } else if (code === 11) {
          const serverFirst = m.body.subarray(4).toString(); const values = Object.fromEntries(serverFirst.split(",").map((part) => [part[0], part.slice(2)])); const salt = Buffer.from(values.s, "base64"); const salted = crypto.pbkdf2Sync(cfg.password, salt, Number(values.i), 32, "sha256"); const clientKey = crypto.createHmac("sha256", salted).update("Client Key").digest(); const storedKey = crypto.createHash("sha256").update(clientKey).digest(); const finalBare = `c=biws,r=${values.r}`; const authMessage = `${firstBare},${serverFirst},${finalBare}`; const proofKey = crypto.createHmac("sha256", storedKey).update(authMessage).digest(); const proof = Buffer.alloc(clientKey.length); for (let i = 0; i < proof.length; i++) proof[i] = clientKey[i] ^ proofKey[i]; expectedSignature = crypto.createHmac("sha256", salted).update("Server Key").digest("base64"); const final = `${finalBare},p=${proof.toString("base64")}`; this.socket.write(packet("p", Buffer.from(final)));
        } else if (code === 12) {
          const final = m.body.subarray(4).toString(); if (!final.includes(`v=${expectedSignature}`)) console.warn("SCRAM server signature differed; continuing to let PostgreSQL report authentication status.");
        } else if (code === 0) { while ((await this.next()).type !== "Z") {} break; }
      } else if (m.type === "E") throw new Error(`PostgreSQL startup error: ${m.body.toString()}`);
    }
    return this;
  }
  drain() { while (this.buffer.length >= 5) { const len = this.buffer.readInt32BE(1); if (this.buffer.length < len + 1) return; const type = String.fromCharCode(this.buffer[0]); const body = this.buffer.subarray(5, len + 1); this.buffer = this.buffer.subarray(len + 1); const message = { type, body }; const waiter = this.waiters.shift(); if (waiter) waiter(message); else this.messages.push(message); } }
  next() { if (this.messages.length) return Promise.resolve(this.messages.shift()); return new Promise((resolve) => this.waiters.push(resolve)); }
  async query(sql) { this.socket.write(Buffer.concat([Buffer.from("Q"), (() => { const b = Buffer.from(`${sql}${z}`); const l = Buffer.alloc(4); l.writeInt32BE(4 + b.length); return Buffer.concat([l, b]); })()])); const rows = []; let fields = []; while (true) { const m = await this.next(); if (m.type === "T") { const count = m.body.readInt16BE(0); let o = 2; fields = []; for (let i = 0; i < count; i++) { const end = m.body.indexOf(0, o); fields.push(m.body.subarray(o, end).toString()); o = end + 19; } } else if (m.type === "D") { const count = m.body.readInt16BE(0); let o = 2; const row = []; for (let i = 0; i < count; i++) { const n = m.body.readInt32BE(o); o += 4; row.push(n < 0 ? null : m.body.subarray(o, o + n).toString()); o += Math.max(n, 0); } rows.push(Object.fromEntries(fields.map((f, i) => [f, row[i]]))); } else if (m.type === "E") throw new Error(`PostgreSQL query error: ${m.body.toString()}`); else if (m.type === "Z") break; } return rows; }
  async close() { this.socket?.end(); }
}

const sqlQuote = (value) => value === null || value === undefined ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const id = () => crypto.randomUUID();
async function certify(db) {
  const pass = (name, detail = "") => console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
  const fail = (name, error) => { throw new Error(`FAIL ${name}: ${error instanceof Error ? error.message : error}`); };
  const one = async (sql) => (await db.query(sql))[0];
  const q = (sql) => db.query(sql);
  const brand = await one("select id,slug from public.brands where slug='mood-cafe-test'");
  const location = await one(`select id from public.pos_locations where brand_slug=${sqlQuote(brand.slug)} order by created_at limit 1`);
  const variants = await q(`select v.id,v.product_id,v.name,v.sku,v.price,p.name product_name from public.pos_product_variants v join public.pos_products p on p.id=v.product_id where v.brand_slug=${sqlQuote(brand.slug)} and v.active=true order by v.created_at limit 3`);
  if (!brand || !location || variants.length < 3) throw new Error("Certification fixture needs mood-cafe-test plus 3 active variants");
  const previousInventory = await q(`select variant_id,quantity,reserved_quantity,minimum_quantity from public.pos_inventory where location_id=${sqlQuote(location.id)} and variant_id in (${variants.map((v) => sqlQuote(v.id)).join(",")})`);
  const originalProduct = await one(`select name from public.pos_products where id=${sqlQuote(variants[0].product_id)}`);
  const originalVariant = await one(`select price from public.pos_product_variants where id=${sqlQuote(variants[0].id)}`);
  const sellerIds = [id(), id(), id()]; const storefrontIds = sellerIds.map(() => id()); const listingIds = sellerIds.map(() => id()); const variantListingIds = sellerIds.map(() => id());
  const buyerA = id(), buyerB = id(), buyerC = id();
  const userA = id(), userB = id(), userC = id();
  const createdOrders = [];
  try {
    for (let i = 0; i < 3; i++) {
      await q(`insert into public.comu_sellers(id,brand_id,brand_slug,public_name,slug,status,verification_status,verified_at,activated_at) values(${sqlQuote(sellerIds[i])},${sqlQuote(brand.id)},${sqlQuote(brand.slug)},${sqlQuote(`COMU Cert Seller ${i + 1}`)},${sqlQuote(`comu-cert-concurrency-${i + 1}`)},'ACTIVE','VERIFIED',now(),now())`);
      await q(`insert into public.comu_storefronts(id,seller_id,name,slug,status) values(${sqlQuote(storefrontIds[i])},${sqlQuote(sellerIds[i])},${sqlQuote(`Certification Store ${i + 1}`)},${sqlQuote(`comu-cert-store-${i + 1}`)},'PUBLISHED')`);
      await q(`insert into public.comu_product_listings(id,seller_id,storefront_id,product_id,public_slug,status) values(${sqlQuote(listingIds[i])},${sqlQuote(sellerIds[i])},${sqlQuote(storefrontIds[i])},${sqlQuote(variants[i].product_id)},${sqlQuote(`comu-cert-product-${i + 1}`)},'PUBLISHED')`);
      await q(`insert into public.comu_variant_listings(id,listing_id,variant_id,enabled) values(${sqlQuote(variantListingIds[i])},${sqlQuote(listingIds[i])},${sqlQuote(variants[i].id)},true)`);
      await q(`insert into public.comu_seller_memberships(seller_id,user_id,role) values(${sqlQuote(sellerIds[i])},${sqlQuote([userA,userB,userC][i])},'OWNER')`);
      await q(`insert into public.comu_buyers(id,user_id,display_name) values(${sqlQuote([buyerA,buyerB,buyerC][i])},${sqlQuote([userA,userB,userC][i])},${sqlQuote(`Cert Buyer ${i + 1}`)})`);
      await q(`insert into public.pos_inventory(brand_id,brand_slug,location_id,variant_id,quantity,reserved_quantity,minimum_quantity) values(${sqlQuote(brand.id)},${sqlQuote(brand.slug)},${sqlQuote(location.id)},${sqlQuote(variants[i].id)},1,0,0) on conflict (location_id,variant_id) do update set quantity=1,reserved_quantity=0,minimum_quantity=0,updated_at=now()`);
    }
    const item = (i, qty = 1) => JSON.stringify([{ seller_id: sellerIds[i], listing_id: listingIds[i], variant_listing_id: variantListingIds[i], variant_id: variants[i].id, location_id: location.id, quantity: qty }]).replaceAll("'", "''");
    const reserve = (buyer, key, i = 0, qty = 1) => q(`select * from public.comu_reserve_inventory(${sqlQuote(buyer)},${sqlQuote(`cert-session-${key}`)},${sqlQuote(key)},${sqlQuote(item(i, qty))}::jsonb)`);
    const inventory = async (i) => one(`select quantity,reserved_quantity from public.pos_inventory where variant_id=${sqlQuote(variants[i].id)} and location_id=${sqlQuote(location.id)}`);

    const raceA = new PgWire(); const raceB = new PgWire(); await Promise.all([raceA.connect(), raceB.connect()]);
    const keyA = `cert-race-a-${id()}`, keyB = `cert-race-b-${id()}`;
    const race = await Promise.allSettled([raceA.query(`select * from public.comu_reserve_inventory(${sqlQuote(buyerA)},'cert-race-a',${sqlQuote(keyA)},${sqlQuote(item(0))}::jsonb)`), raceB.query(`select * from public.comu_reserve_inventory(${sqlQuote(buyerB)},'cert-race-b',${sqlQuote(keyB)},${sqlQuote(item(0))}::jsonb)`) ]);
    const wins = race.filter((r) => r.status === "fulfilled").length; const insufficient = race.filter((r) => r.status === "rejected" && String(r.reason.message).includes("COMU_INSUFFICIENT_STOCK")).length;
    if (wins !== 1 || insufficient !== 1) fail("concurrency stock=1", JSON.stringify(race));
    const afterRace = await inventory(0); if (Number(afterRace.reserved_quantity) !== 1 || Number(afterRace.reserved_quantity) > Number(afterRace.quantity)) fail("reserved quantity invariant", JSON.stringify(afterRace)); pass("concurrency stock=1", "one ACTIVE, one COMU_INSUFFICIENT_STOCK"); pass("reserved_quantity <= quantity", `${afterRace.reserved_quantity} <= ${afterRace.quantity}`); await Promise.all([raceA.close(), raceB.close()]);
    const winner = (await q(`select id,idempotency_key from public.comu_inventory_reservations where idempotency_key=${sqlQuote(keyA)}`))[0] || (await q(`select id,idempotency_key from public.comu_inventory_reservations where idempotency_key=${sqlQuote(keyB)}`))[0];
    const winnerBuyer = winner.idempotency_key === keyA ? buyerA : buyerB;
    const retry = await q(`select * from public.comu_reserve_inventory(${sqlQuote(winnerBuyer)},'cert-retry',${sqlQuote(winner.idempotency_key)},${sqlQuote(item(0))}::jsonb)`); if (!retry[0] || retry[0].id !== winner.id) fail("reservation idempotency", "different reservation returned"); pass("reservation idempotency", "same key returned one reservation");
    await q(`update public.comu_inventory_reservations set expires_at=now()-interval '1 second' where id=${sqlQuote(winner.id)}`); await q("select public.comu_expire_inventory_reservations()"); const expired = await one(`select status from public.comu_inventory_reservations where id=${sqlQuote(winner.id)}`); const afterExpiry = await inventory(0); if (expired.status !== "EXPIRED" || Number(afterExpiry.reserved_quantity) !== 0) fail("expiration", JSON.stringify({ expired, afterExpiry })); await q("select public.comu_expire_inventory_reservations()"); if (Number((await inventory(0)).reserved_quantity) !== 0) fail("expiration idempotency", "reserved quantity changed twice"); pass("expiration/release", "expired once and released exactly once");

    const releaseKey = `cert-release-${id()}`; const releasedRes = (await reserve(buyerA, releaseKey, 0))[0]; await q(`select * from public.comu_release_inventory_reservation(${sqlQuote(releasedRes.id)},'RELEASED')`); await q(`select * from public.comu_release_inventory_reservation(${sqlQuote(releasedRes.id)},'RELEASED')`); const released = await one(`select status from public.comu_inventory_reservations where id=${sqlQuote(releasedRes.id)}`); if (released.status !== "RELEASED" || Number((await inventory(0)).reserved_quantity) !== 0) fail("release idempotency", JSON.stringify(released)); pass("release/cancel idempotency");
    const orderReserveKey = `cert-order-${id()}`; const orderRes = (await reserve(buyerA, orderReserveKey, 0))[0]; const orderKey = `cert-order-create-${id()}`; const orderRows = await q(`select * from public.comu_create_order_from_reservation(${sqlQuote(orderRes.id)},${sqlQuote(orderKey)},'{}'::jsonb,'MXN')`); const orderAgain = await q(`select * from public.comu_create_order_from_reservation(${sqlQuote(orderRes.id)},${sqlQuote(orderKey)},'{}'::jsonb,'MXN')`); if (orderRows[0].id !== orderAgain[0].id) fail("order idempotency", "duplicate order"); createdOrders.push(orderRows[0].id); const committed = await one(`select status from public.comu_inventory_reservations where id=${sqlQuote(orderRes.id)}`); if (committed.status !== "COMMITTED") fail("order commit", committed.status); pass("order commit/idempotency", "PAYMENT_PENDING + COMMITTED, one order");
    const snapBefore = await one(`select snapshot from public.comu_order_item_snapshots where order_item_id in (select id from public.comu_order_items where order_id=${sqlQuote(orderRows[0].id)})`); await q(`update public.pos_products set name='CERT MUTATED PRODUCT' where id=${sqlQuote(variants[0].product_id)}`); await q(`update public.pos_product_variants set price=9999 where id=${sqlQuote(variants[0].id)}`); const snapAfter = await one(`select snapshot from public.comu_order_item_snapshots where order_item_id in (select id from public.comu_order_items where order_id=${sqlQuote(orderRows[0].id)})`); if (snapBefore.snapshot !== snapAfter.snapshot) fail("snapshot immutability", "snapshot changed"); pass("snapshot immutability"); const cancelledOrder = await q(`select * from public.comu_cancel_order(${sqlQuote(orderRows[0].id)})`); await q(`select * from public.comu_cancel_order(${sqlQuote(orderRows[0].id)})`); if (cancelledOrder[0].status !== "CANCELLED" || Number((await inventory(0)).reserved_quantity) !== 0) fail("cancel idempotency", cancelledOrder[0]); pass("cancel idempotency", "order and reservation released once");
    const multiKey = `cert-multi-${id()}`; const multiRes = (await reserve(buyerB, multiKey, 0))[0]; await q(`insert into public.comu_inventory_reservation_items(reservation_id,seller_id,listing_id,variant_listing_id,variant_id,location_id,quantity) values(${sqlQuote(multiRes.id)},${sqlQuote(sellerIds[1])},${sqlQuote(listingIds[1])},${sqlQuote(variantListingIds[1])},${sqlQuote(variants[1].id)},${sqlQuote(location.id)},1),(${sqlQuote(multiRes.id)},${sqlQuote(sellerIds[2])},${sqlQuote(listingIds[2])},${sqlQuote(variantListingIds[2])},${sqlQuote(variants[2].id)},${sqlQuote(location.id)},1)`);
    await q(`update public.pos_inventory set reserved_quantity=reserved_quantity+1 where variant_id in (${sqlQuote(variants[1].id)},${sqlQuote(variants[2].id)}) and location_id=${sqlQuote(location.id)}`); const multiOrderKey = `cert-multi-order-${id()}`; const multiOrder = (await q(`select * from public.comu_create_order_from_reservation(${sqlQuote(multiRes.id)},${sqlQuote(multiOrderKey)},'{}'::jsonb,'MXN')`))[0]; createdOrders.push(multiOrder.id); const subCount = await one(`select count(*)::text count from public.comu_order_suborders where order_id=${sqlQuote(multiOrder.id)}`); if (subCount.count !== "3") fail("multi-seller order", subCount.count); pass("multi-seller order", "one master, three suborders");
    const events = await q(`select event_type from public.comu_order_events where order_id=${sqlQuote(multiOrder.id)} or payload->>'reservationId'=${sqlQuote(multiRes.id)} order by created_at`); for (const event of ["RESERVATION_CREATED", "ORDER_CREATED", "RESERVATION_COMMITTED"]) if (!events.some((e) => e.event_type === event)) fail("event integrity", event); pass("event integrity", "reservation/order lifecycle events present");
    await q(`update public.comu_inventory_reservations set expires_at=now()-interval '1 second' where id=${sqlQuote(multiRes.id)}`); await q("select public.comu_expire_inventory_reservations()"); const expiredOrder = await one(`select status from public.comu_orders where id=${sqlQuote(multiOrder.id)}`); if (expiredOrder.status !== "EXPIRED") fail("PAYMENT_PENDING timeout", expiredOrder.status); pass("PAYMENT_PENDING timeout", "same reservation TTL expires order and releases stock");
    const rlsCount = async (role, claim, statement) => { await q("begin"); await q(`set local role ${role}`); if (claim) await q(`select set_config('request.jwt.claim.sub',${sqlQuote(claim)},true)`); const result = await one(statement); await q("rollback"); return Number(result.count); };
    const buyerAVisible = await rlsCount("authenticated", userA, `select count(*)::text count from public.comu_orders where id=${sqlQuote(multiOrder.id)}`);
    const buyerBVisible = await rlsCount("authenticated", userB, `select count(*)::text count from public.comu_orders where id=${sqlQuote(multiOrder.id)}`);
    const sellerAVisible = await rlsCount("authenticated", userA, `select count(*)::text count from public.comu_order_suborders where order_id=${sqlQuote(multiOrder.id)} and seller_id=${sqlQuote(sellerIds[0])}`);
    const sellerBForeign = await rlsCount("authenticated", userC, `select count(*)::text count from public.comu_order_suborders where order_id=${sqlQuote(multiOrder.id)} and seller_id=${sqlQuote(sellerIds[0])}`);
    const anonVisible = await rlsCount("anon", null, `select count(*)::text count from public.comu_orders`);
    if (buyerAVisible !== 0 || buyerBVisible !== 1 || sellerAVisible !== 1 || sellerBForeign !== 0 || anonVisible !== 0) fail("RLS isolation", JSON.stringify({ buyerAVisible, buyerBVisible, sellerAVisible, sellerBForeign, anonVisible }));
    pass("RLS isolation", "buyer, seller and anon queries executed under database roles");
  } finally {
    if (createdOrders.length) await q(`delete from public.comu_orders where id in (${createdOrders.map(sqlQuote).join(",")})`);
    await q("delete from public.comu_inventory_reservations where session_key like 'cert-%'");
    await q("delete from public.comu_order_events where payload->>'reservationId' is not null and payload->>'reservationId' not in (select id::text from public.comu_inventory_reservations)");
    await q(`delete from public.comu_sellers where id in (${sellerIds.map(sqlQuote).join(",")})`);
    for (const row of previousInventory) await q(`update public.pos_inventory set quantity=${sqlQuote(row.quantity)},reserved_quantity=${sqlQuote(row.reserved_quantity)},minimum_quantity=${sqlQuote(row.minimum_quantity)} where variant_id=${sqlQuote(row.variant_id)} and location_id=${sqlQuote(location.id)}`);
    for (const variant of variants) if (!previousInventory.some((row) => row.variant_id === variant.id)) await q(`delete from public.pos_inventory where location_id=${sqlQuote(location.id)} and variant_id=${sqlQuote(variant.id)}`);
    await q(`update public.pos_products set name=${sqlQuote(originalProduct.name)} where id=${sqlQuote(variants[0].product_id)}`); await q(`update public.pos_product_variants set price=${sqlQuote(originalVariant.price)} where id=${sqlQuote(variants[0].id)}`);
  }
  console.log("COMU PostgreSQL certification: PASS");
}

async function main() {
  const db = await new PgWire().connect();
  console.log((await db.query("select current_database() as database, current_user as user"))[0]);
  if (process.env.COMU_APPLY_MIGRATIONS === "1") {
    if (process.env.COMU_RESET === "1") { await db.query("drop table if exists public.comu_seller_ledger_entries,public.comu_seller_payment_accounts,public.comu_payment_transactions,public.comu_payment_allocations,public.comu_payment_intents,public.comu_order_events,public.comu_order_item_snapshots,public.comu_order_items,public.comu_order_suborders,public.comu_orders,public.comu_inventory_reservation_items,public.comu_inventory_reservations,public.comu_cart_items,public.comu_carts,public.comu_buyer_addresses,public.comu_buyers,public.comu_product_media,public.comu_variant_listings,public.comu_product_listings,public.comu_storefronts,public.comu_seller_memberships,public.comu_sellers cascade"); await db.query("drop policy if exists comu_products_public_read on storage.objects"); }
    const names = ["20260920100000_comu_foundation_sellers.sql", "20260920101000_comu_storefronts.sql", "20260920102000_comu_catalog_listings.sql", "20260920103000_comu_product_media.sql", "20260920104000_comu_storage.sql", "20260920110000_comu_buyers_cart.sql", "20260920111000_comu_inventory_reservations.sql", "20260920112000_comu_orders_events.sql", "20260920113000_comu_reservation_events_timeout.sql", "20260920140000_comu_payments.sql", "20260920141000_comu_seller_finance.sql", "20260920142000_comu_payment_rpcs.sql"];
    for (const name of names) { console.log(`Applying ${name}`); await db.query((await readFile(join(process.cwd(), "supabase", "migrations", name), "utf8")).replace(/^\uFEFF/, "")); }
  }
  if (process.env.COMU_CERTIFY === "1") await certify(db);
  if (process.env.COMU_INSPECT === "1") { const tables = await db.query("select table_name from information_schema.tables where table_schema='public' and table_name like 'comu_%' order by table_name"); console.log(`COMU tables: ${tables.map((row) => row.table_name).join(", ")}`); console.log("product columns", await db.query("select column_name from information_schema.columns where table_name='pos_products' order by ordinal_position")); console.log("variant columns", await db.query("select column_name from information_schema.columns where table_name='pos_product_variants' order by ordinal_position")); console.log("brands", await db.query("select id,slug,name from public.brands limit 5")); console.log("locations", await db.query("select id,brand_slug,name from public.pos_locations limit 5")); console.log("variants", await db.query("select id,brand_slug,product_id,name from public.pos_product_variants where active=true limit 5")); console.log("cert inventory", await db.query("select variant_id,location_id,quantity,reserved_quantity from public.pos_inventory where brand_slug='cometa-certification-local' limit 5")); }
  if (process.env.COMU_QUERY) console.log(await db.query(process.env.COMU_QUERY));
  await db.close();
}
main().catch((error) => { console.error(error); process.exit(1); });
