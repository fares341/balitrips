import { describe, expect, it } from 'vitest'

import {
  checkCategoryParent,
  cleanSectionIds,
  filterBySection,
  parseSection,
  RESTAURANT_SECTIONS,
  sectionCategoryKey,
  sectionParentFor,
  sectionsWithPlaces,
  withSection,
  type SectionItem,
} from './sections'

const sections: SectionItem[] = [
  { key: 'restaurants-arabic', parentKey: 'restaurants', label: 'Arabic' },
  { key: 'restaurants-burgers', parentKey: 'restaurants', label: 'Burgers' },
  { key: 'restaurants-steak', parentKey: 'restaurants', label: 'Steak' },
]
const places = [
  { id: 'a', sections: ['restaurants-arabic'] },
  { id: 'b', sections: ['restaurants-arabic', 'restaurants-steak'] },
  { id: 'c', sections: [] },
]

describe('restaurant sections', () => {
  it('has the client’s 11 sections in order', () => {
    expect(RESTAURANT_SECTIONS).toHaveLength(11)
    expect(RESTAURANT_SECTIONS[0]).toBe('arabic')
    expect(sectionCategoryKey('fine-dining')).toBe('restaurants-fine-dining')
  })
  it('shows the row only under one category with sections', () => {
    expect(sectionParentFor(['restaurants'], sections)).toBe('restaurants')
    expect(sectionParentFor(['restaurants', 'cafes'], sections)).toBeNull()
    expect(sectionParentFor(['cafes'], sections)).toBeNull()
    expect(sectionParentFor([], sections)).toBeNull()
  })
  it('offers only sections with at least one place, in order', () => {
    expect(sectionsWithPlaces(sections, 'restaurants', places).map((s) => s.key)).toEqual([
      'restaurants-arabic',
      'restaurants-steak',
    ])
  })
  it('filters by section (multi-membership) and null = all', () => {
    expect(filterBySection(places, 'restaurants-steak').map((p) => p.id)).toEqual(['b'])
    expect(filterBySection(places, 'restaurants-arabic').map((p) => p.id)).toEqual(['a', 'b'])
    expect(filterBySection(places, null)).toHaveLength(3)
  })
  it('parses ?sec= against known keys and writes it back', () => {
    const known = new Set(sections.map((s) => s.key))
    expect(parseSection('Restaurants-Arabic', known)).toBe('restaurants-arabic')
    expect(parseSection('nope', known)).toBeNull()
    expect(parseSection('../x', known)).toBeNull()
    expect(withSection('', 'restaurants-arabic')).toBe('?sec=restaurants-arabic')
    expect(withSection('?cat=restaurants', 'restaurants-arabic')).toBe(
      '?cat=restaurants&sec=restaurants-arabic',
    )
    expect(withSection('?cat=x', null)).toBe('?cat=x')
  })
})

describe('Studio validation', () => {
  it('allows one level under a top-level parent only', () => {
    const base = { id: 'c1', parentId: 'p1', parentOfParent: null, hasChildren: false }
    expect(checkCategoryParent(base)).toBeNull()
    expect(checkCategoryParent({ ...base, parentId: null })).toBeNull()
    expect(checkCategoryParent({ ...base, parentId: 'c1' })).toBe('self')
    expect(checkCategoryParent({ ...base, parentOfParent: 'x' })).toBe('not_top_level')
    expect(checkCategoryParent({ ...base, hasChildren: true })).toBe('has_children')
    expect(checkCategoryParent({ ...base, id: null })).toBeNull()
  })
  it('keeps only sections of the place’s category, once', () => {
    expect(cleanSectionIds(['s1', 'x', 's1', 's2'], ['s1', 's2'])).toEqual(['s1', 's2'])
    expect(cleanSectionIds(['s1'], [])).toEqual([])
  })
})
