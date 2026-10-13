import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const host = process.env.COMU_LOCAL_DB_HOST || "127.0.0.1";
const port = process.env.COMU_LOCAL_DB_PORT || "54322";
const docker = process.env.COMU_LOCAL_DOCKER || "C:\\Users\\jesus\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe";
const container = process.env.COMU_LOCAL_DB_CONTAINER || "supabase_db_zhtagqrzyovsrmsicaot";
if (!['127.0.0.1', 'localhost'].includes(host) || port !== '54322') throw new Error('LOCAL_DATABASE_GUARD_FAILED');
if (/supabase\.co|zhtagqrzyovsrmsicaot/i.test(process.env.COMU_LOCAL_DB_URL || '')) throw new Error('REMOTE_DATABASE_GUARD_FAILED');
const expected = {
  "20260921100000_comu_financial_settings.sql": "c318af58294a9a5289b8f97fcd9cba1e6cfda1f8f4fa7b81e1563dac483d809d",
  "20260921101000_comu_guarantee_lifecycle.sql": "ec45333c69fa1015714354499c8357ea7e8c3baba8b9d735ad0dd8663a404ff8",
  "20260921102000_comu_financial_holds.sql": "148133081c93f4c617d3c8d644a4d78809d05e2b5a40500f5a3604faaa7a025a",
  "20260921103000_comu_seller_settlements.sql": "5c60eab420fd27b1c5567a1da60eb465a7fa79bc017c87d5041c877caaafe896",
  "20260921104000_comu_connect_finance_rpcs.sql": "c2887e51cc388a42a111edae575ab805548b88e2b765a739f7fa2d63ac3e8537",
  "20260921105000_comu_connect_finance_rls.sql": "2eca981119b1e1137631c4bfdcf2d2a868d110dc834a68047e0f7e7ccde43eb9",
};
for (const [file, hash] of Object.entries(expected)) {
  const actual = createHash('sha256').update(readFileSync(`supabase/migrations/${file}`)).digest('hex');
  if (actual !== hash) throw new Error(`HASH_MISMATCH:${file}`);
}
const sql = "select count(*) from information_schema.routines where routine_schema='public' and routine_name in ('comu_open_dispute','comu_resolve_dispute','comu_set_financial_liability_owner','comu_request_refund','comu_finalize_refund_success','comu_finalize_refund_failure','comu_recover_seller_liability')";
const result = execFileSync(docker, ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atq', '-c', sql], { encoding: 'utf8', windowsHide: true }).trim();
if (result !== '7') throw new Error(`LIFECYCLE_RPC_COUNT_FAILED:${result}`);
console.log('COMU finance lifecycle local contract: PASS');
