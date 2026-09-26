import fs from "node:fs";

const files = {
  route: "src/app/brand/[brandSlug]/comu/products/page.tsx",
  dashboard: "src/app/comu/seller/seller-dashboard.tsx",
  manager: "src/app/comu/seller/products-manager.tsx",
  catalog: "src/app/api/comu/catalog/route.ts",
};
const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const checks = [
  ["real route uses seller dashboard", text.route.includes('view="products"') && text.dashboard.includes("<ProductsManager")],
  ["catalog and published panels", text.manager.includes("Catálogo POS disponible") && text.manager.includes("Publicados en COMU")],
  ["KPIs and quick preview", text.manager.includes("Sincronizados") && text.manager.includes("Vista rápida en COMU")],
  ["search and filters", text.manager.includes("Buscar productos por nombre, SKU o categoría") && text.manager.includes("Sin publicar") && text.manager.includes("Sin stock")],
  ["publish and hide actions", text.manager.includes("onPublish") && text.manager.includes("onHide") && text.dashboard.includes("changeStatus")],
  ["canonical inventory data", text.catalog.includes("getAvailableQuantities") && text.catalog.includes("inventory")],
  ["no mojibake in product module", !text.manager.match(/Ã|Â|�/)],
];
for (const [label, pass] of checks) console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
if (checks.some(([, pass]) => !pass)) process.exit(1);
