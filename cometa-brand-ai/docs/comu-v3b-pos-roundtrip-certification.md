# V3B final POS round-trip — 2026-10-05

V3B FUNCTIONALLY CERTIFIED = YES. Visual approval remains manual.

## Target and installation

- Supabase `http://127.0.0.1:54321`; PostgreSQL `127.0.0.1:54322`.
- Local config project `zhtagqrzyovsrmsicaot`; Docker DB `supabase_db_zhtagqrzyovsrmsicaot`. Published DB/gateway ports verified before SQL.
- Applied only `20261002120000_pos_device_foundation_v1.sql` to the principal local DB, recorded in local migration history and reloaded PostgREST schema.
- Existing dependencies verified: brands, pos_locations, pos_staff, pos_staff_sessions, pos_business_profiles and pos_food_actor_v1(text,uuid,uuid).
- Device RLS enabled; authenticated direct INSERT and revoke RPC execution denied. Binding/identity triggers installed. No new migration, reset or db push.

## Separate fixture and authorization

`local-test-comu-pos-1791214665390` owns brand `comu-89d4e9c2a45342d3bbdd2b4eb6144001`.

Real local Auth user with client profile; real C1 application/review HTTP yields approved seller and PREPARING storefront. An explicit owner POS membership was provisioned **only for this fixture**. Existing subscription API initialized POS Pro and COMETA Admin set active local TEST offer (`LOCAL_TEST_ONLY`, zero contracted price). No payment provider was called.

Existing APIs configured Retail, created location, ADMIN operator, enrolled device, authenticated operator PIN and entered admin mode. The runtime reads/writes use the fixture's real Auth cookies plus M1 device and staff cookies. No service-role RPC was used to substitute runtime POS authorization. Administrative setup/read-only evidence uses local privileged access.

Private credentials/PIN and resumable IDs are in ignored `.env.comu-pos-roundtrip-fixture.json`. They are not evidence or source artifacts.

## Real HTTP results

| Check | Result |
|---|---|
| COMU shared engine Color 3 × Talla 4 | PASS, 12 variants |
| COMU save, stock, publish listing | PASS; storefront remains PREPARING |
| POS GET same product, variant IDs, SKU, attributes and inventory | PASS |
| POS PATCH price to 525; COMU reads same identity | PASS |
| POS POST second product, initial stock 7 | PASS |
| COMU reads second product and edits price 299 → 319 | PASS |
| POS reads COMU edit, identity and inventory unchanged | PASS |
| SKU CH → C, XL → X, uniqueness | PASS |
| Inventory first product 12 × 8; second product 7; reserved 0 | PASS after both edits |
| No duplicate products/variants/SKU | PASS; 2 products, 13 variants |
| Seller A COMU catalog API | PASS |
| Seller A POS catalog API | DENIED, 403 POS_BRAND_FORBIDDEN |

Seller A's membership, subscriptions, seller/storefront rows and product/variant/inventory hashes match the snapshot from before installation. No POS entitlement or membership was added to Seller A.

COMU-origin product: `53eb65c9-7adf-41a1-8949-ef0a80aa188f`.
POS-origin product: `46f2a3cc-7586-418a-9f05-d7717bfb5a3f`.
Full variant identities and API assertions: [results](visual-evidence/comu-product-editor-v3b/pos-roundtrip/results.json).
Physical stock, SKU and subscription evidence: [inventory](visual-evidence/comu-product-editor-v3b/pos-roundtrip/inventory-verification.json).
Installation evidence: [M1](visual-evidence/comu-product-editor-v3b/pos-roundtrip/m1-installation.json).

## Verification

- `node scripts/certify-comu-pos-roundtrip-local.mjs --apply-m1` PASS.
- `node scripts/certify-comu-pos-roundtrip-local.mjs --run` PASS after adding missing fixture location using the existing API; this was harness preparation, not an application bug.
- `node scripts/certify-comu-pos-roundtrip-local.mjs --verify` PASS, read-only final identity/stock/Seller A check.
- `node scripts/test-product-variants-v3a.mjs` PASS (POS behavior before/after extraction).
- `node scripts/test-comu-seller-catalog-local.mjs` PASS.
- `node scripts/test-comu-product-editor-v3b.mjs` PASS (partial failures/retries, SKU, retirement, legacy).
- `node scripts/test-comu-product-media-v3b.mjs` PASS.
- `node scripts/test-pos-mobile-m1.mjs` PASS, 13/13 device/operator/access regressions.
- `node scripts/test-product-variants-postgres-v3a.mjs` PASS; isolated DB removed, including real RPC round-trips, authorization, reservations and concurrency.
- TypeScript `--noEmit --incremental false --pretty false` PASS.
- ESLint directed at new certification script PASS.
- `git diff --check` PASS (existing LF/CRLF notices only).

No application file changed in this certification. Earlier V3B visual evidence is preserved; this block uses real HTTP and does not claim a new browser/visual approval.

## Fixture cleanup boundary

Fixture is retained for manual inspection. Use its ignored manifest and exact brand/user/seller IDs above, never a broad test-name pattern or Seller A's IDs.

To remove later: confirm local ports again; revoke this fixture's device/operator sessions, then delete this brand's dependent device/staff rows, catalog commands/listings/variants/inventory movements/inventory/products and attributes, POS setup/subscription/event rows, COMU storefront/seller/application membership and account/brand, finally its Auth user. Inspect actual FK dependencies and perform the brand-scoped relational deletion in a transaction, checking every affected ID. Do not disable RLS/triggers or use unscoped cascading SQL. This fixture has no Stripe account, Storage uploads, orders or settlements to clean. Its exact resource ownership remains in the private manifest; cleanup has not been executed, so manual review remains possible. The shared M1 installation must remain installed.

## Scope

Added only certification script, this document and three sanitized JSON evidence files. No V3B/C2/POS application edits, remote calls, Stripe operations, commits, push or deploy.
