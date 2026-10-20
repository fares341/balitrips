import { describe, expect, it } from 'vitest'

import { csvEscape, reportCsv, reportHtml, UTF8_BOM, type ExportLabels } from './export'
import { kpiChange } from './format'
import {
  averageOrderValue,
  bookingGroup,
  confirmationStats,
  countBookingGroups,
  funnel,
  lifetimeValue,
  margin,
  newVsReturning,
  rate,
  sumByCurrency,
  topWithOther,
} from './metrics'
import { alignSeries, bucketKeys, pctChange, resolvePeriod } from './period'
import { scheduleDue, schedulePeriod } from './schedule-time'
import { lineGeometry, niceTicks } from './svg'
import type { Kpi, ReportResult } from './types'

// 2026-10-20 10:30 in Bali (02:30 UTC).
const NOW = new Date('2026-10-20T02:30:00Z')

describe('periods (Bali days)', () => {
  it('today and yesterday are Bali calendar days', () => {
    const today = resolvePeriod({ preset: 'today' }, NOW)
    expect(today.start.toISOString()).toBe('2026-10-19T16:00:00.000Z')
    expect(today.end.toISOString()).toBe('2026-10-20T16:00:00.000Z')
    expect(today.fromDate).toBe('2026-10-20')
    expect(today.bucket).toBe('hour')
    expect(today.prevStart.toISOString()).toBe('2026-10-18T16:00:00.000Z')

    const yesterday = resolvePeriod({ preset: 'yesterday' }, NOW)
    expect(yesterday.fromDate).toBe('2026-10-19')
    expect(yesterday.toDate).toBe('2026-10-19')
    expect(yesterday.prevFromDate).toBe('2026-10-18')
  })

  it('7 and 30 days include today and compare with the stretch just before', () => {
    const week = resolvePeriod({ preset: '7d' }, NOW)
    expect(week.fromDate).toBe('2026-10-14')
    expect(week.toDate).toBe('2026-10-20')
    expect(week.prevFromDate).toBe('2026-10-07')
    expect(week.prevToDate).toBe('2026-10-13')
    expect(bucketKeys(week.start, week.end, week.bucket)).toHaveLength(7)
  })

  it('this month compares with the same days of last month', () => {
    const month = resolvePeriod({ preset: 'month' }, NOW)
    expect(month.fromDate).toBe('2026-10-01')
    expect(month.toDate).toBe('2026-10-20')
    expect(month.prevFromDate).toBe('2026-09-01')
    expect(month.prevToDate).toBe('2026-09-20')
  })

  it('custom ranges are ordered, and a broken one falls back to 30 days', () => {
    const custom = resolvePeriod({ preset: 'custom', from: '2026-10-10', to: '2026-10-01' }, NOW)
    expect(custom.fromDate).toBe('2026-10-01')
    expect(custom.toDate).toBe('2026-10-10')
    expect(custom.prevToDate).toBe('2026-09-30')
    expect(resolvePeriod({ preset: 'custom', from: 'x', to: '' }, NOW).preset).toBe('30d')
    expect(resolvePeriod({ preset: 'nonsense' }, NOW).preset).toBe('30d')
  })
})

describe('period comparison math', () => {
  it('computes the percentage change', () => {
    expect(pctChange(150, 100)).toBe(50)
    expect(pctChange(50, 100)).toBe(-50)
    expect(pctChange(0, 0)).toBe(0)
    // Nothing to compare with: "new", never an invented +100%.
    expect(pctChange(10, 0)).toBeNull()
    expect(pctChange(-50, -100)).toBe(50)
  })

  it('aligns series by bucket, filling gaps with zero', () => {
    expect(alignSeries(['a', 'b', 'c'], new Map([['b', 5]]))).toEqual([0, 5, 0])
  })

  it('flags good and bad changes, honouring "lower is better"', () => {
    const kpi = (value: number, prev: number, lowerIsBetter = false): Kpi => ({
      id: 'x',
      label: 'x',
      definition: 'x',
      value: { kind: 'count', value, prev },
      ...(lowerIsBetter ? { lowerIsBetter } : {}),
    })
    expect(kpiChange(kpi(12, 10))).toMatchObject({ pct: 20, direction: 'up', good: true })
    expect(kpiChange(kpi(12, 10, true))).toMatchObject({ direction: 'up', good: false })
    expect(kpiChange(kpi(5, 5))).toMatchObject({ direction: 'flat', good: null })
    const money: Kpi = {
      id: 'm',
      label: 'm',
      definition: 'm',
      value: {
        kind: 'money',
        money: [{ currency: 'USD', minor: 300 }],
        prev: [{ currency: 'USD', minor: 200 }],
      },
    }
    expect(kpiChange(money).pct).toBe(50)
  })
})

