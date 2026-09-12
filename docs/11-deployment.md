# Deployment

Two names, one box:

| Name | What serves it |
|---|---|
| `sahaya.life` | nginx, static files from `/var/www/sahaya/web/dist` |
| `api.sahaya.life` | nginx → uvicorn on `127.0.0.1:8021`, plus `/media` straight from disk |

The VPS already runs other projects and another PostgreSQL database. **Nothing in this document
changes shared configuration.** Sahaya gets its own database, its own role, its own port, its own
systemd unit, its own nginx files and its own user. The only shared things touched are
`systemctl reload nginx` and `certbot`, both of which are additive.

Everything below assumes the repository is at **`/var/www/sahaya`**.

---

## Local development — no Docker

PostgreSQL on port 5432, Node 20+, Python 3.11+.

```bash
createdb sahaya

cd backend
python -m venv .venv && .venv/Scripts/activate     # source .venv/bin/activate elsewhere
pip install -r requirements-dev.txt -r requirements-imaging.txt
cp .env.example .env                                # fill in DATABASE_URL and SECRET_KEY
alembic upgrade head
python -m app.db.seed                               # reference data
python -m app.db.seed_demo                          # optional: demo people and photos
uvicorn app.main:app --reload --port 8010

cd ../web && npm install && npm run dev             # http://localhost:5173
```

In development the web app calls `/api/v1` on its own origin and Vite proxies it, so there is no
CORS in the loop. OTP codes print to the backend terminal. See the README for the demo accounts.

---

## First deploy

### 0. DNS, before anything else

Certbot will not issue a certificate for a name that does not resolve to this box.

```
A     sahaya.life       <VPS IP>
A     www.sahaya.life   <VPS IP>
A     api.sahaya.life   <VPS IP>
```

Check with `dig +short sahaya.life` and wait until it answers with the right address.

### 1. A user and a home for it

```bash
sudo adduser --system --group --home /var/www/sahaya --shell /usr/sbin/nologin sahaya
sudo mkdir -p /var/www/sahaya
sudo chown -R sahaya:sahaya /var/www/sahaya
# nginx (www-data) reads web/dist and backend/var/uploads, so the tree must be
# traversable by others -- 755, not 750.
sudo chmod 755 /var/www /var/www/sahaya
```

### 2. Its own database, beside the ones already there

A role and a database that exist only for this app. Nothing here edits `postgresql.conf` or
`pg_hba.conf`, so the other projects on this box do not notice.

```bash
# Hex, deliberately: this password goes inside a URL in .env, and a random one
# containing @ / : # or ? would have to be percent-encoded there.
DB_PASS=$(openssl rand -hex 24)

# Create the role, or reset its password if a previous attempt already made it.
sudo -u postgres psql -qc "CREATE ROLE sahaya WITH LOGIN PASSWORD '$DB_PASS';" 2>/dev/null \
  || sudo -u postgres psql -qc "ALTER ROLE sahaya WITH LOGIN PASSWORD '$DB_PASS';"

# Create the database only if it is not already there.
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='sahaya'" | grep -q 1 \
  || sudo -u postgres createdb -O sahaya sahaya

# The others are untouched, and the new one answers:
sudo -u postgres psql -c "\l"
PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -U sahaya -d sahaya -c "select current_database();"
```

**Keep this shell open.** `$DB_PASS` is used again in step 4, and it is never printed — the only
copy ends up inside `.env`.

### 3. The code

```bash
sudo -u sahaya git clone https://github.com/Ahd4wnn/sahaya.git /var/www/sahaya
```

### 4. `backend/.env`

Every setting the app reads, with production values. Written once, never committed, `chmod 600`
because it holds the database password, the token signing key and every API key.

The block below generates the two secrets itself and fills them in, so neither is ever typed or
pasted. Run it **once**; it refuses to overwrite an existing file.

