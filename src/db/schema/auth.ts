import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { timestamps } from './_shared'

/**
 * Auth tables, shaped for Better Auth.
 *
 * Sessions live in Postgres rather than a stateless JWT, so revocation on
 * password change or role change is immediate.
 */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** citext would be ideal; lowercase on write until the extension lands. */
    email: varchar('email', { length: 256 }).notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    name: varchar('name', { length: 128 }),
    phone: varchar('phone', { length: 32 }),
    country: varchar('country', { length: 2 }),
    locale: varchar('locale', { length: 5 }).notNull().default('en'),

    /**
     * 'customer' | 'staff' | 'admin'.
     *
     * Checked server-side on EVERY admin request — in middleware and again
     * inside each route handler and server action. Middleware alone is not
     * an authorization boundary: one missed matcher pattern opens a route.
     */
    role: varchar('role', { length: 16 }).notNull().default('customer'),

    /** TOTP is mandatory for staff and admin, enforced at login. */
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    twoFactorSecret: text('two_factor_secret'),

    image: text('image'),

    /**
     * حالة الحساب: 'active' | 'banned'.
     *
     * الحظر يعيش على المستخدم نفسه (وليس جدولاً منفصلاً) لأن كل قراءة جلسة
     * تمر عليه أصلاً — `getSession()` تعامل الحساب المحظور كغير مسجّل، كما
     * تفعل مع `deleted_at`. `banned_until` = NULL مع 'banned' يعني حظراً دائماً.
     * تاريخ كل حظر ورفعه محفوظ في `audit_log` و`activity_log`.
     */
    status: varchar('status', { length: 16 }).notNull().default('active'),
    /**
     * موافقة صريحة على رسائل واتساب (سياسة Meta تشترطها حتى للرسائل
     * التشغيلية). افتراضياً لا — لا نراسل أحداً لم يطلب ذلك.
     */
    whatsappOptIn: boolean('whatsapp_opt_in').notNull().default(false),
    bannedUntil: timestamp('banned_until', { withTimezone: true }),
    banReason: text('ban_reason'),

    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'credential' | 'google' | 'apple' */
    providerId: varchar('provider_id', { length: 32 }).notNull(),
    accountId: varchar('account_id', { length: 256 }).notNull(),

    passwordHash: text('password_hash'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    scope: text('scope'),

    ...timestamps,
  },
  (t) => [uniqueIndex('accounts_provider_unique').on(t.providerId, t.accountId)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 256 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    /**
     * الجهاز الذي أُنشئت عليه الجلسة (`devices.id`).
     *
     * بلا مفتاح أجنبي عمداً: `devices` يعرّف في ./security الذي يستورد هذا
     * الملف، والمرجع العكسي يصنع حلقة استيراد. إلغاء جهاز يحذف جلساته صراحةً
     * في `revokeDevice()`، وهو المكان الوحيد الذي يحذف جهازاً.
     */
    deviceId: uuid('device_id'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('sessions_token_unique').on(t.token),
    index('sessions_user_idx').on(t.userId),
    index('sessions_device_idx').on(t.deviceId),
  ],
)

export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: varchar('identifier', { length: 256 }).notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
)
