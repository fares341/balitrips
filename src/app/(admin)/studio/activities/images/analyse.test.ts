import { describe, expect, it } from 'vitest'

import { analyseActivity, type ReportActivity, type ReportImage } from './analyse'

const img = (id: string, extra: Partial<ReportImage> = {}): ReportImage => ({
  id,
  objectKey: `uploads/${id}.jpg`,
  mimeType: 'image/jpeg',
  width: 1600,
  height: 1000,
  placeholder: false,
  deleted: false,
  ...extra,
})

const base: ReportActivity = {
  id: 'a',
  slug: 'water-sports-bali',
  name: 'Water sports',
  status: 'published',
  hero: img('h'),
  gallery: [img('h'), img('g1')],
  packages: [],
  sources: [],
}

describe('activity image report', () => {
  it('is quiet for a clean activity', () => {
    expect(analyseActivity(base, 'gallery')).toEqual([])
  })

  it('flags a missing hero, duplicates, placeholders and tiny pictures', () => {
    const kinds = analyseActivity(
      {
        ...base,
        hero: null,
        gallery: [
          img('g1'),
          img('g2', { objectKey: 'uploads/g1.jpg' }),
          img('s', { mimeType: 'image/svg+xml' }),
        ],
        packages: [
          { name: 'Basic', image: img('t', { width: 400, height: 300 }) },
          { name: 'Premium', image: img('t', { width: 400, height: 300 }) },
        ],
      },
      'gallery',
    ).map((issue) => issue.kind)
    expect(kinds).toContain('no_hero')
    expect(kinds.filter((kind) => kind === 'duplicate')).toHaveLength(2)
    expect(kinds).toContain('placeholder')
    expect(kinds).toContain('tiny')
  })

  it('names pictures that came from another merged source', () => {
    const issues = analyseActivity(
      {
        ...base,
        gallery: [img('h'), img('g1'), img('x')],
        sources: [
          { name: 'Package A', heroId: 'h', imageIds: ['g1'] },
          { name: 'Package B', heroId: 'x', imageIds: [] },
        ],
      },
      'gallery',
    )
    expect(issues).toEqual([{ kind: 'other_source', image: img('x'), where: ['Package B'] }])
  })
})
