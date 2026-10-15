import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  ui: "src/app/brand/[brandSlug]/pos/inventory/page.tsx",
  api: "src/app/api/pos/inventory-receiving/route.ts",
  migration: "supabase/migrations/20260814_pos_v2c1_inventory_receipt_idempotency.sql",
};

const source = Object.fromEntries(
  Object.entries(files).map(([name, file]) => [name, read(file)])
);

const checks = [
  ["UI generates UUID", /crypto\.randomUUID\(\)/.test(source.ui)],
  ["UI keeps operation key in ref", /receiptIdempotencyKeyRef/.test(source.ui)],
  ["UI sends idempotency key", /idempotencyKey:\s*receiptIdempotencyKey/.test(source.ui)],
  ["UI clears key only after success", /setQueue\(\[\]\);[\s\S]{0,100}receiptIdempotencyKeyRef\.current\s*=\s*null/.test(source.ui)],
  ["API requires operation key", /POS_INVENTORY_IDEMPOTENCY_KEY_REQUIRED/.test(source.api)],
  ["API validates UUID", /uuidValue\([\s\S]{0,100}idempotencyKey/.test(source.api)],
  ["API reports invalid UUID", /POS_INVENTORY_IDEMPOTENCY_KEY_INVALID/.test(source.api)],
  ["API reports payload conflict", /POS_INVENTORY_IDEMPOTENCY_CONFLICT/.test(source.api)],
  ["API calls receipt v2", /pos_complete_inventory_receipt_v2/.test(source.api)],
  ["API forwards RPC key", /p_idempotency_key:\s*idempotencyKey/.test(source.api)],
  ["No supplier reference fallback", !/idempotencyKey\s*[:=][^\n]*supplierReference/.test(source.api + source.ui)],
  ["CORE-1 inventory guard remains", /requirePosOperationalAccess\(\{\s*brandSlug,\s*entitlement:\s*"pos\.inventory"\s*\}\)/.test(source.api)],
  ["Header receives idempotency columns", /ALTER TABLE public\.pos_inventory_receipts/.test(source.migration)],
  ["Tenant partial unique index exists", /UNIQUE INDEX[\s\S]*\(brand_slug, idempotency_key\)[\s\S]*WHERE idempotency_key IS NOT NULL/.test(source.migration)],
  ["RPC v1 remains canonical core", /v_result := public\.pos_complete_inventory_receipt_v1/.test(source.migration)],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
}
console.log(JSON.stringify({ total: checks.length, passed: checks.length - failed.length, failed: failed.length, allChecksPassed: failed.length === 0 }));
if (failed.length) process.exitCode = 1;
