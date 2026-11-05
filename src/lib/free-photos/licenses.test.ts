import { describe, expect, it } from 'vitest'

import { normalizeLicense } from './licenses'

describe('normalizeLicense', () => {
  it.each([
    [{ code: 'cc-by-sa-4.0', name: 'CC BY-SA 4.0' }, 'by-sa', 'CC BY-SA 4.0'],
    [{ code: 'cc-by-2.0', name: 'CC BY 2.0' }, 'by', 'CC BY 2.0'],
    [{ code: 'cc0', name: 'CC0' }, 'cc0', 'CC0'],
    [{ code: 'pd', name: 'Public domain' }, 'pd', 'Public domain'],
    [{ code: 'pdm' }, 'pd', 'Public domain'],
    [{ code: 'by-sa', version: '2.0' }, 'by-sa', 'CC BY-SA 2.0'],
    [{ code: 'by', version: '3.0' }, 'by', 'CC BY 3.0'],
    [{ name: 'GFDL, CC BY-SA 3.0' }, 'by-sa', 'CC BY-SA 3.0'],
  ])('accepts %j', (input, kind, label) => {
    const l = normalizeLicense(input)
    expect(l?.kind).toBe(kind)
    expect(l?.label).toBe(label)
    expect(l?.url).toMatch(/^https:\/\/creativecommons\.org\//)
  })

  it.each([
    { code: 'by-nc', version: '2.0' },
    { code: 'by-nd' },
    { code: 'by-nc-sa' },
    { name: 'CC BY-NC-SA 2.0' },
    { name: 'GFDL' },
    { name: 'Fair use' },
    { name: 'All rights reserved' },
    { name: 'Copyrighted free use but unknown' },
    { name: 'Some custom licence' },
    {},
    { url: 'https://creativecommons.org/licenses/by-nc/2.0/' },
  ])('refuses %j', (input) => {
    expect(normalizeLicense(input)).toBeNull()
  })

  it('keeps a given https licence URL', () => {
    expect(
      normalizeLicense({ code: 'by', url: 'https://creativecommons.org/licenses/by/2.0/' })?.url,
    ).toBe('https://creativecommons.org/licenses/by/2.0/')
  })
})