```bash
# Run this in the same shell as step 2, so $DB_PASS is still set. If you have
# opened a new session since, read the password out of the old .env or reset it
# (docs: "if you forget the database password").
sudo -u sahaya test -f /var/www/sahaya/backend/.env \
  && echo "REFUSING: .env already exists -- edit it by hand instead" \
  || cat <<EOF | sudo -u sahaya tee /var/www/sahaya/backend/.env > /dev/null
# --- environment ---
APP_ENV=production
SECRET_KEY=$(openssl rand -hex 32)
CORS_ORIGINS=https://sahaya.life,https://www.sahaya.life

# --- database ---
DATABASE_URL=postgresql+asyncpg://sahaya:${DB_PASS}@127.0.0.1:5432/sahaya

# --- tokens ---
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=30

# --- providers ---
EMAIL_BACKEND=console
SMS_BACKEND=console
STORAGE_BACKEND=local
IMAGING_BACKEND=rembg
ASSISTANT_BACKEND=openai

# --- storage ---
STORAGE_LOCAL_DIR=/var/www/sahaya/backend/var/uploads
STORAGE_PUBLIC_BASE=https://api.sahaya.life/media

# --- smtp (EMAIL_BACKEND=smtp) ---
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=Sahaya <no-reply@sahaya.life>

# --- msg91 (SMS_BACKEND=msg91) ---
MSG91_AUTH_KEY=
MSG91_SENDER_ID=
MSG91_DLT_TE_ID=

# --- sign-in ---
GOOGLE_CLIENT_ID=
APPLE_CLIENT_ID=

# --- razorpay ---
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# --- otp ---
OTP_LENGTH=6
OTP_TTL_MINUTES=10
OTP_MAX_ATTEMPTS=5

# --- price ---
SUBSCRIPTION_AMOUNT_PAISE=9900

# --- ask sahaya ---
OPENAI_API_KEY=
ASSISTANT_MODEL=gpt-5-nano
ASSISTANT_DAILY_MESSAGE_LIMIT=40
ASSISTANT_HISTORY_TURNS=20
ASSISTANT_MAX_OUTPUT_TOKENS=700
ASSISTANT_TIMEOUT_SECONDS=30
EOF

sudo chmod 600 /var/www/sahaya/backend/.env
sudo chown sahaya:sahaya /var/www/sahaya/backend/.env
```

Then paste the OpenAI key in by hand — it is the one value that cannot be generated:

```bash
sudo -u sahaya nano /var/www/sahaya/backend/.env    # fill in OPENAI_API_KEY
```

Empty is a valid state for every blank above. With no OpenAI key the assistant is hidden
everywhere and its endpoints answer 503; with no Razorpay keys the checkout reports itself as not
configured rather than failing halfway; with `console` senders, OTP codes go to the journal
(`journalctl -u sahaya-api -f`), which is how you sign in before the SMS provider exists.

Two settings are worth understanding rather than copying:

- **`CORS_ORIGINS`** must name the site, because the browser calls the API on another origin. Miss
  it and every request from sahaya.life is blocked by the browser, with nothing in the API log.
- **`STORAGE_PUBLIC_BASE`** must be absolute for the same reason: it is the prefix the API puts on
  every photo URL, and a relative `/media` would point the card at sahaya.life, where no photos
  live.

Copy the finished file into a password manager. It is fifteen lines of things that are painful to
reconstruct.

### 5. Install, migrate, build

```bash
sudo -u sahaya /var/www/sahaya/deploy/deploy.sh
```

Background removal is the expensive part: `rembg` pulls `onnxruntime` (~300MB), downloads a 176MB
model, and wants roughly a gigabyte of RAM to segment one photo. On a box with less than about 2GB
free, skip it —

```bash
sudo -u sahaya env SKIP_IMAGING=1 /var/www/sahaya/deploy/deploy.sh
```

— and set `IMAGING_BACKEND=noop` in `.env`. Cards then fall back to the circular crop the design
already specifies for a failed cutout, and nobody is blocked from listing. The model is downloaded
by the deploy script rather than by the first helper who uploads a photo, because a request that
waits for a 176MB download times out.

The script does **not** seed demo data. Production starts with no helpers, which is correct: the
front page shows an empty results panel until real people sign up. For a staging box,
`python -m app.db.seed_demo` adds sixteen fictional helpers and their portraits.

### 6. The service

