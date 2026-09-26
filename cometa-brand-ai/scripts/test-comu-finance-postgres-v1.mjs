// Explicit local-only finance harness. --apply applies Day 4 migrations; --test rolls back all fixtures.
import net from "node:net";
import crypto from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const cfg = {host:"127.0.0.1",port:54322,user:"postgres",password:process.env.COMU_PG_PASSWORD || "postgres",database:"postgres"};
if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw Error("Local development only");
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
          const serverFirst = m.body.subarray(4).toString(); const values = Object.fromEntries(serverFirst.split(",").map((part) => [part[0], part.slice(2)])); const salt = Buffer.from(values.s, "base64"); const salted = crypto.pbkdf2Sync(cfg.password, salt, Number(values.i), 32, "sha256"); const clientKey = crypto.createHmac("sha256", salted).update("Client Key").digest(); const storedKey = crypto.createHash("sha256").update(clientKey).digest(); const finalBare = `c=biws,r=${values.r}`; const authMessage = `${firstBare},${serverFirst},${finalBare}`; const proofKey = crypto.createHmac("sha256", storedKey).update(authMessage).digest(); const proof = Buffer.alloc(clientKey.length); for (let i = 0; i < proof.length; i++) proof[i] = clientKey[i] ^ proofKey[i]; expectedSignature = crypto.createHmac("sha256", crypto.createHmac("sha256", salted).update("Server Key").digest()).update(authMessage).digest("base64"); const final = `${finalBare},p=${proof.toString("base64")}`; this.socket.write(packet("p", Buffer.from(final)));
        } else if (code === 12) {
          const final = m.body.subarray(4).toString(); if (!final.includes(`v=${expectedSignature}`)) throw new Error("SCRAM server signature verification failed");
        } else if (code === 0) { while ((await this.next()).type !== "Z") {} break; }
      } else if (m.type === "E") throw new Error(`PostgreSQL startup error: ${m.body.toString()}`);
    }
    return this;
  }
  drain() { while (this.buffer.length >= 5) { const len = this.buffer.readInt32BE(1); if (this.buffer.length < len + 1) return; const type = String.fromCharCode(this.buffer[0]); const body = this.buffer.subarray(5, len + 1); this.buffer = this.buffer.subarray(len + 1); const message = { type, body }; const waiter = this.waiters.shift(); if (waiter) waiter(message); else this.messages.push(message); } }
  next() { if (this.messages.length) return Promise.resolve(this.messages.shift()); return new Promise((resolve) => this.waiters.push(resolve)); }
  async query(sql) { this.socket.write(Buffer.concat([Buffer.from("Q"), (() => { const b = Buffer.from(`${sql}${z}`); const l = Buffer.alloc(4); l.writeInt32BE(4 + b.length); return Buffer.concat([l, b]); })()])); const rows = []; let fields = []; let queryError; while (true) { const m = await this.next(); if (m.type === "T") { const count = m.body.readInt16BE(0); let o = 2; fields = []; for (let i = 0; i < count; i++) { const end = m.body.indexOf(0, o); fields.push(m.body.subarray(o, end).toString()); o = end + 19; } } else if (m.type === "D") { const count = m.body.readInt16BE(0); let o = 2; const row = []; for (let i = 0; i < count; i++) { const n = m.body.readInt32BE(o); o += 4; row.push(n < 0 ? null : m.body.subarray(o, o + n).toString()); o += Math.max(n, 0); } rows.push(Object.fromEntries(fields.map((f, i) => [f, row[i]]))); } else if (m.type === "E") queryError = new Error(`PostgreSQL query error: ${m.body.toString()}`); else if (m.type === "Z") break; } if(queryError) throw queryError; return rows; }
  async close() { this.socket?.end(); }
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const uuid = () => crypto.randomUUID();
async function main() {
  if (!["--apply", "--test"].includes(process.argv[2])) { console.log("Usage: node scripts/test-comu-finance-postgres-v1.mjs --apply | --test (127.0.0.1:54322 only)"); return; }
  const db = await new PgWire().connect();
  const q = (sql) => db.query(sql);
  const one = async (sql) => (await q(sql))[0];
  try {
    if (process.argv[2] === "--apply") {
      if ((await one("select to_regclass('public.comu_financial_settings') as existing")).existing) throw Error("Day 4 tables already exist; migrations are not reapplied automatically");
      await q("begin");
      for (const name of (await readdir("supabase/migrations")).filter((name) => /^2026092110.*_comu_.*\.sql$/.test(name)).sort()) {
        await q(await readFile(`supabase/migrations/${name}`, "utf8")); console.log(`APPLIED local ${name}`);
      }
      await q("commit"); return;
    }
    await q("begin");
    let count = 0;
    const pass = (name) => { count++; console.log(`PASS ${name}`); };
    const reject = async (sql, label) => {
      await q("savepoint expected_failure"); let rejected = false;
      try { await q(sql); } catch { rejected = true; }
      await q("rollback to savepoint expected_failure"); assert.ok(rejected, label); pass(label);
    };
    const buyer = uuid(), buyerUser = uuid(), order = uuid(), reservation = uuid(), payment = uuid();
    const sellers = [uuid(), uuid(), uuid()], users = [uuid(), uuid(), uuid()], subs = [uuid(), uuid(), uuid()];
    const brand = await one("select id,slug from public.brands order by created_at limit 1");
    if (!brand) throw Error("Local database needs an existing Brand; fixture does not modify POS or Brand data");
    await q(`insert into public.comu_buyers(id,user_id) values(${quote(buyer)},${quote(buyerUser)})`);
    await q(`insert into public.comu_inventory_reservations(id,buyer_id,session_key,idempotency_key,status,expires_at) values(${quote(reservation)},${quote(buyer)},${quote(uuid())},${quote(uuid())},'COMMITTED',now()+interval '15 minutes')`);
    await q(`insert into public.comu_orders(id,buyer_id,reservation_id,idempotency_key,grand_total) values(${quote(order)},${quote(buyer)},${quote(reservation)},${quote(uuid())},1000)`);
    for (let i=0;i<3;i++) {
      await q(`insert into public.comu_sellers(id,brand_id,brand_slug,public_name,slug,status,verification_status) values(${quote(sellers[i])},${quote(brand.id)},${quote(brand.slug)},'Finance rollback fixture',${quote('finance-'+sellers[i])},'ACTIVE','VERIFIED')`);
      await q(`insert into public.comu_seller_memberships(seller_id,user_id,role) values(${quote(sellers[i])},${quote(users[i])},'OWNER')`);
      await q(`insert into public.comu_order_suborders(id,order_id,seller_id,grand_total) values(${quote(subs[i])},${quote(order)},${quote(sellers[i])},${[400,350,250][i]})`);
      await q(`insert into public.comu_seller_payment_accounts(seller_id,stripe_account_id,onboarding_status,transfers_enabled,details_submitted,payouts_enabled) values(${quote(sellers[i])},${quote('acct_fixture_'+sellers[i])},'COMPLETE',true,true,true)`);
    }
    const intent = 'pi_fixture_'+payment;
    await q(`insert into public.comu_payment_intents(id,order_id,buyer_id,stripe_payment_intent_id,amount_cents,currency,status,idempotency_key) values(${quote(payment)},${quote(order)},${quote(buyer)},${quote(intent)},100000,'MXN','REQUIRES_PAYMENT',${quote(uuid())})`);
    await q(`select public.comu_mark_payment_succeeded(${quote(intent)},100000,'MXN')`);
    await q("set constraints all immediate");
    let allocations = await q(`select id,seller_id,gross_amount_cents,platform_fee_cents,seller_net_amount_cents from public.comu_payment_allocations where payment_id=${quote(payment)} order by gross_amount_cents desc`);
    const a=allocations.map((row)=>row.id);
    assert.deepEqual(allocations.map(row=>Number(row.gross_amount_cents)),[40000,35000,25000]); pass("multi-seller integer-cent allocations conserve 100000 cents");
    assert.ok(allocations.every(row=>BigInt(row.gross_amount_cents)===BigInt(row.platform_fee_cents)+BigInt(row.seller_net_amount_cents))); pass("gross equals net plus fee");
    await q(`select public.comu_mark_payment_succeeded(${quote(intent)},100000,'MXN')`);
    assert.equal((await one(`select count(*) as n from public.comu_seller_ledger_entries where payment_id=${quote(payment)} and entry_type='SALE_HELD'`)).n,'3'); pass("SALE_HELD exactly once per allocation");
    await reject(`update public.comu_seller_ledger_entries set amount_cents=1 where payment_id=${quote(payment)}`,"ledger append-only");
    await reject(`update public.comu_orders set guarantee_days=1 where id=${quote(order)}`,"order financial snapshot immutable");
    await q(`select public.comu_admin_deliver_suborder(${quote(subs[0])},${quote(users[0])})`);
    assert.equal((await one(`select extract(epoch from guarantee_expires_at-delivered_at)::bigint as seconds from public.comu_order_suborders where id=${quote(subs[0])}`)).seconds,'345600'); pass("delivery starts exactly four days of guarantee");
    assert.equal((await one(`select public.comu_release_eligible_seller_funds(${quote(sellers[0])}) as n`)).n,'0'); pass("before four days no release");
    // Test-only clock advancement: targeted fixture row, trigger restored, entire test rolled back.
    await q("alter table public.comu_order_suborders disable trigger comu_suborder_guarantee");
    await q(`update public.comu_order_suborders set delivered_at=now()-interval '5 days',guarantee_expires_at=now()-interval '1 day' where id=${quote(subs[0])}`);
    await q("alter table public.comu_order_suborders enable trigger comu_suborder_guarantee");
    await q(`select public.comu_set_fund_hold(${quote(a[0])},false,'test hold',${quote(users[0])})`);
    assert.equal((await one(`select public.comu_release_eligible_seller_funds(${quote(sellers[0])}) as n`)).n,'0'); pass("hold blocks eligible release");
    await q(`select public.comu_set_fund_hold(${quote(a[0])},true,'test release',${quote(users[0])})`);
    assert.equal((await one(`select public.comu_release_eligible_seller_funds(${quote(sellers[0])}) as n`)).n,'1'); pass("released hold permits eligible seller-specific release");
    assert.equal((await one(`select public.comu_release_eligible_seller_funds(${quote(sellers[0])}) as n`)).n,'0'); pass("SALE_AVAILABLE idempotent");
    assert.equal((await one(`select count(*) as n from public.comu_payment_allocations where payment_id=${quote(payment)} and status='HELD'`)).n,'2'); pass("seller A does not release B/C");
    const settlement = await one(`select * from public.comu_create_daily_settlements(${quote(sellers[0])})`);
    assert.equal(settlement.amount_cents,'40000'); pass("settlement groups only AVAILABLE seller funds");
    assert.equal((await one(`select id from public.comu_create_daily_settlements(${quote(sellers[0])})`)).id,settlement.id); pass("daily settlement idempotent");
    assert.equal((await one(`select count(*) as n from public.comu_seller_settlement_items where settlement_id=${quote(settlement.id)}`)).n,'1'); pass("no HELD or other-seller allocation in settlement");
    await reject(`select public.comu_set_fund_hold(${quote(a[0])},false,'too late',${quote(users[0])})`,"cannot alter funds already committed to a transfer");
    await q(`select public.comu_claim_transfer(${quote(settlement.id)})`);
    await reject(`select public.comu_claim_transfer(${quote(settlement.id)})`,"concurrent claim denied while processing");
    await q(`select public.comu_fail_transfer(${quote(settlement.id)},'PLATFORM_BALANCE_INSUFFICIENT',true)`);
    assert.equal((await one(`select status from public.comu_payment_allocations where id=${quote(a[0])}`)).status,'PENDING_TRANSFER'); pass("failed transfer preserves funds");
    assert.equal((await one(`select idempotency_key from public.comu_claim_transfer(${quote(settlement.id)})`)).idempotency_key,settlement.idempotency_key); pass("retry retains exact Stripe idempotency key");
    await reject(`select public.comu_finish_transfer(${quote(settlement.id)},'tr_fixture',39999,'MXN',${quote(settlement.stripe_account_id)})`,"wrong transfer amount rejected");
    for(let i=0;i<2;i++) await q(`select public.comu_finish_transfer(${quote(settlement.id)},'tr_fixture_${settlement.id}',40000,'MXN',${quote(settlement.stripe_account_id)})`);
    assert.equal((await one(`select count(*) as n from public.comu_seller_ledger_entries where allocation_id=${quote(a[0])} and entry_type='TRANSFER'`)).n,'1'); pass("transfer success marks exactly once");
    await q(`select public.comu_set_fund_hold(${quote(a[2])},false,'frozen C',${quote(users[0])})`);
    assert.equal((await one(`select id from public.comu_create_daily_settlements(${quote(sellers[2])})`)).id,null); pass("HELD/FROZEN never settle");
    await q("set local role authenticated");
    await q(`select set_config('request.jwt.claim.sub',${quote(users[0])},true)`);
    assert.equal((await one(`select count(*) as n from public.comu_payment_allocations where payment_id=${quote(payment)}`)).n,'1'); pass("seller RLS sees only own allocation");
    assert.equal((await one(`select count(id) as n from public.comu_seller_settlements where seller_id=${quote(sellers[1])}`)).n,'0'); pass("cross-seller settlements hidden");
    await reject(`select public.comu_release_eligible_seller_funds(${quote(sellers[1])})`,"seller cannot invoke service-role finance mutation");
    await reject("select stripe_account_id from public.comu_seller_payment_accounts", "connected account identifiers not exposed to authenticated role");
    await q(`select set_config('request.jwt.claim.sub',${quote(buyerUser)},true)`);
    assert.equal((await one(`select count(*) as n from public.comu_seller_ledger_entries where payment_id=${quote(payment)}`)).n,'0'); pass("buyer cannot read seller ledger");
    await q("set local role anon");
    await reject("select * from public.comu_seller_fund_holds", "public financial access denied");
    await q("reset role");
    const admin = await one("select user_id from public.user_profiles where role='admin' and status='active' limit 1");
    if (admin) {
      await q("set local role authenticated"); await q(`select set_config('request.jwt.claim.sub',${quote(admin.user_id)},true)`);
      assert.equal((await one(`select count(*) as n from public.comu_payment_allocations where payment_id=${quote(payment)}`)).n,'3'); pass("COMETA admin sees all sellers"); await q("reset role");
    } else throw Error("Admin RLS evidence requires an existing local active admin; fixture never changes auth core");
    await q("rollback");
    console.log(`COMU PostgreSQL finance: ${count}/${count} PASS; all fixtures rolled back; no POS changes`);
  } catch(error) { await q("rollback").catch(()=>{}); throw error; }
  finally { await db.close(); }
}
main().catch((error)=>{console.error(error.message);process.exitCode=1;});
