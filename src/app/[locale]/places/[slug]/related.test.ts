import { describe, expect, it } from 'vitest'

import type { ActivitySummary } from '@/lib/content/types'

import { relatedActivities } from './related'

const activity = (slug: string, en: string, region: string | null, rating = 4) =>
  ({
    id: slug,
    slug,
    name: { en },
    region: region === null ? null : { id: region, key: region, label: { en: region } },
    rating,
  }) as unknown as ActivitySummary

const ACTIVITIES = [
  activity('ubud-cooking', 'Ubud Cooking Class', 'ubud', 5),
  activity('batur-sunrise', 'Mount Batur Sunrise Trek', 'kintamani'),
  activity('penida-day', 'Nusa Penida Day Trip', 'islands'),
]

describe('relatedActivities', () => {
  it('ties a place to activities by shared name words first, then by area', () => {
    const related = relatedActivities(
      {
        name: { en: 'Mount Batur', ar: 'جبل باتور' },
        activitySlug: null,
        regionKey: 'kintamani',
        parentRegionKey: 'north',
      },
      ACTIVITIES,
    )
    expect(related.map((a) => a.slug)).toEqual(['batur-sunrise'])
  })

  it('puts the linked activity first and ignores unrelated ones', () => {
    const related = relatedActivities(
      {
        name: { en: 'Tegallalang Rice Terrace' },
        activitySlug: 'penida-day',
        regionKey: 'ubud',
        parentRegionKey: 'central',
      },
      ACTIVITIES,
    )
    expect(related.map((a) => a.slug)).toEqual(['penida-day', 'ubud-cooking'])
  })
})
