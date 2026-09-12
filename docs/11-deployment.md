# Deployment

## Local development — no Docker

PostgreSQL 18.2 is installed and running as service `postgresql-x64-18` on port **5432**.
Binaries: `D:\PostgreSQL\bin` (not on PATH). Data: `C:\Program Files\PostgreSQL\18\data`.

### First-time setup

```bash
# database
"D:\PostgreSQL\bin\psql.exe" -U postgres -c "CREATE DATABASE sahaya;"

# backend
cd backend
cp .env.example .env          # then fill it in
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
.venv/Scripts/alembic.exe upgrade head
.venv/Scripts/python.exe -m app.db.seed        # districts, towns, taxonomy, plans

# web
cd web && npm install
```

### Running

```bash
# terminal 1
backend/.venv/Scripts/uvicorn.exe app.main:app --reload --port 8000

# terminal 2
cd web && npm run dev
```

API docs at `http://localhost:8000/docs`. Web at `http://localhost:5173`.

### Secrets

Everything lives in `backend/.env`, gitignored from the first commit. `.env.example` is committed
with every key present and blank values.

**No secret is ever written into a doc, a seed script, a test fixture, or any committed file** —
including the local database password.

## Migrating to AWS

The `providers/` seam means this is configuration, not a rewrite.

| Local | AWS | Change |
|---|---|---|
| Local PostgreSQL | RDS PostgreSQL | `DATABASE_URL` |
| `STORAGE_BACKEND=local` | S3 | `STORAGE_BACKEND=s3` + bucket vars |
| `SMS_BACKEND=console` | MSG91 | `SMS_BACKEND=msg91` + API key |
| `EMAIL_BACKEND=console` | SES / Brevo | `EMAIL_BACKEND=smtp` + SMTP vars |
| `IMAGING_BACKEND=rembg` | same, or a Lambda | `IMAGING_BACKEND` |
| uvicorn --reload | gunicorn + uvicorn workers behind ALB | process manager only |

**No application code changes.** That is the entire point of the provider interfaces.

### Checklist before going live

- [ ] Razorpay **live** keys, and recurring-payments approval granted on the account
- [ ] Razorpay webhook pointed at the public URL, secret rotated
- [ ] MSG91 DLT registration complete (PE + header, roughly a week — start early)
- [ ] SMTP domain SPF/DKIM/DMARC verified
- [ ] Google OAuth consent screen published, production redirect URIs added
- [ ] S3 bucket private; images served via CloudFront signed URLs, never public-read
- [ ] `alembic upgrade head` runs in the deploy step, never at app start
- [ ] Automated `pg_dump` backups with a tested restore
- [ ] CORS restricted to the real web origin
- [ ] Rate limits on `/auth/*/start` — these cost real money per call

### Deliberately not doing yet

No Docker (project constraint). No Celery/Redis — the one slow job is the photo cutout and it
runs as a FastAPI background task; the `imaging` provider interface is where that becomes a queue
when it needs to. No websockets — hire requests poll until chat is built.
