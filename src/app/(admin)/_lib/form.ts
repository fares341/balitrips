import type { Localized } from '@/db/schema'
import { locales, type Locale } from '@/i18n/config'
import {
  parseMoneyInput,
  parsePercentInput,
  parseScaled,
  type AmountResult,
} from '@/lib/money-input'

/**
 * FormData readers.
 *
 * Plain HTML forms post strings; everything below turns them into the exact
 * types the schema wants and rejects the ones it cannot. Money is the place
 * this matters most: prices are typed as people write them ("125.00", "125,5",
 * Arabic digits) and converted with exact string arithmetic to integer minor
 * units in the currency's own decimals (`fmoney`) — never through a float.
 */

export class FormError extends Error {
  /**
   * With a dictionary key the banner is rendered in the operator's Studio
   * language (see `errorMessage()` in result.ts); `message` stays English for
   * logs. Without one, `message` is shown as is — pass text already run
   * through `t()`.
   */
  readonly key?: string
  readonly vars?: Record<string, string | number>

  constructor(message: string, key?: string, vars?: Record<string, string | number>) {
    super(message)
    this.name = 'FormError'
    this.key = key
    this.vars = vars
  }
}

/** A validation failure with an English message and its dictionary key. */
function invalid(english: string, key: string, vars: Record<string, string | number>): FormError {
  return new FormError(english, key, vars)
}

