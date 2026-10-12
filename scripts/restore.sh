#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Bali Trips — restore a database backup from the private Spaces bucket.
#
#   restore.sh --list
#   restore.sh --latest                                  # rehearsal (default)
#   restore.sh --key db-backups/2026/08/bali-….dump
#   restore.sh --latest --target production --confirm 'RESTORE PRODUCTION'
#
# The DEFAULT target is `verify`: the archive is restored into a throwaway
# database inside the same Postgres container, checked, and dropped. That
# path is safe to run at any time against the live box, and cron runs it on
# the 1st of every month (deploy/cloud-init.yaml). This is deliberate — an
# untested restore procedure is a plan, not a capability, and the first time
# anyone finds out that pg_restore needs a flag nobody remembered must not be
# during an outage.
#
# `--target production` is the real thing: it takes a pre-restore safety dump,
# stops the app and worker, replaces the live database, and brings everything
# back. It refuses to run without the exact confirmation phrase.
#
# See docs/runbook.md for the drill, the expected output, and what to do when
# a check fails.
# ---------------------------------------------------------------------------
set -Eeuo pipefail
IFS=$'\n\t'

readonly BASE_DIR=${BALI_BASE_DIR:-/opt/bali}
readonly COMPOSE_FILE="${BASE_DIR}/docker-compose.prod.yml"
readonly BACKUP_ENV="${BASE_DIR}/backup.env"
readonly POSTGRES_ENV="${BASE_DIR}/postgres.env"
readonly WORK_DIR=${BALI_BACKUP_DIR:-/var/backups/bali}
readonly VERIFY_DB=bali_restore_verify
readonly CONFIRM_PHRASE='RESTORE PRODUCTION'

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() {
  printf '%s  FATAL: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
  exit 1
}
trap 'die "aborted at line ${LINENO} (exit ${?})"' ERR

usage() {
  sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# --- Arguments -------------------------------------------------------------
MODE=restore
KEY=
TARGET=verify
CONFIRM=
KEEP=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --list) MODE=list ;;
    --latest) KEY=@latest ;;
    --key)
      KEY=${2:?--key needs a value}
      shift
      ;;
    --key=*) KEY=${1#--key=} ;;
    --target)
      TARGET=${2:?--target needs verify or production}
      shift
      ;;
    --target=*) TARGET=${1#--target=} ;;
    --confirm)
      CONFIRM=${2:?--confirm needs the phrase}
      shift
      ;;
    --confirm=*) CONFIRM=${1#--confirm=} ;;
    --keep) KEEP=1 ;;
    -h | --help) usage 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done

[[ ${TARGET} == verify || ${TARGET} == production ]] ||
  die "--target must be 'verify' or 'production', got '${TARGET}'"

# --- Configuration ---------------------------------------------------------
[[ -r ${BACKUP_ENV} ]] || die "${BACKUP_ENV} is missing or unreadable (run as root)"
[[ -r ${POSTGRES_ENV} ]] || die "${POSTGRES_ENV} is missing or unreadable"

# shellcheck disable=SC1090
set -a
. "${BACKUP_ENV}"
. "${POSTGRES_ENV}"
set +a

: "${SPACES_ENDPOINT:?}" "${SPACES_REGION:?}" "${SPACES_PRIVATE_BUCKET:?}"
: "${SPACES_KEY:?}" "${SPACES_SECRET:?}"
: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}"

readonly PREFIX=${BACKUP_PREFIX:-db-backups}

export AWS_ACCESS_KEY_ID=${SPACES_KEY}
export AWS_SECRET_ACCESS_KEY=${SPACES_SECRET}
export AWS_DEFAULT_REGION=${SPACES_REGION}
export AWS_EC2_METADATA_DISABLED=true
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_supported

aws_s3() { aws --endpoint-url "${SPACES_ENDPOINT}" "$@"; }
compose() { docker compose -f "${COMPOSE_FILE}" "$@"; }
psql_admin() { compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 "$@"; }

for tool in docker aws jq sha256sum; do
  command -v "${tool}" >/dev/null 2>&1 || die "required tool not on PATH: ${tool}"
done

