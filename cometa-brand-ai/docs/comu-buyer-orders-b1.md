# COMU Buyer B1 — privacy and order read contract

## Privacy boundary

Authorized migration: `supabase/migrations/20261005170000_comu_buyer_order_read_privacy_v1.sql`.
Apply ONLY in disposable local PostgreSQL during certification. No principal or remote installation.
O1 owns transitions; N1 owns notifications. This migration does not write business data,
add states, persist ETA/URLs, change refunds/cancellation or create a second order model.

Verified identity: `auth.uid() -> comu_buyers.user_id -> comu_orders.buyer_id`.
Buyer RPC requires `user_profiles.status = 'active'`; missing/inactive profiles fail closed.
It never upserts buyers or profiles. Seller membership does not bypass Buyer ownership.
Public seller logo is current public identity, not a historical snapshot.

## Effective grant audit (before changes)

Read-only `information_schema.columns` plus `has_column_privilege('authenticated', ...,
'SELECT')` against local schema. No commercial data was queried. Grants were subsequently
replayed from a schema-only dump in disposable PostgreSQL. `READ` is column permission,
not an assertion that every row passes RLS.

All columns of the following tables were readable at the grant layer:
orders, suborders, items, snapshots, order events, fulfillment events, incidents,
HUB receipts, shipments, shipment-suborder links, shipping webhook events, shipping quotes,
payment intents, payment allocations, payment economics and refund allocations.
All columns of `comu_refunds` and `comu_disputes` were already denied.

Classification: **A** safe direct columns under existing RLS plus active-profile check;
**B** internal relational/operational data, not Buyer output;
**C** sensitive/private data; **D** server/RPC-only containers requiring projection.
Columns not explicitly granted A remain denied. Service-role privileges are preserved.

