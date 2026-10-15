import fs from "node:fs";

const files = {
  migration: "supabase/migrations/20260819_pos_product_code_sku_barcode_v2.sql",
  api: "src/app/api/pos/products/route.ts",
  editor: "src/app/brand/[brandSlug]/pos/products/page.tsx",
  register: "src/app/brand/[brandSlug]/pos/register/page.tsx",
  docs: "docs/cometa-pos-product-code-sku-barcode-v2.md",
};

const source = Object.fromEntries(
  Object.entries(files).map(([name, file]) => [name, fs.readFileSync(file, "utf8")])
);

const checks = [
  ["migration adds nullable product_code", /ADD COLUMN IF NOT EXISTS product_code text NULL/i.test(source.migration)],
  ["product code has brand-scoped unique index", /pos_products_brand_product_code_uidx/.test(source.migration)],
  ["duplicate product code has stable API code", /POS_PRODUCT_CODE_DUPLICATED/.test(source.api)],
  ["suggestion is server-side", /suggest_product_code/.test(source.api) && /suggestProductCode/.test(source.editor)],
  ["SKU generation preserves existing values", /Generar SKU faltantes/.test(source.editor) && /if \(variant\.sku\.trim\(\)\) return variant/.test(source.editor)],
  ["SKU tokens use attribute ordering", /sort_order/.test(source.editor) && /createAttributeTokenMap/.test(source.editor)],
  ["barcode generation is optional", /generate_barcodes/.test(source.api) && /Generar cÃ³digos faltantes|Generar c.*digos faltantes/.test(source.editor)],
  ["internal barcode is server-side EAN-13", /ean13CheckDigit/.test(source.api) && /randomInt/.test(source.api)],
  ["manual barcode is preserved", /variant\.barcode\.trim\(\) \|\| !generated\.has\(index\)/.test(source.editor)],
  ["register searches product code", /productCode/.test(source.register)],
  ["sales contract remains variantId", !/product_code.*sale|sale.*product_code/i.test(source.register)],
  ["documentation disclaims GTIN authority", /no sustituye un GTIN oficial/i.test(source.docs)],
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed += 1;
}

console.log(JSON.stringify({ checks: checks.length, failed, passed: failed === 0 }));
if (failed) process.exitCode = 1;
