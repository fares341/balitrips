import {
  bigint,
  boolean,
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
import { carts, orders } from './commerce'

/**
 * Phase 5 (migration 0021): first-party analytics, marketing integrations and
 * reports.
 *
 *  - `analytics_events`        one row per tracked event (catalogue in
 *                              `src/lib/analytics/events.ts`). `event_id` is
 *                              unique: the browser and the server send the same
 *                              id for the same purchase, so it is stored once.
 *  - `visitor_attribution`     first-touch and last-touch campaign (UTM) of an
 *                              anonymous visitor id.
 *  - `client_errors`           map load errors reported by the browser.
 *  - `integration_secrets`     server-only tokens (Meta Conversions API, TikTok
 *                              Events API), encrypted, never sent to a browser.
 *  - `report_schedules`        "email me this report every day/week".
 *  - `report_exports`          PDF exports rendered by the worker.
 *  - `checkout_reminders`      abandoned checkout reminders sent (max one per cart).
 *
 * Nothing here holds a name, an email or a phone number.
 */

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Dedupe key. Server events use a deterministic id (`serverEventId`). */
    eventId: uuid('event_id').notNull(),
    name: varchar('name', { length: 40 }).notNull(),
    /** browser | server */
    source: varchar('source', { length: 8 }).notNull().default('browser'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Random first-party visitor id (`bt_aid` cookie), only with analytics consent. */
    anonId: varchar('anon_id', { length: 64 }),
    sessionId: varchar('session_id', { length: 64 }),
    /** Path only — never the query string. */
    path: varchar('path', { length: 300 }),
    /** activity | itinerary | package | plan | place | addon | order_item … */
    itemKind: varchar('item_kind', { length: 24 }),
    itemId: uuid('item_id'),
    /** Slug or other readable reference of the item. */
    itemRef: varchar('item_ref', { length: 160 }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    valueMinor: bigint('value_minor', { mode: 'number' }),
    currency: varchar('currency', { length: 3 }),
    utmSource: varchar('utm_source', { length: 100 }),
    utmMedium: varchar('utm_medium', { length: 100 }),
    utmCampaign: varchar('utm_campaign', { length: 100 }),
    /** mobile | tablet | desktop */
    deviceType: varchar('device_type', { length: 16 }),
    /** Small, non-personal extras (filter key, day number, plan kind…). */
    props: jsonb('props').$type<Record<string, string | number | boolean | null>>(),
    /** The visitor allowed marketing tools when this happened. */
    consentMarketing: boolean('consent_marketing').notNull().default(false),
    /** Sent to the ad platforms' server APIs (purchase only). */
    forwardedAt: timestamp('forwarded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('analytics_events_event_id_unique').on(t.eventId),
    index('analytics_events_name_time_idx').on(t.name, t.createdAt),
    index('analytics_events_time_idx').on(t.createdAt),
    index('analytics_events_anon_idx').on(t.anonId, t.createdAt),
    index('analytics_events_user_idx').on(t.userId, t.createdAt),
    index('analytics_events_order_idx').on(t.orderId),
  ],
)

export const visitorAttribution = pgTable(
  'visitor_attribution',
  {
    anonId: varchar('anon_id', { length: 64 }).primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    firstSource: varchar('first_source', { length: 100 }),
    firstMedium: varchar('first_medium', { length: 100 }),
    firstCampaign: varchar('first_campaign', { length: 100 }),
    firstLandingPath: varchar('first_landing_path', { length: 300 }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSource: varchar('last_source', { length: 100 }),
    lastMedium: varchar('last_medium', { length: 100 }),
    lastCampaign: varchar('last_campaign', { length: 100 }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('visitor_attribution_user_idx').on(t.userId)],
)

export const clientErrors = pgTable(
  'client_errors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** map */
    area: varchar('area', { length: 24 }).notNull(),
    /** Short machine code, e.g. `engine_load`, `tiles`, `webgl`. */
    code: varchar('code', { length: 48 }).notNull(),
    path: varchar('path', { length: 300 }),
    deviceType: varchar('device_type', { length: 16 }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('client_errors_area_time_idx').on(t.area, t.createdAt)],
)

export const integrationSecrets = pgTable('integration_secrets', {
  /** meta_capi_token | tiktok_events_token */
  key: varchar('key', { length: 64 }).primaryKey(),
  /** AES-256-GCM, `v1:<iv>:<tag>:<data>` base64url. */
  ciphertext: text('ciphertext').notNull(),
  /** Last four characters, to show "…abcd" in the Studio. */
  hint: varchar('hint', { length: 8 }),
  updatedByActorId: uuid('updated_by_actor_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  ...timestamps,
})

export const reportSchedules = pgTable(
  'report_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** One of REPORT_IDS (`src/lib/reports/catalog.ts`). */
    report: varchar('report', { length: 32 }).notNull(),
    /** daily | weekly */
    frequency: varchar('frequency', { length: 12 }).notNull(),
    /** Staff user ids. Each must still be staff when it is sent. */
    recipients: jsonb('recipients').$type<string[]>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('report_schedules_enabled_idx').on(t.enabled)],
)

export const reportExports = pgTable(
  'report_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    report: varchar('report', { length: 32 }).notNull(),
    /** The filters it was made with (period, product type…). */
    params: jsonb('params').$type<Record<string, string>>().notNull(),
    /** queued | ready | failed */
    status: varchar('status', { length: 12 }).notNull().default('queued'),
    objectKey: text('object_key'),
    bytes: integer('bytes'),
    error: text('error'),
    locale: varchar('locale', { length: 2 }).notNull().default('ar'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('report_exports_requested_idx').on(t.requestedBy, t.createdAt)],
)

export const checkoutReminders = pgTable(
  'checkout_reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id').references(() => carts.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** The begin_checkout event it answers. */
    eventId: uuid('event_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('checkout_reminders_cart_unique').on(t.cartId)],
)
