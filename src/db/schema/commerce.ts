import { relations } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { currency, localized, moneyMinor, priceMinor, timestamps, type Localized } from './_shared'
import { plans } from './product'
import { users } from './auth'

/** Add-on selection stored on a cart line. */
export interface BookingOptions {
  addons?: { id: string; qty: number }[]
}

/** One priced line of a booking, frozen on the order item. */
export interface OrderItemPriceLine {
  kind: 'package' | 'addon'
  refId: string | null
  name: Localized | null
  unitMinor: number
  quantity: number
  totalMinor: number
  /** Included in the package: shown, never charged. */
  included?: boolean
}

export interface OrderItemOptions extends BookingOptions {
  lines?: OrderItemPriceLine[]
}

// ---------------------------------------------------------------------------
// Cart — server-owned, so prices cannot be tampered with client-side
// ---------------------------------------------------------------------------

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Exactly one of userId / anonymousToken is set. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Cookie value for signed-out carts, merged into the user cart on login. */
    anonymousToken: varchar('anonymous_token', { length: 64 }),
    currency: currency(),
    ...timestamps,
  },
  (t) => [index('carts_user_idx').on(t.userId), uniqueIndex('carts_anon_idx').on(t.anonymousToken)],
)

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),

    /** 'activity' | 'driver' | 'itinerary' | 'package' | 'place' | 'plan' | 'custom' */
    kind: varchar('kind', { length: 24 }).notNull(),
    /** Id of the source entity. Null for driver, which has no catalog row. */
    refId: uuid('ref_id'),

    quantity: integer('quantity').notNull().default(1),

    /**
     * Travel date as a plain DATE, never a timestamp.
     *
     * The customer may be in Riyadh (UTC+3), the server in Singapore
     * (UTC+8), and the trip in Bali (UTC+8). "12 August" must mean
     * 12 August in Bali regardless of who is asking.
     */
    travelDate: date('travel_date'),
    travelTime: time('travel_time'),
    guests: integer('guests'),

    /** Driver-specific. */
    vehicleClass: varchar('vehicle_class', { length: 16 }),
    endDate: date('end_date'),

    /**
     * Price snapshot, for display continuity only. The server ALWAYS
     * recomputes from the catalog at checkout and rejects mismatches —
     * otherwise anyone can book a $500 package for $1.
     */
    unitPriceMinor: priceMinor('unit_price_minor'),

    /**
     * Links a driver add-on to the activity that sold it, so removing the
     * activity cannot leave an orphaned driver charge.
     */
    parentItemId: uuid('parent_item_id'),

    /**
     * Booking choices of an activity line (handoff OrderItem): the add-ons
     * picked and, for a multi-day activity, nothing else — the package is
     * `refId` (kind `activity_tier`), dates/time/people are the columns above,
     * and a driver is its own linked line. Ids and quantities only: the
     * server prices them from `activity_addons`, never from this column.
     */
    options: jsonb('options').$type<BookingOptions>(),

    ...timestamps,
  },
  (t) => [index('cart_items_cart_idx').on(t.cartId)],
)

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-facing reference, e.g. BT-2026-0184. */
    orderNumber: varchar('order_number', { length: 32 }).notNull().unique(),
    userId: uuid('user_id').references(() => users.id),

    /** pending | paid | confirmed | cancelled | refunded | partially_refunded */
    status: varchar('status', { length: 24 }).notNull().default('pending'),

    /** What the buyer saw. */
    presentmentCurrency: currency('presentment_currency'),
    subtotalMinor: priceMinor('subtotal_minor'),
    totalMinor: priceMinor('total_minor'),

    /** What actually settled. May differ; refunds reconcile against it. */
    settlementCurrency: varchar('settlement_currency', { length: 3 }),
    settlementTotalMinor: moneyMinor('settlement_total_minor'),
    exchangeRate: varchar('exchange_rate', { length: 32 }),

    /** Contact details frozen at purchase. */
    customerSnapshot: jsonb('customer_snapshot').$type<{
      name: string
      email: string
      phone?: string
      country?: string
      locale: string
    }>(),

    /**
     * Timestamped proof the cancellation ladder was accepted. This is the
     * compelling evidence that wins "services not rendered" disputes, and
     * the dispute window on future-dated travel runs up to ~540 days.
     */
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    termsVersion: varchar('terms_version', { length: 32 }),

    placedAt: timestamp('placed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('orders_user_idx').on(t.userId), index('orders_status_idx').on(t.status)],
)

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    kind: varchar('kind', { length: 24 }).notNull(),
    refId: uuid('ref_id'),

    /**
     * IMMUTABLE snapshot. The name and price the customer actually bought,
     * so editing or unpublishing a product later cannot rewrite history.
     */
    nameSnapshot: localized('name_snapshot').$type<Localized>().notNull(),
    unitPriceMinor: priceMinor('unit_price_minor'),
    quantity: integer('quantity').notNull(),
    lineTotalMinor: priceMinor('line_total_minor'),

    /** Version of the itinerary bought, pinning its delivered PDF. */
    refVersion: integer('ref_version'),

    travelDate: date('travel_date'),
    travelTime: time('travel_time'),
    guests: integer('guests'),
    vehicleClass: varchar('vehicle_class', { length: 16 }),
    endDate: date('end_date'),

    /** pending | confirmed | delivered | cancelled | refunded */
    fulfilmentStatus: varchar('fulfilment_status', { length: 24 }).notNull().default('pending'),
    refundedMinor: moneyMinor('refunded_minor').notNull().default(0),

    parentItemId: uuid('parent_item_id'),
    /**
     * Frozen booking breakdown: the add-ons bought and the priced lines
     * (package × units, each add-on, included ones at zero) exactly as
     * charged, with their names, so the order page and the provider see
     * what was sold even after the catalogue changes.
     */
    options: jsonb('options').$type<OrderItemOptions>(),
    ...timestamps,
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
)

