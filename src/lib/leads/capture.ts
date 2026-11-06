/**
 * Lead capture — writing contacts, the first-booking code, and the hooks the
 * checkout and Google sign-in call. Every public function here that a
 * customer flow calls never throws: a lead problem must not fail a checkout
 * or a sign-in.
 */

import { randomBytes } from 'node:crypto'

import { eq, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { coupons, leadContacts, users } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { isPlaceholderEmail } from '@/lib/auth/phone'

import { couponCodeFrom, type ReminderContact } from './rules'
import type { LeadSettings } from './settings'

export type LeadRow = typeof leadContacts.$inferSelect

export interface LeadInput {
  name?: string | null
  phone?: string | null
  email?: string | null
  source: 'popup' | 'google' | 'checkout' | 'abandoned'
  locale: Locale
  country?: string | null
  userId?: string | null
  cartToken?: string | null
  /** A tick given NOW (absence never withdraws an earlier one). */
  whatsappConsent?: boolean
  emailConsent?: boolean
  consentText?: string | null
}

function cleanEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? ''
  if (!value.includes('@') || value.length > 256 || isPlaceholderEmail(value)) return null
  return value
}

function cleanPhone(raw: string | null | undefined): string | null {
  const value = (raw ?? '').replace(/[^\d+]/g, '')
  return /^\+\d{8,15}$/.test(value) ? value : null
}

function cleanName(raw: string | null | undefined): string | null {
  const value = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 128)
  return value === '' ? null : value
}

/**
 * Create or update the person behind a phone / e-mail. Consent only ever goes
 * from false to true here, stamped with the moment and the wording.
 */
export async function upsertLead(
  input: LeadInput,
  now: Date = new Date(),
): Promise<LeadRow | null> {
  const phone = cleanPhone(input.phone)
  const email = cleanEmail(input.email)
  if (phone === null && email === null) return null
  const name = cleanName(input.name)

  const matches = await db
    .select()
    .from(leadContacts)
    .where(
      or(
        phone ? eq(leadContacts.phone, phone) : undefined,
        email ? eq(leadContacts.email, email) : undefined,
      ),
    )
    .limit(2)
  const existing = matches.find((row) => phone !== null && row.phone === phone) ?? matches[0]

  const consent = {
    ...(input.whatsappConsent ? { whatsappConsent: true, whatsappConsentAt: now } : {}),
    ...(input.emailConsent ? { emailConsent: true, emailConsentAt: now } : {}),
    ...((input.whatsappConsent || input.emailConsent) && input.consentText
      ? { consentText: input.consentText.slice(0, 1000) }
      : {}),
  }

  if (existing) {
    const otherHasEmail = matches.some((row) => row.id !== existing.id && row.email === email)
    const otherHasPhone = matches.some((row) => row.id !== existing.id && row.phone === phone)
    const [row] = await db
      .update(leadContacts)
      .set({
        name: existing.name ?? name,
        phone: existing.phone ?? (otherHasPhone ? null : phone),
        email: existing.email ?? (otherHasEmail ? null : email),
        userId: existing.userId ?? input.userId ?? null,
        cartToken: input.cartToken ?? existing.cartToken,
        country: existing.country ?? input.country ?? null,
        locale: input.locale,
        ...consent,
        updatedAt: now,
      })
      .where(eq(leadContacts.id, existing.id))
      .returning()
    return row ?? existing
  }

  const [row] = await db
    .insert(leadContacts)
    .values({
      name,
      phone,
      email,
      source: input.source,
      locale: input.locale,
      country: input.country ?? null,
      userId: input.userId ?? null,
      cartToken: input.cartToken ?? null,
      ...consent,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning()
  if (row) return row
  // Lost a race with a twin request: the other one wrote it.
  const [again] = await db
    .select()
    .from(leadContacts)
    .where(
      or(
        phone ? eq(leadContacts.phone, phone) : undefined,
        email ? eq(leadContacts.email, email) : undefined,
      ),
    )
    .limit(1)
  return again ?? null
}

/**
 * The person's single-use «first booking» code. One per contact: asking
 * again returns the same code instead of minting another.
 */
export async function ensureLeadCoupon(
  lead: LeadRow,
  settings: LeadSettings,
  now: Date = new Date(),
): Promise<{ code: string; validTo: Date | null } | null> {
  if (lead.couponId) {
    const [current] = await db
      .select({ code: coupons.code, validTo: coupons.validTo })
      .from(coupons)
      .where(eq(coupons.id, lead.couponId))
      .limit(1)
    if (current) return current
  }
  const validTo = new Date(now.getTime() + settings.couponValidDays * 24 * 60 * 60 * 1000)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = couponCodeFrom(randomBytes(6))
    const [created] = await db
      .insert(coupons)
      .values({
        code,
        type: 'percent',
        value: settings.discountPercent * 100,
        validFrom: now,
        validTo,
        maxUses: 1,
        maxUsesPerCustomer: 1,
        appliesTo: 'all',
        active: true,
        internalNote: `Lead offer (first booking) — lead ${lead.id}`,
      })
      .onConflictDoNothing()
      .returning({ id: coupons.id, code: coupons.code, validTo: coupons.validTo })
    if (created) {
      await db
        .update(leadContacts)
        .set({ couponId: created.id, updatedAt: now })
        .where(eq(leadContacts.id, lead.id))
      return { code: created.code, validTo: created.validTo }
    }
  }
  return null
}

/** Checkout: the buyer's details and the offers tick, as a lead. Never throws. */
export async function recordCheckoutLead(input: {
  name: string
  email: string
  phone: string
  locale: Locale
  userId: string | null
  marketingConsent: boolean
  consentText: string
}): Promise<void> {
  try {
    await upsertLead({
      source: 'checkout',
      name: input.name,
      email: input.email,
      phone: input.phone,
      locale: input.locale,
      userId: input.userId,
      whatsappConsent: input.marketingConsent,
      emailConsent: input.marketingConsent,
      consentText: input.marketingConsent ? input.consentText : null,
    })
  } catch (error) {
    console.error('[leads] checkout lead failed', { error })
  }
}

/** Google sign-in: name + e-mail, no consent (none was asked). Never throws. */
export async function recordGoogleLead(userId: string): Promise<void> {
  try {
    const [user] = await db
      .select({
        name: users.name,
        email: users.email,
        locale: users.locale,
        country: users.country,
        consent: users.marketingConsent,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user) return
    await upsertLead({
      source: 'google',
      name: user.name,
      email: user.email,
      locale: user.locale === 'en' || user.locale === 'id' ? user.locale : 'ar',
      country: user.country,
      userId,
    })
  } catch (error) {
    console.error('[leads] google lead failed', { error })
  }
}

export function reminderContactOf(
  lead: Pick<LeadRow, 'phone' | 'email' | 'whatsappConsent' | 'emailConsent'>,
): ReminderContact {
  return {
    phone: lead.phone,
    email: lead.email,
    whatsappConsent: lead.whatsappConsent,
    emailConsent: lead.emailConsent,
  }
}

/** Studio: orders linked to a lead (same account, e-mail or phone). */
export const leadOrdersSql = sql<number>`(select count(*) from orders o where o.status not in ('pending','cancelled')
  and ((${leadContacts.userId} is not null and o.user_id = ${leadContacts.userId})
    or (${leadContacts.email} is not null and lower(o.customer_snapshot->>'email') = ${leadContacts.email})
    or (${leadContacts.phone} is not null and o.customer_snapshot->>'phone' = ${leadContacts.phone})))::int`
