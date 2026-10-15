import type { WebContent } from "../../src/lib/pos/product-web-contract";
import type { ProductCard } from "./contract";
export const productBlocks = ["heading", "price", "selection", "guide", "benefits", "buy", "details", "wholesale", "related"] as const;
export type ProductConfig = { blocks: { kind: typeof productBlocks[number]; enabled: boolean }[]; gap: number; gallery: "compact" | "grid"; fit: "cover" | "contain"; sticky: boolean; buyText: string; guideText: string; relatedText: string };
export const defaultProduct = (): ProductConfig => ({ blocks: productBlocks.map(kind => ({ kind, enabled: true })), gap: 20, gallery: "compact", fit: "cover", sticky: true, buyText: "Agregar a mi bolsa", guideText: "Guía de tallas", relatedText: "Completa tu look" });
export function parseProductConfig(value: unknown): ProductConfig {
  const fail = (): never => { throw Error("PRODUCT_APPEARANCE_INVALID"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.blocks) || o.blocks.length !== productBlocks.length) return fail();
  const blocks = o.blocks.map(b => {
    if (!b || typeof b !== "object" || !productBlocks.includes(b.kind) || typeof b.enabled !== "boolean") return fail();
    return { kind: b.kind as typeof productBlocks[number], enabled: b.enabled as boolean };
  });
  if (new Set(blocks.map(b => b.kind)).size !== productBlocks.length || !Number.isInteger(o.gap) || Number(o.gap) < 8 || Number(o.gap) > 48 || !["compact", "grid"].includes(String(o.gallery)) || !["cover", "contain"].includes(String(o.fit)) || typeof o.sticky !== "boolean") return fail();
  const label = (x: unknown) => typeof x === "string" && x.trim().length > 0 && x.length <= 80 ? x.trim() : fail();
  return { blocks, gap: Number(o.gap), gallery: o.gallery as ProductConfig["gallery"], fit: o.fit as ProductConfig["fit"], sticky: o.sticky, buyText: label(o.buyText), guideText: label(o.guideText), relatedText: label(o.relatedText) };
}
export type PublicVariant = { id: string; name: string; price: number; available: boolean; options: Record<string, string> };
export type PublicProduct = { id: string; brandId: string; name: string; currency: string | null; content: WebContent; variants: PublicVariant[]; related: ProductCard[] };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function productHref(id: string, color = "", variant = "", size = "") { const q = new URLSearchParams(); if (color) q.set("color", color); if (variant) q.set("variant", variant); if (size) q.set("size", size); return `/productos/${encodeURIComponent(id)}${q.size ? "?" + q : ""}`; }
export function initialProductSelection(p: PublicProduct, variantId: string, colorId: string) {
  const variant = p.variants.find(v => v.id === variantId);
  const color = (variant && p.content.colors.find(c => c.variantIds.includes(variant.id))) || p.content.colors.find(c => c.id === colorId) || p.content.colors[0];
  return { colorId: color?.id ?? "", variantId: variant?.id ?? "" };
}
