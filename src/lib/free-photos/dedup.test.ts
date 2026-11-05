import { describe, expect, it } from 'vitest'

import { PhotoRegistry } from './dedup'

describe('PhotoRegistry', () => {
  const reg = new PhotoRegistry([{ placeId: 'a', sha: 'f'.repeat(64), dhash: 'ffff0000ffff0000' }])

  it('finds an exact duplicate on another place', () => {
    expect(reg.conflict({ placeId: 'b', sha: 'f'.repeat(64), dhash: null })).toEqual({
      placeId: 'a',
      kind: 'exact',
    })
  })
  it('finds a near duplicate within a few bits', () => {
    expect(reg.conflict({ placeId: 'b', sha: null, dhash: 'ffff0000ffff0003' })).toEqual({
      placeId: 'a',
      kind: 'near',
    })
  })
  it('ignores different pictures and the same place', () => {
    expect(
      reg.conflict({ placeId: 'b', sha: '0'.repeat(64), dhash: '0000ffff0000ffff' }),
    ).toBeNull()
    expect(
      reg.conflict({ placeId: 'a', sha: 'f'.repeat(64), dhash: 'ffff0000ffff0000' }),
    ).toBeNull()
  })
  it('add registers new photos', () => {
    const r = new PhotoRegistry()
    r.add({ placeId: 'x', sha: '1'.repeat(64), dhash: null })
    expect(r.conflict({ placeId: 'y', sha: '1'.repeat(64), dhash: null })?.placeId).toBe('x')
  })
})
