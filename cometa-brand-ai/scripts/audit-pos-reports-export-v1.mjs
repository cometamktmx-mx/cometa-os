import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20260822_pos_reports_export_v1b.sql");
const exportRoute = read("src/app/api/pos/reports/export/route.ts");
const printPage = read("src/app/brand/[brandSlug]/pos/reports/print/page.tsx");
const reportsPage = read("src/app/brand/[brandSlug]/pos/reports/page.tsx");
const checks = [];
const check = (name, fn) => {
  try { fn(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, detail: error instanceof Error ? error.message : String(error) }); }
};

check("export migration defines products and inventory RPCs", () => {
  assert.match(migration, /pos_get_reports_export_products_v1/);
  assert.match(migration, /pos_get_reports_export_inventory_v1/);
});
check("export RPCs are completed-only and scoped", () => {
  assert.match(migration, /s\.status = 'completed'/g);
  assert.match(migration, /p_brand_slug/);
  assert.match(migration, /p_location_id/);
});
check("export RPCs preserve historical COGS and current stock authorities", () => {
  assert.match(migration, /i\.unit_cost \* i\.quantity/);
  assert.match(migration, /public\.pos_inventory/);
});
check("export migration has no visual row limit", () => {
  assert.doesNotMatch(migration, /LIMIT\s+p_/i);
});
check("CSV route uses reports operational access", () => {
  assert.match(exportRoute, /requirePosOperationalAccess/);
  assert.match(exportRoute, /entitlement: "pos\.reports"/);
});
check("CSV route has strict export types and resolved date filters", () => {
  assert.match(exportRoute, /products.*payments.*inventory/);
  assert.match(exportRoute, /dateFrom/);
  assert.match(exportRoute, /dateTo/);
  assert.match(exportRoute, /locationId/);
});
check("CSV route emits Excel-compatible escaped UTF-8 CSV", () => {
  assert.ok(exportRoute.includes("\\uFEFF"));
  assert.match(exportRoute, /escapeCsv/);
  assert.match(exportRoute, /Content-Disposition/);
});
check("print page uses the central document profile helper", () => {
  assert.match(printPage, /getBusinessDocumentProfile/);
  assert.doesNotMatch(printPage, /from\("pos_branding"\)/);
});
check("print page reuses exact date/location query values", () => {
  assert.match(printPage, /query\.dateFrom/);
  assert.match(printPage, /query\.dateTo/);
  assert.match(printPage, /query\.locationId/);
  assert.doesNotMatch(printPage, /today|previousMonth|customFrom/);
});
check("print page hides controls and is print optimized", () => {
  assert.match(printPage, /window\.print/);
  assert.match(printPage, /@media print/);
  assert.match(printPage, /@page/);
  assert.match(printPage, /print-toolbar.*display:none/);
});
check("Reports page exposes the four export actions", () => {
  for (const label of ["PDF Ejecutivo", "CSV Productos", "CSV Pagos", "CSV Inventario"]) assert.match(reportsPage, new RegExp(label));
  assert.match(reportsPage, /dateFrom: range\.from\.toISOString\(\)/);
  assert.match(reportsPage, /dateTo: range\.to\.toISOString\(\)/);
});

const failed = checks.filter((checkResult) => !checkResult.passed);
console.table(checks);
console.log(JSON.stringify({ checks: checks.length, failed: failed.length, passed: failed.length === 0 }));
if (failed.length) process.exitCode = 1;
