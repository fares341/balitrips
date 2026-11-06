import { describe, expect, it } from 'vitest'

import { addDays, dayState, driverWindow, weekday } from './driver-calendar'
import {
  cleanDownloadFilename,
  isPdfMime,
  looksLikePdf,
  pdfStatus,
  publishBlock,
} from './publish-gate'
import {
  DRIVER_SETTINGS_DEFAULT,
  ITINERARY_SALES_DEFAULT,
  defaultPriceFor,
  driverSettingsSchema,
  itinerarySalesSchema,
  parseDriverSettings,
  parseItinerarySales,
} from './sales-settings'
import {
  activityLineMinor,
  bundleTotal,
  mapBundleSaving,
  percentOffMinor,
  totalSavingMinor,
} from './savings'

const facts = { uploadedVersion: null, generatedExists: false, dayCount: 3, unresolvedDays: 0 }

describe('publish gating', () => {
  it('uploaded file wins and is ready', () => {
    expect(pdfStatus({ ...facts, uploadedVersion: 2 })).toEqual({
      kind: 'uploaded',
      fileVersion: 2,
    })
    expect(publishBlock({ ...facts, uploadedVersion: 1 })).toBeNull()
  })
  it('a rendered or renderable generated file is ready', () => {
    expect(pdfStatus({ ...facts, generatedExists: true })).toEqual({
      kind: 'generated',
      rendered: true,
    })
    expect(pdfStatus(facts)).toEqual({ kind: 'generated', rendered: false })
    expect(publishBlock(facts)).toBeNull()
  })
  it('no days or unresolved days block before the PDF rule', () => {
    expect(publishBlock({ ...facts, dayCount: 0 })).toBe('no_days')
    expect(publishBlock({ ...facts, unresolvedDays: 1 })).toBe('unresolved_days')
  })
  it('no file at all is red and blocks', () => {
    const none = { ...facts, dayCount: 0 }
    expect(pdfStatus(none)).toEqual({ kind: 'none' })
    expect(pdfStatus({ ...facts, unresolvedDays: 2 })).toEqual({ kind: 'none' })
  })
  it('an upload alone does not skip the day checks', () => {
    expect(publishBlock({ ...facts, uploadedVersion: 1, unresolvedDays: 1 })).toBe(
      'unresolved_days',
    )
  })
  it('checks PDF bytes and MIME', () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true)
    expect(looksLikePdf(new TextEncoder().encode('<html>'))).toBe(false)
    expect(isPdfMime('application/pdf')).toBe(true)
    expect(isPdfMime('text/html')).toBe(false)
  })
  it('cleans the download filename', () => {
    expect(cleanDownloadFilename('رومانسية بالي / 8 أيام.pdf')).toBe('رومانسية بالي 8 أيام.pdf')
    expect(cleanDownloadFilename('  ')).toBeNull()
    expect(cleanDownloadFilename(null)).toBeNull()
  })
})

describe('settings schemas', () => {
  it('defaults are valid and safe', () => {
    expect(ITINERARY_SALES_DEFAULT.allActivitiesDiscountPct).toBe(10)
    expect(ITINERARY_SALES_DEFAULT.linkValidDays).toBe(7)
    expect(ITINERARY_SALES_DEFAULT.linkMaxUses).toBe(5)
    expect(ITINERARY_SALES_DEFAULT.usesPerPurchase).toBe(1)
    expect(ITINERARY_SALES_DEFAULT.options.withMap.badge.ar).toBe('الأكثر اختيارًا')
    expect(DRIVER_SETTINGS_DEFAULT.showOnBuyerPage).toBe(false)
    expect(DRIVER_SETTINGS_DEFAULT.noticeDays).toBe(4)
    expect(DRIVER_SETTINGS_DEFAULT.timezone).toBe('Asia/Makassar')
  })
  it('rejects out-of-range values', () => {
    expect(itinerarySalesSchema.safeParse({ allActivitiesDiscountPct: 95 }).success).toBe(false)
    expect(itinerarySalesSchema.safeParse({ mapBundlePriceMinor: -1 }).success).toBe(false)
    expect(driverSettingsSchema.safeParse({ noticeDays: 31 }).success).toBe(false)
    expect(driverSettingsSchema.safeParse({ cutoffTime: '25:00' }).success).toBe(false)
    expect(driverSettingsSchema.safeParse({ minDays: 3, maxDays: 2 }).success).toBe(false)
  })
  it('malformed stored rows fall back to the default', () => {
    expect(parseItinerarySales({ allActivitiesDiscountPct: 'x' })).toEqual(ITINERARY_SALES_DEFAULT)
    expect(parseDriverSettings(null)).toEqual(DRIVER_SETTINGS_DEFAULT)
  })
  it('finds the default price per duration', () => {
    const s = parseItinerarySales({ defaultPrices: [{ days: 8, priceMinor: 24900 }] })
    expect(defaultPriceFor(s, 8)).toBe(24900)
    expect(defaultPriceFor(s, 4)).toBeNull()
  })
})

