import {
  boolean,
  date,
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

import { moneyMinor, softDelete, timestamps } from './_shared'
import { users } from './auth'
import { activities, activityTiers } from './content'

/**
 * Phase 2 (migration 0018): suppliers, their offers, capacity per date,
 * seasonal prices and what we owe each supplier.
 *
 * Nothing here is seeded: every row is real data the owner enters in the
 * Studio. With no rows, booking behaves exactly as before 0018 (unlimited
 * places, the package price, staff confirm each booking by hand).
 */

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

/** The companies and people who actually run what we sell. */
export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    /** activity_company | transport | driver | other (`@/lib/suppliers/types`). */
    type: varchar('type', { length: 24 }).notNull().default('activity_company'),
    contactPerson: varchar('contact_person', { length: 160 }),
    phone: varchar('phone', { length: 48 }),
    whatsapp: varchar('whatsapp', { length: 48 }),
    email: varchar('email', { length: 256 }),
    address: text('address'),
    contractNotes: text('contract_notes'),
    /** Default commission, basis points (1500 = 15%). Null = not agreed / not used. */
    commissionBps: integer('commission_bps'),
    paymentTerms: text('payment_terms'),
    /** Their cancellation and booking rules, as agreed. */
    policy: text('policy'),
    /** active | paused. A paused supplier is never assigned automatically. */
    status: varchar('status', { length: 16 }).notNull().default('active'),
    internalNotes: text('internal_notes'),
    /** Internal quality score 1–5. Null = not rated yet. Never shown to customers. */
    rating: integer('rating'),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index('suppliers_status_idx').on(t.status)],
)

/**
 * One supplier's offer for an activity (optionally for one package of it).
 *
 * The customer always books the package at the website's price; offers
 * decide who runs it, what it costs us, and whether the booking can be
 * confirmed at once or must wait for the supplier.
 */
export const activitySupplierOffers = pgTable(
  'activity_supplier_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    /** Null = every package of the activity. */
    tierId: uuid('tier_id').references(() => activityTiers.id, { onDelete: 'cascade' }),
    /** What we pay the supplier, per person (per unit for group/couple packages). */
    costMinor: moneyMinor('cost_minor').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    /**
     * The supplier's own suggested selling price — for the owner's reference
     * and the margin view. The customer is still charged the package price.
     */
    sellPriceMinor: moneyMinor('sell_price_minor'),
    /** Departures this supplier runs. Null/empty = every departure of the activity. */
    timeSlots: jsonb('time_slots').$type<string[]>(),
    terms: text('terms'),
    /** instant | needs_supplier_confirmation */
    confirmationMode: varchar('confirmation_mode', { length: 32 })
      .notNull()
      .default('needs_supplier_confirmation'),
    /** "The supplier confirms within N hours", told to the customer before paying. */
    confirmWithinHours: integer('confirm_within_hours').notNull().default(24),
    /** Notice the supplier needs before the departure. Null = the activity's own. */
    leadTimeHours: integer('lead_time_hours'),
    active: boolean('active').notNull().default(true),
    /** Higher wins when several offers fit a booking. */
    priority: integer('priority').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('supplier_offers_activity_idx').on(t.activityId),
    index('supplier_offers_supplier_idx').on(t.supplierId),
  ],
)

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * Places per activity, date and departure.
 *
 * `slot` is the departure time (`HH:mm`), or '' for the whole day: a day row
 * carries a closure / capacity override for every departure of that date,
 * and the booked count of an activity without departures. `booked` only
 * moves through the conditional UPDATE in `@/lib/availability/activity`.
 */
export const activityAvailability = pgTable(
  'activity_availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    slot: varchar('slot', { length: 5 }).notNull().default(''),
    /** Override of `activities.capacity_per_slot` for this date. Null = the default. */
    capacity: integer('capacity'),
    booked: integer('booked').notNull().default(0),
    isClosed: boolean('is_closed').notNull().default(false),
    note: text('note'),
    ...timestamps,
  },
  (t) => [uniqueIndex('activity_availability_unique').on(t.activityId, t.day, t.slot)],
)

// ---------------------------------------------------------------------------
// Seasonal prices
// ---------------------------------------------------------------------------

/** A package price for a date range (high season, holidays, weekends…). */
export const tierSeasonalPrices = pgTable(
  'tier_seasonal_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tierId: uuid('tier_id')
      .notNull()
      .references(() => activityTiers.id, { onDelete: 'cascade' }),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    priceMinor: moneyMinor('price_minor').notNull(),
    /** Child price in this season. Null = the package's own child price. */
    childPriceMinor: moneyMinor('child_price_minor'),
    /** Weekdays it applies on (0 = Sunday). Null/empty = every day of the range. */
    weekdays: jsonb('weekdays').$type<number[]>(),
    label: varchar('label', { length: 80 }),
    ...timestamps,
  },
  (t) => [index('tier_seasonal_tier_idx').on(t.tierId, t.fromDate)],
)

// ---------------------------------------------------------------------------
// What we owe suppliers
// ---------------------------------------------------------------------------

/** A payment run to one supplier, built from their booked order lines. */
export const supplierSettlements = pgTable(
  'supplier_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    periodFrom: date('period_from').notNull(),
    periodTo: date('period_to').notNull(),
    totalMinor: moneyMinor('total_minor').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    /** draft | sent | paid */
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    reference: varchar('reference', { length: 128 }),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('supplier_settlements_supplier_idx').on(t.supplierId)],
)
