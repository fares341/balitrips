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
import { users } from './auth'
import { carts } from './commerce'
import { coupons } from './finance'

/**
 * Lead capture (migration 0047): people who gave us a name and a way to reach
 * them BY THEIR OWN CHOICE — the «first booking» offer, Google sign-in, the
 * checkout form — plus the one abandoned-cart reminder each cart may get.
 *
 * Consent is stored per channel with the instant it was given and the exact
 * wording shown (`consent_text`), so it can be proven later. No consent = the
 * row is kept for the team (the visitor asked for a code) but nothing
 * promotional is ever sent to it.
 */

export const LEAD_SOURCES = ['popup', 'google', 'checkout', 'abandoned'] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const leadContacts = pgTable(
  'lead_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 128 }),
    /** E.164 with «+», or null. */
    phone: varchar('phone', { length: 20 }),
    /** Lower-cased, or null. */
    email: varchar('email', { length: 256 }),
    /** Where we first got this person. */
    source: varchar('source', { length: 16 }).notNull(),
    locale: varchar('locale', { length: 5 }).notNull().default('ar'),
    country: varchar('country', { length: 2 }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** The anonymous cart cookie at the time (for the cart reminder). */
    cartToken: varchar('cart_token', { length: 64 }),
    whatsappConsent: boolean('whatsapp_consent').notNull().default(false),
    whatsappConsentAt: timestamp('whatsapp_consent_at', { withTimezone: true }),
    emailConsent: boolean('email_consent').notNull().default(false),
    emailConsentAt: timestamp('email_consent_at', { withTimezone: true }),
    /** The consent sentence the visitor ticked, as shown. */
    consentText: text('consent_text'),
    couponId: uuid('coupon_id').references(() => coupons.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('lead_contacts_phone_unique').on(t.phone),
    uniqueIndex('lead_contacts_email_unique').on(t.email),
    index('lead_contacts_created_idx').on(t.createdAt),
    index('lead_contacts_user_idx').on(t.userId),
    index('lead_contacts_cart_token_idx').on(t.cartToken),
  ],
)

/** One row per cart that got its reminder — the primary key is the «max one». */
export const cartReminders = pgTable('cart_reminders', {
  cartId: uuid('cart_id')
    .primaryKey()
    .references(() => carts.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leadContacts.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  /** whatsapp | email | both | none */
  channel: varchar('channel', { length: 12 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
