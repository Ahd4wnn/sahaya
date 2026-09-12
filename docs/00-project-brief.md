# Sahaya — Project Brief

## What it is

Sahaya is a marketplace where domestic workers publish a profile and households hire them
directly. Maids, cooks, home nurses, elder-care and child-care workers, drivers, gardeners.

**Launch market: Kerala only.** All 14 districts, with a seeded town list per district.

## The position

Traditional placement agencies in India take a cut of the worker's salary — often the first
month entirely, sometimes a standing percentage. Sahaya does not.

> **Sahaya never takes a cut of a worker's salary.**

Revenue is a flat **₹99/month** subscription. This is not a pricing detail, it is the product's
entire moral position, and it belongs on the homepage in those words.

## Roles

| Role | What they do |
|---|---|
| **helper** | Domestic worker. Builds a profile, sets wage and availability, receives hire requests. |
| **hirer** | Household. Browses helpers, unlocks contact, sends hire requests. |
| **admin** | Reviews ID documents and photo cutouts, manages users, watches subscriptions and revenue. |

## Money

Two Razorpay subscription plans, both ₹99/month, auto-renewing:

- **`helper_monthly`** — keeps the helper's profile listed in browse results.
- **`hirer_monthly`** — unlocks contact details, chat, and unlimited hire requests.

Both sides subscribe. The cold-start risk this creates is mitigated by one rule:

> **Browse and profile previews are free for everyone. Nobody is asked to pay before they have
> seen real inventory.**

A hirer sees actual helper cards — name, photo, skills, wage range, area, rating — before any
paywall. The paywall lands at *contact reveal*. A helper builds and previews their whole card
before being asked to subscribe.

## Ratings go both ways

Helpers rate hirers and hirers rate helpers. A helper deciding whether to accept a job in a
stranger's home has at least as much at stake as the household. One review per side per
completed engagement.

## Wage model

**Monthly only.** Daily and hourly rates do not exist in this product — not hidden in the UI,
absent from the database schema, so they cannot leak back in.

Helpers state a range (e.g. ₹8,000–12,000/month), which sets honest expectations while leaving
room to negotiate duties and hours.

## Availability model

Shift chips (Morning / Afternoon / Evening / Full day) plus hours per day, plus a
**willing to live in** flag — live-in work is common in Kerala and is a primary filter for hirers.

## Scope

**Building now:** docs, FastAPI backend, React website.

**Documented, built later:** Android (Kotlin), iOS (Swift). The backend and API contract are
designed once and serve all three clients. See `10-mobile-plan.md`.

## Related

- `01-architecture.md` — how it is put together
- `02-data-model.md` — the schema
- `05-billing-razorpay.md` — how the ₹99 actually gets charged
- `DECISIONS.md` — why things are the way they are
