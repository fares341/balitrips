import { pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { users } from './auth'

/**
 * "شارك رحلتي" (الوثيقة 12.3): رابط عام للقراءة فقط لأماكن "رحلتي".
 *
 * صف واحد لكل مستخدم (`user_id` فريد): "مشاركة" تنشئه أو تدوّره (رمز جديد،
 * `revoked_at` يُفرَّغ)، و"إيقاف المشاركة" يضع `revoked_at` فيموت الرابط فوراً.
 * الرمز 32 بايت عشوائية بترميز base64url (43 حرفاً) — لا يُشتق من المستخدم
 * ولا يُخمَّن. لا يُخزَّن مشفّراً عمداً: صاحب الرحلة يحتاج نسخ الرابط مجدداً،
 * والرابط لا يمنح أكثر من قراءة قائمة يحجب منها كل ما لا يراه الزائر.
 */
export const tripShares = pgTable(
  'trip_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('trip_shares_user_unique').on(t.userId),
    uniqueIndex('trip_shares_token_unique').on(t.token),
  ],
)
