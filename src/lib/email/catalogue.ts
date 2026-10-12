/**
 * Localization for anything rendered outside a request — the message
 * catalogue and the two date formatters that mail and PDFs both need.
 *
 * Mail and PDFs are produced by the worker, where there is no request, no
 * `NextIntlClientProvider` and therefore no ambient locale. The recipient's
 * own `users.locale` (or the locale frozen into `orders.customer_snapshot`)
 * decides the language — never the locale of whoever triggered the send. A
 * reset requested from a friend's laptop still has to arrive in the account
 * owner's language, and a refund notice has to match the language the
 * customer bought in.
 *
 * The three catalogues are imported statically so a missing key is a build
 * error rather than a runtime one, and so the worker needs no filesystem
 * access at runtime.
 */

import { createTranslator } from 'next-intl'

import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { BALI_TIME_ZONE } from '@/lib/booking-rules'

import ar from '../../../messages/ar.json'
import en from '../../../messages/en.json'
import id from '../../../messages/id.json'

export type Catalogue = typeof en

export const CATALOGUE: Record<Locale, Catalogue> = { en, ar, id }

export type Translator = ReturnType<typeof createTranslator<Catalogue>>

export function translator(locale: Locale): Translator {
  return createTranslator({ locale, messages: CATALOGUE[locale] })
}

/**
 * Resolve an arbitrary stored value to a locale we have messages for.
 *
 * `users.locale` is a `varchar(5)` and `customer_snapshot.locale` is free-form
 * JSON, so both can hold anything a bad migration or an old client left
 * behind. Falling back to English beats rendering "undefined".
 */
export function toMailLocale(value: unknown): Locale {
  return typeof value === 'string' && isLocale(value) ? value : defaultLocale
}

/* --------------------------------------------------------------------------
   Dates
   -------------------------------------------------------------------------- */

/**
 * A plain `YYYY-MM-DD` travel date.
 *
 * Formatted in UTC on purpose. The value is a calendar date with no time and
 * no zone; parsing it and formatting it in the server's zone is how "12
 * August" becomes "11 August" for a document rendered on a machine west of
 * Greenwich. The customer may be in Riyadh, the server in Singapore and the
 * trip in Bali — the printed date has to be the one that was booked.
 */
export function formatPlainDate(value: string, locale: Locale): string {
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(parsed)
}

/** An instant — order placed, refund issued — shown in Bali time. */
export function formatInstant(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: BALI_TIME_ZONE,
  }).format(value)
}
