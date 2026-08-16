# Cometa POS Auth Configuration

## Confirmed local Supabase configuration

- New user signup: enabled
- Email provider: enabled
- Confirm email: enabled
- Anonymous sign-ins: disabled
- Site URL: `http://localhost:3000`
- Allowed redirects:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/confirm`
  - `http://localhost:3000/invite`
  - `http://localhost:3000/reset-password`

Signup confirmation uses the SSR token-hash flow. The confirmation email points to `/auth/confirm`, where the server calls `verifyOtp` and stores the resulting session in cookies. `/auth/callback` remains dedicated to OAuth and other PKCE code-exchange flows.

In **Authentication > Emails > Confirm signup**, the confirmation link must be:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email&amp;next=/onboarding/business">Confirm your email address</a>
```

After changing the template, request a new confirmation email. Previously issued links retain the old flow and should not be used for validation.

Password recovery redirects to `/reset-password`. The page establishes the recovery session and calls `auth.updateUser`; it never reveals whether an email exists.

## Cometa POS team invitations

Keep **Authentication > Emails > Confirm signup** unchanged. It must continue using `type=email` and `next=/onboarding/business` as documented above.

For **Authentication > Emails > Invite user**, use this exact token-hash template:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=invite&amp;next=/invite">Aceptar invitación</a>
```

`/auth/confirm` accepts only `type=email` and `type=invite`. Invite confirmation verifies the OTP server-side, establishes SSR cookies, and redirects only to `/invite`. The user must explicitly accept the matching pending invitation before a brand membership is created.

Existing Auth users receive the application-level invitation email through Resend. Configure server-only environment variables without committing values:

```text
RESEND_API_KEY=
RESEND_FROM_EMAIL=no-reply@auth.cometaos.com
COMETA_APP_ORIGIN=http://localhost:3000
```

`RESEND_FROM_EMAIL` is sent as `Cometa POS <no-reply@auth.cometaos.com>`. In production set `COMETA_APP_ORIGIN=https://app.cometaos.com`.

## Required production configuration

Before publishing the self-service CTA, configure the production Supabase project with:

- Site URL: `https://app.cometaos.com`
- Allowed redirects:
  - `https://app.cometaos.com/auth/callback`
  - `https://app.cometaos.com/auth/confirm`
  - `https://app.cometaos.com/invite`
  - `https://app.cometaos.com/reset-password`

Keep email confirmation enabled and apply the same token-hash confirmation template in production. If the email provider rewrites or prefetches links, disable link tracking. Providers that consume one-time links before the user may require an intermediate confirmation page or typed OTP flow.

Do not add wildcard redirects broader than the application origin. Preview URLs should be added explicitly only when a controlled preview signup test is required.

## Release verification

1. Create a new account using an email not previously registered.
2. Confirm that no business exists before email confirmation.
3. Open the confirmation link and verify a session cookie is established.
4. Confirm redirect to `/onboarding/business`.
5. Request password recovery and verify the response does not disclose account existence.
6. Open the recovery link, update the password and log in with the new password.
7. Confirm external or protocol-relative `next` values cannot redirect outside COMETA.
8. Invite a brand-new email and verify the **Invite user** template reaches `/auth/confirm?type=invite`, then `/invite`.
9. Invite an existing confirmed Auth email and verify the Resend email reaches `/invite`; access must remain pending until explicit acceptance.
