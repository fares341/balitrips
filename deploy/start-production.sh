#!/usr/bin/env bash
# =============================================================================
# Bali Trips — run the PRODUCTION build (Linux / macOS / WSL).
#
#   ./deploy/start-production.sh                 build + migrate + start
#   ./deploy/start-production.sh --seed          …and load the starter content
#   ./deploy/start-production.sh --test-accounts …and create test accounts per role
#   ./deploy/start-production.sh --https         …and serve HTTPS with Caddy
#                                                 (needs SITE_DOMAIN + DNS pointing here)
#   ./deploy/start-production.sh --stop          stop everything (data is kept)
#   ./deploy/start-production.sh --logs          follow app + worker logs
#   ./deploy/start-production.sh --remove-test-accounts
#
# Needs: Docker 24+ with the compose plugin, and openssl. Nothing else.
# Everything is configured in .env.production (created here on the first run
# from .env.production.example, with fresh random secrets).
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
ENV_FILE="$ROOT/.env.production"
COMPOSE=(docker compose -f "$ROOT/docker-compose.production.yml" --env-file "$ENV_FILE")

SEED=0 TEST_ACCOUNTS=0 HTTPS=0 ACTION=up
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    --test-accounts) TEST_ACCOUNTS=1 ;;
    --https) HTTPS=1 ;;
    --stop) ACTION=stop ;;
    --logs) ACTION=logs ;;
    --remove-test-accounts) ACTION=remove-tests ;;
    -h | --help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)"; exit 2 ;;
  esac
done

say() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "Docker is not installed."
docker compose version >/dev/null 2>&1 || die "The docker compose plugin is missing."
command -v curl >/dev/null || die "curl is required (health check)."

# --- .env.production -------------------------------------------------------
setvar() { # setvar KEY VALUE — replace or append, literally (no sourcing).
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{print k "=" v; next} {print}' "$ENV_FILE" >"$tmp"
  else
    cat "$ENV_FILE" >"$tmp"; printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  mv "$tmp" "$ENV_FILE"
}
getvar() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true; }

if [[ ! -f "$ENV_FILE" ]]; then
  say "First run: creating .env.production with new secrets"
  command -v openssl >/dev/null || die "openssl is required to generate secrets."
  cp "$ROOT/.env.production.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  setvar POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  setvar BETTER_AUTH_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
  setvar NEXT_SERVER_ACTIONS_ENCRYPTION_KEY "$(openssl rand -base64 32 | tr -d '\n')"
  setvar PAYMENT_WEBHOOK_SECRET "$(openssl rand -hex 32)"
  setvar ADMIN_BASE_PATH "/studio-$(openssl rand -hex 4)"
  setvar SITE_DOMAIN "localhost"
  setvar NEXT_PUBLIC_SITE_URL "http://localhost:3000"
  setvar BETTER_AUTH_URL "http://localhost:3000"
  # Local run: sandbox payments + bookings open so the whole flow can be tried.
  # Before going live: PAYMENT_PROVIDER=stripe, STRIPE_* keys, ALLOW_SANDBOX_PAYMENTS=,
  # and LIVE_MODE=true (already the default in the template).
  setvar LIVE_MODE "false"
  setvar PAYMENT_PROVIDER "sandbox"
  setvar ALLOW_SANDBOX_PAYMENTS "true"
  setvar ALLOW_BOOKINGS "true"
  setvar EMAIL_TRANSPORT "console"
  echo "  → $ENV_FILE created. Review it (domain, Stripe, Resend, Spaces, WhatsApp) before going live."
fi

for key in POSTGRES_PASSWORD BETTER_AUTH_SECRET ADMIN_BASE_PATH; do
  [[ -n "$(getvar "$key")" ]] || die "$key is empty in .env.production"
done
POSTGRES_USER="$(getvar POSTGRES_USER)"; POSTGRES_USER="${POSTGRES_USER:-bali}"
POSTGRES_DB="$(getvar POSTGRES_DB)"; POSTGRES_DB="${POSTGRES_DB:-bali}"
DB_HOST_PORT="$(getvar DB_HOST_PORT)"; DB_HOST_PORT="${DB_HOST_PORT:-55432}"

