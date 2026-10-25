/**
 * How an itinerary's name and audience are shown (client, Oct 2026).
 *
 * Names typed in Studio like «جدول سياحي 6 أيام (شباب - عوائل - شهر عسل)»
 * crammed the length and the audiences into the title. On the site the title
 * stays clean and the day count and audiences become separate chips. Nothing
 * stored changes: the name in Studio is kept as typed.
 */

import type { Locale } from '@/i18n/config'
import { pick, pickList } from '@/lib/content/localize'
import type { LocalizedText } from '@/lib/content/types'

type T = (key: string, values?: Record<string, string | number>) => string

/** A trailing «(…)» and its parts, split on - – — ، , / |. */
const TRAILING_PARENS = /\s*[(（]([^()（）]*)[)）]\s*$/

export function splitItineraryName(name: string): { title: string; extras: string[] } {
  const match = TRAILING_PARENS.exec(name)
  if (match === null || match.index === 0) return { title: name.trim(), extras: [] }
  const extras = (match[1] ?? '')
    .split(/\s*[-–—،,|/]\s*/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  return { title: name.slice(0, match.index).trim(), extras }
}

const ARABIC_DIGITS = /[٠-٩]/g
const toLatinDigits = (value: string) =>
  value.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))

/** «جدول سياحي 6 أيام», "6-Day Itinerary", "Itinerari 6 Hari": only a length. */
const GENERIC_TITLES: readonly RegExp[] = [
  /^(?:ال)?جدول(?:\s+(?:ال)?سياحي)?\s*(?:لمدة\s*)?\d+\s*(?:أيام|ايام|يوم|يوماً|يوما)$/,
  /^\d+[-\s]?days?\s+(?:bali\s+)?(?:itinerary|plan|trip)$/i,
  /^(?:bali\s+)?(?:itinerary|plan)\s*[-–:]?\s*\d+\s*days?$/i,
  /^(?:itinerari|jadwal(?:\s+wisata)?)\s+\d+\s+hari$/i,
]

export function isLengthOnlyTitle(title: string): boolean {
  const plain = toLatinDigits(title.trim())
  return GENERIC_TITLES.some((re) => re.test(plain))
}

/** The title to show: without the «(…)» list, and a bare length becomes «Bali in N days». */
export function itineraryTitle(
  name: LocalizedText,
  fallback: string,
  days: number,
  locale: Locale,
  t: T,
): string {
  const { title } = splitItineraryName(pick(name, locale, fallback))
  if (title === '' || isLengthOnlyTitle(title)) return t('it_title_days', { n: days })
  return title
}

/** Audience words commonly typed inside the «(…)», to their message keys. */
const AUDIENCE_WORDS: readonly [RegExp, string][] = [
  [/^(?:ال)?شباب$|^youth|^young|^anak muda/i, 'it_aud_youth'],
  [/^(?:ال)?(?:عوائل|عائلات|عائلة)$|^famil|^keluarga/i, 'it_aud_families'],
  [/^(?:شهر\s*(?:ال)?عسل|(?:ال)?عرسان)$|^honeymoon|^bulan madu/i, 'it_aud_honeymoon'],
  [/^(?:ال)?أزواج$|^couples?$|^pasangan/i, 'it_aud_couples'],
]

/**
 * Who it suits, as chips: the audiences set in Studio; when there are none,
 * the ones written inside the name's «(…)» (known words translated).
 */
export function itineraryAudience(
  name: LocalizedText,
  audience: readonly LocalizedText[],
  locale: Locale,
  t: T,
): string[] {
  const set = pickList([...audience], locale)
  if (set.length > 0) return set
  // The Arabic name is the one the owner writes; read the list from it first.
  const source = splitItineraryName(pick(name, 'ar', '')).extras
  const extras = source.length > 0 ? source : splitItineraryName(pick(name, locale, '')).extras
  const out: string[] = []
  for (const word of extras) {
    const known = AUDIENCE_WORDS.find(([re]) => re.test(word))
    const label = known ? t(known[1]) : locale === 'ar' || !/[؀-ۿ]/.test(word) ? word : null
    if (label !== null && !out.includes(label)) out.push(label)
  }
  return out
}
