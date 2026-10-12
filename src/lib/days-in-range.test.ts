import { describe, expect, it } from 'vitest'

import { daysInRange } from '@/lib/booking-rules'

/**
 * The pure half of capacity handling. The conditional-UPDATE reservation
 * needs a live Postgres to prove anything meaningful (the whole point is
 * what two concurrent transactions do), so that has an integration test
 * rather than a unit test.
 */
describe('daysInRange', () => {
  it('includes both endpoints', () => {
    expect(daysInRange('2026-08-12', '2026-08-14')).toEqual([
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
    ])
  })

  it('returns a single day for a same-day booking', () => {
    expect(daysInRange('2026-08-12', '2026-08-12')).toEqual(['2026-08-12'])
  })

  it('crosses a month boundary', () => {
    expect(daysInRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
  })

  it('crosses a year boundary', () => {
    expect(daysInRange('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
  })

  it('handles a leap day', () => {
    expect(daysInRange('2028-02-27', '2028-03-01')).toEqual([
      '2028-02-27',
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ])
  })

  it('does not skip or duplicate a day across a DST transition', () => {
    // Dates are plain calendar dates in Bali, which has no DST — but the
    // server might. Arithmetic must not care what zone the process runs in.
    const march = daysInRange('2026-03-28', '2026-03-30')
    expect(march).toEqual(['2026-03-28', '2026-03-29', '2026-03-30'])
    const october = daysInRange('2026-10-24', '2026-10-26')
    expect(october).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
  })

  it('clamps a reversed range to one day rather than looping forever', () => {
    expect(daysInRange('2026-08-14', '2026-08-12')).toEqual(['2026-08-14'])
  })

  it('produces a day count matching a long range', () => {
    const days = daysInRange('2026-01-01', '2026-12-31')
    expect(days).toHaveLength(365)
    expect(days.at(0)).toBe('2026-01-01')
    expect(days.at(-1)).toBe('2026-12-31')
    expect(new Set(days).size).toBe(365)
  })
})
