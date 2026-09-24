import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/pos/server";

export async function POST(request: Request) {
  const raw = await request.text(); const secret = process.env.SKYDROPX_WEBHOOK_SECRET; const signature = request.headers.get("x-skydropx-signature") || "";
  if (!secret) return NextResponse.json({ ok: false, code: "SKYDROPX_WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return NextResponse.json({ ok: false, code: "SKYDROPX_WEBHOOK_INVALID_SIGNATURE" }, { status: 401 });
  let payload: Record<string, unknown>; try { const parsed = JSON.parse(raw) as unknown; if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(); payload = parsed as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, code: "SKYDROPX_WEBHOOK_INVALID_PAYLOAD" }, { status: 400 }); }
  const providerEventId = typeof payload.id === "string" ? payload.id : createHash("sha256").update(JSON.stringify({ shipment_id: payload.shipment_id, status: payload.status, type: payload.type })).digest("hex");
  const admin = getAdminClient(); const { data: existing } = await admin.from("comu_shipping_webhook_events").select("id,processed_at").eq("provider", "SKYDROPX").eq("provider_event_id", providerEventId).maybeSingle(); if (existing) return NextResponse.json({ ok: true, idempotent: true });
  const providerShipmentId = typeof payload.shipment_id === "string" ? payload.shipment_id : null; const rawStatus = String(payload.status || payload.type || "").toUpperCase();
  const normalized = rawStatus.includes("DELIVER") ? "DELIVERED" : rawStatus.includes("OUT") ? "OUT_FOR_DELIVERY" : rawStatus.includes("TRANSIT") ? "IN_TRANSIT" : rawStatus.includes("LABEL") ? "LABEL_READY" : rawStatus.includes("CANCEL") ? "CANCELLED" : rawStatus.includes("EXCEPTION") ? "EXCEPTION" : "CREATED";
  const { data: shipment } = providerShipmentId ? await admin.from("comu_shipments").select("id,status").eq("provider_shipment_id", providerShipmentId).maybeSingle() : { data: null };
  const { error } = await admin.from("comu_shipping_webhook_events").insert({ provider: "SKYDROPX", provider_event_id: providerEventId, shipment_id: shipment?.id || null, event_type: normalized, payload: { providerShipmentId, status: rawStatus }, processed_at: new Date().toISOString() });
  if (error && error.code !== "23505") return NextResponse.json({ ok: false, code: "SKYDROPX_WEBHOOK_PERSIST_FAILED" }, { status: 500 });
  if (shipment) { const rank: Record<string, number> = { CREATED: 0, LABEL_READY: 1, IN_TRANSIT: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4, EXCEPTION: 4, CANCELLED: 4 }; if ((rank[normalized] ?? 0) >= (rank[shipment.status] ?? 0) && !(shipment.status === "DELIVERED" && normalized !== "DELIVERED")) await admin.from("comu_shipments").update({ status: normalized, updated_at: new Date().toISOString() }).eq("id", shipment.id); }
  return NextResponse.json({ ok: true, received: true, eventId: providerEventId });
}