| Table (`comu_` prefix) | A: direct safe columns | B: internal | C: sensitive | D: server/RPC only |
|---|---|---|---|---|
| orders | id, buyer_id (RLS key), order_number, status, currency, subtotal, discount_total, shipping_total, points_total, grand_total, created_at, cancelled_at, fulfillment_status, shipping_mode | reservation_id, updated_at, fulfillment_updated_at, shipping_quote_id, platform_fee_bps, guarantee_days | idempotency_key | shipping_address_snapshot, shipping_snapshot |
| order_suborders | id, order_id, seller_id, status, subtotal, discount_total, shipping_total, grand_total, created_at, fulfillment_status, fulfillment_route | updated_at, cancelled_at, deadline_at, overdue, package_count, delivered_at, guarantee_expires_at | hub_handoff_token | — |
| order_items | id, order_id, suborder_id, seller_id, quantity, unit_price, subtotal, created_at | listing_id, variant_listing_id, product_id, variant_id | — | — |
| order_item_snapshots | id, order_item_id, created_at | — | arbitrary non-product keys inside snapshot | snapshot (project historical product fields only) |
| order_events | id, order_id, suborder_id, event_type, created_at | actor_type, actor_id | private contents of payload | payload |
| fulfillment_events | id, order_id, suborder_id, event_type, from_status, to_status, created_at | actor_type, actor_id | note; private contents of payload | payload |
| shipments | id, master_order_id, carrier, tracking_number, status, created_at | provider, weight_kg, length_cm, width_cm, height_cm, updated_at, service_code, estimated_provider_cost, final_provider_cost, final_provider_cost_cents, final_provider_cost_finalized_at, final_provider_cost_source | provider_shipment_id, label_url, provider_request_key, final_provider_cost_idempotency_key | destination_snapshot, metadata |
| shipment_suborders | shipment_id, suborder_id | — | — | — |
| shipping_webhook_events | — | id, provider, provider_event_id, shipment_id, event_type, processed_at, created_at | private payload contents | payload; whole row is server-only, normalized events through RPC |
| fulfillment_incidents | — | id, order_id, suborder_id, seller_id, incident_type, created_at, actor_id | note | whole row; generic active issue through RPC |
| hub_receipts | — | id, suborder_id, received_by, expected_items, received_items, created_at | receipt_token, note | whole row; receipt events supply Buyer progress |
| shipping_quotes | — | id, order_id, provider, service_code, estimated_eta_days, provider_cost, baseline_cost, buyer_shipping_charge, seller_shipping_subsidy, cometa_shipping_subsidy, policy_id, selected, created_at | — | package_estimate; whole row |
| payment_intents | — | id, order_id, buyer_id, amount_cents, currency, status, created_at, updated_at, stripe_processing_fee_cents, stripe_fee_finalized_at | stripe_payment_intent_id, stripe_charge_id, stripe_balance_transaction_id, idempotency_key, last_error, transfer_group | whole row; safe payment projection only |
| payment_allocations | — | id, payment_id, order_id, suborder_id, seller_id, gross_amount_cents, platform_fee_cents, seller_net_amount_cents, status, created_at | settlement/allocation details | whole row |
| payment_economics | — | id, payment_id, allocation_id, seller_id, economic_gross_cents, stripe_processing_fee_share_cents, seller_shipping_liability_cents, seller_discount_liability_cents, refund_liability_cents, dispute_liability_cents, negative_balance_recovery_cents, explicit_adjustment_cents, created_at, updated_at, buyer_paid_shipping_cents, seller_funded_shipping_cents, cometa_funded_shipping_cents, seller_funded_discount_cents, cometa_funded_discount_cents, finance_ready, shipping_economics_id, discount_economics_id, embedded_price_discount_cents, shipping_finance_ready, discount_finance_ready | attribution_note | whole row |
| refund_allocations | — | id, refund_id, payment_allocation_id, seller_id, principal_cents, shipping_cents, liability_owner, status | allocation/liability details | whole row |
| refunds (already denied) | — | id, payment_id, master_order_id, amount_cents, currency, status, created_at, finalized_at | stripe_refund_id, reason, idempotency_key | whole row; no grant or business change |
| disputes (already denied) | — | id, payment_id, amount_cents, currency, status, opened_at, evidence_due_by, resolved_at, outcome, actual_dispute_cost_cents, created_at, updated_at | stripe_dispute_id, stripe_charge_id, reason | whole row; no grant or business change |
| dispute_allocations | — | id, dispute_id, payment_allocation_id, seller_id, exposed_principal_cents, permanent_liability_cents, dispute_cost_share_cents, liability_owner, attribution_status, created_at, hold_id, resolved_at | admin_actor_id, admin_reason | whole row; backend-only |
| seller_fund_holds | — | id, seller_id, suborder_id, allocation_id, status, created_at, released_at, dispute_id | reason, created_by, released_by | whole row; backend-only |
| seller_liability_events | — | id, seller_id, amount_cents, currency, event_type, balance_effect, source_type, source_id, master_order_id, suborder_id, liability_owner, reason_code, created_at | note, actor_id, idempotency_key | whole row; backend-only |
| order_shipping_economics (already denied) | — | id, order_id, payment_id, provider_shipping_cost_cents, buyer_shipping_paid_cents, seller_funded_shipping_cents, cometa_funded_shipping_cents, shipping_variance_cents, funding_status, source_quote_id, source_shipment_id, finalized_at, created_at, updated_at, quoted_provider_cost_cents, final_provider_cost_cents, provider_cost_status | final_cost_idempotency_key | whole row, unchanged |
| order_discount_economics (already denied) | — | id, order_id, payment_id, discount_total_cents, seller_discount_funded_cents, cometa_discount_funded_cents, embedded_price_discount_cents, funding_status, finalized_at, created_at, updated_at | — | whole row, unchanged |
| dispute_evidence_refs (already denied) | — | id, dispute_id, evidence_type, source_table, source_id, retain_until, created_at | internal evidence references | whole row, unchanged |
| transfer_reversals (already denied) | — | id, seller_id, master_order_id, suborder_id, refund_id, dispute_id, amount_cents, status, created_at, finalized_at | stripe_transfer_reversal_id, stripe_transfer_id, reason, idempotency_key | whole row, unchanged |

