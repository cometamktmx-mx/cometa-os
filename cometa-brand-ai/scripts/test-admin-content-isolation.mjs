import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const adapter = readFileSync("src/lib/mercury/admin-content.ts", "utf8");
const detailRoute = readFileSync("src/app/api/admin/brands/[brandSlug]/marketing/content/[contentItemId]/route.ts", "utf8");
const client = readFileSync("src/lib/mercury/client-content.ts", "utf8");

assert.match(adapter, /requireAdminWorkspace/);
assert.match(adapter, /requireBrandAccess/);
assert.match(adapter, /contains\("metadata",\{storage_path:input.path\}\)/);
assert.match(adapter, /eq\("brand_slug",brand\.slug\)/);
assert.match(adapter, /private_notes/);
assert.match(adapter, /assigned_to/);
assert.match(detailRoute, /getAdminContentDetail/);
assert.match(detailRoute, /CONTENT_NOT_FOUND/);
assert.doesNotMatch(client, /privateNotes/);
assert.doesNotMatch(client, /assignedTo/);
assert.match(adapter, /new Date\(`\$\{d\}T00:00:00Z`\)/);
console.log("Admin content isolation contract checks: PASS");
