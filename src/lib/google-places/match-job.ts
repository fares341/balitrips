import 'server-only'

import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import { categories, mapPlaces, regions } from '@/db/schema'

import {
  GoogleCapError,
  GoogleDisabledError,
  GoogleHttpError,
  type GoogleClient,
  type TextSearchHit,
} from './client'
import { matchDelayMs } from './config'
import { decideMatch, searchQuery } from './match-score'
import { googleClient } from './server'

/**
 * «Match with Google»: for each place without a Google place ID, one Text
 * Search (New) around its coordinates, scored by name, distance and type.
 *
 *  - auto     close, well-named, type-compatible → its photos show at once
 *  - review   plausible → waits in Studio → Places → Google photos
 *  - none     nothing plausible (checked_at set; «Re-check» looks again)
 *
 * Idempotent and resumable: only places with no place ID, status `none` and
 * (unless `recheck`) never checked are taken; each result is written as soon
 * as it is known, so a stop — the daily cap, a deploy, an error — loses at
 * most the place in flight and the next run continues from there. Rejected,
 * confirmed, auto and review places are never touched again.
 *
 * Only the Google place ID is written (allowed by the Places policies); the
 * candidate's name, address and coordinates are used for scoring and dropped.
 */

export interface MatchProgress {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  total: number
  done: number
  auto: number
  review: number
  none: number
  errors: number
  stopped: null | 'daily_cap' | 'disabled' | 'cancelled' | 'error'
  lastError: string | null
}

const EMPTY: MatchProgress = {
  running: false,
  startedAt: null,
  finishedAt: null,
  total: 0,
  done: 0,
  auto: 0,
  review: 0,
  none: 0,
  errors: 0,
  stopped: null,
  lastError: null,
}

// One job per server process, visible to every Studio request.
const holder = globalThis as unknown as {
  __gpMatch?: { progress: MatchProgress; cancel: boolean }
}
function slot() {
  holder.__gpMatch ??= { progress: { ...EMPTY }, cancel: false }
  return holder.__gpMatch
}

export function matchProgress(): MatchProgress {
  return { ...slot().progress }
}

export function cancelMatchJob(): void {
  if (slot().progress.running) slot().cancel = true
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function firstName(name: Record<string, string> | null): string {
  if (!name) return ''
  return (name.en || name.id || name.ar || Object.values(name)[0] || '').trim()
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let wait = 1000
  for (let i = 0; ; i += 1) {
    try {
      return await fn()
    } catch (error) {
      if (!(error instanceof GoogleHttpError) || !error.retryable || i >= attempts - 1) throw error
      await sleep(wait)
      wait *= 2
    }
  }
}

export async function pendingPlaces(recheck: boolean) {
  return db
    .select({
      id: mapPlaces.id,
      slug: mapPlaces.slug,
      name: mapPlaces.name,
      lat: mapPlaces.lat,
      lon: mapPlaces.lon,
      categoryKey: categories.key,
      area: regions.label,
    })
    .from(mapPlaces)
    .leftJoin(categories, eq(categories.id, mapPlaces.categoryId))
    .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
    .where(
      and(
        isNull(mapPlaces.deletedAt),
        isNull(mapPlaces.googlePlaceId),
        eq(mapPlaces.googleMatchStatus, 'none'),
        recheck ? sql`true` : isNull(mapPlaces.googleCheckedAt),
      ),
    )
    .orderBy(asc(mapPlaces.slug))
}

export async function runMatchJob(
  options: {
    limit?: number
    recheck?: boolean
    client?: GoogleClient | null
    delayMs?: number
    log?: (line: string) => void
  } = {},
): Promise<MatchProgress> {
  const state = slot()
  if (state.progress.running) return matchProgress()
  state.cancel = false
  const progress: MatchProgress = { ...EMPTY, running: true, startedAt: new Date().toISOString() }
  state.progress = progress

  try {
    const client = options.client === undefined ? googleClient() : options.client
    if (client === null) {
      progress.stopped = 'disabled'
      return progress
    }
    const delay = options.delayMs ?? matchDelayMs()
    let places = await pendingPlaces(options.recheck === true)
    if (options.limit !== undefined) places = places.slice(0, Math.max(0, options.limit))
    progress.total = places.length

    for (const place of places) {
      if (state.cancel) {
        progress.stopped = 'cancelled'
        break
      }
      const name = firstName(place.name)
      const area = place.area ? firstName(place.area) : null
      let hits: TextSearchHit[]
      try {
        hits = await withRetry(() =>
          client.textSearch({
            query: searchQuery(name, area),
            lat: place.lat,
            lon: place.lon,
            radiusM: 1000,
            max: 5,
          }),
        )
      } catch (error) {
        if (error instanceof GoogleCapError) {
          progress.stopped = 'daily_cap'
          break
        }
        if (error instanceof GoogleDisabledError) {
          progress.stopped = 'disabled'
          break
        }
        progress.errors += 1
        progress.lastError = error instanceof Error ? error.message : 'unknown'
        // Not marked checked: the next run tries this place again.
        if (progress.errors >= 10 && progress.errors > progress.done / 2) {
          progress.stopped = 'error'
          break
        }
        await sleep(delay)
        continue
      }

      const decision = decideMatch(
        {
          names: Object.values(place.name ?? {}).filter((v): v is string => typeof v === 'string'),
          lat: place.lat,
          lon: place.lon,
          categoryKey: place.categoryKey,
        },
        hits.map((hit) => ({
          id: hit.id,
          name: hit.name,
          lat: hit.lat,
          lon: hit.lon,
          types: hit.types,
        })),
      )
      // Guarded write: a person may have linked this place meanwhile.
      await db
        .update(mapPlaces)
        .set({
          googlePlaceId: decision.status === 'none' ? null : decision.best.id,
          googleMatchStatus: decision.status,
          googleMatchScore: decision.best?.score ?? null,
          googleCheckedAt: new Date(),
        })
        .where(
          and(
            eq(mapPlaces.id, place.id),
            isNull(mapPlaces.googlePlaceId),
            eq(mapPlaces.googleMatchStatus, 'none'),
          ),
        )
      progress[decision.status] += 1
      progress.done += 1
      options.log?.(
        `${progress.done}/${progress.total} ${place.slug}: ${decision.status}` +
          (decision.best
            ? ` (score ${decision.best.score}, ${Math.round(decision.best.distanceM)} m)`
            : ''),
      )
      if (delay > 0) await sleep(delay)
    }
    return progress
  } catch (error) {
    progress.stopped = 'error'
    progress.lastError = error instanceof Error ? error.message : 'unknown'
    return progress
  } finally {
    progress.running = false
    progress.finishedAt = new Date().toISOString()
  }
}

/** Start in the background (Studio button); returns at once. */
export function startMatchJob(options: { recheck?: boolean; limit?: number } = {}): MatchProgress {
  if (slot().progress.running) return matchProgress()
  void runMatchJob(options)
  return matchProgress()
}
