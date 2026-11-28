import { describe, expect, it } from 'vitest'

import { buildLadder, isNusaPenida, perPersonMinor } from './nusa-penida'
import type { ActivityTierDto } from './types'

const L = (text: string) => ({ ar: text, en: text, id: text })

function tier(over: Partial<ActivityTierDto>): ActivityTierDto {
  return {
    id: over.key ?? 't',
    key: 't',
    name: L('Tier'),
    tagline: null,
    priceMinor: 10000,
    currency: 'SAR',
    pricing: 'per_person',
    groupMax: null,
    maxGuests: null,
    minGuests: null,
    isPopular: false,
    includedActivities: [],
    includes: [],
    excludes: [],
    includesAddons: [],
    available: true,
    features: [],
    highlights: [],
    details: [],
    notes: [],
    childPriceMinor: null,
    seasons: [],
    compareAtPriceMinor: null,
    badgeLabel: null,
    badgeColor: null,
    image: null,
    duration: null,
    description: null,
    ...over,
  }
}

function activity(slug: string, tiers: ActivityTierDto[], bookable = true) {
  return {
    id: slug,
    slug,
    href: `/activities/${slug}`,
    name: L(slug),
    duration: null,
    hero: null,
    tiers,
    bookable,
  }
}

describe('isNusaPenida', () => {
  it('matches the slug, the name or the area in any language', () => {
    expect(isNusaPenida({ slug: 'nusa-penida-island-tour', name: null })).toBe(true)
    expect(isNusaPenida({ slug: 'luxury-boat', name: { ar: 'قارب فاخر إلى نوسا بينيدا' } })).toBe(
      true,
    )
    expect(
      isNusaPenida({
        slug: 'yacht',
        name: { en: 'Private yacht' },
        area: { en: 'Nusa Penida – Bali' },
      }),
    ).toBe(true)
  })

  it('leaves out Nusa Dua and other places', () => {
    expect(
      isNusaPenida({
        slug: 'samabe-romantic-dinner-bali',
        name: { ar: 'تجربة العشاء الرومانسي في سامابي – نوسا دوا' },
        area: { en: 'Nusa Dua' },
      }),
    ).toBe(false)
  })
})

describe('perPersonMinor', () => {
  it('splits couple and group prices per traveller', () => {
    expect(perPersonMinor({ priceMinor: 32500, pricing: 'per_couple', groupMax: 2 })).toBe(16250)
    expect(perPersonMinor({ priceMinor: 40000, pricing: 'per_group', groupMax: 4 })).toBe(10000)
    expect(perPersonMinor({ priceMinor: 40000, pricing: 'fixed', groupMax: null })).toBe(40000)
    expect(perPersonMinor({ priceMinor: 9000, pricing: 'per_person', groupMax: null })).toBe(9000)
  })
})

describe('buildLadder', () => {
  it('lists every bookable package across activities, cheapest per person first', () => {
    const rows = buildLadder([
      activity('nusa-penida-island-tour', [
        tier({ key: 'west-shared', priceMinor: 32500, pricing: 'per_couple', groupMax: 2 }),
        tier({ key: 'east-west', priceMinor: 46500, pricing: 'per_couple', groupMax: 2 }),
        tier({ key: 'off', priceMinor: 100, available: false }),
      ]),
      activity('nusa-penida-luxury-boat', [
        tier({ key: 'boat', priceMinor: 400000, pricing: 'per_group', groupMax: 10 }),
      ]),
      activity('closed', [tier({ key: 'x', priceMinor: 1 })], false),
    ])
    expect(rows.map((r) => r.tierKey)).toEqual(['west-shared', 'east-west', 'boat'])
    // The price shown stays the package's own, with its own unit.
    expect(rows[2]).toMatchObject({ priceMinor: 400000, pricing: 'per_group', groupMax: 10 })
  })

  it('uses the package text, never invented copy', () => {
    const [row] = buildLadder([
      activity('a', [tier({ key: 'k', tagline: L('سطر'), description: null })]),
    ])
    expect(row?.text).toEqual(L('سطر'))
  })
})
