import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260901090000_cometa_activity_events_v1.sql"
);
const activity = read("src/lib/cosmos/activity.ts");
const adminContent = read("src/lib/mercury/admin-content.ts");
const reviews = read("src/lib/mercury/reviews.ts");
const recentActivity = read(
  "src/app/brand/[brandSlug]/os/components/recent-activity.tsx"
);

const eventTypes = [
  "content.created",
  "content.updated",
  "content.asset_uploaded",
  "content.sent_for_review",
  "content.resent_for_review",
  "content.changes_requested",
  "content.approved",
  "content.scheduled",
  "content.published",
  "content.analyzed",
];
for (const eventType of eventTypes) {
  assert.match(migration, new RegExp(`'${eventType.replace(".", "\\.")}'`));
  assert.match(activity, new RegExp(`"${eventType.replace(".", "\\.")}"`));
}

const visibility = {
  "content.created": "internal",
  "content.updated": "internal",
  "content.asset_uploaded": "internal",
  "content.sent_for_review": "client",
  "content.resent_for_review": "client",
  "content.changes_requested": "client",
  "content.approved": "client",
  "content.scheduled": "client",
  "content.published": "client",
  "content.analyzed": "client",
};
for (const [eventType, audience] of Object.entries(visibility)) {
  assert.match(
    activity,
    new RegExp(`"${eventType.replace(".", "\\.")}": "${audience}"`)
  );
}

assert.match(migration, /dedupe_key text not null/);
assert.match(migration, /unique index cometa_activity_events_dedupe_uidx/);
assert.match(migration, /schema_version smallint not null default 1/);
assert.match(migration, /schema_version >= 1/);
assert.match(activity, /COMETA_ACTIVITY_SCHEMA_VERSION = 1 as const/);
assert.match(activity, /schema_version: COMETA_ACTIVITY_SCHEMA_VERSION/);

const callerContract = activity.slice(
  activity.indexOf("export type RecordCometaActivityEventInput"),
  activity.indexOf("export type CometaActivityEvent =")
);
assert.doesNotMatch(callerContract, /visibility\s*[?:]/);
assert.doesNotMatch(callerContract, /dedupe_key\s*[?:]/);
assert.doesNotMatch(callerContract, /schema_version\s*[?:]/);
assert.doesNotMatch(callerContract, /metadata\s*[?:]/);

const metadataBuilder = activity.slice(
  activity.indexOf("function compactMetadata"),
  activity.indexOf("function dedupeKey")
);
for (const forbidden of [
  "private_notes",
  "raw_ai_data",
  "signedUrl",
  "signed_url",
  "token",
  "storage_path",
  "content_snapshot",
  "asset_snapshot",
]) {
  assert.doesNotMatch(metadataBuilder, new RegExp(forbidden, "i"));
}
for (const allowed of [
  "content_item_id",
  "review_id",
  "asset_id",
  "content_type",
  "platform",
  "status_from",
  "status_to",
]) {
  assert.match(metadataBuilder, new RegExp(allowed));
}

assert.match(activity, /\.eq\("brand_id", access\.brand\.id\)/);
assert.match(activity, /\.eq\("brand_slug", access\.brand\.slug\)/);
assert.match(activity, /requireBrandOsAccess\(input\.brandSlug\)/);
assert.match(activity, /query\.eq\("visibility", "client"\)/);
assert.match(activity, /query\.in\("visibility", \["internal", "client"\]\)/);

assert.match(adminContent, /persistedMutationAt:updated\.updatedAt/);
assert.match(adminContent, /occurredAt:updated\.updatedAt/);
assert.doesNotMatch(adminContent, /persistedMutationAt:new Date/);
assert.doesNotMatch(adminContent, /persistedMutationAt:Date\.now/);
assert.match(adminContent, /_wasCreated:false/);
assert.match(adminContent, /_wasCreated:true/);
assert.match(adminContent, /if\(_wasCreated\)\{await recordCometaActivityEventAfterMutation/);

const legacyFiles = [
  "src/app/api/mercury/content-item/create/route.ts",
  "src/app/api/mercury/content-item/update/route.ts",
  "src/app/api/mercury/assets/add-link/route.ts",
];
for (const file of legacyFiles) {
  const source = read(file);
  assert.doesNotMatch(source, /cosmos\/activity/);
  assert.doesNotMatch(source, /recordCometaActivityEvent/);
}

assert.doesNotMatch(adminContent, /eventType:"content\.analyzed"/);
assert.doesNotMatch(reviews, /eventType:"content\.analyzed"/);
assert.match(reviews, /if\(existing\.data\)return \{review:existing\.data,duplicate:true\}/);

const produced = [
  "content.created",
  "content.updated",
  "content.asset_uploaded",
  "content.sent_for_review",
  "content.resent_for_review",
  "content.changes_requested",
  "content.approved",
  "content.scheduled",
  "content.published",
];
for (const eventType of produced) {
  assert.match(
    `${adminContent}\n${reviews}`,
    new RegExp(eventType.replace(".", "\\."))
  );
}

assert.equal(
  (adminContent.match(/recordCometaActivityEventAfterMutation/g) || []).length,
  4,
  "Admin producers must stay centralized in create, update, and finalize plus import"
);
assert.equal(
  (reviews.match(/recordCometaActivityEventAfterMutation/g) || []).length,
  2,
  "Review events must pass through one local dispatcher plus import"
);

assert.match(recentActivity, /getBrandActivity/);
assert.match(recentActivity, /audience: "client"/);
assert.match(recentActivity, /No hay actividad registrada todavía\./);
assert.doesNotMatch(recentActivity, /mercury_content_items/);

console.log("COSMOS Event Foundation V1 contract checks: PASS");
