/**
 * «نوسا بينيدا» — one list of every Nusa Penida experience (owner, Nov 2026:
 * "Nusa Penida should be its own list, from the economy options to the luxury
 * ones, with a description of each"; a luxury boat now, a luxury yacht later).
 *
 * Pure, no I/O. The page (`/nusa-penida`) loads the published activities and
 * hands them here:
 *
 *  - which activities belong: any listed activity whose slug, name or area
 *    mentions Nusa Penida in any language. A new boat or yacht activity joins
 *    the list on its own once its name or area says «Nusa Penida» — nothing to
 *    configure, and no activity is ever added by hand-written data here;
 *  - the ladder: every bookable package of those activities as its own row,
 *    cheapest first. Packages are priced per person, per couple, per group or
 *    per booking, so rows are compared by the price ONE traveller pays
 *    (`perPersonMinor`); the price shown stays the package's own, with its
 *    own unit;
 *  - the description of each row is the package's own text (its description,
 *    then its tagline), else its «includes» list — never a sentence written
 *    here.
 */

import type { PackagePricing } from '@/lib/booking/price'

import { pickOptional } from './localize'
import type { ActivityDetail, ActivityTierDto, LocalizedText, MediaDto } from './types'
import type { Locale } from '@/i18n/config'

export const NUSA_PENIDA_PATH = '/nusa-penida'

/** Spellings that name the island (lower-cased, Latin and Arabic). */
const NEEDLES = ['penida', 'بينيدا', 'بنيدا'] as const

type Texts = Partial<Record<keyof LocalizedText, string | null>> | null | undefined

type Matchable = {
  slug: string
  name: Texts
  area?: Texts
}

function texts(value: Texts): string[] {
  if (!value) return []
  return Object.values(value).filter((one): one is string => typeof one === 'string')
}

/** True when the activity is on Nusa Penida (or is a trip to it). */
export function isNusaPenida(activity: Matchable): boolean {
  const haystack = [activity.slug, ...texts(activity.name), ...texts(activity.area)]
    .join(' ')
    .toLowerCase()
  return NEEDLES.some((needle) => haystack.includes(needle))
}

/**
 * The price one traveller pays for a package, in minor units — only to
 * ORDER the ladder. A per-group or per-booking price without a group size is
 * compared as is (one unit), so it never looks cheaper than it is.
 */
export function perPersonMinor(
  tier: Pick<ActivityTierDto, 'priceMinor' | 'pricing' | 'groupMax'>,
): number {
  const pricing: PackagePricing = tier.pricing
  switch (pricing) {
    case 'per_couple':
      return tier.priceMinor / 2
    case 'per_group':
    case 'fixed':
      return tier.groupMax && tier.groupMax > 1 ? tier.priceMinor / tier.groupMax : tier.priceMinor
    default:
      return tier.priceMinor
  }
}

export interface LadderRow {
  activityId: string
  activitySlug: string
  activityHref: string
  activityName: LocalizedText
  tierKey: string
  tierName: LocalizedText
  /** The package's own text: description, else tagline. Null = none written. */
  text: LocalizedText | null
  /** Up to four «includes» lines, shown when the package has no text. */
  includes: LocalizedText[]
  duration: LocalizedText | null
  priceMinor: number
  currency: string
  pricing: PackagePricing
  groupMax: number | null
  /** Ordering key only (see `perPersonMinor`). */
  perPersonMinor: number
  image: MediaDto | null
  badge: LocalizedText | null
  isPopular: boolean
}

type LadderActivity = Pick<
  ActivityDetail,
  'id' | 'slug' | 'href' | 'name' | 'duration' | 'hero' | 'tiers' | 'bookable'
>

/**
 * Every package a traveller can buy, cheapest per person first. A package
 * that is switched off, unpriced, or on an activity that is not bookable is
 * left out; an activity without packages is listed by its own «from» price
 * only when it has one (handled by the page, not here).
 */
export function buildLadder(activities: readonly LadderActivity[]): LadderRow[] {
  const rows: LadderRow[] = []
  for (const activity of activities) {
    if (!activity.bookable) continue
    for (const tier of activity.tiers) {
      if (!tier.available || !(tier.priceMinor > 0)) continue
      rows.push({
        activityId: activity.id,
        activitySlug: activity.slug,
        activityHref: activity.href,
        activityName: activity.name,
        tierKey: tier.key,
        tierName: tier.name,
        text: tier.description ?? tier.tagline ?? null,
        includes: tier.includes.slice(0, 4),
        duration: tier.duration ?? activity.duration ?? null,
        priceMinor: tier.priceMinor,
        currency: tier.currency,
        pricing: tier.pricing,
        groupMax: tier.groupMax,
        perPersonMinor: perPersonMinor(tier),
        image: tier.image ?? activity.hero ?? null,
        badge: tier.badgeLabel,
        isPopular: tier.isPopular,
      })
    }
  }
  // Cheapest per person first; one currency is assumed (the catalogue is in
  // SAR). A tie keeps the owner's order of activities and packages.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.perPersonMinor - b.row.perPersonMinor || a.index - b.index)
    .map(({ row }) => row)
}

/** The package's own text in this language, else null. */
export function rowText(row: LadderRow, locale: Locale): string | null {
  return pickOptional(row.text, locale)
}
