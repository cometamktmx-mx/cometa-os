# COMU Buyer Notifications UI

## B2 checkpoint

SHA: `3e024038b393b1523cb7428369e1f24648d9a2e9`.
Message: `feat(comu): redesign buyer order tracking experience`.
23 selectively staged files. Index empty after commit. Existing Account redesign,
Seller, Home, POS/Mobile and other unrelated work were excluded and preserved.
The user approved B2 functional and visual review before requesting this checkpoint.
Account staging contains only canonical Orders navigation, adapted to its committed
version; the preexisting Account CSS import remains outside the checkpoint.

Precommit certification PASS:
- B2 PostgreSQL/HTTP/Chromium; B1/privacy and ownership/dual identity SQL; O1 SQL/HTTP.
- N1 notification deep link and safe suborder focus through B1/B2.
- B2/B1/O1/N1/Seller V4 Node, TypeScript, targeted ESLint, cached diff-check.
- Disposable `comu_o1_1791253216116` removed on completion, exit 0.

The first TypeScript attempt encountered an already malformed generated
`.next/dev/types/validator.ts`. `next typegen` regenerated route types; the malformed
dev artifact was preserved as `.invalid.txt` in the ignored cache. TypeScript then
passed. No source or tsconfig workaround was introduced.

Exact B2 commit manifest (paths relative to this app):

```text
docs/comu-buyer-orders-b2-git-status.txt
docs/comu-buyer-orders-b2.md
docs/evidence/comu-buyer-orders-b2/buyer-order-consolidated.png
docs/evidence/comu-buyer-orders-b2/buyer-order-detail-direct-desktop.png
docs/evidence/comu-buyer-orders-b2/buyer-order-detail-hub-desktop.png
docs/evidence/comu-buyer-orders-b2/buyer-order-detail-phone.png
docs/evidence/comu-buyer-orders-b2/buyer-order-issue.png
docs/evidence/comu-buyer-orders-b2/buyer-order-tablet.png
docs/evidence/comu-buyer-orders-b2/buyer-order-unequal-progress.png
docs/evidence/comu-buyer-orders-b2/buyer-orders-desktop.png
docs/evidence/comu-buyer-orders-b2/buyer-orders-phone.png
docs/evidence/comu-buyer-orders-b2/certification.json
scripts/test-comu-buyer-orders-b2-http.mjs
scripts/test-comu-buyer-orders-b2-local.mjs
scripts/test-comu-buyer-orders-b2-node.mjs
src/app/comu/account/buyer/buyer-account.tsx
src/app/comu/account/buyer/page.tsx
src/app/comu/account/orders/[id]/page.tsx
src/app/comu/account/orders/[id]/payment-entry.tsx
src/app/comu/account/orders/buyer-orders-client.tsx
src/app/comu/account/orders/buyer-orders-ui.tsx
src/app/comu/account/orders/buyer-orders.css
src/app/comu/account/orders/page.tsx
```

The existing untracked account-access dependency noted in B1/B2 docs remains outside
this checkpoint; it was neither changed nor silently included.

## UI contract

Marketplace header mounts BuyerNotificationBell. Seller Shell and the auth-only layout
remain unchanged. Browser Auth verifies identity; anonymous users have no private bell.
Every read/mutation still goes through N1 server authentication, active profile checks,
recipient ownership and audience filtering. No profile is provisioned by this UI.

The bell always uses `audience=BUYER`, even for dual Buyer+Seller identities. It displays
up to 10 recent N1 notifications and the server's full unread count, with no Seller inbox
aggregation. Read and read-all use the existing PATCH API. A failed mutation preserves
the unread display; successful mutation refreshes from N1 rather than decrementing
optimistically. Background reads refresh each minute while visible and on focus.

Opening a notification does **not** mark it read automatically. Separate explicit read
controls are intentional: failed navigation never consumes unread. All read actions,
including read-all, apply only to the Buyer audience. Zero unread still shows recent
read notifications; an empty inbox has its own state.

