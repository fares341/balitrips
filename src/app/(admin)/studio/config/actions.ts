'use server'

import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { locales } from '@/i18n/config'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import type { Translate } from '../../_i18n'
import { SATELLITE_PROVIDERS } from '@/app/[locale]/map/map-style'

import {
  fbool,
  fcurrency,
  fdate,
  fenum,
  ffloat,
  fint,
  flines,
  flocalized,
  freq,
  fstr,
  localeFieldName,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
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
  build: (t: Translate) => SettingsShape[K],
  successKey: string,
  /** Where the form lives (the banner shows there). */
  back: string = LIST,
): Promise<void> {
  const session = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    // Parsed here so a validation failure is reported before anything is
    // written, and reported with the field name the operator typed into.
    const value = parseSetting(key, build(t))

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

    outcome = { ok: t(successKey) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: readableError(t, error) }
  }

  redirect(withOutcome(back, outcome))
}

/**
 * A Zod failure, phrased for a person.
 *
 * `ZodError.message` is a JSON dump of the issue array — accurate, and
 * useless in a one-line banner. `prettifyError` gives the field path and the
 * reason, which is what an operator needs to find the input they got wrong.
 */
function readableError(t: Translate, error: unknown): string {
  if (error instanceof z.ZodError) {
    return t('config.err_rejected', {
      detail: z.prettifyError(error).replace(/\s+/g, ' ').trim(),
    })
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
    (t) => {
      const presentmentCurrencies = flines(form, 'presentmentCurrencies').map((line) =>
        line.toUpperCase(),
      )
      const defaultPresentment = fcurrency(form, 'defaultPresentment')

      if (presentmentCurrencies.length === 0) {
        throw new Error(t('config.err_no_presentment'))
      }
      if (!presentmentCurrencies.includes(defaultPresentment)) {
        throw new Error(t('config.err_default_not_listed', { currency: defaultPresentment }))
      }

      return {
        baseCurrency: fcurrency(form, 'baseCurrency'),
        presentmentCurrencies,
        defaultPresentment,
      }
    },
    'config.ok_currencies',
  )
}

/** Fees. Basis points and integer minor units — never a percentage float. */
export async function saveFees(form: FormData): Promise<void> {
  await save(
    'fees',
    (t) => ({
      serviceFeeBps: fint(form, 'serviceFeeBps', 0, t('config.label_service_fee')),
      bookingFeeMinor: fint(form, 'bookingFeeMinor', 0, t('config.label_booking_fee')),
      paymentSurchargeBps: fint(form, 'paymentSurchargeBps', 0, t('config.label_surcharge')),
      feeCurrency: fcurrency(form, 'feeCurrency'),
    }),
    'config.ok_fees',
  )
}

/** WhatsApp and support contact details. */
export async function saveContact(form: FormData): Promise<void> {
  await save(
    'contact',
    (t) => ({
      // Punctuation is stripped rather than rejected: an operator pasting
      // "+62 812 3456 7890" out of a phone is the normal case, and refusing it
      // teaches them to distrust the field.
      whatsappNumber: freq(form, 'whatsappNumber', t('config.whatsapp_number')).replace(
        /[^0-9]/g,
        '',
      ),
      whatsappDisplay: freq(form, 'whatsappDisplay', t('config.displayed_number')),
      supportEmail: freq(form, 'supportEmail', t('config.support_email')),
    }),
    'config.ok_contact',
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
    const { t } = await getAdminI18n()
    redirect(withOutcome(LIST, { err: t('config.err_not_policy', { id }) }))
  }

  await save(
    `policy.${policyId satisfies PolicyId}`,
    (t) => {
      const updated = fdate(form, 'updated', t('config.effective_date'))
      if (!updated) throw new Error(t('config.err_effective_required'))

      const body = {} as Record<(typeof locales)[number], string>
      for (const locale of locales) {
        const value = form.get(localeFieldName('body', locale))
        body[locale] = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
      }

      if (body.en === '') {
        throw new Error(t('config.err_en_body_required'))
      }

      return { updated, body }
    },
    'config.ok_policy',
  )
}

/**
 * The public map's real (3D) view — edited from Studio → Map, saved through
 * the same validated, audited path as every other setting.
 */
export async function saveMapSettings(form: FormData): Promise<void> {
  // Before `save()`, which ends in a redirect. Harmless if validation fails.
  revalidatePath('/[locale]/map', 'page')
  await save(
    'map',
    (t) => ({
      // Off unless a key is entered AND the licence box is ticked (see
      // `mapViewSettings`); the keys are public, domain-restricted tokens.
      satellite: fenum(form, 'satellite', SATELLITE_PROVIDERS, 'none'),
      esriKey: fstr(form, 'esriKey') ?? '',
      mapboxToken: fstr(form, 'mapboxToken') ?? '',
      licenceConfirmed: fbool(form, 'licenceConfirmed'),
      exaggeration: ffloat(form, 'exaggeration', t('map.exaggeration')),
      tiltOnEnter: fint(form, 'tiltOnEnter', 50, t('map.tilt')),
    }),
    'map.ok_saved',
    adminHref('/map'),
  )
}

/**
 * The AI assistants (Studio → Assistant → Settings). Admin only, like every
 * setting; the OpenRouter key is NOT a setting (it stays in the environment).
 */
export async function saveAssistantSettings(form: FormData): Promise<void> {
  await save(
    'assistant',
    (t) => ({
      publicEnabled: fbool(form, 'publicEnabled'),
      studioEnabled: fbool(form, 'studioEnabled'),
      model: fstr(form, 'model') ?? '',
      fallbackModel: fstr(form, 'fallbackModel') ?? '',
      dailyMessagesPerIp: fint(form, 'dailyMessagesPerIp', 40, t('assistant.daily_ip')),
      dailyBudgetUsd: ffloat(form, 'dailyBudgetUsd', t('assistant.daily_budget')),
      welcome: flocalized(form, 'welcome'),
    }),
    'assistant.ok_saved',
    adminHref('/assistant/settings'),
  )
}
