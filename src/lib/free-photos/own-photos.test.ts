import { describe, expect, it } from 'vitest'

import { applyToPlace, SharedPhotos } from './own-photos'

const facts = new Map([
  ['mosque', { objectKey: 'media/mosque/orig.jpg', sha256: null }],
  ['mosque-copy', { objectKey: 'media/mosque-copy/orig.jpg', sha256: 'abc' }],
  ['mosque-copy2', { objectKey: 'media/mosque-copy2/orig.jpg', sha256: 'abc' }],
  ['unique', { objectKey: 'media/unique/orig.jpg', sha256: null }],
])
const rows = [
  { placeId: 'p1', heroId: 'mosque', galleryIds: [] },
  { placeId: 'p2', heroId: 'mosque', galleryIds: ['unique'] },
  { placeId: 'p3', heroId: 'mosque-copy', galleryIds: [] },
  { placeId: 'p4', heroId: 'mosque-copy2', galleryIds: [] },
  { placeId: 'p5', heroId: null, galleryIds: [] },
]
const shared = new SharedPhotos(rows, facts)

describe('SharedPhotos', () => {
  it('detects shared media rows and identical bytes', () => {
    expect(shared.isShared('mosque')).toBe(true)
    expect(shared.isShared('mosque-copy')).toBe(true)
    expect(shared.isShared('unique')).toBe(false)
  })
  it('knows which places have a unique photo', () => {
    expect(shared.hasUniquePhoto(rows[0]!)).toBe(false)
    expect(shared.hasUniquePhoto(rows[1]!)).toBe(true)
    expect(shared.hasUniquePhoto(rows[4]!)).toBe(false)
  })
  it('withoutShared keeps unique photos only', () => {
    expect(shared.withoutShared(rows[1]!)).toEqual({ heroId: null, galleryIds: ['unique'] })
  })
})

describe('applyToPlace', () => {
  const isShared = (id: string) => shared.isShared(id)
  it('main replaces a shared hero and drops it', () => {
    expect(applyToPlace({ heroId: 'mosque', galleryIds: [] }, 'new', 'main', isShared)).toEqual({
      heroId: 'new',
      galleryIds: [],
    })
  })
  it('main keeps an owner unique hero in the gallery', () => {
    expect(applyToPlace({ heroId: 'unique', galleryIds: ['g'] }, 'new', 'main', isShared)).toEqual({
      heroId: 'new',
      galleryIds: ['unique', 'g'],
    })
  })
  it('gallery appends, or becomes the hero when there is none', () => {
    expect(applyToPlace({ heroId: 'unique', galleryIds: [] }, 'new', 'gallery', isShared)).toEqual({
      heroId: 'unique',
      galleryIds: ['new'],
    })
    expect(applyToPlace({ heroId: null, galleryIds: [] }, 'new', 'gallery', isShared)).toEqual({
      heroId: 'new',
      galleryIds: [],
    })
  })
})