N1 owns body, event mapping and scope. The presentation helper qualifies SUBORDER titles
as "Una parte de tu pedido..." for existing kinds only, including DELIVERED. MASTER
titles remain N1 copy. Unsupported kinds receive a generic scoped heading, never a new
fulfillment state. N1 has no OUT_FOR_DELIVERY notification mapping: no reparto event or
copy is fabricated by this UI.

Links accept only canonical N1 `/comu/account/orders/{uuid}?view=detail`, appending the
notification UUID as `notificationId`. B1 verifies the order owner and the notification
recipient/order/audience before resolving a safe suborder focus. No token, raw payload,
address, phone, private tracking URL or provider identifier enters the dropdown or URL.
The existing B2 focus behavior is reused without changes.

Requests are abortable and time-limited. Auth identity changes unmount the prior keyed
inbox; stale reads cannot repopulate it. 401/403 removes the private UI. Errors provide
retry, loading is explicit, and unknown unread is not presented as zero.

Desktop uses a cream/green popover; phone uses a bounded fixed panel with independent
scroll, touch targets, Escape/outside/close handling and focus restoration. No new nav
system, Buyer redesign, Seller redesign or notification engine was introduced.

## Verification

Commands:

```text
node scripts/test-comu-buyer-notifications-node.mjs
node scripts/test-comu-buyer-notifications-local.mjs
node scripts/test-comu-buyer-privacy-b1-local.mjs --n1-only
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node node_modules/eslint/bin/eslint.js src/app/comu/layout.tsx src/app/comu/components/buyer-notification-bell.tsx src/lib/comu/buyer-notification-presentation.ts
git -c core.safecrlf=false diff --check
```

The local notification harness reruns unchanged B2 UI regression, B1/privacy and O1.
B2 regression captures go to its temporary workspace, preserving committed evidence.
The additional browser test uses actual N1 rows emitted from persisted synthetic order
events, real Auth cookies and the real B1/N1 HTTP APIs. Network failures/delays are
simulated without replacing successful API payloads. No customer fixtures or real email.

Node presentation, N1 Node, TypeScript and targeted lint: PASS.
N1 PostgreSQL/worker regression: PASS in disposable `comu_n1_1791254772112`, removed,
including independent-session concurrent claims, dedup, rollback, retry/backoff,
stale recovery/fencing, revocation, RLS and source reconciliation. Provider MOCK only.

First combined browser run (`comu_o1_1791254568945`, removed) reached the new bell and
exposed missing browser Auth CORS preflight handling in the isolated gateway. The
test-only gateway now handles OPTIONS for the single local app origin, with real
GoTrue requests/responses unchanged. No application auth check was bypassed. The
combined suite is rerun after this harness correction.

The next disposable run (`comu_o1_1791255066082`, removed) exposed cold N1 route
compilation blocking a timed B2 request. N1 is now warmed alongside the existing
Marketplace routes before interaction, with application timeouts unchanged.
Run `comu_o1_1791255454880` (removed) passed B2 browser regression and Buyer inbox/
deep-link assertions; its read test needed a null-safe DOM wait while the real PATCH
refresh temporarily replaces rows with loading. The application mutation returned 200.
That wait is corrected. These failed combined attempts are not reported as full PASS.

Run `comu_o1_1791255933547` (removed) additionally passed one-read, read-all, Buyer/Seller
unread isolation and phone layout; a quoted selector in the loading test was repaired.
All 33 browser expressions were then parsed before execution.
Run `comu_o1_1791256348116` (removed) completed Buyer Notifications and B2 HTTP/Chromium
in PASS. The following O1 regression correctly saw the still-present synthetic dual
membership as Seller access. The new harness now asserts the fixture starts without
that membership and removes only its own temporary membership before the unchanged O1
Buyer-only denial assertion. No application permission or O1 assertion was changed.

Buyer Notifications and B2 HTTP/Chromium also passed in the final combined run
`comu_o1_1791256868971`. The complete process exited 0: O1 SQL/HTTP, signed webhook,
roles, single/multi-store routing and logout PASS. The disposable database was removed.
Captures were inspected at 1440px desktop and 390px phone;
the scrollable list keeps header/footer controls visible and has no horizontal overflow.

