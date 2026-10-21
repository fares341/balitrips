import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { users } from './auth'
import { activities } from './content'

/**
 * «أبلغني عند التوفر» (migration 0023): a visitor asks to be told when an
 * `unavailable` activity can be booked again. One row per activity + contact
 * (`contact_key`, normalised email/phone), so asking twice changes nothing.
 *
 * Used for that single alert and nothing else — never for marketing. When the
 * activity goes back to `published` the pending rows are claimed atomically
 * (`notified_at`), one job each is queued, and the job stamps `sent_at`.
 * Asking again after an alert re-arms the same row.
 */
export const availabilityAlerts = pgTable(
  'availability_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: varchar('email', { length: 254 }),
    /** E.164 without "+", as WhatsApp takes it. */
    phone: varchar('phone', { length: 20 }),
    contactKey: varchar('contact_key', { length: 300 }).notNull(),
    locale: varchar('locale', { length: 8 }).notNull().default('ar'),
    /** Claimed for sending (the activity was published again). Null = waiting. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    /** At least one channel delivered (or nothing left to try). */
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('availability_alerts_contact_uq').on(t.activityId, t.contactKey),
    index('availability_alerts_pending_idx').on(t.activityId, t.notifiedAt),
  ],
)
