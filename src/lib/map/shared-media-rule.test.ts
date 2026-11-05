import { describe, expect, it } from 'vitest'

import { SHARED_MIN, unlessShared, widelySharedIds } from './shared-media-rule'

describe('widely shared media (3+ places)', () => {
  const rows = [
    { placeId: 'm1', heroId: 'mosque', galleryIds: [] },
    { placeId: 'm2', heroId: 'mosque', galleryIds: null },
    { placeId: 'm3', heroId: null, galleryIds: ['mosque'] },
    { placeId: 'b1', heroId: 'beach', galleryIds: ['own-b1'] },
    { placeId: 'b2', heroId: 'beach', galleryIds: [] },
    // the same media twice on one place counts once
    { placeId: 'x', heroId: 'twice', galleryIds: ['twice', 'twice', 7] },
  ]

  it('flags media on 3 or more places (hero or gallery)', () => {
    expect(SHARED_MIN).toBe(3)
    expect([...widelySharedIds(rows)]).toEqual(['mosque'])
  })

  it('two places sharing a photo are not enough', () => {
    expect(widelySharedIds(rows).has('beach')).toBe(false)
    expect(widelySharedIds(rows).has('twice')).toBe(false)
  })

  it('unlessShared hides the placeholder and keeps unique photos', () => {
    const shared = widelySharedIds(rows)
    expect(unlessShared({ id: 'mosque' }, shared)).toBeNull()
    expect(unlessShared({ id: 'own-b1' }, shared)).toEqual({ id: 'own-b1' })
    expect(unlessShared(null, shared)).toBeNull()
  })
})
