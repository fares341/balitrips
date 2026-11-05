/**
 * Content hashes for the places audit: sha256 of the 320px WebP rung (exact
 * duplicates) and a 64-bit dHash of it (the same picture re-encoded).
 *
 * The media table stores no hash, so they are computed on demand and cached
 * in-process by media id — a media id's bytes never change (keys are
 * `media/<id>/<width>.<fmt>`), so the cache never needs invalidating.
 *
 * Read-only: it only GETs the CDN (or reads `public/media` when there is no
 * CDN, as in local development).
 */

import 'server-only'

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { derivativeKey, isUnoptimised, rungsFor } from '@/lib/media/ladder'

export interface MediaRef {
  id: string
  objectKey: string
  width: number
}

export interface PhotoHash {
  sha: string
  dhash: string
}

const CACHE = new Map<string, PhotoHash | null>()
const CACHE_MAX = 20_000

/** The object key hashed for one media row: the smallest rung ≥ 320px. */
export function hashKeyFor(ref: MediaRef): string {
  if (isUnoptimised(ref.objectKey)) return ref.objectKey
  const rungs = rungsFor(ref.width)
  const rung = rungs.find((w) => w >= 320) ?? rungs[rungs.length - 1] ?? 320
  return derivativeKey(ref.id, rung, 'webp')
}

async function readBytes(key: string): Promise<Uint8Array | null> {
  const cdn = (process.env.NEXT_PUBLIC_CDN_URL ?? '').replace(/\/+$/, '')
  const clean = key.replace(/^\/+/, '')
  if (cdn === '') {
    const root = path.join(process.cwd(), 'public')
    const file = path.resolve(root, clean)
    if (!file.startsWith(root + path.sep)) return null
    try {
      return await readFile(file)
    } catch {
      return null
    }
  }
  try {
    const res = await fetch(`${cdn}/${clean}`, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

/** 9×8 grayscale difference hash → 16 hex chars. */
export async function dHash(bytes: Uint8Array): Promise<string> {
  const sharp = (await import('sharp')).default
  const pixels = await sharp(bytes).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer()
  let hex = ''
  for (let row = 0; row < 8; row++) {
    let nibbleByte = 0
    for (let col = 0; col < 8; col++) {
      const left = pixels[row * 9 + col]!
      const right = pixels[row * 9 + col + 1]!
      nibbleByte = (nibbleByte << 1) | (left > right ? 1 : 0)
    }
    hex += nibbleByte.toString(16).padStart(2, '0')
  }
  return hex
}

export async function hashMedia(ref: MediaRef): Promise<PhotoHash | null> {
  if (CACHE.has(ref.id)) return CACHE.get(ref.id) ?? null
  const bytes = await readBytes(hashKeyFor(ref))
  let result: PhotoHash | null = null
  if (bytes) {
    try {
      result = {
        sha: createHash('sha256').update(bytes).digest('hex'),
        dhash: await dHash(bytes),
      }
    } catch {
      result = null
    }
  }
  if (CACHE.size >= CACHE_MAX) CACHE.clear()
  // A missing file is cached too (as null) only for this run's dedupe; a
  // later run retries it, since it may have been uploaded meanwhile.
  if (result) CACHE.set(ref.id, result)
  return result
}

/** Hash many refs with bounded concurrency. Missing/broken files are left out. */
export async function hashAll(
  refs: readonly MediaRef[],
  concurrency = 8,
): Promise<{ hashes: Map<string, PhotoHash>; failed: number; cached: number }> {
  const hashes = new Map<string, PhotoHash>()
  let failed = 0
  let cached = 0
  let next = 0
  const unique = [...new Map(refs.map((r) => [r.id, r])).values()]
  async function worker() {
    while (next < unique.length) {
      const ref = unique[next++]!
      if (CACHE.has(ref.id)) cached++
      const h = await hashMedia(ref)
      if (h) hashes.set(ref.id, h)
      else failed++
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker))
  return { hashes, failed, cached }
}
