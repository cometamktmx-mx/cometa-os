// Real PostgreSQL integration in an isolated database inside the existing LOCAL Supabase container.
// No network database URLs, production .env files, resets, drops or dependency installation.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const candidates = [process.env.COMETA_LOCAL_DOCKER_EXE,
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe") : null,
  "C:/Program Files/Docker/Docker/resources/bin/docker.exe"].filter(Boolean);
const docker = process.platform === "win32" ? candidates.find(file => existsSync(file)) || "docker" : "docker";
const socket = process.platform === "win32" ? "npipe:////./pipe/dockerDesktopLinuxEngine" : "unix:///var/run/docker.sock";
function run(args, input) {
  const result = spawnSync(docker, ["--host", socket, ...args], { input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return { stdout: result.stdout, stderr: result.stderr };
}
const containers = run(["ps", "--format", "{{.Names}}"] ).stdout.trim().split(/\r?\n/).filter(name => name.startsWith("supabase_db_"));
assert.equal(containers.length, 1, "Exactly one local Supabase database container is required; no remote fallback.");
const container = containers[0];
const existingDatabase = process.argv.find(arg => arg.startsWith("--database="))?.slice(11);
if (existingDatabase) assert.match(existingDatabase, /^food_integration_[0-9]+$/);
const database = existingDatabase || `food_integration_${new Date().toISOString().replace(/\D/g, "")}`;
function sql(text, db = database) {
  return run(["exec", "-i", "-u", "postgres", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db, "-f", "-"], text);
}
if (!existingDatabase) {
run(["exec", "-u", "postgres", container, "createdb", "-U", "postgres", "--template=template0", database]);
console.log(`LOCAL_DATABASE ${database}`);
// Keep the isolated database on both success and failure for debugging; never
// drop a database automatically. Print the policy before bootstrap can fail.
console.log(`Database retained locally on success or failure for debugging: ${database}.`);
// Baseline extension requirements, verified against its CREATE EXTENSION statements.
// Check server availability only; never install server packages or change cluster roles.
console.log(sql(`
select current_database() as integration_database, current_user as integration_user;
do $$
declare missing text[];
begin
  if current_database() !~ '^food_integration_[0-9]+$' or current_user <> 'postgres' then
    raise exception 'BOOTSTRAP_ISOLATION_FAILED: unexpected database or user';
  end if;
  select array_agg(required.name order by required.name) into missing
    from unnest(array['pg_stat_statements','pgcrypto','supabase_vault','uuid-ossp','vector']) required(name)
    where not exists(select 1 from pg_available_extensions available where available.name=required.name);
  if missing is not null then
    raise exception 'BOOTSTRAP_EXTENSION_UNAVAILABLE: % (no server installation attempted)', missing;
  end if;
end $$;
select name, default_version from pg_available_extensions
  where name in ('pg_stat_statements','pgcrypto','supabase_vault','uuid-ossp','vector') order by name;
create schema if not exists extensions;
create schema if not exists vault;
create extension if not exists pgcrypto with schema extensions;
`).stdout);
// Provider-owned auth/storage schema only, without any rows. Application public schema starts empty.
// Plain SQL is restored by psql (not pg_restore). Ownership and ACLs from the
// provider database are unnecessary here: restored objects belong to postgres.
const provider = run(["exec", "-u", "postgres", container, "pg_dump", "-U", "postgres", "-d", "postgres", "--format=plain", "--schema-only", "--no-owner", "--no-privileges", "--schema=auth", "--schema=storage"]).stdout;
sql(provider);
console.log(sql(`
select current_database() as integration_database, current_user as integration_user;
do $$
declare missing text[];
begin
  if current_database() !~ '^food_integration_[0-9]+$' or current_user <> 'postgres' then
    raise exception 'BOOTSTRAP_ISOLATION_FAILED: unexpected database or user';
  end if;
  select array_agg(required.name order by required.name) into missing
    from unnest(array['auth','storage','extensions','vault','public']) required(name)
    where not exists(select 1 from pg_namespace existing where existing.nspname=required.name);
  if missing is not null then raise exception 'BOOTSTRAP_SCHEMA_MISSING: %', missing; end if;
  -- The origin publication is empty, owned by postgres and not FOR ALL TABLES.
  -- Satisfy the baseline's ALTER PUBLICATION without subscribers or slots.
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
select nspname as provider_schema from pg_namespace
  where nspname in ('auth','storage','extensions','vault','public') order by nspname;
select pubname, pg_get_userbyid(pubowner) as owner, puballtables,
  pubinsert, pubupdate, pubdelete, pubtruncate
  from pg_publication where pubname='supabase_realtime';
`).stdout);
console.log("BOOTSTRAP_PRECHECK_PASS");
const migrations = readdirSync("supabase/migrations").filter(name => name.endsWith(".sql") && name < "20260920000000").sort();
for (const file of migrations) {
  console.log(`MIGRATION_START ${file}`);
  if (file === "20260917190000_pos_food_modifiers_v1.sql") {
    // Differential Retail oracle lives ONLY in this disposable database.
    sql(`create schema food_integration_test;
      create table food_integration_test.v4_source(source text not null);
      do $$ declare definition text; begin
        definition:=pg_get_functiondef('public.pos_complete_sale_v4(text,uuid,uuid,uuid,uuid,jsonb,jsonb,text,uuid,uuid,uuid,uuid)'::regprocedure);
        insert into food_integration_test.v4_source values(definition);
        if position('CREATE OR REPLACE FUNCTION public.pos_complete_sale_v4(' in definition)<>1 then raise exception 'RETAIL_ORACLE_HEADER_MISMATCH'; end if;
        execute replace(definition,'CREATE OR REPLACE FUNCTION public.pos_complete_sale_v4(', 'CREATE OR REPLACE FUNCTION food_integration_test.pos_complete_sale_v4_baseline(');
      end $$;`);
  }
  sql(readFileSync(path.join("supabase/migrations", file), "utf8"));
  console.log(`MIGRATION_PASS ${file}`);
}
const suite = readFileSync("supabase/tests/pos_food_operations_v1.sql", "utf8");
const result = sql(process.argv.includes("--persist") ? suite.replace(/rollback;\s*$/i, "commit;") : suite);
console.log(result.stderr);
console.log("SQL_SUITE_PASS");
const modifiers = sql(readFileSync("supabase/tests/pos_food_modifiers_v1.sql", "utf8"));
console.log(modifiers.stderr);
console.log("MODIFIERS_SQL_SUITE_PASS");
const splitPayments = sql(readFileSync("supabase/tests/pos_food_split_payments_v1.sql", "utf8"));
console.log(splitPayments.stderr);
console.log("SPLIT_PAYMENTS_SQL_SUITE_PASS");
const recipes = sql(readFileSync("supabase/tests/pos_food_inventory_recipes_v1.sql", "utf8"));
console.log(recipes.stderr);
console.log("INVENTORY_RECIPES_SQL_SUITE_PASS");
console.log(`Database retained locally: ${database}; fixtures ${process.argv.includes("--persist") ? "committed" : "rolled back"}.`);

}
const canonicalMigration = "supabase/migrations/20260922120000_pos_food_canonical_recipe_v2.sql";
if (!process.argv.includes("--suite-only")) {
  if (!existingDatabase) sql(readFileSync("supabase/tests/pos_food_canonical_legacy_v2.sql", "utf8"));
  sql(readFileSync(canonicalMigration, "utf8"));
}

console.log(process.argv.includes("--suite-only") ? "USING_EXISTING_CANONICAL_MIGRATION" : "CANONICAL_MIGRATION_PASS");
const canonical = sql(readFileSync("supabase/tests/pos_food_canonical_recipe_v2.sql", "utf8"));
console.log(canonical.stderr);
console.log("CANONICAL_POSTGRES_SUITE_PASS");

if (!process.argv.includes("--suite-only") || process.argv.includes("--verify-existing")) {
 console.log(sql(readFileSync("supabase/tests/pos_food_canonical_legacy_verify_v2.sql", "utf8")).stderr);
 for (const suite of ["operations", "modifiers", "split_payments"]) {
  console.log(sql(readFileSync(`supabase/tests/pos_food_${suite}_v1.sql`, "utf8")).stderr);
  console.log(`POST_MIGRATION_${suite}_PASS`);
 }
}

if (process.argv.includes("--service-modes")) {
 sql(readFileSync("supabase/migrations/20260922130000_pos_food_service_modes_v1.sql", "utf8"));
 console.log(sql(readFileSync("supabase/tests/pos_food_service_modes_v1.sql", "utf8")).stderr);
 console.log("SERVICE_MODES_POSTGRES_PASS");
}

if (process.argv.includes("--service-migrations")) {
 for (const file of ["supabase/migrations/20260922130000_pos_food_service_modes_v1.sql","supabase/migrations/20260922140000_pos_food_void_items_v1.sql"]) {
  console.log(sql(readFileSync(file,"utf8")).stderr);
  console.log(`MIGRATION_PASS ${file}`);
 }
}
