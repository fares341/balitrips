#!/usr/bin/env bash
# =============================================================================
# Bali Trips — update the running server to the latest commit on GitHub.
#
#   ./deploy/update.sh            update only if GitHub has a newer commit
#   ./deploy/update.sh --force    rebuild and restart even if nothing changed
#
# What it does, safely:
#   1. One run at a time (a lock), so two pushes in a row never collide.
#   2. Fetches origin/<branch> (default main). Nothing new → exits quietly.
#   3. Moves the code to the new commit. Only tracked files change:
#      .env.production, test-accounts-*.txt and the Docker volumes (database,
#      uploads, PDFs) are never touched.
#   4. Runs deploy/start-production.sh: builds the new images, applies the
#      database migrations, restarts app + worker and waits for /api/health.
#   5. If any step fails, it goes back to the previous commit and starts that
#      again, so the site keeps running the last good version.
#
# Extra flags for start-production.sh (e.g. --https) go in DEPLOY_FLAGS in
# .env.production, or in the environment:  DEPLOY_FLAGS="--https" ./deploy/update.sh
# Log: deploy/logs/update-YYYYmmdd.log
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BRANCH="${DEPLOY_BRANCH:-main}"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

mkdir -p "$ROOT/deploy/logs"
LOG="$ROOT/deploy/logs/update-$(date +%Y%m%d).log"
exec > >(tee -a "$LOG") 2>&1

say() { printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"; }

# --- 1. one deploy at a time -------------------------------------------------
exec 9>"$ROOT/deploy/logs/.update.lock"
if ! flock -n 9; then
  say "Another update is already running — skipping this one."
  exit 0
fi

# --- 2. anything new? --------------------------------------------------------
git config --global --add safe.directory "$ROOT" >/dev/null 2>&1 || true
git fetch --quiet origin "$BRANCH"
CURRENT="$(git rev-parse HEAD)"
TARGET="$(git rev-parse "origin/$BRANCH")"
if [[ "$CURRENT" == "$TARGET" && "$FORCE" == 0 ]]; then
  echo "Already up to date ($(git log -1 --format='%h %s'))."
  exit 0
fi

# Flags from .env.production (read literally, never sourced).
if [[ -z "${DEPLOY_FLAGS:-}" && -f "$ROOT/.env.production" ]]; then
  DEPLOY_FLAGS="$(grep -E '^DEPLOY_FLAGS=' "$ROOT/.env.production" | tail -n1 | cut -d= -f2- | tr -d '"'"'"'\r' || true)"
fi
read -r -a FLAGS <<<"${DEPLOY_FLAGS:-}"

say "Updating $(git rev-parse --short "$CURRENT") → $(git rev-parse --short "$TARGET")"
git log --oneline "$CURRENT..$TARGET" | head -20 || true

# --- 3. move the code ----------------------------------------------------------
# reset --hard only touches tracked files; .env.production and other ignored
# files stay. A hand-edited tracked file on the server would be lost — edit in
# the repo instead.
git reset --hard --quiet "$TARGET"
chmod +x deploy/*.sh

# --- 4. build, migrate, restart ----------------------------------------------
if ./deploy/start-production.sh "${FLAGS[@]}"; then
  docker image prune -f >/dev/null 2>&1 || true
  say "Deployed $(git log -1 --format='%h %s')"
  exit 0
fi

# --- 5. roll back --------------------------------------------------------------
say "Update FAILED — rolling back to $(git rev-parse --short "$CURRENT")"
git reset --hard --quiet "$CURRENT"
chmod +x deploy/*.sh
if ./deploy/start-production.sh "${FLAGS[@]}"; then
  say "Rolled back. The site runs the previous version. See the log above for the error."
else
  say "Rollback also failed — check: ./deploy/start-production.sh --logs"
fi
exit 1
