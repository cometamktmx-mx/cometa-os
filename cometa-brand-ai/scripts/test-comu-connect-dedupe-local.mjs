import crypto from "node:crypto";

const baseUrl = process.env.COMU_CONNECT_TEST_BASE_URL || "http://127.0.0.1:3000";
const secret = process.env.COMU_STRIPE_CONNECT_WEBHOOK_SECRET;
const accountId = "acct_1UK2cPEYRWi47uGU";
const eventId = "evt_comu_connect_dedupe_test_001";

if (!secret || !secret.startsWith("whsec_")) {
  throw new Error("COMU_STRIPE_CONNECT_WEBHOOK_SECRET is required for the local harness");
}
if (/supabase\.co|zhtagqrzyovsrmsicaot/i.test(baseUrl)) {
  throw new Error("Refusing non-local webhook URL");
}

const payload = JSON.stringify({
  id: eventId,
  object: "event",
  api_version: "2022-08-01",
  created: Math.floor(Date.now() / 1000),
  data: { object: { id: accountId, object: "account" } },
  livemode: false,
  pending_webhooks: 1,
  request: null,
  type: "account.updated",
});

const timestamp = Math.floor(Date.now() / 1000);
const signature = `t=${timestamp},v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;

async function deliver() {
  const response = await fetch(`${baseUrl}/api/comu/stripe/connect-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
  return { status: response.status, body: await response.text() };
}

const first = await deliver();
const second = await deliver();
console.log(JSON.stringify({ eventId, first, second }, null, 2));
