import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile("src/app/api/comu/product-channel/route.ts", "utf8");
const ui = await readFile("src/app/brand/[brandSlug]/pos/products/comu-channel-status.tsx", "utf8");
for (const value of ["requireBrandAccess", "COMU_PRODUCT_BRAND_MISMATCH", "createListing", "PUBLISHED", "HIDDEN", "pos_inventory"]) assert.ok(route.includes(value), `route contract missing ${value}`);
for (const value of ["Canales de venta", "Publicar en COMU", "Despublicar de COMU", "quantity", "reserved_quantity", "available_quantity"]) assert.ok(ui.includes(value), `UI contract missing ${value}`);
assert.equal(route.includes("delete"), false, "channel actions must not delete POS or COMU records");
console.log("COMU POS PRODUCT CHANNEL CONTRACT PASS");
