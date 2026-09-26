import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveTextileProfile } from "../src/lib/comu/textile-logistics.ts";
import { estimateTextilePackage } from "../src/lib/comu/shipping-pricing.ts";

const component = await readFile("src/app/comu/seller/shipping-settings.tsx", "utf8");
assert.match(component, /Estado de envíos/);
assert.match(component, /Envío desde mi tienda/);
assert.match(component, /Entregar al HUB COMETA/);
assert.match(component, /Política menudeo/);
assert.match(component, /Política mayoreo/);
assert.match(component, /Perfiles logísticos por producto/);
assert.match(component, /Vista previa de cotización/);
assert.match(component, /No se creó ningún envío/);
assert.doesNotMatch(component, /Configura tu tienda antes/);

assert.equal(resolveTextileProfile({ name: "Playera básica" }).key, "PLAYERA");
assert.equal(resolveTextileProfile({ name: "Legging deportivo" }).key, "LEGGING");
assert.equal(resolveTextileProfile({ name: "Jeans rectos" }).key, "JEANS");
assert.equal(resolveTextileProfile({ name: "Pijama conjunto" }).key, "PIJAMA");
assert.equal(resolveTextileProfile({ name: "Hoodie" }).key, "SUDADERA");
assert.equal(resolveTextileProfile({ name: "Producto textil" }).key, "DEFAULT");
const packages = estimateTextilePackage({ itemCount: 1, totalWeightG: 750 });
assert.equal(packages[0].weightKg, 0.75);
assert.equal(packages[0].preset, "TEXTILE_S");
console.log("COMU SHIPPING UI CONTRACT PASS");
