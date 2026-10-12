import { jsonb, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'

import { timestamps } from './_shared'
import { users } from './auth'

/**
 * Operator-editable configuration.
 *
 * Everything the business needs to change without a deployment: which
 * currencies are sellable and which one is presented, the fee schedule, the
 * WhatsApp number that appears in the footer and on /contact, and the bodies
 * of the four policy pages.
 *
 * A key/value table rather than a wide one-row table on purpose. These
 * settings arrive in unrelated groups at unrelated times, and a wide table
 * would need a migration for every new knob — the exact friction that made
 * the prototype hard-code a phone number in two components and put four
 * `href="#"` links in the footer. One row per group keeps a write to the fee
 * schedule from touching the policy text, so two operators editing different
 * screens cannot clobber each other.
 *
 * `value` is jsonb and its shape is owned by the reader, not the column:
 * `src/app/(admin)/_lib/settings.ts` declares a Zod schema per key, parses on
 * read, and falls back to a documented default when a row is missing or
 * malformed. That matters because this table is the one place in the system
 * where a hand-written `UPDATE` is plausible — a bad value must degrade to
 * the default, never crash a customer-facing page.
 *
 * NOT a place for secrets. Anything with a credential in it stays in the
 * environment; this table is read by ordinary application code and its
 * contents are echoed back into an admin form.
 */
export const siteSettings = pgTable('site_settings', {
  /** Stable group name, e.g. `currencies`, `fees`, `policy.refund`. */
  key: varchar('key', { length: 64 }).primaryKey(),
  value: jsonb('value').notNull(),
  /** Who last wrote it. The full before/after lives in `audit_log`. */
  updatedByActorId: uuid('updated_by_actor_id').references(() => users.id),
  ...timestamps,
})
