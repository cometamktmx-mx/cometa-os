import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  api: "src/app/api/comu/onboarding/route.ts",
  domain: "src/lib/comu/onboarding.ts",
  page: "src/app/brand/[brandSlug]/comu/onboarding/page.tsx",
  ui: "src/app/brand/[brandSlug]/comu/onboarding/onboarding-client.tsx",
  commandCenter: "src/app/brand/[brandSlug]/components/brand-command-center.tsx",
  brandPage: "src/app/brand/[brandSlug]/page.tsx",
};

const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")] )));
const includes = (key, value) => assert.ok(source[key].includes(value), `${key} must include ${value}`);

assert.equal(source.api.includes("export async function GET"), true);
assert.equal(source.api.includes("export async function POST"), true);
for (const table of ["comu_sellers", "comu_storefronts", "comu_product_listings", "pos_products", "comu_shipping_product_profiles", "comu_shipping_policies"]) includes("domain", table);
for (const guard of ["requireBrandAccess", "COMU_ACTIVATION_ACCESS_DENIED", "brand_id", "brand_slug"]) includes("domain", guard);
for (const invariant of ["createListing", "pos_products", "selectedProductIds", "publish", "upsert", "COMU_SLUG_TAKEN"]) includes("domain", invariant);
for (const label of ["Tienda", "Productos", "Ventas", "Publicar", "Guardar"]) includes("ui", label);
assert.equal(source.domain.includes("comu_inventory"), false, "onboarding must not create a second inventory model");
assert.equal(source.domain.includes("pos_inventory"), false, "onboarding must not write physical inventory");
const commandCenter = source.commandCenter;
const brandPage = source.brandPage;
assert.match(brandPage, /"available" \| "incomplete" \| "active" \| "hidden"/);
assert.match(brandPage, /\["enabled", "catalog", "sellerOnboarding"\]/);
assert.match(brandPage, /seller\?\.status === "ACTIVE" \? "active" : seller \? "incomplete" : "available"/);
assert.match(commandCenter, /COMU disponible/);
assert.match(commandCenter, /Configuración pendiente/);
assert.match(commandCenter, /Continuar configuración/);
assert.match(commandCenter, /Activar COMU/);
assert.match(commandCenter, /comu\/onboarding/);
console.log("nash mood equivalent POS active + COMU inactive CTA PASS");
console.log("COMU POS TO SELLER ONBOARDING CONTRACT PASS");


