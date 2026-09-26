import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const names = [
  "20260921100000_comu_financial_settings.sql",
  "20260921101000_comu_guarantee_lifecycle.sql",
  "20260921102000_comu_financial_holds.sql",
  "20260921103000_comu_seller_settlements.sql",
  "20260921104000_comu_connect_finance_rpcs.sql",
  "20260921105000_comu_connect_finance_rls.sql",
];
const expectedHashes = [
  "c318af58294a9a5289b8f97fcd9cba1e6cfda1f8f4fa7b81e1563dac483d809d",
  "ec45333c69fa1015714354499c8357ea7e8c3baba8b9d735ad0dd8663a404ff8",
  "148133081c93f4c617d3c8d644a4d78809d05e2b5a40500f5a3604faaa7a025a",
  "5c60eab420fd27b1c5567a1da60eb465a7fa79bc017c87d5041c877caaafe896",
  "c2887e51cc388a42a111edae575ab805548b88e2b765a739f7fa2d63ac3e8537",
  "2eca981119b1e1137631c4bfdcf2d2a868d110dc834a68047e0f7e7ccde43eb9",
];
const base = join(root, "supabase", "migrations-wip", "comu-finance");
const docker = process.env.COMU_LOCAL_DOCKER ?? "C:\\Users\\jesus\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe";
const dbContainer = process.env.COMU_LOCAL_DB_CONTAINER ?? "supabase_db_zhtagqrzyovsrmsicaot";
const dbHost = process.env.COMU_LOCAL_DB_HOST ?? "127.0.0.1";
const dbPort = process.env.COMU_LOCAL_DB_PORT ?? "54322";
const dbUrl = process.env.COMU_LOCAL_DB_URL ?? `postgresql://postgres:postgres@${dbHost}:${dbPort}/postgres`;

function fail(message) { throw new Error(message); }

if (!["127.0.0.1", "localhost"].includes(dbHost) || dbPort !== "54322" || /supabase\.co/i.test(dbUrl) || /zhtagqrzyovsrmsicaot/i.test(dbUrl)) {
  fail("LOCAL_DATABASE_GUARD_FAILED");
}

const contents = await Promise.all(names.map((name) => readFile(join(base, name))));
const hashes = contents.map((content) => createHash("sha256").update(content).digest("hex"));
hashes.forEach((hash, index) => { if (hash !== expectedHashes[index]) fail(`HASH_MISMATCH:${names[index]}`); });

function psql(sql) {
  return execFileSync(docker, ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], { input: sql, encoding: "utf8", windowsHide: true });
}

