# Auth Flows

## The model

Google, Apple, SMS OTP and email OTP are **verification sources only**. All four end in the same
place: Sahaya mints its own JWT pair. We never hold a Google or Apple session.

That single decision is what lets web, Kotlin and Swift share one auth backend with no
per-platform special cases.

| Token | Lifetime | Storage |
|---|---|---|
| Access | 15 min | `Authorization: Bearer`, memory on the client |
| Refresh | 30 days, rotating | `refresh_tokens.token_hash` — **sha256, never the raw token** |

Rotation: each refresh mints a new token and stamps `replaced_by` on the old row. If a token that
already has `replaced_by` is presented, that is replay — revoke the entire chain and force
re-login.

## One person, one account

`auth_identities` carries `(provider, provider_subject)` with a unique constraint, pointing at a
single `users` row.

Somebody signs up with a phone OTP in March. In June they tap "Continue with Google" and that
Google account's verified email matches nothing — but their verified phone does. They get a
second `auth_identities` row and the **same** `users` row.

Without this they would silently get a duplicate account, their hire history would split, and
their rating — the thing they spent months earning — would reset to zero.

**Matching rule:** link on a *verified* email or *verified* phone match only. Never link on an
unverified claim, or an attacker registers `victim@gmail.com` unverified and waits to be merged.

## The four flows

### Google — web + Android
1. Client obtains an ID token (Google Identity Services / Play Services)
2. `POST /api/v1/auth/google { id_token }`
3. Backend verifies the token with `google-auth` against our client ID, checking signature,
   `aud`, `iss` and expiry
4. Find-or-create via `auth_identities` → issue tokens

### Phone — the default for helpers
1. `POST /auth/phone/start { phone }` → 6-digit code via `SmsSender`, 10 min TTL, max 5 attempts
2. `POST /auth/phone/verify { phone, code }` → tokens

In development `SMS_BACKEND=console` prints the code to the terminal. **The entire flow is
testable today** — no MSG91 account, no DLT registration.

### Email — passwordless
Same shape via `EmailSender`. Passwordless deliberately: no password field, no reset flow, no
credential-stuffing surface, nothing to leak.

### Apple — iOS only
`POST /auth/apple { identity_token }`, verified against Apple's JWKS. The endpoint is built now so
the Swift client has it waiting. Note Apple's private relay addresses are real and must be
accepted as emails.

## OTP hardening

- Codes are 6 digits, hashed at rest, 10-minute TTL, single use.
- Max 5 verify attempts per code, then the code is burned.
- Rate limit per target and per IP on `/start` — otherwise it is an SMS-cost amplifier for an
  attacker and a way to harass a phone number.
- Verifying an OTP always takes the same time whether or not the target exists, so the endpoint
  is not a user-enumeration oracle.

## Roles

`role` is set once during onboarding (step 1) and is not user-editable afterwards. A user who
genuinely needs both sides gets a second account; conflating them would make the two ₹99 plans
and the bidirectional rating system ambiguous.

`admin` is never self-assignable — it is set directly in the database.
