import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { users } from './auth'
import { customTripRequests } from './commerce'

/**
 * الإشعارات وملفات الجداول المخصصة.
 */

/**
 * إشعار داخل الموقع.
 *
 * النص لا يُخزَّن: يُخزَّن `type` و`params`، ويُترجم عند العرض بلغة القارئ
 * (`notif_<type>_t` / `notif_<type>_b` في messages/*.json). إشعار كُتب بالإنجليزية
 * لا يبقى إنجليزياً لمن غيّر لغته لاحقاً.
 *
 * `audience = 'staff'` إشعارات الفريق (طلب جديد، دفع، تنبيه أمني) — `user_id`
 * فارغ وتظهر لكل من يملك صلاحية الإدارة في Studio → Inbox.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    audience: varchar('audience', { length: 8 }).notNull().default('user'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 48 }).notNull(),
    params: jsonb('params').$type<Record<string, string | number>>(),
    /** مسار داخل الموقع بلا بادئة لغة (`/account/schedules`)، أو مسار Studio للفريق. */
    href: varchar('href', { length: 256 }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt),
    index('notifications_audience_idx').on(t.audience, t.readAt, t.createdAt),
  ],
)

/** ملف PDF مخصص يرفعه الفريق لطلب جدول مخصص. أكثر من نسخة ممكنة (مراجعات). */
export const customTripDocuments = pgTable(
  'custom_trip_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => customTripRequests.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    filename: varchar('filename', { length: 200 }).notNull(),
    bytes: integer('bytes').notNull(),
    version: integer('version').notNull().default(1),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    /** مسحوب من العميل (نسخة خاطئة رُفعت) — يبقى للتدقيق. */
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('custom_trip_documents_request_idx').on(t.requestId, t.version)],
)
