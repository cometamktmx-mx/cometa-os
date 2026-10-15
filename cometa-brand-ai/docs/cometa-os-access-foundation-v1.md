# Cometa OS Access Foundation V1

## Purpose

`public.brand_os_access` is the canonical managed-service product state for Cometa OS. It answers only whether a canonical brand is configured for Cometa OS and its current state.

It does not implement routing, Brand Home, billing, prices, seats, entitlements, or client self-service.

## Product authorities

| Concern | Canonical authority |
| --- | --- |
| Brand membership | `public.user_brand_access` |
| Cometa POS product access | POS subscription, lifecycle, and entitlements |
| Cometa OS product access | `public.brand_os_access` |

Membership does not imply Cometa OS access. POS access does not imply Cometa OS access.

## Stored and logical states

The physical table stores only these states:

- `active`
- `paused`
- `inactive`

`not_configured` is never stored. `getBrandOsAccess` returns it only when no `brand_os_access` row exists for a canonical brand slug.

The status has no default so internal operations must choose it explicitly. No migration seed or backfill is performed by V1.

## Server access helper

`src/lib/brand-os/access.ts` is server-only. `getBrandOsAccess(admin, brandSlug)` queries only `brand_os_access`; it does not inspect POS, memberships, historical analysis, Sales AI, Mercury, or legacy client records.

`resolveBrandOsProductAccess` is pure and separates commercial product state from effective authorization:

- Normal users will later require an active membership and OS status `active`.
- A platform-admin bypass is represented explicitly as an internal authorization source. It does not synthesize membership, Owner, seat, or entitlement.

The current reference for platform-admin logic is an active `user_profiles` record with role `admin`. The proxy uses environment allowlists for separate administrative routes, and the production `is_cometa_admin()` function is not represented in local migrations. Those authorities must be reconciled before OS enforcement is introduced.

## Database protection

The table has RLS enabled and no browser policies. `PUBLIC`, `anon`, and `authenticated` have no table privileges. Only `service_role` receives table privileges for controlled server-side operations.

`brand_slug` is the primary key and a foreign key to `public.brands.slug`; absence of a row remains meaningful. The dedicated trigger updates `updated_at` on every update.

## Deployment order

1. Apply `20260815_brand_os_access_foundation_v1.sql`.
2. Run `brand_os_access_foundation_v1_postflight.sql` immediately; it expects zero access rows because this migration seeds none.
3. Run `brand_os_access_foundation_v1_suite.sql`; it uses `BEGIN` / `ROLLBACK`.
4. Run the static audit and TypeScript/build checks.
5. In a separate approved operation, seed only an explicit, manually verified list of Cometa OS client brands.

## Explicitly deferred

- Brand Dashboard enforcement;
- `/brand/[brandSlug]/os` routing;
- Brand Home;
- login redirect changes;
- POS, RBAC, Team, lifecycle, plans, and entitlements;
- Stripe, billing, pricing, or checkout.
