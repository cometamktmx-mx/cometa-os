import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  route: await readFile("src/app/brand/[brandSlug]/comu/wholesale/page.tsx", "utf8"),
  dashboard: await readFile("src/app/comu/seller/seller-dashboard.tsx", "utf8"),
  manager: await readFile("src/app/comu/seller/wholesale-manager.tsx", "utf8"),
  policyApi: await readFile("src/app/api/comu/wholesale/route.ts", "utf8"),
  productApi: await readFile("src/app/api/comu/wholesale/product/route.ts", "utf8")
};
function check(name, condition) { assert.ok(condition, name); console.log(`PASS ${name}`); }

check("real wholesale route delegates SellerDashboard", files.route.includes('view="wholesale"'));
check("SellerDashboard connects WholesaleManager", files.dashboard.includes("<WholesaleManager"));
check("required wholesale copy is rendered", ["Mayoreo", "Configuración por producto", "Reglas generales de mayoreo", "Cantidad mínima general", "Vista previa de descuento"].every((value) => files.manager.includes(value)));
check("general policy uses canonical endpoint", files.manager.includes("/api/comu/wholesale") && files.manager.includes("Guardar reglas generales"));
check("product overrides use canonical endpoint", files.manager.includes("/api/comu/wholesale/product") && files.manager.includes("Regla personalizada"));
check("tiers support canonical pricing modes", ["UNIT_PRICE", "AMOUNT_OFF", "PERCENT_OFF"].every((value) => files.manager.includes(value)));
check("corrida and revuelto presentation exists", files.manager.includes("Activar corrida") && files.manager.includes("Revuelto disponible"));
check("search and filters are wired", files.manager.includes("Buscar productos por nombre, SKU o categoría") && files.manager.includes("Con mayoreo") && files.manager.includes("Con corrida"));
check("empty state links to products", files.manager.includes("Ir a productos") && files.manager.includes("Aún no tienes productos disponibles para configurar"));
check("authorization contracts remain server-side", files.policyApi.includes("requireSellerAccess") && files.productApi.includes("requireSellerAccess"));
check("no mojibake in new UI", !/[ÃÂ�]/.test(files.manager));
