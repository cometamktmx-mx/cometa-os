// Fixed local Docker socket only. Apply M1 and fixtures in ONE rolled-back
// transaction, without modifying migration history or any existing tenant rows.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const candidates = [process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe") : "", "C:/Program Files/Docker/Docker/resources/bin/docker.exe"];
const docker = process.platform === "win32" ? candidates.find(file => file && existsSync(file)) || "docker" : "docker";
const socket = process.platform === "win32" ? "npipe:////./pipe/dockerDesktopLinuxEngine" : "unix:///var/run/docker.sock";
function run(args, input) {
  const result = spawnSync(docker, ["--host", socket, ...args], { input, encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return result;
}
const names = run(["ps", "--format", "{{.Names}}"] ).stdout.trim().split(/\r?\n/).filter(name => /^supabase_db_[a-z0-9_-]+$/.test(name));
assert.equal(names.length, 1, "Exactly one local Supabase DB required; no remote fallback");
const stripTransaction = file => readFileSync(file, "utf8").replace(/^\s*(begin|commit|rollback);\s*$/gmi, "");
const sql = `begin; set local lock_timeout='5s'; set local statement_timeout='60s';
select pg_advisory_xact_lock(hashtextextended('cometa-pos-mobile-m1-local-test',0));
${stripTransaction("supabase/migrations/20261002120000_pos_device_foundation_v1.sql")}
${stripTransaction("supabase/migrations/20261002121000_pos_mutation_api_boundary_v1.sql")}
${stripTransaction("supabase/tests/pos_mobile_m1.sql")}
${process.argv.includes("--food-regression") ? stripTransaction("supabase/tests/pos_food_operations_v1.sql") + stripTransaction("supabase/tests/pos_staff_multirole_cash_audit_v1.sql") : ""}
rollback;`;
const result = run(["exec", "-i", "-u", "postgres", names[0], "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"], sql);
console.log(result.stderr.trim());
assert.match(result.stdout, /ROLLBACK/);
console.log("PASS M1 migrations + PostgreSQL security suite; all schema and fixture writes rolled back locally");
