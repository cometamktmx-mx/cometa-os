import { readFile } from "node:fs/promises";

const dashboard = await readFile(new URL("../src/app/comu/seller/seller-dashboard.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../src/app/brand/[brandSlug]/comu/settings/page.tsx", import.meta.url), "utf8");

const required = [
  "Salud de la tienda",
  "Conexiones",
  "Verificación COMU",
  "Pagos y depósitos",
  "Acciones rápidas",
  "Tu tienda está lista",
  "/api/comu/shipping/policy",
  "/api/comu/wholesale",
  "/api/comu/storefronts",
  "const base = `/brand/${encodeURIComponent(brandSlug)}/comu`",
  "`${base}/store`",
  "`${base}/products`",
  "const publicHref = `/comu/sellers/${encodeURIComponent(seller.slug)}`",
];
for (const text of required) {
  if (!dashboard.includes(text)) throw new Error(`Falta contrato de Settings: ${text}`);
}
for (const text of ["view=\"settings\"", "brandSlug"]) {
  if (!route.includes(text)) throw new Error(`La ruta Settings no conserva ${text}`);
}
for (const forbidden of ["Configura tu tienda antes de elegir", "Verificarme", "Stripe Connect", "comu_seller_documents"]) {
  if (dashboard.includes(forbidden)) throw new Error(`Contenido no permitido en Settings: ${forbidden}`);
}
if (!dashboard.includes("xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]")) throw new Error("Falta layout responsive de dos columnas");
if (!dashboard.includes("UNVERIFIED") && !dashboard.includes('return "Sin verificar"')) throw new Error("Falta mapping de verificación");
console.log("COMU Settings UI local contract: PASS");