function raw(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

/** Optional text. An empty input is null, not `''`. */
export function fstr(form: FormData, name: string): string | null {
  const value = raw(form, name)
  return value === '' ? null : value
}

/** Required text. */
export function freq(form: FormData, name: string, label = name): string {
  const value = raw(form, name)
  if (value === '') throw invalid(`${label} is required`, 'form.required', { label })
  return value
}

export function fbool(form: FormData, name: string): boolean {
  const value = form.get(name)
  return value === 'on' || value === 'true' || value === '1'
}

/** Integer, with a fallback for a blank input. */
export function fint(form: FormData, name: string, fallback: number, label = name): number {
  const value = raw(form, name)
  if (value === '') return fallback
  if (!/^-?\d+$/.test(value)) {
    throw invalid(`${label} must be a whole number, got "${value}"`, 'form.not_integer', {
      label,
      value,
    })
  }
  return Number.parseInt(value, 10)
}

function amountError(result: AmountResult, label: string, value: string): FormError | null {
  if (result.ok) return null
  if (result.error === 'negative') {
    return invalid(`${label} cannot be negative`, 'form.negative', { label })
  }
  if (result.error === 'too_large') {
    return invalid(`${label} is too large`, 'form.too_large', { label })
  }
  return invalid(`${label} must be an amount like 125.00, got "${value}"`, 'form.not_amount', {
    label,
    value,
  })
}

/**
 * A price typed as people write it ("125.00", "125,5", Arabic digits) in
 * `currency` → integer minor units, using that currency's decimals. A blank
 * input is `fallback`.
 */
export function fmoney(
  form: FormData,
  name: string,
  currency: string,
  label = name,
  fallback = 0,
): number {
  const value = raw(form, name)
  if (value === '') return fallback
  const result = parseMoneyInput(value, currency)
  const error = amountError(result, label, value)
  if (error || !result.ok) throw error ?? invalid(label, 'form.unexpected', {})
  return result.value
}

/** Like `fmoney`, but a blank input is null. */
export function fmoneyOrNull(
  form: FormData,
  name: string,
  currency: string,
  label = name,
): number | null {
  return raw(form, name) === '' ? null : fmoney(form, name, currency, label)
}

/** The currency typed next to an amount, for reading the amount; USD when not a code. */
export function fcurrencyOr(form: FormData, name: string, fallback = 'USD'): string {
  const value = raw(form, name).toUpperCase()
  return /^[A-Z]{3}$/.test(value) ? value : fallback
}

/** A percentage typed as "2.5" → basis points (250). Blank is `fallback`. */
export function fpercent(form: FormData, name: string, fallback: number, label = name): number {
  const value = raw(form, name)
  if (value === '') return fallback
  const result = parsePercentInput(value)
  const error = amountError(result, label, value)
  if (error || !result.ok) throw error ?? invalid(label, 'form.unexpected', {})
  return result.value
}

/** A plain decimal number typed by a person ("5.50", "5,5", Arabic digits), to 2 decimals. */
export function fdecimal(form: FormData, name: string, label = name): number {
  const value = raw(form, name)
  if (value === '') throw invalid(`${label} is required`, 'form.required', { label })
  const result = parseScaled(value, 2)
  const error = amountError(result, label, value)
  if (error || !result.ok) throw error ?? invalid(label, 'form.unexpected', {})
  return result.value / 100
}

export function fintOrNull(form: FormData, name: string, label = name): number | null {
  const value = raw(form, name)
  if (value === '') return null
  if (!/^-?\d+$/.test(value)) {
    throw invalid(`${label} must be a whole number, got "${value}"`, 'form.not_integer', {
      label,
      value,
    })
  }
  return Number.parseInt(value, 10)
}

export function ffloat(form: FormData, name: string, label = name): number {
  const value = raw(form, name)
  if (value === '') throw invalid(`${label} is required`, 'form.required', { label })
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    throw invalid(`${label} must be a number, got "${value}"`, 'form.not_number', { label, value })
  return parsed
}

/** ISO 4217, uppercased. Length is validated because the column is char(3). */
export function fcurrency(form: FormData, name: string): string {
  const value = raw(form, name).toUpperCase()
  if (!/^[A-Z]{3}$/.test(value)) {
    throw invalid(`Currency must be a 3-letter ISO 4217 code, got "${value}"`, 'form.currency', {
      value,
    })
  }
  return value
}

/** One value per line, blanks dropped. Used for tags, amenities, time slots. */
export function flines(form: FormData, name: string): string[] {
  const value = form.get(name)
  if (typeof value !== 'string') return []
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** Every checked value of a repeated checkbox group. */
export function fmulti(form: FormData, name: string): string[] {
  return form
    .getAll(name)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value !== '')
}

/**
 * A foreign key from a select box. Validated as a UUID rather than trusted:
 * the value reaches the database, and a bad one should fail here with a
 * readable message rather than as a driver error.
 */
export function fuuidOrNull(form: FormData, name: string, label = name): string | null {
  const value = raw(form, name)
  if (value === '') return null
  if (!isUuid(value)) throw invalid(`${label} is not a valid id`, 'form.invalid_id', { label })
  return value
}

export function fuuid(form: FormData, name: string, label = name): string {
  const value = fuuidOrNull(form, name, label)
  if (!value) throw invalid(`${label} is required`, 'form.required', { label })
  return value
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/** One of a fixed set. Anything else is rejected, never coerced. */
export function fenum<T extends string>(
  form: FormData,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = raw(form, name)
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function fdate(form: FormData, name: string, label = name): string | null {
  const value = raw(form, name)
  if (value === '') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid(`${label} must be a date (YYYY-MM-DD), got "${value}"`, 'form.invalid_date', {
      label,
      value,
    })
  }
  return value
}

// ---------------------------------------------------------------------------
// Localized fields
// ---------------------------------------------------------------------------

/** Field name for one locale of a localized input: `name_en`, `name_ar`… */
export function localeFieldName(name: string, locale: Locale): string {
  return `${name}_${locale}`
}

/**
 * Read all three locales of one field.
 *
 * Always returns every configured locale, with `''` for the ones a
 * translator has not filled in yet. `pick()` treats whitespace-only as
 * missing and falls back, so a blank Arabic value degrades to English
 * rather than rendering the string "undefined" the way the handoff did.
 */
export function flocalized(form: FormData, name: string): Localized {
  const out = {} as Record<Locale, string>
  for (const locale of locales) out[locale] = raw(form, localeFieldName(name, locale))
  return out
}

/** Same, but null when every locale is blank — for genuinely optional copy. */
export function flocalizedOrNull(form: FormData, name: string): Localized | null {
  const value = flocalized(form, name)
  return locales.some((locale) => value[locale] !== '') ? value : null
}

/** Required localized field: English is the authoring locale and must exist. */
export function flocalizedRequired(form: FormData, name: string, label = name): Localized {
  const value = flocalized(form, name)
  if (value.en === '')
    throw invalid(`${label} (English) is required`, 'form.required_english', { label })
  return value
}

/**
 * A list of localized strings, authored as three parallel textareas and
 * zipped by line index. Lines whose English is blank are dropped, so the
 * list length is driven by the authoring locale rather than by whichever
 * translator typed the most lines.
 */
export function flocalizedList(form: FormData, name: string): Localized[] {
  const byLocale = {} as Record<Locale, string[]>
  for (const locale of locales) byLocale[locale] = splitLines(form, localeFieldName(name, locale))

  const length = byLocale.en.length
  const out: Localized[] = []

  for (let index = 0; index < length; index++) {
    const english = byLocale.en[index]?.trim() ?? ''
    if (english === '') continue
    const entry = {} as Record<Locale, string>
    for (const locale of locales) entry[locale] = byLocale[locale][index]?.trim() ?? ''
    entry.en = english
    out.push(entry)
  }

  return out
}

function splitLines(form: FormData, name: string): string[] {
  const value = form.get(name)
  return typeof value === 'string' ? value.split('\n') : []
}

/** Render a localized list back into one line per entry, for the textarea. */
export function localizedListToText(
  values: readonly Localized[] | null | undefined,
  locale: Locale,
): string {
  if (!values) return ''
  return values.map((value) => value[locale] ?? '').join('\n')
}

/**
 * FAQ entries, authored as `faq_q_en_0`, `faq_a_ar_1`, … The editor always
 * renders two blank rows past the end, so entries can be appended without a
 * client-side repeater. Rows with a blank English question are dropped.
 */
export function ffaq(
  form: FormData,
  name: string,
  rowCount: number,
): { q: Localized; a: Localized }[] {
  const out: { q: Localized; a: Localized }[] = []

  for (let index = 0; index < rowCount; index++) {
    const q = {} as Record<Locale, string>
    const a = {} as Record<Locale, string>
    for (const locale of locales) {
      q[locale] = raw(form, `${name}_q_${locale}_${index}`)
      a[locale] = raw(form, `${name}_a_${locale}_${index}`)
    }
    if (q.en === '') continue
    out.push({ q, a })
  }

  return out
}
