# Sahaya

Hire domestic help in Kerala, and deal with them directly. Maids, cooks, home nurses, elder and
child care, drivers, gardeners — across all 14 districts.

**₹99 a month, the same for families and for helpers. Sahaya never takes a cut of anyone's salary**
— what a family and a helper agree is what the helper is paid. Browsing is free; a membership is
what unlocks messages, phone numbers and hire requests, and a message needs one on both sides.

- **Web** — https://sahaya.life
- **API** — https://api.sahaya.life

---

## What is in here

```
backend/     FastAPI + async SQLAlchemy + PostgreSQL
web/         React 19 + Vite + Tailwind v4
docs/        why things are the way they are -- read DECISIONS.md first
design/      the Figma frame the front page is built against
```

The interesting reading, in order: [`docs/DECISIONS.md`](docs/DECISIONS.md) (every choice and what
would make us revisit it), [`docs/01-architecture.md`](docs/01-architecture.md),
[`docs/02-data-model.md`](docs/02-data-model.md), [`docs/design.md`](docs/design.md) and
[`docs/design-lessons.md`](docs/design-lessons.md). Deployment lives in
[`docs/11-deployment.md`](docs/11-deployment.md).

## Running it locally

You need Python 3.12+, Node 20+, and a PostgreSQL you can create a database in. No Docker.

```bash
# --- database ---
createdb sahaya

# --- backend ---
cd backend
python -m venv .venv && .venv/Scripts/activate        # source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt -r requirements-imaging.txt
cp .env.example .env                                   # then set DATABASE_URL and SECRET_KEY
alembic upgrade head
python -m app.db.seed                                  # districts, towns, services, skills, plans
python -m app.db.seed_demo                             # optional: demo people to look at
uvicorn app.main:app --reload --port 8010

# --- web ---
cd ../web
npm install
npm run dev                                            # http://localhost:5173
```

Nothing needs a vendor account to run. OTPs print to the backend terminal
(`SMS_BACKEND=console`), photos are stored on local disk, and payments and the assistant simply
report themselves as unconfigured until keys exist. That is deliberate — see
`docs/01-architecture.md`, "the provider seam".

The demo accounts sign in by phone; the code comes back in the response while SMS is on the
console backend:

| Phone | Who |
|---|---|
| `+919900000098` | admin |
| `+919900000097` | a family with an active membership |
| `+919900000099` | a family with no membership |
| `+919900000000` … `+919900000015` | helpers |

## Tests

```bash
cd backend && pytest -q          # runs against a real PostgreSQL, not SQLite
cd web && npx tsc -b && npm run lint
```

The backend tests use the real database because the schema leans on native enums, `ARRAY` and
`JSONB` — testing on SQLite would test a schema that never ships. The assistant is tested against
a stubbed model and a local stand-in for the OpenAI endpoint, so the suite needs no network and no
key.

## Configuration

Every secret is read from `backend/.env`, which is gitignored; `backend/.env.example` lists every
key with a comment. Five environment variables select the outside world — email, SMS, storage,
imaging and the assistant's model — and each has a local implementation that needs no account.
Moving to AWS is configuration, not a rewrite.

The web bundle's only build-time setting is `VITE_API_URL` (`web/.env.production`), which points
it at the API's origin. Left empty, calls are same-origin and Vite proxies them in development.
