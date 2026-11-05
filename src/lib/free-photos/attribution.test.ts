import { describe, expect, it } from 'vitest'

import { creditText, firstHref, mediaIdFromUrl, stripHtml, unsplashRef } from './attribution'

const ID = '7d2ccd38-ad60-52df-ae72-77d992f62c00'

describe('attribution', () => {
  it('builds «Photo: author · licence · source (url)»', () => {
    expect(
      creditText({
        source: 'commons',
        author: 'Jane Doe',
        authorUrl: null,
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg',
      }),
    ).toBe(
      'Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons (https://commons.wikimedia.org/wiki/File:X.jpg)',
    )
  })
  it('falls back to «Unknown author»', () => {
    expect(
      creditText({
        source: 'openverse',
        author: ' ',
        authorUrl: null,
        license: 'CC0',
        licenseUrl: null,
        sourceUrl: null,
      }),
    ).toBe('Photo: Unknown author · CC0 · Openverse')
  })
  it('reads Commons «Artist» HTML', () => {
    const html = '<a href="//commons.wikimedia.org/wiki/User:Jo" title="User:Jo">Jo &amp; Co</a>'
    expect(stripHtml(html)).toBe('Jo & Co')
    expect(firstHref(html)).toBe('https://commons.wikimedia.org/wiki/User:Jo')
    expect(firstHref('<a href="javascript:alert(1)">x</a>')).toBeNull()
  })
  it('adds Unsplash referral parameters', () => {
    expect(unsplashRef('https://unsplash.com/@jo')).toBe(
      'https://unsplash.com/@jo?utm_source=balitrips&utm_medium=referral',
    )
  })
  it('finds our media id in CDN rungs and tagged hotlinks', () => {
    expect(mediaIdFromUrl(`https://cdn.example/media/${ID}/1280.webp`)).toBe(ID)
    expect(mediaIdFromUrl(`/media/${ID}/320.webp`)).toBe(ID)
    expect(mediaIdFromUrl(`https://images.unsplash.com/photo-1?w=1080#m=${ID}`)).toBe(ID)
    expect(mediaIdFromUrl('/api/places/x/gphoto/0')).toBeNull()
    expect(mediaIdFromUrl(null)).toBeNull()
  })
})
