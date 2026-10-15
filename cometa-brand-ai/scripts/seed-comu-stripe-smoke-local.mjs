// Explicit local fixture. Never imported by the app or run during build/start.
// node scripts/seed-comu-stripe-smoke-local.mjs --apply
// node scripts/seed-comu-stripe-smoke-local.mjs --clean
// Cleanup unpublishes/deactivates this fixture; it preserves carts, orders and stock history.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
if (!["--apply", "--clean"].includes(mode) || process.argv.length !== 3) {
  console.log("Usage: node scripts/seed-comu-stripe-smoke-local.mjs --apply | --clean (localhost only)");
  process.exit(0);
}
const env = { ...parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8")), ...process.env };
const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "");
if (env.NODE_ENV === "production" || env.VERCEL || url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321" || url.username || url.password) {
  throw new Error("DEV fixture refused: only local Supabase http://127.0.0.1:54321 is allowed, never production.");
}
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE;
if (!key) throw new Error("Local Supabase service key is required.");
const db = createClient(url.origin, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, options) => {
    const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (target.origin !== url.origin) throw new Error("DEV fixture refused a non-local request.");
    return fetch(input, { ...options, redirect: "error", signal: AbortSignal.timeout(15000) });
  } },
});
const namespace = "comu-stripe-smoke-local";
const slug = "comu-dev-camiseta-smoke";
const fixtureId = (label) => {
  const hex = createHash("sha256").update(`${namespace}:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const ids = Object.fromEntries(["brand", "location", "product", "variant", "seller", "storefront", "listing", "variantListing", "inventory"].map((label) => [label, fixtureId(label)]));
async function save(table, row) {
  const { data, error } = await db.from(table).upsert(row, { onConflict: "id" }).select("*").single();
  if (error || !data) throw new Error(`DEV ${table}: ${error?.message || "missing row"}`);
  return data;
}
async function deactivate(table, id, values) {
  const { error } = await db.from(table).update(values).eq("id", id);
  if (error) throw new Error(`DEV cleanup ${table}: ${error.message}`);
}
if (mode === "--clean") {
  await deactivate("comu_product_listings", ids.listing, { status: "HIDDEN" });
  await deactivate("comu_variant_listings", ids.variantListing, { enabled: false });
  await deactivate("comu_storefronts", ids.storefront, { status: "SUSPENDED" });
  await deactivate("comu_sellers", ids.seller, { status: "PAUSED" });
  await deactivate("pos_product_variants", ids.variant, { active: false });
  await deactivate("pos_products", ids.product, { active: false, sellable: false });
  console.log("DEV fixture unpublished and deactivated. Existing orders, reservations and inventory preserved. --apply reactivates it.");
} else {
  await save("brands", { id: ids.brand, slug: namespace, name: "COMU Textil DEV Local" });
  const brand = { brand_id: ids.brand, brand_slug: namespace };
  await save("pos_locations", { id: ids.location, ...brand, name: "Almacen DEV COMU", code: "COMU-DEV", currency: "MXN", prices_include_tax: true, tax_rate: 0, active: true });
  await save("pos_products", { id: ids.product, ...brand, name: "Camiseta COMU DEV", description: "Pieza textil exclusiva de pruebas locales de checkout. No es un producto comercial.", product_type: "physical", track_inventory: true, inventory_mode: "direct", default_unit_code: "piece", tax_rate: 0, active: true, sellable: true, has_variants: true });
  await save("pos_product_variants", { id: ids.variant, ...brand, product_id: ids.product, name: "Talla M / Natural DEV", sku: "COMU-DEV-CAMI-M", price: 199, cost: 0, unit_code: "piece", attributes: { talla: "M", color: "Natural" }, active: true, is_default: true, variant_signature: {} });
  // Do not reset stock/reservations on rerun: keep the same fixture and its history.
  const { data: existingInventory, error: inventoryError } = await db.from("pos_inventory").select("id,quantity,reserved_quantity").eq("location_id", ids.location).eq("variant_id", ids.variant).maybeSingle();
  if (inventoryError) throw new Error(`DEV inventory: ${inventoryError.message}`);
  const inventory = existingInventory || await save("pos_inventory", { id: ids.inventory, ...brand, location_id: ids.location, variant_id: ids.variant, quantity: 20, reserved_quantity: 0, minimum_quantity: 0 });
  await save("comu_sellers", { id: ids.seller, ...brand, public_name: "COMU Textil DEV", slug: namespace, status: "ACTIVE", verification_status: "VERIFIED" });
  await save("comu_storefronts", { id: ids.storefront, seller_id: ids.seller, name: "Tienda Textil DEV", slug: namespace, status: "ACTIVE" });
  await save("comu_product_listings", { id: ids.listing, seller_id: ids.seller, storefront_id: ids.storefront, product_id: ids.product, public_slug: slug, status: "PUBLISHED", title_override: "Camiseta COMU DEV", retail_price_override: 199 });
  await save("comu_variant_listings", { id: ids.variantListing, listing_id: ids.listing, variant_id: ids.variant, enabled: true, price_override: 199 });
  console.log(JSON.stringify({ fixture: namespace, ids, slug, productPath: `/comu/products/${slug}`, price: 199, currency: "MXN", initialStock: 20, stock: Number(inventory.quantity), reserved: Number(inventory.reserved_quantity), available: Number(inventory.quantity) - Number(inventory.reserved_quantity), cleanup: "node scripts/seed-comu-stripe-smoke-local.mjs --clean" }, null, 2));
}
