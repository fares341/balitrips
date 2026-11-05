import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'

import { ingestImage } from '@/app/(admin)/_lib/image/pipeline'
import { db } from '@/db'
import { categories, mapPlaces, media, placePhotoCandidates } from '@/db/schema'
import { dHash } from '@/lib/places-audit/photo-hash'

import { creditText } from './attribution'
import { collectCandidates, type ScoredCandidate } from './collect'
import { PhotoRegistry } from './dedup'
import { PoliteClient } from './http'
import { applyToPlace, SharedPhotos, type MediaFacts, type OwnPhotoRow } from './own-photos'
import { canAutoApply } from './score'
import { unsplashTrackDownload } from './sources'

/**
 * «Find free photos»: for each map place, collect free candidates
 * (Commons/Wikidata, Openverse, optionally Unsplash), hash the best ones,
 * store them for review, and auto-apply a high-confidence match ONLY to a
 * place that has no photo of its own or only a shared/duplicate one. An
 * owner's unique photo is never replaced by the job.
 *
 * Resumable: each place is saved as it is done (`free_photos_checked_at`);
 * a stop loses at most the place in flight. One job per server process.
 */

export interface FreePhotoProgress {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  total: number
  done: number
  withGood: number
  autoApplied: number
  none: number
  errors: number
  requests: number
  stopped: null | 'cancelled' | 'error'
  lastError: string | null
}

const EMPTY: FreePhotoProgress = {
  running: false,
  startedAt: null,
  finishedAt: null,
  total: 0,
  done: 0,
  withGood: 0,
  autoApplied: 0,
  none: 0,
  errors: 0,
  requests: 0,
  stopped: null,
  lastError: null,
}

const holder = globalThis as unknown as {
  __freePhotos?: { progress: FreePhotoProgress; cancel: boolean }
}
function slot() {
  holder.__freePhotos ??= { progress: { ...EMPTY }, cancel: false }
  return holder.__freePhotos
}
export function freePhotoProgress(): FreePhotoProgress {
  return { ...slot().progress }
}
export function cancelFreePhotoJob(): void {
  if (slot().progress.running) slot().cancel = true
}

export function unsplashKey(): string | null {
  const key = (process.env.UNSPLASH_ACCESS_KEY ?? '').trim()
  return key === '' ? null : key
}

function names(name: Record<string, string> | null): string[] {
  return Object.values(name ?? {}).filter(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  )
}
function mainName(name: Record<string, string> | null): string {
  return (name?.en || name?.id || Object.values(name ?? {})[0] || '').trim()
}

export async function hashBytes(bytes: Uint8Array): Promise<{ sha: string; dhash: string | null }> {
  const sha = createHash('sha256').update(bytes).digest('hex')
  let dh: string | null = null
  try {
    dh = await dHash(bytes)
  } catch {
    dh = null
  }
  return { sha, dhash: dh }
}

/** Our own photos per place + which media are shared between places. */
export async function loadOwnPhotos(): Promise<{ rows: OwnPhotoRow[]; shared: SharedPhotos }> {
  const places = await db
    .select({ id: mapPlaces.id, heroId: mapPlaces.heroImageId, gallery: mapPlaces.galleryImageIds })
    .from(mapPlaces)
    .where(isNull(mapPlaces.deletedAt))
  const rows: OwnPhotoRow[] = places.map((p) => ({
    placeId: p.id,
    heroId: p.heroId,
    galleryIds: (p.gallery ?? []).filter((id) => typeof id === 'string'),
  }))
  const ids = [
    ...new Set(rows.flatMap((r) => [r.heroId, ...r.galleryIds]).filter((x): x is string => !!x)),
  ]
  const facts = new Map<string, MediaFacts>()
  for (let i = 0; i < ids.length; i += 1000) {
    const found = await db
      .select({ id: media.id, objectKey: media.objectKey, sha256: media.sha256 })
      .from(media)
      .where(and(inArray(media.id, ids.slice(i, i + 1000)), isNull(media.deletedAt)))
    for (const m of found) facts.set(m.id, { objectKey: m.objectKey, sha256: m.sha256 })
  }
  return { rows, shared: new SharedPhotos(rows, facts) }
}

