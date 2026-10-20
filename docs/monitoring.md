# Monitoring, alerts and rate limits (Phase 6)

## Studio → System health (`system.read`, admin only)

Plain status first, technical detail folded under "Advanced (for your technical
team)":

- **Checks**: database, background tasks (pg-boss), file storage, PDF renderer
  (Gotenberg), nightly backup. Same data as `GET /api/health/deep`.
- **Errors** (`error_events`): server errors from Next's `onRequestError`
  (`src/instrumentation.ts` — pages, route handlers, server actions, proxy), the
  Studio's action error handler, the worker (failed jobs, dead letters), the
  payment webhook, and visitors' browsers (`/api/client-errors`, beacon in both
  layouts, max 5 per page load, 30 per IP per 10 min). Grouped by fingerprint
  (ids and numbers normalised) with a counter; e-mails, phone numbers, card
  numbers, tokens, IPs and `password=`/`token=` style values are scrubbed before
  saving. "Mark handled" / "Mark all as handled"; a handled error that happens
  again reopens.
- **Background tasks**: per-queue waiting/running/failed/scheduled counts, the
  latest failed jobs (retry) and dead letters (run again on the source queue,
  or delete). Audited.
- **Webhooks**: latest `webhook_events` (payment provider and suppliers) —
  provider, event type, handled or not. Payloads are not shown.
- **Supplier connections**: counts and latest `integration_logs`.
- **Database updates**: applied Drizzle migrations vs. the ones this build ships.

## `/api/health` and `/api/health/deep`

- `/api/health` — unchanged liveness probe (touches nothing).
- `/api/health/deep` — JSON `{status, checkedAt, checks[]}`; 200 when ok/warn,
  503 when something is down. Allowed for a signed-in session with
  `system.read`, or `Authorization: Bearer $HEALTH_CHECK_TOKEN` (24+ chars).
  Anyone else gets 404.

## Backup heartbeat

`scripts/backup.sh` (nightly cron) now also upserts `system_heartbeats`
(`name = 'backup'`, `details = {key, bytes}`) through `psql` in the postgres
container after a fully verified run. Best effort: it never fails a backup.
Older than 26 h = late.

## Alerts (worker queue `system.monitor`, every 15 min)

Sent as staff notifications (Studio inbox + e-mail to admins, or to
`STAFF_ALERT_EMAILS`), each kind throttled through `system_heartbeats`
(`alert:<key>`), so several workers/instances send one alert:

| Alert | When | Throttle |
| --- | --- | --- |
| Backup is overdue | no successful backup for 26 h (only once a backup has ever reported, or on `LIVE_MODE=true`) | 12 h |
| Background tasks failed | new dead letters since the last run | 1 h |
| Many errors at once | ≥ `ERROR_SPIKE_THRESHOLD` (default 50) new error occurrences since the last run | 1 h |
| Payment notices are failing | payment webhook processing failures since the last run | 1 h |
| Supplier connection failing | 3 failures in a row on one connection | 6 h per connection |

The monitor also re-queues accepted-but-unhandled supplier webhooks and prunes
expired rate-limit rows, integration logs older than 90 days and error groups
not seen for 90 days.

## Rate limiting (shared across instances)

`rate_limits` table, one atomic `INSERT … ON CONFLICT DO UPDATE` per request
(fixed window; refused requests still count). Works across the blue/green app
containers and survives deploys. Fails open on a database error (logged).

| Where | Limit |
| --- | --- |
| Better Auth (sign-in 5/5 min, sign-up 5/h, reset 5/h, …) | unchanged numbers; storage moved from memory to Postgres (`customStorage` with atomic `consume`) |
| Contact form | 5 per hour per IP |
| Discount codes tried | 10 per 10 min per IP and per account |
| New support tickets | 10 per hour per account |
| WhatsApp code requests | 10 per hour per IP (on top of the per-account/per-number daily caps) |
| Verification codes typed | 20 per 15 min per IP (on top of 5 attempts per code) |
| Browser error reports | 30 per 10 min per IP |
| Supplier webhooks | 120 per minute per connection |

## Environment

| Variable | Needed for |
| --- | --- |
| `INTEGRATION_SECRET_KEY` | optional (Phase 5): encryption key for marketing tokens AND supplier keys; falls back to a key derived from `BETTER_AUTH_SECRET` |
| `HEALTH_CHECK_TOKEN` | optional: uptime monitor access to `/api/health/deep` |
| `ERROR_SPIKE_THRESHOLD` | optional: error-spike alert threshold (default 50) |
| `STAFF_ALERT_EMAILS` | optional (existing): who receives alerts instead of all admins |
