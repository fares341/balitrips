import { describe, expect, it } from 'vitest'

import { areaName, areasLine, nightsLabel, normaliseAreas } from './areas'
import { publicAreasLine } from './public-dto'

describe('itinerary areas', () => {
  it('cleans stored values', () => {
    expect(normaliseAreas(null)).toEqual({ showNights: false, items: [] })
    expect(
      normaliseAreas({
        showNights: true,
        items: [
          { key: 'Ubud', nights: '3' },
          { key: 'ubud', nights: 2 },
          { key: 'bad key!', nights: 1 },
          { key: 'uluwatu', nights: 0 },
          'x',
        ],
      }),
    ).toEqual({
      showNights: true,
      items: [
        { key: 'ubud', nights: 3 },
        { key: 'uluwatu', nights: null },
      ],
    })
  })

  it('names areas from the database label, then the map label, then the key', () => {
    const names = new Map([['seminyak', { ar: 'سمينياك', en: 'Seminyak' }]])
    expect(areaName('seminyak', 'ar', names)).toBe('سمينياك')
    expect(areaName('ubud', 'ar')).toBe('أوبود')
    expect(areaName('nowhere', 'en')).toBe('nowhere')
  })

  it('shows names only by default and nights when turned on', () => {
    const items = [
      { key: 'seminyak', nights: 4 },
      { key: 'ubud', nights: 4 },
      { key: 'uluwatu', nights: 2 },
    ]
    expect(areasLine({ showNights: false, items }, 'ar')).toBe('سمينياك · أوبود · أولواتو')
    expect(areasLine({ showNights: true, items }, 'ar')).toBe(
      'سمينياك 4 ليالٍ · أوبود 4 ليالٍ · أولواتو ليلتان',
    )
    expect(areasLine({ showNights: true, items }, 'en')).toBe(
      'Seminyak 4 nights · Ubud 4 nights · Uluwatu 2 nights',
    )
    expect(nightsLabel(1, 'id')).toBe('1 malam')
  })

  it('renders the public DTO line', () => {
    expect(
      publicAreasLine(
        [
          { key: 'ubud', name: { ar: 'أوبود', en: 'Ubud' }, nights: null },
          { key: 'seminyak', name: { ar: 'سمينياك', en: 'Seminyak' }, nights: 3 },
        ],
        'ar',
      ),
    ).toBe('أوبود · سمينياك 3 ليالٍ')
  })
})