describe('report metrics (fixtures)', () => {
  it('rates and sums by currency, never across', () => {
    expect(rate(1, 4)).toBe(25)
    expect(rate(1, 0)).toBeNull()
    expect(
      sumByCurrency([
        { currency: 'USD', minor: 100 },
        { currency: 'IDR', minor: 5_000_000 },
        { currency: 'USD', minor: 50 },
      ]),
    ).toEqual([
      { currency: 'IDR', minor: 5_000_000 },
      { currency: 'USD', minor: 150 },
    ])
  })

  it('average order value per currency', () => {
    expect(
      averageOrderValue([
        { currency: 'USD', totalMinor: 100 },
        { currency: 'USD', totalMinor: 300 },
        { currency: 'SAR', totalMinor: 900 },
      ]),
    ).toEqual([
      { currency: 'SAR', minor: 900 },
      { currency: 'USD', minor: 200 },
    ])
  })

  it('new vs returning customers', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    expect(
      newVsReturning(
        [
          { customer: 'a', firstPaidAt: new Date('2026-10-05'), paidInPeriod: true },
          { customer: 'b', firstPaidAt: new Date('2026-08-01'), paidInPeriod: true },
          { customer: 'c', firstPaidAt: new Date('2026-08-01'), paidInPeriod: false },
        ],
        start,
      ),
    ).toEqual({ newCount: 1, returningCount: 1 })
  })

  it('lifetime value nets refunds and averages per customer', () => {
    expect(
      lifetimeValue([
        { customer: 'a', currency: 'USD', paidMinor: 1000, refundedMinor: 200 },
        { customer: 'b', currency: 'USD', paidMinor: 400, refundedMinor: 0 },
      ]),
    ).toEqual([{ currency: 'USD', minor: 600 }])
  })

  it('supplier confirmation rate and average time', () => {
    const paid = new Date('2026-10-01T00:00:00Z')
    const stats = confirmationStats([
      { paidAt: paid, confirmedAt: new Date('2026-10-01T02:00:00Z') },
      { paidAt: paid, confirmedAt: new Date('2026-10-01T06:00:00Z') },
      { paidAt: paid, confirmedAt: null },
      { paidAt: paid, confirmedAt: null },
    ])
    expect(stats).toEqual({ total: 4, confirmed: 2, rate: 50, avgHours: 4 })
  })

  it('groups booking statuses', () => {
    expect(bookingGroup('completed')).toBe('confirmed')
    expect(bookingGroup('pending_supplier')).toBe('pending')
    expect(bookingGroup('failed')).toBe('cancelled')
    expect(countBookingGroups(['confirmed', 'created', 'refunded', 'in_progress'])).toEqual({
      confirmed: 2,
      pending: 1,
      cancelled: 1,
    })
  })

  it('margin skips costs in another currency (and says how many)', () => {
    const result = margin([
      { currency: 'USD', revenueMinor: 1000, costMinor: 700, costCurrency: 'USD' },
      { currency: 'USD', revenueMinor: 500, costMinor: 300_000, costCurrency: 'IDR' },
      { currency: 'USD', revenueMinor: 200, costMinor: null, costCurrency: null },
    ])
    expect(result.margin).toEqual([{ currency: 'USD', minor: 300 }])
    expect(result.cost).toEqual([{ currency: 'USD', minor: 700 }])
    expect(result.withoutCost).toBe(2)
  })

  it('funnels count visitors who did both steps', () => {
    expect(
      funnel([
        { visitor: 'v1', step: 'a' },
        { visitor: 'v2', step: 'a' },
        { visitor: 'v1', step: 'b' },
        { visitor: 'v3', step: 'b' },
      ]),
    ).toEqual({ a: 2, b: 1, rate: 50 })
  })

  it('folds the tail into "other"', () => {
    const rows = [5, 1, 9, 3].map((value) => ({ value, label: String(value) }))
    const out = topWithOther(rows, 2, (rest) => ({
      value: rest.reduce((s, r) => s + r.value, 0),
      label: 'other',
    }))
    expect(out.map((r) => r.label)).toEqual(['9', '5', 'other'])
    expect(out[2]?.value).toBe(4)
  })
})

