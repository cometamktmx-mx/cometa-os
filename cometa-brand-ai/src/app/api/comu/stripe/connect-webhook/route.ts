import { getAdminClient } from "@/lib/pos/server";
import { getConnectStripeClient } from "@/lib/comu/stripe";
import { processConnectEvent } from "@/lib/comu/finance";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.COMU_STRIPE_CONNECT_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return Response.json({ ok: false }, { status: 400 });
  let event;
  try { event = getConnectStripeClient().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return Response.json({ ok: false }, { status: 400 }); }
  if (event.livemode) return Response.json({ ok: false }, { status: 400 });
  try { return Response.json({ ok: true, ...(await processConnectEvent(getAdminClient(), event)) }); }
  catch { return Response.json({ ok: false }, { status: 500 }); }
}
