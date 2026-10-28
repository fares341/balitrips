import { describe, expect, it } from 'vitest'

import { ALL_SECTIONS, hiddenHrefs, withoutHidden } from './public-sections'

const routes = [{ href: '/' }, { href: '/packages' }, { href: '/blog' }, { href: '/map' }]

describe('empty public sections', () => {
  it('hides nothing while both have content', () => {
    expect(hiddenHrefs(ALL_SECTIONS)).toEqual([])
    expect(withoutHidden(routes, [])).toEqual(routes)
  })

  it('hides the packages and blog links while they are empty', () => {
    const hidden = hiddenHrefs({ packages: false, blog: false })
    expect(hidden).toEqual(['/packages', '/blog'])
    expect(withoutHidden(routes, hidden).map((r) => r.href)).toEqual(['/', '/map'])
  })

  it('brings a section back as soon as it has content', () => {
    expect(hiddenHrefs({ packages: true, blog: false })).toEqual(['/blog'])
  })
})
