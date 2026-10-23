/**
 * Pre-publish checklist for an activity (spec v2 «Advanced 15»): what must be
 * filled before the page can go public. Pure: the Studio passes the row and a
 * few counts. Publishing (published / hidden / unavailable) is refused while
 * any `required` item is missing; `recommended` items only warn.
 */

export type ChecklistKey =
  | 'name_ar'
  | 'name_en'
  | 'region'
  | 'category'
  | 'hero'
  | 'description'
  | 'price'
  | 'duration'
  | 'gallery'
  | 'meeting'
  | 'reviewed'

export interface ChecklistItem {
  key: ChecklistKey
  ok: boolean
  required: boolean
}

type Text = Partial<Record<string, string | null | undefined>> | null | undefined

export interface ChecklistInput {
  name: Text
  regionId: string | null
  /** Main category or any category ticked. */
  categoryCount: number
  heroImageId: string | null
  description: Text
  shortDescription: Text
  priceMinor: number
  /** Published, non-deleted packages. */
  packageCount: number
  duration: Text
  galleryCount: number
  meetingPoint: Text
  meetingMapUrl: string | null
  needsReview: boolean
}

function filled(value: Text, locale?: string): boolean {
  if (!value) return false
  if (locale) return (value[locale] ?? '').trim() !== ''
  return Object.values(value).some((text) => typeof text === 'string' && text.trim() !== '')
}

export function activityChecklist(input: ChecklistInput): ChecklistItem[] {
  return [
    { key: 'name_ar', ok: filled(input.name, 'ar'), required: true },
    { key: 'name_en', ok: filled(input.name, 'en'), required: true },
    { key: 'region', ok: input.regionId !== null, required: true },
    { key: 'category', ok: input.categoryCount > 0, required: true },
    { key: 'hero', ok: input.heroImageId !== null, required: true },
    {
      key: 'description',
      ok: filled(input.description) || filled(input.shortDescription),
      required: true,
    },
    // A price the page can show: a published package, or the activity's own.
    { key: 'price', ok: input.packageCount > 0 || input.priceMinor > 0, required: true },
    { key: 'reviewed', ok: !input.needsReview, required: true },
    { key: 'duration', ok: filled(input.duration), required: false },
    { key: 'gallery', ok: input.galleryCount > 0, required: false },
    {
      key: 'meeting',
      ok: filled(input.meetingPoint) || input.meetingMapUrl !== null,
      required: false,
    },
  ]
}

/** Required items still missing (empty = may be published). */
export function missingForPublish(items: readonly ChecklistItem[]): ChecklistKey[] {
  return items.filter((item) => item.required && !item.ok).map((item) => item.key)
}
