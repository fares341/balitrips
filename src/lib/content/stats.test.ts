import { describe, expect, it } from 'vitest'

import { MIN_REVIEWS_FOR_RATING, MIN_TRIPS_TO_SHOW, summarise } from './stats'

describe('trust stats', () => {
  it('hides a rating backed by too few reviews', () => {
    expect(summarise({ places: 9, ratingAverage: 5, ratingCount: 2, trips: 0 }).rating).toBeNull()
  })

  it('rounds a real rating to one decimal', () => {
    expect(
      summarise({
        places: 9,
        ratingAverage: 4.66,
        ratingCount: MIN_REVIEWS_FOR_RATING,
        trips: 0,
      }).rating,
    ).toBe(4.7)
  })

  it('shows trips only past the threshold, and places as counted', () => {
    const low = summarise({ places: 9, ratingAverage: null, ratingCount: 0, trips: 3 })
    expect(low).toEqual({ places: 9, rating: null, trips: null })
    const high = summarise({
      places: 120,
      ratingAverage: null,
      ratingCount: 0,
      trips: MIN_TRIPS_TO_SHOW,
    })
    expect(high.trips).toBe(MIN_TRIPS_TO_SHOW)
  })
})
