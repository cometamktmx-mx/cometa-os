import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const files = {
  home: "src/app/brand/[brandSlug]/pos/page.tsx",
  creationApi: "src/app/api/onboarding/business/route.ts",
  bootstrapApi: "src/app/api/pos/bootstrap/route.ts",
  salesApi: "src/app/api/pos/sales/route.ts",
  cashApi: "src/app/api/pos/cash-sessions/route.ts",
  settings: "src/app/brand/[brandSlug]/pos/settings/page.tsx",
  onboarding: "src/app/brand/[brandSlug]/pos/onboarding/page.tsx",
  smoke: "docs/cometa-pos-first-run-smoke-test.md",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, exists(file) ? read(file) : ""])
);

const migrationsDir = path.join(root, "supabase/migrations");
const firstRunMigrations = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((name) => /first.run/i.test(name))
  : [];

const checks = [
  ["POS home exists", exists(files.home)],
  ["first-run success headline", /Tu negocio ya est/.test(source.home)],
  ["first-run derives completed sales", /status=completed&pageSize=1/.test(source.home) && /completedSales === 0/.test(source.home)],
  ["products use bootstrap count", /bootstrap\.counts\.products > 0/.test(source.home)],
  ["inventory uses positive-stock count", /bootstrap\.counts\.inventoryWithStock > 0/.test(source.home)],
  ["cash history uses canonical sessions", /cashSessions\.length > 0/.test(source.home)],
  ["open cash uses bootstrap sessions", /bootstrap\.openSessions\.length > 0/.test(source.home)],
  ["product CTA", /Agregar mi primer producto/.test(source.home) && /route: "products"/.test(source.home)],
  ["inventory CTA", /Registrar inventario/.test(source.home) && /route: "inventory"/.test(source.home)],
  ["cash CTA", /Abrir caja/.test(source.home) && /route: "cash"/.test(source.home)],
  ["first-sale CTA", /Hacer mi primera venta/.test(source.home) && /route: "register"/.test(source.home)],
  ["secondary POS action", />\s*Ir al POS\s*</.test(source.home)],
  ["real lifecycle days", /lifecycle\.trial\.daysRemaining/.test(source.home)],
  ["no localStorage gating", !/localStorage|sessionStorage/.test(source.home)],
  ["secondary failures do not invent progress", /FirstRunUnavailable/.test(source.home) && /completedSales === null \|\| cash === null/.test(source.home)],
  ["authorization failures stay explicit", /status === 401 \|\| response\?\.status === 403/.test(source.home)],
  ["self-service redirects to POS home", /destination: `\/brand\/\$\{brandSlug\}\/pos`/.test(source.creationApi) && !/destination: `\/brand\/\$\{brandSlug\}\/pos\/onboarding`/.test(source.creationApi)],
  ["advanced onboarding preserved", exists(files.onboarding)],
  ["settings still links profile onboarding", /\/pos\/onboarding/.test(source.settings)],
  ["bootstrap remains tenant guarded", /requirePosContext\(brandSlug\)/.test(source.bootstrapApi)],
  ["sales remains CORE-1 guarded", /requirePosOperationalAccess[\s\S]*pos\.sales/.test(source.salesApi)],
  ["cash remains CORE-1 guarded", /requirePosOperationalAccess[\s\S]*pos\.cash/.test(source.cashApi)],
  ["no first-run SQL migration", firstRunMigrations.length === 0],
  ["manual smoke test exists", exists(files.smoke)],
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
