# Supplier integrations (Phase 6)

Studio → **Integrations** (`integrations.write`, admin only). One *connection*
per supplier system. Code: `src/lib/integrations/`.

## What works today — and what does not

| Type | Status | What happens |
| --- | --- | --- |
| `manual` | **real** | Staff book with the supplier by phone/WhatsApp/e-mail (the existing flow). When staff record a supplier confirmation on an order line, the connection's log records it. |
| `csv` | **real** | Staff upload the supplier's CSV of products, costs and availability; Studio shows a row-by-row preview; nothing changes until "Apply". |
| `rest`, `graphql`, `webhook`, `oauth2`, `api_key`, `scheduled` | **requires per-supplier development** | The connection can be created, described and its keys stored encrypted, but it cannot be turned on: there is no adapter. |

There is no generic "REST adapter" and no simulated supplier. A remote adapter
is written only against a real supplier API, with its documentation and a
signed agreement (test credentials for sandbox first).

## Security model

- **Keys at rest:** AES-256-GCM through the same module and key as the Phase 5
  marketing tokens (`src/lib/analytics/secret-crypto.ts`): `INTEGRATION_SECRET_KEY`,
  or a key derived from `BETTER_AUTH_SECRET` when it is not set. Sealed values
  live on the connection row (`credentials_sealed`, `webhook_secret_sealed`).
  With no key at all Studio refuses to store a secret and says why. Changing the
  key makes stored keys unreadable (re-enter them).
- **Never to the browser:** pages select only non-secret columns
  (`integrationPublicColumns`); the UI shows "Saved ✓" and the last 4
  characters. Decrypted keys live in a `SecretBag`, which serialises as
  `[redacted]` (JSON, string, `console.log`). Audit rows record field names,
  never values.
- **Webhook signing secret:** generated server-side (`whsec_…`), shown once in
  the response to the click that created it (never in a URL), then only its
  last 4.
- **Logs:** `integration_logs` stores direction, operation, status, HTTP status,
  duration, error text and a SHA-256 of the payload — never the payload.
  Handled supplier webhooks have their stored body replaced by
  `{redacted, sha256, bytes}`.
- **Permissions:** every action checks `integrations.write` on the server;
  applying a CSV also needs `prices.write`.

## Inbound webhooks

`POST /api/integrations/<connection id>/webhook`

```
X-Bali-Timestamp: <unix seconds>
X-Bali-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
X-Bali-Event-Id:  <supplier's unique event id>   (recommended)
```

1. Unknown connection, or no signing secret → 404. Paused → 503 (the supplier
   retries later; nothing is lost). Over 120/min per connection → 429.
2. Signature checked on the raw body, ±5 minutes → otherwise 401 (logged, not
   counted as a supplier failure).
3. Stored once in `webhook_events` (`provider = 'integration'`,
   `provider_event_id = <connection>:<sha256(event id or body)>`, unique) —
   a redelivery answers 200 `duplicate` and runs nothing.
4. Processed by the worker queue `integration.webhook` (retries with
   exponential backoff, dead-letter queue). The monitor re-queues events that
   were accepted but never handled (e.g. queue briefly down, or connection
   paused then resumed).

A supplier with its own signature scheme gets `verifyWebhook` in its adapter.

## CSV format

```
type,external_id,name,cost,currency,date,slot,capacity,closed
product,KAY-01,Ayung rafting (half day),,,,,,
price,KAY-01,,45.00,USD,,,,
availability,KAY-01,,,,2026-11-03,,12,no
availability,KAY-01,,,,2026-11-04,08:00,,yes
```

- `external_id` is linked once in Studio to one of **that supplier's** offers
  (`activity_supplier_offers`: activity + package + cost) via
  `external_product_mappings`. Unlinked ids are reported, never guessed.
- `price` rows set the offer's **cost to us**, never our selling price.
- `availability` rows set the activity's places (`capacity`) / `closed` for the
  day (and optional `slot`). `booked` is never touched; a capacity below what is
  already sold is always a conflict.
- Comma or semicolon, quotes, BOM are handled; max 2 MB / 5,000 rows.

**Conflict policy** (per connection): a conflict means our row was changed after
the last import of that id (`updated_at > last_imported_at`).
`flag` (default) leaves it for a person, `keep_ours` keeps ours, `take_theirs`
applies theirs. The preview is recomputed inside the apply transaction with the
rows locked, so what is applied matches the database at that moment.

## Queues, retries, alerts

| Queue | Purpose | Retry |
| --- | --- | --- |
| `integration.sync` | "Sync now" — runs the adapter's `import*` methods for the connection's services | connection's retry limit / first delay, exponential backoff (max 1 h), then `integration.sync.dlq` |
| `integration.webhook` | act on one stored webhook | same |

Every call writes `integration_logs` and updates the connection's counters
(success, failure, consecutive failures, last sync, last error). After 3
failures in a row the connection is marked `error` and admins get a
"Supplier connection failing" alert (at most every 6 hours per connection).
Pausing keeps everything and runs nothing.

## Adding a supplier adapter (developer)

1. Get the supplier's API documentation, sandbox credentials and the signed
   agreement. Confirm rate limits and how they sign webhooks.
2. Create `src/lib/integrations/adapters/<supplier>.ts` exporting a
   `SupplierAdapter` (`src/lib/integrations/adapter.ts`). Implement only what the
   supplier really supports: `importProducts`, `importPrices`,
   `importAvailability`, `createBooking`, `cancelBooking`, `getBookingStatus`,
   `verifyWebhook`, `handleWebhook`. Read keys with `context.secrets.get(name)`
   at request time; never log them or put them in errors.
3. Map their ids through `external_product_mappings`; apply changes with the
   same rules as the CSV import (conflict policy, never below `booked`).
4. Register it in `src/lib/integrations/registry.ts` (a new connection type, or
   a supplier-specific type) and add Studio labels (`int.type_*`, `int.about_*`).
5. Throw on failure — the queue retries with backoff and dead-letters; do not
   swallow errors. Respect `rateLimitPerMinute`.
6. Tests: a recorded sandbox response for each method, the signature check, and
   idempotency of `handleWebhook`.
7. Turn it on in **sandbox** first; switch the connection's environment to
   *Live* only after a successful end-to-end booking with the supplier.