```bash
sudo cp /var/www/sahaya/deploy/sahaya-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sahaya-api
systemctl status sahaya-api --no-pager
curl -s http://127.0.0.1:8021/health          # {"status":"ok","env":"production"}
```

If 8021 is taken by something already on the box, change it in both the unit and
`deploy/nginx/api.sahaya.life.conf` — they must agree. `sudo ss -ltnp | grep 8021` tells you.

### 7. nginx

```bash
sudo cp /var/www/sahaya/deploy/nginx/sahaya.life.conf     /etc/nginx/sites-available/sahaya.life
sudo cp /var/www/sahaya/deploy/nginx/api.sahaya.life.conf /etc/nginx/sites-available/api.sahaya.life
sudo ln -s /etc/nginx/sites-available/sahaya.life     /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.sahaya.life /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` before the reload is not optional: a syntax error in a new file takes down every other
site on the box when nginx refuses to start.

### 8. TLS

```bash
sudo certbot --nginx -d sahaya.life -d www.sahaya.life -d api.sahaya.life
sudo systemctl list-timers 'certbot*' --no-pager     # renewal is already scheduled
```

Certbot edits only these two files, adding the 443 blocks and the redirect from 80.

### 9. Check it

```bash
curl -sI https://sahaya.life | head -1
curl -s  https://api.sahaya.life/health
curl -s  https://api.sahaya.life/api/v1/taxonomy | head -c 120

# The guard that matters: a verification document must not be reachable.
curl -sI https://api.sahaya.life/media/private/anything.pdf | head -1   # 404

# And the socket, which is the one thing a plain proxy_pass would break:
curl -sI -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://api.sahaya.life/api/v1/ws            # 403 from the app, not 404 from nginx
```

Then open https://sahaya.life, and paste the URL into WhatsApp to see the share card.

---

## Updating

```bash
sudo -u sahaya /var/www/sahaya/deploy/deploy.sh
```

Pull, install, migrate, seed reference data, rebuild the bundle, restart the API. The script needs
one sudo rule to restart the unit, or run the whole thing with `sudo`:

```bash
echo 'sahaya ALL=(root) NOPASSWD: /bin/systemctl restart sahaya-api' \
  | sudo tee /etc/sudoers.d/sahaya-restart
sudo chmod 440 /etc/sudoers.d/sahaya-restart
```

A migration that rewrites a big table will hold a lock while it runs; there is no blue/green here,
and at this size a few seconds of 502 is the honest trade.

## Watching it

```bash
journalctl -u sahaya-api -f                        # app log, including assistant token counts
journalctl -u sahaya-api -p warning --since today  # just the things that went wrong
tail -f /var/log/nginx/sahaya-api.error.log
```

The API logs one line per assistant reply with its token counts, which is how the OpenAI bill gets
explained rather than guessed at.

## Backups

The database holds everything except the photos; the photos are in
`/var/www/sahaya/backend/var/uploads` and are not in git.

```bash
# database, daily, kept for a fortnight
sudo -u postgres pg_dump -Fc sahaya > /var/backups/sahaya-$(date +%F).dump

# photos and verification documents
tar czf /var/backups/sahaya-uploads-$(date +%F).tar.gz \
  -C /var/www/sahaya/backend/var uploads
```

Verification documents are government IDs. Whatever holds those backups needs to be at least as
private as the box they came from.

## Things that will need doing later

- **S3** for uploads. `app/providers/storage/` has the interface and the local implementation;
  `get_storage()` raises a deliberate `NotImplementedError` for `s3` until someone writes it.
  Then `STORAGE_BACKEND=s3` and nginx stops serving `/media`.
- **A second worker** needs the realtime fan-out moved off per-process `LISTEN` (Redis, or a
  single notifier process). Until then, one uvicorn.
- **Razorpay webhooks** point at `https://api.sahaya.life/api/v1/billing/webhook`; the secret in
  `.env` must match the one in the dashboard, and the endpoint is idempotent on the event id.
- **Terms, Privacy, Refund and Contact pages**, which Razorpay requires before it will approve an
  account. They do not exist yet.
