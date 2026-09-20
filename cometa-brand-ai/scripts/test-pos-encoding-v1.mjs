import fs from "node:fs";

const files = [
  "src/app/brand/[brandSlug]/components/pos-food-operations.tsx",
  "src/app/brand/[brandSlug]/components/pos-food-modifiers.tsx",
  "src/app/brand/[brandSlug]/components/pos-food-access.tsx",
  "src/app/brand/[brandSlug]/components/pos-food-receipt.tsx",
  "src/app/brand/[brandSlug]/components/pos-topbar.tsx",
  "src/app/brand/[brandSlug]/components/pos-sidebar.tsx",
  "src/app/brand/[brandSlug]/pos/admin/page.tsx",
  "src/app/brand/[brandSlug]/pos/loyalty/page.tsx",
];
const forbidden = /\\u00(?:[0-9a-fA-F]{2})|Ã|Â|â/;
const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  if (forbidden.test(source)) failures.push(file);
}
if (failures.length) {
  console.error(`Encoding regression in: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`POS encoding scan passed (${files.length} files).`);
