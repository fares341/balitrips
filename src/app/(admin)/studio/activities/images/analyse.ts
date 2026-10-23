/**
 * «صور مكررة أو غير مناسبة» (owner, Oct 2026): what is wrong with each
 * activity's pictures, so the owner can fix them in Studio. Pure: the page
 * loads the rows, this decides what to report.
 */

export interface ReportImage {
  id: string
  objectKey: string
  mimeType: string
  width: number
  height: number
  placeholder: boolean
  deleted: boolean
}

export interface ReportActivity {
  id: string
  slug: string
  name: string
  status: string
  hero: ReportImage | null
  gallery: ReportImage[]
  /** Package images, with the package name. */
  packages: { name: string; image: ReportImage | null }[]
  /**
   * Merged activities only: the source activities (0028), each with its own
   * hero and gallery ids. The source that shares the merged hero is the base.
   */
  sources: { name: string; heroId: string | null; imageIds: string[] }[]
}

export type IssueKind = 'no_hero' | 'duplicate' | 'placeholder' | 'tiny' | 'other_source'

export interface Issue {
  kind: IssueKind
  image: ReportImage | null
  /** Where it shows: «gallery», a package name, or a source activity name. */
  where: string[]
}

/** Below this the picture looks soft on a phone hero or a package card. */
export const MIN_WIDTH = 800
export const MIN_HEIGHT = 500

export function isSvgOrPlaceholder(image: ReportImage): boolean {
  return (
    image.placeholder ||
    image.mimeType.toLowerCase().includes('svg') ||
    image.objectKey.toLowerCase().endsWith('.svg')
  )
}

export function isTiny(image: ReportImage): boolean {
  return !isSvgOrPlaceholder(image) && (image.width < MIN_WIDTH || image.height < MIN_HEIGHT)
}

export function analyseActivity(activity: ReportActivity, galleryLabel: string): Issue[] {
  const issues: Issue[] = []
  const hero = activity.hero !== null && !activity.hero.deleted ? activity.hero : null
  if (hero === null) issues.push({ kind: 'no_hero', image: null, where: [] })

  // Every place a picture shows (the hero inside the gallery is normal).
  const uses = new Map<string, { image: ReportImage; where: string[] }>()
  const byFile = new Map<string, string>()
  const add = (image: ReportImage | null, where: string) => {
    if (image === null || image.deleted) return
    // The same file under another media row counts as the same picture.
    const id = byFile.get(image.objectKey) ?? image.id
    byFile.set(image.objectKey, id)
    const entry = uses.get(id) ?? { image, where: [] }
    entry.where.push(where)
    uses.set(id, entry)
  }
  for (const image of activity.gallery) add(image, galleryLabel)
  for (const pkg of activity.packages) add(pkg.image, pkg.name)

  for (const { image, where } of uses.values()) {
    if (where.length > 1) issues.push({ kind: 'duplicate', image, where })
  }

  const all = new Map<string, ReportImage>()
  for (const image of [hero, ...activity.gallery, ...activity.packages.map((p) => p.image)]) {
    if (image !== null && !image.deleted) all.set(image.id, image)
  }
  for (const image of all.values()) {
    if (isSvgOrPlaceholder(image)) issues.push({ kind: 'placeholder', image, where: [] })
    else if (isTiny(image)) issues.push({ kind: 'tiny', image, where: [] })
  }

  // Merged activity: pictures that came only from a source other than the
  // base one — worth a look, they may show a different experience.
  if (activity.sources.length > 1) {
    const base =
      activity.sources.find((source) => hero !== null && source.heroId === hero.id) ??
      activity.sources[0]
    const baseIds = new Set([...(base?.imageIds ?? []), ...(base?.heroId ? [base.heroId] : [])])
    for (const image of activity.gallery) {
      if (image.deleted || baseIds.has(image.id)) continue
      const from = activity.sources
        .filter(
          (source) =>
            source !== base && (source.heroId === image.id || source.imageIds.includes(image.id)),
        )
        .map((source) => source.name)
      if (from.length > 0) issues.push({ kind: 'other_source', image, where: from })
    }
  }

  return issues
}
