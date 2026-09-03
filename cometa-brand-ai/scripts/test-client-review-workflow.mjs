import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const review = readFileSync("src/lib/mercury/reviews.ts", "utf8");
assert.match(review, /requireAdminWorkspace/);
assert.match(review, /requireBrandOsAccess/);
assert.match(review, /eq\("brand_slug",access\.brand\.slug\)/);
assert.match(review, /asset_snapshot/);
assert.match(review, /content_snapshot/);
assert.match(review, /status","pending/);
assert.match(review, /REVIEW_ALREADY_DECIDED/);
assert.match(review, /changes_requested/);
assert.match(readFileSync("src/lib/mercury/admin-content.ts", "utf8"), /REVIEW_PENDING_LOCK/);
assert.match(readFileSync("src/app/api/admin/brands/[brandSlug]/marketing/content/[contentItemId]/route.ts", "utf8"), /409/);
for (const file of ["src/app/api/admin/brands/[brandSlug]/marketing/content/[contentItemId]/review/route.ts", "src/app/api/os/[brandSlug]/marketing/content/[contentItemId]/review/approve/route.ts", "src/app/api/os/[brandSlug]/marketing/content/[contentItemId]/review/request-changes/route.ts"]) assert.match(readFileSync(file, "utf8"), /brandSlug/);
for (const file of ["src/lib/mercury/reviews.ts", "src/lib/mercury/admin-content.ts", "src/lib/mercury/client-content.ts"]) {
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(source, /\.from\("mercury_content_reviews"\)/, `${file} still targets legacy review table`);
  assert.match(source, /mercury_client_content_reviews|REVIEW_TABLE/);
}
console.log("Client review workflow contract checks: PASS");
