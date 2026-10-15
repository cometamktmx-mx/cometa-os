import fs from "node:fs";

const files = {
  route: "src/app/brand/[brandSlug]/comu/store/page.tsx",
  dashboard: "src/app/comu/seller/seller-dashboard.tsx",
  editor: "src/app/comu/seller/storefront-editor.tsx",
  api: "src/app/api/comu/storefronts/route.ts",
  assets: "src/app/api/comu/storefronts/assets/route.ts",
  catalog: "src/lib/comu/public-catalog.ts",
  publicSeller: "src/app/comu/sellers/[slug]/page.tsx",
};
const text = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const checks = [
  ["real store route delegates shared dashboard", text.route.includes('view="store"')],
  ["store editor is connected", text.dashboard.includes("<StorefrontEditor sellerId={sellerId} brandSlug={brandSlug}")],
  ["persisted form fields", ["Nombre público", "Frase corta", "Descripción", "WhatsApp público", "Ciudad", "Dirección"].every((value) => text.editor.includes(value))],
  ["reactive preview", text.editor.includes("Vista previa") && text.editor.includes("{name ||")],
  ["public and quick actions", ["Ver tienda pública", "Ir a productos", "Configurar envíos"].every((value) => text.editor.includes(value))],
  ["identity visual surface", text.editor.includes("Identidad visual")],
  ["asset upload endpoint connected", text.editor.includes("/api/comu/storefronts/assets") && text.assets.includes("export async function POST")],
  ["theme persistence connected", text.editor.includes("theme: { accentColor }") && text.api.includes("accentColor")],
  ["public identity connected", text.catalog.includes("logo_url,cover_url,theme_config") && text.publicSeller.includes("const accent")],
  ["public identity presentation", text.publicSeller.includes("object-cover") && text.publicSeller.includes("safeAccent") && text.publicSeller.includes("contrastText")],
  ["public storefront polish", text.publicSeller.includes("object-contain") && text.publicSeller.includes("aspect-[16/7]") && text.publicSeller.includes("pieceLabel")],
  ["public contact fallbacks", text.publicSeller.includes("mapQuery") && text.publicSeller.includes("theme.showLocation === false")],
  ["asset values preserved on save", text.api.includes("current?.logo_url") && text.api.includes("current?.cover_url")],
  ["required route copy", ["Así te ven tus compradores", "Información pública", "Acciones rápidas", "Guardar cambios"].every((value) => text.editor.includes(value))],
  ["no mojibake in touched store files", !Object.values(text).some((value) => /Ã|Â|�/.test(value))],
];
for (const [label, pass] of checks) console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
if (checks.some(([, pass]) => !pass)) process.exit(1);
