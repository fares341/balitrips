/**
 * Phase 6 (migration 0022): supplier integrations, system health, shared rate
 * limits.
 *
 *  - `supplier_integrations` — one connection to one supplier. Secrets are
 *    AES-256-GCM ciphertext (src/lib/integrations/crypto.ts, key from
 *    INTEGRATION_SECRET_KEY / BETTER_AUTH_SECRET, same as integration_secrets) and are never selected by a page: Studio reads only the
 *    hints (last 4 characters).
 *  - `external_product_mappings` — the supplier's id ↔ our row.
 *  - `integration_imports` — an uploaded CSV, previewed before it is applied.
 *  - `integration_logs` — every call in or out: status, duration, error and a
 *    HASH of the payload, never the payload itself (no personal data).
 *  - `error_events` — server and browser errors, one row per fingerprint with a
 *    counter, scrubbed of e-mails, phone numbers, tokens and card numbers.
 *  - `rate_limits` — counters shared by every app instance (login, codes,
 *    contact form, coupons, tickets).
 *  - `system_heartbeats` — "this last worked at": the nightly backup writes
 *    one, and alert throttling uses `alert:<key>` rows.
 */

import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { timestamps } from './_shared'
import { users } from './auth'
import { suppliers } from './suppliers'

export const supplierIntegrations = pgTable(
  'supplier_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    /** rest | graphql | webhook | oauth2 | api_key | csv | scheduled | manual */
    connectionType: varchar('connection_type', { length: 16 }).notNull(),
    /** sandbox | production */
    environment: varchar('environment', { length: 12 }).notNull().default('sandbox'),
    /** active | paused | error — paused keeps everything, runs nothing. */
    status: varchar('status', { length: 12 }).notNull().default('paused'),
    /** Sealed JSON object of the supplier's keys (`v1.<iv>.<tag>.<data>`). */
    credentialsSealed: text('credentials_sealed'),
    /** `{ fieldName: 'last4' }` — all Studio ever shows of a key. */
    credentialsHint: jsonb('credentials_hint').$type<Record<string, string>>(),
    /** Signing secret for the inbound webhook, sealed like the keys. */
    webhookSecretSealed: text('webhook_secret_sealed'),
    webhookSecretHint: varchar('webhook_secret_hint', { length: 8 }),
    /** Which of products | prices | availability | bookings this connection handles. */
    services: jsonb('services').$type<string[]>().notNull().default([]),
    /** keep_ours | take_theirs | flag */
    conflictPolicy: varchar('conflict_policy', { length: 12 }).notNull().default('flag'),
    retryLimit: integer('retry_limit').notNull().default(5),
    retryDelaySeconds: integer('retry_delay_seconds').notNull().default(60),
    rateLimitPerMinute: integer('rate_limit_per_minute'),
    rateLimitNote: varchar('rate_limit_note', { length: 200 }),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastError: text('last_error'),
    successCount: integer('success_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    /** Last time admins were alerted about this connection (throttle). */
    alertedAt: timestamp('alerted_at', { withTimezone: true }),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('supplier_integrations_supplier_idx').on(t.supplierId)],
)

export const externalProductMappings = pgTable(
  'external_product_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => supplierIntegrations.id, { onDelete: 'cascade' }),
    /** The supplier's own id for the product. */
    externalId: varchar('external_id', { length: 160 }).notNull(),
    /** What it maps to here: `offer` (an activity_supplier_offers row) today. */
    internalKind: varchar('internal_kind', { length: 16 }).notNull().default('offer'),
    internalId: uuid('internal_id').notNull(),
    /** The supplier's name for it, from the last import. */
    label: varchar('label', { length: 200 }),
    lastImportedAt: timestamp('last_imported_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('external_product_mappings_unique').on(t.integrationId, t.externalId),
    index('external_product_mappings_internal_idx').on(t.internalKind, t.internalId),
  ],
)

export const integrationImports = pgTable(
  'integration_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => supplierIntegrations.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 200 }),
    /** The uploaded text (supplier products, prices, dates — no customer data). */
    body: text('body').notNull(),
    rowCount: integer('row_count').notNull().default(0),
    /** previewed | applied | discarded */
    status: varchar('status', { length: 12 }).notNull().default('previewed'),
    /** Counts from the last preview or the apply. */
    summary: jsonb('summary').$type<Record<string, number>>(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    appliedBy: uuid('applied_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('integration_imports_integration_idx').on(t.integrationId, t.createdAt)],
)

export const integrationLogs = pgTable(
  'integration_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Kept when the connection is deleted, for the record. */
    integrationId: uuid('integration_id').references(() => supplierIntegrations.id, {
      onDelete: 'set null',
    }),
    /** in | out | internal */
    direction: varchar('direction', { length: 8 }).notNull(),
    /** e.g. webhook.receive, sync.products, csv.apply, booking.create */
    operation: varchar('operation', { length: 40 }).notNull(),
    endpoint: varchar('endpoint', { length: 300 }),
    /** ok | error | skipped */
    status: varchar('status', { length: 12 }).notNull(),
    httpStatus: integer('http_status'),
    durationMs: integer('duration_ms'),
    error: text('error'),
    /** sha256 of the payload — proves what was exchanged without storing it. */
    payloadHash: varchar('payload_hash', { length: 64 }),
    payloadBytes: integer('payload_bytes'),
    /** Counts and ids only. */
    details: jsonb('details').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('integration_logs_integration_idx').on(t.integrationId, t.createdAt),
    index('integration_logs_created_idx').on(t.createdAt),
  ],
)

export const errorEvents = pgTable(
  'error_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** sha256 of source + name + normalised message + top frame. */
    fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
    /** route | render | action | worker | client | proxy | other */
    source: varchar('source', { length: 16 }).notNull(),
    name: varchar('name', { length: 120 }),
    message: text('message').notNull(),
    stack: text('stack'),
    path: varchar('path', { length: 300 }),
    count: integer('count').notNull().default(1),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    details: jsonb('details').$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex('error_events_fingerprint_unique').on(t.fingerprint),
    index('error_events_last_seen_idx').on(t.lastSeenAt),
  ],
)

export const rateLimits = pgTable(
  'rate_limits',
  {
    /** `<scope>:<subject>` — e.g. `contact:ip:203.0.113.9`, or Better Auth's key. */
    key: varchar('key', { length: 255 }).primaryKey(),
    count: integer('count').notNull().default(0),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Better Auth's own bookkeeping (epoch ms) for its sign-in limits. */
    lastRequest: bigint('last_request', { mode: 'number' }),
  },
  (t) => [index('rate_limits_expires_idx').on(t.expiresAt)],
)

export const systemHeartbeats = pgTable('system_heartbeats', {
  /** `backup`, or `alert:<key>` for alert throttling. */
  name: varchar('name', { length: 80 }).primaryKey(),
  lastOkAt: timestamp('last_ok_at', { withTimezone: true }).notNull().defaultNow(),
  details: jsonb('details').$type<Record<string, unknown>>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