case "$ACTION" in
  stop) say "Stopping"; "${COMPOSE[@]}" --profile https down; exit 0 ;;
  logs) "${COMPOSE[@]}" logs -f --tail=200 app worker; exit 0 ;;
esac

# --- Database ---------------------------------------------------------------
say "Starting Postgres and Gotenberg"
"${COMPOSE[@]}" up -d --wait postgres gotenberg

say "Building the worker image (migrations, seed, queues)"
"${COMPOSE[@]}" build worker

if [[ "$ACTION" == remove-tests ]]; then
  "${COMPOSE[@]}" run --rm --no-deps worker node_modules/.bin/tsx scripts/create-test-accounts.ts --remove
  exit $?
fi

say "Applying database migrations"
"${COMPOSE[@]}" run --rm --no-deps worker node_modules/.bin/tsx src/db/migrate.ts

# Seed on request, or automatically when the database has no content yet (the
# image build prerenders content pages and fails on an empty database).
REGIONS="$("${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc 'select count(*) from regions' 2>/dev/null | tr -d '[:space:]' || echo 0)"
if [[ "$SEED" == 1 || "${REGIONS:-0}" == 0 ]]; then
  say "Loading starter content (regions, categories, tags, sample places)"
  "${COMPOSE[@]}" run --rm --no-deps worker node_modules/.bin/tsx src/db/seed/index.ts
fi

# --- App image --------------------------------------------------------------
# `next build` reads the database (prerendered pages). The build container
# reaches the loopback-published Postgres through the host network.
say "Building the app image (this takes a few minutes)"
PASS="$(getvar POSTGRES_PASSWORD)"
export BUILD_DATABASE_URL="postgresql://${POSTGRES_USER}:${PASS}@127.0.0.1:${DB_HOST_PORT}/${POSTGRES_DB}"
build_args=()
while IFS= read -r line; do build_args+=(--build-arg "$line"); done < <(
  grep -E '^(NEXT_PUBLIC_[A-Z_]+|ADMIN_BASE_PATH|PAYMENT_PROVIDER|ALLOW_SANDBOX_PAYMENTS)=' "$ENV_FILE"
)
DOCKER_BUILDKIT=1 docker build --network host --target runner -t bali-app:production \
  --build-arg "DATABASE_URL=$BUILD_DATABASE_URL" "${build_args[@]}" "$ROOT"

# --- Start ------------------------------------------------------------------
say "Starting app and worker"
if [[ "$HTTPS" == 1 ]]; then
  [[ -n "$(getvar SITE_DOMAIN)" && "$(getvar SITE_DOMAIN)" != localhost ]] ||
    die "--https needs SITE_DOMAIN (a real domain pointing at this server) in .env.production"
  [[ -n "$(getvar ACME_EMAIL)" ]] || die "--https needs ACME_EMAIL in .env.production"
  "${COMPOSE[@]}" --profile https up -d --no-build app worker caddy
else
  "${COMPOSE[@]}" up -d --no-build app worker
fi

say "Waiting for the app to answer"
APP_PORT="$(getvar APP_PORT)"; APP_PORT="${APP_PORT:-3000}"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[[ "${ok:-0}" == 1 ]] || die "The app did not become healthy. See: ./deploy/start-production.sh --logs"

if [[ "$TEST_ACCOUNTS" == 1 ]]; then
  say "Creating test accounts for every role"
  OUT="$ROOT/test-accounts-$(date +%Y%m%d-%H%M).txt"
  (umask 077; "${COMPOSE[@]}" run --rm --no-deps worker node_modules/.bin/tsx scripts/create-test-accounts.ts >"$OUT") ||
    { cat "$OUT"; die "Creating the test accounts failed (see above)."; }
  cat "$OUT"
  echo "  → saved to $OUT (contains passwords and 2FA secrets — keep it private)"
fi

SITE="$(getvar NEXT_PUBLIC_SITE_URL)"
say "Running"
cat <<EOF
  Site:   ${SITE:-http://localhost:${APP_PORT}}
  Admin:  ${SITE:-http://localhost:${APP_PORT}}$(getvar ADMIN_BASE_PATH)
  Logs:   ./deploy/start-production.sh --logs
  Stop:   ./deploy/start-production.sh --stop
EOF
