import "server-only";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createHash } from "node:crypto";
import type { BagLine } from "../../../packages/own-storefront/bag";
import type { Contact, CartQuote } from "../../../packages/own-storefront/checkout-contract";

export function checkoutStore() {
  const slug = process.env.STOREFRONT_BRAND_SLUG, url = process.env.STOREFRONT_SUPABASE_URL, key = process.env.STOREFRONT_SUPABASE_SERVICE_ROLE_KEY;
  if (!slug || !url || !key) throw Error("STORE_CONFIGURATION_REQUIRED");
  return { slug, db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }) } }) };
}
export const ownerHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const shippingRequestHash = (lines: BagLine[], contact: Contact) => ownerHash(JSON.stringify({ lines, contact }));
export function stripeTest() {
  const key = process.env.STOREFRONT_STRIPE_TEST_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) throw Error("STORE_STRIPE_TEST_REQUIRED");
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 20000 });
}
export function checkoutOrigin() {
  const origin = process.env.STOREFRONT_ORIGIN;
  if (!origin) throw Error("STORE_ORIGIN_REQUIRED");
  const u = new URL(origin);
  if (u.username || u.password || u.pathname !== "/" || u.search || u.hash || (u.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(u.hostname))) throw Error("STORE_ORIGIN_REQUIRED");
  return u.origin;
}
export async function quoteCart(lines: BagLine[], owner: string, contact?: Contact): Promise<CartQuote> {
  const { slug, db } = checkoutStore();
  const result = await db.rpc("store_cart_m6", { p_brand: slug, p_lines: lines });
  if (result.error || !result.data) throw Error("STORE_CART_UNAVAILABLE");
  const cart = result.data as CartQuote & { configurationReady: boolean };
  const blockers: string[] = [];
  if (!cart.configurationReady) blockers.push("Falta aprobar sucursal, moneda y política comercial de esta tienda.");
  if (cart.items.some(i => !i.available)) blockers.push("Hay variantes sin existencias suficientes en la sucursal de envío.");
  let shipping: { id: string; amount_cents: number; currency: string } | null = null;
  if (contact && cart.configurationReady) {
    // Modular boundary for a future verified provider adapter. Never use COMU local test rates.
    const result = await db.from("store_shipping_quotes").select("id,amount_cents,currency").eq("brand_id", cart.brandId).eq("owner_hash", owner).eq("request_hash", shippingRequestHash(lines, contact)).gt("expires_at", new Date().toISOString()).order("verified_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw Error("STORE_SHIPPING_UNAVAILABLE");
    shipping = result.data;
  }
  if (!shipping || shipping.currency !== cart.currency) { shipping = null; blockers.push("El envío aún no tiene una cotización verificada. No se realizará ningún cobro."); }
  if (!process.env.STOREFRONT_STRIPE_TEST_SECRET_KEY?.startsWith("sk_test_") || !process.env.STOREFRONT_STRIPE_TEST_WEBHOOK_SECRET || !process.env.STOREFRONT_ORIGIN) blockers.push("El pago de prueba todavía no está configurado.");
  return { ...cart, shippingCents: shipping?.amount_cents ?? null, totalCents: shipping ? cart.subtotalCents + shipping.amount_cents : null, quoteId: shipping?.id ?? null, ready: blockers.length === 0, blockers };
}
export type StoreOrder = { id: string; brand_id: string; owner_hash: string; status: string; currency: string; total_cents: number; subtotal_cents: number; shipping_cents: number; stripe_account_ref: string; stripe_session_id: string | null; expires_at: string; contact: Contact; request: { lines: BagLine[]; contact: Contact } };
export async function ownedOrder(owner: string, id?: string, attempt?: string): Promise<StoreOrder | null> {
  const { slug, db } = checkoutStore();
  const brand = await db.from("brands").select("id").eq("slug", slug).maybeSingle();
  if (brand.error || !brand.data) throw Error("STORE_UNAVAILABLE");
  let q = db.from("store_orders").select("id,brand_id,owner_hash,status,currency,total_cents,subtotal_cents,shipping_cents,stripe_account_ref,stripe_session_id,expires_at,contact,request").eq("brand_id", brand.data.id).eq("owner_hash", owner);
  q = attempt ? q.eq("attempt_id", attempt) : id ? q.eq("id", id) : q.eq("status", "PENDING");
  const result = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw Error("STORE_ORDER_UNAVAILABLE");
  return result.data;
}
export function safeOrder(o: StoreOrder) { return { id: o.id, status: o.status, currency: o.currency, total_cents: o.total_cents, subtotal_cents: o.subtotal_cents, shipping_cents: o.shipping_cents, expires_at: o.expires_at }; }
export async function payOrder(o: StoreOrder) {
  if (o.status !== "PENDING" || Date.parse(o.expires_at) <= Date.now()) return { order: safeOrder(o), url: null };
  const stripe = stripeTest(), { db } = checkoutStore();
  const account = await stripe.accounts.retrieveCurrent();
  if (account.id !== o.stripe_account_ref) throw Error("STORE_STRIPE_ACCOUNT_MISMATCH");
  // Stable provider payload/key permits recovery after a response is lost.
  const session = o.stripe_session_id ? await stripe.checkout.sessions.retrieve(o.stripe_session_id) : await stripe.checkout.sessions.create({
    mode: "payment", payment_method_types: ["card"], client_reference_id: o.id,
    metadata: { store_order_id: o.id, store_brand_id: o.brand_id },
    line_items: [{ price_data: { currency: o.currency.toLowerCase(), unit_amount: o.total_cents, product_data: { name: "Pedido " + o.id.slice(0, 8).toUpperCase() } }, quantity: 1 }],
    success_url: checkoutOrigin() + "/pedido/" + o.id, cancel_url: checkoutOrigin() + "/checkout?order=" + o.id,
    expires_at: Math.floor(Date.parse(o.expires_at) / 1000),
  }, { idempotencyKey: "store-m6:" + o.id });
  if (session.livemode || session.client_reference_id !== o.id || session.amount_total !== o.total_cents || session.currency?.toUpperCase() !== o.currency) throw Error("STORE_PAYMENT_MISMATCH");
  if (!o.stripe_session_id) { const attached = await db.rpc("store_order_attach_session_m6", { p_order: o.id, p_session: session.id }); if (attached.error) throw Error("STORE_SESSION_PENDING"); }
  return { order: safeOrder(o), url: session.status === "open" ? session.url : null };
}
