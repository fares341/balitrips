import { sql } from 'drizzle-orm'
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

import { moneyMinor, timestamps } from './_shared'
import { users } from './auth'
import { orders } from './commerce'

/**
 * Phase 4 (migration 0020): discount codes and invoice numbers.
 *
 * Nothing here is seeded. With no coupon rows and the fee/tax settings left
 * off (the default), checkout charges exactly what it charged before 0020.
 */

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export const COUPON_TYPES = ['percent', 'fixed'] as const
export type CouponType = (typeof COUPON_TYPES)[number]

export const COUPON_SCOPES = ['all', 'kinds', 'items'] as const
export type CouponScope = (typeof COUPON_SCOPES)[number]

export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** As typed by the owner. Matched case-insensitively (unique on lower(code)). */
    code: varchar('code', { length: 40 }).notNull(),
    /** percent | fixed */
    type: varchar('type', { length: 8 }).notNull(),
    /** percent: basis points (1000 = 10%). fixed: minor units of `currency`. */
    value: moneyMinor('value').notNull(),
    /** Required for `fixed` and for a minimum order amount. Null = any currency (percent only). */
    currency: varchar('currency', { length: 3 }),
    /** Smallest cart subtotal (minor units of `currency`) the code works on. */
    minSubtotalMinor: moneyMinor('min_subtotal_minor'),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    /** Paid uses in total. Null = unlimited. */
    maxUses: integer('max_uses'),
    /** Paid uses per customer (account or e-mail). Null = unlimited. */
    maxUsesPerCustomer: integer('max_uses_per_customer'),
    /** all | kinds | items */
    appliesTo: varchar('applies_to', { length: 8 }).notNull().default('all'),
    /** appliesTo = kinds: activity | itinerary | package | plan | driver | custom */
    appliesKinds: jsonb('applies_kinds').$type<string[]>(),
    /** appliesTo = items: ids of activities / itineraries / packages / plans. */
    appliesItems: jsonb('applies_items').$type<string[]>(),
    active: boolean('active').notNull().default(true),
    /** For the team only. Never shown to customers. */
    internalNote: text('internal_note'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [uniqueIndex('coupons_code_lower_unique').on(sql`lower(${t.code})`)],
)

/**
 * One row per PAID order that used a coupon. Written in the transaction that
 * marks the order paid; the unique index on `order_id` makes a replayed
 * webhook, the reconcile sweep and an offline "mark paid" all count it once.
 */
export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Lower-cased buyer e-mail, so a guest's uses count per customer too. */
    email: varchar('email', { length: 256 }),
    discountMinor: moneyMinor('discount_minor').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('coupon_redemptions_order_unique').on(t.orderId),
    index('coupon_redemptions_coupon_idx').on(t.couponId),
  ],
)

// ---------------------------------------------------------------------------
// Invoice numbers
// ---------------------------------------------------------------------------

/**
 * One row per calendar year (Bali time). The number is taken with
 * `INSERT … ON CONFLICT (year) DO UPDATE SET last_number = last_number + 1`
 * inside the transaction that marks the order paid: the row stays locked until
 * that transaction ends, so two payments can never get the same number, and a
 * rolled-back payment rolls its number back too — no gaps.
 */
export const invoiceCounters = pgTable('invoice_counters', {
  year: integer('year').primaryKey(),
  lastNumber: integer('last_number').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
