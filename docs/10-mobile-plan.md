# Mobile Plan — Android & iOS

**Not built yet.** The website ships first. This records the design so nothing has to be
re-decided later, and so the backend built now is already correct for these clients.

| Platform | Language | UI |
|---|---|---|
| Android | Kotlin | Jetpack Compose |
| iOS | Swift | SwiftUI |

## They are pure clients

Both consume the same `/api/v1` surface as the web app. No mobile-specific backend, no BFF layer.
The auth model already supports this: identity providers are verification sources only and the
backend issues its own JWTs, so there is no per-platform session handling.

## Auth per platform

| Method | Web | Android | iOS |
|---|---|---|---|
| Google | yes (GIS) | yes (Play Services) | yes |
| Phone OTP | yes | yes | yes |
| Email OTP | yes | yes | yes |
| **Apple** | — | — | **required** |

Apple requires Sign in with Apple on any iOS app offering third-party sign-in. The backend
endpoint (`POST /auth/apple`, verified against Apple's JWKS) is **built now** so the Swift client
has it waiting. Apple's private-relay addresses are real addresses and must be accepted.

## What must not drift

Two endpoints exist precisely so three clients cannot disagree:

- `GET /api/v1/taxonomy` — services and skills
- `GET /api/v1/geo/districts` and `/geo/towns` — the Kerala data

Adding a skill or a town is a server-side change that appears on all three clients **with no app
release**. Nothing is hardcoded into a client.

## Shared design tokens

`web/src/tokens.json` is the single source. A small script generates:

- `Color.kt` and `Type.kt` for Compose
- `Colors.swift` and `Typography.swift` for SwiftUI

So the palette (oat, paper, moss, sage -- `DECISIONS.md` 020) and type scale cannot diverge
across platforms. Fonts follow the same
reasoning as web: the **system font** (SF on iOS, Roboto on Android) plus Instrument Serif for
display and Noto Sans Malayalam for Malayalam text.

## The /better-* skills apply here too

The installed skills are web-centric in their code examples, but the substance — type scale,
colour systems and contrast, layout grouping and reading order, touch targets, accessibility,
product copy — transfers directly to Compose and SwiftUI. Run `/better-typography`,
`/better-colors`, `/better-layout`, `/better-writing` and `/better-accessibility` over the mobile
UIs the same way as the web UI.

Platform mapping: `/better-accessibility` targets TalkBack on Android and VoiceOver on iOS rather
than ARIA, and touch targets are 48dp (Android) / 44pt (iOS) rather than CSS pixels.

## The card on mobile

The breaking-the-box portrait needs care on both platforms — it is a clipping bug waiting to
happen:

- **Compose** — the header `Box` needs `clip = false`, and the parent `LazyVerticalGrid` needs
  `contentPadding` with headroom at the top of each item.
- **SwiftUI** — do **not** apply `.clipped()` to the header; use `zIndex` and a negative vertical
  `offset`, and give the `LazyVGrid` row spacing that accommodates the overflow.

Same fallback rule as web: a `failed` cutout renders a circular crop straddling the panel edge.

## Payments

Razorpay's Android and iOS SDKs handle the subscription mandate natively.

**Apple's rules matter here.** The ₹99 buys access to a real-world service (hiring a person), not
digital content, so it falls outside the In-App Purchase requirement — the same basis Airbnb and
Uber operate on. Worth confirming against current App Store guidelines before submission, because
getting this wrong means rejection.

## Order of work

1. Android first — the larger share of this audience, and Compose iterates faster
2. iOS after, adding Sign in with Apple
3. Shared token generation set up before either, so neither hardcodes colours
