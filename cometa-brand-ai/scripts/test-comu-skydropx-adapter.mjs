import assert from "node:assert/strict";
import { SkydropxShippingProvider } from "../src/lib/comu/shipping-provider.ts";
import { chooseServices } from "../src/lib/comu/shipping-pricing.ts";

process.env.SKYDROPX_ENV = "sandbox";
process.env.SKYDROPX_CLIENT_ID = "test-client";
process.env.SKYDROPX_CLIENT_SECRET = "test-secret";

const originalFetch = globalThis.fetch;
const input = { orderId: "qa", destination: { country_code: "MX", postal_code: "21000", area_level1: "Baja California", area_level2: "Mexicali", area_level3: "Centro", origin: { country_code: "MX", postal_code: "38800", area_level1: "Guanajuato", area_level2: "Moroleón", area_level3: "Centro" } }, packages: [{ weightKg: 5, lengthCm: 20, widthCm: 30, heightCm: 30 }] };
const response = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith("/oauth/token")) {
    assert.equal(init.headers["content-type"], "application/x-www-form-urlencoded");
    assert.match(String(init.body), /grant_type=client_credentials/);
    return response(200, { access_token: "test-token", expires_in: 3600 });
  }
  if (String(url).endsWith("/quotations")) {
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    assert.equal(body.quotation.address_from.postal_code, "38800");
    assert.equal(body.quotation.address_to.postal_code, "21000");
    assert.deepEqual(body.quotation.parcels[0], { length: 20, width: 30, height: 30, weight: 5 });
    return response(201, { id: "quote-1", is_completed: false });
  }
  if (String(url).endsWith("/quotations/quote-1")) return response(200, { id: "quote-1", is_completed: true, rates: [
    { id: "rate-standard", provider_display_name: "Carrier A", provider_service_code: "standard", provider_service_name: "Ground", total: 180, currency_code: "MXN", days: 7, shipment_creation_type: "single" },
    { id: "rate-fast", provider_display_name: "Carrier B", provider_service_code: "fast", provider_service_name: "Next Day", total: 360, currency_code: "MXN", days: 2, shipment_creation_type: "single" }
  ] });
  throw new Error("unexpected URL");
};

const rates = await new SkydropxShippingProvider().quote(input);
assert.equal(rates.length, 2);
assert.equal(rates[0].providerRateId, "rate-standard");
assert.equal(rates[1].currency, "MXN");
const packageInfo = { weightKg: 5, lengthCm: 20, widthCm: 30, heightCm: 30, itemCount: 1, preset: "CUSTOM" };
const selected = chooseServices(rates.map((rate) => ({ ...rate, provider: "SKYDROPX", package: packageInfo })));
assert.equal(selected.standard?.serviceCode, "standard");
assert.equal(selected.fast?.serviceCode, "fast");
assert.equal(calls.filter((call) => call.url.includes("/quotations/")).length, 1);

globalThis.fetch = async (url) => String(url).endsWith("/oauth/token") ? response(200, { access_token: "test-token" }) : response(200, { id: "empty", is_completed: true, rates: [] });
assert.deepEqual(await new SkydropxShippingProvider().quote(input), []);

globalThis.fetch = async () => response(401, { error: "unauthorized" });
await assert.rejects(() => new SkydropxShippingProvider().quote(input), /SKYDROPX_AUTH_401/);

globalThis.fetch = async (url) => String(url).endsWith("/oauth/token") ? response(200, { access_token: "test-token" }) : response(201, { is_completed: true });
await assert.rejects(() => new SkydropxShippingProvider().quote(input), /SKYDROPX_QUOTE_ID_MISSING/);

globalThis.fetch = originalFetch;
console.log("COMU SKYDROPX ADAPTER CONTRACT TEST PASS");
