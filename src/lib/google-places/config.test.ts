import { afterEach, describe, expect, it, vi } from 'vitest'

import { dailyCap, googleMaxPhotos, googlePhotosEnabled } from './config'

afterEach(() => vi.unstubAllEnvs())

describe('Google places config', () => {
  it('GOOGLE_PLACES_MAX_PHOTOS defaults to 1, configurable within 0..10', () => {
    vi.stubEnv('GOOGLE_PLACES_MAX_PHOTOS', '')
    expect(googleMaxPhotos()).toBe(1)
    vi.stubEnv('GOOGLE_PLACES_MAX_PHOTOS', '4')
    expect(googleMaxPhotos()).toBe(4)
    vi.stubEnv('GOOGLE_PLACES_MAX_PHOTOS', '0')
    expect(googleMaxPhotos()).toBe(0)
    vi.stubEnv('GOOGLE_PLACES_MAX_PHOTOS', '50')
    expect(googleMaxPhotos()).toBe(10)
    vi.stubEnv('GOOGLE_PLACES_MAX_PHOTOS', 'abc')
    expect(googleMaxPhotos()).toBe(1)
  })

  it('is off without a key, and the daily cap is configurable', () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', '')
    expect(googlePhotosEnabled()).toBe(false)
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'not-a-real-key')
    expect(googlePhotosEnabled()).toBe(true)
    vi.stubEnv('GOOGLE_PLACES_DAILY_CAP', '30')
    expect(dailyCap().billable).toBe(30)
  })
})
