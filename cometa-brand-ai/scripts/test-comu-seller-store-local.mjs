import fs from "node:fs";

const files = {
  route: "src/app/brand/[brandSlug]/comu/store/page.tsx",
  dashboard: "src/app/comu/seller/seller-dashboard.tsx",
  editor: "src/app/comu/seller/storefront-editor.tsx",
  api: "src/app/api/comu/storefronts/route.ts",
};
const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const checks = [
  ["real store route delegates shared dashboard", text.route.includes('view="store"')],
  ["store editor is connected", text.dashboard.includes("<StorefrontEditor sellerId={sellerId} brandSlug={brandSlug}")],
  ["persisted form fields", ["Nombre público", "Frase corta", "Descripción", "WhatsApp público", "Ciudad", "Dirección"].every((value) => text.editor.includes(value))],
  ["reactive preview", text.editor.includes("Vista previa") && text.editor.includes("{name ||")],
  ["public and quick actions", ["Ver tienda pública", "Ir a productos", "Configurar envíos"].every((value) => text.editor.includes(value))],
  ["identity visual surface", text.editor.includes("Identidad visual")],
  ["unsupported persistence is explicit", text.editor.includes("disponible próximamente")],
  ["asset values preserved on save", text.api.includes("current?.logo_url") && text.api.includes("current?.cover_url")],
  ["required route copy", ["Así te ven tus compradores", "Información pública", "Acciones rápidas", "Guardar cambios"].every((value) => text.editor.includes(value))],
  ["no mojibake in touched store files", !Object.values(text).some((value) => /Ã|Â|�/.test(value))],
];
for (const [label, pass] of checks) console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
if (checks.some(([, pass]) => !pass)) process.exit(1);
