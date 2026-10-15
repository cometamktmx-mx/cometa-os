# COMETA Canonical Brand Registry

## Canonical model

`public.brands` is the universal source of existence and minimal identity for a COMETA business tenant.

```text
brands                     business identity
├── user_brand_access      user membership and brand role
├── POS                    operational product data
└── Cometa OS              optional derived data
    ├── audit request
    ├── brand_analysis     analyses and diagnostics
    └── cosmos_memory      derived business memory
```

The concepts are deliberately separate:

- `brands` answers “does this business exist, and what is its routing identity?”
- `user_brand_access` answers “which authenticated user can access it, and with what membership role?”
- `pos_*` tables hold POS configuration and operations.
- `brand_analysis` may contain many analyses for one brand.
- `cosmos_memory` may not exist until intelligence has been generated.

Creating a brand does not create an analysis or memory record. Neither derived table is required for Brand OS or POS identity.

## Registry schema

The registry intentionally contains only:

- UUID technical identity (`id`);
- globally unique routing identifier (`slug`);
- display identity (`name`);
- registry status (`active` or `inactive`);
- optional creator audit identity;
- creation/update timestamps.

`profile_code` is intentionally absent. `pos_business_profiles.profile_code` remains the detailed operational source of truth. Registry status is also independent from subscription lifecycle: an active brand may have a suspended POS subscription.

Slugs are lowercase and must match `^[a-z0-9]+(-[a-z0-9]+)*$`. Routes remain `/brand/[brandSlug]`; UUID is the technical primary key.

## Membership and security

`user_brand_access` remains the canonical membership table. ENTRY V1A does not add a foreign key because legacy membership data must first be fully reconciled in production.

RLS is enabled on `brands`. Authenticated browser users receive read-only access restricted to active membership through `user_brand_access`. Browser writes are denied. The service role can maintain the registry only after application-level authentication and authorization.

ENTRY V1A does not introduce a self-service writer, signup, authentication callback or role-assignment endpoint.

## Legacy backfill

The migration inventories explicit nonblank slugs from:

1. `user_brand_access` — required so access-only brands such as `magenta-fit-wear` become canonical;
2. `brand_analysis` — optional identity evidence, grouped by normalized slug;
3. `cosmos_memory` — optional identity evidence, grouped by normalized slug;
4. `clients` — temporary legacy fallback only when a real slug column contains a value.

Rows without an explicit slug are ignored. Names are selected deterministically from the most reliable available named source; the formatted slug is used only when no real name is available. Multiple analysis or memory rows never create multiple registry brands.

The migration stops before backfill if a legacy slug is invalid or distinct raw slugs collapse to the same lowercase identity. It does not merge ambiguous tenants silently.

No legacy row is updated or deleted.

## Runtime resolution

Resolution priority is now:

1. `public.brands`;
2. `clients` temporary fallback;
3. `brand_analysis` temporary fallback;
4. `cosmos_memory` temporary fallback.

A registry-only brand is sufficient for `resolveBrandFromSupabase`, `requirePosContext`, POS bootstrap and Brand OS routing. Brand OS sections that depend on analysis or memory continue to receive their existing empty states when those optional records do not exist.

Workspace includes the registry as its highest-priority identity source, deduplicates by slug, and still filters client responses through `user_brand_access`. Legacy sources remain merged temporarily so installing V1A cannot silently hide an existing brand.

## Compatibility and future phases

ENTRY V1A preserves:

- `clients`;
- `brand_analysis`;
- `cosmos_memory`;
- `user_brand_access`;
- existing Brand OS and POS routes;
- V1A entitlements, V1B lifecycle, V2A profile families, CORE-1 enforcement and V2C.1 inventory idempotency.

ENTRY V1B may add signup and a transactional self-service business writer after the Supabase Auth dashboard configuration is confirmed. That writer must create the registry row and membership without creating analysis or memory. A future audited migration may add the `user_brand_access.brand_slug → brands.slug` foreign key only after all legacy memberships are canonical.

