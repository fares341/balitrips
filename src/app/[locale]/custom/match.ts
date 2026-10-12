/**
 * Custom-trip recommendation ranking.
 *
 * The handoff asked eight questions and used exactly one of the answers:
 *
 *     const recs = ACTIVITIES.filter((a) => a.cats.some((c) => ints.includes(c))).slice(0, 4)
 *     const recsFinal = recs.length ? recs : ACTIVITIES.slice(0, 4)
 *
 * Theme, budget, party size, dates and the driver toggle were collected,
 * displayed back as chips, and then discarded — so a honeymooning couple on a
 * $3000 budget and a family of nine on $250 got the same four cards in
 * declaration order, and anyone whose interests matched nothing got the first
 * four activities in the file presented as "recommended for you".
 *
 * Every answer is used here, and the ranking is a pure function of its input:
 * no database, no clock, no randomness. That makes it unit-testable, and it
 * makes two identical questionnaires produce two identical proposals.
 *
 * Selection is greedy rather than a plain sort, because the *set* matters:
 * a seven-day trip with a driver should not be seven things in one valley, and
 * a three-day trip without one should not be three ends of the island.
 */

import type { ActivitySummary } from '@/lib/content/types'
import { minorUnitExponent } from '@/lib/money'

import type { ThemeKey } from './types'

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

/** A category the traveller explicitly asked for. The strongest single signal. */
const INTEREST_WEIGHT = 4

/** A category the chosen theme implies, but the traveller did not tick. */
const THEME_WEIGHT = 2

/** Party-size affinity, applied per matching category. */
const GROUP_WEIGHT = 2

/** Budget fit, from comfortably affordable to well over. */
const BUDGET_SCORE = {
  cheap: 3,
  affordable: 2,
  stretch: 0,
  over: -3,
  wayOver: -6,
} as const

/**
 * Applied per activity already chosen from the same region.
 *
 * Sign depends on the driver answer: with a car the trip can spread out, so
 * repeats are penalised; without one, every transfer is a negotiation with a
 * scooter or a taxi, so clustering is rewarded.
 */
const REGION_SPREAD_PENALTY = 2
const REGION_CLUSTER_BONUS = 1

/** Trip lengths outside this range still produce a usable proposal. */
const MIN_RECOMMENDATIONS = 3
const MAX_RECOMMENDATIONS = 8

/** Used for budget-per-day when the traveller has not fixed their dates. */
const ASSUMED_DAYS = 3

// ---------------------------------------------------------------------------
// Affinities, by `categories.key`
// ---------------------------------------------------------------------------

/**
 * Which categories each theme leans towards.
 *
 * Keys are real `categories.key` values. A key the taxonomy does not carry
 * simply never matches — it cannot produce a blank chip, because nothing here
 * is rendered; it only contributes score.
 */
export const THEME_AFFINITY: Record<ThemeKey, readonly string[]> = {
  family: ['family', 'kids', 'beach', 'nature'],
  honey: ['romantic', 'spa', 'photo', 'beach'],
  youth: ['adv', 'marine', 'beach', 'photo'],
  solo: ['culture', 'nature', 'cafe', 'photo'],
  luxury: ['spa', 'romantic', 'food', 'photo'],
  budget: ['nature', 'beach', 'culture', 'cafe'],
}

/** Party sizes at which the group-size heuristics switch on. */
const LARGE_GROUP = 5
const COUPLE = 2