describe('savings', () => {
  it('map bundle saving', () => {
    expect(mapBundleSaving(9900, 4900)).toEqual({
      fullMinor: 9900,
      bundleMinor: 4900,
      savingMinor: 5000,
    })
    // A bundle price above full never becomes a surcharge.
    expect(mapBundleSaving(4900, 9900).savingMinor).toBe(0)
  })
  it('percent off rounds to the minor unit and caps at 90', () => {
    expect(percentOffMinor(10000, 15)).toBe(1500)
    expect(percentOffMinor(333, 10)).toBe(33)
    expect(percentOffMinor(1000, 200)).toBe(900)
    expect(percentOffMinor(0, 10)).toBe(0)
  })
  it('activity line uses the package child price', () => {
    expect(
      activityLineMinor({
        activityId: 'a',
        adultPriceMinor: 10000,
        childPriceMinor: 4000,
        adults: 2,
        children: 1,
      }),
    ).toBe(24000)
  })
  const line = (activityId: string) => ({
    activityId,
    adultPriceMinor: 10000,
    childPriceMinor: 5000,
    adults: 1,
    children: 0,
  })
  it('bundle discount only for owners choosing every linked activity', () => {
    const all = bundleTotal({
      linkedActivityIds: ['a', 'b'],
      lines: [line('a'), line('b')],
      discountPct: 10,
      isOwner: true,
    })
    expect(all).toMatchObject({ subtotalMinor: 20000, discountMinor: 2000, totalMinor: 18000 })
    expect(
      bundleTotal({
        linkedActivityIds: ['a', 'b'],
        lines: [line('a'), line('b')],
        discountPct: 10,
        isOwner: false,
      }).discountMinor,
    ).toBe(0)
    const partial = bundleTotal({
      linkedActivityIds: ['a', 'b'],
      lines: [line('a')],
      discountPct: 10,
      isOwner: true,
    })
    expect(partial).toMatchObject({ discountMinor: 0, missing: 1, totalMinor: 10000 })
  })
  it('driver counts toward the discount only when the setting says so', () => {
    const base = {
      linkedActivityIds: ['a'],
      lines: [line('a')],
      discountPct: 10,
      isOwner: true,
      driverMinor: 20000,
    }
    expect(bundleTotal(base).discountMinor).toBe(1000)
    expect(bundleTotal({ ...base, discountIncludesDriver: true }).discountMinor).toBe(3000)
  })
  it('total saving adds map saving and bundle discount', () => {
    expect(totalSavingMinor({ mapSavingMinor: 5000, bundleDiscountMinor: 2000 })).toBe(7000)
    expect(totalSavingMinor({})).toBe(0)
  })
})

describe('driver window', () => {
  const settings = { ...DRIVER_SETTINGS_DEFAULT }
  // 2026-11-08 is a Sunday. 10:00 in Bali (UTC+8) = 02:00Z.
  const sundayMorning = new Date('2026-11-08T02:00:00Z')
  it('noticeDays=4 on Sunday → Thursday', () => {
    const w = driverWindow(settings, sundayMorning)
    expect(w.minStart).toBe('2026-11-12')
    expect(weekday(w.minStart)).toBe(4)
  })
  it('after the cutoff counts from tomorrow', () => {
    const evening = new Date('2026-11-08T11:00:00Z') // 19:00 Bali
    expect(driverWindow(settings, evening).minStart).toBe('2026-11-13')
  })
  it('0, 1, 2 days and the per-vehicle override', () => {
    expect(driverWindow({ ...settings, noticeDays: 0 }, sundayMorning).minStart).toBe('2026-11-08')
    expect(driverWindow({ ...settings, noticeDays: 1 }, sundayMorning).minStart).toBe('2026-11-09')
    expect(driverWindow({ ...settings, noticeDays: 2 }, sundayMorning).minStart).toBe('2026-11-10')
    expect(driverWindow(settings, sundayMorning, 7).minStart).toBe('2026-11-15')
  })
  it('day states', () => {
    const w = driverWindow({ ...settings, maxAdvanceDays: 10 }, sundayMorning)
    expect(dayState('2026-11-07', w, [])).toBe('past')
    expect(dayState('2026-11-10', w, [])).toBe('too_soon')
    expect(dayState('2026-11-14', w, ['2026-11-14'])).toBe('blocked')
    expect(dayState('2026-11-13', w, [])).toBe('open')
    expect(dayState(addDays('2026-11-08', 11), w, [])).toBe('too_far')
  })
})
