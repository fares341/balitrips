import { describe, expect, it } from 'vitest'

import {
  highlightRange,
  matchRank,
  prefixDistance,
  suggestFrom,
  suggestKeys,
  type SuggestEntry,
} from './fuzzy'

function entry(
  id: string,
  kind: SuggestEntry['kind'],
  names: string[],
  label = names[0] ?? id,
): SuggestEntry {
  return { id, kind, label, sub: null, href: `/${id}`, keys: suggestKeys([...names, id]) }
}

const INDEX: SuggestEntry[] = [
  entry('canggu', 'region', ['تشانغو', 'Canggu']),
  entry('ubud', 'region', ['أوبود', 'Ubud']),
  entry('uluwatu', 'region', ['أولواتو', 'Uluwatu']),
  entry('seminyak', 'region', ['سمنياك', 'Seminyak']),
  entry('kuta', 'region', ['كوتا', 'Kuta']),
  entry('beaches', 'category', ['الشواطئ', 'Beaches']),
  entry('batur', 'activity', ['مشي شروق جبل باتور', 'Mount Batur Sunrise Hike']),
  entry('spa', 'activity', ['طقوس سبا أدغال أوبود', 'Ubud Jungle Spa Ritual']),
  entry('crate', 'place', ['كرايت كافيه تشانغو', 'Crate Café Canggu']),
]

const ids = (query: string) => suggestFrom(INDEX, query).map((hit) => hit.entry.id)

describe('suggestFrom', () => {
  it('suggests on the first letters, as asked', () => {
    expect(ids('شا')[0]).toBe('canggu')
    expect(ids('أو')[0]).toBe('ubud')
    expect(ids('او')).toContain('uluwatu')
  })

  it('one letter only matches the start of a name or word', () => {
    expect(ids('ت')).toEqual(['canggu', 'crate'])
    expect(ids('ش')).toEqual(['beaches', 'batur'])
  })

  it('finds a name in any language', () => {
    expect(ids('ubud')[0]).toBe('ubud')
    expect(ids('canggu')).toEqual(['canggu', 'crate'])
    expect(ids('Café')).toContain('crate')
  })

  it('forgives a typo or a skipped letter', () => {
    expect(ids('شانغو')[0]).toBe('canggu')
    expect(ids('ubdu')[0]).toBe('ubud')
    expect(ids('seminiak')[0]).toBe('seminyak')
    expect(ids('اولوتو')[0]).toBe('uluwatu')
    expect(ids('تشانقو')[0]).toBe('canggu')
    expect(ids('قوتا')[0]).toBe('kuta')
  })

  it('matches words inside longer names, al- and plurals folded', () => {
    expect(ids('باتور')).toEqual(['batur'])
    expect(ids('شاطئ')).toContain('beaches')
    expect(ids('spa')).toContain('spa')
  })

  it('a region beats an activity of the same quality', () => {
    expect(ids('ubud')).toEqual(['ubud', 'spa'])
  })

  it('an area matched as typed leads, even inside a word', () => {
    const index = [...INDEX, entry('diamond', 'activity', ['شاطئ دايموند', 'Diamond Beach'])]
    expect(suggestFrom(index, 'شا').map((hit) => hit.entry.id)[0]).toBe('canggu')
  })

  it('drops a place named exactly like a listed area', () => {
    const index = [...INDEX, entry('p-ubud', 'place', ['أوبود', 'Ubud'])]
    expect(suggestFrom(index, 'او').map((hit) => hit.entry.id)).not.toContain('p-ubud')
  })

  it('three letters need the right first letter', () => {
    const index = [...INDEX, entry('culture', 'category', ['الثقافة', 'Culture', 'Budaya'])]
    expect(suggestFrom(index, 'ubd').map((hit) => hit.entry.id)).toEqual(['ubud', 'spa'])
  })

  it('nothing for nonsense or an empty box', () => {
    expect(ids('')).toEqual([])
    expect(ids('   ')).toEqual([])
    expect(ids('zzzq')).toEqual([])
  })
})

describe('matchRank', () => {
  it('orders exact, start, word start, inside, near miss', () => {
    expect(matchRank('ubud', 'ubud')).toBe(0)
    expect(matchRank('ubud', 'ub')).toBe(1)
    expect(matchRank('jungle spa ritual', 'spa')).toBe(2)
    expect(matchRank('تشانغو', 'شا')).toBe(3)
    expect(matchRank('تشانغو', 'شانقو')).toBe(4)
    expect(matchRank('ubud', 'kuta')).toBe(-1)
  })
})

describe('prefixDistance', () => {
  it('measures against the start of the word', () => {
    expect(prefixDistance('ubu', 'ubud', 1)).toBe(0)
    expect(prefixDistance('ubdu', 'ubud', 1)).toBe(1)
    expect(prefixDistance('xyz', 'ubud', 1)).toBe(2)
  })
})

describe('highlightRange', () => {
  it('maps the typed text back onto the label', () => {
    expect(highlightRange('تشانغو', 'شا')).toEqual([1, 3])
    expect(highlightRange('أوبود', 'او')).toEqual([0, 2])
    expect(highlightRange('Crate Café Canggu', 'cafe')).toEqual([6, 10])
    expect(highlightRange('Ubud', 'xyz')).toBeNull()
  })
})
