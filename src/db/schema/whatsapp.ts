import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { users } from './auth'
import { orders } from './commerce'

/**
 * WhatsApp automation send log (migration 0033). One row per automatic
 * message: `dedupe_key` is UNIQUE, so the same event (e.g. «booking
 * confirmed» for one order item) can never be sent twice, however many times
 * its trigger runs. Studio → WhatsApp lists it and can retry failed rows.
 *
 * status: queued | sent | failed | skipped (no number / no consent / off)
 */
export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    automation: varchar('automation', { length: 40 }).notNull(),
    dedupeKey: varchar('dedupe_key', { length: 160 }).notNull().unique(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    toPhone: varchar('to_phone', { length: 20 }),
    locale: varchar('locale', { length: 5 }).notNull().default('en'),
    /** Variables the text was rendered with (name, order number, link…). */
    vars: jsonb('vars').$type<Record<string, string>>().notNull().default({}),
    body: text('body'),
    status: varchar('status', { length: 12 }).notNull().default('queued'),
    provider: varchar('provider', { length: 16 }),
    providerMessageId: varchar('provider_message_id', { length: 120 }),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('whatsapp_messages_created_idx').on(t.createdAt),
    index('whatsapp_messages_status_idx').on(t.status, t.createdAt),
  ],
)