const GROUP_FRIENDLY = ['family', 'kids'] as const
const COUPLE_FRIENDLY = ['romantic', 'spa'] as const
const SOLO_FRIENDLY = ['culture', 'cafe', 'photo', 'nature'] as const

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface MatchInput {
  /** The published catalogue, already localized-agnostic. */
  activities: readonly ActivitySummary[]
  /** Validated `categories.key` values the traveller ticked. */
  interests: readonly string[]
  theme: ThemeKey
  travellers: number
  /** Inclusive trip length, or null when the dates are incomplete. */
  days: number | null
  /** Per person, for the whole trip, in minor units of `currency`. */
  budgetPerPersonMinor: number
  currency: string
  wantsDriver: boolean
  /**
   * Day rate of the auto-assigned vehicle, in minor units of `currency`.
   *
   * Null when no driver was requested, when the fleet has no row for the
   * implied class, or when that row is priced in another currency — in which
   * case it is left out of the budget rather than converted at a rate this
   * system does not have.
   */
  driverDayRateMinor: number | null
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * How many suggestions a trip of this length wants.
 *
 * The handoff always returned four, whether the traveller had booked two
 * nights or three weeks.
 */
export function recommendationCount(days: number | null): number {
  if (days === null) return MIN_RECOMMENDATIONS + 1
  return Math.min(MAX_RECOMMENDATIONS, Math.max(MIN_RECOMMENDATIONS, days))
}

/**
 * What one person can spend per day on activities, after their share of the
 * driver.
 *
 * The driver is a per-vehicle cost, so a family of six splits it six ways —
 * which is exactly why the same budget buys a large group more.
 */
export function perPersonDailyBudgetMinor(input: MatchInput): number {
  const days = input.days ?? ASSUMED_DAYS
  const effectiveDays = days > 0 ? days : 1

  const driverTotal =
    input.wantsDriver && input.driverDayRateMinor !== null
      ? input.driverDayRateMinor * effectiveDays
      : 0

  const driverShare = Math.ceil(driverTotal / Math.max(1, input.travellers))
  const spendable = Math.max(0, input.budgetPerPersonMinor - driverShare)

  return Math.floor(spendable / effectiveDays)
}

function budgetScore(priceMinor: number, allowanceMinor: number): number {
  // No allowance left after the driver: everything is over budget, but the
  // cheapest things are still the least wrong.
  if (allowanceMinor <= 0) return priceMinor === 0 ? BUDGET_SCORE.affordable : BUDGET_SCORE.over

  const ratio = priceMinor / allowanceMinor
  if (ratio <= 0.5) return BUDGET_SCORE.cheap
  if (ratio <= 1) return BUDGET_SCORE.affordable
  if (ratio <= 1.5) return BUDGET_SCORE.stretch
  if (ratio <= 2.5) return BUDGET_SCORE.over
  return BUDGET_SCORE.wayOver
}

function groupScore(categoryKeys: ReadonlySet<string>, travellers: number): number {
  let score = 0

  if (travellers >= LARGE_GROUP) {
    for (const key of GROUP_FRIENDLY) if (categoryKeys.has(key)) score += GROUP_WEIGHT
    // A nine-person party is not booking a couples' massage.
    for (const key of COUPLE_FRIENDLY) if (categoryKeys.has(key)) score -= GROUP_WEIGHT
  } else if (travellers === COUPLE) {
    for (const key of COUPLE_FRIENDLY) if (categoryKeys.has(key)) score += GROUP_WEIGHT
  } else if (travellers === 1) {
    for (const key of SOLO_FRIENDLY) if (categoryKeys.has(key)) score += GROUP_WEIGHT
    for (const key of GROUP_FRIENDLY) if (categoryKeys.has(key)) score -= GROUP_WEIGHT
  }

  return score
}

/** Score one activity against the answers, ignoring what else was picked. */
export function scoreActivity(activity: ActivitySummary, input: MatchInput): number {
  const keys = new Set(activity.categories.map((category) => category.key))

  let score = 0

  for (const interest of new Set(input.interests)) {
    if (keys.has(interest)) score += INTEREST_WEIGHT
  }

  for (const affinity of THEME_AFFINITY[input.theme]) {
    if (keys.has(affinity)) score += THEME_WEIGHT
  }

  score += groupScore(keys, input.travellers)

  /**
   * Budget only counts when the two amounts are in the same currency.
   *
   * Comparing minor units across currencies is not a rounding error, it is a
   * category error — 500 JPY and 500 USD are the same integer.
   */
  if (activity.currency.toUpperCase() === input.currency.toUpperCase()) {
    score += budgetScore(activity.priceMinor, perPersonDailyBudgetMinor(input))
  }

  return score
}

/**
 * Rank and select.
 *
 * Ties break on rating, then review count, then slug — so the result is
 * stable across requests and across database orderings.
 */
export function rankActivities(input: MatchInput, limit?: number): ActivitySummary[] {
  const take = limit ?? recommendationCount(input.days)

  const scored = input.activities.map((activity) => ({
    activity,
    base: scoreActivity(activity, input),
  }))

  const remaining = [...scored]
  const chosen: ActivitySummary[] = []
  const perRegion = new Map<string, number>()

  while (chosen.length < take && remaining.length > 0) {
    let bestIndex = 0
    let bestScore = -Infinity

    for (let index = 0; index < remaining.length; index++) {
      const candidate = remaining[index]
      if (candidate === undefined) continue

      const regionKey = candidate.activity.region?.key ?? ''
      const alreadyPicked = perRegion.get(regionKey) ?? 0

      // Region shaping, driven by the driver answer.
      const adjustment =
        regionKey === ''
          ? 0
          : input.wantsDriver
            ? -REGION_SPREAD_PENALTY * alreadyPicked
            : REGION_CLUSTER_BONUS * alreadyPicked

      const total = candidate.base + adjustment
      const best = remaining[bestIndex]

      if (
        total > bestScore ||
        (total === bestScore && best !== undefined && beats(candidate.activity, best.activity))
      ) {
        bestScore = total
        bestIndex = index
      }
    }

    const picked = remaining.splice(bestIndex, 1)[0]
    if (picked === undefined) break

    chosen.push(picked.activity)
    const regionKey = picked.activity.region?.key ?? ''
    perRegion.set(regionKey, (perRegion.get(regionKey) ?? 0) + 1)
  }

  return chosen
}

/** Deterministic tie-break: better rated, then better reviewed, then by slug. */
function beats(a: ActivitySummary, b: ActivitySummary): boolean {
  const ratingA = a.rating ?? -1
  const ratingB = b.rating ?? -1
  if (ratingA !== ratingB) return ratingA > ratingB
  if (a.reviewCount !== b.reviewCount) return a.reviewCount > b.reviewCount
  return a.slug < b.slug
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

/**
 * The currency this catalogue quotes in.
 *
 * Pass the most authoritative list first — the driver fleet is three rows and
 * changes rarely, so the questionnaire's budget slider and the server action
 * that reads it back agree without either of them hard-coding a code. Falls
 * back to USD, which is what the seed and the design's copy use.
 */
export function catalogueCurrency(...groups: readonly (readonly { currency: string }[])[]): string {
  for (const group of groups) {
    const counts = new Map<string, number>()
    for (const item of group) {
      const code = item.currency.toUpperCase()
      if (code === '') continue
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }

    let best: string | null = null
    let bestCount = 0
    // Sorted so a tie resolves the same way every time rather than by
    // insertion order, which is a database ordering detail.
    for (const [code, count] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (count > bestCount) {
        best = code
        bestCount = count
      }
    }

    if (best !== null) return best
  }

  return 'USD'
}

/** Whole units of `currency` → minor units, using the currency's own exponent. */
export function toMinorUnits(whole: number, currency: string): number {
  return Math.round(whole * 10 ** minorUnitExponent(currency))
}