describe('chart geometry', () => {
  it('rounds the scale and mirrors time for Arabic', () => {
    expect(niceTicks(87)).toEqual([0, 25, 50, 75, 100])
    const ltr = lineGeometry({ labels: ['a', 'b'], current: [0, 10], previous: null, rtl: false })
    const rtl = lineGeometry({ labels: ['a', 'b'], current: [0, 10], previous: null, rtl: true })
    expect(ltr.current[0]!.x).toBeLessThan(ltr.current[1]!.x)
    expect(rtl.current[0]!.x).toBeGreaterThan(rtl.current[1]!.x)
  })
})

const LABELS: ExportLabels = {
  metric: 'Metric',
  value: 'Value',
  previous: 'Previous',
  change: 'Change',
  definition: 'Definition',
  period: 'Period',
  comparedWith: 'Compared with',
  newLabel: 'new',
  points: 'pts',
  hours: 'h',
  generated: 'Generated',
}

const RESULT: ReportResult = {
  id: 'test',
  title: 'المال',
  description: '',
  kpis: [
    {
      id: 'v',
      label: 'قيمة الحجوزات',
      definition: 'تعريف',
      value: { kind: 'money', money: [{ currency: 'USD', minor: 12345 }], prev: [] },
    },
  ],
  blocks: [
    {
      kind: 'table',
      id: 't',
      title: 'جدول',
      columns: [{ key: 'name', label: 'الاسم' }],
      rows: [{ name: { text: '=SUM(A1)', raw: '=SUM(A1)' } }],
      empty: '',
    },
  ],
  notes: [],
}

describe('exports', () => {
  it('CSV starts with the UTF-8 BOM so Excel reads Arabic', () => {
    const csv = reportCsv(RESULT, {
      period: '1–7 Oct',
      compared: null,
      intl: 'en-GB',
      labels: LABELS,
    })
    expect(csv.startsWith(UTF8_BOM)).toBe(true)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"قيمة الحجوزات"')
  })

  it('neutralises spreadsheet formulas and quotes', () => {
    expect(csvEscape('=SUM(A1)')).toBe(`"'=SUM(A1)"`)
    expect(csvEscape('a "b"')).toBe('"a ""b"""')
    const csv = reportCsv(RESULT, { period: 'p', compared: null, intl: 'en-GB', labels: LABELS })
    expect(csv).not.toContain('"=SUM')
  })

  it('PDF HTML is self-contained and right-to-left for Arabic', () => {
    const html = reportHtml(RESULT, {
      period: 'p',
      compared: null,
      intl: 'ar-u-nu-latn',
      dir: 'rtl',
      lang: 'ar',
      brand: 'Bali Trips',
      generatedAt: 'now',
      labels: LABELS,
    })
    expect(html).toContain('dir="rtl"')
    expect(html).not.toMatch(/<(link|script)\b/)
    expect(html).not.toMatch(/src="https?:/)
  })
})

describe('scheduled emails', () => {
  it('sends daily after 07:00 Bali, once a day', () => {
    const before7 = new Date('2026-10-20T22:30:00Z') // 06:30 Bali on the 21st
    const after7 = new Date('2026-10-20T23:30:00Z') // 07:30 Bali on the 21st
    expect(scheduleDue('daily', null, before7)).toBe(false)
    expect(scheduleDue('daily', null, after7)).toBe(true)
    expect(scheduleDue('daily', new Date('2026-10-20T23:05:00Z'), after7)).toBe(false)
    expect(scheduleDue('daily', new Date('2026-10-19T23:05:00Z'), after7)).toBe(true)
  })

  it('sends weekly on Monday, covering the last 7 full days', () => {
    const monday = new Date('2026-10-19T01:00:00Z') // Monday 09:00 Bali
    const tuesday = new Date('2026-10-20T01:00:00Z')
    expect(scheduleDue('weekly', null, monday)).toBe(true)
    expect(scheduleDue('weekly', null, tuesday)).toBe(false)
    expect(schedulePeriod('weekly', monday)).toEqual({
      period: 'custom',
      from: '2026-10-12',
      to: '2026-10-18',
    })
    expect(schedulePeriod('daily', monday)).toEqual({ period: 'yesterday' })
  })
})
