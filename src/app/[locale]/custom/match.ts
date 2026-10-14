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
 * luxury budget and a family of nine on an economy one got the same four cards in
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

import { BUDGET_TIERS, tierForPrice, type BudgetTier } from '@/lib/budget-tier'
import type { ActivitySummary } from '@/lib/content/types'

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

/**
 * Budget fit, by how many categories the activity sits from the traveller's
 * (activity tier − requested tier): on target is best, a step cheaper is
 * fine, a step dearer is a stretch, two steps dearer is out of reach.
 */
const TIER_SCORE: Record<number, number> = {
  [-2]: 0,
  [-1]: 1,
  0: 3,
  1: -3,
  2: -6,
}

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
  /** Economy / mid-range / luxury. */
  budgetTier: BudgetTier
  wantsDriver: boolean
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
 * How well an activity's price category fits the requested one. An activity
 * whose price cannot be classified (another currency) is not scored on
 * budget at all — comparing raw integers across currencies would be a
 * category error.
 */
export function budgetScore(activity: ActivitySummary, requested: BudgetTier): number {
  const tier = tierForPrice(activity.priceMinor, activity.currency, 'activity')
  if (tier === null) return 0
  const distance = BUDGET_TIERS.indexOf(tier) - BUDGET_TIERS.indexOf(requested)
  return TIER_SCORE[distance] ?? 0
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

  score += budgetScore(activity, input.budgetTier)

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
