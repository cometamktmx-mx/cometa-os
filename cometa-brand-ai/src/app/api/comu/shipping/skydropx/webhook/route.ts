import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/pos/server";
import { parseSkydropxWebhook, verifySkydropxWebhookSignature } from "@/lib/comu/skydropx-webhook";

export async function POST(request: Request) {
  const raw = await request.text(); const secret = process.env.SKYDROPX_WEBHOOK_SECRET; const authorization = request.headers.get("authorization") || "";
  if (!secret) return NextResponse.json({ ok: false, code: "SKYDROPX_WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  if (!verifySkydropxWebhookSignature(raw, authorization, secret)) return NextResponse.json({ ok: false, code: "SKYDROPX_WEBHOOK_INVALID_SIGNATURE" }, { status: 401 });
  let parsed: ReturnType<typeof parseSkydropxWebhook>; try { parsed = parseSkydropxWebhook(JSON.parse(raw) as unknown); } catch (error) { return NextResponse.json({ ok: false, code: error instanceof Error ? error.message : "SKYDROPX_WEBHOOK_INVALID_PAYLOAD" }, { status: 400 }); }
  const { data, error } = await getAdminClient().rpc("comu_process_tracking_event_v1", {
    p_provider: "SKYDROPX", p_event: parsed.providerEventId, p_shipment: parsed.providerShipmentId,
    p_status: parsed.normalizedStatus, p_tracking: parsed.trackingNumber,
  });
  if (error || !data) return NextResponse.json({ ok: false, code: "COMU_TRACKING_RETRY_REQUIRED" }, { status: 503 });
  return NextResponse.json({ ok: true, ...data });
}
