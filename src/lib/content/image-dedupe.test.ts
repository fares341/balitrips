import { describe, expect, it } from 'vitest'

import { dedupeImages, imageFileKey } from './image-dedupe'

describe('image dedupe', () => {
  it('reduces a URL to its picture', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    expect(imageFileKey(`https://cdn.example.com/media/${id}/1280.webp?v=2`)).toBe(`media:${id}`)
    expect(imageFileKey(`/media/${id}/640.avif`)).toBe(`media:${id}`)
    expect(imageFileKey('https://cdn.example.com/uploads/Swing.JPG?x=1')).toBe('/uploads/swing.jpg')
    expect(imageFileKey('/uploads/photo-10.jpg')).not.toBe(imageFileKey('/uploads/photo-11.jpg'))
  })

  it('keeps the first of each id and of each file, in order', () => {
    const images = [
      { id: '1', url: '/m/a.jpg' },
      { id: '2', url: '/m/b.jpg' },
      { id: '1', url: '/m/a.jpg' },
      { id: '3', url: 'https://cdn.example.com/m/a.jpg?v=1' },
      { id: '4', url: '/m/c.jpg' },
    ]
    expect(dedupeImages(images).map((image) => image.id)).toEqual(['1', '2', '4'])
  })
})
