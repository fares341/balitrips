#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Bali Trips — nightly database backup to the PRIVATE Spaces bucket.
#
# Invoked by cron (see deploy/cloud-init.yaml), as root, at 02:30 local:
#   30 2 * * * root /opt/bali/scripts/backup.sh >>/var/log/bali/backup.log 2>&1
#
# WHY CRON AND NOT pg-boss
# ------------------------
# The application already has a durable job queue. It is the wrong tool for
# this one job, and not marginally: pg-boss stores its queue *inside the
# Postgres instance being backed up*. The situations in which last night's
# backup is the only thing standing between you and a dead business — disk
# full, WAL corruption, a runaway migration, the container refusing to start —
# are exactly the situations in which a pg-boss job cannot be enqueued,
# dequeued, or even read. A backup scheduler must not live inside the thing it
# is protecting. cron does, its state is a file on a different filesystem, and
# it runs whether or not Postgres is healthy (and says so loudly when it
# isn't).
#
# WHAT "VERIFIED" MEANS HERE
# --------------------------
# A dump that uploaded without an error is not a backup; it is an object of
# unknown content. Every run therefore:
#   1. checks the archive is structurally readable      (pg_restore --list)
#   2. checks it is not implausibly small               (floor + drift check)
#   3. checks the bytes survived the round trip         (re-download + sha256)
#   4. checks the object is NOT publicly readable       (anonymous GET -> 403)
# and only then applies retention. Any failure aborts before anything is
# deleted, and the heartbeat is not pinged — so the absence of a backup is
# itself an alert rather than a silence.
#
# Restoring is scripts/restore.sh. Rehearsing the restore is a scheduled job,
# not a good intention: see docs/runbook.md.
# ---------------------------------------------------------------------------
set -Eeuo pipefail
IFS=$'\n\t'

readonly BASE_DIR=${BALI_BASE_DIR:-/opt/bali}
readonly COMPOSE_FILE="${BASE_DIR}/docker-compose.prod.yml"
readonly BACKUP_ENV="${BASE_DIR}/backup.env"
readonly POSTGRES_ENV="${BASE_DIR}/postgres.env"
readonly WORK_DIR=${BALI_BACKUP_DIR:-/var/backups/bali}
readonly LOCK_FILE=/var/lock/bali-backup.lock

# Absolute floor. A dump of the seeded schema alone is well over 100 KiB; a
# 20 KiB "backup" means pg_dump wrote an error page or was killed mid-stream.
readonly MIN_DUMP_BYTES=${MIN_DUMP_BYTES:-20480}
# Refuse a dump that has lost more than this fraction against the previous
# one, unless FORCE=1. Catches "somebody truncated a table" before retention
# quietly ages out the last good copy.
readonly MAX_SHRINK_PCT=${MAX_SHRINK_PCT:-50}
# How many dumps to keep on the box. Local copies are a convenience for a fast
# restore, not the backup; the bucket is the backup.
readonly LOCAL_KEEP=${LOCAL_KEEP:-3}

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() {
  printf '%s  FATAL: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
  exit 1
}

trap 'die "aborted at line ${LINENO} (exit ${?})"' ERR

# --- Single instance -------------------------------------------------------
# A backup that overlaps the previous one doubles the load on a 2 vCPU box and
# can interleave two uploads to the same key.
exec 9>"${LOCK_FILE}"
flock -n 9 || die 'another backup is still running; giving up'

# --- Configuration ---------------------------------------------------------
[[ -r ${BACKUP_ENV} ]] || die "${BACKUP_ENV} is missing or unreadable (run as root)"
[[ -r ${POSTGRES_ENV} ]] || die "${POSTGRES_ENV} is missing or unreadable"

# shellcheck disable=SC1090
set -a
. "${BACKUP_ENV}"
. "${POSTGRES_ENV}"
set +a

: "${SPACES_ENDPOINT:?not set in backup.env}"
: "${SPACES_REGION:?not set in backup.env}"
: "${SPACES_PRIVATE_BUCKET:?not set in backup.env}"
: "${SPACES_KEY:?not set in backup.env}"
: "${SPACES_SECRET:?not set in backup.env}"
: "${POSTGRES_USER:?not set in postgres.env}"
: "${POSTGRES_DB:?not set in postgres.env}"

readonly PREFIX=${BACKUP_PREFIX:-db-backups}
readonly RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}

# Credentials for the AWS CLI. Exported rather than passed on the command
# line: argv is world-readable through /proc.
export AWS_ACCESS_KEY_ID=${SPACES_KEY}
export AWS_SECRET_ACCESS_KEY=${SPACES_SECRET}
export AWS_DEFAULT_REGION=${SPACES_REGION}
# There is no instance metadata service to talk to; without this the CLI
# spends a second on every call discovering that.
export AWS_EC2_METADATA_DISABLED=true
# AWS CLI v2 sends a CRC32 trailer by default. DigitalOcean Spaces rejects it,
# and the failure looks like an opaque 400 rather than anything about
# checksums. Harmless on v1.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_supported

