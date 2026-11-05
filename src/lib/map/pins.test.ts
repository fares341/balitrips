import { describe, expect, it } from 'vitest'

import { PIN_KINDS, PIN_LOOK, pinImageId, pinKindFor, pinLookFor } from './pins'

describe('category → pin', () => {
  it('maps every real map category key to its own kind', () => {
    const keys = [
      'sights',
      'activities',
      'beaches',
      'markets',
      'restaurants',
      'cafes',
      'waterfalls',
      'mosques',
      'malls',
      'hospital',
      'pharmacies',
      'spa',
      'kids-care',
      'beauty',
      'barbers',
    ]
    for (const key of keys) expect(pinKindFor(key)).toBe(key)
  })

  it('resolves singular / plural drift and falls back to the generic pin', () => {
    expect(pinKindFor('hospitals')).toBe('hospital')
    expect(pinKindFor('cafe')).toBe('cafes')
    expect(pinKindFor('Beach')).toBe('beaches')
    expect(pinKindFor('unknown-thing')).toBe('generic')
    expect(pinKindFor(null)).toBe('generic')
    expect(pinLookFor('')).toBe(PIN_LOOK.generic)
  })

  it('gives every kind a distinct colour and a glyph path', () => {
    const colors = PIN_KINDS.map((kind) => PIN_LOOK[kind].color.toLowerCase())
    expect(new Set(colors).size).toBe(colors.length)
    for (const kind of PIN_KINDS) {
      expect(PIN_LOOK[kind].color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(PIN_LOOK[kind].path).toMatch(/^M/)
    }
  })

  it('keeps white glyphs readable (contrast ≥ 3:1 on every fill)', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    for (const kind of PIN_KINDS)
      expect(1.05 / (lum(PIN_LOOK[kind].color) + 0.05)).toBeGreaterThanOrEqual(3)
  })

  it('names normal and selected images apart', () => {
    expect(pinImageId('beaches')).toBe('mx-pin-beaches')
    expect(pinImageId('beaches', true)).toBe('mx-on-beaches')
  })
})
