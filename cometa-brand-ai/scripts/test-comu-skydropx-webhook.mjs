import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseSkydropxWebhook, verifySkydropxWebhookSignature } from "../src/lib/comu/skydropx-webhook.ts";

const secret = "webhook-test-secret";
const payload = { data: { id: "package-1", type: "packages", attributes: { status: "delivered", tracking_number: "QA-TRACK", label_url: "https://sandbox.invalid/label", returned_status: null }, relationships: { shipment: { data: { id: "shipment-1", type: "shipments" } } } } };
const raw = JSON.stringify(payload); const signature = createHmac("sha512", secret).update(raw).digest("hex");
assert.equal(verifySkydropxWebhookSignature(raw, `HMAC ${signature}`, secret), true);
assert.equal(verifySkydropxWebhookSignature(raw, `HMAC ${signature}`, "wrong-secret"), false);
assert.equal(verifySkydropxWebhookSignature(`${raw} `, `HMAC ${signature}`, secret), false);
const parsed = parseSkydropxWebhook(payload); assert.equal(parsed.providerShipmentId, "shipment-1"); assert.equal(parsed.normalizedStatus, "DELIVERED"); assert.equal(parsed.trackingNumber, "QA-TRACK"); assert.equal(parsed.labelUrl, "https://sandbox.invalid/label");
const statuses = ["created", "picked_up", "in_transit", "last_mile", "delivered"].map((status) => parseSkydropxWebhook({ data: { id: "package-1", attributes: { status }, relationships: { shipment: { data: { id: "shipment-1" } } } } }));
assert.deepEqual(statuses.map((event) => event.normalizedStatus), ["CREATED", "IN_TRANSIT", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"]);
assert.equal(new Set(statuses.map((event) => event.providerEventId)).size, statuses.length);
const returned = parseSkydropxWebhook({ data: { id: "package-1", attributes: { status: "in_return", returned_status: "returned" }, relationships: { shipment: { data: { id: "shipment-1" } } } } }); assert.equal(returned.normalizedStatus, "EXCEPTION"); assert.equal(returned.returnedStatus, "returned");
console.log("COMU SKYDROPX WEBHOOK CONTRACT TEST PASS");
