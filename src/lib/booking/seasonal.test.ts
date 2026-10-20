import { describe, expect, it } from 'vitest'

import { priceOn, seasonFor, type SeasonalPrice } from './seasonal'

const season = (over: Partial<SeasonalPrice>): SeasonalPrice => ({
  fromDate: '2026-06-01',
  toDate: '2026-09-30',
  priceMinor: 12000,
  childPriceMinor: null,
  weekdays: [],
  label: 'High season',
  ...over,
})

describe('seasonal prices', () => {
  const high = season({})
  const july = season({
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    priceMinor: 14000,
    label: 'July',
  })
  const julyWeekends = season({
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    priceMinor: 16000,
    weekdays: [0, 6],
    label: 'July weekends',
  })

  it('applies inside the range only, ends included', () => {
    expect(seasonFor([high], '2026-06-01')?.label).toBe('High season')
    expect(seasonFor([high], '2026-09-30')?.label).toBe('High season')
    expect(seasonFor([high], '2026-10-01')).toBeNull()
    expect(seasonFor([high], null)).toBeNull()
  })

  it('the most specific season wins where they overlap', () => {
    const all = [high, july, julyWeekends]
    // 2026-07-08 is a Wednesday, 2026-07-11 a Saturday.
    expect(seasonFor(all, '2026-07-08')?.label).toBe('July')
    expect(seasonFor(all, '2026-07-11')?.label).toBe('July weekends')
    expect(seasonFor(all, '2026-08-15')?.label).toBe('High season')
  })

  it('replaces the package price, and the child price only where one exists', () => {
    const withChild = season({ childPriceMinor: 6000 })
    expect(
      priceOn({ priceMinor: 10000, childPriceMinor: 5000 }, [withChild], '2026-07-01'),
    ).toMatchObject({
      priceMinor: 12000,
      childPriceMinor: 6000,
    })
    // Season without its own child price keeps the package's.
    expect(
      priceOn({ priceMinor: 10000, childPriceMinor: 5000 }, [high], '2026-07-01'),
    ).toMatchObject({
      priceMinor: 12000,
      childPriceMinor: 5000,
    })
    // A package without child pricing never gains one from a season.
    expect(
      priceOn({ priceMinor: 10000, childPriceMinor: null }, [withChild], '2026-07-01'),
    ).toMatchObject({
      childPriceMinor: null,
    })
    // Outside every season: the base.
    expect(
      priceOn({ priceMinor: 10000, childPriceMinor: null }, [high], '2026-12-01'),
    ).toMatchObject({
      priceMinor: 10000,
      season: null,
    })
  })
})
