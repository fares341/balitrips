/**
 * Verify that every photograph is where the old site had it.
 *
 * For each of the 52 entries in scripts/photo-manifest.json this checks:
 *   1. the `media` row exists under the same id the old database used
 *      (UUIDv5 from table:slug -- identical to scripts/import-photos.ts),
 *   2. the record with that slug points at it (`hero_image_id`),
 *   3. the files are really there: the original plus every AVIF/WebP rung
 *      the site will request -- on disk under public/ (local driver) or over
 *      HTTP from NEXT_PUBLIC_CDN_URL (Spaces).
 *
 *   pnpm tsx scripts/verify-media.ts
 *
 * Exit code 0 only when all 52 pass. Read-only: it never writes anything.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { activities, articles, itineraries, landmarks, mapPlaces, media, packages } from '@/db/schema'
import { DERIVATIVE_FORMATS, derivativeKey, isUnoptimised, rungsFor } from '@/lib/media/ladder'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CDN = (process.env.NEXT_PUBLIC_CDN_URL ?? '').replace(/\/+$/, '')

const OWNERS = {
  activities,
  itineraries,
  packages,
  landmarks,
  articles,
  map_places: mapPlaces,
} as const

/** Where each record's photo shows on the site. */
const SHOWS_ON: Record<string, string> = {
  activities: 'activity card (/activities, home, search) + /activities/<slug> slider + tiers',
  landmarks: 'landmark card (/explore, home highlights) + borrowed banners (/about, /services, /map)',
  map_places: '/map pin panel + results list + itinerary linked places',
  packages: 'package card (/packages, home) + /packages/<slug> hero',
  itineraries: 'itinerary card (/itineraries, home) + /itineraries/<slug> hero',
  articles: 'article card (/blog, home) + /blog/<slug> hero',
}

/** Same derivation as scripts/import-photos.ts and the old database. */
function stableId(name: string): string {
  const h = createHash('sha1').update(`balitrips-photo:${name}`).digest()
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x50
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

async function exists(key: string): Promise<boolean> {
  if (CDN === '') return existsSync(join(root, 'public', key))
  try {
    const res = await fetch(`${CDN}/${key}`, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

interface Entry {
  table: string
  slug: string
}

async function main(): Promise<void> {
  const entries = JSON.parse(
    readFileSync(resolve(root, 'scripts/photo-manifest.json'), 'utf8'),
  ) as Entry[]

  console.log(`\n  Checking ${entries.length} photos (${CDN === '' ? 'local public/media' : CDN})\n`)

  let ok = 0
  const problems: string[] = []

  for (const entry of entries) {
    const label = `${entry.table}/${entry.slug}`
    const expectedId = stableId(`${entry.table}:${entry.slug}`)
    const owner = OWNERS[entry.table as keyof typeof OWNERS]
    const issues: string[] = []

    const [row] = await db.select().from(media).where(eq(media.id, expectedId)).limit(1)
    if (!row) issues.push('no media row')
    else if (row.deletedAt !== null) issues.push('media row is soft-deleted')

    const [record] = await db
      .select({ hero: (owner as typeof activities).heroImageId })
      .from(owner as typeof activities)
      .where(eq((owner as typeof activities).slug, entry.slug))
      .limit(1)
    if (!record) issues.push('record with this slug not found')
    else if (record.hero !== expectedId) issues.push(`hero_image_id is ${record.hero ?? 'NULL'}, expected ${expectedId}`)

    if (row) {
      const keys = [row.objectKey]
      if (!isUnoptimised(row.objectKey)) {
        for (const width of rungsFor(row.width)) {
          for (const format of DERIVATIVE_FORMATS) keys.push(derivativeKey(row.id, width, format))
        }
      }
      const missing: string[] = []
      for (const key of keys) if (!(await exists(key))) missing.push(key)
      if (missing.length > 0) issues.push(`${missing.length}/${keys.length} files missing, e.g. ${missing[0]}`)
    }

    if (issues.length === 0) {
      ok++
      console.log(`  OK    ${label.padEnd(56)} ${SHOWS_ON[entry.table] ?? ''}`)
    } else {
      console.log(`  FAIL  ${label.padEnd(56)} ${issues.join('; ')}`)
      problems.push(label)
    }
  }

  console.log(`\n  ${ok}/${entries.length} in place.`)
  if (problems.length > 0) {
    console.log('  Fix: pnpm tsx scripts/import-photos.ts  (then run this again)\n')
  }
  process.exit(problems.length === 0 ? 0 : 1)
}

void main()
