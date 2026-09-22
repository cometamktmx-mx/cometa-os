import fs from "node:fs";
const food = fs.readFileSync("src/app/brand/[brandSlug]/components/pos-food-receipt.tsx", "utf8");
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const sales = fs.readFileSync("src/app/brand/[brandSlug]/pos/sales/page.tsx", "utf8");
if (food.includes("Mood Cafe Test") || food.includes("Sucursal Principal") || food.includes("Presenta esta cuenta al pagar")) throw new Error("food receipt still has generic copy");
for (const value of ["logo_url", "display_name", "legal_name", "tax_id", "PRE-CUENTA", "MÃ©todo"]) if (value === "MÃ©todo" ? food.includes(value) : !food.includes(value)) throw new Error(`receipt contract missing or corrupt: ${value}`);
for (const value of ["@page", "branding?.logo_url", "branding?.legal_name", "branding?.tax_id", "branding?.phone"]) if (!sales.includes(value)) throw new Error(`retail receipt missing ${value}`);
const require = createRequire(import.meta.url);
function compile(source, deps = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => Object.hasOwn(deps, name) ? deps[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const source = fs.readFileSync("src/app/brand/[brandSlug]/components/pos-receipt-socials.tsx", "utf8");
const socials = compile(source);
const configured = { instagram: "@macca.cafe", facebook: "Macca Café", tiktok: "@macca" };
const render = (values) => renderToStaticMarkup(React.createElement(socials.PosReceiptSocials, { socials: values }));
const html = render(configured);
for (const network of Object.keys(configured)) assert.match(html, new RegExp(`data-receipt-social="${network}"`));
for (const username of Object.values(configured)) assert.ok(html.includes(username));
assert.equal((html.match(/<svg/g) || []).length, 3);
assert.doesNotMatch(html, /<img|https?:|<image/);
assert.doesNotMatch(render({}), /<svg/);
assert.doesNotMatch(render({ instagram: " ", facebook: null }), /<svg/);
assert.equal((render({ tiktok: "@macca" }).match(/<svg/g) || []).length, 1);
assert.match(render({ instagram: " @preserve " }), /> @preserve <\/span>/);
const receipt = compile(food, { "./pos-receipt-socials": socials, "./pos-food-modifiers": { FoodItemModifiers: () => null } });
for (const preview of [true, false]) {
  const output = renderToStaticMarkup(React.createElement(receipt.FoodReceipt, { mode: "final", branding: { ...configured, display_name: "Food" }, check: { id: "order" }, items: [], staff: "Equipo", table: "1", total: "$50", preview }));
  assert.equal((output.match(/data-receipt-social=/g) || []).length, 3);
}
const personalization = fs.readFileSync("src/app/brand/[brandSlug]/pos/settings/personalization/page.tsx", "utf8");
const ast = ts.createSourceFile("personalization.tsx", personalization, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const previewSource = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "Preview").getText(ast);
const { Preview } = compile(`import { PosReceiptSocials } from "socials";\n${previewSource}\nexport { Preview };`, { socials });
const profile = { commercialName: "Food", brandColor: "#000000", socials: configured };
const foodPreview = renderToStaticMarkup(React.createElement(Preview, { profile, food: true }));
assert.equal((foodPreview.match(/data-receipt-social=/g) || []).length, 3);
const retailPreview = renderToStaticMarkup(React.createElement(Preview, { profile, food: false }));
assert.doesNotMatch(retailPreview, /data-receipt-social=/);
assert.ok(retailPreview.includes(configured.instagram));
assert.doesNotMatch(sales, /PosReceiptSocials/);
console.log("POS_RECEIPT_BRANDING_SUITE_PASS (Food preview/print + social SVGs; Retail preserved)");

