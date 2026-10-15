# COMETA POS RBAC V1B.1 — Invitation delivery and acceptance

V1B.1 adds delivery and an explicit, authenticated acceptance flow on top of RBAC V1A. It does not add Team UI, member management, sidebar gating, operational API enforcement, Stripe, or billing.

## Authority and security boundary

`public.user_brand_access` remains the only effective membership authority. `public.pos_user_invitations` only records a pending workflow. An email never grants access by itself: acceptance requires an authenticated Supabase session, the real Auth email, a pending non-expired invitation for that email, and the V1A acceptance RPC.

Invitation creation runs through `POST /api/pos/team/invitations?brandSlug=...`. The browser can submit only `email` and `role`; the server resolves authentication, tenant context, CORE-1 access, active membership, `pos.team.manage`, the actor, and the plan seat limit. Initial invite roles are `admin`, `manager`, `cashier`, and `inventory`; Owner is intentionally excluded.

The pending invitation expires after seven days. V1A is still the authority for one pending invitation per brand/email, active-membership conflicts, pending seat reservation, and `max_users`.

## Delivery flows

### New Auth user

The server reserves the invitation and calls `supabase.auth.admin.inviteUserByEmail` with a server-side redirect to `/auth/confirm`. The Supabase Invite user template supplies `token_hash`, `type=invite`, and `next=/invite`. The invited user establishes an SSR session, creates a password only after that real session exists, then explicitly accepts on `/invite`.

### Existing Auth user

The server tries the Supabase Admin invite and treats only stable Auth codes `email_exists` and `user_already_exists` as an existing Auth identity. It then sends an application email through Resend REST, server-side, to `/invite`. The application email has no bearer token; the authenticated user and the V1A RPC still determine eligibility.

An Auth identity that cannot complete its normal login flow is not granted a membership automatically. No user receives access until they explicitly accept a matching pending invitation.

## Delivery compensation

Database reservation and provider delivery are not a distributed transaction. After a reservation, any failed configuration, Supabase delivery, Resend delivery, or metadata-preparation step calls `pos_revoke_user_invitation_v1`. This releases the seat and avoids a pending reservation that was never deliverable. A previously sent provider email may still be opened, but the revoked invitation remains unusable.

## Acceptance and decline

`GET /api/pos/invitations` derives the current email from the authenticated Supabase user and returns only pending, non-expired invitations for that email. It returns safe display fields only.

`POST /api/pos/invitations` accepts only an invitation UUID from the browser. The server derives the Auth user ID and email, obtains the brand from the invitation row, and calls `pos_accept_user_invitation_v1`. V1A revalidates status, expiry, the real `auth.users` email, duplicate memberships, concurrent capacity, and the current plan before creating or reactivating the membership. Success redirects only to `/brand/[brandSlug]/pos`, never `/onboarding/business`.

`DELETE /api/pos/invitations` is the invitee decline action. `pos_decline_user_invitation_v1` is `SECURITY DEFINER`, has `search_path=public`, validates the real Auth email passed by the server API, locks the brand seat scope and invitation row, and marks only a matching pending invitation `revoked`. It does not create or delete a membership.

All RBAC invitation RPCs are revoked from `PUBLIC`, `anon`, and `authenticated`; only `service_role` receives `EXECUTE`. Browser clients never write membership or invitation records directly.

## Environment and production setup

Required server-side values are documented in [cometa-pos-auth-production-config.md](cometa-pos-auth-production-config.md):

```text
RESEND_API_KEY=
RESEND_FROM_EMAIL=no-reply@auth.cometaos.com
COMETA_APP_ORIGIN=http://localhost:3000
```

Use `https://app.cometaos.com` as `COMETA_APP_ORIGIN` in production. Do not commit values or expose them in browser code.

## Manual smoke test

1. Use an Owner or Admin membership with available seats and invite a brand-new email as Cashier.
2. Confirm one pending invitation reserves one seat and the Supabase Invite user email arrives.
3. Open it once; `/auth/confirm?type=invite` must create the SSR session and reach `/invite`.
4. Set a password only after the invite session is present, accept explicitly, and confirm redirect to the invited brand POS—not business onboarding.
5. Invite an existing confirmed Auth email. Confirm the Resend email arrives, login if needed, open `/invite`, accept, and land in that specific brand POS.
6. Reject a pending invitation and confirm the pending seat is released and no membership is created.
7. Temporarily remove a delivery configuration value in a controlled environment, create an invitation, and confirm the API returns a human error and the reservation is revoked.
8. Re-test ordinary signup confirmation (`type=email`) and confirm it still redirects to `/onboarding/business`.

## Deferred to V1B.2 and V1C

- Team route, list, member management, role-change UI, and pending invitation management.
- Invitation resend UX.
- Navigation and home changes by role.
- Server-side permission enforcement across operational POS APIs.
- Billing and Stripe.
