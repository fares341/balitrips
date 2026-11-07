/**
 * Itineraries phase 2: the public pages reveal nothing of the plan, and the
 * map bundle is priced on the server.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { applyCoverage, type CatalogSnapshot, type QuoteLine } from '@/lib/pricing/quote'

import { mapBundleOffer, resolveMapPlan } from './map-bundle'
import {
  audienceKeysOf,
  PUBLIC_DETAIL_KEYS,
  teaserSplit,
  toPublicImage,
  toPublicStats,
  type PublicItineraryDetail,
} from './public-dto'
import { normalisePageContent } from './page-content'
import { ITINERARY_SALES_DEFAULT } from './sales-settings'

const ROOT = join(__dirname, '..', '..', '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('public itinerary DTO', () => {
  const detail: PublicItineraryDetail = {
    id: 'i1',
    slug: 's',
    href: '/itineraries/s',
    name: { en: 'Bali', ar: 'بالي', id: 'Bali' },
    blurb: null,
    days: 5,
    audience: [],
    audienceKeys: [],
    tripType: null,
    priceMinor: 100,
    currency: 'USD',
    tierPrices: {},
    includesMap: false,
    isPopular: true,
    hero: toPublicImage({
      id: 'm',
      url: 'https://cdn/x.webp',
      width: 1,
      height: 1,
      srcSetAvif: null,
      srcSetWebp: null,
    }),
    stats: toPublicStats([{ icon: 'pin', value: '52', label: { ar: 'مكان' } }]),
    intro: null,
    gallery: [],
    teaserDays: [{ dayNumber: 1, image: null, mood: { ar: 'هدوء' } }],
    moreDays: 4,
    seoTitle: null,
    seoDescription: null,
    faq: [{ q: { ar: 'س' }, a: { ar: 'ج' } }],
    page: normalisePageContent({
      texts: { daysTitle: { ar: 'أيامك' } },
      benefits: [{ icon: 'pin', label: { ar: 'خريطة' }, text: { ar: 'نص' } }],
    }),
  }

  it('carries only allow-listed keys', () => {
    expect(Object.keys(detail).sort()).toEqual([...PUBLIC_DETAIL_KEYS].sort())
    expect(Object.keys(detail.teaserDays[0] ?? {}).sort()).toEqual(['dayNumber', 'image', 'mood'])
    expect(Object.keys(detail.hero ?? {})).not.toContain('alt')
  })

  it('never names the forbidden fields', () => {
    const json = JSON.stringify(detail)
    for (const word of [
      'linkedPlaceIds',
      'uploadedPdfKeys',
      'pdfKey',
      'activity',
      'activityId',
      'title',
      'description',
      'internalNotes',
      'placeId',
    ]) {
      expect(json).not.toContain(`"${word}"`)
    }
  })

  it('the loader never selects day content, places or PDF columns', () => {
    const source = read('src/lib/itineraries/public.ts')
    for (const column of [
      'itineraryDays.title',
      'itineraryDays.description',
      'itineraryDays.activityId',
      'itineraryDayPlaces',
      'linkedPlaceIds',
      'uploadedPdfKeys',
      'internalNotes',
      'itineraryDocuments',
    ]) {
      expect(source).not.toContain(column)
    }
  })

  it('the public pages read only the public DTO', () => {
    for (const page of [
      'src/app/[locale]/itineraries/page.tsx',
      'src/app/[locale]/itineraries/[slug]/page.tsx',
      'src/app/[locale]/itineraries/[slug]/package-box.tsx',
      'src/app/[locale]/itineraries/[slug]/actions.ts',
    ]) {
      const source = read(page)
      for (const banned of [
        'getItineraryBySlug',
        'listItineraries',
        'loadDayStops',
        'dayPlans',
        'linkedPlace',
        'packagesForItinerary',
        'download',
        'whatsapp',
      ]) {
        // 'download' is allowed only as an icon name.
        if (banned === 'download') {
          expect(source.replace(/name="download"/g, '')).not.toMatch(/\/download|downloadUrl/)
          continue
        }
        expect(source.toLowerCase()).not.toContain(banned.toLowerCase())
      }
    }
  })

  it('splits the teaser days', () => {
    expect(teaserSplit([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], more: 2 })
    expect(teaserSplit([1, 2], 3)).toEqual({ shown: [1, 2], more: 0 })
    expect(teaserSplit([1, 2], -1)).toEqual({ shown: [], more: 2 })
  })

  it('maps audiences to youth / couples / family', () => {
    expect(audienceKeysOf([{ ar: 'العائلات', en: 'Families' }])).toEqual(['family'])
    expect(audienceKeysOf([{ en: 'Couples' }, { ar: 'شباب' }])).toEqual(['youth', 'couples'])
    expect(audienceKeysOf([], { ar: 'جدول 6 أيام (شباب - عوائل - شهر عسل)' })).toEqual([
      'youth',
      'couples',
      'family',
    ])
    expect(audienceKeysOf([{ en: 'Wellness' }])).toEqual([])
  })

  it('drops malformed preview stats', () => {
    expect(toPublicStats([{ icon: 'nope', value: '7' }, { value: '' }, null])).toEqual([
      { icon: 'check', value: '7', label: {} },
    ])
  })
})

describe('map bundle offer', () => {
  const plans = [
    { id: 'vip', priceMinor: 9900, currency: 'SAR', kind: 'vip', published: true },
    { id: 'map', priceMinor: 7500, currency: 'SAR', kind: 'map_access', published: true },
    { id: 'draft', priceMinor: 100, currency: 'SAR', kind: 'map_access', published: false },
  ]
  const settings = { ...ITINERARY_SALES_DEFAULT, currency: 'SAR', mapBundlePriceMinor: 4900 }

  it('picks the Studio plan, else the cheapest published one', () => {
    expect(resolveMapPlan({ ...settings, mapPlanId: 'vip' }, plans)?.id).toBe('vip')
    expect(resolveMapPlan({ ...settings, mapPlanId: 'draft' }, plans)?.id).toBe('map')
    expect(resolveMapPlan(settings, [])).toBeNull()
  })

  it('computes the saving from the settings', () => {
    expect(mapBundleOffer(settings, plans)).toEqual({
      planId: 'map',
      currency: 'SAR',
      fullMinor: 7500,
      bundleMinor: 4900,
      savingMinor: 2600,
    })
  })

  it('reads a map plan still stored in USD in SAR, so the bundle still shows', () => {
    // The live bug: the plan was USD and the settings SAR, so no «وفّر».
    const usd = plans.map((plan) => ({
      ...plan,
      currency: 'USD',
      priceMinor: plan.id === 'vip' ? 2640 : 2000,
    }))
    const offer = mapBundleOffer(settings, usd, { USD: 1 / 3.75 })
    expect(offer?.currency).toBe('SAR')
    expect(offer?.fullMinor).toBe(7500)
    expect(offer?.savingMinor).toBe(7500 - settings.mapBundlePriceMinor)
  })

  it('drops a plan whose currency has no rate', () => {
    const odd = plans.map((plan) => ({ ...plan, currency: 'XYZ' }))
    expect(mapBundleOffer(settings, odd, {})).toBeNull()
  })
})

describe('cart charges the bundle price only with an itinerary', () => {
  const catalog = {
    itineraries: new Map([
      ['it', { priceMinor: 5000, currency: 'SAR', version: 1 }],
      ['itMap', { priceMinor: 5000, currency: 'SAR', version: 1, includesMap: true }],
    ]),
    plans: new Map([
      ['map', { priceMinor: 7500, currency: 'SAR', kind: 'map_access', withItineraryMinor: 4900 }],
    ]),
    packages: new Map(),
  } as unknown as CatalogSnapshot
  const line = (itemId: string, kind: 'itinerary' | 'plan', refId: string, price: number) =>
    ({
      itemId,
      kind,
      refId,
      unitPriceMinor: price,
      quantity: 1,
      lineTotalMinor: price,
      currency: 'SAR',
    }) as QuoteLine

  it('bundles with an itinerary', () => {
    const lines = [line('a', 'itinerary', 'it', 5000), line('b', 'plan', 'map', 7500)]
    applyCoverage(lines, catalog)
    expect(lines[1]?.lineTotalMinor).toBe(4900)
    expect(lines[1]?.mapBundle?.savingMinor).toBe(2600)
  })

  it('full price on its own, or with an itinerary that includes the map', () => {
    const alone = [line('b', 'plan', 'map', 7500)]
    applyCoverage(alone, catalog)
    expect(alone[0]?.lineTotalMinor).toBe(7500)
    const withMap = [line('a', 'itinerary', 'itMap', 5000), line('b', 'plan', 'map', 7500)]
    applyCoverage(withMap, catalog)
    expect(withMap[1]?.lineTotalMinor).toBe(7500)
  })
})
