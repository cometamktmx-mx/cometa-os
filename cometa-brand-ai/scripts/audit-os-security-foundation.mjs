import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const files = {
  brandGuard: "src/lib/brand-os/server.ts",
  apiErrors: "src/lib/brand-os/api.ts",
  salesTenant: "src/lib/sales-ai/tenant.ts",
  leads: "src/app/api/sales-ai/leads/route.ts",
  messages: "src/app/api/sales-ai/messages/route.ts",
  sendMessage: "src/app/api/sales-ai/send-message/route.ts",
  playbook: "src/app/api/sales-ai/playbook/route.ts",
  knowledgeContext: "src/app/api/sales-ai/knowledge-context/route.ts",
  playbookContext: "src/app/api/sales-ai/playbook-context/route.ts",
  cosmosGet: "src/app/api/cosmos/get-memory/route.ts",
  cosmosSave: "src/app/api/cosmos/save-memory/route.ts",
  nova: "src/app/api/nova/get-analysis/route.ts",
  atlas: "src/app/api/atlas/publish-strategy/route.ts",
  whatsappWebhook: "src/app/api/webhooks/whatsapp/route.ts",
  playbookHelper: "src/lib/sales-ai/playbook.ts",
  knowledgeHelper: "src/lib/sales-ai/knowledge.ts",
  runtimeHelper: "src/lib/sales-ai-runtime-settings.ts",
};

const source = Object.fromEntries(
  Object.entries(files).map(([name, file]) => [name, read(file)])
);
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({
      name,
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

check("Canonical context composes existing brand guards", () => {
  assert.match(source.brandGuard, /requireBrandAccess\(/);
  assert.match(source.brandGuard, /requireBrandOsAccess\(/);
  assert.match(source.brandGuard, /requireCanonicalBrandContext/);
  assert.match(source.brandGuard, /\.from\("brands"\)/);
  assert.match(source.brandGuard, /\.eq\("name", legacyBrandName\)/);
  assert.doesNotMatch(source.brandGuard, /ilike\(/);
});

check("P0 API routes require canonical context before admin client use", () => {
  for (const name of [
    "leads",
    "messages",
    "sendMessage",
    "playbook",
    "cosmosGet",
    "cosmosSave",
    "nova",
    "atlas",
  ]) {
    const text = source[name];
    assert.match(text, /requireCanonicalBrandContext/);
    assert.match(text, /function getSupabaseAdmin\(/);
    assert.ok(
      text.indexOf("const context = await requireCanonicalBrandContext") <
        text.indexOf("const supabase = getSupabaseAdmin()"),
      `${name}: admin client is created before tenant context`
    );
  }
  for (const name of ["knowledgeContext", "playbookContext"]) {
    const text = source[name];
    const helperName =
      name === "knowledgeContext" ? "getSalesKnowledgeBase" : "getSalesPlaybook";
    assert.match(text, /requireCanonicalBrandContext/);
    assert.ok(
      text.indexOf("const context = await requireCanonicalBrandContext") <
        text.indexOf(`await ${helperName}`),
      `${name}: helper called before tenant context`
    );
  }
});

check("Sales reads are scoped and legacy rows are exact-match only", () => {
  assert.match(source.salesTenant, /\.eq\("brand_slug", context\.brandSlug\)/);
  assert.match(source.salesTenant, /\.eq\("brand_name", context\.brandName\)/);
  assert.match(source.salesTenant, /\.is\("brand_slug", null\)/);
  assert.doesNotMatch(source.messages, /\.eq\("id", finalLeadId\)/);
  assert.match(source.messages, /findSalesLeadForBrand/);
});

check("Send message uses temporary membership authorization", () => {
  assert.match(source.sendMessage, /TEMPORARY AUTHORIZATION MODEL/);
  assert.match(source.sendMessage, /requireCanonicalBrandContext/);
  assert.match(source.sendMessage, /findSalesLeadForBrand/);
  assert.match(source.sendMessage, /supplied by the client are not authorization authority/i);
  assert.doesNotMatch(source.sendMessage, /body\?\.phoneNumberId/);
  assert.doesNotMatch(source.sendMessage, /approvedBy\)\s*\|\|/);
});

check("COSMOS is scoped without fuzzy brand lookup", () => {
  assert.match(source.cosmosGet, /findCosmosMemoryForContext/);
  assert.match(source.cosmosSave, /brand_slug: context\.brandSlug/);
  assert.doesNotMatch(source.cosmosGet, /ilike\(/);
  assert.doesNotMatch(source.cosmosSave, /ilike\(/);
});

check("NOVA and ATLAS verify entity ownership", () => {
  assert.match(source.nova, /belongsToCanonicalBrand/);
  assert.match(source.atlas, /findPublicationForContext/);
  assert.match(source.atlas, /approved_by: context\.userEmail \|\| context\.userId/);
  assert.doesNotMatch(source.atlas, /approvedBy/);
});

check("Dangerous hardcoded brands are absent from touched P0 paths", () => {
  const touched = [
    source.leads,
    source.messages,
    source.sendMessage,
    source.playbook,
    source.knowledgeContext,
    source.playbookContext,
    source.cosmosGet,
    source.cosmosSave,
    source.nova,
    source.atlas,
    source.playbookHelper,
    source.knowledgeHelper,
    source.runtimeHelper,
  ].join("\n");
  assert.doesNotMatch(touched, /Mar Cosmetic|Cometa Mkt|tivana|cometa-mkt/i);
});

check("WhatsApp signature fails closed in production", () => {
  assert.match(source.whatsappWebhook, /NODE_ENV === "production"/);
  assert.match(source.whatsappWebhook, /WHATSAPP_ENFORCE_SIGNATURE/);
  assert.match(source.whatsappWebhook, /Firma de Meta faltante/);
  assert.match(source.whatsappWebhook, /export async function GET/);
  assert.match(source.whatsappWebhook, /export async function POST/);
});

check("Safe error taxonomy exists", () => {
  assert.match(source.apiErrors, /BRAND_NOT_FOUND|INTERNAL_ERROR/);
  assert.match(source.apiErrors, /brandContextErrorResponse/);
  assert.match(source.apiErrors, /invalidRequestResponse/);
});

const failed = checks.filter((item) => !item.passed);
for (const item of checks) {
  console.log(
    `${item.passed ? "PASS" : "FAIL"} ${item.name}${
      item.detail ? ` — ${item.detail}` : ""
    }`
  );
}

console.log(
  JSON.stringify({
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    allChecksPassed: failed.length === 0,
  })
);

if (failed.length) process.exitCode = 1;
