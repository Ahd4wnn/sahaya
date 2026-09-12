# Architecture

## Shape

One repository, three deployables, one backend.

```
D:\f13s\sahaya\
├─ docs/            this spec
├─ backend/         FastAPI — the only thing that talks to the database
├─ web/             Vite + React + TS — a pure client
└─ .claude/skills/  the /better-* interface skills
```

Android and iOS join later as two more pure clients against the same API. Nothing about the
backend changes when they arrive; that is the point of designing the contract first.

## Stack

| Layer | Choice | Why |
|---|---|---|
| API | FastAPI, Python 3.13 | Async, OpenAPI for free, Pydantic v2 validation at the edge |
| ORM | SQLAlchemy 2.0 async + asyncpg | Typed models, real async, no vendor lock |
| Migrations | Alembic | Autogenerate, reversible, plain SQL when needed |
| DB | PostgreSQL 18.2, local, **no Docker** | Already installed at `D:\PostgreSQL\bin`, port 5432 |
| Web | Vite 8 + React 19 + TypeScript | SPA against REST; keeps FastAPI the single backend |
| Styling | Tailwind v4 + shadcn registry + Spell UI | See `06-design-system.md` |
| Payments | Razorpay Subscriptions | See `05-billing-razorpay.md` |

## Request lifecycle

```
Browser
  └─ fetch (Bearer access token)
       └─ FastAPI router  /api/v1/*
            ├─ Pydantic schema validates the body
            ├─ deps.py resolves current_user from the JWT
            ├─ require_active_subscription  (only on gated routes)
            ├─ service layer  — business rules live here, not in routers
            │    └─ providers/  — anything touching the outside world
            └─ SQLAlchemy async session  → PostgreSQL
```

Routers stay thin: validate, authorise, delegate, serialise. Business rules live in
`services/`. Anything that talks to a third party lives behind an interface in `providers/`.

## The provider seam

This is the whole migration story, so it gets its own directory and a hard rule:
**no application code imports a vendor SDK directly.**

```
backend/app/providers/
├─ email/    base.py · console.py · smtp.py
├─ sms/      base.py · console.py · msg91.py
├─ storage/  base.py · local.py · s3.py
├─ imaging/  base.py · rembg.py · noop.py
├─ llm/      base.py · openai_impl.py · disabled.py
└─ oauth/    google.py · apple.py
```

Each is an abstract base class with concrete implementations selected by an environment
variable and resolved once at startup:

```python
EMAIL_BACKEND=console     # → smtp
SMS_BACKEND=console       # → msg91
STORAGE_BACKEND=local     # → s3
IMAGING_BACKEND=rembg     # → noop
ASSISTANT_BACKEND=openai  # → none
```

The assistant is the one provider that can legitimately resolve to "off": with no
`OPENAI_API_KEY` it reports `available = False`, and every surface checks that before offering
Ask Sahaya at all. Pasting the key in is the whole configuration.

Two consequences worth stating plainly:

1. **Development needs no vendor accounts.** The `console` senders print OTPs to the terminal,
   so every auth flow is fully buildable and testable today — before MSG91's DLT registration
   clears, before any SMTP credentials exist.
2. **Moving to AWS is configuration, not a rewrite.** Point `DATABASE_URL` at RDS, flip
   `STORAGE_BACKEND=s3`, flip `SMS_BACKEND=msg91`. No application code changes.

## Configuration

`backend/app/core/config.py` uses `pydantic-settings`. Every secret comes from `backend/.env`,
which is gitignored from the first commit. **No secret is ever written into a doc, a seed
script, or any committed file** — including the local database password.

`.env.example` is committed with every key present and every value blank or a safe default.

## Auth model

Identity providers are *verification sources only*. Google, Apple, an SMS OTP and an email OTP
all end at the same place: Sahaya issues its own JWT pair.

- Access token — 15 minutes, sent as `Authorization: Bearer`
- Refresh token — 30 days, rotating, **stored hashed** so a database leak does not yield
  usable sessions

We never hold a Google or Apple session. This is what lets web, Kotlin and Swift share one
auth backend with no per-platform special cases. See `04-auth-flows.md`.

## What the clients share

Two endpoints exist specifically so the three clients can never drift:

- `GET /api/v1/taxonomy` — services (primary roles) and skills (the card chips)
- `GET /api/v1/geo/districts` and `/geo/towns` — the Kerala location data

Adding a skill or a town is a server-side change that appears on web, Android and iOS with no
app release. Design tokens are exported the same way — see `10-mobile-plan.md`.

## Deliberate omissions

- **No Docker.** Explicit project constraint.
- **No Celery/Redis yet.** The one slow job is the photo cutout; it runs in a FastAPI
  background task. When that stops being enough, it becomes a queue — the `imaging` provider
  interface already isolates it.
- **No websockets yet.** Hire requests poll. Chat, when built, is where this gets revisited.
