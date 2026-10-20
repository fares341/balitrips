import { describe, expect, it } from 'vitest'

import { decideFixedWindow, MemoryWindowStore, RATE_RULES, rateKey } from './rules'

const RULE = { window: 60, max: 3 }
const T0 = 1_800_000_000_000

describe('fixed-window limiter', () => {
  it('allows up to max requests per window, then refuses with a retry time', () => {
    const store = new MemoryWindowStore()
    const results = [0, 1, 2, 3, 4].map((offset) => store.consume('k', RULE, T0 + offset * 1000))
    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false, false])
    expect(results[3]?.retryAfter).toBe(57)
    expect(results[4]?.retryAfter).toBe(56)
  })

  it('counts refused requests too, so hammering does not reopen the door early', () => {
    const store = new MemoryWindowStore()
    for (let i = 0; i < 10; i += 1) store.consume('k', RULE, T0 + i)
    expect(store.consume('k', RULE, T0 + 59_000).allowed).toBe(false)
  })

  it('starts a fresh window once the old one has ended', () => {
    const store = new MemoryWindowStore()
    for (let i = 0; i < 4; i += 1) store.consume('k', RULE, T0)
    const later = store.consume('k', RULE, T0 + 60_000)
    expect(later).toMatchObject({ allowed: true, next: { count: 1, expiresAt: T0 + 120_000 } })
  })

  it('keeps separate keys separate', () => {
    const store = new MemoryWindowStore()
    for (let i = 0; i < 3; i += 1) store.consume('a', RULE, T0)
    expect(store.consume('a', RULE, T0).allowed).toBe(false)
    expect(store.consume('b', RULE, T0).allowed).toBe(true)
  })

  it('treats a missing state as a new window', () => {
    expect(decideFixedWindow(null, RULE, T0)).toEqual({
      allowed: true,
      retryAfter: 0,
      next: { count: 1, expiresAt: T0 + 60_000 },
    })
  })

  it('has sensible limits for every protected action', () => {
    for (const rule of Object.values(RATE_RULES)) {
      expect(rule.max).toBeGreaterThan(0)
      expect(rule.window).toBeGreaterThanOrEqual(60)
    }
    expect(RATE_RULES.contact.max).toBeLessThanOrEqual(10)
    expect(rateKey('contact', 'ip:1'.repeat(200)).length).toBe(255)
  })
})
