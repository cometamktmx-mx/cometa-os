# COMU C2 — Seller catalog foundation

Local implementation; no remote migration, deployment, real Stripe/email or POS
entitlement changes. C1 checkpoint: `e1283e71ca533ee398444fdc83c2f1d4bd16994c`.

## Authorization and migration

`20261003150000_comu_seller_catalog_v1.sql` depends on C1, the canonical POS
schema, COMU listings/media, shared inventory constraints and the M1 mutation
boundary. It is transactional. Do not use general `db push` or apply remotely
without a separate authorization/review of the target migration chain.

The API authenticates/authorizes via `requireSellerAccess`; its mutations use
the authenticated Supabase client, not an admin client. SQL independently checks
`auth.uid()`, active user profile, active OWNER/ADMIN/CATALOG_MANAGER membership,
matching seller, VERIFIED and PREPARING/ACTIVE. C1 sellers must retain an actual
approved application. Legacy verified sellers use their existing membership.
There is no implicit COMETA-admin catalog bypass: review/activation remains C1.

RPCs: `comu_catalog_read_v1`, `comu_catalog_save_v1`. The private access helper is
not callable by authenticated/anonymous users. No direct `pos_*` write grants
are restored. No `user_brand_access`, subscriptions, POS roles, registers,
business profiles or entitlements are created.

Canonical tables remain `pos_products`, `pos_product_variants`, `pos_inventory`,
`pos_inventory_movements`, `pos_categories` and `pos_locations`. A first stock
entry may create the canonical COMU warehouse only when the brand has no
location. Existing locations are selected explicitly. This is inventory data,
not POS access. No existing locations or catalogs are copied.

The only new table, `comu_catalog_commands`, stores actor/payload/result receipts
for channel idempotency, not products or inventory. It has RLS and no direct
anonymous/authenticated access. Retry with the same seller/key/actor/payload
returns the original result; reuse with different payload/actor is rejected.

## Product and inventory semantics

Products are physical/direct inventory. Existing specialized Food/recipe/service
products remain readable and untouched; their specialized mutation is rejected.
Existing variant IDs, costs, units, barcodes, configuration, active flags and
unsubmitted variants are preserved. The UI edits name/description/category/code,
variant names/SKUs/prices/attributes and stock. Attributes use the existing JSON
model (e.g. `{"talla":"M","color":"Azul"}`), with the canonical signature
function and uniqueness constraints. No new variation model is introduced.

Stock input is physical `quantity`, never available stock. Available remains
`quantity - reserved_quantity`. Omitted stock is unchanged, not zero. An edit
requires the previously read product timestamp and each changed physical
quantity. SQL serializes COMU edits per seller and locks inventory rows shared
with checkout/POS, checks stale physical counts and rejects quantity below the
current reservation. It never modifies `reserved_quantity`. Real changes write
canonical `adjustment` movements with `reference_type=comu_catalog` and the
request UUID; `comu_sale`/`comu_restock` remain untouched. Conflicts roll back the
whole command. Reload before submitting a new command after a stale conflict.

New channel listings are DRAFT. Saving a product does not change an existing
listing's status or activate a storefront. Existing publication endpoints are
reused. All progress comes from `comu_seller_activation_check_v1`, including the
minimum and count: no independent TypeScript eligibility policy. Ten eligible
products still require configured storefront, Connect and explicit COMETA
activation through C1. The catalog shows this distinction.

Wholesale reuses the existing general/product policy, tier and pricing
contracts. No changes to wholesale commercial rules or checkout were made.

## Images

Uploads reuse `comu-products`, 5 MB JPG/PNG/WebP and server-generated seller/listing
paths. Metadata reads, uploads, reorder and deletion verify membership/listing
ownership. SQL rejects new attachments with another listing's path or variant;
existing legacy metadata is not rewritten. Failed metadata insertion attempts
cleanup of its just-uploaded object. Delete checks ownership before storage.

The existing bucket is public: these controls protect mutation/references, not
confidentiality of already-public image URLs. No new private asset store or
privacy promise is introduced. Real storage network effects were not exercised;
Node tests instrument storage and PostgreSQL tests exercise real metadata guards.

## Verification

Run locally:

```text
node scripts/test-comu-seller-catalog-local.mjs
node scripts/test-comu-seller-catalog-postgres-local.mjs
node scripts/test-comu-seller-approval-local.mjs
node scripts/test-comu-seller-approval-postgres-local.mjs
node scripts/test-comu-products-local.mjs
node scripts/test-comu-onboarding-local.mjs
node scripts/test-comu-seller-store-local.mjs
node scripts/test-comu-wholesale-ui-local.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
git diff --check
```

The PostgreSQL test is hard-limited to loopback `127.0.0.1:54322` and creates then
drops only a random `comu_c2_test_*` schema. It uses canonical table definitions,
the real C1/C2 migrations, media/wholesale policies and the existing reservation
RPC. Prerequisite Auth/brand/profile tables are local fixtures; this is not a
replay of the entire migration history and does not migrate `public`.

Coverage: new authenticated applicant -> C1 approval -> empty PREPARING catalog
-> products/variants/stock -> ten published -> eligible with **simulated Connect**
-> still PREPARING -> explicit COMETA activation. Also negative price rollback,
cross-product/variant/location denial, buyer/rejected denial, generic direct
product/inventory writes denied, concurrent stale edits, reservation taking the
last unit, two reservations racing, reserved stock preservation, idempotent
product/reservation retries, own/foreign media, wholesale tiers for a newly
created product, zero POS memberships and legacy records preserved.

Node tests execute real API/helper/editor handlers with instrumented dependencies,
exercise media authorization before storage, actual retail/wholesale pricing,
safe errors, no-store and editor retry identity. POS surface/operation gates are
tested with denied tenant context; they are not a live signed-in HTTP/browser
certification. There is no Stripe request or outbound email.

## Remaining launch verification

Before READY FOR SELLERS: a separately authorized migration/deployment into a
controlled environment; real browser journey on desktop/mobile with actual Auth
and Storage; controlled Connect test-mode onboarding; seller access/invitation
delivery and operational support procedure. Order preparation/settlement and
the broader seller launch checklist require their own certification; C2 alone
does not certify them. No later block is started here.

Rollback must preserve canonical products, stock and command receipts. Disable
the COMU catalog mutation entrypoint/execute permission first if necessary;
do not delete shared inventory or revert quantities to undo deployment.