// ---------------------------------------------------------------------------
// Payments — provider-agnostic by design
// ---------------------------------------------------------------------------

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),

    provider: varchar('provider', { length: 32 }).notNull(),
    /** The provider's id is a column, never the source of truth. */
    providerPaymentId: varchar('provider_payment_id', { length: 128 }),

    /** requires_action | processing | succeeded | failed | cancelled */
    status: varchar('status', { length: 24 }).notNull(),
    amountMinor: priceMinor('amount_minor'),
    currency: currency(),

    /**
     * Payment method (الوثيقة 22.7): 'card' | 'apple_pay' | 'google_pay' |
     * 'bank_transfer' | 'manual' | provider type (e.g. 'link', 'alipay').
     * NULL = not known yet (recorded best-effort after the provider settles).
     */
    method: varchar('method', { length: 32 }),

    /** Guards against double-charge on double-click, enforced by the index. */
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),

    rawPayload: jsonb('raw_payload'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('payments_idempotency_idx').on(t.idempotencyKey),
    index('payments_order_idx').on(t.orderId),
    index('payments_provider_id_idx').on(t.providerPaymentId),
  ],
)

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id),
  orderItemId: uuid('order_item_id').references(() => orderItems.id),
  amountMinor: priceMinor('amount_minor'),
  currency: currency(),
  reason: text('reason'),
  /** Staff member who issued it. Refunds are always attributable. */
  actorId: uuid('actor_id').references(() => users.id),
  providerRefundId: varchar('provider_refund_id', { length: 128 }),
  status: varchar('status', { length: 24 }).notNull().default('pending'),
  ...timestamps,
})

