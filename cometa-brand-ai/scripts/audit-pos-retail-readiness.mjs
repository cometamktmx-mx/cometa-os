import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const files = {
  register: "src/app/brand/[brandSlug]/pos/register/page.tsx",
  customersPage: "src/app/brand/[brandSlug]/pos/customers/page.tsx",
  productsPage: "src/app/brand/[brandSlug]/pos/products/page.tsx",
  inventoryPage: "src/app/brand/[brandSlug]/pos/inventory/page.tsx",
  salesPage: "src/app/brand/[brandSlug]/pos/sales/page.tsx",
  customersApi: "src/app/api/pos/customers/route.ts",
  salesApi: "src/app/api/pos/sales/route.ts",
  inventoryApi: "src/app/api/pos/inventory-receiving/route.ts",
  image: "src/app/brand/[brandSlug]/components/pos-product-image.tsx",
  smoke: "docs/cometa-pos-retail-pilot-smoke-test.md",
};

const source = Object.fromEntries(
  Object.entries(files).filter(([, file]) => exists(file)).map(([key, file]) => [key, read(file)])
);

const checks = [
  ["critical retail files exist", Object.values(files).every(exists)],
  ["sales API CORE-1 guard", /requirePosOperationalAccess\(\{\s*brandSlug,\s*entitlement:\s*"pos\.sales"\s*\}\)/.test(source.salesApi || "")],
  ["customers API CORE-1 guard", /entitlement:\s*"pos\.customers"/.test(source.customersApi || "")],
  ["inventory API CORE-1 guard", /entitlement:\s*"pos\.inventory"/.test(source.inventoryApi || "")],
  ["V2C.1 API marker", /pos_complete_inventory_receipt_v2/.test(source.inventoryApi || "")],
  ["V2C.1 UI stable key", /receiptIdempotencyKeyRef[\s\S]*crypto\.randomUUID/.test(source.inventoryPage || "")],
  ["quick customer POST", /createQuickCustomer[\s\S]*method:\s*"POST"/.test(source.register || "")],
  ["quick customer auto selection", /setSelectedCustomerId\(createdCustomer\.id\)/.test(source.register || "")],
  ["quick customer loading guard", /isCreatingCustomer/.test(source.register || "")],
  ["customer PATCH exists", /export async function PATCH/.test(source.customersApi || "")],
  ["customer PATCH tenant scoped", /\.eq\("brand_slug", brand\.slug\)[\s\S]*\.eq\("id", customerId\)/.test(source.customersApi || "")],
  ["customer history server filter", /status=completed&pageSize=100/.test(source.customersPage || "") && /query\s*=\s*query\.eq\("customer_id", customerId\)/.test(source.salesApi || "")],
  ["receipt CTA uses exact sale id", /Imprimir ticket/.test(source.register || "") && /saleId=/.test(source.register || "")],
  ["sales opens exact receipt", /requestedSaleId/.test(source.salesPage || "") && /window\.print\(\)/.test(source.salesPage || "")],
  ["shared image fallback handles errors", /onError=\{\(\) => setFailed\(true\)\}/.test(source.image || "")],
  ["register uses image fallback", /PosProductImage/.test(source.register || "")],
  ["products use image fallback", /PosProductImage/.test(source.productsPage || "")],
  ["inventory uses image fallback", /PosProductImage/.test(source.inventoryPage || "")],
  ["sale double-submit guard", /isCharging/.test(source.register || "") && /checkoutIdempotencyKeyRef/.test(source.register || "")],
  ["inventory double-submit guard", /isCompletingReceipt/.test(source.inventoryPage || "")],
  ["scanner focus recovery", /scannerRef\.current\?\.focus\(\)/.test(source.register || "")],
  ["smoke covers locked state", /suspended[\s\S]*403/i.test(source.smoke || "")],
  ["smoke covers brand switch", /Cambiar a otra marca/.test(source.smoke || "")],
  ["no critical placeholder module", !/PosModulePlaceholder/.test([source.register, source.customersPage, source.productsPage, source.inventoryPage, source.salesPage].join("\n"))],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);

const report = {
  p0_unresolved: failed.filter(([name]) => /CORE-1|V2C\.1|critical retail files/.test(name)).length,
  p1_unresolved: failed.filter(([name]) => !/CORE-1|V2C\.1|critical retail files/.test(name)).length,
  checks_passed: checks.length - failed.length,
  checks_total: checks.length,
  p2_notes: ["manual_cash_movements_post_pilot", "split_payment_ui_post_pilot", "rapid_scanner_hardware_smoke"],
};

console.log(JSON.stringify(report));
if (failed.length) process.exitCode = 1;
