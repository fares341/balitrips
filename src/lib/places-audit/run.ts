/**
 * Runs every places-audit detector over plain rows and returns flat findings
 * grouped by issue. Pure: the Studio page, the CSV and offline scripts share it.
 */

import {
  clusterByDistance,
  dataProblems,
  findRepeatsInPlace,
  findSharedPhotos,
  groupByName,
  groupShared,
  type DataProblem,
  type PhotoUse,
} from './detectors'

export interface AuditPlace {
  id: string
  slug: string
  status: string
  name: Partial<Record<string, string | null | undefined>>
  lat: number
  lon: number
  /** Category id/key used for the distance check. */
  category: string | null
  /** Source id (legacy/import id) when the table has one. */
  sourceId: string | null
  /** Media id (or URL) of the hero, and of each gallery photo in order. */
  heroKey: string | null
  galleryKeys: string[]
}

export type IssueKind =
  | 'photo_shared_file'
  | 'photo_shared_content'
  | 'photo_similar'
  | 'photo_repeated_in_place'
  | 'dup_name'
  | 'dup_near'
  | 'dup_source_id'
  | DataProblem

export interface AuditFinding {
  issue: IssueKind
  /** Members of one duplicate group share a group id; data problems have none. */
  group: string | null
  placeId: string
  /** Free text: the shared key, the distance, the normalised name… */
  detail: string
}

export const ISSUE_ORDER: IssueKind[] = [
  'photo_shared_file',
  'photo_shared_content',
  'photo_similar',
  'photo_repeated_in_place',
  'dup_name',
  'dup_near',
  'dup_source_id',
  'placeholder_slug',
  'missing_name_ar',
  'missing_name_en',
  'missing_name_id',
  'no_hero',
  'empty_gallery',
  'outside_bali',
  'bad_coordinates',
]

export function runAudit(
  places: readonly AuditPlace[],
  hashes?: ReadonlyMap<string, { sha: string; dhash: string }>,
): AuditFinding[] {
  const out: AuditFinding[] = []

  const uses: PhotoUse[] = places.flatMap((p) =>
    [p.heroKey, ...p.galleryKeys]
      .filter((k): k is string => !!k)
      .map((key) => ({
        placeId: p.id,
        key,
        sha: hashes?.get(key)?.sha ?? null,
        dhash: hashes?.get(key)?.dhash ?? null,
      })),
  )

  const kindToIssue = {
    file: 'photo_shared_file',
    content: 'photo_shared_content',
    similar: 'photo_similar',
  } as const
  findSharedPhotos(uses).forEach((g, i) => {
    for (const placeId of g.placeIds) {
      out.push({
        issue: kindToIssue[g.kind],
        group: `P${i + 1}`,
        placeId,
        detail: `${g.key} ×${g.placeIds.length}`,
      })
    }
  })
  for (const r of findRepeatsInPlace(uses)) {
    out.push({
      issue: 'photo_repeated_in_place',
      group: null,
      placeId: r.placeId,
      detail: `${r.key} ×${r.times}`,
    })
  }

  groupByName(places.map((p) => ({ id: p.id, name: p.name }))).forEach((g, i) => {
    for (const placeId of g.ids)
      out.push({ issue: 'dup_name', group: `N${i + 1}`, placeId, detail: g.key })
  })

  clusterByDistance(
    places.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, category: p.category })),
  ).forEach((c, i) => {
    for (const placeId of c.ids) {
      out.push({ issue: 'dup_near', group: `D${i + 1}`, placeId, detail: `≤${c.maxLinkMetres} m` })
    }
  })

  groupShared(
    places,
    (p) => p.sourceId?.trim() || null,
    (p) => p.id,
  ).forEach((g, i) => {
    for (const placeId of g.owners) {
      out.push({ issue: 'dup_source_id', group: `S${i + 1}`, placeId, detail: g.value })
    }
  })

  for (const p of places) {
    for (const issue of dataProblems(p)) {
      out.push({
        issue,
        group: null,
        placeId: p.id,
        detail:
          issue === 'outside_bali' || issue === 'bad_coordinates'
            ? `${p.lat}, ${p.lon}`
            : issue === 'placeholder_slug'
              ? p.slug
              : '',
      })
    }
  }

  return out
}
