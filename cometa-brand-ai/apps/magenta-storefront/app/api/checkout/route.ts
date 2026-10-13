import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { checkoutContact, checkoutLines, purchaseEvent } from "../../../../../packages/own-storefront/checkout-contract";
import { uuidPattern } from "../../../../../packages/own-storefront/product-contract";
import { checkoutOrigin, checkoutStore, ownedOrder, ownerHash, payOrder, quoteCart, safeOrder, shippingRequestHash } from "../../../lib/checkout-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookieName = "store_checkout_owner";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  try {
    const token = (await cookies()).get(cookieName)?.value;
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return reply({ order: null });
    const id = new URL(request.url).searchParams.get("order");
    if (id && !uuidPattern.test(id)) return reply({ error: "Pedido no disponible" }, 404);
    const order = await ownedOrder(ownerHash(token), id ?? undefined);
    return reply({ order: order ? safeOrder(order) : null, event: order ? purchaseEvent(order) : null });
  } catch { return reply({ error: "No se pudo recuperar el pedido." }, 503); }
}
export async function POST(request: Request) {
  try {
    // Next normalizes loopback request URLs; use the server's canonical public origin.
    if (request.headers.get("origin") !== checkoutOrigin()) return reply({ error: "Origen no autorizado" }, 403);
    const text = await request.text(); if (text.length > 40000) return reply({ error: "Solicitud inválida" }, 400);
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Solicitud inválida" }, 400);
    const b = body as Record<string, unknown>;
    if (Object.keys(b).some(k => !["action", "lines", "contact", "attempt", "order"].includes(k))) return reply({ error: "Solicitud inválida" }, 400);
    const jar = await cookies();let token = jar.get(cookieName)?.value;
    if (!token || !/^[0-9a-f]{64}$/.test(token)) { token = randomBytes(32).toString("hex");jar.set(cookieName, token, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 30 }); }
    const owner = ownerHash(token);
    if (b.action === "session") return reply({ ready: true });
    if (b.action === "resume" || b.action === "cancel") {
      if (typeof b.order !== "string" || !uuidPattern.test(b.order)) return reply({ error: "Pedido no disponible" }, 404);
      const order = await ownedOrder(owner, b.order);if (!order) return reply({ error: "Pedido no disponible" }, 404);
      if (b.action === "resume") return reply(await payOrder(order));
      // Cancelling locally can race a card payment: the webhook then enters PAYMENT_REVIEW, never refunds implicitly.
      const result = await checkoutStore().db.rpc("store_order_resolve_m6", { p_order: order.id, p_action: "CANCELLED" });
      if (result.error) throw Error("STORE_CANCEL_FAILED");return reply({ order: safeOrder(result.data) });
    }
    const lines = checkoutLines(b.lines), contact = b.contact === undefined ? undefined : checkoutContact(b.contact);
    if (b.action === "quote") return reply(await quoteCart(lines, owner, contact));
    if (b.action !== "pay" || !contact || typeof b.attempt !== "string" || !uuidPattern.test(b.attempt)) return reply({ error: "Revisa los datos de compra." }, 400);
    // Recovery precedes stock re-evaluation: an existing order owns its reserve and immutable totals.
    const replay = await ownedOrder(owner, undefined, b.attempt);
    if (replay) {
      if (!isDeepStrictEqual(replay.request.lines, lines) || !isDeepStrictEqual(replay.request.contact, contact)) return reply({ error: "El intento corresponde a otra compra. Recupera el pedido original." }, 409);
      return reply(await payOrder(replay));
    }
    const existing = await ownedOrder(owner);
    if (existing) return reply({ order: safeOrder(existing), url: null, recover: true });
    const quote = await quoteCart(lines, owner, contact);
    if (!quote.ready || !quote.quoteId) return reply({ error: quote.blockers.join(" "), quote }, 409);
    const { slug, db } = checkoutStore();
    const result = await db.rpc("store_order_create_m6", { p_brand: slug, p_owner: owner, p_attempt: b.attempt, p_lines: lines, p_contact: contact, p_quote: quote.quoteId, p_request_hash: shippingRequestHash(lines, contact) });
    if (result.error || !result.data) return reply({ error: "No se pudo reservar tu selección. Revisa disponibilidad o recupera el pedido pendiente." }, 409);
    return reply(await payOrder(result.data));
  } catch { return reply({ error: "No se pudo completar la solicitud. Tu bolsa se conserva; recupera el intento antes de crear otro." }, 503); }
}