list_backups() {
  aws_s3 s3api list-objects-v2 \
    --bucket "${SPACES_PRIVATE_BUCKET}" --prefix "${PREFIX}/" --output json |
    jq -r '
      (.Contents // [])
      | map(select(.Key | endswith(".sha256") | not))
      | sort_by(.LastModified)
      | .[]
      | "\(.LastModified)  \(.Size | tostring | (" " * (12 - length)) + .)  \(.Key)"
    '
}

if [[ ${MODE} == list ]]; then
  log "backups in s3://${SPACES_PRIVATE_BUCKET}/${PREFIX}/"
  list_backups
  exit 0
fi

[[ -n ${KEY} ]] || die 'nothing to restore: pass --latest or --key <object-key> (or --list)'

if [[ ${KEY} == '@latest' ]]; then
  KEY=$(list_backups | tail -n1 | awk '{print $NF}')
  [[ -n ${KEY} ]] || die 'no backups found in the bucket'
  log "latest backup is ${KEY}"
fi

# --- Fetch and verify ------------------------------------------------------
TMP_DIR=$(mktemp -d)
trap 'rm -rf "${TMP_DIR}"' EXIT

readonly LOCAL_FILE="${TMP_DIR}/$(basename "${KEY}")"

log "downloading ${KEY}"
aws_s3 s3 cp "s3://${SPACES_PRIVATE_BUCKET}/${KEY}" "${LOCAL_FILE}" --only-show-errors

# The manifest is checked before a single byte is handed to pg_restore.
# Restoring a corrupt archive over a live database is the one way to turn a
# recoverable incident into an unrecoverable one.
if aws_s3 s3 cp "s3://${SPACES_PRIVATE_BUCKET}/${KEY}.sha256" "${LOCAL_FILE}.sha256" --only-show-errors 2>/dev/null; then
  expected=$(cut -d' ' -f1 <"${LOCAL_FILE}.sha256")
  actual=$(sha256sum "${LOCAL_FILE}" | cut -d' ' -f1)
  [[ ${expected} == "${actual}" ]] || die "checksum mismatch: manifest ${expected}, downloaded ${actual}"
  log "checksum verified (${actual})"
else
  log 'WARNING: no .sha256 manifest alongside this object; integrity is unverified'
fi

# Decrypt if this was written with BACKUP_PASSPHRASE_FILE set.
ARCHIVE=${LOCAL_FILE}
if [[ ${ARCHIVE} == *.gpg ]]; then
  [[ -n ${BACKUP_PASSPHRASE_FILE:-} && -r ${BACKUP_PASSPHRASE_FILE} ]] ||
    die "${KEY} is encrypted but BACKUP_PASSPHRASE_FILE is not set or not readable"
  log 'decrypting'
  gpg --batch --yes --quiet --decrypt \
    --passphrase-file "${BACKUP_PASSPHRASE_FILE}" \
    --output "${ARCHIVE%.gpg}" "${ARCHIVE}"
  ARCHIVE=${ARCHIVE%.gpg}
fi

log 'checking the archive is structurally readable'
compose exec -T postgres pg_restore --list <"${ARCHIVE}" >"${TMP_DIR}/toc.txt"
toc_count=$(grep -cv '^;' "${TMP_DIR}/toc.txt" || true)
[[ ${toc_count} -gt 0 ]] || die 'archive contains no restorable objects'
log "archive lists ${toc_count} objects"

# --- Verification queries --------------------------------------------------
# Run against whichever database was just restored. These are the questions
# you actually want answered at 3am: did the schema come back, did the rows
# come back, and how much of yesterday is missing.
report_on() {
  local db=$1
  compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${db}" -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
\echo '--- schema ---'
select count(*) as tables from information_schema.tables
 where table_schema = 'public' and table_type = 'BASE TABLE';
select count(*) as sequences from information_schema.sequences where sequence_schema = 'public';

\echo '--- content ---'
select 'regions' as t, count(*) from regions
union all select 'activities', count(*) from activities
union all select 'itineraries', count(*) from itineraries
union all select 'itinerary_days', count(*) from itinerary_days
union all select 'packages', count(*) from packages
union all select 'map_places', count(*) from map_places
union all select 'articles', count(*) from articles
union all select 'translations', count(*) from translations
order by 1;

\echo '--- commerce and accounts ---'
select 'users' as t, count(*) from users
union all select 'orders', count(*) from orders
union all select 'sessions', count(*) from sessions
order by 1;

\echo '--- recovery point ---'
select max(created_at) as newest_order from orders;
select count(*) as elevated_accounts from users where role <> 'customer' and deleted_at is null;
SQL
}

assert_sane() {
  local db=$1
  local tables
  tables=$(compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${db}" -tAc \
    "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
  # 37 tables at the schema as shipped; anything under 30 means the restore
  # stopped part way through rather than "the schema changed a bit".
  [[ ${tables} -ge 30 ]] || die "restored database has only ${tables} tables; the restore is not complete"
  log "restored database has ${tables} tables"
}

# ===========================================================================
# Rehearsal
# ===========================================================================
if [[ ${TARGET} == verify ]]; then
  log "restoring into scratch database ${VERIFY_DB} (production is untouched)"

  psql_admin -c "drop database if exists ${VERIFY_DB} with (force)"
  psql_admin -c "create database ${VERIFY_DB}"

  # --exit-on-error: a restore that logs 200 errors and returns 0 is how a
  # rehearsal passes while the real thing would have failed.
  compose exec -T postgres pg_restore \
    -U "${POSTGRES_USER}" -d "${VERIFY_DB}" \
    --no-owner --no-privileges --exit-on-error \
    <"${ARCHIVE}"

  assert_sane "${VERIFY_DB}"
  report_on "${VERIFY_DB}"

  if [[ ${KEEP} == 1 ]]; then
    log "keeping ${VERIFY_DB} (you asked for --keep). Drop it when you are done:"
    log "  docker compose -f ${COMPOSE_FILE} exec -T postgres psql -U ${POSTGRES_USER} -d postgres -c 'drop database ${VERIFY_DB} with (force)'"
  else
    psql_admin -c "drop database if exists ${VERIFY_DB} with (force)"
    log "dropped ${VERIFY_DB}"
  fi

  log "REHEARSAL PASSED — ${KEY} restores cleanly."
  log 'Record the date in docs/runbook.md.'
  exit 0
fi

# ===========================================================================
# Production
# ===========================================================================
[[ ${CONFIRM} == "${CONFIRM_PHRASE}" ]] ||
  die "refusing to overwrite ${POSTGRES_DB}. Re-run with --confirm '${CONFIRM_PHRASE}' if that is genuinely what you want."

log '=============================================================='
log "REPLACING THE LIVE DATABASE ${POSTGRES_DB} FROM ${KEY}"
log '=============================================================='

# --- 1. Safety dump --------------------------------------------------------
# Whatever is in there now may be damaged, but it is also the only copy of
# everything written since the backup being restored. Capture it first.
mkdir -p "${WORK_DIR}"
readonly SAFETY="${WORK_DIR}/pre-restore-$(date -u '+%Y%m%dT%H%M%SZ').dump"
log "taking a pre-restore safety dump -> ${SAFETY}"
if compose exec -T postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  --format=custom --compress=6 --no-owner --no-privileges >"${SAFETY}"; then
  log "safety dump: $(stat -c %s "${SAFETY}") bytes"
else
  rm -f "${SAFETY}"
  log 'WARNING: the safety dump failed. That is itself a strong signal about'
  log '         the state of the database. Continuing, because the point of'
  log '         this path is to recover from exactly that.'
fi

# --- 2. Quiesce writers ----------------------------------------------------
# Remember which colour was live so the same one comes back; bringing up the
# wrong colour would silently roll the application version back too.
live_colours=()
for colour in blue green; do
  state=$(compose ps --format json "app-${colour}" 2>/dev/null | jq -r '.State // empty' | head -n1)
  [[ ${state} == running ]] && live_colours+=("app-${colour}")
done
log "stopping writers: ${live_colours[*]:-none} worker"
compose stop worker "${live_colours[@]}" >/dev/null

# --- 3. Replace ------------------------------------------------------------
log "dropping and recreating ${POSTGRES_DB}"
# `with (force)` terminates leftover backends; without it the drop blocks
# forever behind one idle connection and the outage gets longer, not shorter.
psql_admin -c "drop database if exists ${POSTGRES_DB} with (force)"
psql_admin -c "create database ${POSTGRES_DB} owner ${POSTGRES_USER}"

log 'restoring'
compose exec -T postgres pg_restore \
  -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  --no-owner --no-privileges --exit-on-error \
  <"${ARCHIVE}"

assert_sane "${POSTGRES_DB}"

# --- 4. Bring the application back -----------------------------------------
log 'starting worker and application'
compose start worker "${live_colours[@]}" >/dev/null

deadline=$((SECONDS + 120))
healthy=0
while [[ ${SECONDS} -lt ${deadline} ]]; do
  ok=1
  for c in "${live_colours[@]}"; do
    status=$(docker inspect --format '{{.State.Health.Status}}' "bali-${c}" 2>/dev/null || echo unknown)
    [[ ${status} == healthy ]] || ok=0
  done
  if [[ ${ok} == 1 ]]; then
    healthy=1
    break
  fi
  sleep 3
done
[[ ${healthy} == 1 ]] || die 'the application did not become healthy after the restore — see `docker compose logs`'

report_on "${POSTGRES_DB}"

log '=============================================================='
log "RESTORE COMPLETE from ${KEY}"
log "Pre-restore safety dump: ${SAFETY}"
log 'Next: purge the Cloudflare cache (everything), then confirm the site'
log 'in all three locales. See docs/runbook.md.'
log '=============================================================='
