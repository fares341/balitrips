/**
 * Activities related to a map place (list H10): the activity Studio linked to
 * it first, then activities whose name shares a word with the place's
 * ("Mount Batur" → "Mount Batur Sunrise Trek"), then ones in the same area.
 * Pure, so it can be tested without a database.
 */

import type { ActivitySummary } from '@/lib/content/types'

/** Words too common to tie a place to an activity. */
const STOP = new Set([
  'bali',
  'the',
  'and',
  'with',
  'tour',
  'trip',
  'day',
  'from',
  'private',
  'beach',
  'temple',
  'pura',
  'pantai',
])

function words(text: string | undefined | null): Set<string> {
  return new Set(
    (text ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 3 && !STOP.has(word)),
  )
}

export function relatedActivities(
  place: {
    name: Record<string, string>
    activitySlug: string | null
    regionKey: string | null
    parentRegionKey: string | null
  },
  activities: readonly ActivitySummary[],
  limit = 3,
): ActivitySummary[] {
  const placeWords = new Set(Object.values(place.name).flatMap((name) => [...words(name)]))
  const scored = activities
    .map((activity) => {
      let score = 0
      if (activity.slug === place.activitySlug) score += 100
      const shared = Object.values(activity.name).some((name) =>
        [...words(name)].some((word) => placeWords.has(word)),
      )
      if (shared) score += 10
      const key = activity.region?.key ?? null
      if (key !== null && (key === place.regionKey || key === place.parentRegionKey)) score += 1
      return { activity, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || (b.activity.rating ?? 0) - (a.activity.rating ?? 0))
  return scored.slice(0, limit).map((entry) => entry.activity)
}
