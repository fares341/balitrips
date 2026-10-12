import type { Localized } from '@/db/schema'
import { locales, type Locale } from '@/i18n/config'

/**
 * FormData readers.
 *
 * Plain HTML forms post strings; everything below turns them into the exact
 * types the schema wants and rejects the ones it cannot. Money is the place
 * this matters most: prices are read as integer minor units and a non-integer
 * is an error, never a silently rounded float.
 */

export class FormError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormError'
  }
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
  if (value === '') throw new FormError(`${label} is required`)
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
    throw new FormError(`${label} must be a whole number, got "${value}"`)
  }
  return Number.parseInt(value, 10)
}

/** Integer minor units. Never a float — there are no fractional cents. */
export function fminor(form: FormData, name: string, label = name): number {
  const value = fint(form, name, 0, label)
  if (value < 0) throw new FormError(`${label} cannot be negative`)
  return value
}

export function fintOrNull(form: FormData, name: string, label = name): number | null {
  const value = raw(form, name)
  if (value === '') return null
  if (!/^-?\d+$/.test(value)) {
    throw new FormError(`${label} must be a whole number, got "${value}"`)
  }
  return Number.parseInt(value, 10)
}

export function ffloat(form: FormData, name: string, label = name): number {
  const value = raw(form, name)
  if (value === '') throw new FormError(`${label} is required`)
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new FormError(`${label} must be a number, got "${value}"`)
  return parsed
}

/** ISO 4217, uppercased. Length is validated because the column is char(3). */
export function fcurrency(form: FormData, name: string): string {
  const value = raw(form, name).toUpperCase()
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new FormError(`Currency must be a 3-letter ISO 4217 code, got "${value}"`)
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
  if (!isUuid(value)) throw new FormError(`${label} is not a valid id`)
  return value
}

export function fuuid(form: FormData, name: string, label = name): string {
  const value = fuuidOrNull(form, name, label)
  if (!value) throw new FormError(`${label} is required`)
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
    throw new FormError(`${label} must be a date (YYYY-MM-DD), got "${value}"`)
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
  if (value.en === '') throw new FormError(`${label} (English) is required`)
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