aws_s3() { aws --endpoint-url "${SPACES_ENDPOINT}" "$@"; }
compose() { docker compose -f "${COMPOSE_FILE}" "$@"; }

for tool in docker aws jq sha256sum flock curl; do
  command -v "${tool}" >/dev/null 2>&1 || die "required tool not on PATH: ${tool}"
done

# --- Preconditions ---------------------------------------------------------
[[ -r ${COMPOSE_FILE} ]] || die "${COMPOSE_FILE} not found"
mkdir -p "${WORK_DIR}"
chmod 0700 "${WORK_DIR}"

pg_state=$(compose ps --format json postgres 2>/dev/null | jq -r '.State // empty' | head -n1)
[[ ${pg_state} == 'running' ]] || die "postgres container is '${pg_state:-absent}', not running"

readonly STAMP=$(date -u '+%Y%m%dT%H%M%SZ')
readonly DUMP_NAME="bali-${STAMP}.dump"
readonly DUMP_PATH="${WORK_DIR}/${DUMP_NAME}"

log "=== backup ${STAMP} -> s3://${SPACES_PRIVATE_BUCKET}/${PREFIX}"

# --- 1. Dump ---------------------------------------------------------------
# Custom format (-Fc): already compressed, and pg_restore can then filter by
# table, reorder, and restore in parallel. Plain SQL cannot do any of that.
# --no-owner/--no-privileges so the archive can be restored into the scratch
# database used by the monthly rehearsal, which has a different owner.
log 'dumping'
if ! compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  --format=custom --compress=6 --no-owner --no-privileges \
  >"${DUMP_PATH}"; then
  rm -f "${DUMP_PATH}"
  die 'pg_dump failed'
fi

dump_bytes=$(stat -c %s "${DUMP_PATH}")
log "wrote ${DUMP_PATH} (${dump_bytes} bytes)"

# --- 2. Integrity, before anything else happens ----------------------------
# pg_restore --list parses the entire archive's table of contents. It fails on
# a truncated or corrupted file, which a size check alone would not catch.
log 'verifying archive is readable'
toc_entries=$(compose exec -T postgres pg_restore --list <"${DUMP_PATH}" | grep -cv '^;' || true)
[[ ${toc_entries} -gt 0 ]] || die 'pg_restore --list found no entries; archive is not usable'
log "archive lists ${toc_entries} objects"

[[ ${dump_bytes} -ge ${MIN_DUMP_BYTES} ]] ||
  die "dump is ${dump_bytes} bytes, below the ${MIN_DUMP_BYTES} byte floor"

previous=$(find "${WORK_DIR}" -maxdepth 1 -name 'bali-*.dump' ! -name "${DUMP_NAME}" -printf '%T@ %p\n' |
  sort -rn | head -n1 | cut -d' ' -f2- || true)
if [[ -n ${previous} && -f ${previous} ]]; then
  prev_bytes=$(stat -c %s "${previous}")
  floor=$((prev_bytes * (100 - MAX_SHRINK_PCT) / 100))
  if [[ ${dump_bytes} -lt ${floor} ]]; then
    [[ ${FORCE:-0} == 1 ]] ||
      die "dump shrank from ${prev_bytes} to ${dump_bytes} bytes (>${MAX_SHRINK_PCT}%). Investigate, then re-run with FORCE=1 if this is expected."
    log "WARNING: accepting a ${prev_bytes} -> ${dump_bytes} byte shrink because FORCE=1"
  fi
fi

# --- 3. Optional client-side encryption ------------------------------------
# The dump contains customer names, email addresses and order history. If a
# passphrase is configured it never leaves the box in the clear. Off by
# default because a lost passphrase is an unrecoverable backup, which is a
# worse failure than the one it prevents — decide deliberately.
upload_path=${DUMP_PATH}
upload_name=${DUMP_NAME}
if [[ -n ${BACKUP_PASSPHRASE_FILE:-} ]]; then
  [[ -r ${BACKUP_PASSPHRASE_FILE} ]] || die "BACKUP_PASSPHRASE_FILE is set but ${BACKUP_PASSPHRASE_FILE} is unreadable"
  log 'encrypting (gpg, AES256)'
  gpg --batch --yes --quiet --symmetric --cipher-algo AES256 \
    --passphrase-file "${BACKUP_PASSPHRASE_FILE}" \
    --output "${DUMP_PATH}.gpg" "${DUMP_PATH}"
  upload_path="${DUMP_PATH}.gpg"
  upload_name="${DUMP_NAME}.gpg"
fi

local_sha=$(sha256sum "${upload_path}" | cut -d' ' -f1)
upload_bytes=$(stat -c %s "${upload_path}")
log "sha256 ${local_sha}"

# --- 4. Upload -------------------------------------------------------------
readonly KEY="${PREFIX}/$(date -u '+%Y/%m')/${upload_name}"
readonly OBJECT_URL="${SPACES_ENDPOINT%/}/${SPACES_PRIVATE_BUCKET}/${KEY}"

