# COMU Buyer Identity V1

Local implementation only. No provider configuration, remote migration, mail,
Stripe object, deployment or corporate auth route was changed.

- `/comu/login` and `/comu/register` use the existing Supabase SSR browser client.
- `/comu/forgot-password`, `/comu/reset-password` and `/comu/auth/confirm`
  use the same provider recovery, PKCE/OTP and password-update operations.
- Confirmation tokens are consumed only after human submission, not page GET.
- `safeComuNext` allows known COMU destinations and rejects external destinations,
  encoded path tricks, corporate destinations and auth loops. Buyer order list/detail
  destinations are allowed; Seller summary/store/products/wholesale/settings are
  allowed, but Seller orders is not currently allowlisted.
- Auth `user.id` is authoritative. The existing `comu_buyers.user_id` uniqueness
  and conflict-ignore insert seed name/phone only on first creation. Auth metadata
  is validated as display data and never confers seller or administrative access.
- Login and B1/experience reads do not provision a Buyer. Registration with a
  session reads the metadata fallback; persistence occurs through the explicit
  write/onboarding helper, with conflict-ignore idempotency.
- Seller Approval and Account Routing are already checkpointed. COMU Auth returns
  to `/comu/account` by default; its capabilities resolve Buyer/Seller/multistore.

## Before production email certification

The current documented signup template in `cometa-pos-auth-production-config.md`
hardcodes `/auth/confirm?...next=/onboarding/business`. It cannot be assumed to
honor COMU's `emailRedirectTo`. The remote template was not inspected or changed.

Provider configuration must explicitly support the COMU confirmation destination
and the COMU recovery destination, preserving the existing corporate and invitation
branches. Add their exact production/local redirect destinations to the provider
allowlist in a separately authorized configuration step. Preserve the validated
COMU `next` query. The COMU pages support PKCE `code` or token-hash confirmation
(`type=email`/`signup`) and recovery (`type=recovery`). Do not disable confirmation
or claim that an unconfirmed signup has created a session.

Real confirmation/recovery mail and cross-device behavior still require controlled
end-to-end verification after that configuration; mock tests are not this evidence.

## Local checks

`node scripts/test-comu-auth-local.mjs` checks redirects, real provider method
contracts with mocks, registration session states, Buyer idempotency, ownership,
and that corporate auth/seller files remain unchanged. It sends no network calls.

## Checkpoint 2 scope

`node scripts/test-comu-auth-local.mjs --staged` tests the index projection without
relying on pending Buyer Account or POS Beta changes. Provider operations use
mocks: real email delivery is not certified. B1 PostgreSQL/HTTP suites that create
fixtures are not run in this checkpoint because database writes are excluded.

The two Auth JPEGs are currently byte-identical, each 2,325,238 bytes (about
2.22 MiB). Keep both stable route paths; distinct photography and compression
remain future visual optimization, with no image replacement in this checkpoint.
