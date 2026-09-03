import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const resolver = await readFile("src/lib/studio/changes.ts", "utf8");
const server = await readFile("src/lib/studio/server.ts", "utf8");
const list = await readFile("src/app/studio/changes/page.tsx", "utf8");
const detail = await readFile("src/app/studio/pieces/[pieceId]/page.tsx", "utf8");
const workflow = await readFile("src/lib/studio/workflow.ts", "utf8");

assert.match(resolver, /mercury_client_content_reviews/); assert.doesNotMatch(resolver, /\.from\(["']mercury_content_reviews["']\)/);
assert.match(resolver, /latestReview\.status === "changes_requested"/); assert.match(resolver, /source: "client"/); assert.match(resolver, /source: "internal"/);
assert.match(resolver, /\.eq\("is_private", true\)/); assert.match(resolver, /\.eq\("user_role", "cometa"\)/); assert.doesNotMatch(resolver, /private_notes/);
assert.match(resolver, /\.eq\("assigned_to", userId\)/); assert.match(resolver, /\.in\("brand_slug", allowedBrandSlugs\)/); assert.match(server, /\.eq\("assigned_to", studio\.userId\)/);
assert.match(resolver, /createSignedUrls\(paths, 900\)/); assert.doesNotMatch(resolver, /signedUrl.*insert|signedUrl.*update/);
for (const text of ["brandName", "contentType", "distributionType", "change.message", "requestedAt", "Resolver cambios"]) assert.match(list, new RegExp(text.replace(".", "\\.")));
assert.match(list, /Cambio del cliente/); assert.match(list, /Cambio interno/); assert.match(list, /Todo al día/);
const changeAt = detail.indexOf("CAMBIOS SOLICITADOS"); const deliverableAt = detail.indexOf("<Deliverable"); const infoAt = detail.indexOf("INFORMACIÓN DE PIEZA"); const referencesAt = detail.indexOf("REFERENCIAS");
assert.ok(changeAt > 0 && deliverableAt > changeAt && infoAt > deliverableAt, "Change and deliverable must precede piece information"); assert.ok(referencesAt > infoAt, "References must remain separate from current deliverable");
assert.match(detail, /WorkflowActions/); assert.match(workflow, /changes_requested.*design_uploaded/); assert.doesNotMatch(resolver + list + detail, /\.insert\(|\.update\(/, "Studio Changes read model must remain read-only");
console.log("Studio Changes V1 contracts: OK (read-only)");