The supplemental read-only metadata audit confirmed READ for all columns of dispute
allocations, fund holds and liability events, including admin notes. Their SELECT grants
are removed too; authorized financial backend functions retain service-role access.
No finance/refund/return business function or schema is changed. The four additional
tables marked already denied above were verified with effective column privileges and
remain untouched.

`buyer_id` is retained solely as a relational key for existing RLS dependencies; the RPC
does not emit it. A table-level SELECT would override column revocation, so the migration
revokes table SELECT and every prior column SELECT from PUBLIC, anon and authenticated
before granting the explicit A list. No authenticated table-wide SELECT is restored.

Backend consumers inspected: COMU orders/payment-status/order-delivery, HUB, direct
shipping, webhook reconciliation and finance helpers use authorized service-role queries.
Seller O1 reads use security-definer RPCs. N1 worker uses server-only RPCs. Their required
privileges remain intact. Raw database reads are not a supported replacement for those
domain surfaces. Existing permissive RLS is retained with an additional restrictive
active-profile predicate on tables with safe direct reads.

## Safe RPC

`comu_buyer_order_read_b1(uuid)` is authenticated-only and rechecks owner and active profile
inside SECURITY DEFINER with fixed search_path. No recipient identity can be supplied.
Projects address without phone, historical products, public seller identity, allowed
events, normalized tracking and generic active issues. Raw notes/payloads/Stripe IDs/
handoff tokens/labels/economics internals are omitted. ETA and public tracking URL are
explicit null placeholders until an authoritative source is certified.

The raw `snapshot` column is denied: granting JSON wholesale cannot protect future
internal keys. The RPC selects named historical product keys; `attributes` is only the
product attribute object, never the rest of the snapshot.

This RPC is the safe source projection for the TypeScript Buyer DTO. Its events retain
real recorded timestamps and master/suborder context. Tracking events
require O1 `processed_at` and `payload.applied=true`; no `updated_at` becomes a timeline event.

## Certification

`node scripts/test-comu-buyer-privacy-b1-local.mjs [--http]`

Reuses the actual O1 and N1 disposable harnesses in memory, inserting the authorized
migration before their assertions. Existing suite files are not edited. Fixtures are
synthetic; only schema/ACL is read from principal. Disposable DBs are removed by their
existing finally blocks. The extra privacy assertions cover direct columns, safe snapshots,
cross-owner, anonymous, dual Buyer+Seller, inactive profile and service-role continuity.

Results and subsequent B1/ETA gates are recorded after execution; no provider delivery
or production installation is implied by local test results.

## B1 API and presentation

- `GET /api/comu/orders?contract=b1&days=90&status=ALL&search=&page=1&pageSize=20`:
  explicit list summary and pagination. Days: 30/90; pageSize 1–50; page 1–10000.
  Filters: ALL, PREPARING, IN_TRANSIT, DELIVERED, ISSUE; CANCELLED also preserves the
  existing Account filter. Folio search accepts the display prefix `#COMU-`.
- `GET /api/comu/orders/{id}?view=detail`: cohesive safe detail; ownership is rechecked.
- Optional `suborderId` must belong to that order. Optional `notificationId` must be a
  visible N1 BUYER notification for the authenticated recipient and this master; its
  suborder supplies focus context. Existing N1 deep links remain unchanged.
- SQL `comu_buyer_orders_read_b1` filters and paginates before bounded detail projection.
  Stable ordering: created_at DESC, id DESC. No complete order history is downloaded
  into the browser to filter. The unversioned list keeps a small allowlisted legacy
  projection; Account consumes this with server filters/pagination and real currency.
- All order read endpoints, including legacy payment/delivery/fulfillment and their
  failures, use `private, no-store`. Payment-status/delivery retain compatible shapes.