/**
 * Webhook idempotency.
 *
 * Providers routinely deliver the success webhook BEFORE the customer
 * returns to the site, deliver events out of order, and replay them. Order
 * state is driven from here, and the unique index makes replay a no-op.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 32 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 128 }).notNull(),
    eventType: varchar('event_type', { length: 64 }),
    payload: jsonb('payload'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('webhook_event_unique').on(t.provider, t.providerEventId)],
)

// ---------------------------------------------------------------------------
// Entitlements — what actually gates the map
// ---------------------------------------------------------------------------

export const entitlements = pgTable(
  'entitlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** 'basic' (no map) | 'map_access' | 'vip' */
    kind: varchar('kind', { length: 32 }).notNull(),

    grantedByOrderId: uuid('granted_by_order_id').references(() => orders.id),
    /** Set when staff grants manually; audited. */
    grantedByActorId: uuid('granted_by_actor_id').references(() => users.id),

    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * NULL = lifetime, which is what the design's copy describes
     * ("One-time payment — yours for the whole trip"). A non-null value
     * makes the same table support recurring plans with no schema change.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    /** Set on refund. Never hard-delete — the grant is an audit record. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),

    /**
     * عدد الأجهزة المسموح بها لهذه الصلاحية.
     *
     * NULL = القيمة الافتراضية للمنصة (`DEFAULT_DEVICE_LIMIT`). عند وجود عدة
     * صلاحيات فعّالة يُؤخذ الحد الأعلى بينها — من اشترى باقة إضافية لا يجب
     * أن تُقيّده باقته الأصغر.
     */
    deviceLimit: integer('device_limit'),
    /** الباقة التي منحت هذا الصف، إن وُجدت. المدة والحد منسوخان هنا وقت الشراء. */
    planId: uuid('plan_id').references(() => plans.id),
    /** فرد في باقة عائلية: من شاركها معه. صف مُشارك لا يُشارك مجدداً. */
    sharedByUserId: uuid('shared_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    ...timestamps,
  },
  (t) => [index('entitlements_user_kind_idx').on(t.userId, t.kind)],
)

// ---------------------------------------------------------------------------
// Driver fleet and capacity
// ---------------------------------------------------------------------------

export const driverVehicles = pgTable('driver_vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 'sedan' | 'suv' | 'van' */
  vehicleClass: varchar('vehicle_class', { length: 16 }).notNull().unique(),
  label: localized('label').notNull(),
  description: localized('description'),

  minPassengers: integer('min_passengers').notNull(),
  maxPassengers: integer('max_passengers').notNull(),

  /** Rate lives here, not duplicated across three components as literals. */
  dayRateMinor: priceMinor('day_rate_minor'),
  currency: currency(),

  /** How many exist. This is what makes overbooking possible. */
  fleetSize: integer('fleet_size').notNull().default(0),

  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
})

/**
 * Per-date holds against fleetSize.
 *
 * The decrement MUST happen in the same transaction as the order, with row
 * locking — two customers booking the last van for the same date is a race
 * that an application-level "check then insert" loses silently.
 */
export const driverCapacity = pgTable(
  'driver_capacity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleClass: varchar('vehicle_class', { length: 16 }).notNull(),
    /** Plain date, interpreted in Bali time. */
    day: date('day').notNull(),
    /** Committed bookings. Must never exceed the vehicle's fleetSize. */
    bookedCount: integer('booked_count').notNull().default(0),
    /** Admin can close a date without changing fleet size. */
    isBlocked: boolean('is_blocked').notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('driver_capacity_unique').on(t.vehicleClass, t.day)],
)

// ---------------------------------------------------------------------------
// Leads and misc
// ---------------------------------------------------------------------------

