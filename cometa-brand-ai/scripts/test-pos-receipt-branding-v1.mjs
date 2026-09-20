import fs from "node:fs";
const food = fs.readFileSync("src/app/brand/[brandSlug]/components/pos-food-receipt.tsx", "utf8");
const sales = fs.readFileSync("src/app/brand/[brandSlug]/pos/sales/page.tsx", "utf8");
if (food.includes("Mood Cafe Test") || food.includes("Sucursal Principal") || food.includes("Presenta esta cuenta al pagar")) throw new Error("food receipt still has generic copy");
for (const value of ["logo_url", "display_name", "legal_name", "tax_id", "PRE-CUENTA", "MÃ©todo"]) if (value === "MÃ©todo" ? food.includes(value) : !food.includes(value)) throw new Error(`receipt contract missing or corrupt: ${value}`);
for (const value of ["@page", "branding?.logo_url", "branding?.legal_name", "branding?.tax_id", "branding?.phone"]) if (!sales.includes(value)) throw new Error(`retail receipt missing ${value}`);
console.log("POS_RECEIPT_BRANDING_SUITE_PASS");

