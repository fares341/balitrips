import { describe, expect, it } from 'vitest'

import { sortPositions } from './order'

describe('sortPositions (packages drag order)', () => {
  it('follows the dragged order, 1-based, without gaps', () => {
    expect(sortPositions(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual([
      { id: 'c', sortOrder: 1 },
      { id: 'a', sortOrder: 2 },
      { id: 'b', sortOrder: 3 },
    ])
  })
  it('keeps packages missing from the list after, in their order; ignores unknown/duplicates', () => {
    expect(sortPositions(['a', 'b', 'c', 'd'], ['c', 'x', 'c', 'a']).map((r) => r.id)).toEqual([
      'c',
      'a',
      'b',
      'd',
    ])
  })
})