- `requireComuBuyerRead` and authenticated read RPCs never provision buyers. Existing
  onboarding/write helper `requireComuBuyer` remains available to existing registration,
  account setup and checkout flows. Account/profile and address GETs also read without
  provisioning; an absent Buyer returns an empty account/address collection. Explicit
  profile POST still provisions through the existing helper. Missing/inactive user
  profile is denied, matching N1 policy.

`buyer-order-contract.ts` is viewport-independent. `buyer-order-presentation.ts` produces
labels/progress, not mutations. SQL read-only presentation is shared with server filters;
O1 remains the sole transition authority. Payment/financial presentation stays separate
from logistics. One shipped/delivered part cannot make a still-preparing master delivered
or fully in transit. Legacy mixed/multiple-DIRECT masters get conservative partial progress
and an explicit limitation, never a claim of certified multi-shipment operation.

HUB counts use distinct sellers and persisted preparation/handoff/receipt events separately.
Cancelled/ISSUE parts are not silently removed from the denominator. Consolidation copy
requires MASTER_CONSOLIDATED, receipt evidence for every HUB seller and shipment association
coverage. DIRECT has no HUB milestones. Timeline deduplicates reconciled transit/delivery
against shipment events and calls its timestamps `recordedAt`, not carrier occurrence time.

Successful same-currency refunds alone contribute to refunded/net. Existing refund schema
is MXN-only: USD order display is tested separately, not by inventing USD refunds. No refund
writes, tax/coupon breakdown or points-redemption claim is implemented. Address is the order
snapshot without phone. Product attributes are primitive historical values; nested objects
and internal/secret-like attribute keys are omitted. Missing images/logos are null for the
neutral COMU placeholder; no current catalog image is substituted.

Paid cancellation/restock is rejected before provider/RPC/inventory access. Processing or
succeeded payment also blocks the pending-order endpoint. The preexisting pending-only
SQL cancellation remains authoritative and rechecks commercial state under its lock.
`availableActions=[]`: B1 does not advertise paid or uncertified cancellation in B2.

## ETA and public tracking URL investigation (2026-10-05)

