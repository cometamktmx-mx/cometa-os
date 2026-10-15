import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const approvals = await readFile("src/lib/workspace/approvals.ts", "utf8");
const route = await readFile("src/app/api/admin/approvals/route.ts", "utf8");
const ui = await readFile("src/app/workspace/approvals/approvals-client.tsx", "utf8");
const presentation = await readFile("src/lib/workspace/content-presentation.ts", "utf8");

assert.match(approvals, /requireAdminWorkspace\(\)/, "Approval Center must be Admin-only");
assert.match(approvals, /mercury_client_content_reviews/, "Canonical client reviews must be used");
assert.doesNotMatch(approvals, /\.from\(["']mercury_content_reviews["']\)/, "Legacy reviews must not be authority");
for (const bucket of ["internal_review", "ready_for_client", "internal_changes", "client_changes", "client_reviewing"]) assert.match(presentation, new RegExp(bucket));
assert.match(approvals, /latestReviewStatus === "changes_requested"/, "Client changes classification must use latest canonical review");
assert.match(approvals, /mercury_content_comments/); assert.match(approvals, /is_private: true/); assert.match(approvals, /comment\.length < 3/);
assert.match(approvals, /\["design_uploaded", "internal_review"\]/); assert.match(approvals, /approved_internal/);
assert.match(approvals, /sendForReview\(/, "Client submission must reuse canonical flow");
assert.match(approvals, /\.in\("status", fromStatuses\)/, "Transitions must be conditionally guarded");
assert.match(route, /ACTIONS/); assert.match(route, /mutateApproval/);
assert.match(ui, /Pedir cambios/); assert.match(ui, /Aprobar internamente/); assert.match(ui, /Enviar al cliente/);
assert.match(ui, /APPROVAL_BUCKET_LABELS/); assert.doesNotMatch(ui, /mercury_content_reviews/);
console.log("Approval Center V1 contracts: OK (read-only)");
