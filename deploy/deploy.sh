#!/usr/bin/env bash
# Deploy Sahaya on the VPS. Idempotent: run it for the first install and for
# every update after.
#
#   sudo -u sahaya /var/www/sahaya/deploy/deploy.sh
#
# It does not touch nginx, systemd, PostgreSQL's configuration, or anything
# belonging to another project on this box. It pulls, installs, migrates,
# builds, and asks systemd to restart one service.

set -euo pipefail

APP_DIR=${APP_DIR:-/var/www/sahaya}
BRANCH=${BRANCH:-main}
SERVICE=${SERVICE:-sahaya-api}
# Must match the --port in deploy/sahaya-api.service.
PORT=${PORT:-8021}

cd "$APP_DIR"

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$1"; }

say "pulling $BRANCH"
git fetch --quiet origin "$BRANCH"
git checkout --quiet "$BRANCH"
git reset --hard --quiet "origin/$BRANCH"
echo "    now at $(git log -1 --format='%h %s')"

say "backend dependencies"
cd "$APP_DIR/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
./.venv/bin/pip install --quiet --upgrade pip
./.venv/bin/pip install --quiet -r requirements.txt
# Background removal is a ~300MB download and wants ~1GB of RAM to run. Skip it
# with SKIP_IMAGING=1 and the card falls back to a circular crop -- which the
# product is designed to do, rather than blocking a helper from listing.
if [ "${SKIP_IMAGING:-0}" != "1" ]; then
  ./.venv/bin/pip install --quiet -r requirements-imaging.txt
  # Download the u2net weights now rather than inside the first helper's photo
  # upload: it is ~176MB, and a request that waits for it times out.
  say "segmentation model"
  export U2NET_HOME="$APP_DIR/backend/var/models"
  mkdir -p "$U2NET_HOME"
  ./.venv/bin/python -c "from rembg import new_session; new_session('u2net')"
  echo "    u2net ready in $U2NET_HOME"
fi

say "database migrations"
./.venv/bin/alembic upgrade head

say "reference data (districts, towns, services, skills, plans)"
# Insert-only for the taxonomy, so this cannot undo an admin's edits.
./.venv/bin/python -m app.db.seed

say "web bundle"
cd "$APP_DIR/web"
npm ci --silent
npm run build --silent
echo "    built $(du -sh dist | cut -f1) into web/dist"

say "restarting $SERVICE"

# Not installed yet? That is the first deploy, and it is not an error: the
# install, the migrations, the seed and the bundle are all already done.
if ! systemctl cat "$SERVICE" > /dev/null 2>&1; then
  echo "    $SERVICE is not installed yet -- nothing to restart."
  echo "    Install it (docs/11-deployment.md, 'The service'):"
  echo "      sudo cp $APP_DIR/deploy/sahaya-api.service /etc/systemd/system/"
  echo "      sudo systemctl daemon-reload && sudo systemctl enable --now $SERVICE"
  say "done (service not started)"
  exit 0
fi

# -n: never prompt. This script runs as the `sahaya` user, which has no
# password to type -- without -n, sudo would sit waiting for one forever.
if ! sudo -n systemctl restart "$SERVICE" 2> /dev/null; then
  echo "    cannot restart $SERVICE without root. Either:"
  echo "      sudo systemctl restart $SERVICE"
  echo "    or allow just this one command, once:"
  echo "      echo 'sahaya ALL=(root) NOPASSWD: /bin/systemctl restart $SERVICE' \\"
  echo "        | sudo tee /etc/sudoers.d/sahaya-restart && sudo chmod 440 /etc/sudoers.d/sahaya-restart"
  say "done (build is in place; $SERVICE still running the previous code)"
  exit 0
fi

sleep 2
if ! systemctl is-active --quiet "$SERVICE"; then
  echo "    $SERVICE did not come up; journalctl -u $SERVICE -n 50"
  exit 1
fi
echo "    $SERVICE is running"

say "health check"
curl -fsS "http://127.0.0.1:${PORT}/health" && echo
say "done"
