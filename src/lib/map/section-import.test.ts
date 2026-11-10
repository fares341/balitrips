import { describe, expect, it } from 'vitest'

import { planSections, readSectionCsv } from './section-import'

const CSV = `﻿category_key,list_name,place_name,maps_link,lat,lon,slug,match
arabic,Arabic list,Zahra,https://maps.app/1,-8.6,115.1,zahra,exact
steak,Steak list,"Zahra, Canggu",https://maps.app/2,,,zahra,branch
burgers,Burgers,New spot,https://maps.app/3,-8.7,115.2,NEW,NEW
burgers,Burgers,Maybe,https://maps.app/4,,,maybe,unsure
italian,Italian,Ghost,https://maps.app/5,,,ghost,exact
pizza,Pizza,Bad,https://maps.app/6,,,zahra,exact
greek,Greek,Bad match,https://maps.app/7,,,zahra,perhaps
`

const sections = new Map([
  ['restaurants-arabic', 'S-AR'],
  ['restaurants-steak', 'S-ST'],
  ['restaurants-burgers', 'S-BU'],
  ['restaurants-italian', 'S-IT'],
  ['restaurants-greek', 'S-GR'],
])
const places = new Map([
  ['zahra', 'P1'],
  ['maybe', 'P2'],
  ['other', 'P3'],
])

describe('restaurant sections CSV', () => {
  it('reads rows and reports bad keys / match values', () => {
    const { rows, problems } = readSectionCsv(CSV)
    expect(rows).toHaveLength(5)
    expect(rows[1]).toMatchObject({ section: 'steak', placeName: 'Zahra, Canggu', lat: null })
    expect(problems.map((p) => p.line)).toEqual([7, 8])
  })
  it('rejects a file without the columns', () => {
    expect(readSectionCsv('a,b\n1,2').problems[0]?.message).toMatch(/missing column/)
  })
  it('plans adds, NEW, unknown and unsure; is idempotent', () => {
    const { rows } = readSectionCsv(CSV)
    const base = { rows, places, sections, includeUnsure: false, replace: false }
    const plan = planSections({ ...base, existing: new Set() })
    expect(plan.add.map((m) => `${m.slug}:${m.sectionKey}`)).toEqual([
      'zahra:restaurants-arabic',
      'zahra:restaurants-steak',
    ])
    expect(plan.newPlaces.map((r) => r.placeName)).toEqual(['New spot'])
    expect(plan.unknownSlugs.map((r) => r.slug)).toEqual(['ghost'])
    expect(plan.skippedUnsure.map((r) => r.slug)).toEqual(['maybe'])

    const again = planSections({ ...base, existing: new Set(['P1|S-AR', 'P1|S-ST']) })
    expect(again.add).toEqual([])
    expect(again.kept).toBe(2)
  })
  it('--include-unsure adds unsure rows', () => {
    const { rows } = readSectionCsv(CSV)
    const plan = planSections({
      rows,
      places,
      sections,
      existing: new Set(),
      includeUnsure: true,
      replace: false,
    })
    expect(plan.add.map((m) => m.slug)).toContain('maybe')
  })
  it('keeps other memberships unless --replace (listed places only)', () => {
    const { rows } = readSectionCsv(CSV)
    const existing = new Set(['P1|S-GR', 'P3|S-GR'])
    const keep = planSections({
      rows,
      places,
      sections,
      existing,
      includeUnsure: false,
      replace: false,
    })
    expect(keep.remove).toEqual([])
    const replace = planSections({
      rows,
      places,
      sections,
      existing,
      includeUnsure: false,
      replace: true,
    })
    expect(replace.remove.map((m) => `${m.slug}:${m.sectionKey}`)).toEqual([
      'zahra:restaurants-greek',
    ])
  })
  it('reports sections the database lacks', () => {
    const { rows } = readSectionCsv(CSV)
    const plan = planSections({
      rows,
      places,
      sections: new Map(),
      existing: new Set(),
      includeUnsure: false,
      replace: false,
    })
    expect(plan.missingSections).toContain('restaurants-arabic')
    expect(plan.add).toEqual([])
  })
})
