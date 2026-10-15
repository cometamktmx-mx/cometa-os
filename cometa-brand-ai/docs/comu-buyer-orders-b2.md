# COMU Buyer Orders B2

## B1 checkpoint

SHA: `f028cb99398806ba1afa979c35a899181e36e10a`.
Message: `feat(comu): establish secure buyer order tracking contract`.
24 selectively staged files; index empty after commit. Shared Account/profile files
contain only B1 changes in that commit. Prior work remains in the working directory.
The exact file list is in `git show --name-only f028cb9` and the B1 documentation.

Pre-commit PASS: PostgreSQL privacy/B1/O1/N1; HTTP B1/O1/N1; N1 concurrency, dedup,
retry and Chromium bell; B1/O1/N1/Seller V4 Node; TypeScript; targeted lint; cached diff check.
Disposable databases `comu_o1_1791244010716`, `comu_n1_1791244363578` and isolated
checkpoint validation `comu_o1_1791244747051` were removed.
The initial isolated export lacked generated next-env.d.ts; this was repaired only
in the temporary test environment and the HTTP suite was rerun successfully.

Preexisting limitation: the committed Seller layout imports untracked account-access.ts.
An isolated export requires that unchanged workspace dependency for TypeScript/runtime.
It was not committed with B1 and Seller code was not changed to mask this dependency.

## Visual scope and routes

Reference inspected before UI changes:
`docs/visual-references/comu-buyer-orders-tracking-approved.png`.

- `/comu/account/orders`: B1 summary cards and server filters/search/30-90/pagination.
- `/comu/account/orders/{id}?view=detail`: cohesive B1 detail, no confirmation redirect.
- Legacy Account section links route to the canonical list. The original no-query checkout
  polling/confirmation entry is preserved in payment-entry.tsx; tracking links request detail.
- Optional suborderId/notificationId is passed to B1 for owner/recipient validation. A returned
  safe focusSuborderId highlights and focuses the corresponding brand.
- Existing Marketplace header/footer retained. No Seller Shell or Buyer notification bell.

Detail uses presentationStatus/presentationLabel, never a single suborder to determine
master copy. Milestones group only persisted timeline labels, preserving brand context and
the first actual recorded timestamp; the full event timeline remains visible below.
These checks denote observed events, not completion by every seller. No pending stage dates
or completion timestamps are generated. Brand progress expands independently.

HUB receipt X/Y and consolidation use B1 exactly. DIRECT shows no HUB panel. Mixed legacy
routes show B1's conservative warning and per-brand progress rather than a complete combined
shipping promise. Shipping mode is not treated as fulfillment route.

Products use historical snapshots; logos use public current identity. No catalog request
is made by either Orders surface. Null images use COMU placeholders. Economics/currency,
successful refunds, own address without phone and generic issues are projected by B1.
Payment is shown separately. No cancel/restock/return/warranty/dispute actions are offered.

The same DTO drives all viewports. Filters issue server queries; no client history filtering.
Read changes discard obsolete results, abort prior requests, show loading and fail safely.
Retry clears the previous display. Changing an order never retains another order's data.

ETA and public tracking URL are conditional slots only. Current B1 returns null, so no ETA
or external tracking CTA is rendered. React never derives carrier URLs or delivery dates.
Future non-null B1 values can render without layout redesign.

## Comparison with approved reference

| Element | B2 |
|---|---|
| Warm cream / deep green / editorial headings | Implemented |
| Snapshot cards / folio / date / brands / totals / status | Implemented from B1 |
| Status tabs / search / period / pagination | Real server behavior |
| Hero / recorded timeline / brand breakdown | Implemented with actual scope |
| HUB receipt progress | Explicit received X/Y, not ambiguous ready counts |
| Tracking / summary / delivery address | Safe B1 fields only |
| Phone | Cards, vertical detail, touch targets and Buyer navigation |
| Tablet | Responsive grid; no horizontal desktop table |
| Mockup ETA / carrier CTA | Omitted while null, supported conditional layout |
| Mockup support/contact promise | Omitted; no certified workflow |
| Bell | Not implemented; separately scoped |
| Packaging photograph in thank-you banner | Typographic COMU panel; no invented asset |
| Example names/amounts/photos | Not copied; evidence uses synthetic DB fixtures |