const sql = String.raw`
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$ begin
  if not exists(select 1 from public.comu_financial_settings where platform_fee_bps=0 and guarantee_days=4 and currency='MXN') then raise exception 'FINANCIAL_SETTINGS_DEFAULTS_FAILED'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name in ('comu_seller_settlements','comu_payment_allocations') and data_type in ('numeric','double precision','real')) then raise exception 'MONEY_FLOAT_COLUMN_FOUND'; end if;
end $$;
insert into public.comu_sellers(id,brand_id,brand_slug,public_name,slug,status,verification_status) values
 ('00000000-0000-0000-0000-0000000000a1','finance-test-a','finance-test-a','Finance Seller A','finance-test-a','ACTIVE','VERIFIED'),
 ('00000000-0000-0000-0000-0000000000b1','finance-test-b','finance-test-b','Finance Seller B','finance-test-b','ACTIVE','VERIFIED');
insert into public.comu_seller_memberships(seller_id,user_id,role) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000aa01','OWNER'),
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bb01','OWNER');
insert into public.comu_seller_payment_accounts(seller_id,stripe_account_id,onboarding_status,transfers_enabled,payouts_enabled,details_submitted) values
 ('00000000-0000-0000-0000-0000000000a1','acct_local_a','COMPLETE',true,true,true),
 ('00000000-0000-0000-0000-0000000000b1','acct_local_b','COMPLETE',true,true,true);
insert into public.comu_buyers(id,user_id,display_name) values ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000cc01','Finance Buyer');
insert into public.comu_inventory_reservations(id,buyer_id,session_key,expires_at,idempotency_key) values
 ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-00000000c001','finance-session-1',now()+interval '1 day','finance-res-1'),
 ('00000000-0000-0000-0000-00000000d002','00000000-0000-0000-0000-00000000c001','finance-session-2',now()+interval '1 day','finance-res-2'),
 ('00000000-0000-0000-0000-00000000d003','00000000-0000-0000-0000-00000000c001','finance-session-3',now()+interval '1 day','finance-res-3'),
 ('00000000-0000-0000-0000-00000000d004','00000000-0000-0000-0000-00000000c001','finance-session-4',now()+interval '1 day','finance-res-4'),
 ('00000000-0000-0000-0000-00000000d005','00000000-0000-0000-0000-00000000c001','finance-session-5',now()+interval '1 day','finance-res-5');
insert into public.comu_orders(id,buyer_id,status,currency,subtotal,grand_total,reservation_id,idempotency_key) values
 ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000c001','PAID','MXN',100,100,'00000000-0000-0000-0000-00000000d001','finance-order-1'),
 ('00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-00000000c001','CANCELLED','MXN',50,50,'00000000-0000-0000-0000-00000000d002','finance-order-2'),
 ('00000000-0000-0000-0000-00000000e003','00000000-0000-0000-0000-00000000c001','PAID','MXN',99.99,99.99,'00000000-0000-0000-0000-00000000d003','finance-order-3'),
 ('00000000-0000-0000-0000-00000000e004','00000000-0000-0000-0000-00000000c001','PAID','MXN',3.33,3.33,'00000000-0000-0000-0000-00000000d004','finance-order-4'),
 ('00000000-0000-0000-0000-00000000e005','00000000-0000-0000-0000-00000000c001','PAID','MXN',1,1,'00000000-0000-0000-0000-00000000d005','finance-order-5');
insert into public.comu_order_suborders(id,order_id,seller_id,status,subtotal,grand_total,delivered_at,guarantee_expires_at) values
 ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1','DELIVERED',100,100,now()-interval '5 days',now()-interval '1 day'),
 ('00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-0000000000a1','CANCELLED',50,50,null,null),
 ('00000000-0000-0000-0000-00000000f003','00000000-0000-0000-0000-00000000e003','00000000-0000-0000-0000-0000000000a1','DELIVERED',99.99,99.99,now()-interval '5 days',now()-interval '1 day'),
 ('00000000-0000-0000-0000-00000000f004','00000000-0000-0000-0000-00000000e004','00000000-0000-0000-0000-0000000000b1','DELIVERED',3.33,3.33,now()-interval '5 days',now()-interval '1 day'),
 ('00000000-0000-0000-0000-00000000f005','00000000-0000-0000-0000-00000000e005','00000000-0000-0000-0000-0000000000b1','PREPARING',1,1,null,null);
update public.comu_order_suborders set status='DELIVERED' where id='00000000-0000-0000-0000-00000000f005';
do $$ declare d timestamptz; e timestamptz; begin select delivered_at,guarantee_expires_at into d,e from public.comu_order_suborders where id='00000000-0000-0000-0000-00000000f005'; if d is null or abs(extract(epoch from (e-(d+interval '4 days'))))>2 then raise exception 'GUARANTEE_FOUR_DAYS_FAILED'; end if; end $$;
insert into public.comu_payment_intents(id,order_id,buyer_id,amount_cents,currency,status,idempotency_key) values
 ('00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000c001',10000,'MXN','SUCCEEDED','finance-payment-1'),
 ('00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-00000000c001',5000,'MXN','SUCCEEDED','finance-payment-2'),
 ('00000000-0000-0000-0000-000000001003','00000000-0000-0000-0000-00000000e003','00000000-0000-0000-0000-00000000c001',9999,'MXN','SUCCEEDED','finance-payment-3'),
 ('00000000-0000-0000-0000-000000001004','00000000-0000-0000-0000-00000000e004','00000000-0000-0000-0000-00000000c001',333,'MXN','SUCCEEDED','finance-payment-4');
insert into public.comu_payment_allocations(id,payment_id,order_id,suborder_id,seller_id,gross_amount_cents,status) values
 ('00000000-0000-0000-0000-000000002001','00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000a1',10000,'HELD'),
 ('00000000-0000-0000-0000-000000002002','00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-0000000000a1',5000,'HELD'),
 ('00000000-0000-0000-0000-000000002003','00000000-0000-0000-0000-000000001003','00000000-0000-0000-0000-00000000e003','00000000-0000-0000-0000-00000000f003','00000000-0000-0000-0000-0000000000a1',9999,'HELD'),
 ('00000000-0000-0000-0000-000000002004','00000000-0000-0000-0000-000000001004','00000000-0000-0000-0000-00000000e004','00000000-0000-0000-0000-00000000f004','00000000-0000-0000-0000-0000000000b1',333,'HELD');
do $$ begin if exists(select 1 from public.comu_payment_allocations where platform_fee_cents<>0 or seller_net_amount_cents<>gross_amount_cents) then raise exception 'ZERO_PLATFORM_FEE_FAILED'; end if; end $$;
select public.comu_set_fund_hold('00000000-0000-0000-0000-000000002003',false,'QA hold','00000000-0000-0000-0000-00000000aa01');
select public.comu_set_fund_hold('00000000-0000-0000-0000-000000002003',false,'QA duplicate','00000000-0000-0000-0000-00000000aa01');
do $$ begin if (select count(*) from public.comu_seller_fund_holds where allocation_id='00000000-0000-0000-0000-000000002003' and status='ACTIVE')<>1 then raise exception 'DUPLICATE_HOLD_FAILED'; end if; end $$;
select public.comu_release_eligible_seller_funds('00000000-0000-0000-0000-0000000000a1');
do $$ begin if (select status from public.comu_payment_allocations where id='00000000-0000-0000-0000-000000002003')<>'HELD' then raise exception 'ACTIVE_HOLD_DID_NOT_BLOCK'; end if; if (select status from public.comu_payment_allocations where id='00000000-0000-0000-0000-000000002002')<>'HELD' then raise exception 'CANCELLED_ORDER_RELEASED'; end if; end $$;
select public.comu_set_fund_hold('00000000-0000-0000-0000-000000002003',true,'release','00000000-0000-0000-0000-00000000aa01');
select public.comu_set_fund_hold('00000000-0000-0000-0000-000000002003',true,'release again','00000000-0000-0000-0000-00000000aa01');
select public.comu_release_eligible_seller_funds('00000000-0000-0000-0000-0000000000a1');
do $$ begin if (select status from public.comu_payment_allocations where id='00000000-0000-0000-0000-000000002003')<>'AVAILABLE' then raise exception 'HOLD_RELEASE_DID_NOT_RESTORE'; end if; if (select status from public.comu_payment_allocations where id='00000000-0000-0000-0000-000000002002')<>'HELD' then raise exception 'CANCELLED_ORDER_RELEASED_AFTER_RETRY'; end if; end $$;
do $$ declare a bigint; b bigint; begin select sum(gross_amount_cents),sum(platform_fee_cents+seller_net_amount_cents) into a,b from public.comu_payment_allocations; if a<>b then raise exception 'MONEY_CONSERVATION_FAILED'; end if; if exists(select 1 from public.comu_payment_intents p where p.amount_cents<>(select coalesce(sum(a.gross_amount_cents),0) from public.comu_payment_allocations a where a.payment_id=p.id)) then raise exception 'PAYMENT_ALLOCATION_CONSERVATION_FAILED'; end if; if (select platform_fee_cents from public.comu_payment_allocations where id='00000000-0000-0000-0000-000000002004')<>0 then raise exception 'ODD_CENT_FEE_FAILED'; end if; end $$;
select public.comu_create_daily_settlements('00000000-0000-0000-0000-0000000000a1');
select public.comu_create_daily_settlements('00000000-0000-0000-0000-0000000000a1');
do $$ declare n integer; begin select count(*) into n from public.comu_seller_settlement_items i join public.comu_payment_allocations a on a.id=i.allocation_id join public.comu_order_suborders so on so.id=a.suborder_id where so.status='CANCELLED'; if n<>0 then raise exception 'CANCELLED_SETTLEMENT_ITEM_CREATED'; end if; if (select count(*) from public.comu_seller_settlements where seller_id='00000000-0000-0000-0000-0000000000a1')<>1 then raise exception 'DUPLICATE_SETTLEMENT_FAILED'; end if; end $$;
do $$ declare sid uuid; s text; begin select id into sid from public.comu_seller_settlements where seller_id='00000000-0000-0000-0000-0000000000a1'; select status into s from public.comu_claim_transfer(sid); if s<>'PROCESSING' then raise exception 'TRANSFER_CLAIM_FAILED'; end if; perform public.comu_fail_transfer(sid,'local QA failure',true); select status into s from public.comu_claim_transfer(sid); if s<>'PROCESSING' then raise exception 'TRANSFER_RETRY_FAILED'; end if; select status into s from public.comu_finish_transfer(sid,'tr_local_1',(select amount_cents from public.comu_seller_settlements where id=sid),'MXN','acct_local_a'); if s<>'TRANSFERRED' then raise exception 'TRANSFER_FINISH_FAILED'; end if; select status into s from public.comu_finish_transfer(sid,'tr_local_1',(select amount_cents from public.comu_seller_settlements where id=sid),'MXN','acct_local_a'); if s<>'TRANSFERRED' then raise exception 'TRANSFER_IDEMPOTENCY_FAILED'; end if; end $$;
do $$ declare ua bigint; ub bigint; ha bigint; hb bigint; pa bigint; pb bigint; begin
  perform set_config('request.jwt.claims',json_build_object('sub','00000000-0000-0000-0000-00000000aa01')::text,true); set local role authenticated;
  select count(*) into ua from public.comu_seller_settlements where seller_id='00000000-0000-0000-0000-0000000000a1'; select count(*) into ub from public.comu_seller_settlements where seller_id='00000000-0000-0000-0000-0000000000b1'; reset role;
  set local role authenticated; select count(*) into ha from public.comu_seller_fund_holds where seller_id='00000000-0000-0000-0000-0000000000a1'; select count(*) into hb from public.comu_seller_fund_holds where seller_id='00000000-0000-0000-0000-0000000000b1'; select count(*) into pa from public.comu_seller_payment_accounts where seller_id='00000000-0000-0000-0000-0000000000a1'; select count(*) into pb from public.comu_seller_payment_accounts where seller_id='00000000-0000-0000-0000-0000000000b1'; reset role;
  if ua<>1 or ub<>0 or ha<>1 or hb<>0 or pa<>1 or pb<>0 then raise exception 'RLS_SELLER_ISOLATION_FAILED'; end if;
end $$;
do $$ begin begin update public.comu_financial_events set payload='{"tampered":true}' where seller_id='00000000-0000-0000-0000-0000000000a1'; raise exception 'APPEND_ONLY_UPDATE_ALLOWED'; exception when others then if sqlerrm not like '%COMU_FINANCIAL_APPEND_ONLY%' then raise; end if; end; begin update public.comu_seller_ledger_entries set amount_cents=0 where seller_id='00000000-0000-0000-0000-0000000000a1'; raise exception 'APPEND_ONLY_LEDGER_UPDATE_ALLOWED'; exception when others then if sqlerrm not like '%COMU_FINANCIAL_APPEND_ONLY%' then raise; end if; end; end $$;
rollback;
`;

const output = psql(sql);
const finalHashes = await Promise.all(names.map(async (name) => createHash("sha256").update(await readFile(join(base, name))).digest("hex")));
finalHashes.forEach((hash, index) => { if (hash !== expectedHashes[index]) fail(`POST_HASH_MISMATCH:${names[index]}`); });
console.log(JSON.stringify({ ok: true, sqlExecuted: true, local: { host: dbHost, port: dbPort, container: dbContainer }, hashes, postHashes: finalHashes, output: output.trim().split("\n").filter(Boolean).slice(-12), checks: ["financial settings", "guarantee four days", "zero platform fee", "holds", "cancelled order blocked", "settlement uniqueness", "transfer retry", "money conservation", "RLS isolation", "append-only ledger"] }, null, 2));
