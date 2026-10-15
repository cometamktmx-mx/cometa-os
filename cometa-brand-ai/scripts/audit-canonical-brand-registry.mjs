import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  migration: "supabase/migrations/20260814_entry_v1a_canonical_brand_registry.sql",
  resolver: "src/lib/brand-resolver.ts",
  workspace: "src/app/api/workspace-brands/route.ts",
  posServer: "src/lib/pos/server.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, read(file)])
);

const resolverOrder = ["brands", "clients", "brand_analysis", "cosmos_memory"]
  .map((table) => source.resolver.indexOf(`table: "${table}"`));

const checks = [
  ["canonical brands table is created", /CREATE TABLE public\.brands/.test(source.migration)],
  ["registry slug is globally unique", /CONSTRAINT brands_slug_key UNIQUE \(slug\)/.test(source.migration)],
  ["registry RLS is enabled", /ALTER TABLE public\.brands ENABLE ROW LEVEL SECURITY/.test(source.migration)],
  ["browser writes are denied", /REVOKE INSERT, UPDATE, DELETE[\s\S]*FROM authenticated/.test(source.migration)],
  ["membership-scoped SELECT exists", /brands_select_by_active_membership[\s\S]*user_brand_access[\s\S]*auth\.uid\(\)/.test(source.migration)],
  ["access memberships are backfilled", /FROM public\.user_brand_access/.test(source.migration)],
  ["analysis is only a backfill source", /FROM public\.brand_analysis/.test(source.migration)],
  ["memory is only a backfill source", /FROM public\.cosmos_memory/.test(source.migration)],
  ["legacy tables are not dropped", !/DROP TABLE[\s\S]*(clients|brand_analysis|cosmos_memory|user_brand_access)/i.test(source.migration)],
  ["resolver uses registry first", resolverOrder.every((position) => position >= 0) && resolverOrder.every((position, index) => index === 0 || position > resolverOrder[index - 1])],
  ["resolver retains clients fallback", /table: "clients"/.test(source.resolver)],
  ["resolver retains analysis fallback", /table: "brand_analysis"/.test(source.resolver)],
  ["resolver retains memory fallback", /table: "cosmos_memory"/.test(source.resolver)],
  ["workspace reads registry", /safeSelect\("brands"\)/.test(source.workspace)],
  ["workspace retains membership filtering", /allowedBrandSlugs\.includes\(brand\.slug\)/.test(source.workspace)],
  ["workspace prioritizes registry", /sourceTable === "brands"\) return 4/.test(source.workspace)],
  ["POS context still uses canonical resolver", /resolveBrandFromSupabase/.test(source.posServer)],
  ["no self-service writer introduced", !/CREATE (?:OR REPLACE )?FUNCTION public\.pos_create_self_service_business/.test(source.migration)],
  ["no auth implementation introduced", !/(signUp|resetPassword|auth\/callback)/.test(source.migration + source.resolver + source.workspace)],
];

const failed = checks.filter(([, passed]) => !passed);

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
}

console.log(JSON.stringify({
  checks_total: checks.length,
  checks_passed: checks.length - failed.length,
  failed_count: failed.length,
  all_checks_passed: failed.length === 0,
}));

if (failed.length) process.exitCode = 1;

