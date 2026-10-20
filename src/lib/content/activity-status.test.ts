import { describe, expect, it } from 'vitest'

import { activityStatus, activityVisibility, isPublicStatus } from './activity-status'

describe('activity status visibility', () => {
  it('published: everywhere and bookable', () => {
    expect(activityVisibility('published')).toEqual({
      page: true,
      listed: true,
      home: true,
      bookable: true,
    })
  })

  it('hidden: page and booking by link only, never listed or on the home page', () => {
    expect(activityVisibility('hidden')).toEqual({
      page: true,
      listed: false,
      home: false,
      bookable: true,
    })
  })

  it('unavailable: page and lists, but no booking and not on the home page', () => {
    expect(activityVisibility('unavailable')).toEqual({
      page: true,
      listed: true,
      home: false,
      bookable: false,
    })
  })

  it('draft and unknown values are closed', () => {
    for (const value of ['draft', 'archived', '', null, undefined]) {
      expect(activityVisibility(value)).toEqual({
        page: false,
        listed: false,
        home: false,
        bookable: false,
      })
    }
    expect(activityStatus('PUBLISHED')).toBe('draft')
  })

  it('only draft is non-public', () => {
    expect(isPublicStatus('draft')).toBe(false)
    expect(isPublicStatus('hidden')).toBe(true)
    expect(isPublicStatus('unavailable')).toBe(true)
  })
})
