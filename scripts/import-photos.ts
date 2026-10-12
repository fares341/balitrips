/**
 * Import openly-licensed photography into the media library.
 *
 * Replaces the generated SVG placeholders from `seed-media.mjs` with real
 * photographs of the actual places, sourced from Wikimedia Commons.
 *
 * WHY THIS GOES THROUGH ingestImage()
 * -----------------------------------
 * It calls the exact function the admin upload action calls, rather than
 * writing files and rows itself. The result is therefore indistinguishable
 * from a photograph uploaded by hand through Studio - Media: same object-key
 * scheme, same AVIF/WebP width ladder, same metadata stripping, same storage
 * driver. Every imported image can then be edited, replaced or deleted in the
 * admin like any other. A parallel import path would have drifted from the
 * real one the first time either changed.
 *
 * IDEMPOTENT. The media id is derived deterministically from the table and
 * slug (UUIDv5 over a fixed namespace), so re-running replaces each row in
 * place instead of accumulating duplicates.
 *
 * ATTRIBUTION is not optional. Every row records photographer, licence and a
 * link to the source page in `media.credit`. CC BY and CC BY-SA both require
 * it, and it is the client's evidence of provenance if anyone ever asks.
 *
 *   pnpm tsx scripts/import-photos.ts            # import
 *   pnpm tsx scripts/import-photos.ts --dry-run  # resolve and report only
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { eq, like } from 'drizzle-orm'

import { ingestImage } from '@/app/(admin)/_lib/image/pipeline'
import { db } from '@/db'
import {
  activities,
  articles,
  auditLog,
  itineraries,
  landmarks,
  mapPlaces,
  media,
  packages,
} from '@/db/schema'
import { locales, type Locale } from '@/i18n/config'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')

/** Wikimedia's own resizer. Far kinder than pulling 30 MB originals. */
const TARGET_WIDTH = 2048

/**
 * Wikimedia asks for a descriptive User-Agent and rate-limits generic ones.
 * See https://meta.wikimedia.org/wiki/User-Agent_policy
 */
const USER_AGENT = 'BaliTripsPhotoImport/1.0 (https://balitrips.co; contact: hello@balitrips.co)'

interface Entry {
  table: string
  slug: string
  commonsFile: string
  width: number
  height: number
  mime: string
  license: string
  author: string
  sourceUrl: string
  altEn: string
}

const OWNERS = {
  activities,
  itineraries,
  packages,
  landmarks,
  articles,
  map_places: mapPlaces,
} as const

/** Stable UUIDv5 so a re-run updates rather than duplicates. */
function stableId(name: string): string {
  const h = createHash('sha1').update(`balitrips-photo:${name}`).digest()
  const b6 = h[6] ?? 0
  const b8 = h[8] ?? 0
  h[6] = (b6 & 0x0f) | 0x50
  h[8] = (b8 & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

function creditLine(e: Entry): string {
  const who = e.author.trim() === '' ? 'Unknown photographer' : e.author.trim()
  return `Photo: ${who} - ${e.license} - via Wikimedia Commons - ${e.sourceUrl}`
}

function altFor(e: Entry): Record<Locale, string> {
  // English only. Alt text is content, not metadata, and a machine-guessed
  // Arabic or Indonesian string in a table the client's translator will trust
  // is worse than an empty one that falls back to English. These keys are
  // exactly what Studio - Media exposes for translation.
  const out = {} as Record<Locale, string>
  for (const locale of locales) out[locale] = locale === 'en' ? e.altEn : ''
  return out
}

function filePathUrl(commonsFile: string): string {
  const name = commonsFile.replace(/^File:/, '').replace(/ /g, '_')
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${TARGET_WIDTH}`
}

async function download(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
  const buffer = new Uint8Array(await response.arrayBuffer())
  if (buffer.byteLength === 0) throw new Error('empty response body')
  return { bytes: buffer, mime: response.headers.get('content-type') ?? 'image/jpeg' }
}

async function main(): Promise<void> {
  const entries = JSON.parse(
    readFileSync(resolve(root, 'scripts/photo-manifest.json'), 'utf8'),
  ) as Entry[]

  console.log(`\n  ${entries.length} photographs to import${dryRun ? ' (dry run)' : ''}\n`)

  let ok = 0
  let failed = 0
  const failures: string[] = []

  for (const entry of entries) {
    const owner = OWNERS[entry.table as keyof typeof OWNERS]
    const label = `${entry.table}/${entry.slug}`.padEnd(46)

    if (owner === undefined) {
      failures.push(`${entry.table}/${entry.slug}: unknown table`)
      failed++
      continue
    }

    try {
      const url = filePathUrl(entry.commonsFile)

      if (dryRun) {
        console.log(`  ${label} ${entry.license.padEnd(14)} ${url}`)
        ok++
        continue
      }

      const { bytes, mime } = await download(url)
      const mediaId = stableId(`${entry.table}:${entry.slug}`)

      const result = await ingestImage({
        mediaId,
        bytes,
        declaredMime: mime,
        declaredName: entry.commonsFile.replace(/^File:/, ''),
      })

      await db.transaction(async (tx) => {
        await tx
          .insert(media)
          .values({
            id: mediaId,
            objectKey: result.objectKey,
            mimeType: result.mimeType,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            alt: altFor(entry),
            credit: creditLine(entry),
          })
          .onConflictDoUpdate({
            target: media.id,
            set: {
              objectKey: result.objectKey,
              mimeType: result.mimeType,
              width: result.width,
              height: result.height,
              bytes: result.bytes,
              alt: altFor(entry),
              credit: creditLine(entry),
              updatedAt: new Date(),
            },
          })

        await tx
          .update(owner)
          .set({ heroImageId: mediaId })
          .where(eq((owner as typeof activities).slug, entry.slug))

        // actorId stays null: a script run by someone with shell access, not
        // an action taken by a signed-in admin. Recorded anyway, so where every
        // image came from is visible in Studio - Audit.
        await tx.insert(auditLog).values({
          actorId: null,
          action: 'media.import',
          entityType: 'media',
          entityId: mediaId,
          before: null,
          after: {
            objectKey: result.objectKey,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            derivatives: result.derivatives.length,
            optimised: result.optimised,
            driver: result.driver,
            source: entry.sourceUrl,
            license: entry.license,
            attachedTo: `${entry.table}/${entry.slug}`,
          },
        })
      })

      const size = `${result.width}x${result.height}`.padEnd(11)
      const note = result.optimised
        ? `${result.derivatives.length} derivatives`
        : 'NO derivatives (sharp missing)'
      console.log(`  ${label} ${size} ${result.driver.padEnd(7)} ${note}`)
      ok++
    } catch (error) {
      failed++
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${entry.table}/${entry.slug}: ${message}`)
      console.log(`  ${label} FAILED - ${message}`)
    }
  }

  if (!dryRun && ok > 0) {
    // Detached and removed only once real images are in place, so a partial
    // run never leaves a page with no hero image at all.
    const stale = await db
      .delete(media)
      .where(like(media.objectKey, 'seed-media/%'))
      .returning({ id: media.id })
    console.log(`\n  Removed ${stale.length} generated placeholder rows.`)
  }

  console.log(`\n  ${ok} imported, ${failed} failed.\n`)
  for (const f of failures) console.log(`    ${f}`)

  process.exit(failed > 0 ? 1 : 0)
}

void main()
