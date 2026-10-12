import { sql } from 'drizzle-orm'
import { integer, jsonb, timestamp, varchar } from 'drizzle-orm/pg-core'

import type { Locale } from '@/i18n/config'

/**
 * Localized text, stored as jsonb rather than a translation table.
 *
 * Content is always read in one locale by the site and in all three by the
 * admin, so a join per field would buy nothing. jsonb keeps it single-row
 * and lets Postgres index individual locales where needed.
 */
export type Localized = Record<Locale, string>

export const localized = (name: string) => jsonb(name).$type<Localized>()

/**
 * Money.
 *
 * ALWAYS integer minor units plus an ISO 4217 code. Never a float, never a
 * bare number with an implied currency. The prototype stored bare integers
 * rendered with a hard-coded "$", which cannot be extended to a platform
 * selling into several regions.
 *
 * Note minor-unit exponent varies: USD/EUR are 2, JPY is 0, BHD/KWD/OMR
 * are 3. Formatting must derive it from the currency, not assume 100.
 */
export const priceMinor = (name = 'price_minor') => integer(name).notNull()
export const currency = (name = 'currency') => varchar(name, { length: 3 }).notNull()

/** Timestamps every table carries. */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

/**
 * Soft delete.
 *
 * Content referenced by a paid order must never hard-delete, or historical
 * orders lose the name and price the customer actually bought.
 */
export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}

/** Draft/published state for every content entity. */
export const publishing = {
  status: varchar('status', { length: 16 }).notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}

export const nowSql = sql`now()`
