import { describe, expect, it } from 'vitest'

import { looksLikeEmail, normalizePhone } from './phone'

describe('normalizePhone', () => {
  it('normalises international formats to +digits', () => {
    expect(normalizePhone('+971 50 123 4567')).toBe('+971501234567')
    expect(normalizePhone('00971-50-123-4567')).toBe('+971501234567')
    expect(normalizePhone('+62 (812) 3456.789')).toBe('+628123456789')
  })
  it('refuses local numbers, junk and impossible lengths', () => {
    expect(normalizePhone('0501234567')).toBeNull()
    expect(normalizePhone('call me')).toBeNull()
    expect(normalizePhone('+12')).toBeNull()
    expect(normalizePhone('+0501234567')).toBeNull()
    expect(normalizePhone('+1234567890123456')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
  it('tells an email from a phone', () => {
    expect(looksLikeEmail('a@b.co')).toBe(true)
    expect(looksLikeEmail('+97150')).toBe(false)
  })
})

describe('phone-only accounts', async () => {
  const { isPlaceholderEmail, placeholderEmailFor } = await import('./phone')

  it('derives a stable, undeliverable address from the number', () => {
    expect(placeholderEmailFor('+6281234567890')).toBe('p6281234567890@phone.balitrips.invalid')
    expect(isPlaceholderEmail('p6281234567890@phone.balitrips.invalid')).toBe(true)
    expect(isPlaceholderEmail('someone@example.com')).toBe(false)
    expect(isPlaceholderEmail(null)).toBe(false)
  })
})
