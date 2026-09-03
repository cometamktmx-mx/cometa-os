import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const model = await readFile("src/lib/workspace/content.ts", "utf8");
const ui = await readFile("src/app/workspace/content/content-client.tsx", "utf8");
const calendar = await readFile("src/app/workspace/brands/[brandSlug]/calendar/page.tsx", "utf8");
const shell = await readFile("src/app/workspace/components/workspace-shell.tsx", "utf8");
const presentation = await readFile("src/lib/workspace/content-presentation.ts", "utf8");

assert.match(model, /requireAdminWorkspace\(\)/, "Global Content must be Admin-only");
assert.match(model, /mercury_content_items/); assert.match(model, /publish_date/); assert.match(model, /mercury_calendars/); assert.match(model, /period_source: "calendar"/);
assert.match(model, /\.gte\("publish_date", start\)/); assert.match(model, /\.lt\("publish_date", end\)/); assert.match(model, /\.is\("publish_date", null\)/);
for (const filter of ["brand", "group", "distribution", "assignee", "contentType", "search"]) assert.match(ui, new RegExp(`\\[${filter},`));
for (const group of ["planned", "production", "review", "changes", "client", "scheduled", "published"]) assert.match(presentation, new RegExp(group));
assert.match(ui, /Activación prevista/); assert.match(ui, /distributionLabel/); assert.match(ui, /statusLabel/);
assert.doesNotMatch(ui, /ROAS|ad set|employee score|productivity/i, "No fake metrics are allowed");
assert.match(ui, /item=/); assert.match(calendar, /searchParams\.get\("item"\)/); assert.match(calendar, /data\?\.items\.some/, "Query item must be checked against canonical calendar response");
assert.match(shell, /\/workspace\/content/); assert.match(shell, /\/workspace\/approvals/);
console.log("Global Content V1 contracts: OK (read-only)");
