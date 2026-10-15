import fs from "node:fs";
import path from "node:path";

const migrationPath = "supabase/migrations/20260828234000_pos_canonical_catalog_data_v1.sql";
const source = fs.readFileSync(path.join(process.cwd(), migrationPath), "utf8");

const countTuples = (sectionStart, sectionEnd) => {
  const section = source.slice(source.indexOf(sectionStart), source.indexOf(sectionEnd));
  return (section.match(/^\s*\('/gm) || []).length;
};

const checks = [
  ["migration follows baseline", migrationPath.includes("20260828234000")],
  ["five canonical profiles", countTuples("INSERT INTO public.pos_profile_catalog", "INSERT INTO public.pos_capability_catalog") === 5],
  ["five required profile keys", ["unconfigured", "fashion", "retail", "restaurant", "coffee_shop"].every((code) => source.slice(source.indexOf("INSERT INTO public.pos_profile_catalog"), source.indexOf("INSERT INTO public.pos_capability_catalog")).includes(`('${code}'`))],
  ["exact canonical unconfigured profile", source.includes("('unconfigured', 'Sin configurar', 'El negocio todavía no ha elegido un perfil operativo.', 'settings', 'internal', 0)")],
  ["unconfigured has no capability defaults", !source.slice(source.indexOf("INSERT INTO public.pos_profile_capability_defaults"), source.indexOf("INSERT INTO public.pos_plans")).includes("'unconfigured'")],
  ["fourteen canonical capabilities", countTuples("INSERT INTO public.pos_capability_catalog", "INSERT INTO public.pos_profile_capability_defaults") === 14],
  ["twenty-two profile defaults", countTuples("INSERT INTO public.pos_profile_capability_defaults", "INSERT INTO public.pos_plans") === 22],
  ["two canonical plans", countTuples("INSERT INTO public.pos_plans", "INSERT INTO public.pos_plan_limits") === 2],
  ["two canonical plan limits", countTuples("INSERT INTO public.pos_plan_limits", "INSERT INTO public.pos_entitlements") === 2],
  ["ten canonical entitlements", countTuples("INSERT INTO public.pos_entitlements", "WITH canonical_relations") === 10],
  ["nineteen plan entitlement relations", countTuples("WITH canonical_relations", "INSERT INTO public.pos_plan_entitlements") === 19],
  ["catalog writes are idempotent", (source.match(/ON CONFLICT/g) || []).length === 7],
  ["no operational or personal tables", !/(auth\.users|public\.brands|pos_sales|pos_customers|pos_staff|email|phone|token)/i.test(source)],
  ["no destructive statements", !/\b(DELETE|TRUNCATE|DROP)\b/i.test(source)],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
console.log(JSON.stringify({ checksTotal: checks.length, checksPassed: checks.length - failed.length, failedCount: failed.length }));
if (failed.length) process.exitCode = 1;
