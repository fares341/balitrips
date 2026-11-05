/**
 * Which of our own place photos are unique and which are shared with
 * another place (the same media row, the same stored file, or the same
 * bytes). Pure: the job, the «replace shared photos» action and tests use it.
 */

export interface OwnPhotoRow {
  placeId: string
  heroId: string | null
  galleryIds: readonly string[]
}

export interface MediaFacts {
  objectKey: string
  sha256: string | null
}

export class SharedPhotos {
  private users = new Map<string, Set<string>>()

  constructor(
    rows: readonly OwnPhotoRow[],
    private readonly facts: ReadonlyMap<string, MediaFacts>,
  ) {
    for (const row of rows)
      for (const id of [row.heroId, ...row.galleryIds])
        if (id) this.keys(id).forEach((k) => this.add(k, row.placeId))
  }

  private keys(id: string): string[] {
    const f = this.facts.get(id)
    const out = [`id:${id}`]
    if (f) out.push(`file:${f.objectKey.split('#')[0]}`)
    if (f?.sha256) out.push(`sha:${f.sha256}`)
    return out
  }

  private add(key: string, placeId: string) {
    const set = this.users.get(key) ?? new Set<string>()
    set.add(placeId)
    this.users.set(key, set)
  }

  isShared(mediaId: string): boolean {
    return this.keys(mediaId).some((k) => (this.users.get(k)?.size ?? 0) > 1)
  }

  /** True when the place shows at least one photo no other place uses. */
  hasUniquePhoto(row: OwnPhotoRow): boolean {
    return [row.heroId, ...row.galleryIds].some(
      (id) => !!id && this.facts.has(id) && !this.isShared(id),
    )
  }

  /** The place's photos with every shared one removed. */
  withoutShared(row: OwnPhotoRow): { heroId: string | null; galleryIds: string[] } {
    return {
      heroId: row.heroId && !this.isShared(row.heroId) ? row.heroId : null,
      galleryIds: row.galleryIds.filter((id) => !this.isShared(id)),
    }
  }
}

/**
 * The place's photos after applying a free photo. «main» puts it first and
 * keeps the old hero in the gallery when it was unique (a shared hero is a
 * duplicate and is dropped). An owner's unique photo is never removed.
 */
export function applyToPlace(
  row: { heroId: string | null; galleryIds: readonly string[] },
  mediaId: string,
  mode: 'main' | 'gallery',
  isShared: (id: string) => boolean,
): { heroId: string | null; galleryIds: string[] } {
  const gallery = row.galleryIds.filter((id) => id !== mediaId)
  if (mode === 'gallery') {
    if (row.heroId === null) return { heroId: mediaId, galleryIds: gallery }
    return {
      heroId: row.heroId,
      galleryIds: row.heroId === mediaId ? gallery : [...gallery, mediaId],
    }
  }
  const keepOld = row.heroId && row.heroId !== mediaId && !isShared(row.heroId)
  return {
    heroId: mediaId,
    galleryIds: keepOld ? [row.heroId!, ...gallery.filter((id) => id !== row.heroId)] : gallery,
  }
}
