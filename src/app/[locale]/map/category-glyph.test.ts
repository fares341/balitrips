import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PIN_LOOK } from '@/lib/map/pins'

import { CategoryGlyph } from './category-glyph'
import { PlaceThumb } from './place-thumb'

describe('category glyph fallback', () => {
  it('draws the mosque glyph on the mosque colour', () => {
    const html = renderToStaticMarkup(createElement(CategoryGlyph, { categoryKey: 'mosques' }))
    expect(html).toContain(`--c:${PIN_LOOK.mosques.color}`)
    expect(html).toContain(`d="${PIN_LOOK.mosques.path}"`)
    expect(html).toContain('class="cat-glyph"')
  })

  it('a place with no (unique) photo gets the glyph, labelled, not an empty box', () => {
    const html = renderToStaticMarkup(
      createElement(PlaceThumb, {
        src: null,
        categoryKey: 'mosques',
        alt: 'No photo yet',
        className: 'pl-hero',
      }),
    )
    expect(html).toContain('cat-glyph pl-hero pl-ph')
    expect(html).toContain('aria-label="No photo yet"')
    expect(html).toContain(PIN_LOOK.mosques.path)
  })

  it('an owner colour overrides the pin colour', () => {
    const html = renderToStaticMarkup(
      createElement(CategoryGlyph, { categoryKey: 'mosques', color: '#123456' }),
    )
    expect(html).toContain('--c:#123456')
  })
})
