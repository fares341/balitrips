import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { gphotoUrl } from '@/lib/google-places/photo-urls'

import { creditLabel, GooglePhotoCredit, GooglePhotoCreditView } from './google-photo-credit'
import { Photo } from './photo'
import { SafeImg } from './safe-img'

describe('Google photo attribution', () => {
  it('renders «Photo: <author link> · Google Maps link»', () => {
    const html = renderToStaticMarkup(
      createElement(GooglePhotoCreditView, {
        photo: {
          authors: [{ name: 'Made W.', uri: 'https://maps.google.com/maps/contrib/1' }],
          mapsUri: 'https://www.google.com/maps/photo/1',
        },
        lang: 'en',
      }),
    )
    expect(html).toContain('Photo: ')
    expect(html).toContain(
      '<a href="https://maps.google.com/maps/contrib/1" target="_blank" rel="noopener noreferrer nofollow">Made W.</a>',
    )
    expect(html).toContain(' · <a href="https://www.google.com/maps/photo/1"')
    expect(html).toContain('>Google Maps</a>')
  })

  it('always shows the Google attribution, even with no author', () => {
    const html = renderToStaticMarkup(
      createElement(GooglePhotoCreditView, { photo: null, lang: 'ar' }),
    )
    expect(html).toContain('صورة: ')
    expect(html).toContain('Google Maps')
  })

  it('compact credit on map cards: «© <author> · Google Maps»', () => {
    const html = renderToStaticMarkup(
      createElement(GooglePhotoCreditView, {
        photo: {
          authors: [{ name: 'Made W.', uri: null }],
          mapsUri: 'https://www.google.com/maps/photo/1',
        },
        compact: true,
      }),
    )
    expect(html).toContain('class="gp-credit is-compact"')
    expect(html.replace(/<[^>]+>/g, '')).toBe('© Made W. · Google Maps')
    expect(html).toContain('>Google Maps</a>')
    expect(html).not.toContain('Photo:')
  })

  it('a deferred card photo renders no src until it is near the viewport', () => {
    const html = renderToStaticMarkup(
      createElement(SafeImg, {
        src: gphotoUrl('kuta', 0),
        deferGoogle: true,
        className: 'mx3-thumb',
      }),
    )
    expect(html).toContain('<img')
    expect(html).not.toContain('src=')
    // Our own photos are never deferred.
    const own = renderToStaticMarkup(
      createElement(SafeImg, { src: '/media/a/320.webp', deferGoogle: true }),
    )
    expect(own).toContain('src="/media/a/320.webp"')
  })

  it('labels per language', () => {
    expect(creditLabel('id')).toBe('Foto')
    expect(creditLabel('ar')).toBe('صورة')
    expect(creditLabel('en-GB')).toBe('Photo')
    expect(creditLabel('fr')).toBe('Photo')
  })

  it('is mounted next to Google photos only', () => {
    // The credit renders after mount (live data), so server HTML carries none;
    // what matters here is that our own photos are untouched.
    expect(
      renderToStaticMarkup(createElement(GooglePhotoCredit, { src: '/media/a/1280.webp' })),
    ).toBe('')
    const own = renderToStaticMarkup(createElement(Photo, { src: '/media/a/1280.webp', alt: '' }))
    const google = renderToStaticMarkup(
      createElement(Photo, { src: gphotoUrl('kuta', 0), alt: '' }),
    )
    expect(own).toContain('<img')
    expect(google).toContain('src="/api/places/kuta/gphoto/0"')
    const safe = renderToStaticMarkup(createElement(SafeImg, { src: gphotoUrl('kuta', 0) }))
    expect(safe).toContain('/api/places/kuta/gphoto/0')
  })
})
