import fs from "node:fs";

const files = {
  route: "src/app/brand/[brandSlug]/comu/orders/page.tsx",
  page: "src/app/comu/seller/orders/page.tsx",
  source: "src/lib/comu/fulfillment.ts",
  directQuote: "src/app/comu/seller/direct-quote.tsx",
};
const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const checks = [
  ["real route delegates brand context", text.route.includes("<SellerOrders brandSlug={brandSlug} />")],
  ["canonical seller orders source", text.source.includes("getSellerFulfillmentOrders")],
  ["seller orders page", text.page.includes("Gestión de pedidos")],
  ["required hero and KPI copy", ["Pedidos nuevos", "Por preparar", "En tránsito", "Entregados"].every((value) => text.page.includes(value))],
  ["priority and detail panels", text.page.includes("Prioridad de hoy") && text.page.includes("Detalle rápido")],
  ["premium empty state", text.page.includes("Aún no tienes pedidos")],
  ["status presentation", text.page.includes("statusMeta") && text.page.includes("Preparando")],
  ["search and filters", text.page.includes("Buscar por folio") && text.page.includes("filterLabel")],
  ["no mojibake in touched orders surfaces", !Object.values(text).some((value) => /Ã|Â|�/.test(value))],
];
const failed = checks.filter(([, pass]) => !pass);
for (const [label, pass] of checks) console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);
