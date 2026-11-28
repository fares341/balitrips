import { describe, expect, it } from 'vitest'

import { parseAllowList, planHide, splitCsvLine } from './allowlist'

describe('parseAllowList', () => {
  it('reads the slug column of the inventory CSV (BOM, quotes, commas)', () => {
    const csv =
      '﻿slug,name_ar,name_en,category\n' +
      'kuta-beach,"شاطئ كوتا","Kuta Beach, Bali",beaches\n' +
      'place-21,مسجد,"Mosque ""A""",mosques\n'
    expect([...parseAllowList(csv).slugs]).toEqual(['kuta-beach', 'place-21'])
  })

  it('honours a keep column when there is one', () => {
    const csv = 'slug,keep\na,yes\nb,\nc,نعم\nd,no\n'
    expect([...parseAllowList(csv).slugs]).toEqual(['a', 'c'])
  })

  it('reads a bare list and reports junk lines', () => {
    const list = parseAllowList('kuta-beach\n(446 locked places)\nubud\n')
    expect([...list.slugs]).toEqual(['kuta-beach', 'ubud'])
    expect(list.skipped).toEqual(['(446 locked places)'])
  })

  it('splits quoted cells', () => {
    expect(splitCsvLine('a,"b, c",d')).toEqual(['a', 'b, c', 'd'])
  })
})

describe('planHide', () => {
  const places = [
    { id: '1', slug: 'a', categoryKey: 'beaches', isHidden: false },
    { id: '2', slug: 'b', categoryKey: 'mosques', isHidden: false },
    { id: '3', slug: 'c', categoryKey: 'food', isHidden: false },
    { id: '4', slug: 'd', categoryKey: 'food', isHidden: true },
  ]

  it('hides what is neither allowed nor in a kept category', () => {
    const plan = planHide(places, new Set(['a', 'zz']), new Set(['mosques']))
    expect(plan.hide.map((p) => p.slug)).toEqual(['c'])
    expect(plan.keep.map((p) => p.slug)).toEqual(['a', 'b'])
    expect(plan.alreadyHidden.map((p) => p.slug)).toEqual(['d'])
    expect(plan.unknown).toEqual(['zz'])
  })
})