/** Hashes of every applied free photo, to keep one picture on one place. */
async function appliedRegistry(): Promise<PhotoRegistry> {
  const applied = await db
    .select({
      placeId: placePhotoCandidates.placeId,
      sha: placePhotoCandidates.sha256,
      dhash: placePhotoCandidates.dhash,
    })
    .from(placePhotoCandidates)
    .where(eq(placePhotoCandidates.status, 'applied'))
  return new PhotoRegistry(applied)
}

async function saveCandidates(
  placeId: string,
  list: readonly (ScoredCandidate & {
    sha?: string | null
    dhash?: string | null
    duplicateOf?: string | null
  })[],
) {
  for (const c of list) {
    const values = {
      placeId,
      source: c.source,
      externalId: c.externalId.slice(0, 500),
      foundVia: c.via,
      title: c.title.slice(0, 300),
      thumbUrl: c.thumbUrl,
      imageUrl: c.imageUrl,
      width: c.width,
      height: c.height,
      distanceM: c.distanceM,
      nameScore: c.nameScore,
      score: c.score,
      tier: c.tier,
      author: c.author?.slice(0, 300) ?? null,
      authorUrl: c.authorUrl,
      license: c.license.label,
      licenseUrl: c.license.url,
      sourceUrl: c.sourceUrl,
      downloadLocation: c.downloadLocation,
      sha256: c.sha ?? null,
      dhash: c.dhash ?? null,
      status: c.duplicateOf ? 'duplicate' : 'new',
      duplicateOf: c.duplicateOf ?? null,
    }
    await db
      .insert(placePhotoCandidates)
      .values(values)
      .onConflictDoUpdate({
        target: [
          placePhotoCandidates.placeId,
          placePhotoCandidates.source,
          placePhotoCandidates.externalId,
        ],
        set: {
          score: values.score,
          nameScore: values.nameScore,
          distanceM: values.distanceM,
          tier: values.tier,
          sha256: sql`coalesce(${placePhotoCandidates.sha256}, ${values.sha256})`,
          dhash: sql`coalesce(${placePhotoCandidates.dhash}, ${values.dhash})`,
          updatedAt: new Date(),
        },
      })
  }
}

