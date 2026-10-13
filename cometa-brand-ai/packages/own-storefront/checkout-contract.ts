import { uuidPattern } from "./product-contract";
import type { BagLine } from "./bag";
export type Contact = { email: string; name: string; phone: string; line1: string; line2: string; city: string; state: string; postalCode: string; country: string };
export type CartQuote = { brandId: string; currency: string; items: { productId: string; variantId: string; name: string; variantName: string; quantity: number; unitCents: number; totalCents: number; available: boolean }[]; subtotalCents: number; discountCents: number | null; shippingCents: number | null; totalCents: number | null; quoteId: string | null; ready: boolean; blockers: string[] };
export const emptyContact = (): Contact => ({ email: "", name: "", phone: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "" });
export function checkoutLines(value: unknown): BagLine[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw Error("Revisa tu bolsa.");
  const result = value.map((x: unknown) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) throw Error("Revisa tu bolsa.");
    const v = x as Record<string, unknown>;
    if (Object.keys(v).some(k => !["productId", "variantId", "quantity"].includes(k)) || typeof v.productId !== "string" || !uuidPattern.test(v.productId) || typeof v.variantId !== "string" || !uuidPattern.test(v.variantId) || !Number.isInteger(v.quantity) || Number(v.quantity) < 1 || Number(v.quantity) > 99) throw Error("Revisa variantes y cantidades.");
    return { productId: v.productId, variantId: v.variantId, quantity: Number(v.quantity) };
  }).sort((a, b) => a.variantId.localeCompare(b.variantId));
  if (new Set(result.map(x => x.variantId)).size !== result.length) throw Error("Hay variantes duplicadas.");
  return result;
}
export function checkoutContact(value: unknown): Contact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Completa tus datos de entrega.");
  const v = value as Record<string, unknown>, out = emptyContact();
  if (Object.keys(v).some(k => !(k in out))) throw Error("Datos de entrega inválidos.");
  for (const k of Object.keys(out) as (keyof Contact)[]) { const s = v[k]; if (typeof s !== "string" || s.length > 200 || (k !== "line2" && !s.trim())) throw Error("Completa tus datos de entrega."); out[k] = s.trim(); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email) || !/^[A-Z]{2}$/.test(out.country) || !/^[0-9+() -]{7,30}$/.test(out.phone)) throw Error("Revisa correo, teléfono y país (código de dos letras).");
  return out;
}
export const money = (cents: number, currency: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(cents / 100);
// Integration records only: no Pixel/CAPI network calls, consent or personal data.
export type CommerceEvent = { id: string; name: "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase"; currency: string; valueCents: number; orderId?: string };
export function purchaseEvent(order: { id: string; status: string; currency: string; total_cents: number }): CommerceEvent | null {
  return order.status === "PAID" ? { id: `store:purchase:${order.id}`, name: "Purchase", currency: order.currency, valueCents: order.total_cents, orderId: order.id } : null;
}
