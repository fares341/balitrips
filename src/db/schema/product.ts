import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { users } from './auth'
import { mapPlaces } from './content'
import {
  currency,
  localized,
  priceMinor,
  publishing,
  softDelete,
  timestamps,
  type Localized,
} from './_shared'

/**
 * الباقات، الوسوم، ورحلتي.
 */

/* --------------------------------------------------------------------------
   الباقات
   -------------------------------------------------------------------------- */

/**
 * باقة قابلة للبيع. شراؤها يمنح صف `entitlements` (انظر
 * src/lib/entitlements/plans.ts) بنوع الصلاحية ومدتها وحد أجهزتها — نسخة
 * مجمّدة وقت الشراء، فتعديل الباقة لاحقاً لا يغيّر ما اشتراه العميل.
 *
 * السعر من هنا على الخادم دائماً (`buildQuote`)، كما في باقي الكتالوج.
 */
export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 64 }).notNull().unique(),
    name: localized('name').notNull(),
    description: localized('description'),
    /** نقاط المزايا المعروضة في صفحة الباقات. */
    features: jsonb('features').$type<Localized[]>(),
    icon: varchar('icon', { length: 32 }),

    priceMinor: priceMinor(),
    currency: currency(),

    /** 'map_access' | 'vip' — ما تفتحه الباقة على الخريطة. */
    entitlementKind: varchar('entitlement_kind', { length: 32 }).notNull(),
    /** NULL = مدى الحياة. */
    durationDays: integer('duration_days'),
    deviceLimit: integer('device_limit').notNull().default(2),
    canUseTrip: boolean('can_use_trip').notNull().default(true),
    canSaveFavorites: boolean('can_save_favorites').notNull().default(true),
    /** الوثيقة 13.2: "هل يستطيع تحميل PDF؟" — false = عرض داخل الموقع فقط. */
    canDownloadPdf: boolean('can_download_pdf').notNull().default(true),
    /**
     * الباقة العائلية (الوثيقة 13.1/13.3/14.3): عدد المستخدمين الذين تشملهم
     * الباقة **مع** صاحبها. 1 = صاحبها فقط. أكثر من 1 = يدعو أفراداً بالبريد.
     */
    maxMembers: integer('max_members').notNull().default(1),

    featured: boolean('featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),

    ...publishing,
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('plans_status_sort_idx').on(t.status, t.sortOrder)],
)

/* --------------------------------------------------------------------------
   الوسوم
   -------------------------------------------------------------------------- */

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** مفتاح ثابت للروابط والفلاتر: `specialty-coffee`, `hidden-gems`. */
    key: varchar('key', { length: 64 }).notNull(),
    label: localized('label').notNull(),
    /** 'active' | 'inactive' */
    status: varchar('status', { length: 16 }).notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('tags_key_unique').on(t.key)],
)

export const placeTags = pgTable(
  'place_tags',
  {
    placeId: uuid('place_id')
      .notNull()
      .references(() => mapPlaces.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.tagId] }), index('place_tags_tag_idx').on(t.tagId)],
)

/* --------------------------------------------------------------------------
   رحلتي
   -------------------------------------------------------------------------- */

/**
 * أماكن يضيفها المستخدم من الخريطة إلى رحلته، مرتبة يدوياً، مع يوم اختياري.
 *
 * منفصلة عن "الخطة المؤكدة" في /account/trip المبنية من الطلبات المدفوعة:
 * تلك ما دفع ثمنه، وهذه ما يخطط لزيارته. خلطهما كان سيعرض مكاناً لم يُدفع
 * له كأنه حجز مؤكد.
 */
export const tripItems = pgTable(
  'trip_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => mapPlaces.id, { onDelete: 'cascade' }),
    /** NULL = لم يُحدد يوم بعد. */
    dayNumber: integer('day_number'),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('trip_items_user_place_unique').on(t.userId, t.placeId),
    index('trip_items_user_order_idx').on(t.userId, t.dayNumber, t.position),
    index('trip_items_place_idx').on(t.placeId),
  ],
)