export async function runFreePhotoJob(
  options: {
    limit?: number
    recheck?: boolean
    autoApply?: boolean
    http?: PoliteClient
    log?: (line: string) => void
  } = {},
): Promise<FreePhotoProgress> {
  const state = slot()
  if (state.progress.running) return freePhotoProgress()
  state.cancel = false
  const progress: FreePhotoProgress = {
    ...EMPTY,
    running: true,
    startedAt: new Date().toISOString(),
  }
  state.progress = progress
  const http = options.http ?? new PoliteClient()
  try {
    let places = await db
      .select({
        id: mapPlaces.id,
        slug: mapPlaces.slug,
        name: mapPlaces.name,
        lat: mapPlaces.lat,
        lon: mapPlaces.lon,
        priority: mapPlaces.priority,
        categoryKey: categories.key,
      })
      .from(mapPlaces)
      .leftJoin(categories, eq(categories.id, mapPlaces.categoryId))
      .where(
        and(
          isNull(mapPlaces.deletedAt),
          options.recheck ? sql`true` : isNull(mapPlaces.freePhotosCheckedAt),
        ),
      )
      .orderBy(asc(mapPlaces.slug))
    if (options.limit !== undefined) places = places.slice(0, Math.max(0, options.limit))
    progress.total = places.length

    const registry = await appliedRegistry()
    let own = await loadOwnPhotos()

    for (const place of places) {
      if (state.cancel) {
        progress.stopped = 'cancelled'
        break
      }
      try {
        const found = await collectCandidates(
          {
            name: mainName(place.name),
            names: names(place.name),
            lat: place.lat,
            lon: place.lon,
            categoryKey: place.categoryKey,
            priority: place.priority,
          },
          { http, unsplashKey: unsplashKey(), keep: 10, log: options.log },
        )
        // Hash the best few re-hostable ones (small thumbnails only).
        const hashed = []
        for (const [i, c] of found.entries()) {
          let sha: string | null = null
          let dh: string | null = null
          if (i < 4 && c.source !== 'unsplash') {
            try {
              const h = await hashBytes(await http.bytes(c.thumbUrl))
              sha = h.sha
              dh = h.dhash
            } catch {
              /* unhashed: still listed */
            }
          }
          const conflict = registry.conflict({ placeId: place.id, sha, dhash: dh })
          hashed.push({ ...c, sha, dhash: dh, duplicateOf: conflict?.placeId ?? null })
        }
        await saveCandidates(place.id, hashed)

        const best = hashed.find((c) => !c.duplicateOf)
        if (best && (best.tier === 'high' || best.tier === 'good')) progress.withGood += 1
        if (found.length === 0 || !best || best.tier === 'fair') progress.none += 1

        const row = own.rows.find((r) => r.placeId === place.id)
        if (
          options.autoApply !== false &&
          best &&
          row &&
          canAutoApply({ tier: best.tier, hasUniqueOwnPhoto: own.shared.hasUniquePhoto(row) })
        ) {
          const [cand] = await db
            .select({ id: placePhotoCandidates.id })
            .from(placePhotoCandidates)
            .where(
              and(
                eq(placePhotoCandidates.placeId, place.id),
                eq(placePhotoCandidates.source, best.source),
                eq(placePhotoCandidates.externalId, best.externalId.slice(0, 500)),
              ),
            )
          if (cand) {
            await applyCandidate(cand.id, 'main', { http, auto: true })
            registry.add({ placeId: place.id, sha: best.sha, dhash: best.dhash })
            progress.autoApplied += 1
            own = await loadOwnPhotos()
          }
        }
        await db
          .update(mapPlaces)
          .set({ freePhotosCheckedAt: new Date() })
          .where(eq(mapPlaces.id, place.id))
        progress.done += 1
        options.log?.(
          `${progress.done}/${progress.total} ${place.slug}: ${best ? `${best.tier} ${best.source} ${best.score}` : 'none'}`,
        )
      } catch (error) {
        progress.errors += 1
        progress.lastError = error instanceof Error ? error.message : 'unknown'
        if (progress.errors >= 10 && progress.errors > progress.done / 2) {
          progress.stopped = 'error'
          break
        }
      }
      progress.requests = http.requests
    }
    return progress
  } catch (error) {
    progress.stopped = 'error'
    progress.lastError = error instanceof Error ? error.message : 'unknown'
    return progress
  } finally {
    progress.requests = http.requests
    progress.running = false
    progress.finishedAt = new Date().toISOString()
  }
}

export function startFreePhotoJob(options: { recheck?: boolean } = {}): FreePhotoProgress {
  if (slot().progress.running) return freePhotoProgress()
  void runFreePhotoJob(options)
  return freePhotoProgress()
}

export class ApplyRefused extends Error {}

/**
 * Use one candidate on its place: «main» or «gallery». Commons/Openverse
 * images are downloaded and run through the media pipeline (every rung),
 * with author, licence and source stored on the media row; Unsplash photos
 * are hotlinked (never re-hosted) and their download endpoint is hit.
 * Refused when the same picture already sits on another place.
 */
