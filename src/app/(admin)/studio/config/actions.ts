'use server'

import { eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { locales } from '@/i18n/config'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fcurrency, fdate, fint, flines, freq, localeFieldName } from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import {
  parseSetting,
  POLICY_IDS,
  SETTING_DEFAULTS,
  type PolicyId,
  type SettingKey,
  type SettingsShape,
} from '../../_lib/settings'

/**
 * Configuration writes.
 *
 * Every one of them goes through `save()`, which does four things in a fixed
 * order and in one transaction: read the current value, parse the candidate
 * against the key's Zod schema, upsert, audit. Parsing BEFORE the write is
 * what stops a typo in a fee field from reaching a customer-facing page —
 * `readSettings()` would fall back to the default and the operator would never
 * find out their edit had been discarded.
 *
 * `config.write` is admin-only. Staff run the day-to-day; the fee schedule
 * and the terms of service are not day-to-day.
 */

const LIST = adminHref('/config')

type Outcome = { ok: string } | { err: string }

/**
 * Upsert one settings row and audit the delta.
 *
 * `onConflictDoUpdate` rather than delete-then-insert: the row is a primary
 * key and two operators saving different sections concurrently must not be
 * able to lose each other's write to a race between the delete and the insert.
 */
async function save<K extends SettingKey>(
  key: K,
  build: () => SettingsShape[K],
  successMessage: string,
): Promise<void> {
  const session = await requireCapability('config.write')
  let outcome: Outcome

  try {
    // Parsed here so a validation failure is reported before anything is
    // written, and reported with the field name the operator typed into.
    const value = parseSetting(key, build())

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ value: siteSettings.value })
        .from(siteSettings)
        .where(eq(siteSettings.key, key))
        .limit(1)

      await tx
        .insert(siteSettings)
        .values({ key, value, updatedByActorId: session.userId })
        .onConflictDoUpdate({
          target: siteSettings.key,
          set: {
            value,
            updatedByActorId: session.userId,
            updatedAt: sql`now()`,
          },
        })

      await writeAudit(
        {
          actor: session,
          action: 'config.update',
          entityType: 'setting',
          // `audit_log.entity_id` is a uuid column and a settings key is not
          // one, so the key travels in the payload instead of being coerced.
          entityId: null,
          // Nested UNDER the key rather than beside it. `diffRecords()` keeps
          // only the top-level keys whose values differ, so a flat
          // `{ key, value }` would have the identical `key` stripped out and
          // leave an audit row that shows a change without saying to what.
          before: { [key]: existing?.value ?? SETTING_DEFAULTS[key] },
          after: { [key]: value },
        },
        tx,
      )
    })

    outcome = { ok: successMessage }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: readableError(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

/**
 * A Zod failure, phrased for a person.
 *
 * `ZodError.message` is a JSON dump of the issue array — accurate, and
 * useless in a one-line banner. `prettifyError` gives the field path and the
 * reason, which is what an operator needs to find the input they got wrong.
 */
function readableError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return `That value was rejected. ${z.prettifyError(error).replace(/\s+/g, ' ').trim()}`
  }
  return errorMessage(error)
}

/**
 * Currencies and presentment.
 *
 * Changing the base currency does NOT re-denominate the catalog — every
 * `price_minor` keeps its own `currency` column. This is presentation policy,
 * and saying so on the form matters more than the validation does.
 */
export async function saveCurrencies(form: FormData): Promise<void> {
  await save(
    'currencies',
    () => {
      const presentmentCurrencies = flines(form, 'presentmentCurrencies').map((line) =>
        line.toUpperCase(),
      )
      const defaultPresentment = fcurrency(form, 'defaultPresentment')

      if (presentmentCurrencies.length === 0) {
        throw new Error('List at least one presentment currency, one per line.')
      }
      if (!presentmentCurrencies.includes(defaultPresentment)) {
        throw new Error(
          `The default presentment currency (${defaultPresentment}) must also appear in the list of presentment currencies.`,
        )
      }

      return {
        baseCurrency: fcurrency(form, 'baseCurrency'),
        presentmentCurrencies,
        defaultPresentment,
      }
    },
    'Currency settings saved.',
  )
}

/** Fees. Basis points and integer minor units — never a percentage float. */
export async function saveFees(form: FormData): Promise<void> {
  await save(
    'fees',
    () => ({
      serviceFeeBps: fint(form, 'serviceFeeBps', 0, 'Service fee'),
      bookingFeeMinor: fint(form, 'bookingFeeMinor', 0, 'Booking fee'),
      paymentSurchargeBps: fint(form, 'paymentSurchargeBps', 0, 'Payment surcharge'),
      feeCurrency: fcurrency(form, 'feeCurrency'),
    }),
    'Fee schedule saved.',
  )
}

/** WhatsApp and support contact details. */
export async function saveContact(form: FormData): Promise<void> {
  await save(
    'contact',
    () => ({
      // Punctuation is stripped rather than rejected: an operator pasting
      // "+62 812 3456 7890" out of a phone is the normal case, and refusing it
      // teaches them to distrust the field.
      whatsappNumber: freq(form, 'whatsappNumber', 'WhatsApp number').replace(/[^0-9]/g, ''),
      whatsappDisplay: freq(form, 'whatsappDisplay', 'Displayed number'),
      supportEmail: freq(form, 'supportEmail', 'Support e-mail'),
    }),
    'Contact details saved.',
  )
}

/**
 * One policy body.
 *
 * The effective date is authored, never derived from `updated_at`: a date
 * that moved whenever someone opened the form would silently rewrite the
 * terms a customer already accepted, and `orders.terms_version` pins exactly
 * this string.
 */
export async function savePolicy(id: string, form: FormData): Promise<void> {
  const policyId = POLICY_IDS.find((candidate) => candidate === id)
  if (!policyId) {
    // Never reachable from the rendered form; a hand-built POST lands here.
    await requireCapability('config.write')
    redirect(withOutcome(LIST, { err: `"${id}" is not a policy page.` }))
  }

  await save(
    `policy.${policyId satisfies PolicyId}`,
    () => {
      const updated = fdate(form, 'updated', 'Effective date')
      if (!updated) throw new Error('Effective date is required (YYYY-MM-DD).')

      const body = {} as Record<(typeof locales)[number], string>
      for (const locale of locales) {
        const value = form.get(localeFieldName('body', locale))
        body[locale] = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
      }

      if (body.en === '') {
        throw new Error(
          'The English body is required — it is the authoring locale, and the other two fall back to it.',
        )
      }

      return { updated, body }
    },
    'Policy saved.',
  )
}
