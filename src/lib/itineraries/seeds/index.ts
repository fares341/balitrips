/**
 * Registry of the reviewed itinerary seeds applied by
 * `scripts/seed-itinerary.ts --slug=…` and the pure helpers it uses.
 * («جدول العائلة 4 أيام» keeps its own script, `scripts/seed-family-4-days.ts`.)
 */

import { normalisePageContent, PAGE_SECTION_KEYS } from '../page-content'
import { FAMILY_6_DAYS } from './family-6-days'
import { FAMILY_8_DAYS } from './family-8-days'
import { HONEYMOON_6_DAYS } from './honeymoon-6-days'
import { HONEYMOON_8_DAYS } from './honeymoon-8-days'
import { HONEYMOON_10_DAYS } from './honeymoon-10-days'
import {
  PERIOD_LABEL,
  STOP_TYPE_LABEL,
  type ItinerarySeed,
  type L3,
  type SeedDay,
  type SeedStop,
} from './shared'
import { YOUTH_6_DAYS } from './youth-6-days'
import { YOUTH_8_DAYS } from './youth-8-days'
import { YOUTH_10_DAYS } from './youth-10-days'

export const ITINERARY_SEEDS: readonly ItinerarySeed[] = [
  YOUTH_6_DAYS,
  HONEYMOON_6_DAYS,
  FAMILY_6_DAYS,
  YOUTH_8_DAYS,
  HONEYMOON_8_DAYS,
  FAMILY_8_DAYS,
  YOUTH_10_DAYS,
  HONEYMOON_10_DAYS,
]

export function seedBySlug(slug: string): ItinerarySeed | undefined {
  return ITINERARY_SEEDS.find((seed) => seed.slug === slug)
}

type Loc = keyof L3

/**
 * The private day text stored in `itinerary_days.description`: summary,
 * the source's notes, then every stop in order (name, type, suggested
 * period, note, map link). Stops linked to the catalog are listed too, so
 * the buyer's page and the generated PDF never lose a stop or its link.
 */
export function privateDayText(day: SeedDay, locale: Loc): string {
  const lines: string[] = [day.description[locale]]
  for (const note of day.notes) lines.push(`• ${note[locale]}`)
  day.stops.forEach((stop, index) => {
    lines.push(stopLine(stop, index, locale))
    if (stop.then) lines.push(`   ↳ ${stop.then[locale]}`)
  })
  return lines.join('\n')
}

export function stopLine(stop: SeedStop, index: number, locale: Loc): string {
  const period = stop.period ? ` · ${PERIOD_LABEL[stop.period][locale]}` : ''
  const link =
    stop.mapsUrl ?? { ar: 'غير متوفر', en: 'Not available', id: 'Tidak tersedia' }[locale]
  return `${index + 1}. ${stop.name} (${STOP_TYPE_LABEL[stop.type][locale]}${period}) — ${stop.note[locale]}: ${link}`
}

/** The Studio «محتوى الصفحة» document for a seed: benefits, steps, hero line; customise card hidden. */
export function pageContentFor(seed: ItinerarySeed): Record<string, unknown> {
  const p = seed.public
  return normalisePageContent({
    texts: { aboutTitle: { ...p.heroTitle } },
    benefits: p.benefits.map((b) => ({ icon: b.icon, label: { ...b.label }, text: { ...b.text } })),
    how: p.how.map((h) => ({ label: { ...h.label }, text: { ...h.text } })),
    // «خصّص جدولك» stays hidden until the owner confirms the service for this plan.
    sections: PAGE_SECTION_KEYS.map((key) => ({ key, hidden: key === 'custom' })),
  }) as unknown as Record<string, unknown>
}

export { hasSellablePrice } from '../price-guard'

/** Google Maps short-link format check only (no network). */
export function mapsUrlIssue(url: string | null): string | null {
  if (url === null) return 'missing'
  if (!/^https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9]{10,}(\?g_st=ic)?$/.test(url))
    return 'unusual format'
  return null
}