export async function applyCandidate(
  candidateId: string,
  mode: 'main' | 'gallery',
  options: { http?: PoliteClient; auto?: boolean } = {},
): Promise<{
  mediaId: string
  placeId: string
  before: { heroId: string | null; galleryIds: string[] }
}> {
  const http = options.http ?? new PoliteClient()
  const [c] = await db
    .select()
    .from(placePhotoCandidates)
    .where(eq(placePhotoCandidates.id, candidateId))
  if (!c) throw new ApplyRefused('gone')
  const [place] = await db
    .select({ id: mapPlaces.id, heroId: mapPlaces.heroImageId, gallery: mapPlaces.galleryImageIds })
    .from(mapPlaces)
    .where(eq(mapPlaces.id, c.placeId))
  if (!place) throw new ApplyRefused('gone')

  // The same file applied on another place?
  const [same] = await db
    .select({ placeId: placePhotoCandidates.placeId })
    .from(placePhotoCandidates)
    .where(
      and(
        eq(placePhotoCandidates.status, 'applied'),
        ne(placePhotoCandidates.placeId, c.placeId),
        or(
          and(
            eq(placePhotoCandidates.source, c.source),
            eq(placePhotoCandidates.externalId, c.externalId),
          ),
          c.sha256 ? eq(placePhotoCandidates.sha256, c.sha256) : sql`false`,
        ),
      ),
    )
    .limit(1)
  if (same) throw new ApplyRefused('duplicate')
  if (c.dhash) {
    const registry = await appliedRegistry()
    if (registry.conflict({ placeId: c.placeId, sha: null, dhash: c.dhash }))
      throw new ApplyRefused('duplicate')
  }

  let mediaId = c.mediaId
  if (!mediaId) {
    mediaId = randomUUID()
    const credit = {
      source: c.source as 'commons' | 'openverse' | 'unsplash',
      author: c.author,
      authorUrl: c.authorUrl,
      license: c.license,
      licenseUrl: c.licenseUrl,
      sourceUrl: c.sourceUrl,
    }
    const common = {
      id: mediaId,
      alt: { en: c.title ?? '', ar: '', id: '' },
      credit: creditText(credit),
      source: c.source,
      author: c.author,
      authorUrl: c.authorUrl,
      license: c.license,
      licenseUrl: c.licenseUrl,
      sourceUrl: c.sourceUrl,
    }
    if (c.source === 'unsplash') {
      const key = unsplashKey()
      if (!key) throw new ApplyRefused('unsplash_off')
      if (c.downloadLocation) await unsplashTrackDownload(http, key, c.downloadLocation)
      await db.insert(media).values({
        ...common,
        // Hotlinked: the URL Unsplash returned, tagged with our id for the credit.
        objectKey: `${c.imageUrl}#m=${mediaId}`,
        externalUrl: c.imageUrl,
        mimeType: 'image/jpeg',
        width: Math.min(c.width, 1080),
        height: Math.round((c.height * Math.min(c.width, 1080)) / c.width),
        bytes: 0,
      })
    } else {
      const bytes = await http.bytes(c.imageUrl)
      const hashes = await hashBytes(bytes)
      const result = await ingestImage({ mediaId, bytes, declaredMime: null, declaredName: null })
      await db.insert(media).values({
        ...common,
        objectKey: result.objectKey,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        sha256: hashes.sha,
        dhash: hashes.dhash,
      })
    }
  }

  const before = {
    heroId: place.heroId,
    galleryIds: (place.gallery ?? []).filter((id) => typeof id === 'string'),
  }
  const { shared } = await loadOwnPhotos()
  const next = applyToPlace(before, mediaId, mode, (id) => shared.isShared(id))
  await db
    .update(mapPlaces)
    .set({ heroImageId: next.heroId, galleryImageIds: next.galleryIds, updatedAt: new Date() })
    .where(eq(mapPlaces.id, c.placeId))
  await db
    .update(placePhotoCandidates)
    .set({ status: 'applied', mediaId, autoApplied: options.auto === true, updatedAt: new Date() })
    .where(eq(placePhotoCandidates.id, c.id))
  return { mediaId, placeId: c.placeId, before }
}

/**
 * «Replace shared/duplicate photos with category illustration»: removes
 * every photo that another place also uses, so those places show their
 * category glyph until a real photo is found. Unique photos are untouched.
 * Returns the changes (for the audit log / undo).
 */
export async function clearSharedPhotos(): Promise<
  {
    placeId: string
    before: { heroId: string | null; galleryIds: string[] }
    after: { heroId: string | null; galleryIds: string[] }
  }[]
> {
  const { rows, shared } = await loadOwnPhotos()
  const changes = []
  for (const row of rows) {
    const after = shared.withoutShared(row)
    if (after.heroId === row.heroId && after.galleryIds.length === row.galleryIds.length) continue
    await db
      .update(mapPlaces)
      .set({ heroImageId: after.heroId, galleryImageIds: after.galleryIds, updatedAt: new Date() })
      .where(eq(mapPlaces.id, row.placeId))
    changes.push({
      placeId: row.placeId,
      before: { heroId: row.heroId, galleryIds: [...row.galleryIds] },
      after,
    })
  }
  return changes
}
