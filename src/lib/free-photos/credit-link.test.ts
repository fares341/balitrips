import { describe, expect, it } from 'vitest'

import { creditLinkUrl } from './credit-link'

describe('creditLinkUrl', () => {
  it('adds the File: namespace to a bare Commons file page', () => {
    expect(creditLinkUrl('https://commons.wikimedia.org/wiki/Melasti%20Beach%20coast.jpg')).toBe(
      'https://commons.wikimedia.org/wiki/File:Melasti%20Beach%20coast.jpg',
    )
    expect(
      creditLinkUrl(
        'https://commons.wikimedia.org/wiki/Eastgate-Shopping-Centre-Gloucester-September-2024.jpg',
      ),
    ).toBe(
      'https://commons.wikimedia.org/wiki/File:Eastgate-Shopping-Centre-Gloucester-September-2024.jpg',
    )
  })

  it('leaves Commons links that already work', () => {
    const file = 'https://commons.wikimedia.org/wiki/File:Broken_Beach.jpg'
    expect(creditLinkUrl(file)).toBe(file)
    const encoded = 'https://commons.wikimedia.org/wiki/File%3ABroken_Beach.jpg'
    expect(creditLinkUrl(encoded)).toBe(encoded)
    const category = 'https://commons.wikimedia.org/wiki/Category:Bali'
    expect(creditLinkUrl(category)).toBe(category)
    const withParens = 'https://commons.wikimedia.org/wiki/File:Pura_(Bali).jpg'
    expect(creditLinkUrl(withParens)).toBe(withParens)
  })

  it('sends a Places photo API address to the place on Google Maps', () => {
    expect(
      creditLinkUrl(
        'https://places.googleapis.com/v1/places/ChIJ00VQ5yw_0i0RqTMwKgIAv68/photos/AV-0GLcTPetq/media?maxWidthPx=1600',
      ),
    ).toBe('https://www.google.com/maps/place/?q=place_id:ChIJ00VQ5yw_0i0RqTMwKgIAv68')
    expect(creditLinkUrl('https://places.googleapis.com/v1/other')).toBeNull()
  })

  it('drops punctuation swallowed from the credit line', () => {
    expect(creditLinkUrl('https://maps.google.com/?cid=10826737890241574133&g_mp=Cid)')).toBe(
      'https://maps.google.com/?cid=10826737890241574133&g_mp=Cid',
    )
    expect(creditLinkUrl('https://unsplash.com/photos/abc.')).toBe(
      'https://unsplash.com/photos/abc',
    )
  })

  it('links nothing it cannot parse', () => {
    expect(creditLinkUrl(null)).toBeNull()
    expect(creditLinkUrl('not a url')).toBeNull()
    expect(creditLinkUrl('javascript:alert(1)')).toBeNull()
  })
})
