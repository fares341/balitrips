/**
 * «Shared photo» rule (owner, Nov 2026): a media row used as the hero or a
 * gallery image by SHARED_MIN or more non-archived places — e.g. one picture
 * on every mosque — is a placeholder, not a photo of the place. Public views
 * treat it as missing, so those places show their category illustration
 * until they get a unique photo. Studio still shows the real media.
 *
 * Pure and client-safe; the cached loader is `./shared-media`.
 */

export const SHARED_MIN = 3

export interface PlacePhotoIds {
  placeId: string
  heroId: string | null
  galleryIds: readonly unknown[] | null
}

/** Media ids used by at least `min` different places. */
export function widelySharedIds(rows: readonly PlacePhotoIds[], min = SHARED_MIN): Set<string> {
  const users = new Map<string, Set<string>>()
  for (const row of rows) {
    const ids = [row.heroId, ...(row.galleryIds ?? [])].filter(
      (id): id is string => typeof id === 'string' && id !== '',
    )
    for (const id of ids) {
      const set = users.get(id) ?? new Set<string>()
      set.add(row.placeId)
      users.set(id, set)
    }
  }
  const out = new Set<string>()
  for (const [id, set] of users) if (set.size >= min) out.add(id)
  return out
}

/** The media row, or null when it is a widely shared placeholder. */
export function unlessShared<T extends { id: string }>(
  row: T | null | undefined,
  shared: ReadonlySet<string>,
): T | null {
  if (!row) return null
  return shared.has(row.id) ? null : row
}