Primary reference inspected: [Skydropx official API](https://app.skydropx.com/es-MX/api-docs),
sections shipments/tracking, shipment detail, quotation and webhooks. Tracking documents
event date/location/status/description; quotation rates expose days. No operational ETA
window or explicitly public tracking URL was established in those endpoint schemas.
`order_detail_url` is not documented as a certified public recipient URL; label_url is private.
Platform marketing of estimated delivery is not evidence of that field in the consumed API.

The current adapter discards extended tracking event fields and returns status/number.
O1 already persists normalized events with locally recorded timestamps, sufficient for
the current safe timeline. No authenticated provider calls, new provider, quotes, labels
or live shipments were created during this investigation.

COMU promise cannot currently be certified: checkout uses LOCAL_TEST quotes and fails
closed for production. A seller deadline alone does not establish all-store arrival,
HUB consolidation, dispatch capacity, transit calendar and delivery window. Quote days
must not be added to order creation time, nor the first ready suborder used as master ETA.

[DHL eConnect documentation](https://developer.dhl.com/parcel-connect?language_content_entity=en)
documents public tracking links for its European product. That is not certification of
the carrier/service combination used by COMU Mexico. No generic mapping from arbitrary
carrier display names to URLs is installed. A separately certified carrier mapping can
be implemented in the server adapter later without constructing URLs in React.

Current output: deliveryEstimate=null, publicTrackingUrl=null. ETA type supports
`{source: CARRIER|COMU_PROMISE, from, to, updatedAt}` and validated carrier > promise > null
precedence. No provider response or private URL can enter those fields through the current
read path. Tests exercise invalid estimates, precedence, null fallback and URL omission.

No additional migration is necessary to deliver this nullable B1 contract. If authoritative
ETA/public URL observations are later available and need durable ingestion, request a
separate migration gate for source/provenance, observation time, range/URL and bounded
update semantics. Do not hide that persistence in this privacy migration or raw metadata.

B2 must omit estimated date and external carrier CTA while their fields are null; also
omit promised contact, return/guarantee/dispute actions and unsupported mixed-route claims.
Tracking inside COMU remains independent of an external link.

## Local certification

- `node scripts/test-comu-buyer-privacy-b1-local.mjs --http`: PASS PostgreSQL privacy,
  B1 SQL/HTTP, O1 SQL/HTTP, N1 SQL/worker/concurrency/HTTP and Chromium Seller bell.
  Disposable databases `comu_o1_1791242968613` and `comu_n1_1791243262515` removed.
- Final B1 SQL/HTTP recheck in `comu_o1_1791243628993`: PASS, including account/address
  GET without Buyer provisioning and explicit profile POST preserving onboarding.
  O1 HTTP regression also PASS; disposable database removed; process exit 0.
- `node scripts/test-comu-buyer-orders-b1-node.mjs`: PASS presentation, safe projection,
  ETA null/precedence, mixed-route limits and cancellation side-effect guards.
- `node scripts/test-comu-orders-o1-presentation-local.mjs`: PASS.
- `node scripts/test-comu-notifications-n1-node.mjs`: PASS, zero real email calls.
- `node scripts/test-comu-seller-orders-local.mjs`: PASS Seller/V4 contract regression.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: PASS.
- ESLint targeted at the changed TypeScript/TSX files: PASS.
- `git -c core.safecrlf=false diff --check`: PASS; staging index empty.

These are local certifications, not deployment or provider delivery certification.
Principal PostgreSQL was used only for read-only schema/privilege inspection and schema
dump. The migration and synthetic fixtures ran exclusively in disposable databases.
No remote database, production cron, real shipping or email delivery was changed.

## Files belonging to B1

Checkpoint isolation: shared Buyer files are staged selectively. Earlier Account styling,
navigation, phone editing and Auth metadata onboarding remain outside B1. The staged
Account retains its previous UI with only B1 currency/presentation and server pagination.
The working copy keeps the prior Account work intact.

Preexisting repository limitation: committed Seller layout imports the untracked
`src/lib/comu/account-access.ts`. An export of HEAD alone therefore fails TypeScript on
that missing module. Isolated B1 verification supplies this unchanged baseline dependency
from the workspace; it is not included in B1. No Seller change is made to hide the issue.

New:

```text
supabase/migrations/20261005170000_comu_buyer_order_read_privacy_v1.sql
src/lib/comu/buyer-order-contract.ts
src/lib/comu/buyer-order-presentation.ts
src/lib/comu/buyer-orders.ts
scripts/test-comu-buyer-privacy-b1-local.mjs
scripts/test-comu-buyer-orders-b1-sql.mjs
scripts/test-comu-buyer-orders-b1-http.mjs
scripts/test-comu-buyer-orders-b1-node.mjs
docs/comu-buyer-orders-b1.md
docs/comu-buyer-orders-b1-git-status.txt
```

Modified (some had preexisting Buyer work, preserved):

```text
src/lib/comu/buyers.ts
src/lib/comu/orders.ts
src/lib/comu/fulfillment.ts
src/lib/comu/buyer-experience.ts
src/app/api/comu/orders/route.ts
src/app/api/comu/orders/[id]/route.ts
src/app/api/comu/orders/[id]/payment-status/route.ts
src/app/api/comu/orders/[id]/fulfillment/route.ts
src/app/api/comu/orders/[id]/cancel/route.ts
src/app/api/comu/buyer/order-delivery/route.ts
src/app/api/comu/buyer/experience/route.ts
src/app/api/comu/buyer/addresses/route.ts
src/app/comu/account/buyer/buyer-account.tsx
src/app/comu/account/orders/[id]/delivery-detail.tsx
```

No Seller UI/O1 SQL/N1 implementation, POS, finance business logic, production config,
Buyer bell or B2 redesign is modified. No commit or deploy is authorized here.