export const customTripRequests = pgTable('custom_trip_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  /** The prototype captured NONE of this — there was no lead record at all. */
  name: varchar('name', { length: 128 }),
  email: varchar('email', { length: 256 }),
  phone: varchar('phone', { length: 32 }),

  startDate: date('start_date'),
  endDate: date('end_date'),
  /** عدد أيام الرحلة شاملاً اليومين (الوثيقة 22.4)، محسوب عند الإدراج. */
  days: integer('days'),
  travellers: integer('travellers'),
  theme: varchar('theme', { length: 32 }),
  budgetPerPersonMinor: moneyMinor('budget_per_person_minor'),
  currency: varchar('currency', { length: 3 }),
  interests: jsonb('interests').$type<string[]>(),
  wantsDriver: boolean('wants_driver'),
  hasChildren: boolean('has_children'),
  wantsVipMap: boolean('wants_vip_map'),
  /** الوثيقة 5.2: المناطق المفضلة (مفاتيح `regions.key`). */
  preferredAreas: jsonb('preferred_areas').$type<string[]>(),
  /** الوثيقة 5.2: هل يريد مطاعم فاخرة؟ */
  wantsLuxuryDining: boolean('wants_luxury_dining'),
  /** قائمة المهام (checklist): هل يريد مغامرة؟ */
  wantsAdventure: boolean('wants_adventure'),
  notes: text('notes'),

  /**
   * 'new' | 'under_review' | 'in_progress' | 'waiting_customer' | 'completed' | 'cancelled'
   * (الوثيقة 5.3). الهجرتان 0007 و0008 تنقلان الحالات القديمة.
   */
  status: varchar('status', { length: 24 }).notNull().default('new'),
  /** ملاحظات الفريق الداخلية — لا تُعرض للعميل. */
  adminNotes: text('admin_notes'),

  /**
   * عرض السعر (الوثيقة 13.1 "جدول مخصص"): يحدده الفريق، ويدفعه العميل كبند
   * سلة من نوع `custom`. السعر يُقرأ من هنا على الخادم دائماً.
   */
  quoteMinor: moneyMinor('quote_minor'),
  quoteCurrency: varchar('quote_currency', { length: 3 }),
  quotedAt: timestamp('quoted_at', { withTimezone: true }),
  /** الطلب المدفوع الذي سدّد العرض. NULL = لم يُدفع. */
  paidOrderId: uuid('paid_order_id').references(() => orders.id, { onDelete: 'set null' }),
  ...timestamps,
})

export const contactMessages = pgTable('contact_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 128 }).notNull(),
  email: varchar('email', { length: 256 }).notNull(),
  subject: varchar('subject', { length: 256 }),
  message: text('message').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('new'),
  ...timestamps,
})

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'activity' | 'place' | 'itinerary' | 'package' */
    kind: varchar('kind', { length: 24 }).notNull(),
    refId: uuid('ref_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('favorites_unique').on(t.userId, t.kind, t.refId),
    // "الأكثر حفظاً" في البحث ولوحة التحكم يعدّ حسب العنصر لا المستخدم.
    index('favorites_ref_idx').on(t.kind, t.refId),
  ],
)

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id),
    action: varchar('action', { length: 64 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ipAddress: varchar('ip_address', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_entity_idx').on(t.entityType, t.entityId),
    index('audit_actor_idx').on(t.actorId),
  ],
)

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
  payments: many(payments),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}))

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  items: many(cartItems),
}))

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
}))

export const entitlementsRelations = relations(entitlements, ({ one }) => ({
  user: one(users, { fields: [entitlements.userId], references: [users.id] }),
  order: one(orders, { fields: [entitlements.grantedByOrderId], references: [orders.id] }),
}))

/* --------------------------------------------------------------------------
   الباقة العائلية — الأفراد المدعوون
   -------------------------------------------------------------------------- */

/**
 * فرد في باقة عائلية. صاحب الباقة يدعو بالبريد؛ إن كان للبريد حساب يُمنح فوراً
 * صف `entitlements` بنفس النوع والمدة (و`granted_by_order_id` نفسه، فالاسترداد
 * يسحبه تلقائياً)، وإلا يبقى "مدعواً" ويُفعَّل عند إنشاء الحساب بهذا البريد.
 */
export const planMembers = pgTable(
  'plan_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** صلاحية صاحب الباقة التي يُشارك منها. */
    ownerEntitlementId: uuid('owner_entitlement_id')
      .notNull()
      .references(() => entitlements.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    inviteEmail: varchar('invite_email', { length: 256 }).notNull(),
    memberUserId: uuid('member_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** صف الصلاحية الممنوح للفرد (null حتى يُفعَّل). */
    memberEntitlementId: uuid('member_entitlement_id').references(() => entitlements.id, {
      onDelete: 'set null',
    }),
    /** invited | active | removed */
    status: varchar('status', { length: 16 }).notNull().default('invited'),
    /** sha256 لرمز رابط القبول المرسل بالبريد (null بعد القبول/الإزالة). */
    tokenHash: varchar('token_hash', { length: 64 }),
    ...timestamps,
  },
  (t) => [
    index('plan_members_owner_idx').on(t.ownerEntitlementId),
    index('plan_members_email_idx').on(t.inviteEmail),
    uniqueIndex('plan_members_token_unique').on(t.tokenHash),
  ],
)
