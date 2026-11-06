import { describe, expect, it } from 'vitest'

import { computeTotals } from '@/lib/finance/adjustments'
import { adjustmentLabel } from '@/lib/finance/labels'

import { buyerAccess, bundlePct, cartBundleDiscounts, dayDate, type BundleCartLine } from './bundle'

/**
 * Itineraries phase 3 — «فعاليات جدولي»: who opens the page, and the
 * «كل الفعاليات» discount the cart and checkout compute on the server.
 */

const IT = '11111111-1111-4111-8111-111111111111'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const line = (over: Partial<BundleCartLine>): BundleCartLine => ({
  itemId: Math.random().toString(36).slice(2),
  kind: 'activity',
  activityId: A,
  parentItemId: null,
  bundleItineraryId: IT,
  lineTotalMinor: 10_000,
  ...over,
})

const rule = (over: Partial<Parameters<typeof cartBundleDiscounts>[1][number]> = {}) => ({
  itineraryId: IT,
  linkedActivityIds: [A, B],
  pct: 10,
  includesDriver: false,
  eligible: true,
  ...over,
})

describe('buyer page access', () => {
  it('sends a visitor to sign in', () => {
    expect(buyerAccess({ signedIn: false, owns: false, staff: false })).toBe('sign-in')
  })
  it('refuses a signed-in account that did not buy the itinerary', () => {
    expect(buyerAccess({ signedIn: true, owns: false, staff: false })).toBe('not-owner')
  })
  it('opens for the owner, and for staff as a preview', () => {
    expect(buyerAccess({ signedIn: true, owns: true, staff: false })).toBe('ok')
    expect(buyerAccess({ signedIn: true, owns: false, staff: true })).toBe('ok')
  })
})

describe('«كل الفعاليات» discount (server-side)', () => {
  it('applies only when every linked activity is in the cart under the tag', () => {
    const lines = [line({ activityId: A }), line({ activityId: B, lineTotalMinor: 5_000 })]
    expect(cartBundleDiscounts(lines, [rule()])).toEqual([
      { itineraryId: IT, baseMinor: 15_000, amountMinor: 1_500 },
    ])
    expect(cartBundleDiscounts([line({ activityId: A })], [rule()])).toEqual([])
  })

  it('is refused to a non-owner (or with no uses left) even with every activity', () => {
    const lines = [line({ activityId: A }), line({ activityId: B })]
    expect(cartBundleDiscounts(lines, [rule({ eligible: false })])).toEqual([])
  })

  it('ignores untagged lines and lines tagged for another itinerary', () => {
    const lines = [
      line({ activityId: A }),
      line({ activityId: B, bundleItineraryId: null }),
      line({ activityId: B, bundleItineraryId: '22222222-2222-4222-8222-222222222222' }),
    ]
    expect(cartBundleDiscounts(lines, [rule()])).toEqual([])
  })

  it('discounts only the tagged lines, not other activities in the cart', () => {
    const lines = [
      line({ activityId: A }),
      line({ activityId: B }),
      line({ activityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', bundleItineraryId: null }),
    ]
    expect(cartBundleDiscounts(lines, [rule()])[0]?.baseMinor).toBe(20_000)
  })

  it('counts the linked driver only when the settings say so', () => {
    const a = line({ activityId: A })
    const lines = [
      a,
      line({ activityId: B }),
      line({ kind: 'driver', activityId: null, parentItemId: a.itemId, lineTotalMinor: 30_000 }),
    ]
    expect(cartBundleDiscounts(lines, [rule()])[0]?.amountMinor).toBe(2_000)
    expect(cartBundleDiscounts(lines, [rule({ includesDriver: true })])[0]?.amountMinor).toBe(5_000)
  })

  it('waits for every tagged line to be priced', () => {
    const lines = [line({ activityId: A }), line({ activityId: B, lineTotalMinor: null })]
    expect(cartBundleDiscounts(lines, [rule()])).toEqual([])
  })

  it('uses the itinerary percent over the global one, clamped 0–90', () => {
    expect(bundlePct(null, 10)).toBe(10)
    expect(bundlePct(15, 10)).toBe(15)
    expect(bundlePct(0, 10)).toBe(0)
    expect(bundlePct(120, 10)).toBe(90)
  })
})

describe('totals with the bundle line', () => {
  it('adds its own discount line after the code, never past the subtotal', () => {
    const totals = computeTotals(20_000, 'SAR', { amountMinor: 19_000, code: 'X' }, undefined, [
      { amountMinor: 2_000, code: 'ALL-ACTIVITIES', itineraryId: IT },
    ])
    expect(totals.discountMinor).toBe(20_000)
    expect(totals.totalMinor).toBe(0)
    expect(totals.lines[1]).toMatchObject({ amountMinor: 1_000, itineraryId: IT })
  })

  it('labels the line with its own words', () => {
    const words = {
      discount: (code: string) => `Code ${code}`,
      serviceFee: '',
      bookingFee: '',
      surcharge: '',
      tax: '',
    }
    expect(
      adjustmentLabel(
        { kind: 'discount', amountMinor: 1, code: 'ALL-ACTIVITIES', label: { ar: 'خصم' } },
        'ar',
        words,
      ),
    ).toBe('خصم')
    expect(adjustmentLabel({ kind: 'discount', amountMinor: 1, code: 'X' }, 'ar', words)).toBe(
      'Code X',
    )
  })
})

describe('activity dates from the arrival day', () => {
  it('dates day N as arrival + N − 1, across months', () => {
    expect(dayDate('2026-12-30', 1)).toBe('2026-12-30')
    expect(dayDate('2026-12-30', 3)).toBe('2027-01-01')
    expect(dayDate('nope', 1)).toBeNull()
  })
})

describe('no buyer data on the public itinerary page', () => {
  it('the public page and DTO never import the buyer-only modules', async () => {
    const { readFileSync } = await import('node:fs')
    for (const file of [
      'src/app/[locale]/itineraries/[slug]/page.tsx',
      'src/lib/itineraries/public.ts',
      'src/lib/itineraries/public-dto.ts',
    ]) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/itineraries\/(buyer|bundle-server|buyer-access)'/)
      expect(source).not.toMatch(/bundleDiscountPct|activityId/)
    }
  })
})
