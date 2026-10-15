import fs from "node:fs";
const read = (file) => fs.readFileSync(file, "utf8");
const migration = read("supabase/migrations/20260919140000_pos_branding_theme_mode_v1.sql");
const tokens = read("src/app/brand/[brandSlug]/components/pos-ui/pos-tokens.css");
const shell = read("src/app/brand/[brandSlug]/components/pos-shell.tsx");
const food = read("src/app/brand/[brandSlug]/components/pos-food-receipt.tsx");
const settings = read("src/app/brand/[brandSlug]/pos/settings/personalization/page.tsx");
for (const value of ["theme_mode", "default 'dark'", "'dark', 'light', 'system'"]) if (!migration.includes(value)) throw new Error(`missing ${value}`);
for (const token of ["--pos-bg", "--pos-surface", "--pos-border", "--pos-text", "--pos-primary", "--pos-on-primary", "--pos-accent", "data-pos-theme=\"light\"", "prefers-color-scheme"]) if (!tokens.includes(token)) throw new Error(`missing token ${token}`);
for (const value of ["posThemeStyle", "updateBranding(data.branding", "--pos-brand-on-primary"]) if (!shell.includes(value)) throw new Error(`missing shell ${value}`);
for (const value of ["branding?.logo_url", "branding?.display_name", "PRE-CUENTA", "Método", "Operado con Cometa POS"]) if (!food.includes(value)) throw new Error(`missing receipt ${value}`);
for (const value of ["Apariencia del POS", "themeMode", "accentColor", "Nueva venta"]) if (!settings.includes(value)) throw new Error(`missing settings ${value}`);
console.log("POS_BRANDING_THEME_SUITE_PASS");

