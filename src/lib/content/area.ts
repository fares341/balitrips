/**
 * The place line of an activity («Ubud – Bali») for one language.
 *
 * The Arabic page never prints a Latin-only string beside the pin: an area
 * field left in English («Bali classic VW safari», «Mount Batur, Kintamani»)
 * is not a location an Arabic reader can use, so the activity's region name
 * (always translated) stands in. English and Indonesian fall back to English
 * as usual.
 */

import type { Locale } from '@/i18n/config'

import { pick, pickOptional, type LocalizedText } from './localize'

const ARABIC_LETTER = /[؀-ۿ]/

export function placeLine(
  area: LocalizedText | null | undefined,
  region: { label: LocalizedText; key?: string } | null | undefined,
  locale: Locale,
): string | null {
  const regionName = region ? pick(region.label, locale, region.key ?? '') : ''
  const fallback = regionName.trim() === '' ? null : regionName
  const own = pickOptional(area, locale)
  if (own === null) return fallback
  if (locale === 'ar' && !ARABIC_LETTER.test(own)) return fallback
  return own
}
