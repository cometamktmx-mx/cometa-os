import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const files = [
  "supabase/migrations/20260920100000_comu_foundation_sellers.sql",
  "supabase/migrations/20260920101000_comu_storefronts.sql",
  "supabase/migrations/20260920102000_comu_catalog_listings.sql",
  "supabase/migrations/20260920103000_comu_product_media.sql",
  "supabase/migrations/20260920104000_comu_storage.sql",
  "src/lib/comu/features.ts",
  "src/lib/comu/seller-access.ts",
  "src/lib/comu/sellers.ts",
  "src/lib/comu/catalog.ts",
  "src/lib/comu/inventory.ts",
  "src/lib/comu/public-catalog.ts",
  "src/app/api/comu/sellers/route.ts",
  "src/app/api/comu/listings/route.ts",
  "src/app/api/comu/catalog/route.ts",
  "src/app/api/comu/media/route.ts",
  "src/app/api/comu/storefronts/route.ts",
  "src/app/comu/page.tsx",
  "src/app/comu/products/[slug]/page.tsx",
  "src/app/comu/sellers/[slug]/page.tsx",
  "src/app/comu/seller/page.tsx",
  "src/app/brand/admin/comu/page.tsx",
];

for (const file of files) await access(new URL(file, root));
const sql = await readFile(new URL(files[0], root), "utf8");
const listings = await readFile(new URL(files[2], root), "utf8");
const catalog = await readFile(new URL("src/lib/comu/public-catalog.ts", root), "utf8");
const routes = await readFile(new URL("src/app/api/comu/sellers/route.ts", root), "utf8");
const checks = [
  ["seller belongs to brand", sql.includes("brand_id text not null")],
  ["membership RLS", sql.includes("comu_seller_memberships_member_select")],
  ["public seller isolation", sql.includes("status = 'ACTIVE' and verification_status = 'VERIFIED'")],
  ["listing references POS product", listings.includes("product_id uuid not null")],
  ["variant listing references POS variant", listings.includes("variant_id uuid not null")],
  ["catalog reads POS products", catalog.includes('from("pos_products")')],
  ["catalog reads POS inventory", catalog.includes("getAvailability")],
  ["activation minimum", routes.includes("canActivateComuSeller")],
  ["no checkout in foundation", !files.some((file) => file.includes("checkout"))],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
console.log(`COMU Foundation V1: ${checks.length}/${checks.length} PASS`);