Evidence (synthetic data; includes the local Next.js development indicator):
- `docs/evidence/comu-buyer-notifications/buyer-notifications-desktop.png`
- `docs/evidence/comu-buyer-notifications/buyer-notifications-phone.png`
- `docs/evidence/comu-buyer-notifications/buyer-notifications-empty.png`
- `docs/evidence/comu-buyer-notifications/buyer-notifications-deep-link.png`
- `docs/evidence/comu-buyer-notifications/certification.json`

## Email delivery: external activation still pending

No Resend configuration, DNS, API key, remote cron or real delivery was performed.
Existing transport is server-only. Required future authorized actions:

1. Select an organization-owned sending domain/subdomain and verify it in the correct
   Resend account. The repository does not establish an approved literal sender domain;
   it must be supplied/confirmed by COMU. A placeholder is not a configured sender.
2. Publish the exact DKIM/SPF DNS records generated for that domain (TXT, MX or CNAME
   as shown by Resend), verify them, and configure DMARC appropriately. Do not replace
   unrelated existing mail records. [Official domain setup](https://resend.com/docs/add-a-domain).
3. Authorize a sending API key restricted to the intended domain where appropriate.
   [Official API key management](https://resend.com/docs/dashboard/api-keys/introduction).
4. Set server variables: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `COMETA_APP_ORIGIN`,
   `COMU_NOTIFICATIONS_WORKER_SECRET`. The current sender validator accepts a plain
   address such as `notificaciones@<verified-domain>`, not `COMU <address>`.
   Origin must be the canonical HTTPS app origin with no path. Worker secret must be
   at least 32 characters. No variable values or secrets were inspected for this task.
5. Review pending/retry/failed email intents before enabling the existing
   `COMU_NOTIFICATIONS_EMAIL_ENABLED=true` flag. Domain verification alone does not
   activate N1 email. Do not silently replay old customer intents during certification.
6. After authorization, schedule authenticated server-side POST
   `/api/comu/notifications/dispatch` with `Authorization: Bearer <worker-secret>`.
   Existing recommendation: each minute, monitor backlog/FAILED and bounded worker
   capacity (current batch up to 10). No production scheduler was enabled here.
7. Perform one explicitly authorized end-to-end delivery to a controlled recipient:
   new real event, outbox, worker, provider acceptance, actual inbox receipt and safe
   deep link under the correct Buyer account; verify retry/idempotency using the same
   outbox key. N1 uses `comu-n1/{outboxId}` and bounded retry windows. Provider acceptance
   is not proof of inbox receipt; N1 currently has no delivered/bounce webhook tracking.

Provider delivery remains MANUAL/PENDING. No additional migration is needed for this
UI or the existing transport activation. New bounce/delivery tracking would be a
separately scoped capability, not silently included here.

## Files in this UI block

Modified:
- `src/app/comu/layout.tsx` (import and header insertion only).

New:
- `src/app/comu/components/buyer-notification-bell.tsx`
- `src/app/comu/components/buyer-notification-bell.css`
- `src/lib/comu/buyer-notification-presentation.ts`
- `scripts/test-comu-buyer-notifications-node.mjs`
- `scripts/test-comu-buyer-notifications-local.mjs`
- `scripts/test-comu-buyer-notifications-http.mjs`
- `docs/comu-buyer-notifications-ui.md`
- `docs/comu-buyer-notifications-git-status.txt`
- `docs/evidence/comu-buyer-notifications/` (desktop, phone, empty, deep link, certification).

No Notifications UI commit, push, deploy or following block.

## Final status

- Buyer Notifications UI READY: YES.
- Additional migration required: NO.
- Real email provider delivery: MANUAL/PENDING; activation was not performed.
- TypeScript, targeted lint and diff-check: PASS.
- Final index: empty. HEAD remains the B2 checkpoint `3e024038b393b1523cb7428369e1f24648d9a2e9`.
- Unrelated preexisting work remains preserved. Complete status is in
  `docs/comu-buyer-notifications-git-status.txt`.
