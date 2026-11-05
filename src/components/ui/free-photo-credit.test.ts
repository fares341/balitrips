import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FreePhotoCreditView } from './free-photo-credit'

describe('free photo attribution', () => {
  it('renders «Photo: author · licence · source», each linked', () => {
    const html = renderToStaticMarkup(
      createElement(FreePhotoCreditView, {
        credit: {
          source: 'commons',
          author: 'Ana',
          authorUrl: 'https://commons.wikimedia.org/wiki/User:Ana',
          license: 'CC BY-SA 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg',
        },
        lang: 'ar',
      }),
    )
    expect(html).toContain('class="gp-credit"')
    expect(html).toContain('صورة: ')
    expect(html).toContain('>Ana</a>')
    expect(html).toContain('href="https://creativecommons.org/licenses/by-sa/4.0/"')
    expect(html).toContain('>Wikimedia Commons</a>')
  })
  it('credits Unsplash without links when none are known', () => {
    const html = renderToStaticMarkup(
      createElement(FreePhotoCreditView, {
        credit: {
          source: 'unsplash',
          author: null,
          authorUrl: null,
          license: 'Unsplash License',
          licenseUrl: null,
          sourceUrl: null,
        },
      }),
    )
    expect(html).toContain('Photo: Unknown author · Unsplash License · Unsplash')
  })
})
