import fs from "node:fs";

const files = {
  migration: "supabase/migrations/20260820_pos_reports_operational_v1a.sql",
  postflight: "supabase/tests/pos_reports_operational_v1a_postflight.sql",
  suite: "supabase/tests/pos_reports_operational_v1a_suite.sql",
  api: "src/app/api/pos/reports/route.ts",
  page: "src/app/brand/[brandSlug]/pos/reports/page.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const checks = [
  ["migration defines versioned operational products RPC", /pos_get_operational_report_products_v1/.test(source.migration)],
  ["RPC uses completed sales only", /s\.status\s*=\s*'completed'/.test(source.migration)],
  ["RPC uses sale item cost snapshot", /i\.unit_cost\s*\*\s*i\.quantity/.test(source.migration)],
  ["RPC groups by product_id and nests variants", /GROUP BY vr\.product_id/.test(source.migration) && /'variants'/.test(source.migration)],
  ["RPC reads current stock from pos_inventory", /public\.pos_inventory/.test(source.migration)],
  ["RPC marks current metadata limitations", /productCodeIsCurrentMetadata/.test(source.migration) && /attributesAreCurrent/.test(source.migration)],
  ["API keeps operational access guard", /requirePosOperationalAccess/.test(source.api)],
  ["API exposes operational products view", /operational_products/.test(source.api)],
  ["page includes required report tabs", /Resumen/.test(source.page) && /Productos/.test(source.page) && /Pagos/.test(source.page) && /Inventario/.test(source.page)],
  ["page includes professional period filters", /Ayer/.test(source.page) && /Mes anterior/.test(source.page) && /Rango personalizado/.test(source.page)],
  ["page renders payment and inventory detail", /PaymentsTable/.test(source.page) && /InventoryTable/.test(source.page)],
  ["no export implementation added in V1A", !/csv|xlsx|pdf|exportaci[oó]n/i.test(source.api + source.page)],
  ["SQL tests preserve transaction rollback", /BEGIN;/.test(source.suite) && /ROLLBACK;/.test(source.suite)],
];
let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed += 1;
}
console.log(JSON.stringify({ checks: checks.length, failed, passed: failed === 0 }));
process.exitCode = failed ? 1 : 0;
