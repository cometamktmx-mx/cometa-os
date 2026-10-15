import { createHash, createHmac, timingSafeEqual } from "node:crypto";
function normalizeStatus(status: string): string {
  return ({ created: "CREATED", picked_up: "IN_TRANSIT", in_transit: "IN_TRANSIT", last_mile: "OUT_FOR_DELIVERY", delivered: "DELIVERED", exception: "EXCEPTION", canceled: "CANCELLED", in_return: "EXCEPTION" } as Record<string, string>)[status.toLowerCase()] ?? "UNKNOWN";
}

export function verifySkydropxWebhookSignature(rawBody: string, authorization: string, secret: string): boolean {
  if (!authorization.startsWith("HMAC ")) return false;
  const provided = authorization.slice(5).trim().toLowerCase();
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  return provided.length === expected.length && timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
}

export function parseSkydropxWebhook(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("SKYDROPX_WEBHOOK_INVALID_PAYLOAD");
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data as Record<string, unknown> : root;
  const attributes = data.attributes && typeof data.attributes === "object" && !Array.isArray(data.attributes) ? data.attributes as Record<string, unknown> : data;
  const relationships = data.relationships && typeof data.relationships === "object" && !Array.isArray(data.relationships) ? data.relationships as Record<string, unknown> : {};
  const shipment = relationships.shipment && typeof relationships.shipment === "object" && !Array.isArray(relationships.shipment) ? relationships.shipment as Record<string, unknown> : {};
  const shipmentData = shipment.data && typeof shipment.data === "object" && !Array.isArray(shipment.data) ? shipment.data as Record<string, unknown> : {};
  const packageId = typeof data.id === "string" ? data.id : typeof root.id === "string" ? root.id : null;
  const providerShipmentId = typeof shipmentData.id === "string" ? shipmentData.id : typeof root.shipment_id === "string" ? root.shipment_id : null;
  const rawStatus = String(attributes.status ?? root.status ?? "").toLowerCase();
  if (!packageId || !providerShipmentId || !rawStatus) throw new Error("SKYDROPX_WEBHOOK_FIELDS_MISSING");
  const returnedStatus = attributes.returned_status == null ? null : String(attributes.returned_status);
  const eventKey = `${packageId}:${rawStatus}:${returnedStatus ?? ""}`;
  return { packageId, providerShipmentId, rawStatus, returnedStatus, normalizedStatus: normalizeStatus(rawStatus), trackingNumber: typeof attributes.tracking_number === "string" ? attributes.tracking_number : null, labelUrl: typeof attributes.label_url === "string" ? attributes.label_url : null, providerEventId: createHash("sha256").update(eventKey).digest("hex") };
}
