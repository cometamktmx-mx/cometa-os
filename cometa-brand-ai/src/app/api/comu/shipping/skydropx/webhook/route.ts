import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/pos/server";
import { parseSkydropxWebhook, verifySkydropxWebhookSignature } from "@/lib/comu/skydropx-webhook";

export async function POST(request: Request) {
  const raw = await request.text(); const secret = process.env.SKYDROPX_WEBHOOK_SECRET; const authorization = request.headers.get("authorization") || "";
  if (!secret) return NextResponse.json({ ok: false, code: "SKYDROPX_WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  if (!verifySkydropxWebhookSignature(raw, authorization, secret)) return NextResponse.json({ ok: false, code: "SKYDROPX_WEBHOOK_INVALID_SIGNATURE" }, { status: 401 });
  let parsed: ReturnType<typeof parseSkydropxWebhook>; try { parsed = parseSkydropxWebhook(JSON.parse(raw) as unknown); } catch (error) { return NextResponse.json({ ok: false, code: error instanceof Error ? error.message : "SKYDROPX_WEBHOOK_INVALID_PAYLOAD" }, { status: 400 }); }
  const admin = getAdminClient(); const { data: existing } = await admin.from("comu_shipping_webhook_events").select("id,processed_at").eq("provider", "SKYDROPX").eq("provider_event_id", parsed.providerEventId).maybeSingle(); if (existing) return NextResponse.json({ ok: true, idempotent: true });
  const { data: shipment } = await admin.from("comu_shipments").select("id,status").eq("provider_shipment_id", parsed.providerShipmentId).maybeSingle(); const normalized = parsed.normalizedStatus === "UNKNOWN" ? "EXCEPTION" : parsed.normalizedStatus;
  const { error } = await admin.from("comu_shipping_webhook_events").insert({ provider: "SKYDROPX", provider_event_id: parsed.providerEventId, shipment_id: shipment?.id || null, event_type: normalized, payload: { providerShipmentId: parsed.providerShipmentId, packageId: parsed.packageId, status: parsed.rawStatus, returnedStatus: parsed.returnedStatus, trackingNumber: parsed.trackingNumber, labelUrl: parsed.labelUrl }, processed_at: new Date().toISOString() });
  if (error?.code === "23505") return NextResponse.json({ ok: true, idempotent: true });
  if (error) return NextResponse.json({ ok: false, code: "SKYDROPX_WEBHOOK_PERSIST_FAILED" }, { status: 500 });
  if (shipment) { const rank: Record<string, number> = { CREATED: 0, LABEL_READY: 1, IN_TRANSIT: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4, EXCEPTION: 4, CANCELLED: 4 }; const current = String(shipment.status ?? "CREATED"); const canAdvance = normalized === "DELIVERED" ? current === "DELIVERED" || (rank[current] ?? 0) <= rank.DELIVERED : current !== "DELIVERED" && (rank[normalized] ?? 0) >= (rank[current] ?? 0); if (canAdvance) await admin.from("comu_shipments").update({ status: normalized, ...(parsed.trackingNumber ? { tracking_number: parsed.trackingNumber } : {}), ...(parsed.labelUrl ? { label_url: parsed.labelUrl } : {}), updated_at: new Date().toISOString() }).eq("id", shipment.id); }
  return NextResponse.json({ ok: true, received: true, eventId: parsed.providerEventId });
}
