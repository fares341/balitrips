import { describe, expect, it } from 'vitest'

import {
  cleanInput,
  dailyVerdict,
  MAX_INPUT_CHARS,
  SlidingWindowLimiter,
  trimHistory,
  usageDay,
} from './limits'
import { checkSameOrigin, isOwnerTokenShape, keyedHash, newOwnerToken } from './request'

function clock(start = 1_000_000) {
  let now = start
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

describe('SlidingWindowLimiter', () => {
  it('allows up to the limit in the window, then refuses with a retry delay', () => {
    const c = clock()
    const limiter = new SlidingWindowLimiter(3, 60_000, c.now)
    expect(limiter.hit('ip-a').ok).toBe(true)
    expect(limiter.hit('ip-a').ok).toBe(true)
    expect(limiter.hit('ip-a').ok).toBe(true)
    const refused = limiter.hit('ip-a')
    expect(refused.ok).toBe(false)
    expect(refused.retryAfterMs).toBe(60_000)
    c.advance(10_000)
    expect(limiter.hit('ip-a').retryAfterMs).toBe(50_000)
  })

  it('counts keys separately', () => {
    const limiter = new SlidingWindowLimiter(1, 60_000, clock().now)
    expect(limiter.hit('a').ok).toBe(true)
    expect(limiter.hit('b').ok).toBe(true)
    expect(limiter.hit('a').ok).toBe(false)
  })

  it('slides: old hits leave the window', () => {
    const c = clock()
    const limiter = new SlidingWindowLimiter(2, 60_000, c.now)
    limiter.hit('k')
    c.advance(30_000)
    limiter.hit('k')
    expect(limiter.hit('k').ok).toBe(false)
    c.advance(30_001)
    expect(limiter.remaining('k')).toBe(1)
    expect(limiter.hit('k').ok).toBe(true)
  })

  it('does not record refused hits (a flood does not extend the ban)', () => {
    const c = clock()
    const limiter = new SlidingWindowLimiter(1, 1000, c.now)
    limiter.hit('k')
    for (let i = 0; i < 50; i += 1) limiter.hit('k')
    c.advance(1001)
    expect(limiter.hit('k').ok).toBe(true)
  })

  it('bounds memory under a flood of new keys', () => {
    const c = clock()
    const limiter = new SlidingWindowLimiter(5, 60_000, c.now, 100)
    for (let i = 0; i < 1000; i += 1) limiter.hit(`ip-${i}`)
    expect(limiter.size).toBeLessThanOrEqual(100)
  })
})

describe('daily caps', () => {
  const caps = { messagesPerIp: 40, budgetUsd: 5 }

  it('passes under both caps', () => {
    expect(
      dailyVerdict({ ipMessages: 39, globalMessages: 500, globalCostMicros: 4_999_999 }, caps),
    ).toBe('ok')
  })

  it('stops one IP at its daily message cap', () => {
    expect(dailyVerdict({ ipMessages: 40, globalMessages: 40, globalCostMicros: 0 }, caps)).toBe(
      'ip_cap',
    )
  })

  it('stops everyone once the global budget is spent, and when it is 0', () => {
    expect(
      dailyVerdict({ ipMessages: 0, globalMessages: 9, globalCostMicros: 5_000_000 }, caps),
    ).toBe('budget')
    expect(
      dailyVerdict(
        { ipMessages: 0, globalMessages: 0, globalCostMicros: 0 },
        { ...caps, budgetUsd: 0 },
      ),
    ).toBe('budget')
  })

  it('keys the counters by UTC day', () => {
    expect(usageDay(new Date('2026-10-15T23:59:59Z'))).toBe('2026-10-15')
    expect(usageDay(new Date('2026-10-16T00:00:00Z'))).toBe('2026-10-16')
  })
})

describe('input and history limits', () => {
  it('refuses empty, non-string and over-long input; strips control characters', () => {
    expect(cleanInput('   ')).toBeNull()
    expect(cleanInput(42)).toBeNull()
    expect(cleanInput('a'.repeat(MAX_INPUT_CHARS + 1))).toBeNull()
    expect(cleanInput('a'.repeat(MAX_INPUT_CHARS))).toHaveLength(MAX_INPUT_CHARS)
    expect(cleanInput(' hi\u0000 there\u0007 ')).toBe('hi there')
    expect(cleanInput('line 1\nline 2')).toBe('line 1\nline 2')
  })

  it('keeps the last N turns and never starts on an assistant message', () => {
    const history = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      n: i,
    }))
    const trimmed = trimHistory(history, 16)
    expect(trimmed).toHaveLength(32)
    expect(trimmed[0]?.role).toBe('user')
    expect(trimmed[trimmed.length - 1]?.n).toBe(39)

    const odd = trimHistory([{ role: 'assistant' }, { role: 'user' }, { role: 'assistant' }], 16)
    expect(odd.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(trimHistory([{ role: 'assistant' }], 16)).toEqual([])
  })
})

describe('same-origin check (CSRF)', () => {
  const headers = (values: Record<string, string>) => new Headers(values)
  const SITE = 'https://balitrips.co'

  it('accepts a same-origin JSON POST', () => {
    expect(
      checkSameOrigin(
        'POST',
        headers({ origin: SITE, host: 'balitrips.co', 'content-type': 'application/json' }),
        SITE,
      ),
    ).toBe('ok')
  })

  it('refuses another origin, even with JSON', () => {
    expect(
      checkSameOrigin(
        'POST',
        headers({
          origin: 'https://evil.example',
          host: 'balitrips.co',
          'content-type': 'application/json',
        }),
        SITE,
      ),
    ).toBe('bad_origin')
  })

  it('refuses a form post (no preflight) even from this origin', () => {
    expect(
      checkSameOrigin(
        'POST',
        headers({
          origin: SITE,
          host: 'balitrips.co',
          'content-type': 'application/x-www-form-urlencoded',
        }),
        SITE,
      ),
    ).toBe('bad_content_type')
  })

  it('falls back to Sec-Fetch-Site when Origin is absent, and refuses when both are', () => {
    expect(
      checkSameOrigin(
        'POST',
        headers({ 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }),
        SITE,
      ),
    ).toBe('ok')
    expect(
      checkSameOrigin(
        'POST',
        headers({ 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }),
        SITE,
      ),
    ).toBe('bad_origin')
    expect(checkSameOrigin('POST', headers({ 'content-type': 'application/json' }), SITE)).toBe(
      'bad_origin',
    )
    expect(
      checkSameOrigin(
        'POST',
        headers({ origin: 'null', 'content-type': 'application/json' }),
        SITE,
      ),
    ).toBe('bad_origin')
  })

  it('accepts plain http on localhost (dev and CI)', () => {
    expect(
      checkSameOrigin(
        'POST',
        headers({
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
          'content-type': 'application/json',
        }),
        'http://localhost:3000',
      ),
    ).toBe('ok')
  })
})

describe('identity hashing', () => {
  it('hashes per purpose, deterministically, without the raw value', () => {
    const a = keyedHash('ip', '203.0.113.9')
    expect(a).toHaveLength(64)
    expect(a).toBe(keyedHash('ip', '203.0.113.9'))
    expect(a).not.toBe(keyedHash('owner', '203.0.113.9'))
    expect(a).not.toContain('203')
  })

  it('makes owner tokens of the expected shape', () => {
    const token = newOwnerToken()
    expect(isOwnerTokenShape(token)).toBe(true)
    expect(isOwnerTokenShape('short')).toBe(false)
    expect(isOwnerTokenShape(`${token};x`)).toBe(false)
  })
})
