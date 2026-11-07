import { describe, expect, it } from 'vitest'

import { localRedirect } from './local-redirect'

describe('localRedirect', () => {
  it('sends a relative Location (no server bind address)', () => {
    const res = localRedirect('/en/plans', {
      status: 303,
      headers: { 'Cache-Control': 'no-store' },
    })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/en/plans')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
  it('defaults to 307 and accepts a bare status', () => {
    expect(localRedirect('/a').status).toBe(307)
    expect(localRedirect('/a', 303).status).toBe(303)
  })
  it('refuses another origin', () => {
    expect(() => localRedirect('//evil.example')).toThrow()
    expect(() => localRedirect('https://evil.example')).toThrow()
  })
})
