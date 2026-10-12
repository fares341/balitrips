import {
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

import { users } from './auth'
import { timestamps } from './_shared'

/**
 * جداول الأمان ومنع مشاركة الحسابات.
 *
 *  - `devices`         — كل جهاز سجّل منه مستخدم دخولاً (بصمة + متصفح + نظام).
 *  - `activity_log`    — نشاط المستخدمين (دخول، فشل دخول، تحميل PDF، وصول مرفوض…).
 *                        مختلف عن `audit_log` الذي يسجّل تعديلات الإدارة على البيانات.
 *  - `banned_devices`  — بصمات محظورة على مستوى المنصة (أياً كان الحساب).
 *  - `banned_ips`      — عناوين IP محظورة.
 *
 * حظر المستخدم نفسه على `users.status` / `users.banned_until` (انظر ./auth).
 */

/* --------------------------------------------------------------------------
   الأجهزة
   -------------------------------------------------------------------------- */

export const DEVICE_STATUSES = ['active', 'revoked', 'banned'] as const
export type DeviceStatus = (typeof DEVICE_STATUSES)[number]

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /**
     * SHA-256 (hex) لبصمة المتصفح مدموجة مع عائلة المتصفح ونظام التشغيل.
     *
     * لا يدخل الـ IP في البصمة عمداً: هاتف ينتقل من Wi-Fi الفندق إلى شبكة
     * الجوال يأخذ IP جديداً كل مرة، ولو دخل في البصمة لاعتُبر كل تنقل "جهازاً
     * جديداً" واستُهلك حد الأجهزة خلال يوم سياحة واحد. الـ IP يُخزَّن بجانبها.
     */
    fingerprintHash: varchar('fingerprint_hash', { length: 64 }).notNull(),
    /** true عندما لم يرسل المتصفح بصمة (JS معطّل) واستُخدم User-Agent فقط. */
    weak: boolean('weak').notNull().default(false),

    browser: varchar('browser', { length: 64 }),
    os: varchar('os', { length: 64 }),
    userAgent: text('user_agent'),
    ip: varchar('ip', { length: 64 }),

    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),

    status: varchar('status', { length: 16 }).$type<DeviceStatus>().notNull().default('active'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: varchar('revoked_reason', { length: 64 }),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('devices_user_fp_unique').on(t.userId, t.fingerprintHash),
    index('devices_fp_idx').on(t.fingerprintHash),
    index('devices_user_status_idx').on(t.userId, t.status),
  ],
)

/* --------------------------------------------------------------------------
   سجل النشاط
   -------------------------------------------------------------------------- */

export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL لمحاولات دخول فاشلة على بريد غير موجود، أو لزائر. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** أحد `ACTIVITY_ACTIONS` في src/lib/security/activity.ts */
    action: varchar('action', { length: 40 }).notNull(),
    ip: varchar('ip', { length: 64 }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    details: jsonb('details').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('activity_user_time_idx').on(t.userId, t.createdAt),
    index('activity_action_time_idx').on(t.action, t.createdAt),
    index('activity_ip_time_idx').on(t.ip, t.createdAt),
    index('activity_time_idx').on(t.createdAt),
  ],
)

/* --------------------------------------------------------------------------
   الحظر على مستوى المنصة
   -------------------------------------------------------------------------- */

/**
 * حقول مشتركة لكل سجل حظر.
 *
 * `until` = NULL يعني حظراً دائماً. الرفع لا يحذف السجل بل يملأ `lifted_at`،
 * لتبقى قصة "من حظر من ولماذا ومتى رُفع" قابلة للمراجعة.
 */
const banColumns = () => ({
  id: uuid('id').primaryKey().defaultRandom(),
  reason: text('reason').notNull(),
  until: timestamp('until', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  liftedAt: timestamp('lifted_at', { withTimezone: true }),
  liftedBy: uuid('lifted_by').references(() => users.id, { onDelete: 'set null' }),
})

export const bannedDevices = pgTable(
  'banned_devices',
  {
    ...banColumns(),
    fingerprintHash: varchar('fingerprint_hash', { length: 64 }).notNull(),
  },
  (t) => [index('banned_devices_fp_idx').on(t.fingerprintHash, t.liftedAt)],
)

export const bannedIps = pgTable(
  'banned_ips',
  {
    ...banColumns(),
    ip: varchar('ip', { length: 64 }).notNull(),
  },
  (t) => [index('banned_ips_ip_idx').on(t.ip, t.liftedAt)],
)

/* --------------------------------------------------------------------------
   تنبيهات الأمان (قائمة المراجعة)
   -------------------------------------------------------------------------- */

export const ALERT_STATUSES = ['open', 'dismissed', 'actioned'] as const
export type AlertStatus = (typeof ALERT_STATUSES)[number]

/**
 * نتيجة قاعدة كشف تلقائية (src/lib/security/rules.ts).
 *
 * `auto_action` يسجّل ما فعلته القاعدة بنفسها (حظر IP مؤقت مثلاً) حتى يعرف
 * المراجع هل المطلوب منه قرار أم مجرد تأكيد. تنبيه مفتوح واحد لكل
 * (قاعدة، مفتاح) — التكرار يزيد `hits` ولا يُغرق القائمة.
 */
export const securityAlerts = pgTable(
  'security_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rule: varchar('rule', { length: 48 }).notNull(),
    /** 'low' | 'medium' | 'high' */
    severity: varchar('severity', { length: 8 }).notNull(),
    /** مفتاح التجميع: `user:<id>` أو `ip:<addr>`. */
    subject: varchar('subject', { length: 128 }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    ip: varchar('ip', { length: 64 }),
    details: jsonb('details').$type<Record<string, unknown>>(),
    autoAction: varchar('auto_action', { length: 48 }),
    hits: integer('hits').notNull().default(1),
    status: varchar('status', { length: 12 }).$type<AlertStatus>().notNull().default('open'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('security_alerts_status_idx').on(t.status, t.updatedAt),
    index('security_alerts_subject_idx').on(t.rule, t.subject, t.status),
    index('security_alerts_user_idx').on(t.userId),
  ],
)
