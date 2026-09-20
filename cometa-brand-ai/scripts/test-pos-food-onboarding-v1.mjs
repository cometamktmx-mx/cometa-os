import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const page = read("src/app/onboarding/business/page.tsx");
const client = read("src/app/onboarding/business/business-onboarding-client.tsx");
const api = read("src/app/api/onboarding/business/route.ts");
const feature = read("src/lib/pos/features.ts");
const migration = read("supabase/migrations/20260904120000_pos_food_self_service_onboarding_v1.sql");
const staff = read("src/lib/pos/staff-shared.ts");

const checks = [
  ["feature flag is server-only", feature.includes('import "server-only"')],
  ["feature flag requires exact true", /ENABLE_POS_FOOD_ONBOARDING === "true"/.test(feature)],
  ["server page resolves feature flag", /isPosFoodOnboardingEnabled\(\)/.test(page)],
  ["client receives boolean, not environment", /posFoodOnboardingEnabled: boolean/.test(client) && !/process\.env/.test(client)],
  ["restaurant option uses canonical key", /code: "restaurant"[\s\S]*title: "Restaurante"/.test(client)],
  ["cafe option uses canonical key", /code: "coffee_shop"[\s\S]*title: "Cafetería"/.test(client)],
  ["food choices disabled when flag is false", /posFoodOnboardingEnabled[\s\S]*DisabledChoice/.test(client)],
  ["API checks same server feature flag", /isPosFoodOnboardingEnabled\(\)/.test(api)],
  ["API food allowlist is explicit", /new Set\(\["restaurant", "coffee_shop"\]\)/.test(api)],
  ["API never accepts browser feature override", !/BusinessCreationBody[\s\S]{0,240}(feature|enablePosFood)/i.test(api)],
  ["API preserves canonical RPC", /pos_create_self_service_business_v1/.test(api)],
  ["API preserves POS destination", /destination: `\/brand\/\$\{brandSlug\}\/pos`/.test(api)],
  ["API returns resolved mode", /posMode: resolvePosMode/.test(api)],
  ["mode maps restaurant", /profileCode === "restaurant"\) return "RESTAURANT"/.test(staff)],
  ["mode maps coffee shop", /profileCode === "coffee_shop"\) return "CAFE"/.test(staff)],
  ["RPC signature is unchanged", /pos_create_self_service_business_v1\(text,text,uuid,uuid\)/.test(migration)],
  ["RPC allowlist extends all four profiles", migration.includes("NOT IN (''fashion'', ''retail'', ''restaurant'', ''coffee_shop'')")],
  ["migration fails if canonical profiles are absent", /POS_FOOD_PROFILE_CATALOG_MISSING/.test(migration)],
  ["food profiles become configurable", /launch_status = 'live'/.test(migration)],
  ["RPC remains browser denied", /FROM PUBLIC, anon, authenticated/.test(migration)],
  ["RPC remains service-role only", /TO service_role/.test(migration)],
  ["no restaurant feature implementation", !/(TABLE_OPEN|ORDER_SEND|KDS|recipe|allerg)/i.test(client + api)],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
console.log(JSON.stringify({ checksTotal: checks.length, checksPassed: checks.length - failed.length, failedCount: failed.length }));
if (failed.length) process.exitCode = 1;
