import { describe, expect, it } from 'vitest'

import { resolveChildAges } from './child-ages'

describe('resolveChildAges', () => {
  it('defaults to 3–11 when no band is set', () => {
    expect(resolveChildAges(null, null)).toEqual({ min: 3, max: 11 })
  })
  it('keeps a per-activity override', () => {
    expect(resolveChildAges(4, 12)).toEqual({ min: 4, max: 12 })
  })
  it('fills the missing end from the defaults', () => {
    expect(resolveChildAges(null, 9)).toEqual({ min: 3, max: 9 })
    expect(resolveChildAges(2, null)).toEqual({ min: 2, max: 11 })
  })
  it('ignores an inverted band', () => {
    expect(resolveChildAges(10, 5)).toEqual({ min: 3, max: 11 })
  })
})
