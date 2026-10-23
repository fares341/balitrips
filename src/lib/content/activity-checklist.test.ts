import { describe, expect, it } from 'vitest'

import { activityChecklist, missingForPublish, type ChecklistInput } from './activity-checklist'

const complete: ChecklistInput = {
  name: { ar: 'لوكافور أوبود', en: 'Locavore Ubud', id: '' },
  regionId: 'r1',
  categoryCount: 1,
  heroImageId: 'm1',
  description: { ar: 'وصف', en: '', id: '' },
  shortDescription: null,
  priceMinor: 0,
  packageCount: 2,
  duration: null,
  galleryCount: 0,
  meetingPoint: null,
  meetingMapUrl: null,
  needsReview: false,
}

describe('pre-publish checklist', () => {
  it('a complete activity may be published; optional gaps only warn', () => {
    const items = activityChecklist(complete)
    expect(missingForPublish(items)).toEqual([])
    expect(items.filter((i) => !i.ok).map((i) => i.key)).toEqual(['duration', 'gallery', 'meeting'])
  })

  it('blocks on missing basics, no price and texts waiting for review', () => {
    const items = activityChecklist({
      ...complete,
      name: { ar: '', en: 'X', id: '' },
      heroImageId: null,
      packageCount: 0,
      priceMinor: 0,
      needsReview: true,
    })
    expect(missingForPublish(items)).toEqual(['name_ar', 'hero', 'price', 'reviewed'])
  })

  it('the base price counts when there are no packages', () => {
    expect(
      missingForPublish(activityChecklist({ ...complete, packageCount: 0, priceMinor: 2500 })),
    ).toEqual([])
  })
})
