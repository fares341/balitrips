import { afterEach, describe, expect, it, vi } from 'vitest'

import { dailyCap, googlePhotosEnabled, photoRedirectMaxAge } from './config'

afterEach(() => vi.unstubAllEnvs())

describe('Google places config', () => {
  it('is off without a key, and the daily cap is configurable', () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', '')
    expect(googlePhotosEnabled()).toBe(false)
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'not-a-real-key')
    expect(googlePhotosEnabled()).toBe(true)
    vi.stubEnv('GOOGLE_PLACES_DAILY_CAP', '30')
    expect(dailyCap().billable).toBe(30)
  })

  it('keeps the browser cache private for 300 s by default', () => {
    vi.stubEnv('GOOGLE_PHOTO_REDIRECT_MAX_AGE', '')
    expect(photoRedirectMaxAge()).toBe(300)
  })
})
