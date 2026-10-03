# COMU C1 — Seller approval and access foundation

Local implementation. No remote migration, deploy, email, Stripe operation or POS
permission change is authorized by this document.

## Persistence and state transitions

Migration: `20261003130000_comu_seller_approval_v1.sql`. Depends on the existing
COMU foundation/catalog/Connect migrations and
`20260928180000_comu_buyer_experience_v1.sql`. Do not use a general `db push`.
The migration is transactional and must precede deployment of these consumers.
There is no automatic rollback that deletes approved users/brands; rollback must
preserve those identities and deny new reviews/activations while a forward fix is reviewed.

Applications reuse `comu_seller_applications` and the existing public form. Auth
user identity comes from the session. The application contact email is not an
identity/ownership credential. Existing `PENDING`/`REVIEW` can transition once to
`APPROVED` or `REJECTED`. Rejection requires a note. Decisions record the actual
reviewer's Auth UUID, timestamp, note, brand and seller IDs. Contrary decisions
on retry fail; equal decisions return the persisted result.

Approval uses an authenticated SECURITY DEFINER RPC, validates an active COMETA
admin, rejects self-approval, locks the application and applicant, and commits
profile/brand/seller/storefront/membership/decision atomically. New sellers are
`status=PREPARING`, `verification_status=VERIFIED`; storefronts are `PREPARING`.
Approval never activates commercial sales.

The account model is the existing Auth user + `user_profiles`, not a new account
table. Existing roles/statuses are never overwritten. Inactive accounts fail.
An existing brand must be explicitly selected by the reviewer and the applicant
must already be its active owner. A new canonical brand receives a collision-safe
slug; COMETA is its registry creator so applicant ownership cannot be inferred
from `created_by`. Ownership/access is granted only in `comu_seller_memberships`.
No `user_brand_access`, POS role, subscription, location, stock or POS bootstrap is
created. An existing seller can be linked only to its existing active owner.

## Legacy compatibility

Migration labels pre-existing sellers `approval_origin=LEGACY` without changing
status, verification, timestamps, permissions or creating applications. New
sellers use `C1` with `approval_application_id`. No historical `reviewed_by` or
`reviewed_at` is synthesized. A later real review linked to an existing legacy
seller leaves that seller's commercial state unchanged.

Legacy active sellers remain active even if they do not meet today's activation
check. Any subsequent explicit commercial activation must pass the centralized
policy. Unverified legacy records are not silently grandfathered as verified.

## Authorization and direct SQL

- Page `/brand/admin/comu` and review/state APIs require an active COMETA admin.
- Review and state RPCs use the authenticated JWT; callers cannot supply actor IDs.
- Authenticated/anonymous roles cannot directly insert/update/delete sellers or
  memberships, decide applications, or insert/delete storefronts.
- Storefront UPDATE is restricted to explicit operational columns: name, slug,
  headline, description, logo, cover, theme, updated_at. RLS restricts rows to
  OWNER/ADMIN members or COMETA. Identity/status columns are not granted.
- Triggers protect seller identity/provenance/commercial state and storefront
  identity/status, including service-role writes. Approval/activation RPCs are
  the supported state-changing paths. There is no caller-settable bypass flag.
- SQL triggers prevent listing/storefront/product/variant cross-brand references.
- Application INSERT requires the authenticated applicant, PENDING and empty
  decision/provisioning fields. Rejected applicants receive no memberships.

Public storefront/catalog policies still require an ACTIVE verified seller.
Preparing listings are therefore not publicly purchasable. Public information
of another already-active store remains public; private management is isolated.

## One activation policy

`comu_seller_activation_check_v1` is authoritative; TypeScript delegates to it.
Requirements:

1. Verified legacy approval, or a C1 APPROVED application with real reviewer/time
   matching the seller.
2. Storefront with nonblank name, slug and description.
3. At least 10 distinct PUBLISHED products belonging to that storefront and brand,
   active/sellable, each with an enabled active matching variant and positive
   effective price (variant override > listing override > canonical price).
4. Connect account ID, COMPLETE onboarding, transfers and payouts enabled, no
   financial suspension. Reads canonical persisted Connect state; does not call Stripe.
5. Explicit COMETA activation; reaching ten alone changes nothing. Admins cannot
   activate a seller in which they are an active member.

`comu_admin_seller_state_v1` atomically activates seller + storefront. Pause,
suspend and close remain administrative. Operational edits do not automatically
deactivate valid existing sellers. Stock, shipping, checkout and settlement
policy are outside this migration.

## Access and preparation

`/comu/seller` routes C1 sellers into
`/comu/seller/{brandSlug}/{summary|store|products|wholesale|settings}` using COMU
membership. Brand OS/POS access is not required or granted. Legacy entry is
preserved. `src/proxy.ts` is unchanged. PREPARING is visibly distinguished from
ACTIVE. Store edits, existing catalog management/media and Connect preparation
reuse current components. Connect returns to the COMU-only surface for C1 sellers.

Every current application already has an Auth user, so no invitation is needed
to approve it. The authenticated user can return through the existing seller
login destination. No new password, token, account email or automatic mail is
generated. An anonymous invitation flow is intentionally not introduced.

### Exact remaining boundary for C2

This is the approval/access foundation, not a new catalog editor. Existing COMU
products UI consumes canonical POS products. A newly created COMU-only business
with no catalog does not yet have an independent create-product/variant/stock
workflow. Granting POS ownership to hide that gap is explicitly forbidden.
C2 must close that workflow with COMU-scoped authorization over the shared
inventory, without changing POS permissions. This is a blocker for READY FOR
SELLERS, not an invitation to enable checkout or Production in C1.

Remote application of prerequisites/C1, real browser/provider certification and
operational communications require separate authorization. No production
certification is implied by the local tests.

## Tests

`node scripts/test-comu-seller-approval-local.mjs`: actual TypeScript modules with
isolated Auth/DB mocks, authorization, input validation and RPC contracts; no network.

`node scripts/test-comu-seller-approval-postgres-local.mjs`: hardcoded loopback
127.0.0.1:54322; real migration translated into a random disposable schema, real
authenticated role/column grants/RLS/triggers/RPCs; isolated prerequisite fixtures.
Uses the existing local PostgreSQL wire helper with strict SCRAM verification.
Drops only its validated random schema in finally. Never migrates public or remote.
Tests concurrent approvals/retries, rejection, self-approval, foreign brand,
transaction rollback, protected direct writes, operational update, legacy state,
no POS membership, private catalog isolation and explicit ten-product activation.
This is not a replay of the entire repository migration history.

Also run existing onboarding, Connect settings, Connect mode and seller/store
contract tests, TypeScript without emission and `git diff --check`.