## Verification and evidence

Commands:

```text
node scripts/test-comu-buyer-orders-b2-node.mjs
node scripts/test-comu-buyer-orders-b2-local.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
git -c core.safecrlf=false diff --check
```

Targeted ESLint covers the B2 routes/components and the two Account integration files.
The PostgreSQL/HTTP/Chromium test reuses disposable B1/O1 infrastructure. No principal or
remote migrations, live email, carrier operations or production changes occur.
Fixture images are a test-only SVG persisted in an order snapshot and a missing-image case;
they are not stock photography, production assets or private customer fixtures.

PASS completed in disposable `comu_o1_1791251979195`: B1/privacy PostgreSQL, O1 SQL/HTTP,
B2 HTTP/Chromium (1440/820/390), server filters/search/period/pagination, N1 notification
focus, HUB unequal receipt and real consolidation, DIRECT out-for-delivery, issue,
successful refund, USD, loading/error/retry and safe unavailable-order display. Database
removed. B2 Node, B1/O1/N1/Seller V4 Node, TypeScript, targeted lint and diff-check PASS.
The final screenshot review moved the DIRECT editorial closing panel to the last grid row;
the browser suite also asserts it follows the economics panel.

Final regeneration and regression run: `comu_o1_1791252435940`, exit 0, PASS.
The disposable database was removed. The regenerated DIRECT capture was inspected:
the closing panel follows the summary. All nine captures are available, with no horizontal
overflow at the certified viewports. Local development captures include the Next.js
development indicator and the unchanged Marketplace footer.
B2 ready for manual visual approval: YES. Visual approval itself remains with the user.

The mixed-route Node fixture has a shipped DIRECT part and a preparing HUB part. It renders
partial-progress copy and the independent-shipment limitation, never complete consolidation.
Calendar-only future ETA dates retain their calendar day; current null ETA remains hidden.
Earlier rejected synthetic fixtures were corrected to satisfy existing variant/seller/C1
integrity guards. No guards were disabled. Cold development compilation initially triggered
the UI timeout; the test harness warms existing Marketplace routes before interaction,
without relaxing the UI's timeout or replacing API responses with mocks.

Evidence directory: `docs/evidence/comu-buyer-orders-b2/`.
Expected captures: buyer-orders-desktop.png, buyer-order-detail-hub-desktop.png,
buyer-order-detail-direct-desktop.png, buyer-orders-phone.png, buyer-order-detail-phone.png,
buyer-order-unequal-progress.png, buyer-order-issue.png, buyer-order-tablet.png,
buyer-order-consolidated.png. certification.json records final browser verification.

## B2 files

New:

```text
src/app/comu/account/orders/buyer-orders-ui.tsx
src/app/comu/account/orders/buyer-orders-client.tsx
src/app/comu/account/orders/buyer-orders.css
src/app/comu/account/orders/[id]/payment-entry.tsx
scripts/test-comu-buyer-orders-b2-local.mjs
scripts/test-comu-buyer-orders-b2-http.mjs
scripts/test-comu-buyer-orders-b2-node.mjs
docs/comu-buyer-orders-b2.md
docs/comu-buyer-orders-b2-git-status.txt
docs/evidence/comu-buyer-orders-b2/
```

Modified:

```text
src/app/comu/account/orders/page.tsx
src/app/comu/account/orders/[id]/page.tsx
src/app/comu/account/buyer/page.tsx
src/app/comu/account/buyer/buyer-account.tsx
```

Account files already contained unrelated Buyer changes. B2 adds only canonical Orders
navigation there; existing Account redesign is preserved. No B1 functional files, O1,
N1, Seller, POS, schema or production configuration are changed by B2.
No B2 commit, push or deploy.
