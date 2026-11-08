/**
 * Import the contractor «places content» folder (photos + descriptions) into
 * map places. Run inside the production worker container:
 *
 *   node_modules/.bin/tsx scripts/import-place-content.ts --dir=/tmp/places-content \
 *     [--apply] [--only=slug,slug] [--overwrite-descriptions] [--replace-unique]
 *
 * Dry run by default (reads the DB and validates every file, writes nothing).
 *
 * Images go through ingestImage() — the exact pipeline Studio's uploader uses
 * (same `media/<id>/original.*` key, same AVIF/WebP ladder, metadata strip,
 * storage driver). Each media row is named "<slug>-<N>" for the Studio media
 * library and carries alt (ar/en), credit, author, licence and source URL.
 * Media ids are deterministic per slug+file, so a re-run never duplicates.
 *
 * Skip rule: a place that already has a unique photo (live media used by
 * fewer than SHARED_MIN places) keeps its photos unless --replace-unique.
 * Descriptions fill only empty locales unless --overwrite-descriptions:
 * short_* → description, long_* → detailed_description. Old media rows are
 * never deleted. The public map cache refreshes within 60 s.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { and, eq, inArray, isNull } from 'drizzle-orm'

import { inspectImage } from '@/app/(admin)/_lib/image/inspect'
import { ingestImage, MAX_UPLOAD_BYTES } from '@/app/(admin)/_lib/image/pipeline'
import { db } from '@/db'
import { auditLog, mapPlaces, media, type Localized } from '@/db/schema'
import {
  attributionFor,
  describePlan,
  groupImages,
  importMediaName,
  parseDescriptions,
  parseManifest,
  planPlace,
  widelySharedIds,
  type ManifestImage,
  type ParseProblem,
  type PlacePlan,
} from '@/lib/place-content/plan'

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(`--${name}`)
const value = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const dir = value('dir')
const apply = flag('apply')
const only = value('only')
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const options = {
  replaceUnique: flag('replace-unique'),
  overwriteDescriptions: flag('overwrite-descriptions'),
}

/** Same floor as the pipeline: narrower than the smallest layout slot is refused. */
const MIN_WIDTH = 320
const MAX_MEGAPIXELS = 80

function validateFile(root: string, img: ManifestImage): { bytes: Uint8Array; mime: string } {
  const path = resolve(root, 'images', img.slug, img.file)
  if (!path.startsWith(resolve(root, 'images') + '/')) throw new Error('path escapes images/')
  if (!existsSync(path)) throw new Error(`missing file images/${img.slug}/${img.file}`)
  const size = statSync(path).size
  if (size === 0) throw new Error('empty file')
  if (size > MAX_UPLOAD_BYTES) throw new Error(`file too large (${size} bytes)`)
  const bytes = new Uint8Array(readFileSync(path))
  const inspected = inspectImage(bytes, null)
  if (inspected.format !== 'webp' && inspected.format !== 'jpeg')
    throw new Error(`not webp/jpeg (${inspected.format})`)
  if (inspected.width < MIN_WIDTH) throw new Error(`only ${inspected.width}px wide`)
  if ((inspected.width * inspected.height) / 1e6 > MAX_MEGAPIXELS)
    throw new Error('too many pixels')
  return { bytes, mime: inspected.mimeType }
}

