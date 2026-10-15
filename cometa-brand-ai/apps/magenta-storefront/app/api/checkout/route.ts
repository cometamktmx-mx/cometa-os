import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { checkoutContact, checkoutLines, purchaseEvent } from "../../../../../packages/own-storefront/checkout-contract";
import { uuidPattern } from "../../../../../packages/own-storefront/product-contract";
import { checkoutOrigin, checkoutStore, ownedOrder, ownerHash, continueOrder, operationQuote, safeOrder, shippingRequestHash } from "../../../lib/checkout-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookieName = "store_checkout_owner";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  try {
    const token = (await cookies()).get(cookieName)?.value;
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return reply({ order: null });
    const id = new URL(request.url).searchParams.get("order");
    if(new URL(request.url).searchParams.get('list')==='1'){
      const {slug,db}=checkoutStore(),b=await db.from('brands').select('id').eq('slug',slug).maybeSingle();if(b.error||!b.data)throw Error();
      const r=await db.from('store_orders').select('id,status,currency,total_cents,subtotal_cents,shipping_cents,expires_at,payment_method,delivery_method,preparation_status,delivery_status,tracking,refund_required').eq('brand_id',b.data.id).eq('owner_hash',ownerHash(token)).order('created_at',{ascending:false}).limit(100);if(r.error)throw Error();return reply({orders:r.data});
    }
    if (id && !uuidPattern.test(id)) return reply({ error: "Pedido no disponible" }, 404);
    const order = await ownedOrder(ownerHash(token), id ?? undefined);
    const items=order?await checkoutStore().db.from('store_order_items').select('quantity,unit_cents,snapshot').eq('order_id',order.id):null;
    if(items?.error)throw Error('STORE_ORDER_UNAVAILABLE');
    return reply({ order: order ? {...safeOrder(order),items:items?.data??[]} : null, event: order ? purchaseEvent(order) : null });
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
    if (Object.keys(b).some(k => !["action", "lines", "contact", "attempt", "order","delivery","method"].includes(k))) return reply({ error: "Solicitud inválida" }, 400);
    const delivery=b.delivery??'SHIPPING',method=b.method??'STRIPE';if(!['SHIPPING','PICKUP'].includes(String(delivery))||!['STRIPE','WHATSAPP'].includes(String(method)))return reply({error:'Entrega o pago inválidos.'},400);
    const jar = await cookies();let token = jar.get(cookieName)?.value;
    if (!token || !/^[0-9a-f]{64}$/.test(token)) { token = randomBytes(32).toString("hex");jar.set(cookieName, token, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 30 }); }
    const owner = ownerHash(token);
    const operational=checkoutStore();const expired=await operational.db.rpc('store_orders_expire_m6',{p_brand:operational.slug});if(expired.error)throw Error('STORE_EXPIRATION_UNAVAILABLE');
    if (b.action === "session") return reply({ ready: true });
    if (b.action === "resume" || b.action === "cancel") {
      if (typeof b.order !== "string" || !uuidPattern.test(b.order)) return reply({ error: "Pedido no disponible" }, 404);
      const order = await ownedOrder(owner, b.order);if (!order) return reply({ error: "Pedido no disponible" }, 404);
      if (b.action === "resume") return reply(await continueOrder(order));
      if(order.status!=='PENDING')return reply({error:'Solo puedes cancelar un intento pendiente.'},409);
      // Cancelling locally can race a card payment: the webhook then enters PAYMENT_REVIEW, never refunds implicitly.
      const result = await checkoutStore().db.rpc("store_order_resolve_m6", { p_order: order.id, p_action: "CANCELLED" });
      if (result.error) throw Error("STORE_CANCEL_FAILED");return reply({ order: safeOrder(result.data) });
    }
    const lines = checkoutLines(b.lines), contact = b.contact === undefined ? undefined : checkoutContact(b.contact);
    if (b.action === "quote") return reply(await operationQuote(lines, owner, contact,String(delivery),String(method)));
    if (b.action !== "pay" || !contact || typeof b.attempt !== "string" || !uuidPattern.test(b.attempt)) return reply({ error: "Revisa los datos de compra." }, 400);
    // Recovery precedes stock re-evaluation: an existing order owns its reserve and immutable totals.
    const replay = await ownedOrder(owner, undefined, b.attempt);
    if (replay) {
      if (!isDeepStrictEqual(replay.request.lines, lines) || !isDeepStrictEqual(replay.request.contact, contact)||replay.delivery_method!==delivery||replay.payment_method!==method) return reply({ error: "El intento corresponde a otra compra. Recupera el pedido original." }, 409);
      return reply(await continueOrder(replay));
    }
    const existing = await ownedOrder(owner);
    if (existing) return reply({ order: safeOrder(existing), url: null, recover: true });
    const quote = await operationQuote(lines, owner, contact,String(delivery),String(method));
    if (!quote.ready || !quote.quoteId) return reply({ error: quote.blockers.join(" "), quote }, 409);
    const { slug, db } = checkoutStore();
    const result = await db.rpc("store_order_create_m7", { p_brand: slug, p_owner: owner, p_attempt: b.attempt, p_lines: lines, p_contact: contact,p_delivery:delivery,p_method:method,p_hash:shippingRequestHash(lines, contact) });
    if (result.error || !result.data) return reply({ error: "No se pudo reservar tu selección. Revisa disponibilidad o recupera el pedido pendiente." }, 409);
    return reply(await continueOrder(result.data));
  } catch { return reply({ error: "No se pudo completar la solicitud. Tu bolsa se conserva; recupera el intento antes de crear otro." }, 503); }
}
