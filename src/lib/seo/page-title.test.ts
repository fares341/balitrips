import { describe, expect, it } from 'vitest'

import { stripBrandSuffix } from './page-title'

describe('stripBrandSuffix', () => {
  it('drops a trailing brand after common separators', () => {
    expect(stripBrandSuffix('Ubud swing | Bali Trips')).toBe('Ubud swing')
    expect(stripBrandSuffix('أرجوحة أوبود · Bali Trips')).toBe('أرجوحة أوبود')
    expect(stripBrandSuffix('Ubud — bali trips')).toBe('Ubud')
    expect(stripBrandSuffix('أوبود | بالي تريبس')).toBe('أوبود')
  })
  it('keeps titles without the suffix, and a bare brand', () => {
    expect(stripBrandSuffix('Bali Trips — Bali, as you have never explored it')).toBe(
      'Bali Trips — Bali, as you have never explored it',
    )
    expect(stripBrandSuffix('Bali Trips')).toBe('Bali Trips')
  })
})