async function main(): Promise<number> {
  if (!dir) {
    console.error('usage: import-place-content.ts --dir=<folder> [--apply] [--only=a,b] ...')
    return 2
  }
  const root = resolve(dir)
  const manifestPath = join(root, 'manifest.csv')
  const descPath = join(root, 'descriptions.csv')
  const problems: ParseProblem[] = []

  const manifest = existsSync(manifestPath)
    ? parseManifest(readFileSync(manifestPath, 'utf8'))
    : { images: [], problems: [] }
  const descs = existsSync(descPath)
    ? parseDescriptions(readFileSync(descPath, 'utf8'))
    : { rows: [], problems: [] }
  if (!existsSync(manifestPath) && !existsSync(descPath)) {
    console.error(`no manifest.csv or descriptions.csv in ${root}`)
    return 2
  }
  problems.push(...manifest.problems, ...descs.problems)
  const grouped = groupImages(manifest.images)
  problems.push(...grouped.problems)
  const descBySlug = new Map(descs.rows.map((r) => [r.slug, r]))

  let slugs = [...new Set([...grouped.bySlug.keys(), ...descBySlug.keys()])].sort()
  if (only) slugs = slugs.filter((s) => only.includes(s))

  console.log(
    `\n  ${apply ? 'APPLY' : 'DRY RUN'} — ${root}\n  ${manifest.images.length} manifest rows, ${descs.rows.length} description rows, ${slugs.length} slugs in scope` +
      `${options.replaceUnique ? ', --replace-unique' : ''}${options.overwriteDescriptions ? ', --overwrite-descriptions' : ''}\n`,
  )
  for (const p of problems) console.log(`  ! ${p.file}:${p.line} ${p.message}`)

  // Every non-deleted place: needed for the shared-media rule, not just the slugs in scope.
  const allPlaces = await db
    .select({
      id: mapPlaces.id,
      slug: mapPlaces.slug,
      status: mapPlaces.status,
      heroId: mapPlaces.heroImageId,
      galleryIds: mapPlaces.galleryImageIds,
      description: mapPlaces.description,
      detailedDescription: mapPlaces.detailedDescription,
    })
    .from(mapPlaces)
    .where(isNull(mapPlaces.deletedAt))
  const shared = widelySharedIds(
    allPlaces
      .filter((p) => p.status !== 'archived')
      .map((p) => ({ placeId: p.id, heroId: p.heroId, galleryIds: p.galleryIds })),
  )
  const bySlug = new Map(allPlaces.map((p) => [p.slug, p]))

  const referenced = [
    ...new Set(
      allPlaces
        .flatMap((p) => [p.heroId, ...(p.galleryIds ?? [])])
        .filter((x): x is string => typeof x === 'string'),
    ),
  ]
  const live = new Set<string>()
  for (let i = 0; i < referenced.length; i += 1000) {
    const rows = await db
      .select({ id: media.id })
      .from(media)
      .where(and(inArray(media.id, referenced.slice(i, i + 1000)), isNull(media.deletedAt)))
    for (const r of rows) live.add(r.id)
  }

  const unknown: string[] = []
  const errors: string[] = [...problems.map((p) => `${p.file}:${p.line} ${p.message}`)]
  const totals = {
    places: 0,
    assign: 0,
    skipUnique: 0,
    already: 0,
    ingested: 0,
    reused: 0,
    text: 0,
  }

  let n = 0
  for (const slug of slugs) {
    n++
    const place = bySlug.get(slug)
    if (!place) {
      unknown.push(slug)
      continue
    }
    totals.places++
    const plan: PlacePlan = planPlace(
      {
        id: place.id,
        slug,
        heroId: place.heroId,
        galleryIds: place.galleryIds,
        description: place.description,
        detailedDescription: place.detailedDescription,
      },
      grouped.bySlug.get(slug) ?? [],
      descBySlug.get(slug),
      { live, shared },
      options,
    )
    const prefix = `  [${String(n).padStart(3)}/${slugs.length}] ${slug.padEnd(48)}`

    try {
      // Validate every image even when the photos will be skipped: the
      // contractor should hear about a broken file either way.
      const files = new Map<string, { bytes: Uint8Array; mime: string }>()
      for (const img of plan.images) files.set(img.mediaId, validateFile(root, img))

      if (plan.photos.kind === 'assign') totals.assign++
      if (plan.photos.kind === 'skip-unique') totals.skipUnique++
      if (plan.photos.kind === 'already') totals.already++
      if (plan.descriptions.length > 0) totals.text++
      console.log(`${prefix} ${describePlan(plan)}`)

      if (!apply) continue

      if (plan.photos.kind === 'assign') {
        const ids = plan.images.map((i) => i.mediaId)
        const existing = await db
          .select({ id: media.id, deletedAt: media.deletedAt })
          .from(media)
          .where(inArray(media.id, ids))
        const have = new Map(existing.map((e) => [e.id, e.deletedAt]))
        for (const img of plan.images) {
          if (have.has(img.mediaId)) {
            if (have.get(img.mediaId) !== null)
              throw new Error(`${img.file} was deleted in Studio; not re-importing`)
            totals.reused++
            continue
          }
          const file = files.get(img.mediaId)!
          const result = await ingestImage({
            mediaId: img.mediaId,
            bytes: file.bytes,
            declaredMime: file.mime,
            declaredName: img.file,
          })
          const attr = attributionFor(img)
          await db.insert(media).values({
            id: img.mediaId,
            objectKey: result.objectKey,
            mimeType: result.mimeType,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            name: importMediaName(img),
            alt: { en: img.altEn, ar: img.altAr, id: '' },
            credit: attr.credit,
            source: attr.source,
            author: attr.author,
            license: attr.license,
            sourceUrl: attr.sourceUrl,
            sha256: createHash('sha256').update(file.bytes).digest('hex'),
          })
          totals.ingested++
          console.log(
            `        + ${importMediaName(img)} ${result.width}x${result.height} ${result.driver} ${result.optimised ? `${result.derivatives.length} derivatives` : 'NO derivatives (sharp missing)'}`,
          )
        }
      }

      const set: Partial<typeof mapPlaces.$inferInsert> = {}
      if (plan.photos.kind === 'assign') {
        set.heroImageId = plan.photos.heroId
        set.galleryImageIds = plan.photos.galleryIds
      }
      if (plan.descriptions.some((c) => c.field === 'description'))
        set.description = plan.next.description as Localized
      if (plan.descriptions.some((c) => c.field === 'detailedDescription'))
        set.detailedDescription = plan.next.detailedDescription as Localized
      if (Object.keys(set).length === 0) continue

      await db.transaction(async (tx) => {
        await tx
          .update(mapPlaces)
          .set({ ...set, updatedAt: new Date() })
          .where(eq(mapPlaces.id, place.id))
        await tx.insert(auditLog).values({
          actorId: null,
          action: 'place.content_import',
          entityType: 'map_place',
          entityId: place.id,
          before: {
            heroImageId: place.heroId,
            galleryImageIds: place.galleryIds,
            description: place.description,
            detailedDescription: place.detailedDescription,
          },
          after: { ...set, source: 'scripts/import-place-content.ts' },
        })
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${slug}: ${message}`)
      console.log(`${prefix} ERROR ${message}`)
    }
  }

  console.log(`\n  Places matched: ${totals.places}`)
  console.log(
    `  Photos to set:  ${totals.assign}   skipped (unique): ${totals.skipUnique}   already done: ${totals.already}`,
  )
  console.log(`  Text updates:   ${totals.text}`)
  if (apply) console.log(`  Media ingested: ${totals.ingested}   reused: ${totals.reused}`)
  if (unknown.length > 0)
    console.log(`  Unknown slugs (skipped): ${unknown.length}\n    ${unknown.join('\n    ')}`)
  if (errors.length > 0) console.log(`\n  ${errors.length} error(s):\n    ${errors.join('\n    ')}`)
  if (apply) console.log('\n  Public map lists are cached up to 60 s; they refresh on their own.')
  else console.log('\n  Dry run: nothing written. Re-run with --apply.')
  return errors.length > 0 ? 1 : 0
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
