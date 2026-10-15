import { timingSafeEqual } from "node:crypto";
import { checkoutStore } from "../../../../lib/checkout-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.STOREFRONT_EXPIRY_SECRET, bearer = request.headers.get("authorization");
  if (!secret || !bearer || Buffer.byteLength(bearer) !== Buffer.byteLength("Bearer " + secret) || !timingSafeEqual(Buffer.from(bearer), Buffer.from("Bearer " + secret))) return new Response("Unauthorized", { status: 401 });
  const { slug, db } = checkoutStore();
  const result = await db.rpc("store_orders_expire_m6", { p_brand: slug });
  return Response.json(result.error ? { error: "Retry required" } : { expired: result.data }, { status: result.error ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
}