log "uploading ${KEY}"
aws_s3 s3 cp "${upload_path}" "s3://${SPACES_PRIVATE_BUCKET}/${KEY}" \
  --acl private \
  --only-show-errors \
  --metadata "sha256=${local_sha},source=bali-web-01,pgversion=17"

# Sidecar manifest so restore.sh can verify without depending on object
# metadata surviving a copy or a lifecycle transition.
printf '%s  %s\n' "${local_sha}" "${upload_name}" >"${upload_path}.sha256"
aws_s3 s3 cp "${upload_path}.sha256" "s3://${SPACES_PRIVATE_BUCKET}/${KEY}.sha256" \
  --acl private --only-show-errors

# --- 5. Prove the object is readable and intact ----------------------------
# Re-downloading a few megabytes nightly is the difference between "the upload
# call returned 0" and "the bytes are there and they are the right bytes".
log 'verifying round trip'
verify_tmp=$(mktemp -d)
trap 'rm -rf "${verify_tmp}"' EXIT

aws_s3 s3 cp "s3://${SPACES_PRIVATE_BUCKET}/${KEY}" "${verify_tmp}/roundtrip" --only-show-errors
remote_sha=$(sha256sum "${verify_tmp}/roundtrip" | cut -d' ' -f1)
remote_bytes=$(stat -c %s "${verify_tmp}/roundtrip")

[[ ${remote_bytes} == "${upload_bytes}" ]] ||
  die "uploaded ${upload_bytes} bytes but read back ${remote_bytes}"
[[ ${remote_sha} == "${local_sha}" ]] ||
  die "checksum mismatch: local ${local_sha}, remote ${remote_sha}"
log 'round trip verified'

# --- 6. Prove the object is NOT public -------------------------------------
# The private bucket holds paid PDFs as well as these dumps. A bucket that
# silently became public is the kind of thing nobody notices until it is in
# somebody else's blog post.
anon_status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${OBJECT_URL}" || echo 000)
case ${anon_status} in
  403 | 401 | 404)
    log "anonymous GET returned ${anon_status} — bucket is private"
    ;;
  200)
    die "SECURITY: ${OBJECT_URL} is publicly readable. Make ${SPACES_PRIVATE_BUCKET} private and disable its CDN before running again."
    ;;
  *)
    log "WARNING: anonymous GET returned ${anon_status}; could not confirm the bucket is private"
    ;;
esac

# --- 7. Retention ----------------------------------------------------------
# Only after everything above passed. Deleting yesterday's backup because
# today's upload "looked fine" is how a bad night becomes a bad quarter.
log "applying ${RETENTION_DAYS}-day retention"
cutoff=$(date -u -d "${RETENTION_DAYS} days ago" '+%s')

listing=$(aws_s3 s3api list-objects-v2 \
  --bucket "${SPACES_PRIVATE_BUCKET}" --prefix "${PREFIX}/" \
  --output json)

total=$(jq -r '(.Contents // []) | length' <<<"${listing}")
[[ ${total} -gt 0 ]] || die 'retention refused: the listing came back empty, which cannot be true — we just uploaded'

deleted=0
while IFS= read -r old_key; do
  [[ -n ${old_key} ]] || continue
  # Never delete the object written by this run, whatever the clocks say.
  [[ ${old_key} == "${KEY}" || ${old_key} == "${KEY}.sha256" ]] && continue
  aws_s3 s3 rm "s3://${SPACES_PRIVATE_BUCKET}/${old_key}" --only-show-errors
  deleted=$((deleted + 1))
done < <(jq -r --argjson cutoff "${cutoff}" '
    (.Contents // [])
    | map(select((.LastModified | fromdateiso8601) < $cutoff))
    | .[].Key
  ' <<<"${listing}")

remaining=$((total - deleted))
log "retention: removed ${deleted}, ${remaining} objects remain"
# Two objects per backup (dump + manifest), so a healthy 30-day history is
# ~60. Fewer than 2 means we are one bad night from having nothing.
[[ ${remaining} -ge 2 ]] || die "retention left only ${remaining} objects; refusing to call this healthy"

# --- 8. Local housekeeping -------------------------------------------------
find "${WORK_DIR}" -maxdepth 1 -name 'bali-*.dump*' -printf '%T@ %p\n' |
  sort -rn | tail -n "+$((LOCAL_KEEP * 2 + 1))" | cut -d' ' -f2- |
  while IFS= read -r stale; do
    log "pruning local ${stale}"
    rm -f -- "${stale}"
  done

# --- 9. Heartbeat ----------------------------------------------------------
# Pinged only on success, and only here. Monitoring that alerts on a *missing*
# ping catches the failure modes an alert-on-error never will: the box being
# off, cron not running, the disk being full before the script could log.
if [[ -n ${BACKUP_HEARTBEAT_URL:-} ]]; then
  curl -fsS --max-time 15 --retry 3 "${BACKUP_HEARTBEAT_URL}" >/dev/null &&
    log 'heartbeat sent' || log 'WARNING: heartbeat ping failed'
fi

log "=== backup ${STAMP} complete: ${KEY} (${upload_bytes} bytes)"
