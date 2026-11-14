import { describe, expect, it } from 'vitest'

import { placeLine } from './area'

const ubud = { label: { ar: 'أوبود', en: 'Ubud' }, key: 'ubud' }

describe('placeLine', () => {
  it('keeps an Arabic area on the Arabic page', () => {
    expect(placeLine({ ar: 'أوبود – بالي', en: 'Ubud – Bali' }, ubud, 'ar')).toBe('أوبود – بالي')
  })
  it('uses the region instead of Latin text on the Arabic page', () => {
    expect(placeLine({ ar: 'Bali hot air balloon', en: 'Bali hot air balloon' }, ubud, 'ar')).toBe(
      'أوبود',
    )
    expect(placeLine({ ar: '', en: 'Mount Batur, Kintamani' }, ubud, 'ar')).toBe('أوبود')
    expect(placeLine({ ar: 'Rice farm', en: 'Rice farm' }, null, 'ar')).toBeNull()
  })
  it('leaves English and Indonesian alone', () => {
    expect(placeLine({ ar: 'أوبود', en: 'Ubud – Bali' }, ubud, 'id')).toBe('Ubud – Bali')
    expect(placeLine(null, ubud, 'en')).toBe('Ubud')
  })
})
